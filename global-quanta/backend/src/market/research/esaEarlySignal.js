const METHOD_VERSION = "ESA-R0.1";
const MIN_HISTORY_SESSIONS = Math.max(12, Number(process.env.ESA_MIN_HISTORY_SESSIONS) || 20);
const MAX_BAR_AGE_MS = Math.max(60_000, Number(process.env.ESA_MAX_BAR_AGE_MS) || 180_000);
const MAX_EVENT_CONTEXT = 3;

const finite = (value) => Number.isFinite(Number(value));

function median(values) {
  const sorted = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function minuteOf(bar) {
  const match = String(bar?.date ?? "").match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function cumulativeVolumeAt(bars, minute) {
  return bars.reduce((total, bar) => {
    const at = minuteOf(bar);
    return at !== null && at <= minute ? total + Math.max(0, Number(bar.volume) || 0) : total;
  }, 0);
}

function currentPriceAt(bars, minute) {
  const eligible = bars.filter((bar) => {
    const at = minuteOf(bar);
    return at !== null && at <= minute && Number(bar.close) > 0;
  });
  return eligible.at(-1) ?? null;
}

function eventContext(events) {
  return (events ?? []).slice(0, MAX_EVENT_CONTEXT).map((event) => ({
    eventId: event.eventId,
    title: event.title,
    eventType: event.eventType,
    source: event.sourceLabel ?? event.source,
    publishedAt: event.publishedAt,
    firstSeenAt: event.firstSeenAt,
    verificationStatus: event.verificationStatus,
    severity: event.severity,
    url: event.url ?? null,
  }));
}

/**
 * Research-only intraday anomaly snapshot. It deliberately reports observed
 * activity, not a directional forecast or calibrated probability.
 */
export function buildEsaEarlySignal({ symbol, sessions, events = [], now = new Date() }) {
  const current = sessions?.todaySession;
  const bars = (current?.bars ?? []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const context = eventContext(events);
  const history = (sessions?.trainSessions ?? []).filter((session) => session?.bars?.length);
  const base = {
    symbol,
    status: "insufficient_data",
    mode: "intraday_activity_anomaly",
    sessionLive: Boolean(sessions?.sessionLive),
    asOf: bars.at(-1)?.date ?? null,
    eventContext: context,
    method: {
      version: METHOD_VERSION,
      baseline: "same-minute cumulative volume across prior sessions",
      normalization: "median and 1.4826 × median absolute deviation",
      minimumHistorySessions: MIN_HISTORY_SESSIONS,
      maxBarAgeMs: MAX_BAR_AGE_MS,
      exploratoryAlertThresholds: { relativeVolumeAtSameTime: 2, robustZ: 3 },
      probabilityAvailable: false,
    },
    observation: null,
    alert: null,
    reason: null,
    ageMs: null,
    disclaimer: "Nghiên cứu bất thường hoạt động trong phiên; không phải dự báo lợi suất, xác suất đã hiệu chuẩn hay khuyến nghị giao dịch.",
  };

  if (!sessions?.sessionLive) {
    return { ...base, status: "market_closed", reason: "ESA chỉ đánh giá hoạt động của phiên đang mở; không phát cảnh báo từ nến phiên đã đóng." };
  }
  if (history.length < MIN_HISTORY_SESSIONS) {
    return { ...base, reason: `Cần tối thiểu ${MIN_HISTORY_SESSIONS} phiên lịch sử hợp lệ; hiện có ${history.length}.` };
  }
  if (!bars.length) {
    return { ...base, reason: "Nguồn Gateway chưa có nến intraday cho phiên hiện tại." };
  }

  const latestMinute = minuteOf(bars.at(-1));
  const asOfMs = Date.parse(bars.at(-1)?.date ?? "");
  const ageMs = Number.isFinite(asOfMs) ? now.getTime() - asOfMs : null;
  const latestPriceBar = latestMinute === null ? null : currentPriceAt(bars, latestMinute);
  const currentCumVolume = latestMinute === null ? null : cumulativeVolumeAt(bars, latestMinute);
  if (latestMinute === null || !finite(currentCumVolume) || !latestPriceBar || ageMs === null || ageMs < -30_000) {
    return { ...base, reason: "Nến hiện tại thiếu thời điểm, giá đóng cửa hoặc khối lượng hợp lệ." };
  }

  const historicalVolumes = history
    .map((session) => cumulativeVolumeAt(session.bars, latestMinute))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (historicalVolumes.length < MIN_HISTORY_SESSIONS) {
    return { ...base, reason: `Chỉ ${historicalVolumes.length}/${history.length} phiên có khối lượng tại cùng mốc thời gian.` };
  }

  const volumeMedian = median(historicalVolumes);
  const mad = median(historicalVolumes.map((value) => Math.abs(value - volumeMedian)));
  const robustScale = mad === null ? null : 1.4826 * mad;
  const robustZ = robustScale > 0 ? (currentCumVolume - volumeMedian) / robustScale : null;
  const relativeVolume = volumeMedian > 0 ? currentCumVolume / volumeMedian : null;
  const reference = Number(current?.refPrice);
  const priceChangePct = reference > 0 ? latestPriceBar.close / reference - 1 : null;
  const stale = ageMs > MAX_BAR_AGE_MS;
  const triggered = !stale && robustZ !== null && robustZ >= 3 && relativeVolume !== null && relativeVolume >= 2;
  const direction = priceChangePct === null ? "unknown" : priceChangePct > 0 ? "up" : priceChangePct < 0 ? "down" : "flat";
  const alertType = !triggered ? null : direction === "up" ? "volume_expansion_with_price_up"
    : direction === "down" ? "volume_expansion_with_price_down" : "volume_expansion_without_direction";

  return {
    ...base,
    status: stale ? "stale" : "research_only",
    reason: stale ? `Nến mới nhất đã cũ ${Math.round(ageMs / 1000)} giây; không phát cảnh báo từ snapshot quá ngưỡng.` : null,
    ageMs: Math.max(0, ageMs),
    observation: {
      sessionDate: current.date ?? sessions.viewDate,
      observedMinute: `${String(Math.floor(latestMinute / 60)).padStart(2, "0")}:${String(latestMinute % 60).padStart(2, "0")}`,
      currentCumulativeVolume: Math.round(currentCumVolume),
      historicalMedianAtSameTime: Math.round(volumeMedian),
      relativeVolume: Number(relativeVolume.toFixed(2)),
      robustZ: robustZ === null ? null : Number(robustZ.toFixed(2)),
      priceChangePct: priceChangePct === null ? null : Number((priceChangePct * 100).toFixed(2)),
      direction,
      sampleSize: historicalVolumes.length,
      source: "SSI_FC_V2 IntradayOhlc via Market Gateway",
    },
    alert: triggered ? {
      type: alertType,
      severity: robustZ >= 5 ? "high_anomaly" : "unusual_activity",
      triggeredBy: ["same_time_relative_volume>=2", "robust_z>=3"],
      interpretation: direction === "up"
        ? "Khối lượng lũy kế cao bất thường cùng biến động giá tăng; đây là quan sát đồng thời, chưa chứng minh xu hướng tiếp diễn."
        : direction === "down"
          ? "Khối lượng lũy kế cao bất thường cùng biến động giá giảm; đây là quan sát đồng thời, chưa phải dự báo giảm tiếp."
          : "Khối lượng lũy kế cao bất thường nhưng chưa có hướng giá rõ ràng.",
    } : null,
    evaluatedAt: now.toISOString(),
  };
}

// N0 (29/10/2026) — ESA TỪ LÚC RA TIN (vòng sáng trên chart nến ngày Elite 10): khối lượng cộng dồn hôm nay trong khung
// [phút ra tin, phút mới nhất] so với CÙNG KHUNG PHÚT của các phiên trước (trung vị + 1,4826·MAD như ESA R0; p90 để so trực quan).
// Bất thường khi z ≥ 3 VÀ gấp ≥ 2 lần trung vị; z ≥ 5 = mức cao. Chỉ cho tin ra TRONG phiên hôm nay. Mô tả, không phải dự báo.
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function windowVolume(bars, from, to) {
  return bars.reduce((t, b) => { const m = minuteOf(b); return m !== null && m >= from && m <= to ? t + Math.max(0, Number(b.volume) || 0) : t; }, 0);
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function buildEsaSince({ sessions, sinceIso, now = new Date() }) {
  const out = { status: "not_applicable", sinceIso, reason: null, alert: null };
  const t = Date.parse(sinceIso ?? "");
  if (!Number.isFinite(t)) return { ...out, reason: "Thời điểm tin không hợp lệ." };
  const vn = new Date(t + 7 * 3_600_000), day = vn.toISOString().slice(0, 10), sinceMinute = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const current = sessions?.todaySession;
  if (!sessions?.sessionLive || !current || current.date !== day) return { ...out, reason: "Tin không ra trong phiên đang mở hôm nay." };
  const bars = (current.bars ?? []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = minuteOf(bars.at(-1));
  if (latest === null || latest < sinceMinute) return { ...out, status: "waiting", reason: "Chưa có nến sau thời điểm ra tin." };
  const from = Math.max(sinceMinute, 9 * 60);
  const cur = windowVolume(bars, from, latest);
  const hist = (sessions.trainSessions ?? []).map((s) => windowVolume(s.bars ?? [], from, latest)).filter((v) => v > 0).sort((a, b) => a - b);
  if (hist.length < MIN_HISTORY_SESSIONS) return { ...out, status: "insufficient_data", reason: `Cần ≥ ${MIN_HISTORY_SESSIONS} phiên có khối lượng cùng khung; có ${hist.length}.` };
  const med = median(hist), mad = median(hist.map((v) => Math.abs(v - med)));
  const z = mad > 0 ? (cur - med) / (1.4826 * mad) : null, rv = med > 0 ? cur / med : null;
  const before = bars.filter((b) => { const m = minuteOf(b); return m !== null && m < sinceMinute && Number(b.close) > 0; }).at(-1);
  const basePrice = Number(before?.close) || Number(current.refPrice) || null, last = Number(bars.at(-1)?.close) || null;
  const hit = z !== null && rv !== null && z >= 3 && rv >= 2;
  return {
    status: "research_only", sinceIso, reason: null,
    sinceMinute: hhmm(sinceMinute), observedMinute: hhmm(latest),
    currentVolume: Math.round(cur), medianSameWindow: Math.round(med), p90SameWindow: Math.round(quantile(hist, 0.9)),
    relativeVolume: rv === null ? null : Number(rv.toFixed(2)), robustZ: z === null ? null : Number(z.toFixed(2)),
    priceChangeSincePct: basePrice && last ? Number(((last / basePrice - 1) * 100).toFixed(2)) : null,
    sampleSize: hist.length,
    alert: hit ? { severity: z >= 5 ? "high_anomaly" : "unusual_activity", triggeredBy: ["same_window_relative_volume>=2", "robust_z>=3"] } : null,
    evaluatedAt: now.toISOString(),
  };
}
