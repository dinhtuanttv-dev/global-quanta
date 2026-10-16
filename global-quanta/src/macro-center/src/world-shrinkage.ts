/**
 * world-shrinkage.ts — hierarchical empirical-Bayes shrinkage of stock betas toward their sector.
 *
 * Per-stock betas are estimated on short, noisy samples. Treating them as draws around a sector
 * mean (random-effects model  b_i ~ N(β_i, v_i),  β_i ~ N(μ, τ²)) gives the posterior mean
 *   β̂_i = μ + B_i (b_i − μ),   B_i = τ² / (τ² + v_i)
 * so noisy estimates are pulled toward the sector and precise ones are kept. τ² uses the
 * DerSimonian-Laird moment estimator. A second level shrinks sector means toward the market.
 */
export interface BetaEstimate {
  id: string;
  beta: number;
  /** standard error of beta */
  se: number;
}

export interface ShrunkBeta extends BetaEstimate {
  shrunk: number;
  /** weight on the stock's own estimate, B_i ∈ [0, 1] */
  weight: number;
  postSd: number;
}

export interface GroupShrink {
  mu: number;
  muSe: number;
  tau2: number;
  items: ShrunkBeta[];
}

/** DerSimonian-Laird between-unit variance. */
export function dlTau2(items: BetaEstimate[]): number {
  const k = items.length;
  if (k < 2) return 0;
  const w = items.map((i) => 1 / (i.se * i.se));
  const sw = w.reduce((a, b) => a + b, 0);
  const muFe = items.reduce((s, i, j) => s + w[j] * i.beta, 0) / sw;
  const Q = items.reduce((s, i, j) => s + w[j] * (i.beta - muFe) ** 2, 0);
  const C = sw - w.reduce((s, x) => s + x * x, 0) / sw;
  return C > 0 ? Math.max(0, (Q - (k - 1)) / C) : 0;
}

export function shrinkGroup(items: BetaEstimate[], opts: { tau2?: number; priorMu?: number } = {}): GroupShrink {
  if (items.length === 0) return { mu: opts.priorMu ?? 0, muSe: Infinity, tau2: opts.tau2 ?? 0, items: [] };
  const tau2 = opts.tau2 ?? dlTau2(items);
  const w = items.map((i) => 1 / (tau2 + i.se * i.se));
  const sw = w.reduce((a, b) => a + b, 0);
  const mu = opts.priorMu ?? items.reduce((s, i, j) => s + w[j] * i.beta, 0) / sw;
  const muVar = 1 / sw;
  return {
    mu, muSe: Math.sqrt(muVar), tau2,
    items: items.map((i) => {
      const v = i.se * i.se;
      const B = tau2 / (tau2 + v);
      return { ...i, shrunk: mu + B * (i.beta - mu), weight: B, postSd: Math.sqrt(B * v + (1 - B) ** 2 * muVar) };
    }),
  };
}

export interface HierarchicalResult {
  globalMu: number;
  globalTau2: number;
  groups: Record<string, GroupShrink & { priorMu: number }>;
}

/**
 * Two levels: stocks → sector → market. Sectors with fewer than 3 stocks cannot identify τ², so they
 * borrow the average τ² of the other sectors.
 */
export function hierarchicalShrink(groups: Record<string, BetaEstimate[]>): HierarchicalResult {
  const first: Record<string, GroupShrink> = {};
  for (const [g, items] of Object.entries(groups)) first[g] = shrinkGroup(items);
  const identified = Object.entries(groups).filter(([, v]) => v.length >= 3).map(([g]) => first[g].tau2);
  const pooled = identified.length ? identified.reduce((a, b) => a + b, 0) / identified.length : 0;

  const sectorMeans: BetaEstimate[] = Object.entries(first).filter(([, r]) => r.items.length > 0).map(([g, r]) => ({ id: g, beta: r.mu, se: Math.max(r.muSe, 1e-6) }));
  const top = shrinkGroup(sectorMeans);
  const priorOf = new Map(top.items.map((i) => [i.id, i.shrunk]));

  const out: HierarchicalResult['groups'] = {};
  for (const [g, items] of Object.entries(groups)) {
    const tau2 = items.length >= 3 ? first[g].tau2 : pooled;
    const priorMu = priorOf.get(g) ?? top.mu;
    out[g] = { ...shrinkGroup(items, { tau2, priorMu }), priorMu };
  }
  return { globalMu: top.mu, globalTau2: top.tau2, groups: out };
}
