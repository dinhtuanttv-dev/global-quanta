// Phân tích chuyên sâu khối lượng cho dòng phụ của Bảng Siêu Quét.
// Hàm thuần, công thức công khai (KHÔNG dùng nhãn Wyckoff/VSA):
//   RVOL20          = KL hôm nay / KL bình quân 20 phiên TRƯỚC đó
//   Cùng thời điểm  = KL lũy kế tới phút hiện tại / bình quân KL lũy kế cùng phút của các phiên trước
//   Up/Down volume  = Σ KL phiên tăng / Σ KL phiên giảm (20 phiên)
//   OBV             = Σ (±KL theo chiều giá) ; hướng = so OBV hiện tại với 20 phiên trước
//   CMF20           = Σ(MFM × KL) / Σ KL, MFM = ((C−L) − (H−C)) / (H−L)
//   Phân kỳ giá–KL  = so % đổi giá 10 phiên với % đổi KL bình quân 10 phiên gần nhất vs 10 phiên trước đó
//   Profile         = phân bổ KL nến phút theo giá điển hình (H+L+C)/3; POC; vùng giá trị 70%
// Lưu ý: mua/bán chủ động không có ở SSI FC Data v2 (luôn = 0) nên không tính.

const round = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const sum = (a) => a.reduce((s, v) => s + v, 0);
const avg = (a) => (a.length ? sum(a) / a.length : null);

function minuteOfSession(isoTime) {
  const m = String(isoTime).match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** KL lũy kế theo phút trong phiên: Map(phút -> KL lũy kế tới phút đó). */
function cumulativeByMinute(bars) {
  const out = [];
  let acc = 0;
  for (const b of [...bars].sort((a, b) => a.date.localeCompare(b.date))) {
    acc += b.volume || 0;
    out.push([minuteOfSession(b.date), acc]);
  }
  return out;
}

function cumulativeAt(series, minute) {
  let last = 0;
  for (const [m, v] of series) {
    if (m === null || m > minute) break;
    last = v;
  }
  return last;
}

export function computeTrend(daily) {
  const last30 = daily.slice(-30);
  const bars30 = last30.map((r, i) => {
    const prev = i > 0 ? last30[i - 1] : daily[daily.length - 31];
    return { date: r.date, volume: r.volume, value: r.value, close: r.close, up: prev ? r.closeAdj >= prev.closeAdj : true };
  });
  const last20 = daily.slice(-21);
  let upVol = 0, downVol = 0;
  for (let i = 1; i < last20.length; i++) {
    if (last20[i].closeAdj > last20[i - 1].closeAdj) upVol += last20[i].volume;
    else if (last20[i].closeAdj < last20[i - 1].closeAdj) downVol += last20[i].volume;
  }
  const obv = [0];
  for (let i = 1; i < daily.length; i++) {
    const d = Math.sign(daily[i].closeAdj - daily[i - 1].closeAdj);
    obv.push(obv[i - 1] + d * daily[i].volume);
  }
  const obvNow = obv.at(-1);
  const obvThen = obv.length > 20 ? obv[obv.length - 21] : obv[0];
  const vol20 = avg(daily.slice(-20).map((r) => r.volume)) || 0;
  const obvChangeVsAvgVol = vol20 ? (obvNow - obvThen) / vol20 : 0;
  const obvDirection = obvChangeVsAvgVol > 1 ? "up" : obvChangeVsAvgVol < -1 ? "down" : "flat";

  let mfv = 0, vol = 0;
  for (const r of daily.slice(-20)) {
    const range = r.high - r.low;
    const mfm = range > 0 ? ((r.close - r.low) - (r.high - r.close)) / range : 0;
    mfv += mfm * r.volume;
    vol += r.volume;
  }
  const cmf20 = vol ? mfv / vol : null;

  let divergence = null;
  if (daily.length >= 21) {
    const priceChange = daily.at(-1).closeAdj / daily.at(-11).closeAdj - 1;
    const volRecent = avg(daily.slice(-10).map((r) => r.volume));
    const volBefore = avg(daily.slice(-20, -10).map((r) => r.volume));
    const volChange = volBefore ? volRecent / volBefore - 1 : 0;
    if (priceChange > 0.03 && volChange < -0.2) divergence = { code: "PRICE_UP_VOLUME_DOWN", label: "Giá tăng nhưng khối lượng giảm" };
    else if (priceChange < -0.03 && volChange > 0.2) divergence = { code: "PRICE_DOWN_VOLUME_UP", label: "Giá giảm kèm khối lượng tăng" };
    else if (priceChange > 0.03 && volChange > 0.2) divergence = { code: "PRICE_UP_VOLUME_UP", label: "Giá tăng, khối lượng xác nhận" };
    else if (priceChange < -0.03 && volChange < -0.2) divergence = { code: "PRICE_DOWN_VOLUME_DOWN", label: "Giá giảm, khối lượng cạn dần" };
    if (divergence) Object.assign(divergence, { priceChangePct: round(priceChange * 100, 1), volumeChangePct: round(volChange * 100, 1) });
  }

  return {
    bars30,
    ma20Volume: round(vol20, 0),
    upDownVolumeRatio20: downVol ? round(upVol / downVol, 2) : null,
    obvDirection,
    obvChangeVsAvgVolume: round(obvChangeVsAvgVol, 2),
    cmf20: round(cmf20, 3),
    divergence,
  };
}

export function computeForeign(daily) {
  const today = daily.at(-1);
  const net = (r) => (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0);
  let streak = 0;
  const sign = Math.sign(net(today));
  if (sign !== 0) for (let i = daily.length - 1; i >= 0 && Math.sign(net(daily[i])) === sign; i--) streak++;
  const turnover = (today.value || 0) + (today.dealValue || 0);
  return {
    today: {
      buyVol: today.foreignBuyVol, sellVol: today.foreignSellVol, netVol: (today.foreignBuyVol ?? 0) - (today.foreignSellVol ?? 0),
      buyVal: today.foreignBuyVal, sellVal: today.foreignSellVal, netVal: net(today),
    },
    net5Val: sum(daily.slice(-5).map(net)),
    net20Val: sum(daily.slice(-20).map(net)),
    buySharePct: turnover ? round((today.foreignBuyVal / turnover) * 100, 1) : null,
    sellSharePct: turnover ? round((today.foreignSellVal / turnover) * 100, 1) : null,
    streak: { direction: sign > 0 ? "buy" : sign < 0 ? "sell" : "none", sessions: streak },
    room: today.foreignRoom,
    netSeries20: daily.slice(-20).map((r) => ({ date: r.date, netVal: net(r) })),
  };
}

export function computeProfile(intradaySessions, currentPrice, bins = 24) {
  const bars = intradaySessions.flat().filter((b) => b.volume > 0);
  if (!bars.length) return null;
  const typical = bars.map((b) => (b.high + b.low + b.close) / 3);
  const lo = Math.min(...bars.map((b) => b.low));
  const hi = Math.max(...bars.map((b) => b.high));
  if (!(hi > lo)) return null;
  const width = (hi - lo) / bins;
  const hist = Array.from({ length: bins }, (_, i) => ({ priceLow: lo + i * width, priceHigh: lo + (i + 1) * width, volume: 0 }));
  bars.forEach((b, i) => {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((typical[i] - lo) / width)));
    hist[idx].volume += b.volume;
  });
  const total = sum(hist.map((h) => h.volume));
  const pocIdx = hist.reduce((best, h, i) => (h.volume > hist[best].volume ? i : best), 0);
  // Vùng giá trị 70%: mở rộng từ POC sang hai bên, mỗi bước lấy phía có KL lớn hơn.
  let lowIdx = pocIdx, highIdx = pocIdx, covered = hist[pocIdx].volume;
  while (covered < total * 0.7 && (lowIdx > 0 || highIdx < bins - 1)) {
    const below = lowIdx > 0 ? hist[lowIdx - 1].volume : -1;
    const above = highIdx < bins - 1 ? hist[highIdx + 1].volume : -1;
    if (above >= below) covered += hist[++highIdx].volume; else covered += hist[--lowIdx].volume;
  }
  const poc = (hist[pocIdx].priceLow + hist[pocIdx].priceHigh) / 2;
  const vaLow = hist[lowIdx].priceLow;
  const vaHigh = hist[highIdx].priceHigh;
  const position = currentPrice > vaHigh ? "above" : currentPrice < vaLow ? "below" : "inside";
  return {
    sessions: intradaySessions.filter((s) => s.length).length,
    bins: hist.map((h) => ({ priceLow: round(h.priceLow, 0), priceHigh: round(h.priceHigh, 0), volume: h.volume })),
    poc: round(poc, 0), valueAreaLow: round(vaLow, 0), valueAreaHigh: round(vaHigh, 0), position,
  };
}

export function computeIntraday(todayBars, pastSessions) {
  if (!todayBars.length) return null;
  const buckets = new Map();
  for (const b of todayBars) {
    const m = minuteOfSession(b.date);
    if (m === null) continue;
    const start = Math.floor(m / 15) * 15;
    const key = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) ?? 0) + (b.volume || 0));
  }
  const total = sum(todayBars.map((b) => b.volume || 0));
  const atoVol = sum(todayBars.filter((b) => { const m = minuteOfSession(b.date); return m !== null && m <= 9 * 60 + 15; }).map((b) => b.volume));
  const atcVol = sum(todayBars.filter((b) => { const m = minuteOfSession(b.date); return m !== null && m >= 14 * 60 + 30; }).map((b) => b.volume));
  const sorted = [...todayBars].sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const avgBar = total / todayBars.length;

  // KL lũy kế tới phút hiện tại so với cùng thời điểm các phiên trước.
  const lastMinute = Math.max(...todayBars.map((b) => minuteOfSession(b.date) ?? 0));
  const pastCum = pastSessions.filter((s) => s.length).map((s) => cumulativeAt(cumulativeByMinute(s), lastMinute));
  const avgPastCum = avg(pastCum);

  return {
    buckets15m: [...buckets.entries()].sort().map(([time, volume]) => ({ time, volume })),
    totalVolume: total,
    atoSharePct: total ? round((atoVol / total) * 100, 1) : null,
    atcSharePct: total ? round((atcVol / total) * 100, 1) : null,
    peak: sorted[0] ? { time: String(sorted[0].date).slice(11, 16), volume: sorted[0].volume, multipleOfAvgBar: avgBar ? round(sorted[0].volume / avgBar, 1) : null } : null,
    sameTime: avgPastCum ? { asOfTime: `${String(Math.floor(lastMinute / 60)).padStart(2, "0")}:${String(lastMinute % 60).padStart(2, "0")}`, ratio: round(total / avgPastCum, 2), sessions: pastCum.length } : null,
  };
}

function fmtBn(v) {
  return `${(v / 1e9).toFixed(1)} tỷ`;
}

/** Nhận định ngắn theo quy tắc (công khai), không dùng nhãn Wyckoff/VSA. */
export function buildInsights({ today, trend, foreign, profile, intraday }) {
  const out = [];
  if (today.rvol20 !== null && today.rvol20 >= 2) out.push(`Khối lượng đột biến ${today.rvol20}× bình quân 20 phiên trong phiên ${today.changePct >= 0 ? "tăng" : "giảm"}.`);
  else if (today.rvol20 !== null && today.rvol20 <= 0.5) out.push(`Khối lượng thấp (${today.rvol20}× bình quân 20 phiên).`);
  if (intraday?.sameTime && intraday.sameTime.ratio >= 1.5) out.push(`Tới ${intraday.sameTime.asOfTime}, khối lượng đã gấp ${intraday.sameTime.ratio}× cùng thời điểm ${intraday.sameTime.sessions} phiên trước.`);
  if (trend.divergence) out.push(`${trend.divergence.label} (giá ${trend.divergence.priceChangePct}% / KL ${trend.divergence.volumeChangePct}% trong 10 phiên).`);
  if (trend.upDownVolumeRatio20 !== null) {
    if (trend.upDownVolumeRatio20 >= 1.5) out.push(`KL phiên tăng gấp ${trend.upDownVolumeRatio20}× KL phiên giảm (20 phiên).`);
    else if (trend.upDownVolumeRatio20 <= 0.67) out.push(`KL phiên giảm áp đảo (tỷ lệ tăng/giảm ${trend.upDownVolumeRatio20}).`);
  }
  if (foreign.streak.sessions >= 3) out.push(`Khối ngoại ${foreign.streak.direction === "buy" ? "mua" : "bán"} ròng ${foreign.streak.sessions} phiên liên tiếp (20 phiên: ${foreign.net20Val >= 0 ? "+" : ""}${fmtBn(foreign.net20Val)}).`);
  if (profile) {
    const pos = { above: "trên", below: "dưới", inside: "trong" }[profile.position];
    out.push(`Giá đang ở ${pos} vùng giá trị ${profile.sessions} phiên (${profile.valueAreaLow.toLocaleString("vi-VN")}–${profile.valueAreaHigh.toLocaleString("vi-VN")}, POC ${profile.poc.toLocaleString("vi-VN")}).`);
  }
  return out;
}

/**
 * @param {{ symbol: string, daily: any[], intradayToday: any[], intradayPast: any[][], live?: { price?: number, totalVolume?: number } }} p
 */
export function buildVolumeAnalysis({ symbol, daily, intradayToday = [], intradayPast = [], live = null }) {
  if (!daily.length) throw new Error(`Chưa có dữ liệu ngày cho ${symbol}.`);
  const last = daily.at(-1);
  const prev = daily.at(-2);
  const prior20 = daily.slice(-21, -1).map((r) => r.volume);
  const avg20 = avg(prior20);
  const volume = live?.totalVolume ?? last.volume;
  const price = live?.price ?? last.close;
  const today = {
    date: last.date,
    price,
    changePct: prev ? round((price / prev.close - 1) * 100, 2) : null,
    volume,
    value: last.value,
    dealVolume: last.dealVolume,
    dealValue: last.dealValue,
    avgVolume20: round(avg20, 0),
    rvol20: avg20 ? round(volume / avg20, 2) : null,
  };
  const trend = computeTrend(daily);
  const foreign = computeForeign(daily);
  const profile = computeProfile([...intradayPast, intradayToday], price);
  const intraday = computeIntraday(intradayToday, intradayPast);
  return {
    symbol, asOf: last.date, today, trend, foreign, profile, intraday,
    insights: buildInsights({ today, trend, foreign, profile, intraday }),
    notes: ["Mua/bán chủ động: SSI FC Data v2 không cung cấp (luôn = 0) nên không hiển thị."],
  };
}
