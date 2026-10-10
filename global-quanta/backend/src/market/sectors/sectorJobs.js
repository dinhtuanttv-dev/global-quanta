// Lọc ngành (L1) — job của Gateway:
//   refreshIcbTaxonomy   03:20 hằng đêm  — phân ngành ICB VNDirect (chỉ tải lại khi bản lưu > 7 ngày hoặc force)
//   buildSectorRotation  15:50 ngày GD   — chỉ số ngành + RRG tuần cho mọi ngành ICB cấp 2/3 (chỉ đọc kho), lưu KV
import { mapLimit } from "../util.js";
import { createScreenerSeries } from "../strategies/screenerSeries.js";
import { fetchIcbTaxonomy, ICB_KV, ICB_MAX_AGE_MS } from "./icbTaxonomy.js";
import { buildSectorRotation, SECTOR_RRG_HISTORY_KV, SECTOR_RRG_KV } from "./sectorRotation.js";

/** Nhãn bộ lọc Gateway đang chứa mã (đọc KV strategies:<id>) — gắn cho cổ phiếu dẫn dắt của ngành. */
export async function screenerTags(store) {
  const tags = new Map(), add = (t, x) => { if (!tags.has(t)) tags.set(t, []); if (!tags.get(t).includes(x)) tags.get(t).push(x); };
  const kv = async (id) => (await store.getKv(`strategies:${id}`))?.value?.results ?? [];
  for (const r of await kv("sepa")) if (r.list && r.list !== "LOẠI") add(r.ticker, `SEPA · ${r.list}`);
  for (const r of await kv("camslim")) add(r.ticker, "CAN SLIM");
  for (const r of await kv("base-breakout")) add(r.ticker, "Base Breakout");
  for (const r of await kv("convergence")) if (r.side === "buy") add(r.ticker, "Hợp lưu v2");
  for (const r of await kv("patterns")) if ((r.patterns ?? []).some((p) => p.dir === "bull" && ["BREAKOUT", "CONFIRMED", "PULLBACK"].includes(p.state))) add(r.ticker, "Mô hình giá");
  return (t) => tags.get(t) ?? [];
}

export const SECTOR_HISTORY_DAYS = 1826; // ~5 năm lịch (kho có bao nhiêu dùng bấy nhiêu)

export function createSectorJobs({ service, corporateActions, now = Date.now, fetchImpl = globalThis.fetch }) {
  const store = service.store;
  async function taxonomy({ force = false } = {}) {
    const stored = (await store.getKv(ICB_KV))?.value ?? null;
    if (!force && stored && now() - Date.parse(stored.updatedAt) < ICB_MAX_AGE_MS) return stored;
    try {
      const icb = await fetchIcbTaxonomy({ fetchImpl });
      const doc = { ...icb, source: "VNDIRECT_FINFO", updatedAt: new Date(now()).toISOString() };
      await store.setKv(ICB_KV, doc);
      return doc;
    } catch (error) {
      if (stored) return stored; // VNDirect lỗi -> giữ bản cũ
      throw error;
    }
  }
  return {
    async refreshIcbTaxonomy({ force = false } = {}) {
      const t = await taxonomy({ force });
      return { updatedAt: t.updatedAt, l2: t.levels[2].length, l3: t.levels[3].length, symbols: Object.keys(t.symbols).length };
    },
    async buildSectorRotation() {
      const icb = await taxonomy();
      const universe = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
      if (!universe.length) throw new Error("Chưa có universe.");
      const loadSeries = await createScreenerSeries({ store, corporateActions, historyDays: SECTOR_HISTORY_DAYS }).prepare(universe.map((u) => u.ticker));
      const seriesOf = new Map();
      await mapLimit(universe, 6, async (u) => {
        try {
          const s = await loadSeries(u.ticker);
          const bars = (s?.bars ?? []).filter((b) => !b.partial && b.close > 0);
          if (bars.length) seriesOf.set(u.ticker, bars);
        } catch { /* bỏ mã lỗi */ }
      });
      const benchBars = (await loadSeries.index("VNINDEX")).filter((b) => !b.partial && b.close > 0);
      if (benchBars.length < 200) throw new Error(`VN-Index chỉ có ${benchBars.length} phiên.`);
      const { summary, history } = buildSectorRotation({ universe, icb, seriesOf, benchBars, tagsOf: await screenerTags(store), now });
      await store.setKv(SECTOR_RRG_KV, summary);
      await store.setKv(SECTOR_RRG_HISTORY_KV, history);
      return { sectors: summary.sectors.length, dataAsOf: summary.dataAsOf, closedThrough: summary.closedThrough, coverage: summary.coverage };
    },
  };
}

export const SECTOR_SCHEDULE = [
  { name: "refreshIcbTaxonomy", at: "03:20", tradingDayOnly: false },
  { name: "buildSectorRotation", at: "15:50", tradingDayOnly: true },
];
