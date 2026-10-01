// Các job đồng bộ dữ liệu vào kho. Tất cả đi qua SourceRouter nên SSI luôn
// được ưu tiên; dữ liệu dự phòng được Reconciler thay bằng dữ liệu SSI khi
// SSI hoạt động trở lại (tự lành).

import { marketConfig } from "./config.js";
import { isTradingDay, lastCompletedSessionDate, vnDate } from "./calendar.js";
import { canonicalSymbol, isIndexSymbol } from "./normalizer.js";
import { addDays, mapLimit, sleep } from "./util.js";
import { notifyOps } from "./alerts.js";

const SSI_ONLY = ["ssiV3", "ssiFcV2"];

function datasetFor(symbol) {
  return isIndexSymbol(symbol)
    ? { dataset: "indexDaily", method: "getIndexDaily" }
    : { dataset: "ohlcvDaily", method: "getDailyOhlcv" };
}

export function createJobs(service, { now = Date.now, pauseMs = 200 } = {}) {
  const today = () => vnDate(new Date(now()));

  async function universe() {
    const symbols = new Set(await service.getEodUniverse().catch(() => []));
    for (const code of marketConfig().streamIndices) symbols.add(canonicalSymbol(code));
    return [...symbols];
  }

  async function fetchAndStore(symbol, from, to, opts) {
    const { dataset, method } = datasetFor(symbol);
    const r = await service.router.run(dataset, method, [symbol, from, to], opts);
    await service.store.upsertBars(symbol, r.data, r.source);
    return r;
  }

  return {
    /** Danh mục mã + thành phần chỉ số (mỗi sáng). */
    async syncSecurities() {
      const securities = await service.getSecuritiesList({ force: true });
      const components = {};
      for (const code of marketConfig().eodUniverseIndices) {
        const r = await service.getIndexComponents(code, { force: true }).catch((e) => ({ error: e.message }));
        components[code] = r.error ? { error: r.error } : { count: r.symbols.length, source: r.provenance.source };
      }
      return { securities: securities.data.length, source: securities.source, components };
    },

    /** Giá trần/sàn/tham chiếu của phiên hôm nay (trước ATO). */
    async syncPriceLimits() {
      if (!isTradingDay(new Date(now()))) return { skipped: "not_trading_day" };
      service.cache.entries.delete(`limits:${today()}`);
      const r = await service.getPriceLimits(today());
      return { count: r.limits.length, source: r.provenance.source };
    },

    /** Nến ngày của phiên vừa đóng cửa cho toàn bộ universe. */
    async syncEod() {
      const date = lastCompletedSessionDate(new Date(now()));
      const symbols = await universe();
      const bySource = {};
      const failed = [];
      await mapLimit(symbols, 2, async (symbol) => {
        try {
          const r = await fetchAndStore(symbol, addDays(date, -10), date);
          bySource[r.source] = (bySource[r.source] || 0) + 1;
        } catch (error) {
          failed.push({ symbol, error: error.message });
        }
        await sleep(pauseMs);
      });
      service.cache.clear();
      if (failed.length > symbols.length / 2) {
        void notifyOps("job:syncEod", `Đồng bộ EOD ${date} lỗi ${failed.length}/${symbols.length} mã.`);
      }
      return { date, symbols: symbols.length, bySource, failed: failed.slice(0, 20), failedCount: failed.length };
    },

    /**
     * Tự lành: thay các nến lấy từ nguồn dự phòng (60 ngày gần nhất) bằng nến SSI,
     * đồng thời đo độ lệch giá đóng cửa giữa hai nguồn để phát hiện dữ liệu sai.
     */
    async reconcile() {
      const rows = await service.store.listNonSsiBars(addDays(today(), -60));
      const bySymbol = new Map();
      for (const row of rows) {
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
        bySymbol.get(row.symbol).push(row);
      }
      let healed = 0;
      const deviations = [];
      const failed = [];
      for (const [symbol, legacyRows] of bySymbol) {
        const dates = legacyRows.map((r) => r.date).sort();
        try {
          const r = await fetchAndStore(symbol, dates[0], dates.at(-1), { only: SSI_ONLY });
          const ssiByDate = new Map(r.data.map((b) => [b.date, b.close]));
          for (const row of legacyRows) {
            const ssiClose = ssiByDate.get(row.date);
            if (ssiClose === undefined) continue;
            healed++;
            const diffPct = row.close ? Math.abs(ssiClose - row.close) / row.close * 100 : 0;
            if (diffPct > 1) deviations.push({ symbol, date: row.date, legacy: row.close, ssi: ssiClose, diffPct: Number(diffPct.toFixed(2)) });
          }
        } catch (error) {
          failed.push({ symbol, error: error.message });
        }
        await sleep(pauseMs);
      }
      if (deviations.length) {
        const sample = deviations.slice(0, 5).map((d) => `${d.symbol} ${d.date}: ${d.legacy} vs SSI ${d.ssi} (${d.diffPct}%)`).join("; ");
        void notifyOps("job:reconcile:deviation", `Nguồn dự phòng lệch giá SSI >1% ở ${deviations.length} nến. VD: ${sample}`);
      }
      service.cache.clear();
      return { symbols: bySymbol.size, healed, deviations: deviations.slice(0, 50), failed: failed.slice(0, 20) };
    },

    /** Bổ sung lịch sử MARKET_BACKFILL_YEARS năm cho universe, rải tải qua nhiều đêm. */
    async backfill() {
      const cfg = marketConfig();
      const maxSymbols = Number(process.env.MARKET_BACKFILL_MAX_SYMBOLS) || 50;
      const target = addDays(today(), -Math.round(365.25 * cfg.backfillYears));
      const end = lastCompletedSessionDate(new Date(now()));
      const done = [];
      const failed = [];
      for (const symbol of await universe()) {
        if (done.length + failed.length >= maxSymbols) break;
        const cov = await service.store.coverage(symbol).catch(() => null);
        if (cov && cov.first <= addDays(target, 10) && cov.last >= end) continue;
        try {
          const to = cov && cov.first <= addDays(target, 10) ? end : (cov ? addDays(cov.first, -1) : end);
          const from = cov && cov.first <= addDays(target, 10) ? addDays(cov.last, -3) : target;
          const r = await fetchAndStore(symbol, from, to);
          done.push({ symbol, bars: r.data.length, source: r.source });
        } catch (error) {
          failed.push({ symbol, error: error.message });
        }
        await sleep(pauseMs);
      }
      return { target, processed: done.length, done: done.slice(0, 50), failed: failed.slice(0, 20) };
    },
  };
}
