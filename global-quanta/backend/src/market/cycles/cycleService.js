// Cycle Fingerprint v2 — phục vụ trực tuyến (Gateway). Dựng thư viện theo thời điểm từ KHO (createScreenerSeries — không gọi SSI)
// cho universe scanner, giữ trong bộ nhớ; truy vấn một mã = cửa sổ 30 phiên gần nhất -> 30 giai đoạn tương tự toàn universe.
// Cấu hình CHỐT từ CF3 (cf3-config.json, SHA-256) — không chỉnh tay. Nhãn bằng chứng: CYCLE_VALIDATION.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createScreenerSeries } from "../strategies/screenerSeries.js";
import { ICB_KV } from "../sectors/icbTaxonomy.js";
import { buildCalendar, buildLibrary, eligiblePrefix, HORIZONS, prepareSeries, windowFeatures } from "./library.js";
import { absoluteSimilarity, candidatePool, forecastFromPool } from "./engine.js";
import { hashConfig } from "./validate.js";
import { CYCLE_VALIDATION } from "./validation.js";
import { LEDGER_INDEX_KV, ledgerKv, recordSnapshot, scoreLedger, snapshotRow } from "./ledger.js";

export const CYCLE_ENGINE = "cycles/CF2";
const CONFIG = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./cf3-config.json", import.meta.url)), "utf8"));
if (hashConfig(CONFIG) !== CONFIG.sha256) throw new Error("cf3-config.json bị sửa (SHA-256 không khớp).");
export const CYCLE_CONFIG = CONFIG;

const HISTORY_DAYS = 1826;
const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(Math.expm1(x) * 10000) / 100); // log -> %
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

async function mapLimit(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

/** Dựng ngữ cảnh (lịch, chuỗi, thư viện) từ map chuỗi + VN-Index + ngành — dùng chung cho job và test. */
export function buildCycleContext({ seriesOf, benchBars, sectorOf, now = Date.now }) {
  const cal = buildCalendar(benchBars);
  const prep = prepareSeries({ seriesOf, sectorOf, cal });
  const lib = buildLibrary(prep, cal, { W: CONFIG.W, M: 10, stride: 2, minValue: 5e9 });
  const index = new Map(prep.prepared.map((s, k) => [s.ticker, k]));
  return { cal, prep, lib, index, builtAt: new Date(now()).toISOString(), dataAsOf: cal.dates.at(-1) };
}

/** base 100 tại phiên đầu của mảng closes[a..b]. */
const base100 = (closes, a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(Math.round((closes[i] / closes[a]) * 10000) / 100); return out; };

/** Chuẩn bị chuỗi của một mã NGOÀI thư viện theo lịch & trung vị ngành của ngữ cảnh (chỉ để truy vấn, không thêm vào thư viện). */
export function prepareExternal(ctx, ticker, bars, sector = null) {
  const kept = bars.filter((b) => !b.partial && b.close > 0 && ctx.cal.calOf.has(b.date));
  if (kept.length < 320) return null;
  return {
    ticker, sector, dates: kept.map((b) => b.date), closes: kept.map((b) => b.close),
    values: kept.map((b) => (b.value > 0 ? b.value : (b.volume ?? 0) * b.close)),
    cal: Int32Array.from(kept, (b) => ctx.cal.calOf.get(b.date)),
  };
}

/** Truy vấn một mã trên ngữ cảnh đã dựng (hoặc chuỗi ngoài `external`). Trả null nếu thiếu dữ liệu. */
export function queryCycles(ctx, symbol, external = null) {
  const k = ctx.index.get(symbol);
  if (k == null && !external) return null;
  const s = k != null ? ctx.prep.prepared[k] : external, { lib, cal, prep } = ctx;
  const e = s.closes.length - 1;
  const f = windowFeatures(s, e, { W: lib.W, M: lib.M, cal, sectorMedian: prep.sectorMedian });
  if (!f) return null;
  const c = s.cal[e];
  const L = eligiblePrefix(lib, c + 1); // diễn biến 60 phiên sau đã kết thúc tới hôm nay
  const sid = s.sector == null ? -1 : lib.sectors.indexOf(s.sector);
  const pool = candidatePool(lib, { ...f, sid }, L, { ctxSd: CONFIG.ctxSd });
  const fc = forecastFromPool(lib, L, pool, { lambda: CONFIG.lambda, hMult: CONFIG.hMult, h0: CONFIG.h0 });
  const H = lib.H, W = lib.W;
  const neighbors = fc.neighbors.map((i, j) => {
    const ns = prep.prepared[lib.tid[i]];
    // vị trí điểm cuối trong chuỗi của mã láng giềng
    let ee = -1; for (let t = ns.cal.length - 1; t >= 0; t--) if (ns.cal[t] === lib.endCal[i]) { ee = t; break; }
    return {
      ticker: ns.ticker, sector: ns.sector, sameSector: sid >= 0 && lib.sid[i] === sid,
      start: ee >= 0 ? ns.dates[ee - W + 1] : null, end: ee >= 0 ? ns.dates[ee] : null,
      similarity: r3(absoluteSimilarity(fc.dist[j], CONFIG.nullQuantiles)), distance: r3(fc.dist[j]), weight: r3(fc.ws[j]),
      excess: Object.fromEntries(HORIZONS.map((h, q) => [`d${h}`, pct(lib.y[i * H + q])])),
      pattern: ee >= 0 ? base100(ns.closes, ee - W + 1, ee) : [],
      forward: ee >= 0 ? base100(ns.closes, ee, Math.min(ee + 60, ns.closes.length - 1)) : [],
    };
  });
  const tot = fc.ws.reduce((a, b) => a + b, 0) || 1;
  const vb = f.ctx[0] <= CONFIG.volCuts[0] ? 0 : f.ctx[0] <= CONFIG.volCuts[1] ? 1 : 2;
  const q20 = CONFIG.conformal[vb], h20 = HORIZONS.indexOf(20);
  return {
    symbol, sector: s.sector, asOf: s.dates[e], window: W,
    current: { dates: s.dates.slice(Math.max(0, e - 89)), closes: s.closes.slice(Math.max(0, e - 89)).map((x) => Math.round(x * 100) / 100), pattern: base100(s.closes, e - W + 1, e) },
    neighbors,
    forecast: {
      horizons: HORIZONS.map((h, q) => ({ h, excessPct: pct(fc.pred[q]), rawPct: pct(fc.raw[q]), baselinePct: pct(fc.mu0[q]), pOutperform: r3(fc.pUp[q]) })),
      nEff: r3(fc.nEff), shrink: r3(fc.shrink), avgSimilarity: r3(neighbors.reduce((a, n, j) => a + n.similarity * fc.ws[j], 0) / tot),
      sameSectorShare: r3(neighbors.filter((n) => n.sameSector).length / Math.max(neighbors.length, 1)),
      interval80: { h: 20, loPct: pct(fc.pred[h20] + q20.lo), hiPct: pct(fc.pred[h20] + q20.hi), calibrated: CYCLE_VALIDATION.coverage.ok, oosCoverage: CYCLE_VALIDATION.coverage.value },
    },
    library: { windows: L, tickers: lib.tickers.length },
    inLibrary: k != null,
  };
}

export function createCycleService({ service, corporateActions, taSeries = null, now = Date.now }) {
  const store = service.store;
  let ctx = null, inflight = null, ledgerDocs = null;
  const cache = new Map();
  /** Bản chụp dự báo của mọi mã trong thư viện cho ngày dữ liệu hiện tại (ghi một lần / ngày). */
  async function snapshot(c) {
    const rows = [];
    for (const t of c.lib.tickers) { const q = queryCycles(c, t); if (q) rows.push(snapshotRow(t, q)); }
    return recordSnapshot(store, { date: c.dataAsOf, engine: CYCLE_ENGINE, sha256: CONFIG.sha256, rows });
  }
  async function loadLedger(c) {
    if (ledgerDocs?.builtAt === c.builtAt) return ledgerDocs.docs;
    const dates = ((await store.getKv(LEDGER_INDEX_KV))?.value?.dates ?? []).slice(-120);
    const docs = [];
    for (const d of dates) { const v = (await store.getKv(ledgerKv(d)))?.value; if (v?.rows) docs.push(v); }
    ledgerDocs = { builtAt: c.builtAt, docs };
    return docs;
  }
  async function build() {
    const universe = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
    if (!universe.length) throw new Error("Chưa có universe.");
    const icb = (await store.getKv(ICB_KV))?.value ?? null;
    const loadSeries = await createScreenerSeries({ store, corporateActions, historyDays: HISTORY_DAYS }).prepare(universe.map((u) => u.ticker));
    const seriesOf = new Map();
    let skipped = 0, viaTaSeries = 0;
    const retry = [];
    await mapLimit(universe, 6, async (u) => {
      try {
        const r = await loadSeries(u.ticker);
        if (r?.priceBasis !== "ADJUSTED_CUMULATIVE") { retry.push(u.ticker); return; }
        const bars = (r.bars ?? []).filter((b) => !b.partial && b.close > 0);
        if (bars.length) seriesOf.set(u.ticker, bars);
      } catch { retry.push(u.ticker); }
    });
    // Kho chưa khôi phục được chuỗi cộng dồn (độ khớp danh nghĩa < 90%) -> lấy /ta-series (nguồn đã dùng cho CF3), nhẹ tay 2 luồng.
    // Cùng quy tắc dữ liệu với CF3: chỉ nhận ADJUSTED_CUMULATIVE.
    await mapLimit(retry, 2, async (t) => {
      try {
        const r = taSeries ? await taSeries.get({ symbol: t, range: "5y", limit: 1400 }) : null;
        if (r?.priceBasis !== "ADJUSTED_CUMULATIVE") { skipped++; return; }
        seriesOf.set(t, (r.bars ?? []).filter((b) => !b.partial && b.close > 0)); viaTaSeries++;
      } catch { skipped++; }
    });
    const benchBars = (await loadSeries.index("VNINDEX")).filter((b) => !b.partial && b.close > 0);
    if (benchBars.length < 400) throw new Error(`VN-Index chỉ có ${benchBars.length} phiên.`);
    const sectorOf = new Map(Object.entries(icb?.symbols ?? {}).map(([t, v]) => [t, v?.l2 ?? null]));
    const next = buildCycleContext({ seriesOf, benchBars, sectorOf, now });
    next.skipped = skipped; next.viaTaSeries = viaTaSeries; next.sectorOf = sectorOf;
    ctx = next; cache.clear();
    return { windows: next.lib.N, tickers: next.lib.tickers.length, skipped, viaTaSeries, dataAsOf: next.dataAsOf };
  }
  async function ledgerFor(symbol = null) {
    const c = await ensure();
    return { engine: CYCLE_ENGINE, dataAsOf: c.dataAsOf, horizon: 20, ...scoreLedger(c, await loadLedger(c), { symbol }) };
  }
  const ensure = () => (ctx ? Promise.resolve(ctx) : (inflight ??= build().then(() => ctx).finally(() => { inflight = null; })));
  return {
    jobs: {
      // 16:05 ngày giao dịch: dựng thư viện rồi ghi bản chụp sổ theo dõi (bỏ qua nếu ngày đó đã ghi)
      buildCycleLibrary: async () => {
        const info = await (inflight ??= build().finally(() => { inflight = null; }));
        const snap = await snapshot(ctx);
        ledgerDocs = null;
        return { ...info, ledger: snap };
      },
    },
    ledger: ledgerFor,
    async query(symbol) {
      const c = await ensure();
      const key = `${c.builtAt}:${symbol}`;
      if (cache.has(key)) return cache.get(key);
      let r = queryCycles(c, symbol);
      if (!r && taSeries) { // mã ngoài thư viện: truy vấn bằng chuỗi /ta-series của chính mã (không thêm vào thư viện)
        const ts = await taSeries.get({ symbol, range: "5y", limit: 1400 }).catch(() => null);
        if (ts?.priceBasis === "ADJUSTED_CUMULATIVE") {
          const ext = prepareExternal(c, symbol, ts.bars ?? [], c.sectorOf?.get(symbol) ?? null);
          if (ext) r = { ...queryCycles(c, symbol, ext), inLibrary: false };
        }
      }
      const led = r ? await ledgerFor(symbol).catch(() => null) : null;
      const doc = r && { engine: CYCLE_ENGINE, ledger: led, builtAt: c.builtAt, dataAsOf: c.dataAsOf, config: { sha256: CONFIG.sha256, lambda: CONFIG.lambda, hMult: CONFIG.hMult, W: CONFIG.W }, evidence: CYCLE_VALIDATION, ...r };
      if (cache.size > 500) cache.clear();
      cache.set(key, doc);
      return doc;
    },
  };
}

export const CYCLE_SCHEDULE = [{ name: "buildCycleLibrary", at: "16:05", tradingDayOnly: true }];
