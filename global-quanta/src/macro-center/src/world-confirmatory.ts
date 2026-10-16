/**
 * world-confirmatory.ts — cổng XÁC NHẬN đặt trước cho Kết nối thế giới (docs/WORLD-W3-prereg.md, 2026-10-16).
 *
 * Khác ma trận thăm dò (13 × 10 cặp, chọn trễ tốt nhất 0–6, BY trên ~900 ô): ở đây chỉ 12 cặp kinh tế cố định, trễ cố định 1 tháng,
 * p một phía theo chiều kỳ vọng, BY trên đúng 12 cặp. Chỉ cặp đạt "bậc xác nhận A" mới được đưa vào tín hiệu ngành.
 */
import { backtestMacroScore } from './macro-backtest';
import { adjustPValues, buildDesign, olsFit, rollingBeta, studentTCdf, summarizeStability, type OlsResult } from './quant-macro';

export interface PreregPair { id: string; factor: string; sector: string; sign: 1 | -1; mechanismVi: string }

export const WORLD_PREREG_VERSION = 'W3-v1 (2026-10-16)';
export const WORLD_PREREG_LAG = 1;
export const WORLD_PREREG_PAIRS: PreregPair[] = [
  { id: 'P1', factor: 'OIL', sector: 'S_OIL', sign: 1, mechanismVi: 'Giá dầu → doanh thu dầu khí' },
  { id: 'P2', factor: 'STEEL', sector: 'S_STEEL', sign: 1, mechanismVi: 'Giá thép HRC → giá bán thép' },
  { id: 'P3', factor: 'FED', sector: 'S_RE', sign: -1, mechanismVi: 'Lãi suất Fed → chi phí vốn BĐS' },
  { id: 'P4', factor: 'FED', sector: 'S_BANK', sign: -1, mechanismVi: 'Lãi suất Fed → dòng vốn / áp lực lãi suất VN' },
  { id: 'P5', factor: 'DXY', sector: 'S_SEC', sign: -1, mechanismVi: 'USD mạnh → khối ngoại rút, thanh khoản giảm' },
  { id: 'P6', factor: 'VIX', sector: 'S_SEC', sign: -1, mechanismVi: 'Ngại rủi ro toàn cầu → thanh khoản / môi giới' },
  { id: 'P7', factor: 'SEMI', sector: 'S_TECH', sign: 1, mechanismVi: 'Chu kỳ bán dẫn → công nghệ' },
  { id: 'P8', factor: 'CNY', sector: 'S_STEEL', sign: -1, mechanismVi: 'CNY yếu → thép Trung Quốc rẻ, cạnh tranh nhập khẩu' },
  { id: 'P9', factor: 'TARIFF', sector: 'S_TEXTILE', sign: -1, mechanismVi: 'Bất định thuế quan → dệt may xuất khẩu' },
  { id: 'P10', factor: 'TARIFF', sector: 'S_SEAFOOD', sign: -1, mechanismVi: 'Bất định thuế quan → thuỷ sản xuất khẩu' },
  { id: 'P11', factor: 'PMI_US', sector: 'S_TEXTILE', sign: 1, mechanismVi: 'Cầu sản xuất Mỹ (proxy Philly Fed) → dệt may' },
  { id: 'P12', factor: 'PMI_US', sector: 'S_PORT', sign: 1, mechanismVi: 'Cầu sản xuất Mỹ (proxy Philly Fed) → cảng / logistics' },
];

export interface ConfirmatoryRow extends PreregPair {
  available: boolean;
  beta: number | null; t: number | null; pOneSided: number; q: number; nobs: number | null; arLags: number | null;
  signOk: boolean | null; stable: boolean | null; shareSameSign: number | null; oosPass: boolean | null; oosIc: number | null; oosHitRate: number | null;
  oosReasons: string[]; confirmed: boolean; reasonVi: string;
}

const isFin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Hồi quy 1 yếu tố, trễ cố định, AR 0–2 theo BIC trên mẫu chung — cùng cách của estimateImpactMatrix. */
function fitPair(y: number[], x: number[], lag: number): { res: OlsResult; arLags: number; design: ReturnType<typeof buildDesign> } | null {
  const common = Math.max(lag, 2);
  let best = 0, bestBic = Infinity;
  for (let p = 0; p <= 2; p++) {
    const d = buildDesign({ y, xs: [x], lag, arLags: p, start: common });
    if (d.X.length < d.names.length + 12) continue;
    try { const r = olsFit(d.X, d.y, { hac: false }); if (r.bic < bestBic) { bestBic = r.bic; best = p; } } catch { /* singular */ }
  }
  const design = buildDesign({ y, xs: [x], lag, arLags: best });
  if (design.X.length < design.names.length + 12) return null;
  try { return { res: olsFit(design.X, design.y, {}), arLags: best, design }; } catch { return null; }
}

export function runConfirmatory(prep: { factors: Record<string, number[]>; targets: Record<string, number[]> }, opts: { pairs?: PreregPair[]; lag?: number; alpha?: number; window?: number; B?: number; seed?: number } = {}): { version: string; lag: number; family: number; rows: ConfirmatoryRow[]; confirmed: number } {
  const pairs = opts.pairs ?? WORLD_PREREG_PAIRS;
  const lag = opts.lag ?? WORLD_PREREG_LAG, alpha = opts.alpha ?? 0.05;
  const fits = pairs.map((p) => {
    const y = prep.targets[p.sector], x = prep.factors[p.factor];
    if (!y || !x) return null;
    return fitPair(y, x, lag);
  });
  const pOne = fits.map((f, i) => {
    if (!f) return 1;
    const t = f.res.tHac[1], df = Math.max(1, f.res.n - f.res.k);
    return isFin(t) ? 1 - studentTCdf(pairs[i].sign * t, df) : 1;
  });
  const q = adjustPValues(pOne, 'by');
  const rows = pairs.map((p, i): ConfirmatoryRow => {
    const f = fits[i];
    if (!f) return { ...p, available: false, beta: null, t: null, pOneSided: 1, q: q[i], nobs: null, arLags: null, signOk: null, stable: null, shareSameSign: null, oosPass: null, oosIc: null, oosHitRate: null, oosReasons: [], confirmed: false, reasonVi: 'Thiếu dữ liệu (< 60 tháng hoặc không có nguồn) — tính p = 1, vẫn trong họ 12 cặp.' };
    const beta = f.res.beta[1], t = f.res.tHac[1];
    const signOk = Math.sign(beta) === p.sign;
    let stab = null as ReturnType<typeof summarizeStability> | null;
    try { stab = summarizeStability(rollingBeta(f.design, 1, opts.window ?? 48), beta); } catch { stab = null; }
    const bt = backtestMacroScore({ y: prep.targets[p.sector], factors: { [p.factor]: prep.factors[p.factor] }, lag, B: opts.B ?? 499, seed: opts.seed ?? 3 });
    const oosPass = bt ? bt.gate.pass : false;
    const confirmed = q[i] < alpha && signOk && stab?.stable === true && oosPass;
    const gaps: string[] = [];
    if (!(q[i] < alpha)) gaps.push(`q = ${q[i].toFixed(3)} ≥ ${alpha}`);
    if (!signOk) gaps.push('ngược chiều kỳ vọng');
    if (stab?.stable !== true) gaps.push('không ổn định theo thời gian');
    if (!oosPass) gaps.push('không đạt ngoài mẫu');
    return {
      ...p, available: true, beta, t, pOneSided: pOne[i], q: q[i], nobs: f.res.n, arLags: f.arLags, signOk,
      stable: stab ? stab.stable : null, shareSameSign: stab ? stab.shareSameSign : null,
      oosPass, oosIc: bt ? bt.ic : null, oosHitRate: bt ? bt.hitRate : null, oosReasons: bt ? bt.gate.reasons : ['Không đủ điểm ngoài mẫu.'],
      confirmed, reasonVi: confirmed ? 'Đạt bậc xác nhận A: q < 0,05, đúng chiều, ổn định và đạt ngoài mẫu.' : `Chưa xác nhận: ${gaps.join('; ')}.`,
    };
  });
  return { version: WORLD_PREREG_VERSION, lag, family: pairs.length, rows, confirmed: rows.filter((r) => r.confirmed).length };
}
