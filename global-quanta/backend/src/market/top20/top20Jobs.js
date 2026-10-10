// Radar Top 20 (T0) — job dựng thành phần đầu vào cho cả universe (15:52 ngày giao dịch, sau market_daily 15:20 và RRG ngành 15:50)
// -> KV top20:inputs. Đọc kho + /ta-series cho mã kho chưa cộng dồn được (loadAdjustedUniverse); không ghi gì khác.
import { loadAdjustedUniverse } from "../universeSeries.js";
import { buildTop20Inputs } from "./top20Inputs.js";

export const TOP20_INPUTS_KV = "top20:inputs";

export function createTop20Service({ service, corporateActions, taSeries = null, now = Date.now }) {
  const store = service.store;
  let inflight = null;
  async function build() {
    const { seriesOf, benchBars, skipped, viaTaSeries } = await loadAdjustedUniverse({ store, corporateActions, taSeries, historyDays: 400 });
    if (benchBars.length < 64) throw new Error(`VN-Index chỉ có ${benchBars.length} phiên.`);
    const doc = { ...buildTop20Inputs({ seriesOf, benchBars, now }), skipped, viaTaSeries };
    await store.setKv(TOP20_INPUTS_KV, doc);
    return doc;
  }
  const run = () => (inflight ??= build().finally(() => { inflight = null; }));
  return {
    jobs: { buildTop20Inputs: async () => { const d = await run(); return { count: d.count, liquid: d.liquid, dataAsOf: d.dataAsOf, skipped: d.skipped, viaTaSeries: d.viaTaSeries }; } },
    /** Bản đã dựng; chưa có thì dựng ngay (lần đầu sau deploy). */
    async inputs() {
      const doc = (await store.getKv(TOP20_INPUTS_KV))?.value ?? null;
      return doc ?? run();
    },
  };
}

export const TOP20_SCHEDULE = [{ name: "buildTop20Inputs", at: "15:52", tradingDayOnly: true }];
