// Cycle Fingerprint v2 — phục vụ trực tuyến (Gateway). Dựng thư viện theo thời điểm từ KHO (createScreenerSeries — không gọi SSI)
// cho universe scanner, giữ trong worker thread và lưu file trên Railway Volume (khởi động lại chỉ đọc file); truy vấn một mã = cửa sổ 30 phiên gần nhất -> 30 giai đoạn tương tự toàn universe.
// Cấu hình CHỐT từ CF3 (cf3-config.json, SHA-256) — không chỉnh tay. Nhãn bằng chứng: CYCLE_VALIDATION.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadAdjustedUniverse } from "../universeSeries.js";
import { buildCalendar, buildLibrary, eligiblePrefix, HORIZONS, prepareSeries, windowFeatures } from "./library.js";
import { absoluteSimilarity, candidatePool, forecastFromPool } from "./engine.js";
import { hashConfig } from "./validate.js";
import { CYCLE_VALIDATION } from "./validation.js";
import { analogSummary } from "./analogStats.js";
import { LEDGER_INDEX_KV, LEDGER_PREFIX, ledgerKv, recordSnapshot } from "./ledger.js";
import { createCycleHost } from "./cycleHost.js";
import { alertMissingSessions, assertLatestSession, loadLedgerIndex, missingSessions } from "../ledgerIndex.js";

export const CYCLE_ENGINE = "cycles/CF2";
const CONFIG = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./cf3-config.json", import.meta.url)), "utf8"));
if (hashConfig(CONFIG) !== CONFIG.sha256) throw new Error("cf3-config.json bị sửa (SHA-256 không khớp).");
export const CYCLE_CONFIG = CONFIG;

const HISTORY_DAYS = 1826;
const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(Math.expm1(x) * 10000) / 100); // log -> %
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);


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

export function createCycleService({ service, corporateActions, taSeries = null, now = Date.now, host = createCycleHost() }) {
  const store = service.store;
  let ensuring = null, building = null, ledgerDocs = null;
  const cache = new Map();
  /** Bản chụp dự báo của mọi mã trong thư viện cho ngày dữ liệu hiện tại (ghi một lần / ngày). */
  async function snapshot(info) {
    const rows = await host.run("snapshotRows");
    return recordSnapshot(store, { date: info.dataAsOf, engine: CYCLE_ENGINE, sha256: CONFIG.sha256, rows });
  }
  async function loadLedger(info) {
    if (ledgerDocs?.builtAt === info.builtAt) return ledgerDocs.docs;
    const dates = (await loadLedgerIndex(store, LEDGER_INDEX_KV, LEDGER_PREFIX)).dates.slice(-120);
    const docs = [];
    for (const d of dates) { const v = (await store.getKv(ledgerKv(d)))?.value; if (v?.rows) docs.push(v); }
    ledgerDocs = { builtAt: info.builtAt, docs };
    return docs;
  }
  // Dựng từ kho rồi chuyển sang nơi giữ thư viện (worker); luồng chính không giữ lại ngữ cảnh sau khi chuyển.
  function build() {
    return (building ??= (async () => {
      const t0 = now();
      const { seriesOf, benchBars, sectorOf, skipped, viaTaSeries } = await loadAdjustedUniverse({ store, corporateActions, taSeries, historyDays: HISTORY_DAYS });
      if (benchBars.length < 400) throw new Error(`VN-Index chỉ có ${benchBars.length} phiên.`);
      const next = buildCycleContext({ seriesOf, benchBars, sectorOf, now });
      next.skipped = skipped; next.viaTaSeries = viaTaSeries; next.sectorOf = sectorOf;
      const loaded = await host.put(next, { sha256: CONFIG.sha256, engine: CYCLE_ENGINE, dataAsOf: next.dataAsOf, builtAt: next.builtAt });
      cache.clear(); ledgerDocs = null;
      return { windows: loaded.windows, tickers: loaded.tickers, skipped, viaTaSeries, dataAsOf: loaded.dataAsOf, buildMs: now() - t0, host: host.status() };
    })().finally(() => { building = null; }));
  }
  /** Thư viện đã nạp; chưa có thì đọc file trên Volume, không có file thì dựng từ kho. */
  function ensure() {
    const loaded = host.loaded();
    if (loaded) return Promise.resolve(loaded);
    return (ensuring ??= (async () => (await host.loadFromDisk(CONFIG.sha256).catch(() => null)) ?? (await build(), host.loaded()))().finally(() => { ensuring = null; }));
  }
  async function ledgerFor(symbol = null) {
    const info = await ensure();
    const docs = await loadLedger(info);
    const scored = await host.run("score", { docs, symbol });
    return { engine: CYCLE_ENGINE, dataAsOf: info.dataAsOf, horizon: 20, ...scored, missingSessions: missingSessions(docs.map((d) => d.date), info.calDates) };
  }
  return {
    jobs: {
      // 16:05 ngày giao dịch: dựng thư viện rồi ghi bản chụp sổ theo dõi (bỏ qua nếu ngày đó đã ghi)
      buildCycleLibrary: async () => {
        const info = await build();
        const loaded = host.loaded();
        const snap = await snapshot(loaded);
        ledgerDocs = null;
        alertMissingSessions("Cycle Fingerprint", missingSessions((await loadLedgerIndex(store, LEDGER_INDEX_KV, LEDGER_PREFIX)).dates, loaded.calDates));
        assertLatestSession(info.dataAsOf, "buildCycleLibrary", now());
        return { ...info, ledger: snap };
      },
    },
    /** Nạp sẵn thư viện khi khởi động (đọc file trên Volume nếu có), để yêu cầu đầu tiên không phải chờ. */
    warm: () => ensure().then((i) => ({ dataAsOf: i.dataAsOf, host: host.status() })),
    status: async () => ({ ...host.status(), worker: await host.workerInfo().catch((e) => ({ error: e.message })) }),
    close: () => host.close(),
    ledger: ledgerFor,
    /** Tóm tắt giai đoạn tương tự cho nhiều mã (bảng Top 20). Dùng lại kết quả truy vấn đã lưu đệm; mã ngoài thư viện thì bỏ. */
    async summary(symbols) {
      const out = [];
      for (const s of symbols) {
        const doc = await this.query(s).catch(() => null);
        if (doc) out.push(analogSummary(doc));
      }
      const info = await ensure();
      return { engine: CYCLE_ENGINE, dataAsOf: info.dataAsOf, horizon: 20, method: "trung vị và dải 10–90% có trọng số của lợi suất vượt VN-Index 20 phiên sau 30 giai đoạn tương tự", rows: out };
    },
    async query(symbol) {
      const info = await ensure();
      const key = `${info.builtAt}:${symbol}`;
      if (cache.has(key)) return cache.get(key);
      let r = await host.run("query", { symbol });
      if (!r && taSeries) { // mã ngoài thư viện: truy vấn bằng chuỗi /ta-series của chính mã (không thêm vào thư viện)
        const ts = await taSeries.get({ symbol, range: "5y", limit: 1400 }).catch(() => null);
        if (ts?.priceBasis === "ADJUSTED_CUMULATIVE") r = await host.run("query", { symbol, external: { bars: ts.bars ?? [] } });
      }
      const led = r ? await ledgerFor(symbol).catch(() => null) : null;
      const doc = r && { engine: CYCLE_ENGINE, ledger: led, builtAt: info.builtAt, dataAsOf: info.dataAsOf, config: { sha256: CONFIG.sha256, lambda: CONFIG.lambda, hMult: CONFIG.hMult, W: CONFIG.W }, evidence: CYCLE_VALIDATION, ...r };
      if (cache.size > 500) cache.clear();
      cache.set(key, doc);
      return doc;
    },
  };
}

export const CYCLE_SCHEDULE = [{ name: "buildCycleLibrary", at: "16:05", tradingDayOnly: true }];
