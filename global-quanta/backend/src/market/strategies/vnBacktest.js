// Mô phỏng một lệnh theo luật thị trường cổ phiếu Việt Nam — dùng chung cho các bộ lọc (Screener Engine v2).
//   - Vào lệnh giá mở cửa phiên sau tín hiệu (+ trượt giá); bỏ nếu phiên đó khoá trần (H=L, ≥ +6,5%) hoặc gap quá xa.
//   - T+2,5: hàng về chiều T+2 -> phiên đầu tiên được bán là entry+2 và chỉ phiên chiều:
//     đã thủng stop trước đó hoặc trong phiên -> bán min(stop, đóng cửa); chạm mục tiêu chỉ khi đóng cửa ≥ mục tiêu.
//   - Từ entry+3: stop trước (giá = min(mở cửa, stop)), rồi mục tiêu (max(mở cửa, mục tiêu)), rồi trailing / hết thời gian.
//   - Không bán được khi khoá sàn (H=L, ≤ −6,5%).
//   - Chi phí: phí 0,15% + trượt 0,1% mỗi chiều, thuế bán 0,1% (Thông tư 111/2013).

export const VN_RULES = Object.freeze({
  feePct: 0.0015, slipPct: 0.001, sellTaxPct: 0.001,
  limitPct: 0.065, // ≈ biên độ HOSE 7% (HNX 10%, UPCoM 15% cũng bị coi là khoá — bảo thủ)
  settleBars: 2,
});

export const isLimitUp = (S, i) => i > 0 && S.L[i] === S.H[i] && S.C[i] / S.C[i - 1] - 1 >= VN_RULES.limitPct;
export const isLimitDown = (S, i) => i > 0 && S.L[i] === S.H[i] && S.C[i] / S.C[i - 1] - 1 <= -VN_RULES.limitPct;

/**
 * @param S       { n, date, O, H, L, C }
 * @param t       phiên tín hiệu (vào lệnh t+1)
 * @param plan    { stop, target: number | (entry, stop) => number, trailLine?, trailMinHold?, maxHold, maxGapPct? }
 * @returns { skip: "LIMIT_UP" | "GAP" | "OPEN" } | { trade }
 */
export function simulateVnTrade(S, t, { stop, target, trailLine = null, trailMinHold = 0, maxHold = 30, maxGapPct = 0.05 }) {
  const e = t + 1;
  if (e >= S.n) return { skip: "OPEN" };
  if (isLimitUp(S, e)) return { skip: "LIMIT_UP" };
  if (!(S.O[e] > stop) || Math.abs(S.O[e] / S.C[t] - 1) > maxGapPct) return { skip: "GAP" };
  const entry = S.O[e] * (1 + VN_RULES.slipPct);
  const tgt = typeof target === "function" ? target(entry, stop) : target;
  const firstSell = e + VN_RULES.settleBars;
  let exitIdx = -1, exitPx = NaN, reason = "", breached = false;
  for (let j = e; j < S.n; j++) {
    if (j < firstSell) { if (S.L[j] <= stop) breached = true; continue; } // chưa có hàng để bán
    if (isLimitDown(S, j)) continue; // trắng bên mua -> không bán được
    if (j === firstSell) {
      if (breached || S.L[j] <= stop) { exitIdx = j; exitPx = Math.min(stop, S.C[j]); reason = "STOP"; break; }
      if (S.C[j] >= tgt) { exitIdx = j; exitPx = tgt; reason = "TARGET"; break; }
    } else {
      if (S.L[j] <= stop) { exitIdx = j; exitPx = Math.min(S.O[j], stop); reason = "STOP"; break; }
      if (S.H[j] >= tgt) { exitIdx = j; exitPx = Math.max(S.O[j], tgt); reason = "TARGET"; break; }
    }
    const held = j - e;
    const trail = trailLine && held >= trailMinHold && S.C[j] < trailLine[j];
    if (trail || held + 1 >= maxHold) {
      if (j + 1 < S.n) { exitIdx = j + 1; exitPx = S.O[j + 1]; } else { exitIdx = j; exitPx = S.C[j]; }
      reason = trail ? "TRAIL" : "TIME"; break;
    }
  }
  if (exitIdx < 0) return { skip: "OPEN" }; // lệnh còn mở ở cuối chuỗi: không tính
  const fill = exitPx * (1 - VN_RULES.slipPct);
  const net = (fill * (1 - VN_RULES.feePct - VN_RULES.sellTaxPct)) / (entry * (1 + VN_RULES.feePct)) - 1;
  return {
    trade: {
      signalDate: S.date[t], entryDate: S.date[e], exitDate: S.date[exitIdx], entryIdx: e, exitIdx,
      entry, stop, target: tgt, exit: fill, reason, netPct: net * 100, R: net / ((entry - stop) / entry), bars: exitIdx - e + 1,
    },
  };
}

/** Thống kê gộp: n, tỷ lệ thắng, TB/median %, PF, kỳ vọng R, số phiên giữ. */
export function summarizeTrades(trades) {
  if (!trades.length) return { n: 0 };
  const net = trades.map((x) => x.netPct).sort((a, b) => a - b);
  const wins = trades.filter((x) => x.netPct > 0);
  const gw = wins.reduce((a, x) => a + x.netPct, 0);
  const gl = -trades.filter((x) => x.netPct <= 0).reduce((a, x) => a + x.netPct, 0);
  const r1 = (v) => Math.round(v * 100) / 100;
  return {
    n: trades.length,
    winRate: r1((wins.length / trades.length) * 100),
    avgNetPct: r1(net.reduce((a, b) => a + b, 0) / net.length),
    medianNetPct: r1(net[Math.floor(net.length / 2)]),
    profitFactor: gl > 0 ? r1(gw / gl) : null,
    expectancyR: r1(trades.reduce((a, x) => a + x.R, 0) / trades.length),
    avgBars: r1(trades.reduce((a, x) => a + x.bars, 0) / trades.length),
    byReason: trades.reduce((m, x) => ({ ...m, [x.reason]: (m[x.reason] ?? 0) + 1 }), {}),
  };
}

/** Lợi nhuận nền: mua mở cửa t+1, bán đóng cửa t+hold, cùng chi phí — mọi phiên thứ `step` đủ điều kiện. */
export function baselineReturns(bars, { eligible = () => true, hold = 10, step = 5, start = 259 } = {}) {
  const out = [];
  const c = VN_RULES;
  for (let t = start; t + hold < bars.length; t += step) {
    if (!eligible(t)) continue;
    out.push({ date: bars[t].date, netPct: ((bars[t + hold].close * (1 - c.feePct - c.sellTaxPct - c.slipPct)) / (bars[t + 1].open * (1 + c.feePct + c.slipPct)) - 1) * 100 });
  }
  return out;
}

// ---------------------------------------------------------------- kiểm định (S6)

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32) — kết quả bootstrap lặp lại được. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Khoảng tin cậy 95% bootstrap (lấy mẫu lại theo NGÀY vào lệnh — các lệnh cùng ngày tương quan) cho lợi nhuận TB và PF.
 * @returns { mean: [lo, hi], pf: [lo, hi] } | null
 */
export function bootstrapCi(trades, { iters = 1000, seed = 7 } = {}) {
  if (trades.length < 10) return null;
  const byDate = new Map();
  for (const x of trades) { if (!byDate.has(x.entryDate)) byDate.set(x.entryDate, []); byDate.get(x.entryDate).push(x.netPct); }
  const clusters = [...byDate.values()];
  const r = rng(seed), means = [], pfs = [];
  for (let k = 0; k < iters; k++) {
    let sum = 0, n = 0, gw = 0, gl = 0;
    for (let c = 0; c < clusters.length; c++) {
      for (const v of clusters[Math.floor(r() * clusters.length)]) { sum += v; n++; if (v > 0) gw += v; else gl -= v; }
    }
    means.push(sum / n); pfs.push(gl > 0 ? gw / gl : 10);
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100; };
  return { mean: [q(means, 0.025), q(means, 0.975)], pf: [q(pfs, 0.025), q(pfs, 0.975)], clusters: clusters.length };
}

/** Welch t của lợi nhuận TB lệnh so với lợi nhuận nền. */
export function welchT(a, b) {
  if (a.length < 2 || b.length < 2) return null;
  const m = (x) => x.reduce((p, q) => p + q, 0) / x.length;
  const v = (x, mu) => x.reduce((p, q) => p + (q - mu) ** 2, 0) / (x.length - 1);
  const ma = m(a), mb = m(b), se = Math.sqrt(v(a, ma) / a.length + v(b, mb) / b.length);
  return se > 0 ? Math.round(((ma - mb) / se) * 100) / 100 : null;
}

/** Walk-forward theo nửa năm (theo ngày vào lệnh): ổn định qua các giai đoạn thị trường? */
export function byHalfYear(trades) {
  const g = new Map();
  for (const x of trades) {
    const y = x.entryDate.slice(0, 4), h = Number(x.entryDate.slice(5, 7)) <= 6 ? "H1" : "H2";
    const k = `${h}/${y}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(x);
  }
  return [...g].sort((a, b) => (a[0].slice(3) + a[0].slice(0, 2)).localeCompare(b[0].slice(3) + b[0].slice(0, 2)))
    .map(([period, list]) => ({ period, ...summarizeTrades(list) }));
}

/**
 * Bằng chứng gộp: tách trong/ngoài mẫu theo NGÀY chung. Nhãn VALIDATED khi NGOÀI MẪU: ≥ 30 lệnh, PF ≥ 1,1,
 * kỳ vọng > 0, vượt nền VÀ cận dưới KTC 95% bootstrap của lợi nhuận TB > 0.
 * @param trials số cấu hình đã thử khi chọn tham số (minh bạch về rủi ro tối ưu quá khớp)
 */
export function evidenceFromTrades(all, baseline, { first, last, oosRatio = 0.3, rules, trials = 1, extra = {} }) {
  if (!first) return { label: "EXPERIMENTAL", reason: "Chưa đủ lịch sử để kiểm định.", all: { n: 0 } };
  const span = Date.parse(last) - Date.parse(first);
  const cut = new Date(Date.parse(first) + span * (1 - oosRatio)).toISOString().slice(0, 10);
  const inS = all.filter((x) => x.exitDate < cut), outS = all.filter((x) => x.entryDate >= cut);
  const baseMean = (list) => (list.length ? Math.round((list.reduce((a, x) => a + x.netPct, 0) / list.length) * 100) / 100 : null);
  const oos = summarizeTrades(outS);
  const baseOos = baseMean(baseline.filter((x) => x.date >= cut));
  const ciOos = bootstrapCi(outS);
  const validated = oos.n >= 30 && (oos.profitFactor ?? 0) >= 1.1 && oos.expectancyR > 0 && baseOos != null && oos.avgNetPct > baseOos
    && ciOos != null && ciOos.mean[0] > 0;
  return {
    label: validated ? "VALIDATED" : "EXPERIMENTAL",
    reason: validated ? "Ngoài mẫu: PF ≥ 1,1, kỳ vọng dương, vượt nền, KTC 95% lợi nhuận TB > 0." :
      oos.n < 30 ? `Ngoài mẫu mới ${oos.n} lệnh (< 30).` : "Ngoài mẫu chưa đạt PF ≥ 1,1 / kỳ vọng dương / vượt nền / KTC 95% > 0.",
    validation: {
      ciAll: bootstrapCi(all), ciOutOfSample: ciOos,
      tVsBaseline: welchT(all.map((x) => x.netPct), baseline.map((x) => x.netPct)),
      tVsBaselineOos: welchT(outS.map((x) => x.netPct), baseline.filter((x) => x.date >= cut).map((x) => x.netPct)),
      periods: byHalfYear(all),
      trials,
    },
    period: { from: first, to: last, oosFrom: cut },
    rules,
    all: summarizeTrades(all), inSample: summarizeTrades(inS), outOfSample: oos,
    byGrade: Object.fromEntries(["A", "B", "C"].map((g) => [g, summarizeTrades(all.filter((x) => x.grade === g))])),
    byGradeOutOfSample: Object.fromEntries(["A", "B", "C"].map((g) => [g, summarizeTrades(outS.filter((x) => x.grade === g))])),
    byMarket: { up: summarizeTrades(all.filter((x) => x.features?.market >= 0.5)), down: summarizeTrades(all.filter((x) => !(x.features?.market >= 0.5))) },
    baseline: { holdBars: 10, all: baseMean(baseline), outOfSample: baseOos },
    ...extra,
  };
}

export function smaOf(a, n) {
  const out = new Float64Array(a.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
