// Lắp ráp toàn bộ tầng dữ liệu thị trường (singleton cho tiến trình Express).

import { featureFlags } from "./config.js";
import { createStore } from "./store/index.js";
import { createSsiV3Provider } from "./providers/ssiV3Provider.js";
import { createSsiFcV2Provider } from "./providers/ssiFcV2Provider.js";
import { createLegacyProvider } from "./providers/legacyProvider.js";
import { createMarketDataService } from "./marketDataService.js";
import { StreamHub } from "./stream/streamHub.js";
import { SignalRConnection } from "./stream/signalrConnection.js";
import { createJobs } from "./jobs.js";
import { createScheduler } from "./scheduler.js";
import { createScannerJobs, SCANNER_SCHEDULE } from "./scanner/scannerJobs.js";
import { expectsLiveTicks } from "./calendar.js";
import { notifyOps } from "./alerts.js";

let runtime;

export function getMarketRuntime() {
  if (runtime) return runtime;

  const providers = {
    ssiV3: createSsiV3Provider(),
    ssiFcV2: createSsiFcV2Provider(),
    legacy: createLegacyProvider(),
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

  const jobs = { ...createJobs(service), ...createScannerJobs(service) };
  const scheduler = createScheduler(jobs, { extraSchedule: SCANNER_SCHEDULE });

  runtime = { providers, store, service, hub, jobs, scheduler, started: false };
  return runtime;
}

/** Bật Ingestor (lập lịch đồng bộ) khi MARKET_INGESTOR_ENABLED=true. */
export function startMarketIngestor() {
  const rt = getMarketRuntime();
  if (rt.started || !featureFlags().ingestorEnabled) return rt;
  rt.started = true;
  const runOnStart = String(process.env.MARKET_RUN_JOBS_ON_START ?? "true").toLowerCase() === "true" ? ["syncSecurities"] : [];
  rt.scheduler.start({ runOnStart });
  console.log(`[market] Ingestor đã bật (store=${rt.store.kind}).`);
  return rt;
}

export function stopMarketRuntime() {
  if (!runtime) return;
  runtime.scheduler.stop();
  runtime.hub.shutdown();
  runtime = undefined;
}
