// Sự kiện quyền (cổ tức tiền, cổ tức cổ phiếu, cổ phiếu thưởng) cho chuỗi giá TA điều chỉnh CỘNG DỒN.
// Nguồn: Project A /api/cotuc/events (VNDirect, VCI dự phòng) — cùng nguồn tab Cổ tức đang dùng, toàn universe một lượt.
//
// Vì sao cần: DailyOhlc của SSI chỉ áp hệ số của đợt quyền GẦN NHẤT cho toàn bộ lịch sử (xem adjustedHistory.js), nên
// các đợt cũ hơn vẫn để lại khoảng trống giá giả (VD FPT 21/09/2026 −7,3% = ngày GDKHQ cổ phiếu thưởng 10%) -> FVG/BOS/OB giả.
//
// Công thức điều chỉnh lùi (chuẩn Sở GDCK, giá tham chiếu ngày GDKHQ):
//   f = (P_prev − cổ tức tiền) / (P_prev · (1 + tỷ lệ cổ phiếu))      P_prev = giá đóng cửa DANH NGHĨA phiên liền trước
//   Mọi giá TRƯỚC ngày GDKHQ nhân f (cộng dồn qua các đợt); khối lượng trước ngày đó chia f_cp = 1/(1+tỷ lệ).
//   Giá từ ngày GDKHQ trở đi giữ nguyên = giá danh nghĩa (chuỗi khớp bảng giá hiện tại).

const EVENTS_TTL_MS = 6 * 60 * 60_000;
const STOCK_TYPES = new Set(["STOCK_DIVIDEND", "BONUS_ISSUE"]);

/** Chuẩn hoá một sự kiện lifecycle của Project A -> { exDate, cash, ratio, type, label } hoặc null. */
export function normalizeCorporateEvent(e) {
  const exDate = String(e?.exrightDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate)) return null;
  if (e.eventType === "CASH") {
    const cash = Number(e.valuePerShare);
    return cash > 0 ? { exDate, type: "CASH", cash, ratio: 0, label: `Cổ tức ${cash.toLocaleString("vi-VN")}đ` } : null;
  }
  if (STOCK_TYPES.has(e.eventType)) {
    const ratio = Number(e.exerciseRatio);
    if (!(ratio > 0 && ratio < 5)) return null;
    const pct = Math.round(ratio * 1000) / 10;
    return { exDate, type: e.eventType, cash: 0, ratio, label: `${e.eventType === "BONUS_ISSUE" ? "Thưởng" : "Cổ tức"} CP ${pct}%` };
  }
  return null; // ESOP, phát hành thêm có giá… không điều chỉnh
}

/**
 * Điều chỉnh lùi cộng dồn một chuỗi OHLCV DANH NGHĨA (hàm thuần).
 * @param {{date, open, high, low, close, volume}[]} bars tăng dần theo ngày, giá danh nghĩa
 * @param {{exDate, cash, ratio, type, label}[]} events đã chuẩn hoá
 * @returns {{ bars, applied: {date, factor, label}[], skipped: {date, label, reason}[] }}
 */
export function adjustOhlcSeries(bars, events) {
  const n = bars.length;
  const byExIndex = new Map(); // chỉ số phiên GDKHQ -> { cash, ratio, labels }
  const skipped = [];
  for (const e of events) {
    // Phiên GDKHQ = phiên giao dịch đầu tiên có ngày >= exDate (ngày GDKHQ rơi vào ngày nghỉ -> phiên kế tiếp).
    let i = 0;
    while (i < n && bars[i].date < e.exDate) i++;
    if (i === 0 || i >= n) { skipped.push({ date: e.exDate, label: e.label, reason: "OUT_OF_RANGE" }); continue; }
    const g = byExIndex.get(i) ?? { cash: 0, ratio: 0, labels: [] };
    g.cash += e.cash;
    g.ratio += e.ratio;
    g.labels.push(e.label);
    byExIndex.set(i, g);
  }

  const factorAt = new Array(n).fill(1);
  const volFactorAt = new Array(n).fill(1);
  const applied = [];
  for (const [i, g] of [...byExIndex.entries()].sort((a, b) => a[0] - b[0])) {
    const prev = bars[i - 1].close;
    const label = g.labels.join(" + ");
    if (!(prev > 0) || g.cash >= prev * 0.5) { skipped.push({ date: bars[i].date, label, reason: "INVALID_CASH" }); continue; }
    const f = (prev - g.cash) / (prev * (1 + g.ratio));
    factorAt[i] = f;
    volFactorAt[i] = 1 + g.ratio;
    applied.push({ date: bars[i].date, factor: Math.round(f * 1e6) / 1e6, label });
  }

  const out = new Array(n);
  let k = 1;
  let kv = 1;
  for (let i = n - 1; i >= 0; i--) {
    const b = bars[i];
    const r2 = (v) => (typeof v === "number" ? Math.round(v * k * 100) / 100 : v);
    out[i] = { ...b, open: r2(b.open), high: r2(b.high), low: r2(b.low), close: r2(b.close), volume: b.volume == null ? b.volume : Math.round(b.volume * kv) };
    k *= factorAt[i];
    kv *= volFactorAt[i];
  }
  return { bars: out, applied, skipped };
}

/** Bộ nhớ đệm sự kiện quyền toàn universe (một lượt gọi Project A / 6 giờ; lỗi -> giữ bản cũ). */
export function createCorporateActions({ base, fetchImpl = globalThis.fetch, now = Date.now, ttlMs = EVENTS_TTL_MS, timeoutMs = 90_000 } = {}) {
  let snapshot = null; // { at, byTicker: Map, generatedAt, source }
  let inflight = null;

  async function load() {
    const res = await fetchImpl(`${base}/api/cotuc/events`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Project A /api/cotuc/events HTTP ${res.status}`);
    const body = await res.json();
    const byTicker = new Map();
    for (const r of body?.results ?? []) {
      if (!r?.available) continue;
      byTicker.set(String(r.ticker).toUpperCase(), (r.lifecycleEvents ?? []).map(normalizeCorporateEvent).filter(Boolean));
    }
    snapshot = { at: now(), byTicker, generatedAt: body?.generatedAt ?? null, source: body?.eventSource ?? "PROJECT_A" };
    return snapshot;
  }

  async function ensure() {
    if (snapshot && now() - snapshot.at < ttlMs) return snapshot;
    inflight ??= load().finally(() => { inflight = null; });
    try {
      return await inflight;
    } catch (error) {
      if (snapshot) return snapshot; // giữ dữ liệu thật gần nhất khi Project A tạm lỗi
      throw error;
    }
  }

  return {
    /** @returns {Promise<{ events, covered: boolean, generatedAt, source }>} covered=false: mã không có trong nguồn sự kiện */
    async get(symbol) {
      const snap = await ensure();
      const events = snap.byTicker.get(String(symbol).toUpperCase());
      return { events: events ?? [], covered: Boolean(events), generatedAt: snap.generatedAt, source: snap.source };
    },
  };
}
