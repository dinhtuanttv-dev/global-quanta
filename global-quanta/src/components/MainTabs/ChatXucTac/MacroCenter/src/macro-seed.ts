/**
 * macro-seed.ts — SYNTHETIC demo data (NOT real Vietnamese statistics).
 * Lets the API, UI and tests run end-to-end before the real ETL is connected. Effects are planted
 * with known coefficients so the pipeline can be checked against ground truth.
 */
import { mulberry32, randn } from './quant-macro';
import { InMemoryVintageStore, VN_CATALOG, catalogById, addMonths, estimateAsOf, type Observation } from './macro-data';

export const SYNTHETIC_NOTICE = 'DỮ LIỆU MÔ PHỎNG — không phải số liệu thực của GSO/NHNN/HOSE.';

/**
 * True planted effects per unit of the stationary factor transform, on monthly % index return.
 * The market reacts ONE month after a figure is published: y_t depends on x̃_{t-1-pubLag}. After
 * the engine's publication-lag shift this appears at lag 1, which also makes MacroScore (lag 1)
 * genuinely predictive in this synthetic world.
 */
export const TRUE_EFFECTS: Record<string, Record<string, number>> = {
  VNINDEX: { CPI: -3.0, IR: -2.0, M2: 1.2, PMI: 0.75, DXY: -0.6 },
  VN30: { CPI: -2.3, IR: -1.6, M2: 0.9, PMI: 0.75, DXY: -0.45 },
  VNMIDCAP: { CPI: -3.8, IR: -2.2, M2: 1.35, PMI: 0.75, DXY: -0.6 },
  VNSMALLCAP: { CPI: -5.3, IR: -2.8, M2: 1.8, PMI: 0.6, DXY: -0.75 },
  VN100: { CPI: -2.85, IR: -1.9, M2: 1.1, PMI: 0.75, DXY: -0.6 },
  VNALLSHARE: { CPI: -3.0, IR: -2.0, M2: 1.2, PMI: 0.75, DXY: -0.6 },
};

export function makeSyntheticStore(seed = 2024, start = '2008-01', months = 222): InMemoryVintageStore {
  const rng = mulberry32(seed);
  const n = months;
  const ar = (phi: number, mu: number, sd: number, x0: number, floor = -Infinity) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(Math.max(floor, mu + phi * (y[i - 1] - mu) + sd * randn(rng)));
    return y;
  };
  const level = (g: number, sd: number, x0: number, extra?: (i: number) => number) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(y[i - 1] * Math.exp((g + sd * randn(rng) + (extra ? extra(i) : 0)) / 100));
    return y;
  };
  const cpi = ar(0.95, 5, 0.35, 5, -1);
  const ir = ar(0.93, 5, 0.6, 5, 0.2);
  const m2 = level(1.2, 1.0, 4_000_000);
  const credit = level(1.1, 0.5, 3_000_000);
  const ex = level(0.15, 0.25, 16_000);
  const fdi = Array.from({ length: n }, (_, i) => 1500 * Math.exp(0.004 * i + 0.25 * randn(rng)));
  const exportV = level(0.8, 3, 4000);
  const io = level(0.6, 2, 100);
  const pmi = ar(0.7, 51, 1.2, 51);
  const dxy = level(0, 1.5, 85);
  const fed = ar(0.985, 2, 0.12, 2, 0);
  const oil = level(0, 8, 80);
  const dd = (x: number[]) => x.map((v, i) => (i === 0 ? 0 : v - x[i - 1]));
  const ld = (x: number[]) => x.map((v, i) => (i === 0 ? 0 : 100 * Math.log(v / x[i - 1])));
  const stat: Record<string, number[]> = { CPI: dd(cpi), IR: dd(ir), M2: ld(m2), PMI: pmi.map((v) => v - 51), DXY: ld(dxy) };
  const pub = Object.fromEntries(Object.entries(catalogById()).map(([id, m]) => [id, m.pubLagMonths]));
  const market = Array.from({ length: n }, () => 2.4 * randn(rng));
  const raw: Record<string, number[]> = { CPI: cpi, IR: ir, M2: m2, CREDIT: credit, EX: ex, FDI: fdi, EXPORT: exportV, IO: io, PMI: pmi, DXY: dxy, FED: fed, OIL: oil };
  for (const [id, eff] of Object.entries(TRUE_EFFECTS)) {
    const ret = new Array<number>(n).fill(0);
    for (let t = 1; t < n; t++) {
      let r = 0.5 + market[t] + 1.2 * randn(rng);
      for (const [f, b] of Object.entries(eff)) {
        const src = t - 1 - (pub[f] ?? 0);
        if (src >= 0) r += b * stat[f][src];
      }
      ret[t] = r;
    }
    const idx = [1000];
    for (let t = 1; t < n; t++) idx.push(idx[t - 1] * Math.exp(ret[t] / 100));
    raw[id] = idx;
  }
  const store = new InMemoryVintageStore();
  const obs: Observation[] = [];
  for (const meta of VN_CATALOG) {
    const v = raw[meta.id];
    if (!v) continue;
    for (let i = 0; i < n; i++) {
      const period = addMonths(start, i);
      obs.push({ seriesId: meta.id, period, value: v[i], asOf: estimateAsOf(period, meta.pubLagMonths, meta.typicalReleaseDay) });
    }
  }
  store.upsert(obs);
  return store;
}
