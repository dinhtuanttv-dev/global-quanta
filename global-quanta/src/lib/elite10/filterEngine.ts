// BỘ LỌC ELITE (30/10/2026) — bản TypeScript, CÙNG ngữ nghĩa với Gateway (backend/src/market/elite/filterEngine.js); test khớp chung tệp
// __fixtures__/elite-filter-parity.json. Thêm phần chỉ giao diện cần: đếm tức thì bằng bitset, biên Pareto, mã tương tự.
export type Op = ">=" | "<=" | "==" | "in" | "p>=";
export interface Cond { sig: string; op: Op; val: number | number[]; neutral?: boolean }
export interface EliteFilter { v: 1; name?: string; conds: Cond[]; not?: Cond[]; mode: "all" | "k"; k?: number; eligibleOnly?: boolean }
export interface FRow { ticker: string; icb?: { l2?: string } | null; sector?: string | null; values: Record<string, number | null> }
export interface FScore { eligible: boolean; advBn?: number | null; close?: number | null }
export interface FCtx { rows: FRow[]; scores: Map<string, FScore>; buyZone: Set<string> }

const sectorOf = (r: FRow) => r.icb?.l2 ?? r.sector ?? null;

/** Phân vị hạng giữa (0–100); `byGroup` = xếp trong cùng ngành ICB cấp 2. */
export function percentiles(rows: FRow[], sig: string, byGroup = false): Map<string, number> {
  const groups = new Map<string, [string, number][]>();
  for (const r of rows) {
    const v = r.values?.[sig];
    if (v == null || !Number.isFinite(v)) continue;
    const g = byGroup ? sectorOf(r) ?? "?" : "*";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push([r.ticker, v]);
  }
  const out = new Map<string, number>();
  for (const list of groups.values()) {
    const vals = list.map(([, v]) => v);
    for (const [t, v] of list) {
      let below = 0, equal = 0;
      for (const x of vals) { if (x < v) below++; else if (x === v) equal++; }
      out.set(t, ((below + equal / 2) / vals.length) * 100);
    }
  }
  return out;
}

/** Bộ đánh giá một điều kiện (có đệm phân vị) — dùng chung cho lọc và đếm. */
export function condTester(ctx: FCtx) {
  const cache = new Map<string, Map<string, number>>();
  const pct = (sig: string, neutral?: boolean) => {
    const k = `${sig}|${neutral ? 1 : 0}`;
    if (!cache.has(k)) cache.set(k, percentiles(ctx.rows, sig, Boolean(neutral)));
    return cache.get(k)!;
  };
  const valueOf = (r: FRow, sig: string): number | null => {
    if (sig === "_adv") return ctx.scores.get(r.ticker)?.advBn ?? null;
    if (sig === "_price") return ctx.scores.get(r.ticker)?.close ?? null;
    if (sig === "_buyzone") return ctx.buyZone.has(r.ticker) ? 1 : 0;
    const v = r.values?.[sig];
    return v == null || !Number.isFinite(v) ? null : v;
  };
  return (c: Cond, r: FRow): boolean => {
    if (c.op === "p>=") { const p = pct(c.sig, c.neutral).get(r.ticker); return p != null && p >= (c.val as number); }
    const v = valueOf(r, c.sig);
    if (v == null) return false;
    if (c.op === ">=") return v >= (c.val as number);
    if (c.op === "<=") return v <= (c.val as number);
    if (c.op === "==") return v === c.val;
    if (c.op === "in") return Array.isArray(c.val) && c.val.includes(v);
    return false;
  };
}

export function evaluateFilter(filter: EliteFilter, ctx: FCtx): { pass: string[]; perCond: number[]; hits: Map<string, boolean[]> } {
  const test = condTester(ctx);
  const conds = filter.conds ?? [], nots = filter.not ?? [];
  const eligibleOnly = filter.eligibleOnly !== false;
  const need = filter.mode === "k" ? Math.max(1, Math.min(conds.length, Math.round(filter.k ?? 1))) : conds.length;
  const perCond = conds.map(() => 0), hits = new Map<string, boolean[]>(), pass: string[] = [];
  for (const r of ctx.rows) {
    if (eligibleOnly && !ctx.scores.get(r.ticker)?.eligible) continue;
    const h = conds.map((c) => test(c, r));
    h.forEach((ok, i) => { if (ok) perCond[i]++; });
    hits.set(r.ticker, h);
    if (h.filter(Boolean).length >= need && !nots.some((c) => test(c, r))) pass.push(r.ticker);
  }
  return { pass, perCond, hits };
}

// ---------- Bitset: đếm tức thì "nếu bật thêm điều kiện này còn bao nhiêu mã" ----------
export class Bits {
  w: Uint32Array;
  constructor(public n: number) { this.w = new Uint32Array(Math.ceil(n / 32)); }
  set(i: number) { this.w[i >> 5] |= 1 << (i & 31); }
  has(i: number) { return (this.w[i >> 5] & (1 << (i & 31))) !== 0; }
  and(o: Bits) { const r = new Bits(this.n); for (let i = 0; i < this.w.length; i++) r.w[i] = this.w[i] & o.w[i]; return r; }
  andNot(o: Bits) { const r = new Bits(this.n); for (let i = 0; i < this.w.length; i++) r.w[i] = this.w[i] & ~o.w[i]; return r; }
  count() { let c = 0; for (let x of this.w) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); c += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; } return c; }
}
/** Bitset của một điều kiện trên thứ tự `rows`. */
export function condBits(c: Cond, ctx: FCtx, test = condTester(ctx)): Bits {
  const b = new Bits(ctx.rows.length);
  ctx.rows.forEach((r, i) => { if (test(c, r)) b.set(i); });
  return b;
}

/** Biên Pareto: mã không bị mã nào khác trội hơn (≥ ở mọi tiêu chí, > ở ít nhất một). Giá trị thiếu = kém nhất. */
export function paretoFront(tickers: string[], vec: (t: string) => (number | null)[]): Set<string> {
  const V = tickers.map((t) => vec(t).map((x) => (x == null || !Number.isFinite(x) ? -Infinity : x)));
  const front = new Set<string>();
  for (let i = 0; i < V.length; i++) {
    let dominated = false;
    for (let j = 0; j < V.length && !dominated; j++) {
      if (i === j) continue;
      let ge = true, gt = false;
      for (let d = 0; d < V[i].length; d++) { if (V[j][d] < V[i][d]) { ge = false; break; } if (V[j][d] > V[i][d]) gt = true; }
      dominated = ge && gt;
    }
    if (!dominated) front.add(tickers[i]);
  }
  return front;
}

/** Độ tương tự cosine giữa hai vector phân vị (đã trừ 50 để tâm ở 0); bỏ chiều thiếu ở một trong hai. */
export function cosine(a: (number | null)[], b: (number | null)[]): number | null {
  let dot = 0, na = 0, nb = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] == null || b[i] == null) continue;
    const x = a[i]! - 50, y = b[i]! - 50;
    dot += x * y; na += x * x; nb += y * y; n++;
  }
  return n >= 3 && na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : null;
}

/** Mã hoá / giải mã bộ lọc vào đường link chia sẻ (base64url của JSON). */
export function encodeFilter(f: EliteFilter): string {
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(f))));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeFilter(s: string): EliteFilter | null {
  try {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    const f = JSON.parse(decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4)))));
    return f && Array.isArray(f.conds) ? { v: 1, mode: f.mode === "k" ? "k" : "all", conds: f.conds, not: f.not ?? [], k: f.k, eligibleOnly: f.eligibleOnly !== false, name: f.name } : null;
  } catch { return null; }
}
