// Trading Matrix M1 — đặc trưng thuần (không gọi mạng). Mỗi đặc trưng trả kèm định nghĩa, mẫu số, nguồn và thời điểm.
// Nguyên tắc (spec §6, §9): ngày và trong phiên KHÔNG trộn; thiếu dữ liệu -> null + trạng thái, không thay bằng trung tính;
// mọi tỷ lệ có eligible / observed / excluded; nhãn có hysteresis để không đổi màu theo từng tick.
import { classifyRegime } from "../research/regime.js";

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ------------------------------------------------------------------ độ rộng (cuối phiên)

/**
 * @param {Map<string, {date,close,closeAdj,refPrice,high,low,value}[]>} bySymbol  chuỗi ngày (cũ -> mới) của các mã trong phạm vi
 * @param {string} asOf  phiên đánh giá (phiên đã đóng gần nhất)
 */
export function dailyBreadth(bySymbol, asOf, { minHistory = 50 } = {}) {
  let eligible = 0, above20 = 0, above50 = 0, adv = 0, dec = 0, unch = 0, newHigh = 0, newLow = 0;
  const rets = [], excluded = { suspended: 0, shortHistory: 0 };
  let total = 0;
  for (const rows of bySymbol.values()) {
    total++;
    const last = rows[rows.length - 1];
    if (!last || last.date !== asOf) { excluded.suspended++; continue; }
    if (rows.length < minHistory) { excluded.shortHistory++; continue; }
    eligible++;
    const c = rows.map((r) => r.closeAdj ?? r.close);
    const ma = (n) => mean(c.slice(-n));
    const px = c[c.length - 1];
    if (px > ma(20)) above20++;
    if (px > ma(50)) above50++;
    const ref = last.refPrice > 0 ? last.refPrice : rows[rows.length - 2]?.close;
    if (ref > 0) {
      const ret = last.close / ref - 1;
      rets.push(ret);
      if (ret > 1e-9) adv++; else if (ret < -1e-9) dec++; else unch++;
    }
    const win = c.slice(-250, -1);
    if (win.length >= 120) { if (px > Math.max(...win)) newHigh++; if (px < Math.min(...win)) newLow++; }
  }
  const pct = (n) => (eligible ? r1((n / eligible) * 100) : null);
  return {
    asOf, horizon: "daily",
    aboveMa20Pct: pct(above20), aboveMa50Pct: pct(above50),
    advancers: adv, decliners: dec, unchanged: unch,
    medianReturn: r3(median(rets) == null ? null : median(rets) * 100),
    newHighs: newHigh, newLows: newLow,
    eligibleCount: eligible, observedCount: rets.length, excludedCount: excluded.suspended + excluded.shortHistory, excluded, scopeSize: total,
    coverage: total ? r3(eligible / total) : null,
  };
}

/** Chuỗi % trên MA20 của N phiên gần nhất (xu hướng độ rộng 5/20 phiên). */
export function breadthTrend(bySymbol, dates) {
  return dates.map((d) => {
    let n = 0, up = 0;
    for (const rows of bySymbol.values()) {
      const i = rows.findIndex((r) => r.date === d);
      if (i < 19) continue;
      const c = rows.slice(i - 19, i + 1).map((r) => r.closeAdj ?? r.close);
      n++; if (c[19] > mean(c)) up++;
    }
    return { date: d, aboveMa20Pct: n ? r1((up / n) * 100) : null, n };
  });
}

// ------------------------------------------------------------------ biến động

/** ATR14 + phân vị 250 phiên, biến động thực 20 phiên (năm hoá), biên độ phiên so TB 20 phiên. */
export function volatilityDaily(bars) {
  if (!bars || bars.length < 30) return null;
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const atr = []; let a = 0;
  for (let i = 0; i < tr.length; i++) { a = i < 14 ? (a * i + tr[i]) / (i + 1) : (a * 13 + tr[i]) / 14; atr.push(a); }
  const last = atr.length - 1, win = atr.slice(-250);
  const atrPct = (win.filter((v) => v <= atr[last]).length / win.length) * 100;
  const rets = bars.slice(-21).map((b, i, arr) => (i ? Math.log(b.close / arr[i - 1].close) : null)).filter((x) => x != null);
  const sd = Math.sqrt(mean(rets.map((x) => x * x)) - mean(rets) ** 2);
  const rng = bars.map((b) => (b.close > 0 ? (b.high - b.low) / b.close : 0));
  const avgR = mean(rng.slice(-21, -1)), sdR = Math.sqrt(mean(rng.slice(-21, -1).map((x) => (x - avgR) ** 2)));
  const flat = bars.slice(-20).filter((b) => b.high === b.low).length;
  return {
    asOf: bars[last].date, horizon: "daily",
    atr14: r1(atr[last]), atrPct: r1((atr[last] / bars[last].close) * 100), atrPercentile: r1(atrPct),
    realizedVol20: r1(sd * Math.sqrt(252) * 100),
    rangeZ: flat >= 10 || !(sdR > 0) ? null : r3((rng[last] - avgR) / sdR),
    note: flat >= 10 ? "Nến chỉ số chỉ có giá đóng cửa — không tính biên độ phiên." : null,
  };
}

// ------------------------------------------------------------------ regime

/**
 * Regime theo ngày: quy tắc công khai (research/regime.js) + xác suất HMM (nếu có) + xác suất chuyển giai đoạn (cấu trúc, đã kiểm định).
 * TRANSITION khi hai xác suất HMM lớn nhất chênh < 0,15 (spec §9.3).
 */
export function regimeDaily(bars, { hmm = null, stageOdds = null } = {}) {
  if (!bars || bars.length < 60) return { label: "UNKNOWN", horizon: "daily", reason: "Chưa đủ 60 phiên VN-Index." };
  const c = bars.map((b) => b.close);
  const sma = (n, end = c.length) => mean(c.slice(end - n, end));
  const rule = classifyRegime(c.at(-1), sma(20), sma(50), sma(50, c.length - 10));
  let label = rule;
  let probabilities = null, gap = null;
  if (hmm && [hmm.pBear, hmm.pNeutral, hmm.pBull].every((x) => Number.isFinite(x))) {
    probabilities = { bear: r3(hmm.pBear), neutral: r3(hmm.pNeutral), bull: r3(hmm.pBull) };
    const s = [hmm.pBear, hmm.pNeutral, hmm.pBull].sort((a, b) => b - a);
    gap = r3(s[0] - s[1]);
    if (gap < 0.15) label = "TRANSITION";
  }
  return {
    label, rule, horizon: "daily", asOf: bars.at(-1).date, probabilities, probabilityGap: gap,
    hmmAsOf: hmm?.date ?? null, stageOdds,
    definition: "UPTREND: giá > MA50, MA20 > MA50, MA50 dốc lên 10 phiên · DOWNTREND đối xứng · còn lại SIDEWAY; TRANSITION khi xác suất HMM hai trạng thái đầu chênh < 0,15.",
  };
}

// ------------------------------------------------------------------ dòng tiền

/**
 * Khối ngoại (đã chốt phiên) theo phạm vi + dấu chân lệnh lớn (IFE, research). Các nguồn TÁCH riêng; trạng thái tổng hợp
 * chỉ khi đủ nguồn — thiếu một nguồn -> PARTIAL (spec §6.4).
 * @param {{date, net}[]} foreignByDate  mua − bán ròng (đồng) theo phiên, cũ -> mới
 */
export function flowState({ foreignByDate = [], footprint = null }) {
  const sources = [];
  let foreign = null;
  if (foreignByDate.length) {
    const last = foreignByDate.at(-1);
    let streak = 0;
    for (let i = foreignByDate.length - 1; i >= 0; i--) { if (Math.sign(foreignByDate[i].net) === Math.sign(last.net) && last.net !== 0) streak++; else break; }
    const sum5 = foreignByDate.slice(-5).reduce((a, x) => a + x.net, 0);
    foreign = { asOf: last.date, net: last.net, net5: sum5, streak: streak * Math.sign(last.net), settled: true };
    sources.push("FOREIGN_EOD");
  }
  let ife = null;
  if (footprint && Number.isFinite(footprint.zLd5)) {
    ife = { asOf: footprint.date, zLd5: r3(footprint.zLd5), zFr5: Number.isFinite(footprint.zFr5) ? r3(footprint.zFr5) : null, method: footprint.method ?? "Lee–Ready (nến phút) / BVC", coverageDays: footprint.coverageDays ?? null };
    sources.push("IFE");
  }
  const signs = [];
  if (foreign) signs.push(Math.abs(foreign.net5) < 1e9 ? 0 : Math.sign(foreign.net5));
  if (ife) signs.push(Math.abs(ife.zLd5) < 0.5 ? 0 : Math.sign(ife.zLd5));
  let state = "UNKNOWN";
  if (signs.length) {
    const pos = signs.filter((s) => s > 0).length, neg = signs.filter((s) => s < 0).length;
    state = pos && neg ? "MIXED" : pos ? "ACCUMULATION" : neg ? "DISTRIBUTION" : "NEUTRAL";
  }
  return { state, sources, partial: sources.length < 2, foreign, ife, proprietary: null, note: "Ước lượng thống kê chiều chủ động của lệnh — không phải danh tính nhà đầu tư." };
}

// ------------------------------------------------------------------ phiên + sức khoẻ dữ liệu

const PHASE = { PRE_OPEN: "Trước phiên", ATO: "ATO", BREAK: "Nghỉ trưa", ATC: "ATC", PT: "Thoả thuận", CLOSED: "Đóng cửa" };
export function sessionPhase(session, minutes) {
  const phase = session === "LO" ? (minutes < 12 * 60 ? "CONTINUOUS_AM" : "CONTINUOUS_PM") : session;
  const label = phase === "CONTINUOUS_AM" ? "Khớp liên tục sáng" : phase === "CONTINUOUS_PM" ? "Khớp liên tục chiều" : PHASE[phase] ?? phase;
  return { phase, label };
}

/**
 * Trạng thái một nguồn: LIVE (trong phiên, tuổi ≤ liveSec) · DELAYED (≤ delayedSec) · STALE (ngày cuối phiên cũ hơn phiên đã đóng
 * gần nhất, hoặc trong phiên quá delayedSec) · UNAVAILABLE (lỗi / không có).
 */
export function sourceHealth({ id, label, kind, asOf, error = null, expectedDate, live, nowMs, liveSec = 120, delayedSec = 900 }) {
  if (error || !asOf) return { id, label, kind, status: "UNAVAILABLE", asOf: asOf ?? null, detail: error ?? "Chưa có dữ liệu" };
  if (kind === "daily") return { id, label, kind, asOf, status: String(asOf).slice(0, 10) >= expectedDate ? "LIVE" : "STALE", detail: String(asOf).slice(0, 10) >= expectedDate ? "Đã chốt phiên gần nhất" : `Phiên gần nhất cần có: ${expectedDate}` };
  const age = (nowMs - Date.parse(asOf)) / 1000;
  if (!live) return { id, label, kind, asOf, status: "DELAYED", detail: "Ngoài giờ khớp lệnh" };
  return { id, label, kind, asOf, status: age <= liveSec ? "LIVE" : age <= delayedSec ? "DELAYED" : "STALE", ageSec: Math.round(age) };
}

/** Tổng hợp: UNAVAILABLE nếu mọi nguồn bắt buộc lỗi; PARTIAL nếu có nguồn lỗi/cũ; còn lại theo nguồn kém nhất. */
export function overallHealth(list, required = []) {
  const req = list.filter((s) => required.includes(s.id));
  if (req.length && req.every((s) => s.status === "UNAVAILABLE")) return "UNAVAILABLE";
  if (list.some((s) => s.status === "UNAVAILABLE" || s.status === "STALE")) return "PARTIAL";
  if (list.some((s) => s.status === "DELAYED")) return "DELAYED";
  return "LIVE";
}

// ------------------------------------------------------------------ hysteresis nhãn

/** Nhãn chỉ đổi khi giá trị mới giữ ≥ `confirm` lần tính liên tiếp (chống nhấp nháy theo tick). */
export function createHysteresis(confirm = 2) {
  const st = new Map();
  return (key, label) => {
    const s = st.get(key);
    if (!s) { st.set(key, { label, pending: null, n: 0 }); return label; }
    if (label === s.label) { s.pending = null; s.n = 0; return s.label; }
    if (label === s.pending) s.n++; else { s.pending = label; s.n = 1; }
    if (s.n >= confirm) { s.label = label; s.pending = null; s.n = 0; }
    return s.label;
  };
}
