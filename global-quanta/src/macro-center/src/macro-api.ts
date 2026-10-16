/**
 * macro-api.ts — /api/macro/* handlers, independent of any web framework.
 *
 *   GET  /api/macro/health      POST /api/macro/impact     POST /api/macro/cell
 *   GET  /api/macro/series      POST /api/macro/scenario   POST /api/macro/score
 *   GET  /api/macro/regime      GET  /api/macro/alerts     GET  /api/macro/calendar
 *   POST /api/macro/regime-impact   GET /api/macro/report (Markdown)
 *
 * Every response is cached by (dataVersion, route, params): the data version changes on any
 * write to the vintage store, so a cached answer can never be served for stale data.
 */

import {
  analyzeMacro, buildDesign, macroScoreSeries, olsFit, prepareStationary, rollingBeta, stationaryBootstrapCI, applyTransform,
  type MacroAnalysis, type StationaryPrep,
} from './quant-macro';
import {
  VN_CATALOG, buildDataset, catalogById, checkQuality, toMacroSeries, type Dataset, type SeriesMeta, type VintageStore,
} from './macro-data';
import { NAMED_SCENARIOS, buildThermometer, expandingZ, generateAlerts, runScenario, upcomingReleases, type ShockSpec } from './macro-scenario';
import { backtestMacroScore } from './macro-backtest';
import { filterProbs, regimeConditionalBeta, regimeLabelVi, selectHmm, summarizeRegimes } from './macro-regime';
import { buildMonthlyReport } from './macro-report';

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface MacroApiDeps {
  store: VintageStore;
  catalog?: SeriesMeta[];
  today?: () => string;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  /** show a warning banner in every payload (e.g. demo data) */
  notice?: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const PAPER_FACTORS = ['CPI', 'IR', 'M2', 'EX', 'IO', 'FDI'];

export function createMacroApi(deps: MacroApiDeps) {
  const catalog = deps.catalog ?? VN_CATALOG;
  const by = catalogById(catalog);
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const ttl = deps.cacheTtlMs ?? 5 * 60_000;
  const maxEntries = deps.maxCacheEntries ?? 200;
  const cache = new Map<string, { at: number; value: unknown }>();
  let hits = 0;
  let misses = 0;

  const memo = <T>(key: string, compute: () => T): T => {
    const full = `${deps.store.dataVersion()}|${key}`;
    const hit = cache.get(full);
    if (hit && Date.now() - hit.at < ttl) {
      hits++;
      return hit.value as T;
    }
    misses++;
    const value = compute();
    cache.set(full, { at: Date.now(), value });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
    return value;
  };

  // ── validation helpers ──
  const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {});
  const optStr = (v: unknown, name: string): string | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string') throw new ApiError(400, `${name} phải là chuỗi.`);
    return v;
  };
  const optInt = (v: unknown, name: string, lo: number, hi: number): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) throw new ApiError(400, `${name} phải là số nguyên trong [${lo}, ${hi}].`);
    return n;
  };
  const optNum = (v: unknown, name: string, lo: number, hi: number): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) throw new ApiError(400, `${name} phải nằm trong [${lo}, ${hi}].`);
    return n;
  };
  const asOfOf = (v: unknown): string => {
    const s = optStr(v, 'asOf') ?? today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError(400, 'asOf phải có dạng YYYY-MM-DD.');
    return s;
  };
  const idList = (v: unknown, name: string, role: 'factor' | 'target'): string[] | undefined => {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'string')) throw new ApiError(400, `${name} phải là danh sách mã chuỗi.`);
    for (const id of v as string[]) if (!by[id] || by[id].role !== role) throw new ApiError(400, `Mã ${id} không phải ${role === 'factor' ? 'biến vĩ mô' : 'chỉ số'} hợp lệ.`);
    return v as string[];
  };

  // ── data preparation ──
  interface Prepared {
    asOf: string;
    ds: Dataset;
    factorIds: string[];
    targetIds: string[];
  }
  const prepare = (asOf: string, factors?: string[], targets?: string[]): Prepared => {
    const known = (id: string) => deps.store.getSeries(id, asOf).length >= 60;
    const factorIds = factors ?? catalog.filter((m) => m.role === 'factor' && known(m.id)).map((m) => m.id);
    const targetIds = targets ?? catalog.filter((m) => m.role === 'target' && known(m.id)).map((m) => m.id);
    const missing = [...factorIds, ...targetIds].filter((id) => deps.store.getSeries(id, asOf).length === 0);
    if (missing.length) throw new ApiError(422, `Chưa có dữ liệu cho: ${missing.join(', ')}.`);
    if (factorIds.length === 0 || targetIds.length === 0) throw new ApiError(422, 'Chưa đủ dữ liệu (cần ít nhất 60 tháng) cho biến vĩ mô và chỉ số.');
    const ds = buildDataset(deps.store, [...factorIds, ...targetIds], asOf);
    if (ds.dates.length < 60) throw new ApiError(422, `Chỉ có ${ds.dates.length} tháng chung giữa các chuỗi đã chọn; cần tối thiểu 60.`);
    return { asOf, ds, factorIds, targetIds };
  };

  const stationary = (p: Prepared): { prep: StationaryPrep; dates: string[] } =>
    memo(`stat|${p.asOf}|${p.factorIds.join(',')}|${p.targetIds.join(',')}`, () => ({
      prep: prepareStationary({
        dates: p.ds.dates,
        factors: toMacroSeries(p.ds, catalog, p.factorIds),
        targets: toMacroSeries(p.ds, catalog, p.targetIds),
      }),
      dates: p.ds.dates,
    }));

  const notice = deps.notice;
  const withMeta = (p: Prepared, payload: Record<string, unknown>) => ({
    dataVersion: deps.store.dataVersion(), asOf: p.asOf, firstPeriod: p.ds.dates[0], lastPeriod: p.ds.dates[p.ds.dates.length - 1], notice, ...payload,
  });

  // ── routes ──
  const impact = (b: Record<string, unknown>) => {
    const asOf = asOfOf(b.asOf);
    const p = prepare(asOf, idList(b.factors, 'factors', 'factor'), idList(b.targets, 'targets', 'target'));
    const maxLag = optInt(b.maxLag, 'maxLag', 0, 12) ?? 6;
    const adjust = (optStr(b.adjust, 'adjust') ?? 'by') as 'by' | 'bh' | 'holm' | 'bonferroni';
    if (!['by', 'bh', 'holm', 'bonferroni'].includes(adjust)) throw new ApiError(400, "adjust phải là 'by', 'bh', 'holm' hoặc 'bonferroni'.");
    const alpha = optNum(b.alpha, 'alpha', 0.001, 0.5) ?? 0.05;
    const rollingWindow = optInt(b.rollingWindow, 'rollingWindow', 24, 120) ?? 48;
    const key = `impact|${asOf}|${p.factorIds.join(',')}|${p.targetIds.join(',')}|${maxLag}|${adjust}|${alpha}|${rollingWindow}`;
    const out: MacroAnalysis = memo(key, () =>
      analyzeMacro({
        dates: p.ds.dates,
        factors: toMacroSeries(p.ds, catalog, p.factorIds),
        targets: toMacroSeries(p.ds, catalog, p.targetIds),
        options: { maxLag, adjust, alpha, rollingWindow },
      }),
    );
    return withMeta(p, {
      factors: p.factorIds, targets: p.targetIds, diagnostics: out.diagnostics, cells: out.cells, best: out.best,
      stability: out.stability, warnings: out.warnings, options: { maxLag, adjust, alpha, rollingWindow },
    });
  };

  const cell = (b: Record<string, unknown>) => {
    const asOf = asOfOf(b.asOf);
    const factor = optStr(b.factor, 'factor');
    const target = optStr(b.target, 'target');
    if (!factor || !target) throw new ApiError(400, 'Cần factor và target.');
    if (!by[factor] || by[factor].role !== 'factor') throw new ApiError(400, `Mã ${factor} không phải biến vĩ mô hợp lệ.`);
    if (!by[target] || by[target].role !== 'target') throw new ApiError(400, `Mã ${target} không phải chỉ số hợp lệ.`);
    const lag = optInt(b.lag, 'lag', 0, 12) ?? 1;
    const arLags = optInt(b.arLags, 'arLags', 0, 6) ?? 1;
    const window = optInt(b.window, 'window', 24, 120) ?? 48;
    const p = prepare(asOf, idList(b.factors, 'factors', 'factor'), idList(b.targets, 'targets', 'target'));
    if (!p.factorIds.includes(factor) || !p.targetIds.includes(target)) throw new ApiError(404, 'Cặp factor/target không nằm trong tập dữ liệu hiện có.');
    const { prep, dates } = stationary(p);
    const names = Object.keys(prep.factors);
    const xs = names.map((n) => prep.factors[n]);
    const d = buildDesign({ y: prep.targets[target], xs, names, lag, arLags });
    const idx = 1 + names.indexOf(factor);
    if (d.X.length < window + 5) throw new ApiError(422, 'Mẫu quá ngắn cho cửa sổ trượt yêu cầu.');
    const key = `cell|${asOf}|${factor}|${target}|${lag}|${arLags}|${window}|${names.join(',')}`;
    return memo(key, () => {
      const full = olsFit(d.X, d.y);
      const roll = rollingBeta(d, idx, window);
      const ci = stationaryBootstrapCI(d.X, d.y, idx, { B: 399, seed: 17 });
      return withMeta(p, {
        factor, target, lag, arLags, nobs: full.n,
        beta: full.beta[idx], se: full.seHac[idx], t: full.tHac[idx], p: full.pHac[idx], bootstrapCI: [ci.lo, ci.hi],
        rolling: { dates: roll.rows.map((r) => dates[r]), beta: roll.beta, t: roll.t },
      });
    });
  };

  const scenario = (b: Record<string, unknown>) => {
    const asOf = asOfOf(b.asOf);
    const horizon = optInt(b.horizon, 'horizon', 1, 24) ?? 6;
    let shocks: ShockSpec[];
    let meta: { id: string; nameVi: string; descriptionVi: string } | undefined;
    const sid = optStr(b.scenarioId, 'scenarioId');
    if (sid) {
      const sc = NAMED_SCENARIOS.find((s) => s.id === sid);
      if (!sc) throw new ApiError(404, `Không có kịch bản '${sid}'.`);
      shocks = sc.shocks;
      meta = { id: sc.id, nameVi: sc.nameVi, descriptionVi: sc.descriptionVi };
    } else {
      const raw = b.shocks;
      if (!Array.isArray(raw) || raw.length === 0) throw new ApiError(400, 'Cần scenarioId hoặc danh sách shocks.');
      shocks = raw.map((r, i) => {
        const o = obj(r);
        const factor = optStr(o.factor, `shocks[${i}].factor`);
        const amount = optNum(o.amount, `shocks[${i}].amount`, -100, 100);
        const unit = optStr(o.unit, `shocks[${i}].unit`);
        if (!factor || amount === undefined || (unit !== 'pct' && unit !== 'pp')) throw new ApiError(400, `shocks[${i}] cần factor, amount và unit ('pct' hoặc 'pp').`);
        return { factor, amount, unit };
      });
    }
    const p = prepare(asOf, idList(b.factors, 'factors', 'factor'), idList(b.targets, 'targets', 'target'));
    const key = `scenario|${asOf}|${JSON.stringify(shocks)}|${horizon}|${p.factorIds.join(',')}|${p.targetIds.join(',')}`;
    const { prep } = stationary(p);
    const res = memo(key, () => runScenario({ targets: prep.targets, factors: prep.factors, transforms: prep.transforms, shocks, horizon }));
    return withMeta(p, { scenario: meta ?? { id: 'custom', nameVi: 'Kịch bản tuỳ chỉnh', descriptionVi: '' }, shocks, ...res });
  };

  const score = (b: Record<string, unknown>) => {
    const asOf = asOfOf(b.asOf);
    const target = optStr(b.target, 'target') ?? 'VNINDEX';
    if (!by[target] || by[target].role !== 'target') throw new ApiError(400, `Mã ${target} không phải chỉ số hợp lệ.`);
    const lag = optInt(b.lag, 'lag', 1, 6) ?? 1;
    const minTrain = optInt(b.minTrain, 'minTrain', 36, 240) ?? 60;
    const chosen = idList(b.factors, 'factors', 'factor');
    // default = the six variables of the source paper, fixed a priori (NOT picked from the data,
    // which would contaminate the backtest with selection bias)
    const factorIds = chosen ?? PAPER_FACTORS.filter((f) => deps.store.getSeries(f, asOf).length >= 60);
    const p = prepare(asOf, factorIds, [target]);
    const { prep, dates } = stationary(p);
    const key = `score|${asOf}|${target}|${lag}|${minTrain}|${p.factorIds.join(',')}`;
    return memo(key, () => {
      const y = prep.targets[target];
      const pts = macroScoreSeries({ y, factors: prep.factors, lag, minTrain });
      if (pts.length === 0) throw new ApiError(422, 'Chưa đủ dữ liệu để tính MacroScore ngoài mẫu.');
      const bt = backtestMacroScore({ y, factors: prep.factors, lag, minTrain, B: 199 });
      const thermo = buildThermometer(pts);
      return withMeta(p, {
        target, lag, factors: p.factorIds,
        thermometer: thermo && { ...thermo, period: dates[thermo.row] },
        series: pts.slice(-36).map((q) => ({ period: dates[q.row], score: q.score, z: q.z })),
        backtest: bt,
        usableForDecisions: !!bt?.gate.pass,
        gateNote: bt?.gate.pass ? 'MacroScore vượt cổng kiểm định ngoài mẫu.' : 'MacroScore CHƯA vượt cổng kiểm định; chỉ dùng để tham khảo, không đưa vào bộ máy quyết định.',
      });
    });
  };

  const regimeFit = (p: Prepared, maxK: number) => {
    const feats = ['IR', 'CPI', 'M2'].filter((f) => p.ds.series[f]);
    if (feats.length === 0) throw new ApiError(422, 'Cần ít nhất một trong IR, CPI, M2 để nhận diện chế độ.');
    const cols = feats.map((f) => (by[f].kind === 'level' ? applyTransform(p.ds.series[f], 'yoy') : p.ds.series[f]));
    const rows: number[] = [];
    for (let t = 0; t < p.ds.dates.length; t++) if (cols.every((c) => Number.isFinite(c[t]))) rows.push(t);
    if (rows.length < 60) throw new ApiError(422, 'Quá ít quan sát để nhận diện chế độ.');
    const obs = rows.map((t) => cols.map((c) => c[t]));
    const sel = selectHmm(obs, maxK);
    const probs = filterProbs(obs, sel.best.params);
    return { feats, rows, obs, sel, probs };
  };

  const regime = (q: Record<string, unknown>) => {
    const asOf = asOfOf(q.asOf);
    const maxK = optInt(q.maxK, 'maxK', 1, 4) ?? 3;
    const p = prepare(asOf, ['IR', 'CPI', 'M2'].filter((f) => deps.store.getSeries(f, asOf).length >= 60), [by.VNINDEX ? 'VNINDEX' : catalog.find((m) => m.role === 'target')!.id]);
    return memo(`regime|${asOf}|${maxK}`, () => {
      const r = regimeFit(p, maxK);
      const K = r.sel.best.params.K;
      const summary = summarizeRegimes(r.sel.best.params).map((s) => ({
        ...s, label: regimeLabelVi(s.state, K), meansByFeature: Object.fromEntries(r.feats.map((f, i) => [f, s.meanRaw[i]])),
      }));
      const last = r.probs[r.probs.length - 1];
      return withMeta(p, {
        features: r.feats, K, bicByK: r.sel.all.map((m) => ({ K: m.params.K, bic: m.bic })), summary,
        current: { probs: last, state: last.indexOf(Math.max(...last)), label: regimeLabelVi(last.indexOf(Math.max(...last)), K) },
        history: r.rows.slice(-60).map((t, i) => ({ period: p.ds.dates[t], probs: r.probs[r.probs.length - 60 + i] ?? r.probs[i] })),
        note: 'Xác suất lọc (forward) — an toàn cho quyết định thời gian thực; không dùng thông tin tương lai.',
      });
    });
  };

  const regimeImpact = (b: Record<string, unknown>) => {
    const asOf = asOfOf(b.asOf);
    const factor = optStr(b.factor, 'factor');
    const target = optStr(b.target, 'target');
    if (!factor || !target) throw new ApiError(400, 'Cần factor và target.');
    if (!by[factor] || by[factor].role !== 'factor') throw new ApiError(400, `Mã ${factor} không phải biến vĩ mô hợp lệ.`);
    if (!by[target] || by[target].role !== 'target') throw new ApiError(400, `Mã ${target} không phải chỉ số hợp lệ.`);
    const lag = optInt(b.lag, 'lag', 0, 12) ?? 1;
    const arLags = optInt(b.arLags, 'arLags', 0, 6) ?? 1;
    const p = prepare(asOf, idList(b.factors, 'factors', 'factor'), idList(b.targets, 'targets', 'target'));
    if (!p.factorIds.includes(factor) || !p.targetIds.includes(target)) throw new ApiError(404, 'Cặp factor/target không nằm trong tập dữ liệu hiện có.');
    return memo(`regime-impact|${asOf}|${factor}|${target}|${lag}|${arLags}|${p.factorIds.join(',')}`, () => {
      const r = regimeFit(p, 3);
      const K = r.sel.best.params.K;
      if (K < 2) throw new ApiError(422, 'Chỉ nhận diện được một chế độ; không có gì để so sánh.');
      const stateOfMonth = new Map<number, number>();
      r.rows.forEach((t, i) => stateOfMonth.set(t, r.probs[i].indexOf(Math.max(...r.probs[i]))));
      const { prep } = stationary(p);
      const names = Object.keys(prep.factors);
      const d = buildDesign({ y: prep.targets[target], xs: names.map((n) => prep.factors[n]), names, lag, arLags });
      const res = regimeConditionalBeta({ X: d.X, y: d.y, coefIdx: 1 + names.indexOf(factor), regimeOfRow: d.rows.map((t) => stateOfMonth.get(t) ?? -1), K });
      if (!res) throw new ApiError(422, 'Mỗi chế độ cần ít nhất 25 quan sát để so sánh.');
      return withMeta(p, {
        factor, target, lag, K, features: r.feats,
        perRegime: res.perRegime.map((x) => ({ ...x, label: regimeLabelVi(x.state, K) })),
        equalityF: res.equalityF, equalityP: res.equalityP, differs: res.differs,
        note: 'Chế độ gán theo xác suất lọc (forward). Kết quả mang tính mô tả: chế độ được ước lượng trên toàn mẫu.',
      });
    });
  };

  const report = (q: Record<string, unknown>) => {
    const asOf = asOfOf(q.asOf);
    const imp = impact({ asOf }) as unknown as Parameters<typeof buildMonthlyReport>[0]['impact'] & { notice?: string };
    const names = Object.fromEntries(catalog.map((m) => [m.id, m.nameVi]));
    const opt = <T,>(f: () => T): T | undefined => {
      try {
        return f();
      } catch {
        return undefined;
      }
    };
    const markdown = buildMonthlyReport({
      asOf, notice, names, impact: imp,
      score: opt(() => score({ asOf }) as unknown as Parameters<typeof buildMonthlyReport>[0]['score']),
      regime: opt(() => regime({ asOf }) as unknown as Parameters<typeof buildMonthlyReport>[0]['regime']),
      alerts: opt(() => (alerts({ asOf }) as unknown as { alerts: { level: string; messageVi: string }[] }).alerts),
      calendar: opt(() => calendar({ asOf }) as unknown as Parameters<typeof buildMonthlyReport>[0]['calendar']),
    });
    return { dataVersion: deps.store.dataVersion(), asOf, notice, markdown };
  };

  const alerts = (q: Record<string, unknown>) => {
    const asOf = asOfOf(q.asOf);
    const imp = impact({ asOf }) as unknown as { factors: string[]; targets: string[]; best: MacroAnalysis['best']; stability: MacroAnalysis['stability'] };
    const p = prepare(asOf, imp.factors, imp.targets);
    const { prep } = stationary(p);
    const factorZ: Record<string, number> = {};
    for (const f of Object.keys(prep.factors)) {
      const z = expandingZ(prep.factors[f]);
      for (let i = z.length - 1; i >= 0; i--) if (Number.isFinite(z[i])) { factorZ[f] = z[i]; break; }
    }
    let regimeArg: { previous: number[]; current: number[]; labels: string[] } | undefined;
    try {
      const r = regimeFit(p, 3);
      const K = r.sel.best.params.K;
      if (r.probs.length >= 2 && K > 1)
        regimeArg = { previous: r.probs[r.probs.length - 2], current: r.probs[r.probs.length - 1], labels: Array.from({ length: K }, (_, s) => regimeLabelVi(s, K)) };
    } catch {
      /* regime optional */
    }
    const list = generateAlerts({
      factorZ, factorNamesVi: Object.fromEntries(catalog.map((m) => [m.id, m.nameVi])), regime: regimeArg, stability: imp.stability, best: imp.best,
    });
    return withMeta(p, { alerts: list, factorZ });
  };

  const calendar = (q: Record<string, unknown>) => {
    const asOf = asOfOf(q.asOf);
    const latest: Record<string, string> = {};
    for (const m of catalog) {
      const s = deps.store.getSeries(m.id, asOf);
      if (s.length) latest[m.id] = s[s.length - 1].period;
    }
    return { dataVersion: deps.store.dataVersion(), asOf, notice, releases: upcomingReleases(catalog, latest, asOf), caveat: 'Ngày công bố là ƯỚC TÍNH từ độ trễ và ngày công bố điển hình; đối chiếu lịch chính thức của từng cơ quan.' };
  };

  const seriesList = (q: Record<string, unknown>) => {
    const asOf = asOfOf(q.asOf);
    const nowPeriod = asOf.slice(0, 7);
    return {
      dataVersion: deps.store.dataVersion(), asOf, notice,
      series: catalog.map((m) => {
        const pts = deps.store.getSeries(m.id, asOf);
        const issues = pts.length ? checkQuality(m.id, pts, m, nowPeriod) : [];
        return { ...m, n: pts.length, first: pts[0]?.period ?? null, last: pts[pts.length - 1]?.period ?? null, issues };
      }),
      scenarios: NAMED_SCENARIOS,
    };
  };

  async function handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      const path = req.path.replace(/\/+$/, '');
      const m = req.method.toUpperCase();
      const route = (method: string, p: string) => m === method && path === `/api/macro/${p}`;
      if (route('GET', 'health')) return { status: 200, body: { ok: true, dataVersion: deps.store.dataVersion(), cache: { entries: cache.size, hits, misses } } };
      if (route('GET', 'series')) return { status: 200, body: seriesList(req.query) };
      if (route('POST', 'impact')) return { status: 200, body: impact(obj(req.body)) };
      if (route('POST', 'cell')) return { status: 200, body: cell(obj(req.body)) };
      if (route('POST', 'scenario')) return { status: 200, body: scenario(obj(req.body)) };
      if (route('POST', 'score')) return { status: 200, body: score(obj(req.body)) };
      if (route('GET', 'regime')) return { status: 200, body: regime(req.query) };
      if (route('POST', 'regime-impact')) return { status: 200, body: regimeImpact(obj(req.body)) };
      if (route('GET', 'report')) return { status: 200, body: report(req.query) };
      if (route('GET', 'alerts')) return { status: 200, body: alerts(req.query) };
      if (route('GET', 'calendar')) return { status: 200, body: calendar(req.query) };
      if (path.startsWith('/api/macro/')) return { status: 405, body: { error: 'Phương thức hoặc đường dẫn không được hỗ trợ.' } };
      return { status: 404, body: { error: 'Không tìm thấy.' } };
    } catch (e) {
      if (e instanceof ApiError) return { status: e.status, body: { error: e.message } };
      return { status: 500, body: { error: 'Lỗi tính toán nội bộ.' } };
    }
  }

  return { handle, cacheStats: () => ({ entries: cache.size, hits, misses }), clearCache: () => cache.clear() };
}

export type MacroApi = ReturnType<typeof createMacroApi>;
