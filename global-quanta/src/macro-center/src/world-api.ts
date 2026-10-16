/**
 * world-api.ts — /api/world/* handlers, framework-agnostic.
 *
 *   GET  /api/world/series         catalog of factors, sectors, markets, scenarios
 *   GET  /api/world/overview       pulse of world factors, tier counts, spillover, pending events
 *   POST /api/world/matrix         factor × sector impact matrix with evidence tiers (EXPLORATORY)
 *   GET  /api/world/confirmatory   pre-registered 12-pair confirmatory gate (docs/WORLD-W3-prereg.md)
 *   GET  /api/world/connectedness  Diebold-Yilmaz table, rolling total, tail dependence
 *   GET  /api/world/events         event list with CAR, q-values and tiers
 *   GET  /api/world/events/:id     event-study detail
 *   GET  /api/world/stock/:code    exposure profile with shrunk betas
 *   POST /api/world/scenario       σ-shock scenario: sector ranking, impulse responses, stock effects
 *
 * Sector-level impact and scenarios reuse the macro engine (same statistics, same corrections).
 */
import { createMacroApi } from './macro-api';
import { buildDataset, toMacroSeries, type SeriesMeta, type VintageStore } from './macro-data';
import { backtestMacroScore } from './macro-backtest';
import { adjustPValues, mean, prepareStationary, std, type StationaryPrep } from './quant-macro';
import { expandingZ, localProjectionIRF } from './macro-scenario';
import { connectedness, rollingConnectedness, tailDependence } from './world-connectedness';
import { alignEventToSession, bmpTest, eventStudy, type EventStudyResult } from './world-events';
import { hierarchicalShrink } from './world-shrinkage';
import { assignTier, stockTier, summarizeTiers } from './world-evidence';
import { runConfirmatory } from './world-confirmatory';
import { channelExposure } from './world-transmission';
import {
  CHANNEL_NAMES_VI, VN_SECTORS, WORLD_FACTOR_IDS, WORLD_FACTOR_INFO, WORLD_MARKETS, TIER_MEANING_VI, type EvidenceTier,
} from './world-types';
import type { WorldData } from './world-seed';
import type { ApiRequest, ApiResponse } from './macro-api';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface WorldScenario {
  id: string;
  nameVi: string;
  descriptionVi: string;
  shocks: { factor: string; sigma: number }[];
}

export const WORLD_SCENARIOS: WorldScenario[] = [
  { id: 'tariff-up', nameVi: 'Thuế quan Mỹ tăng', descriptionVi: 'Bất định chính sách thương mại tăng 1,5 độ lệch chuẩn.', shocks: [{ factor: 'TARIFF', sigma: 1.5 }] },
  { id: 'usd-strong', nameVi: 'USD mạnh lên', descriptionVi: 'Chỉ số USD tăng 1 độ lệch chuẩn.', shocks: [{ factor: 'DXY', sigma: 1 }] },
  { id: 'oil-spike', nameVi: 'Giá dầu tăng mạnh', descriptionVi: 'Giá dầu tăng 2 độ lệch chuẩn.', shocks: [{ factor: 'OIL', sigma: 2 }] },
  { id: 'fed-cut', nameVi: 'Fed giảm lãi suất', descriptionVi: 'Lãi suất Fed giảm 1 độ lệch chuẩn, USD yếu đi 0,5.', shocks: [{ factor: 'FED', sigma: -1 }, { factor: 'DXY', sigma: -0.5 }] },
  { id: 'china-recovery', nameVi: 'Trung Quốc phục hồi', descriptionVi: 'PMI Trung Quốc tăng 1,5 và giá thép tăng 1 độ lệch chuẩn.', shocks: [{ factor: 'PMI_CN', sigma: 1.5 }, { factor: 'STEEL', sigma: 1 }] },
  { id: 'risk-off', nameVi: 'Tránh rủi ro toàn cầu', descriptionVi: 'VIX tăng 2 và dòng vốn thị trường mới nổi giảm 1,5 độ lệch chuẩn.', shocks: [{ factor: 'VIX', sigma: 2 }, { factor: 'EM_FLOWS', sigma: -1.5 }] },
];

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface WorldApiDeps {
  world: WorldData;
  store: VintageStore;
  catalog: SeriesMeta[];
  today?: () => string;
  notice?: string;
}

export function createWorldApi(deps: WorldApiDeps) {
  const { world, store, catalog } = deps;
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const macro = createMacroApi({ store, catalog, today, notice: deps.notice });
  const nameOf = Object.fromEntries(catalog.map((m) => [m.id, m.nameVi]));
  const sectorName = Object.fromEntries(VN_SECTORS.map((s) => [s.id, s.nameVi]));
  const cache = new Map<string, unknown>();
  const memo = <T>(key: string, f: () => T): T => {
    const k = `${store.dataVersion()}|${key}`;
    if (!cache.has(k)) cache.set(k, f());
    return cache.get(k) as T;
  };

  const asOfOf = (v: unknown): string => {
    const s = typeof v === 'string' && v ? v : today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError(400, 'asOf phải có dạng YYYY-MM-DD.');
    return s;
  };
  const intIn = (v: unknown, name: string, lo: number, hi: number, dflt: number): number => {
    if (v === undefined || v === null || v === '') return dflt;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new ApiError(400, `${name} phải là số nguyên trong [${lo}, ${hi}].`);
    return n;
  };

  // ── monthly stationary preparation shared by matrix, overview and scenario ──
  const monthly = (asOf: string) =>
    memo(`monthly|${asOf}`, () => {
      const factors = WORLD_FACTOR_IDS.filter((id) => store.getSeries(id, asOf).length >= 60);
      const targets = VN_SECTORS.map((s) => s.id).filter((id) => store.getSeries(id, asOf).length >= 60);
      if (!factors.length || !targets.length) throw new ApiError(422, 'Chưa đủ dữ liệu tháng (cần ít nhất 60 tháng) cho yếu tố thế giới và ngành.');
      const ds = buildDataset(store, [...factors, ...targets], asOf);
      if (ds.dates.length < 60) throw new ApiError(422, 'Số tháng chung giữa các chuỗi dưới 60.');
      const prep: StationaryPrep = prepareStationary({ dates: ds.dates, factors: toMacroSeries(ds, catalog, factors), targets: toMacroSeries(ds, catalog, targets) });
      return { factors, targets, ds, prep };
    });

  // ── matrix with evidence tiers ──
  const matrix = (asOf: string, maxLag: number) =>
    memo(`matrix|${asOf}|${maxLag}`, () => {
      const m = monthly(asOf);
      const r = macro.handle({ method: 'POST', path: '/api/macro/impact', query: {}, body: { asOf, factors: m.factors, targets: m.targets, maxLag } });
      return r.then((resp: ApiResponse) => {
        if (resp.status !== 200) throw new ApiError(resp.status, String((resp.body as Obj).error ?? 'Lỗi ma trận'));
        const b = resp.body as Obj;
        const cells = (b.best as Obj[]).map((c) => {
          const key = `${c.factor}|${c.target}`;
          const st = b.stability[key];
          let oosPass: boolean | null = null;
          if (c.q < 0.05) {
            oosPass = memo(`oos|${asOf}|${key}|${c.lag}`, () => {
              const bt = backtestMacroScore({ y: m.prep.targets[c.target], factors: { [c.factor]: m.prep.factors[c.factor] }, lag: Math.max(1, c.lag), B: 149, seed: 3 });
              return bt ? bt.gate.pass : false;
            });
          }
          const { tier, reasonVi } = assignTier({ q: c.q, stable: st ? st.stable : null, oosPass });
          return { factor: c.factor, sector: c.target, direction: c.direction, beta: c.beta, t: c.t, q: c.q, lag: c.lag, tier, reasonVi, stable: st ? st.stable : null, oosPass };
        });
        return {
          asOf, firstPeriod: b.firstPeriod, lastPeriod: b.lastPeriod, notice: b.notice,
          factors: m.factors.map((id) => ({ id, nameVi: nameOf[id], ...WORLD_FACTOR_INFO[id], channelVi: CHANNEL_NAMES_VI[WORLD_FACTOR_INFO[id].channel] })),
          sectors: m.targets.map((id) => ({ id, nameVi: sectorName[id] })),
          cells, counts: summarizeTiers(cells.map((c) => c.tier)), tierMeaning: TIER_MEANING_VI, warnings: b.warnings as string[],
        };
      });
    });

  // ── pre-registered confirmatory gate (W3) ──
  const confirmatory = (asOf: string) =>
    memo(`confirmatory|${asOf}`, () => {
      const m = monthly(asOf);
      const r = runConfirmatory(m.prep);
      return { asOf, firstPeriod: m.ds.dates[0], lastPeriod: m.ds.dates[m.ds.dates.length - 1], notice: deps.notice, ...r,
        rows: r.rows.map((x) => ({ ...x, factorName: nameOf[x.factor], sectorName: sectorName[x.sector] })) };
    });

  // ── connectedness ──
  const marketMatrix = () => world.tradingDays.map((_, t) => WORLD_MARKETS.map((m) => world.markets[m.id][t]));
  const connectednessReport = (window: number, H: number, step: number) =>
    memo(`conn|${window}|${H}|${step}`, () => {
      const Y = marketMatrix();
      const names = WORLD_MARKETS.map((m) => m.nameVi);
      const full = connectedness(Y, names, { p: 1, H });
      const recent = connectedness(Y.slice(-window), names, { p: 1, H });
      const roll = rollingConnectedness(Y, names, { window, step, p: 1, H });
      const vn = WORLD_MARKETS.findIndex((m) => m.id === 'VN');
      const vnSeries = world.markets.VN;
      return {
        names, window, H, p: 1, full: { table: full.table, from: full.from, to: full.to, net: full.net, total: full.total },
        recent: { table: recent.table, from: recent.from, to: recent.to, net: recent.net, total: recent.total },
        rolling: roll.map((r) => ({ date: world.tradingDays[r.end], total: r.total, vnFrom: r.from[vn] })),
        vnReceivesFrom: WORLD_MARKETS.filter((_, i) => i !== vn).map((m, i) => ({ market: m.id, nameVi: m.nameVi, share: recent.table[vn][WORLD_MARKETS.findIndex((x) => x.id === m.id)], i })).sort((a, b) => b.share - a.share).map(({ i: _i, ...rest }) => rest),
        tailDependence: WORLD_MARKETS.filter((m) => m.id !== 'VN').map((m) => ({ market: m.id, nameVi: m.nameVi, lowerTail: tailDependence(world.markets[m.id], vnSeries, 0.05, 'lower'), independentBaseline: 0.05 })),
      };
    });

  // ── events ──
  // W5 (2026-10-16): ngành mục tiêu ĐỊNH TRƯỚC = sectorsHint[0] (không chọn ngành có p nhỏ nhất); họ BY xác nhận = một kiểm định /
  // sự kiện; sự kiện có chiều (polarityHint ≠ 0) phải đúng chiều; cửa sổ (−1,+3) trùng sự kiện khác -> bị nhiễu, tối đa bậc C;
  // nhân rộng BMP theo loại chỉ dùng sự kiện không trùng cửa sổ. Kết quả các ngành khác vẫn có (q toàn bảng) nhưng là THĂM DÒ.
  const EVENT_WINDOW = { lo: -1, hi: 3 };
  interface Study {
    id: string;
    ev: WorldData['events'][number];
    align: ReturnType<typeof alignEventToSession>;
    results: Record<string, EventStudyResult>;
    q: Record<string, number>;
    primary: string | null;
    qPrimary: number | null;
    overlapsWith: string[];
  }
  const studies = (): Study[] =>
    memo('studies', () => {
      const list: Study[] = world.events.map((ev) => {
        const align = alignEventToSession(ev.tsUtc, world.tradingDays);
        const results: Record<string, EventStudyResult> = {};
        if (align) for (const s of VN_SECTORS) {
          const r = eventStudy(world.sectors[s.id], world.markets.VN, align.index);
          if (r) results[s.id] = r;
        }
        const h0 = ev.sectorsHint[0];
        const primary = h0 && results[h0] ? h0 : null;
        return { id: ev.id, ev, align, results, q: {}, primary, qPrimary: null, overlapsWith: [] };
      });
      const span = EVENT_WINDOW.hi - EVENT_WINDOW.lo;
      for (const a of list) for (const b of list)
        if (a !== b && a.align && b.align && Math.abs(a.align.index - b.align.index) <= span) a.overlapsWith.push(b.id);
      const flat: { i: number; sec: string; p: number }[] = [];
      list.forEach((s, i) => Object.entries(s.results).forEach(([sec, r]) => flat.push({ i, sec, p: r.p })));
      const q = adjustPValues(flat.map((f) => f.p), 'by');
      flat.forEach((f, k) => (list[f.i].q[f.sec] = q[k]));
      const prim = list.map((s, i) => ({ i, p: s.primary ? s.results[s.primary].p : NaN })).filter((x) => Number.isFinite(x.p));
      const qp = adjustPValues(prim.map((x) => x.p), 'by');
      prim.forEach((x, k) => (list[x.i].qPrimary = qp[k]));
      return list;
    });
  const bmpFor = (type: string, sector: string) => {
    // cụm trùng cửa sổ chỉ giữ sự kiện đầu tiên (không đếm một cú sốc hai lần)
    const seen = new Set<string>();
    const items: { car: number; varCar: number }[] = [];
    for (const s of studies().filter((x) => x.ev.type === type && x.results[sector]).sort((a, b) => (a.align!.index - b.align!.index))) {
      if (s.overlapsWith.some((o) => seen.has(o))) { seen.add(s.id); continue; }
      seen.add(s.id);
      // sự kiện có chiều: quy về cùng hướng (CAR × chiều) để tin xấu và tin tốt cùng loại không triệt tiêu nhau
      items.push({ car: s.results[sector].car * (s.ev.polarityHint || 1), varCar: s.results[sector].varCar });
    }
    return bmpTest(items);
  };
  const eventRow = (s: Study) => {
    const candidates = Object.keys(s.results);
    if (!candidates.length || !s.align) return { id: s.id, titleVi: s.ev.titleVi, kind: s.ev.kind, type: s.ev.type, region: s.ev.region, tsUtc: s.ev.tsUtc, sessionDate: s.align?.date ?? null, tier: 'pending', status: 'Chờ đủ phiên sau sự kiện' };
    const exploratoryBest = candidates.reduce((a, b) => (s.results[b].p < s.results[a].p ? b : a));
    const overlapTitles = s.overlapsWith.map((id) => world.events.find((e) => e.id === id)?.titleVi ?? id);
    if (!s.primary) {
      const r = s.results[exploratoryBest];
      return {
        id: s.id, titleVi: s.ev.titleVi, kind: s.ev.kind, type: s.ev.type, region: s.ev.region, tsUtc: s.ev.tsUtc, sessionDate: s.align.date, sameDay: s.align.sameDay,
        sector: exploratoryBest, sectorName: sectorName[exploratoryBest], prespecified: false, car: r.car, se: r.se, t: r.t, p: r.p, q: s.q[exploratoryBest],
        ci90: [r.car - 1.645 * r.se, r.car + 1.645 * r.se], bmp: null, tier: 'C' as EvidenceTier, polarity: s.ev.polarityHint, signOk: null, overlapsWith: overlapTitles,
        reasonVi: 'Không có ngành mục tiêu định trước — ngành hiển thị là ngành có p nhỏ nhất (thăm dò), không phải bằng chứng.', limitDays: r.limitDaysInWindow, extraction: s.ev.extraction ?? null,
      };
    }
    const best = s.primary;
    const r = s.results[best];
    const bmp = bmpFor(s.ev.type, best);
    const signOk = s.ev.polarityHint === 0 ? null : Math.sign(r.car) === s.ev.polarityHint;
    const replicated = !!bmp && bmp.p < 0.05 && Math.sign(bmp.caar) === Math.sign(r.car * (s.ev.polarityHint || 1));
    let { tier, reasonVi } = assignTier({ q: s.qPrimary ?? 1, stable: replicated, oosPass: replicated });
    if (signOk === false && tier !== 'C') { tier = 'C'; reasonVi = 'Ngược chiều dự kiến của sự kiện — không tính là bằng chứng.'; }
    if (s.overlapsWith.length && tier !== 'C') { tier = 'C'; reasonVi = `Cửa sổ (−1,+3) trùng sự kiện khác (${overlapTitles.join('; ')}) — không tách được tác động.`; }
    return {
      id: s.id, titleVi: s.ev.titleVi, kind: s.ev.kind, type: s.ev.type, region: s.ev.region, tsUtc: s.ev.tsUtc, sessionDate: s.align.date, sameDay: s.align.sameDay,
      sector: best, sectorName: sectorName[best], prespecified: true, car: r.car, se: r.se, t: r.t, p: r.p, q: s.qPrimary ?? 1, qAllCells: s.q[best],
      ci90: [r.car - 1.645 * r.se, r.car + 1.645 * r.se], polarity: s.ev.polarityHint, signOk, overlapsWith: overlapTitles,
      exploratoryBest: exploratoryBest !== best ? { sector: exploratoryBest, sectorName: sectorName[exploratoryBest], car: s.results[exploratoryBest].car, p: s.results[exploratoryBest].p } : null,
      bmp: bmp ? { n: bmp.n, t: bmp.t, p: bmp.p } : null, tier, reasonVi, limitDays: r.limitDaysInWindow, extraction: s.ev.extraction ?? null,
    };
  };

  // ── stock betas ──
  const shrunkBetas = (factor: string) =>
    memo(`shrink|${factor}`, () => {
      const groups: Record<string, { id: string; beta: number; se: number }[]> = {};
      for (const b of world.stockBetas[factor] ?? []) (groups[b.sectorId] ??= []).push({ id: b.code, beta: b.beta, se: b.se });
      return hierarchicalShrink(groups);
    });

  // ── handlers ──
  async function overview(asOf: string) {
    const m = monthly(asOf);
    const mx = await matrix(asOf, 6);
    const pulse = m.factors.map((id) => {
      const z = expandingZ(m.prep.factors[id]);
      let last = NaN;
      for (let i = z.length - 1; i >= 0; i--) if (Number.isFinite(z[i])) { last = z[i]; break; }
      return { id, nameVi: nameOf[id], z: last, unusual: Math.abs(last) >= 2, links: mx.cells.filter((c) => c.factor === id && c.tier !== 'C').length, ...WORLD_FACTOR_INFO[id] };
    });
    const conn = connectednessReport(250, 10, 40);
    const studs = studies();
    return {
      asOf, notice: mx.notice, pulse, tierCounts: mx.counts,
      spillover: { total: conn.recent.total, fullSample: conn.full.total },
      events: { total: world.events.length, pending: studs.filter((s) => !Object.keys(s.results).length).length, tiers: summarizeTiers(studs.map(eventRow).filter((r) => r.tier !== 'pending').map((r) => r.tier as EvidenceTier)) },
    };
  }

  async function scenario(body: Obj) {
    const asOf = asOfOf(body.asOf);
    const horizon = intIn(body.horizon, 'horizon', 1, 12, 3);
    let shocks: { factor: string; sigma: number }[];
    let meta: { id: string; nameVi: string; descriptionVi: string };
    if (typeof body.scenarioId === 'string') {
      const sc = WORLD_SCENARIOS.find((s) => s.id === body.scenarioId);
      if (!sc) throw new ApiError(404, `Không có kịch bản '${body.scenarioId}'.`);
      shocks = sc.shocks;
      meta = { id: sc.id, nameVi: sc.nameVi, descriptionVi: sc.descriptionVi };
    } else if (Array.isArray(body.shocks) && body.shocks.length) {
      shocks = body.shocks.map((s: Obj, i: number) => {
        if (typeof s?.factor !== 'string' || !WORLD_FACTOR_IDS.includes(s.factor) || typeof s?.sigma !== 'number' || !Number.isFinite(s.sigma) || Math.abs(s.sigma) > 6)
          throw new ApiError(400, `shocks[${i}] cần factor hợp lệ và sigma trong [-6, 6].`);
        return { factor: s.factor, sigma: s.sigma };
      });
      meta = { id: 'custom', nameVi: 'Kịch bản tuỳ chỉnh', descriptionVi: '' };
    } else throw new ApiError(400, 'Cần scenarioId hoặc danh sách shocks.');

    const m = monthly(asOf);
    const names = m.factors;
    const sdOf = (id: string) => std(m.prep.factors[id].filter(Number.isFinite));
    const shockVec = names.map((id) => (shocks.find((s) => s.factor === id)?.sigma ?? 0) * sdOf(id));
    const warnings: string[] = shocks.filter((s) => !names.includes(s.factor)).map((s) => `Bỏ qua ${s.factor}: không có dữ liệu.`);
    const xs = names.map((id) => m.prep.factors[id]);
    const mx = await matrix(asOf, 6);
    const sectors = m.targets.map((sec) => {
      const irf = localProjectionIRF({ y: m.prep.targets[sec], xs, shock: shockVec, horizon, arLags: 1, level: 0.9 });
      const at = irf[irf.length - 1];
      return { sector: sec, nameVi: sectorName[sec], irf, est: at?.est ?? NaN, lo: at?.lo ?? NaN, hi: at?.hi ?? NaN, conclusive: !!at && (at.lo > 0 || at.hi < 0) };
    });
    sectors.sort((a, b) => a.est - b.est);
    const lead = shocks.find((s) => world.stockBetas[s.factor]);
    let stocks: Obj[] = [];
    if (lead) {
      const h = shrunkBetas(lead.factor);
      stocks = Object.entries(h.groups).flatMap(([sec, g]) =>
        g.items.map((it) => {
          const cell = mx.cells.find((c) => c.factor === lead.factor && c.sector === sec);
          const own = Math.abs(it.beta / it.se) > 1.96;
          return { code: it.id, sector: sec, sectorName: sectorName[sec], beta: it.shrunk, ownWeight: it.weight, est: it.shrunk * lead.sigma, tier: stockTier((cell?.tier ?? 'C') as EvidenceTier, own) };
        }),
      ).sort((a, b) => a.est - b.est).slice(0, 8);
    }
    return { asOf, scenario: meta, shocks, horizon, notice: deps.notice, sectors, stocks, stockFactor: lead?.factor ?? null, warnings, conclusiveCount: sectors.filter((s) => s.conclusive).length };
  }

  async function stock(code: string) {
    const x = world.exposures.find((e) => e.code === code);
    if (!x) throw new ApiError(404, `Không có cổ phiếu ${code}.`);
    const mx = await matrix(asOfOf(undefined), 6);
    const betas = Object.keys(world.stockBetas).map((factor) => {
      const h = shrunkBetas(factor);
      const g = h.groups[x.sectorId];
      const it = g?.items.find((i) => i.id === code);
      if (!it) return null;
      const cell = mx.cells.find((c) => c.factor === factor && c.sector === x.sectorId);
      const own = Math.abs(it.beta / it.se) > 1.96;
      return { factor, nameVi: nameOf[factor], own: it.beta, se: it.se, sectorPrior: g.priorMu, shrunk: it.shrunk, ownWeight: it.weight, postSd: it.postSd, sectorTier: cell?.tier ?? 'C', tier: stockTier((cell?.tier ?? 'C') as EvidenceTier, own), sectorPeers: g.items.length };
    }).filter(Boolean);
    return { code, sector: x.sectorId, sectorName: sectorName[x.sectorId], exposure: x, channels: channelExposure(x), betas, notice: deps.notice };
  }

  async function handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      const path = req.path.replace(/\/+$/, '');
      const m = req.method.toUpperCase();
      const q = req.query;
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Obj;
      if (m === 'GET' && path === '/api/world/series')
        return { status: 200, body: { notice: deps.notice, factors: WORLD_FACTOR_IDS.map((id) => ({ id, nameVi: nameOf[id], ...WORLD_FACTOR_INFO[id] })), sectors: VN_SECTORS, markets: WORLD_MARKETS, scenarios: WORLD_SCENARIOS, tierMeaning: TIER_MEANING_VI } };
      if (m === 'GET' && path === '/api/world/overview') return { status: 200, body: await overview(asOfOf(q.asOf)) };
      if (m === 'POST' && path === '/api/world/matrix') return { status: 200, body: await matrix(asOfOf(body.asOf), intIn(body.maxLag, 'maxLag', 1, 12, 6)) };
      if (m === 'GET' && path === '/api/world/confirmatory') return { status: 200, body: confirmatory(asOfOf(q.asOf)) };
      if (m === 'GET' && path === '/api/world/connectedness') return { status: 200, body: { notice: deps.notice, ...connectednessReport(intIn(q.window, 'window', 120, 1000, 250), intIn(q.H, 'H', 1, 30, 10), intIn(q.step, 'step', 5, 200, 40)) } };
      if (m === 'GET' && path === '/api/world/events') return { status: 200, body: { notice: deps.notice, events: studies().map(eventRow), family: 'Xác nhận: Benjamini-Yekutieli trên ngành mục tiêu định trước (1 kiểm định / sự kiện); q toàn bảng sự kiện × ngành chỉ để thăm dò' } };
      const em = /^\/api\/world\/events\/([A-Za-z0-9_-]+)$/.exec(path);
      if (m === 'GET' && em) {
        const s = studies().find((x) => x.id === em[1]);
        if (!s) throw new ApiError(404, `Không có sự kiện ${em[1]}.`);
        const row = eventRow(s);
        const bestRes = (row as Obj).sector ? s.results[(row as Obj).sector as string] : null;
        return {
          status: 200,
          body: {
            notice: deps.notice, event: row, alignment: s.align,
            path: bestRes ? bestRes.path : [], model: bestRes ? { alpha: bestRes.alpha, beta: bestRes.beta, sigma: bestRes.sigma, nEst: bestRes.nEst } : null,
            sectors: Object.entries(s.results).map(([sec, r]) => ({ sector: sec, nameVi: sectorName[sec], car: r.car, se: r.se, ci90: [r.car - 1.645 * r.se, r.car + 1.645 * r.se], t: r.t, p: r.p, q: s.q[sec] })).sort((a, b) => a.car - b.car),
          },
        };
      }
      const sm = /^\/api\/world\/stock\/([A-Za-z0-9_-]+)$/.exec(path);
      if (m === 'GET' && sm) return { status: 200, body: await stock(sm[1]) };
      if (m === 'POST' && path === '/api/world/scenario') return { status: 200, body: await scenario(body) };
      if (path.startsWith('/api/world/')) return { status: 405, body: { error: 'Phương thức hoặc đường dẫn không được hỗ trợ.' } };
      return { status: 404, body: { error: 'Không tìm thấy.' } };
    } catch (e) {
      if (e instanceof ApiError) return { status: e.status, body: { error: e.message } };
      return { status: 500, body: { error: 'Lỗi tính toán nội bộ.' } };
    }
  }

  void mean;
  return { handle, macro };
}

export type WorldApi = ReturnType<typeof createWorldApi>;
