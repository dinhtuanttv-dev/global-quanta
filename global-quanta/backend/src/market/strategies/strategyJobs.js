// Job của bộ lọc kỹ thuật TA VN-Index (Screener Engine v2 / S1):
//   scanStrategies          15:45 ngày giao dịch — quét CAMSLIM + Base Breakout một lần sau ATC (chỉ đọc kho), lưu KV strategies:<id>
//   backfillScreenerHistory 03:00 hằng đêm       — nạp đủ ~3 năm nến ngày cho mã universe còn thiếu (ngoài giờ, có giới hạn)

import { STRATEGY_IDS, STRATEGY_RANGE, runTechnicalFilters, strategyKvKey } from "./technicalFilters.js";
import { createScreenerSeries } from "./screenerSeries.js";
import { recordSignals } from "./signalTracking.js";
import { buildConvergenceEvidence, CONVERGENCE_EVIDENCE_KV, CONVERGENCE_VERSION, convergenceEvidenceFresh } from "./convergenceV2.js";
import { screenerCriteria } from "./technicalFilters.js";
import { lastCompletedSessionDate, vnDate } from "../calendar.js";
import { addDays, sleep } from "../util.js";

export const SCREENER_BACKFILL_KV = "screener:backfill";
const HISTORY_DAYS = 1096; // 3 năm lịch
const COVER_SLACK_DAYS = 10; // nghỉ lễ đầu khoảng
const YOUNG_RECHECK_MS = 30 * 86_400_000; // mã niêm yết chưa đủ 3 năm: 30 ngày mới thử lại

export function createStrategyJobs({ service, corporateActions, now = Date.now, pauseMs = 1_500 }) {
  const store = service.store;
  const seriesSource = createScreenerSeries({ store, corporateActions });

  return {
    async scanStrategies() {
      const docs = await runTechnicalFilters(service, { seriesSource, now });
      for (const id of STRATEGY_IDS) await store.setKv(strategyKvKey(id), docs[id]);
      // S6: ghi tín hiệu vào sổ cái để theo dõi thực tế (lỗi ghi không làm hỏng kết quả quét).
      let ledger = 0;
      try { ledger = await recordSignals(store, docs); } catch (error) { ledger = `lỗi: ${error.message.slice(0, 120)}`; }
      const any = docs[STRATEGY_IDS[0]];
      return {
        priceBasis: any.priceBasis,
        ledger,
        dataAsOf: any.dataAsOf,
        scanned: any.scannedCount,
        skipped: any.skipped.length,
        results: Object.fromEntries(STRATEGY_IDS.map((id) => [id, docs[id].resultCount])),
      };
    },

    /**
     * Bằng chứng lịch sử Hợp lưu v2 (point-in-time mọi nến, ≈4 phút): chạy đêm, chỉ khi bản lưu khác engine hoặc cũ hơn 7 ngày
     * (`force` = tính lại ngay). Ghi KV strategies:convergence:evidence.
     */
    async buildConvergenceEvidence({ force = false } = {}) {
      const stored = (await store.getKv(CONVERGENCE_EVIDENCE_KV))?.value ?? null;
      if (!force && convergenceEvidenceFresh(stored, now())) return { skipped: "FRESH", engine: stored.engine, computedAt: stored.computedAt };
      const universe = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
      const loadSeries = await seriesSource.prepare(universe.map((x) => x.ticker));
      const seriesList = [];
      for (const { ticker } of universe) {
        try { const s = await loadSeries(ticker); const bars = (s?.bars ?? []).filter((b) => !b.partial && b.open > 0 && b.close > 0); if (bars.length >= 300) seriesList.push(bars); } catch { /* bỏ mã lỗi */ }
      }
      let indexBars = [];
      try { if (typeof loadSeries.index === "function") indexBars = await loadSeries.index(); } catch { /* thiếu VN-Index -> R = 0 */ }
      const t0 = now();
      const evidence = await buildConvergenceEvidence(seriesList, { indexBars, minAvgValue20: screenerCriteria().minAvgValue20 });
      const doc = { engine: CONVERGENCE_VERSION, computedAt: new Date(now()).toISOString(), symbols: seriesList.length, ms: now() - t0, evidence };
      await store.setKv(CONVERGENCE_EVIDENCE_KV, doc);
      return { engine: doc.engine, symbols: doc.symbols, ms: doc.ms, label: evidence.label, oos: evidence.outOfSample };
    },

    /**
     * Mã universe có nến kho bắt đầu muộn hơn (hôm nay − 3 năm) -> gọi getOhlcv 3y để kho tự nạp phần thiếu từ SSI.
     * Mã niêm yết chưa đủ 3 năm ghi nhận ngày đầu thật, 30 ngày mới kiểm tra lại. Tối đa `maxSymbols` mã / lần.
     */
    async backfillScreenerHistory({ maxSymbols = Number(process.env.SCREENER_BACKFILL_MAX) || 60 } = {}) {
      const universe = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
      const state = (await store.getKv(SCREENER_BACKFILL_KV))?.value ?? { young: {} };
      const t = now();
      const end = lastCompletedSessionDate(new Date(t));
      const wantedFrom = addDays(vnDate(new Date(t)), -HISTORY_DAYS);
      const todo = [];
      let covered = 0;
      for (const { ticker } of universe) {
        const cov = await store.coverage(ticker);
        if (cov?.first && String(cov.first).slice(0, 10) <= addDays(wantedFrom, COVER_SLACK_DAYS) && String(cov.last).slice(0, 10) >= addDays(end, -7)) { covered++; continue; }
        const young = state.young?.[ticker];
        if (young && t - Date.parse(young.checkedAt) < YOUNG_RECHECK_MS) { covered++; continue; }
        todo.push(ticker);
      }
      const loaded = [];
      const failed = [];
      for (const ticker of todo.slice(0, maxSymbols)) {
        try {
          const r = await service.getOhlcv({ symbol: ticker, range: STRATEGY_RANGE });
          const first = r.bars.find((b) => !b.partial)?.date ?? null;
          loaded.push({ ticker, first, bars: r.bars.length });
          if (!first || first > addDays(wantedFrom, COVER_SLACK_DAYS)) state.young = { ...state.young, [ticker]: { first, checkedAt: new Date(t).toISOString() } };
        } catch (error) {
          failed.push({ ticker, message: error instanceof Error ? error.message : String(error) });
        }
        if (pauseMs) await sleep(pauseMs);
      }
      await store.setKv(SCREENER_BACKFILL_KV, { ...state, lastRunAt: new Date(t).toISOString() });
      return { universe: universe.length, covered, todo: todo.length, loaded: loaded.length, failed, pending: Math.max(0, todo.length - maxSymbols) };
    },
  };
}

export const STRATEGY_SCHEDULE = [
  { name: "scanStrategies", at: "15:45", tradingDayOnly: true },
  { name: "backfillScreenerHistory", at: "03:00", tradingDayOnly: false },
  { name: "buildConvergenceEvidence", at: "03:30", tradingDayOnly: false },
];
