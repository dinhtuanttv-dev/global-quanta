// Elite 10 E7 — chạy kiểm định hồi cứu walk-forward trên dữ liệu Gateway và lưu kết quả (KV `elite:retro`). Chạy theo yêu cầu admin
// (đọc toàn bộ đặc trưng dòng tiền + ~1,2 năm giá: một lần, không chạy định kỳ).
import { T as RESEARCH_T } from "../research/researchJobs.js";
import { RETRO_SIGNALS, runRetro } from "./retroCore.js";
import { noteStoreError } from "./storeHealth.js";

export const RETRO_KV = "elite:retro";
const CAL_SYMBOLS = ["VNM", "FPT", "HPG", "VCB", "MWG"];
const isoMinusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

export function createRetroService({ store, taxonomy, vnIndex, now = Date.now, log = console }) {
  let running = null;
  let memo = null;

  async function run() {
    if (running) return running;
    running = (async () => {
      const t0 = now();
      const last = new Date(now() + 7 * 3_600_000).toISOString().slice(0, 10);
      const from = isoMinusDays(last, 560);
      const rows = await store.selectRows(RESEARCH_T.flow, { select: "symbol,trading_date,features", gte: { trading_date: from } });
      const flow = new Map();
      for (const r of rows ?? []) {
        if (!r.features) continue;
        const keep = {};
        for (const k of Object.values(RETRO_SIGNALS)) if (Number.isFinite(Number(r.features[k]))) keep[k] = Number(r.features[k]);
        if (!flow.has(r.trading_date)) flow.set(r.trading_date, new Map());
        flow.get(r.trading_date).set(String(r.symbol).toUpperCase(), keep);
      }
      const symbols = [...new Set([...flow.values()].flatMap((m) => [...m.keys()]))];
      const firstFlow = [...flow.keys()].sort()[0];
      if (!firstFlow) throw new Error("Không có đặc trưng dòng tiền để kiểm định.");
      const priceRows = await store.getMarketDailyRange({ from: isoMinusDays(firstFlow, 140), to: last, symbols: [...new Set([...symbols, ...CAL_SYMBOLS])], columns: "symbol,trading_date,close_adj,value" });
      const prices = new Map();
      for (const r of priceRows) if (r.closeAdj > 0) { if (!prices.has(r.symbol)) prices.set(r.symbol, []); prices.get(r.symbol).push({ date: r.date, closeAdj: r.closeAdj, value: r.value ?? null }); }
      for (const list of prices.values()) list.sort((a, b) => a.date.localeCompare(b.date));
      const cal = [...new Set(CAL_SYMBOLS.flatMap((s) => (prices.get(s) ?? []).map((r) => r.date)))].sort();
      const tax = await taxonomy().catch(() => null);
      const sectors = new Map(symbols.map((s) => [s, tax?.symbols?.[s]?.l2 ?? null]));
      let vn = new Map();
      try { vn = new Map(await vnIndex()); } catch (e) { log.warn?.(`[elite] retro vnIndex: ${e.message}`); }
      for (const s of CAL_SYMBOLS) if (!symbols.includes(s)) prices.delete(s);
      const result = runRetro({ cal, flow, prices, sectors, vnIndex: vn });
      const doc = { ...result, generatedAt: new Date(now()).toISOString(), runtimeMs: now() - t0, data: { flowDates: flow.size, symbols: symbols.length, priceRows: priceRows.length } };
      await store.setKv(RETRO_KV, doc);
      memo = doc;
      return doc;
    })().finally(() => { running = null; });
    return running;
  }

  async function result() {
    if (memo) return memo;
    try { memo = (await store.getKv(RETRO_KV))?.value ?? null; } catch (e) { noteStoreError(e); memo = null; }
    return memo;
  }

  return { run, result };
}
