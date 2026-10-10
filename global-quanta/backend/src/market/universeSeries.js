// Chuỗi giá ĐIỀU CHỈNH CỘNG DỒN cho cả universe scanner — dùng chung cho Cycle Fingerprint v2 và Radar Top 20.
//   1. Kho (createScreenerSeries — không gọi SSI): nhận khi priceBasis = ADJUSTED_CUMULATIVE.
//   2. Mã kho chưa khôi phục được chuỗi cộng dồn (độ khớp danh nghĩa < 90%) -> /ta-series (nguồn đã dùng cho CF3), 2 luồng.
//   Chỉ nhận ADJUSTED_CUMULATIVE; mã còn lại bỏ qua (đếm skipped).
import { createScreenerSeries } from "./strategies/screenerSeries.js";
import { ICB_KV } from "./sectors/icbTaxonomy.js";

export async function mapLimit(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
}

export async function loadAdjustedUniverse({ store, corporateActions, taSeries = null, historyDays = 1826 }) {
  const universe = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
  if (!universe.length) throw new Error("Chưa có universe.");
  const icb = (await store.getKv(ICB_KV))?.value ?? null;
  const loadSeries = await createScreenerSeries({ store, corporateActions, historyDays }).prepare(universe.map((u) => u.ticker));
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
  await mapLimit(retry, 2, async (t) => {
    try {
      const r = taSeries ? await taSeries.get({ symbol: t, range: "5y", limit: 1400 }) : null;
      if (r?.priceBasis !== "ADJUSTED_CUMULATIVE") { skipped++; return; }
      seriesOf.set(t, (r.bars ?? []).filter((b) => !b.partial && b.close > 0)); viaTaSeries++;
    } catch { skipped++; }
  });
  const benchBars = (await loadSeries.index("VNINDEX")).filter((b) => !b.partial && b.close > 0);
  const sectorOf = new Map(Object.entries(icb?.symbols ?? {}).map(([t, v]) => [t, v?.l2 ?? null]));
  return { universe, seriesOf, benchBars, sectorOf, icb, skipped, viaTaSeries };
}
