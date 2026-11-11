// LS-r1 — dịch vụ ĐIỂM DẪN DẮT LS-v1 cho Hồ sơ 360° / Điểm Elite (E3-v5). Ba phần:
//   build()  bằng chứng hồi cứu từ kho giá VNDirect trên ổ Railway (px/, từ 2020-06): chuỗi IC + trạng thái + chốt chặn (KV elite:ls).
//   live(d)  LS-v1 phiên d cho bảng E1 (giá ngày Gateway close_adj — bảng E1 dựng 17:00, trước khi kho px cập nhật 19:45).
//   runGate() cổng H4 (walk-forward E7, một lần) -> KV elite:ls:gate; ĐẠT mới bật E3-v5.
import { COMPONENT_VI, COMPONENTS, LS_ID, LS_VERSION, REGIME_VI, VARIANT_VALUE, buildMatrix, crashGuard, lsBand, lsDay, lsIcPost, lsIcSeries, lsWeighting, regimeAt } from "./leadership.js";
import { runLsGate } from "./lsGate.js";
import { normCdf } from "./icCore.js";
import { noteStoreError } from "./storeHealth.js";

export const LS_KV = { doc: "elite:ls", live: "elite:ls:live", gate: "elite:ls:gate" };
const LIVE_DAYS = 420;
const REBUILD_MS = 20 * 3_600_000;
const isoMinusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const r4 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);

/**
 * @param {{ store: any, pricesOf: (t: string) => any[]|null, universe: () => Promise<string[]>, vnIndexBars: () => Promise<{date:string, close:number}[]>,
 *   retroInputs?: () => Promise<object>, commit?: () => string|null, now?: () => number, log?: any }} deps
 *   pricesOf: dòng kho px [ngày, adClose, nmValue, close]; VNINDEX: [ngày, close, …].
 */
export function createLeadershipService({ store, pricesOf, universe, vnIndexBars, retroInputs = null, commit = () => null, now = Date.now, log = console }) {
  let doc = null, live = null, gate = undefined, building = null, gating = null;
  const kv = async (k) => { try { return (await store.getKv(k))?.value ?? null; } catch (e) { noteStoreError(e); return null; } };

  async function pxMatrix() {
    const tickers = await universe();
    const series = new Map();
    for (const t of tickers) { const rows = pricesOf(t); if (rows?.length) series.set(t, rows.map((r) => [r[0], r[1], r[2] ?? null])); }
    const idx = (pricesOf("VNINDEX") ?? []).map((r) => [r[0], r[1]]);
    if (idx.length < 300 || series.size < 50) throw new Error(`Kho giá chưa đủ (VN-Index ${idx.length} phiên, ${series.size} mã).`);
    return buildMatrix(series, idx);
  }

  /** Bằng chứng hồi cứu (chuỗi IC LS-v1 mọi kỳ hạn + trạng thái + chốt chặn). */
  async function build() {
    if (building) return building;
    building = (async () => {
      const t0 = now();
      const M = await pxMatrix();
      const s = lsIcSeries(M, { valuesFrom: "9999-12-31" });
      doc = { version: LS_VERSION, builtAt: new Date(now()).toISOString(), from: s.from, to: s.to, cal: M.dates, ic: s.ic.ls_v1, regime: s.regime, guard: s.guard, tickers: M.px.size, ms: now() - t0 };
      await store.setKv(LS_KV.doc, doc);
      log.info?.(`[ls] bằng chứng ${s.from}→${s.to}, ${M.px.size} mã, ${doc.ms} ms`);
      return doc;
    })().finally(() => { building = null; });
    return building;
  }
  async function getDoc() { return (doc ??= await kv(LS_KV.doc)); }
  /** Dựng lại khi chưa có / quá 20 giờ (gọi trong chuỗi Elite mỗi phiên). */
  async function ensureBuilt() {
    const d = await getDoc();
    if (!d || now() - Date.parse(d.builtAt) > REBUILD_MS) { try { return await build(); } catch (e) { log.warn?.(`[ls] build: ${e.message}`); return d; } }
    return d;
  }

  /** LS-v1 của phiên `date` từ giá ngày Gateway. */
  async function computeLive(date) {
    if (live?.date === date) return live;
    const stored = await kv(LS_KV.live);
    if (stored?.date === date && stored.version === LS_VERSION) return (live = stored);
    const tickers = await universe();
    const rows = await store.getMarketDailyRange({ from: isoMinusDays(date, LIVE_DAYS), to: date, symbols: tickers, columns: "symbol,trading_date,close_adj,value" });
    const series = new Map();
    for (const r of rows) if (r.closeAdj > 0) { if (!series.has(r.symbol)) series.set(r.symbol, []); series.get(r.symbol).push([r.date, r.closeAdj, r.value ?? null]); }
    const idx = (await vnIndexBars()).filter((b) => b.date <= date && b.close > 0).map((b) => [b.date, b.close]);
    const M = buildMatrix(series, idx);
    const i = M.pos.get(date);
    if (i == null) throw new Error(`Chưa có VN-Index phiên ${date}.`);
    const day = lsDay(M, i), reg = regimeAt(M, i);
    const out = {};
    for (const [t, r] of day) if (r.ls != null) out[t] = { ls: r4(r.ls), comp: Object.fromEntries(COMPONENTS.map((c) => [c, r4(r.comp[c])])), z: Object.fromEntries(COMPONENTS.map((c) => [c, r4(r.z[c])])) };
    live = { version: LS_VERSION, date, regime: reg.group, bias: reg.bias, breadth: reg.breadth, guard: crashGuard(M, i), names: Object.keys(out).length, rows: out, builtAt: new Date(now()).toISOString() };
    await store.setKv(LS_KV.live, live);
    return live;
  }

  async function getGate() { if (gate === undefined) gate = await kv(LS_KV.gate); return gate; }

  /** Phần E2 cần: chuỗi IC (dạng E2) + trọng số E3-v5 tại phiên `asOf` + cổng. */
  async function evidenceExtras(asOf) {
    const d = await getDoc();
    if (!d) return null;
    const lv = live?.date === asOf ? live : await kv(LS_KV.live);
    const regimeNow = lv?.date === asOf ? lv.regime : d.regime?.[asOf] ?? null;
    const guardNow = lv?.date === asOf ? Boolean(lv.guard) : Boolean(d.guard?.[asOf]);
    const cal = asOf > d.cal[d.cal.length - 1] ? [...d.cal, asOf] : d.cal;
    const weighting = lsWeighting(d.ic?.[5], d.regime, regimeNow, asOf, cal);
    const g = await getGate();
    const series = Object.fromEntries(Object.entries(d.ic).map(([h, m]) => [h, Object.fromEntries(Object.entries(m).filter(([, v]) => v[2] <= asOf).map(([day, v]) => [day, [v[0], v[1]]]))]));
    return { series, weighting, regime: regimeNow, guard: guardNow, gateLive: g?.pass === true, gate: g ? { pass: g.pass, ranAt: g.ranAt, verdictVi: g.verdictVi } : null, from: d.from, to: d.to };
  }

  /** Hồ sơ 360°: khối "Sức mạnh dẫn dắt" của một mã. */
  async function ticker(t, { evidence = null } = {}) {
    const lv = live ?? (await kv(LS_KV.live));
    const row = lv?.rows?.[t] ?? null;
    const ev = evidence?.signals?.find((s) => s.id === LS_ID) ?? null;
    const pct = (z) => (z == null ? null : Math.round(normCdf(z) * 1000) / 10);
    return {
      version: LS_VERSION, prereg: "backend/src/market/elite/LS-r1-prereg.md", ticker: t, date: lv?.date ?? null,
      ls: row?.ls ?? null, pct: pct(row?.ls), band: lsBand(row?.ls),
      components: COMPONENTS.map((c) => ({ id: c, labelVi: COMPONENT_VI[c], value: row?.comp?.[c] ?? null, pct: pct(row?.z?.[c]) })),
      market: lv ? { regime: lv.regime, regimeVi: REGIME_VI[lv.regime] ?? null, bias: lv.bias, breadth: lv.breadth, guard: lv.guard } : null,
      evidence: ev ? { tier: ev.tier, reasonVi: ev.reasonVi, main: ev.byH?.[5] ?? null, weighting: ev.weighting ?? null, icPost: ev.icPostOverride ?? null, gateLive: Boolean(ev.gateLive) } : null,
      gate: (await getGate()) ? { pass: gate.pass, ranAt: gate.ranAt, verdictVi: gate.verdictVi } : null,
    };
  }

  /** Cổng H4: chạy một lần (nền), lưu KV. */
  function runGate() {
    if (gating) return { running: true };
    if (!retroInputs) throw new Error("Chưa cấu hình dữ liệu kiểm định hồi cứu E7.");
    gating = (async () => {
      const t0 = now();
      const inputs = await retroInputs();
      const firstFlow = [...inputs.flow.keys()].sort()[0];
      const M = await pxMatrix();
      const s = lsIcSeries(M, { variants: VARIANT_VALUE, valuesFrom: firstFlow });
      const r = runLsGate({ inputs, ls: s, cal: M.dates });
      const out = { ...r, ranAt: new Date(now()).toISOString(), commit: commit(), runtimeMs: now() - t0, lsFrom: s.from, lsTo: s.to };
      await store.setKv(LS_KV.gate, out);
      gate = out;
      log.info?.(`[ls] cổng H4: ${out.verdictVi}`);
      return out;
    })().catch((e) => { log.warn?.(`[ls] cổng H4 lỗi: ${e.message}`); throw e; }).finally(() => { gating = null; });
    gating.catch(() => {});
    return { started: true };
  }

  return { build, ensureBuilt, live: computeLive, evidenceExtras, ticker, runGate, gate: getGate, status: async () => ({ version: LS_VERSION, doc: (await getDoc()) ? { from: doc.from, to: doc.to, builtAt: doc.builtAt, tickers: doc.tickers } : null, live: live ? { date: live.date, names: live.names, regime: live.regime, guard: live.guard } : null, gating: Boolean(gating), gate: (await getGate()) ? { pass: gate.pass, ranAt: gate.ranAt, verdictVi: gate.verdictVi, criteria: gate.criteria } : null }) };
}

export { lsIcPost };
