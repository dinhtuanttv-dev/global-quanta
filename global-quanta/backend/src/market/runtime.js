// Lắp ráp toàn bộ tầng dữ liệu thị trường (singleton cho tiến trình Express).

import { featureFlags } from "./config.js";
import { createStore } from "./store/index.js";
import { createSsiV3Provider } from "./providers/ssiV3Provider.js";
import { createSsiFcV2Provider } from "./providers/ssiFcV2Provider.js";
import { createLegacyProvider } from "./providers/legacyProvider.js";
import { createVndirectIndexProvider } from "./providers/vndirectIndexProvider.js";
import { createMarketDataService } from "./marketDataService.js";
import { StreamHub } from "./stream/streamHub.js";
import { SignalRConnection } from "./stream/signalrConnection.js";
import { createJobs } from "./jobs.js";
import { createScheduler } from "./scheduler.js";
import { createScannerJobs, SCANNER_SCHEDULE } from "./scanner/scannerJobs.js";
import { createTickRecorder } from "./scanner/tickFlowService.js";
import { createResearchJobs, RESEARCH_SCHEDULE } from "./research/researchJobs.js";
import { expectsLiveTicks } from "./calendar.js";
import { notifyOps } from "./alerts.js";
import { createCotucScanner } from "./cotuc/cotucScanner.js";
import { createTradingCalendarService } from "./tradingCalendar/tradingCalendarService.js";
import { createAdjustedHistory } from "./adjusted/adjustedHistory.js";
import { createCorporateActions } from "./adjusted/corporateActions.js";
import { createTaSeries } from "./adjusted/taSeries.js";
import { createStrategyJobs, STRATEGY_SCHEDULE } from "./strategies/strategyJobs.js";
import { setHolidayProvider } from "./calendar.js";
import { marketConfig } from "./config.js";

let runtime;

export function getMarketRuntime() {
  if (runtime) return runtime;

  const providers = {
    ssiV3: createSsiV3Provider(),
    ssiFcV2: createSsiFcV2Provider(),
    legacy: createLegacyProvider(),
    vndirectIndex: createVndirectIndexProvider(),
  };
  const store = createStore();
  const service = createMarketDataService({ providers, store });

  let downSince = null;
  const hub = new StreamHub({
    createConnection: (opts) => new SignalRConnection(opts),
    fetchFallbackQuotes: (symbols) => service.fetchQuotesFromProviders(symbols),
    fetchFallbackIndex: (code) => service.fetchIndexFromProviders(code),
    upstreamEnabled: () => providers.ssiFcV2.isConfigured() && (process.env.MARKET_STREAM_UPSTREAM || "ssiFcV2") !== "none",
    onTransportChange: (state) => {
      console.log(`[market] SSI stream: ${state}`);
      if (state === "down" || state === "degraded") {
        downSince ??= Date.now();
        // Chỉ cảnh báo khi mất kết nối trong giờ giao dịch.
        if (expectsLiveTicks()) void notifyOps(`stream:${state}`, `SSI stream ${state === "down" ? "mất kết nối" : "mất một phần kết nối"}; đang phát giá từ nguồn dự phòng.`);
      } else if (state === "connected" && downSince) {
        const minutes = Math.round((Date.now() - downSince) / 60_000);
        downSince = null;
        if (minutes >= 1) void notifyOps("stream:recovered", `SSI stream đã kết nối lại sau ~${minutes} phút.`);
      }
    },
  });
  service.hub = hub;

  // Chuỗi giá điều chỉnh cộng dồn dùng chung cho /ta-series, /ta-intraday và bộ lọc kỹ thuật.
  const nominalHistory = createAdjustedHistory({ service, store });
  const corporateActions = createCorporateActions({ base: (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, "") });
  const taSeries = createTaSeries({ service, nominalHistory, corporateActions });

  const jobs = { ...createJobs(service), ...createScannerJobs(service), ...createResearchJobs(service), ...createStrategyJobs({ service, corporateActions }) };
  const scheduler = createScheduler(jobs, { extraSchedule: [...SCANNER_SCHEDULE, ...RESEARCH_SCHEDULE, ...STRATEGY_SCHEDULE] });

  // Ghi dòng lệnh Lee–Ready theo phút vào store mỗi phút (bền vững qua khởi động lại khi MARKET_STORE=supabase).
  const tickRecorder = createTickRecorder({ hub, store });

  // Quét liên tục tab Cổ tức (~300 mã): gọi xoay vòng cron theo lô của Project A (cần PROJECT_A_CRON_SECRET).
  const cotucScanner = createCotucScanner({ store });

  // Lịch giao dịch tự vận hành: quan sát phiên VN-Index thật (10 năm) > MARKET_HOLIDAYS > quy tắc âm lịch/BLLĐ.
  const tradingCalendar = createTradingCalendarService({
    loadSessionDates: async () => (await createAdjustedHistory({ service, store }).get("VNINDEX", { years: 10 })).bars.map((b) => b.date),
    official: () => marketConfig().holidays,
  });
  setHolidayProvider(tradingCalendar.isHoliday);
  tradingCalendar.start();

  runtime = { providers, store, service, hub, jobs, scheduler, tickRecorder, cotucScanner, tradingCalendar, nominalHistory, taSeries, corporateActions, started: false };
  return runtime;
}

/** Bật Ingestor (lập lịch đồng bộ) khi MARKET_INGESTOR_ENABLED=true. */
export function startMarketIngestor() {
  const rt = getMarketRuntime();
  if (rt.started || !featureFlags().ingestorEnabled) return rt;
  rt.started = true;
  const runOnStart = String(process.env.MARKET_RUN_JOBS_ON_START ?? "true").toLowerCase() === "true" ? ["syncSecurities"] : [];
  rt.scheduler.start({ runOnStart });
  rt.tickRecorder.start();
  rt.cotucScanner.start();
  console.log(`[market] Ingestor đã bật (store=${rt.store.kind}).`);
  return rt;
}

export function stopMarketRuntime() {
  if (!runtime) return;
  runtime.scheduler.stop();
  runtime.cotucScanner.stop();
  runtime.tradingCalendar.stop();
  setHolidayProvider(null);
  void runtime.tickRecorder.stop();
  runtime.hub.shutdown();
  runtime = undefined;
}
