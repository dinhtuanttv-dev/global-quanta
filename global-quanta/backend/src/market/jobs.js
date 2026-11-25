// Các job đồng bộ dữ liệu vào kho. Tất cả đi qua SourceRouter nên SSI luôn
// được ưu tiên; dữ liệu dự phòng được Reconciler thay bằng dữ liệu SSI khi
// SSI hoạt động trở lại (tự lành).

import { marketConfig } from "./config.js";
import { isTradingDay, lastCompletedSessionDate, vnDate } from "./calendar.js";
import { canonicalSymbol, isIndexSymbol } from "./normalizer.js";
import { addDays, mapLimit, sleep } from "./util.js";
import { notifyOps } from "./alerts.js";
import { validClosedBar, fetchVndirectClose } from "./providers/vndirectClose.js";

const SSI_ONLY = ["ssiV3", "ssiFcV2"];

function datasetFor(symbol) {
  return isIndexSymbol(symbol)
    ? { dataset: "indexDaily", method: "getIndexDaily" }
    : { dataset: "ohlcvDaily", method: "getDailyOhlcv" };
}

export function createJobs(service, { now = Date.now, pauseMs = 200, fallbackDay = fetchVndirectClose } = {}) {
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
      const checkpoint = (await service.store.getKv("local:eod:coverage:" + date))?.value;
      const universe = checkpoint?.core?.length ? checkpoint.core : service.getUniverse ?
        (await service.getUniverse()).tickers.map((row) => row.ticker) : await service.getEodUniverse();
      const core = new Set(universe.map(canonicalSymbol).filter((s) => /^[A-Z][A-Z0-9]{2}$/.test(s) && !isIndexSymbol(s)));
      const symbols = [...new Set([...core, ...(service.hub?.trackedSymbols() ?? []), ...marketConfig().streamIndices.map(canonicalSymbol)])];
      const bySource = {};
      const fallbacks = {};
      const failed = [];
      const previouslyClosed = new Set(checkpoint?.symbols ?? []);
      const confirmed = new Set();
      const hasTarget = (rows) => Array.isArray(rows) && rows.some((bar) => validClosedBar(bar, date));
      await mapLimit(symbols, 2, async (symbol) => {
        try {
          if (previouslyClosed.has(symbol) && hasTarget(await service.store.getBars(symbol, date, date))) { confirmed.add(symbol); return; }
          const { dataset, method } = datasetFor(symbol);
          const r = await service.router.run(dataset, method, [symbol, addDays(date, -10), date], { accept: hasTarget });
          const target = r.data.find((bar) => validClosedBar(bar, date));
          if (!target) return;
          await service.store.upsertBars(symbol, r.data.filter((b) => b.date <= date && validClosedBar(b, b.date)), r.source);
          if (!hasTarget(await service.store.getBars(symbol, date, date))) return;
          confirmed.add(symbol);
          bySource[r.source] = (bySource[r.source] || 0) + 1;
          if (r.fallbackReason) fallbacks[r.fallbackReason] = (fallbacks[r.fallbackReason] ?? 0) + 1;
        } catch (error) {
          failed.push({ symbol, error: error.message });
        }
        await sleep(pauseMs);
      });
      const missing = [...core].filter((symbol) => !confirmed.has(symbol));
      let fallbackError = null;
      if (missing.length) {
        try {
          const rows = await fallbackDay(date);
          for (const symbol of missing) {
            const bar = rows.get(symbol);
            if (!validClosedBar(bar, date)) continue;
            await service.store.upsertBars(symbol, [bar], "vndirect");
            if (!hasTarget(await service.store.getBars(symbol, date, date))) continue;
            confirmed.add(symbol);
            bySource.vndirect = (bySource.vndirect || 0) + 1;
          }
        } catch (error) { fallbackError = error.message; }
      }
      const absent = [...core].filter((symbol) => !confirmed.has(symbol));
      const confirmedCore = core.size - absent.length;
      const awaitingData = !core.size || confirmedCore * 100 < core.size * 95;
      await service.store.setKv("local:eod:coverage:" + date, { date, expected: core.size, confirmed: confirmedCore, core: [...core], symbols: [...confirmed], awaitingData, updatedAt: new Date(now()).toISOString() });
      service.cache.clear();
      const confirmedClosed = confirmed.size;
      if (confirmedClosed < symbols.length / 2) {
        void notifyOps("job:syncEod", `EOD ${date} có ${confirmedClosed}/${symbols.length} nến đóng đúng phiên.`);
      }
      return { date, symbols: symbols.length, bySource, fallbacks, fallbackError, expectedClosed: symbols.length, confirmedClosed, expectedCore: core.size, confirmedCore, awaitingData,
        missingTargetCount: absent.length, missingTargetSample: absent.slice(0, 20), failed: failed.filter((item) => !confirmed.has(item.symbol)).slice(0, 20), failedCount: failed.filter((item) => !confirmed.has(item.symbol)).length };
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
