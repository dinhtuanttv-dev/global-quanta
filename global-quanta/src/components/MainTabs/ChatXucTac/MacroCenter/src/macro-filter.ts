/**
 * macro-filter.ts — pure view-model logic for the macro matrix (no React, fully unit-tested).
 * The server computes everything once; filtering here is instant and never re-estimates.
 */
export interface CellLike {
  factor: string;
  target: string;
  lag: number;
  beta: number;
  t: number;
  p: number;
  q: number;
  betaStd: number;
  nobs: number;
  arLags?: number;
  direction: '+' | '-' | '0';
  significant: boolean;
}
export interface StabilityLike {
  shareSameSign: number;
  signFlips: number;
  windows: number;
  stable: boolean;
}
export interface ImpactPayloadLike {
  cells: CellLike[];
  best: CellLike[];
  stability: Record<string, StabilityLike>;
  factors: string[];
  targets: string[];
  diagnostics: { id: string; transform: string }[];
}

export interface FilterState {
  targets: string[];
  factors: string[];
  direction: 'all' | '+' | '-';
  significance: 'all' | 'significant' | 'stable';
  lag: 'best' | number;
  minAbsT: number;
}

export const DEFAULT_FILTER: FilterState = { targets: [], factors: [], direction: 'all', significance: 'all', lag: 'best', minAbsT: 0 };

export type CellStatus = 'stable' | 'unstable' | 'significant' | 'insignificant';

export interface MatrixCell extends CellLike {
  status: CellStatus;
  intensity: number;
  stability?: StabilityLike;
}

export interface MatrixView {
  factors: string[];
  targets: string[];
  cells: Record<string, MatrixCell>;
  counts: Record<CellStatus, number>;
  hiddenByFilter: number;
}

export const cellKey = (factor: string, target: string): string => `${factor}|${target}`;

/** Empty selection means "all". */
export function buildMatrixView(payload: ImpactPayloadLike, filter: FilterState): MatrixView {
  const wantT = filter.targets.length ? filter.targets : payload.targets;
  const wantF = filter.factors.length ? filter.factors : payload.factors;
  const source = filter.lag === 'best' ? payload.best : payload.cells.filter((c) => c.lag === filter.lag);
  const cells: Record<string, MatrixCell> = {};
  const counts: Record<CellStatus, number> = { stable: 0, unstable: 0, significant: 0, insignificant: 0 };
  let hidden = 0;
  for (const c of source) {
    if (!wantT.includes(c.target) || !wantF.includes(c.factor)) continue;
    const st = payload.stability[cellKey(c.factor, c.target)];
    const status: CellStatus = !c.significant ? 'insignificant' : st ? (st.stable ? 'stable' : 'unstable') : 'significant';
    const visible =
      (filter.direction === 'all' || c.direction === filter.direction) &&
      (filter.significance === 'all' || (filter.significance === 'significant' ? c.significant : status === 'stable')) &&
      Math.abs(c.t) >= filter.minAbsT;
    if (!visible) {
      hidden++;
      continue;
    }
    counts[status]++;
    const base = Math.min(Math.abs(c.t) / 6, 1);
    cells[cellKey(c.factor, c.target)] = { ...c, status, stability: st, intensity: c.significant ? Math.max(base, 0.25) : base * 0.35 };
  }
  const strength = (f: string) => Math.max(0, ...wantT.map((t) => Math.abs(cells[cellKey(f, t)]?.t ?? 0)));
  const factors = [...wantF].filter((f) => wantT.some((t) => cells[cellKey(f, t)])).sort((a, b) => strength(b) - strength(a));
  const targets = wantT.filter((t) => factors.some((f) => cells[cellKey(f, t)]));
  return { factors, targets, cells, counts, hiddenByFilter: hidden };
}

export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtQ(q: number): string {
  if (!Number.isFinite(q)) return '–';
  if (q < 0.001) return '< 0,001';
  return fmtNum(q, 3);
}

const UNIT_PHRASE: Record<string, string> = { logdiff: 'tăng 1%', diff: 'tăng 1 điểm', level: 'tăng 1 đơn vị', diff2: 'tăng tốc 1 đơn vị', yoy: 'tăng 1% so cùng kỳ' };

/** One plain-language sentence for a cell, with its honest caveats. */
export function describeCell(c: MatrixCell, names: { factor: string; target: string }, transform: string): string {
  const unit = UNIT_PHRASE[transform] ?? 'tăng 1 đơn vị';
  const dir = c.beta >= 0 ? 'tăng' : 'giảm';
  const when = c.lag === 0 ? 'cùng tháng' : `sau ${c.lag} tháng`;
  const base = `Khi ${names.factor} ${unit}, ${names.target} thường ${dir} khoảng ${fmtNum(Math.abs(c.beta), 2)} điểm phần trăm ${when} (t = ${fmtNum(c.t, 1)}, q ${c.q < 0.001 ? '< 0,001' : '= ' + fmtNum(c.q, 3)}).`;
  if (!c.significant) return `${base} Chưa đủ bằng chứng sau hiệu chỉnh kiểm định bội; không nên coi đây là tác động thực.`;
  if (c.status === 'unstable') return `${base} Có ý nghĩa thống kê nhưng KHÔNG ổn định theo thời gian (đổi dấu ${c.stability?.signFlips ?? 0} lần); dùng thận trọng.`;
  if (c.status === 'stable') return `${base} Có ý nghĩa thống kê và ổn định theo cửa sổ trượt.`;
  return `${base} Có ý nghĩa thống kê; chưa kiểm tra độ ổn định cho độ trễ này.`;
}
