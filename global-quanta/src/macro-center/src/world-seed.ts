/**
 * world-seed.ts — SYNTHETIC world for development and tests (not real data).
 * Effects are planted with known sizes so every statistical module can be checked against truth.
 */
import { mulberry32, randn } from './quant-macro';
import { InMemoryVintageStore, VN_CATALOG, addMonths, catalogById, estimateAsOf, type Observation, type SeriesMeta } from './macro-data';
import { SECTOR_TARGETS, VN_SECTORS, WORLD_EXTRA_FACTORS, WORLD_MARKETS, type StockExposure, type WorldEvent } from './world-types';

/** planted event reactions are scaled so single-event tests have usable power at daily sector noise */
const EVENT_SCALE = 1.9;

export const WORLD_SYNTHETIC_NOTICE = 'DỮ LIỆU MÔ PHỎNG — thế giới, ngành và cổ phiếu trong bản này không phải số liệu thật.';

export interface StockBetaEstimate {
  code: string;
  sectorId: string;
  beta: number;
  se: number;
}

export interface WorldData {
  tradingDays: string[];
  markets: Record<string, number[]>;
  sectors: Record<string, number[]>;
  events: WorldEvent[];
  /** abnormal return planted on the session of each event, per sector (percent) */
  plantedEventEffects: Record<string, Record<string, number>>;
  exposures: StockExposure[];
  /** keyed by factor id */
  stockBetas: Record<string, StockBetaEstimate[]>;
}

/** Planted monthly effects per unit of each factor's stationary transform. */
export const TRUE_WORLD_EFFECTS: Record<string, Record<string, number>> = {
  S_PORT: { CONTAINER: 0.35, PMI_CN: 1.0 },
  S_SEAFOOD: { TARIFF: -0.5, CONTAINER: -0.15 },
  S_TEXTILE: { TARIFF: -0.5 },
  S_STEEL: { STEEL: 0.45, PMI_CN: 1.2, TARIFF: -0.2 },
  S_OIL: { OIL: 0.35 },
  S_BANK: { FED: -4, VIX: -0.25 },
  S_SEC: { VIX: -0.4, EM_FLOWS: 0.6 },
  S_RE: { FED: -5 },
  S_TECH: { SEMI: 0.4, VIX: -0.3 },
  S_POWER: {},
};

export const WORLD_CATALOG: SeriesMeta[] = [...VN_CATALOG, ...WORLD_EXTRA_FACTORS, ...SECTOR_TARGETS];

function weekdays(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function makeSyntheticWorld(seed = 11): { data: WorldData; store: InMemoryVintageStore; catalog: SeriesMeta[] } {
  const rng = mulberry32(seed);
  const N = 1600;
  const tradingDays = weekdays('2020-01-01', N);

  // ── daily markets: VAR(1) with the US transmitting to everybody (it closes before Asia opens) ──
  const ids = WORLD_MARKETS.map((m) => m.id);
  const K = ids.length;
  const A = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  for (let i = 0; i < K; i++) A[i][i] = 0.05;
  const fromUs = [0.02, 0.1, 0.25, 0.2, 0.15, 0.18];
  fromUs.forEach((v, i) => (A[i][0] = i === 0 ? 0.05 : v));
  A[5][1] = 0.08;
  A[5][3] = 0.05;
  A[5][4] = 0.04;
  const sd = [1.0, 1.2, 1.1, 1.3, 1.1, 1.2];
  const R: number[][] = [new Array<number>(K).fill(0)];
  for (let t = 1; t < N; t++) {
    const common = randn(rng);
    R.push(R[t - 1].map((_, i) => A[i].reduce((s, a, j) => s + a * R[t - 1][j], 0) + sd[i] * (0.92 * randn(rng) + 0.39 * common)));
  }
  const markets: Record<string, number[]> = {};
  ids.forEach((id, i) => (markets[id] = R.map((r) => r[i])));

  // ── events with planted abnormal returns ──
  type Spec = { idx: number; kind: WorldEvent['kind']; type: WorldEvent['type']; title: string; region: WorldEvent['region']; hint: string[]; pol: -1 | 0 | 1; effects: Record<string, number>; llm?: number };
  const specs: Spec[] = [
    { idx: 320, kind: 'surprise', type: 'trade_policy', title: 'Thông báo thuế quan mới của Mỹ [1]', region: 'US', hint: ['S_SEAFOOD', 'S_TEXTILE'], pol: -1, effects: { S_SEAFOOD: -2.6, S_TEXTILE: -2.2 }, llm: 0.86 },
    { idx: 520, kind: 'surprise', type: 'trade_policy', title: 'Thông báo thuế quan mới của Mỹ [2]', region: 'US', hint: ['S_SEAFOOD', 'S_TEXTILE'], pol: -1, effects: { S_SEAFOOD: -2.8, S_TEXTILE: -2.0 }, llm: 0.9 },
    { idx: 700, kind: 'surprise', type: 'trade_policy', title: 'Thông báo thuế quan mới của Mỹ [3]', region: 'US', hint: ['S_SEAFOOD', 'S_TEXTILE'], pol: -1, effects: { S_SEAFOOD: -2.4, S_TEXTILE: -2.4, S_STEEL: -1.0 }, llm: 0.88 },
    { idx: 400, kind: 'scheduled', type: 'monetary_policy', title: 'Họp chính sách của Fed [1]', region: 'US', hint: ['S_BANK', 'S_RE'], pol: -1, effects: { S_BANK: -1.5, S_RE: -1.8, S_SEC: -1.2 } },
    { idx: 600, kind: 'scheduled', type: 'monetary_policy', title: 'Họp chính sách của Fed [2]', region: 'US', hint: ['S_BANK', 'S_RE'], pol: -1, effects: { S_BANK: -1.4, S_RE: -2.0 } },
    { idx: 800, kind: 'scheduled', type: 'monetary_policy', title: 'Họp chính sách của Fed [3]', region: 'US', hint: ['S_BANK', 'S_RE'], pol: -1, effects: { S_RE: -1.7, S_SEC: -1.5 } },
    { idx: 450, kind: 'scheduled', type: 'macro_release', title: 'Công bố PMI sản xuất Trung Quốc [1]', region: 'CN', hint: ['S_STEEL', 'S_PORT'], pol: 1, effects: { S_STEEL: 1.4, S_PORT: 1.2 } },
    { idx: 650, kind: 'scheduled', type: 'macro_release', title: 'Công bố PMI sản xuất Trung Quốc [2]', region: 'CN', hint: ['S_STEEL', 'S_PORT'], pol: 1, effects: { S_STEEL: 1.2, S_PORT: 1.0 } },
    { idx: 900, kind: 'surprise', type: 'commodity_shock', title: 'Biến động mạnh của giá dầu', region: 'GLOBAL', hint: ['S_OIL'], pol: 1, effects: {}, llm: 0.8 },
    { idx: 1000, kind: 'surprise', type: 'geopolitical', title: 'Sự kiện địa chính trị [1]', region: 'GLOBAL', hint: ['S_SEC'], pol: -1, effects: {}, llm: 0.75 },
    { idx: 1100, kind: 'scheduled', type: 'macro_release', title: 'Số liệu việc làm Mỹ', region: 'US', hint: ['S_SEC'], pol: -1, effects: {} },
    { idx: N - 2, kind: 'scheduled', type: 'index_reclassification', title: 'Đánh giá phân loại thị trường của tổ chức chỉ số', region: 'GLOBAL', hint: ['S_SEC', 'S_BANK'], pol: 1, effects: {} },
  ];
  const events: WorldEvent[] = [];
  const plantedEventEffects: Record<string, Record<string, number>> = {};
  specs.forEach((s, k) => {
    const id = `ev${k + 1}`;
    const prev = tradingDays[s.idx - 1];
    events.push({
      id, kind: s.kind, type: s.type, titleVi: s.title, tsUtc: `${prev}T09:30:00Z`, region: s.region, sectorsHint: s.hint, polarityHint: s.pol,
      source: { name: '[tên nguồn]', url: '[đường dẫn]' },
      extraction: s.llm ? { method: 'llm', confidence: s.llm, reviewed: true } : { method: 'manual', confidence: 1, reviewed: true },
    });
    plantedEventEffects[id] = Object.fromEntries(Object.entries(s.effects).map(([k2, v]) => [k2, Math.round(v * EVENT_SCALE * 10) / 10]));
  });

  // ── daily sector returns: market beta + idiosyncratic noise + planted event reactions ──
  const betaMkt: Record<string, number> = { S_BANK: 1.2, S_SEC: 1.4, S_RE: 1.3, S_STEEL: 1.1, S_OIL: 0.9, S_SEAFOOD: 0.8, S_TEXTILE: 0.9, S_PORT: 1.0, S_TECH: 1.1, S_POWER: 0.7 };
  const sectors: Record<string, number[]> = {};
  VN_SECTORS.forEach((s) => (sectors[s.id] = markets.VN.map((m) => betaMkt[s.id] * m + 0.55 * randn(rng))));
  specs.forEach((s, k) => {
    for (const sec of Object.keys(s.effects)) {
      const eff = plantedEventEffects[`ev${k + 1}`][sec];
      sectors[sec][s.idx] += eff;
      if (s.idx + 1 < N) sectors[sec][s.idx + 1] += eff * 0.5;
    }
  });

  // ── stocks: exposures and noisy per-stock betas to two factors ──
  const exposures: StockExposure[] = [];
  const stockBetas: Record<string, StockBetaEstimate[]> = { TARIFF: [], CONTAINER: [] };
  const plan: [string, string, number, number, number, number, number][] = [
    // sector, prefix, count, US share, sector beta TARIFF, sector beta CONTAINER, tau
    ['S_SEAFOOD', 'SEA', 6, 35, -1.8, -0.2, 0.5],
    ['S_TEXTILE', 'TEX', 6, 40, -1.6, -0.1, 0.5],
    ['S_STEEL', 'STL', 5, 8, -0.5, 0, 0.25],
    ['S_PORT', 'PRT', 5, 12, -0.3, 1.4, 0.4],
    ['S_OIL', 'OIL', 4, 3, 0, 0, 0.2],
    ['S_BANK', 'BNK', 6, 0, -0.1, 0, 0.15],
    ['S_TECH', 'TCH', 4, 25, -0.3, 0.1, 0.3],
  ];
  for (const [sec, pre, n, us, bT, bC, tau] of plan) {
    for (let i = 0; i < n; i++) {
      const code = `${pre}${i + 1}`;
      const usShare = Math.max(0, Math.min(70, Math.round(us * (0.6 + 0.8 * rng()))));
      const eu = Math.round((100 - usShare) * (us > 0 ? 0.25 : 0.05) * (0.6 + 0.8 * rng()));
      const cn = Math.round((100 - usShare - eu) * 0.12);
      const vn = 100 - usShare - eu - cn;
      exposures.push({
        code, sectorId: sec, revenueByRegion: { VN: vn, US: usShare, EU: eu, CN: cn },
        commodityCostShare: Math.round((0.15 + 0.4 * rng()) * 100) / 100, fxRevenueShare: Math.round(((100 - vn) / 100) * 100) / 100,
        fxDebtShare: Math.round(0.35 * rng() * 100) / 100, asOfPeriod: '2026-03', sourceRef: 'BCTC [kỳ], thuyết minh [mục]',
      });
      const se = 0.35 + 0.9 * rng();
      stockBetas.TARIFF.push({ code, sectorId: sec, beta: bT + tau * randn(rng) + se * randn(rng), se });
      const se2 = 0.35 + 0.9 * rng();
      stockBetas.CONTAINER.push({ code, sectorId: sec, beta: bC + tau * randn(rng) + se2 * randn(rng), se: se2 });
    }
  }

  // ── monthly world factors and sector indices for the impact matrix ──
  const store = new InMemoryVintageStore();
  const n = 222;
  const start = '2008-01';
  const ar = (phi: number, mu: number, s: number, x0: number, floor = -Infinity) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(Math.max(floor, mu + phi * (y[i - 1] - mu) + s * randn(rng)));
    return y;
  };
  const lvl = (s: number, x0: number) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(y[i - 1] * Math.exp((s * randn(rng)) / 100));
    return y;
  };
  const raw: Record<string, number[]> = {
    FED: ar(0.985, 2, 0.35, 2, 0), DXY: lvl(1.5, 85), OIL: lvl(8, 80), CNY: lvl(0.6, 7), STEEL: lvl(5, 600), CONTAINER: lvl(5, 1500),
    PMI_CN: ar(0.7, 50, 1.2, 50), PMI_US: ar(0.7, 52, 1.4, 52), SEMI: lvl(4, 100), VIX: ar(0.8, 18, 3, 18, 9), EM_FLOWS: ar(0.5, 0, 2, 0),
    TARIFF: lvl(6, 100), MSCI_EM: lvl(4.5, 1000),
  };
  const ld = (x: number[]) => x.map((v, i) => (i === 0 ? 0 : 100 * Math.log(v / x[i - 1])));
  const dd = (x: number[]) => x.map((v, i) => (i === 0 ? 0 : v - x[i - 1]));
  const stat: Record<string, number[]> = {
    FED: dd(raw.FED), DXY: ld(raw.DXY), OIL: ld(raw.OIL), CNY: ld(raw.CNY), STEEL: ld(raw.STEEL), CONTAINER: ld(raw.CONTAINER),
    PMI_CN: raw.PMI_CN.map((v) => v - 50), PMI_US: raw.PMI_US.map((v) => v - 52), SEMI: ld(raw.SEMI), VIX: raw.VIX.map((v) => v - 18),
    EM_FLOWS: raw.EM_FLOWS.slice(), TARIFF: ld(raw.TARIFF), MSCI_EM: ld(raw.MSCI_EM),
  };
  const pub = Object.fromEntries(Object.entries(catalogById(WORLD_CATALOG)).map(([id, m]) => [id, m.pubLagMonths]));
  const market = Array.from({ length: n }, () => 2.4 * randn(rng));
  for (const [sec, eff] of Object.entries(TRUE_WORLD_EFFECTS)) {
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
    raw[sec] = idx;
  }
  const obs: Observation[] = [];
  for (const meta of [...WORLD_EXTRA_FACTORS, ...SECTOR_TARGETS, ...VN_CATALOG.filter((m) => ['FED', 'DXY', 'OIL'].includes(m.id))]) {
    const v = raw[meta.id];
    if (!v) continue;
    for (let i = 0; i < n; i++) {
      const period = addMonths(start, i);
      obs.push({ seriesId: meta.id, period, value: v[i], asOf: estimateAsOf(period, meta.pubLagMonths, meta.typicalReleaseDay) });
    }
  }
  store.upsert(obs);
  return { data: { tradingDays, markets, sectors, events, plantedEventEffects, exposures, stockBetas }, store, catalog: WORLD_CATALOG };
}
