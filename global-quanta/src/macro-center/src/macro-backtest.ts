/**
 * macro-backtest.ts — walk-forward evaluation of MacroScore and the gate that decides whether the
 * signal may feed the decision engine.
 *
 * Everything is out-of-sample: the forecast for month t uses only information available at the
 * origin t-lag (see macroScoreSeries). The gate refuses a signal that does not beat a naive
 * previous-return baseline, so a decorative or overfit score never reaches the live engine.
 */
import { macroScoreSeries, mean, mulberry32, std } from './quant-macro';

function ranks(a: number[]): number[] {
  const idx = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Array<number>(a.length);
  for (let k = 0; k < idx.length; ) {
    let m = k;
    while (m + 1 < idx.length && a[idx[m + 1]] === a[idx[k]]) m++;
    const avg = (k + m) / 2 + 1;
    for (let q = k; q <= m; q++) r[idx[q]] = avg;
    k = m + 1;
  }
  return r;
}

/** Spearman rank correlation (average ranks for ties). */
export function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return NaN;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < ra.length; i++) {
    sab += (ra[i] - ma) * (rb[i] - mb);
    saa += (ra[i] - ma) ** 2;
    sbb += (rb[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

export interface PerfStats {
  annReturn: number;
  annVol: number;
  sharpe: number;
  maxDrawdown: number;
}

function perf(monthly: number[]): PerfStats {
  const m = mean(monthly);
  const s = std(monthly);
  let eq = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of monthly) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }
  return { annReturn: m * 12, annVol: s * Math.sqrt(12), sharpe: s > 0 ? (m / s) * Math.sqrt(12) : 0, maxDrawdown: mdd };
}

export interface BacktestResult {
  n: number;
  ic: number;
  icCI: [number, number];
  icP: number;
  hitRate: number;
  baselineIc: number;
  strategy: PerfStats & { turnover: number };
  buyHold: PerfStats;
  gate: { pass: boolean; reasons: string[] };
}

export function backtestMacroScore(args: {
  /** stationary monthly % return of the target */
  y: number[];
  factors: Record<string, number[]>;
  lag?: number;
  arLags?: number;
  minTrain?: number;
  step?: number;
  costBps?: number;
  B?: number;
  seed?: number;
}): BacktestResult | null {
  const lag = args.lag ?? 1;
  const pts = macroScoreSeries({ y: args.y, factors: args.factors, lag, arLags: args.arLags, minTrain: args.minTrain ?? 60, step: args.step ?? 3 });
  if (pts.length < 30) return null;
  const score = pts.map((p) => p.score);
  const real = pts.map((p) => args.y[p.row]);
  const naive = pts.map((p) => args.y[p.origin]);
  const ic = spearman(score, real);
  const baselineIc = spearman(naive, real);

  const rng = mulberry32(args.seed ?? 7);
  const B = args.B ?? 499;
  const n = pts.length;
  const pNew = 1 / 6;
  const boots: number[] = [];
  for (let b = 0; b < B; b++) {
    const idx: number[] = [];
    let cur = Math.floor(rng() * n);
    for (let i = 0; i < n; i++) {
      if (i > 0) cur = rng() < pNew ? Math.floor(rng() * n) : (cur + 1) % n;
      idx.push(cur);
    }
    const v = spearman(idx.map((i) => score[i]), idx.map((i) => real[i]));
    if (Number.isFinite(v)) boots.push(v);
  }
  boots.sort((a, c) => a - c);
  const icCI: [number, number] = [boots[Math.floor(0.05 * (boots.length - 1))], boots[Math.ceil(0.95 * (boots.length - 1))]];
  // one-sided p for IC ≤ 0, using the bootstrap distribution re-centred on zero
  const centred = boots.map((v) => v - ic);
  const icP = (centred.filter((v) => v >= ic).length + 1) / (centred.length + 1);

  const hits = pts.filter((p) => Math.sign(p.score) === Math.sign(args.y[p.row])).length / n;
  const cost = (args.costBps ?? 10) / 10_000;
  let prev = 0;
  let turn = 0;
  const strat = pts.map((p) => {
    const pos = p.score > 0 ? 1 : 0;
    const r = (pos * args.y[p.row]) / 100 - cost * Math.abs(pos - prev);
    turn += Math.abs(pos - prev);
    prev = pos;
    return r;
  });
  const hold = pts.map((p) => args.y[p.row] / 100);

  const reasons: string[] = [];
  if (!(ic >= 0.05)) reasons.push(`IC ngoài mẫu = ${ic.toFixed(3)} < 0,05.`);
  if (!(icP <= 0.1)) reasons.push(`IC không có ý nghĩa thống kê (p = ${icP.toFixed(3)} > 0,10).`);
  if (!(ic > baselineIc)) reasons.push(`Không thắng mô hình ngây thơ (IC ${ic.toFixed(3)} so với ${baselineIc.toFixed(3)}).`);
  if (!(hits > 0.5)) reasons.push(`Tỷ lệ đúng hướng ${(hits * 100).toFixed(1)}% không vượt 50%.`);
  return {
    n, ic, icCI, icP, hitRate: hits, baselineIc,
    strategy: { ...perf(strat), turnover: turn / n },
    buyHold: perf(hold),
    gate: { pass: reasons.length === 0, reasons },
  };
}
