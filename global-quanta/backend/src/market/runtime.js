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
import { fetchVndEvents } from "./adjusted/vndirectEvents.js";
import { createTaSeries } from "./adjusted/taSeries.js";
import { createStrategyJobs, STRATEGY_SCHEDULE } from "./strategies/strategyJobs.js";
import { createSectorJobs, SECTOR_SCHEDULE } from "./sectors/sectorJobs.js";
import { createCycleService, CYCLE_SCHEDULE } from "./cycles/cycleService.js";
import { createTop20Service, TOP20_SCHEDULE } from "./top20/top20Jobs.js";
import { createAlphaService, ALPHA_SCHEDULE } from "./alpha/alphaService.js";
import { createStructureService, STRUCTURE_SCHEDULE } from "./structure/structureService.js";
import { setHolidayProvider } from "./calendar.js";
import { createLocalBootstrap } from "./store/localBootstrap.js";
import { createMatrixService, MATRIX_SCHEDULE } from "./tradingMatrix/matrixService.js";
import { createTopbarService, TOPBAR_SCHEDULE } from "./topbar/topbarService.js";
import { createAuthService } from "../auth/authService.js";
import { importSupabaseUserData, listSupabaseUsers } from "../auth/importSupabaseUserData.js";
import { createElliottAlertEvaluator } from "./watchlists/userElliottAlerts.js";
import { createElliottLedger } from "./elliott/scenarioLedger.js";
import { tradingDatesBack } from "./scanner/scannerJobs.js";
import { marketConfig } from "./config.js";
import { createEventRadar } from "./news/eventRadar.js";
import { getIntradaySessions } from "./scanner/intradayService.js";
import { eliteWarmTickers } from "./elite/decisionService.js";

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
  const eventRadar = createEventRadar({ service });

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
  // Mã Project A không có (Neon khoá -> chỉ 17 mã) hoặc Project A lỗi -> sự kiện quyền trực tiếp từ VNDirect finfo.
  const corporateActions = createCorporateActions({ base: (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""), fallback: (symbols) => fetchVndEvents(symbols) });
  const taSeries = createTaSeries({ service, nominalHistory, corporateActions });

  // Cycle Fingerprint v2 (CF2): thư viện giai đoạn tương tự toàn universe, dựng trong bộ nhớ từ kho (16:05) hoặc khi được hỏi lần đầu.
  const cycles = createCycleService({ service, corporateActions, taSeries });
  // Radar Top 20 (T0): thành phần đầu vào trên chuỗi điều chỉnh cộng dồn của cả universe (Project A chấm điểm).
  const top20 = createTop20Service({ service, corporateActions, taSeries });
  // Top 20 v2 (M1 đa yếu tố, T3 EXPERIMENTAL): 18 yếu tố giá / dòng tiền / BCTC VNDirect / ngành + sổ theo dõi thực tế.
  const alpha = createAlphaService({ service, corporateActions, taSeries });
  // Cấu trúc thị trường đa khung (T4): SSI /ta-series + nến phút SSI; kho nến 1 giờ trên Railway Volume.
  const structure = createStructureService({ service, taSeries, corporateActions });
  const jobs = { ...createJobs(service), ...createScannerJobs(service, { corporateActions }), ...createResearchJobs(service), ...createStrategyJobs({ service, corporateActions }), ...createSectorJobs({ service, corporateActions }), ...cycles.jobs, ...top20.jobs, ...alpha.jobs, ...structure.jobs };
  // M0: kho cục bộ (Railway Volume) — tự dựng lại từ SSI/VCI khi thiếu; dọn dòng lệnh theo phút cũ mỗi đêm.
  const localBootstrap = createLocalBootstrap({ jobs, store });
  // Trading Matrix (M1): snapshot trạng thái thị trường từ các nguồn sẵn có; lưu bảng cục bộ 16:50.
  const matrix = createMatrixService({ service, store, getStructure: () => structure, corporateActions });
  jobs.matrixSnapshot = () => matrix.snapshot();
  // TOPBAR T1: một snapshot cho thanh ngang (VN-Index, độ rộng, phiên, vĩ mô, thanh khoản 10:30, Risk-On mô tả).
  const topbar = createTopbarService({ service, store, tradingDatesBack });
  jobs.recordLiquidity1030 = () => topbar.recordLiquidity1030();
  // Đăng nhập trên Railway (thay Supabase Auth): tài khoản / phiên / khoá ký trên Volume (bảng auth_* local-only).
  const auth = createAuthService({ store });
  jobs.authBackup = () => auth.backup();
  // DW10: cảnh báo Elliott theo mốc giá (người dùng tự bật) — kiểm mỗi 60 giây trong phiên; Telegram qua bot vận hành.
  const elliottAlerts = createElliottAlertEvaluator({ store, service, send: (text, id) => notifyOps(`elliott-alert:${id}`, text) });
  jobs.elliottAlertsTick = () => elliottAlerts.tick({ force: true });
  // EP2: sổ theo dõi kịch bản Elliott — ghi kịch bản mới + cập nhật vòng đời sau giờ đóng cửa.
  const elliottLedger = createElliottLedger({ store, taSeries });
  jobs.elliottLedger = () => elliottLedger.run();
  // Khi Supabase mở lại: nhập một lần danh mục / hình vẽ / radar cũ, ghép người dùng theo email (chạy tay qua admin).
  jobs.importSupabaseUserData = async () => {
    if (!store.readInner) return { skipped: "Không có kho Supabase phía sau." };
    return importSupabaseUserData({ store, readInner: (t, q) => store.readInner(t, q), supabaseUsers: await listSupabaseUsers() });
  };
  // N5 (29/10/2026): nạp sẵn nến phút 120 phiên cho các mã danh mục Elite 10 trước giờ mở cửa -> ESA (vòng sáng "từ lúc ra tin" ở
  // Hồ sơ 360°) trả lời ngay trong phiên thay vì chờ vài phút dựng lần đầu. Tuần tự (withSlot giới hạn 2 luồng SSI).
  jobs.warmEliteIntraday = async () => {
    const tickers = await eliteWarmTickers(store);
    const out = { tickers: tickers.length, warmed: [], failed: [] };
    for (const t of tickers) {
      try { await getIntradaySessions(service, t); out.warmed.push(t); } catch (error) { out.failed.push(`${t}: ${error.message}`); }
    }
    return out;
  };
  jobs.bootstrapLocal = () => localBootstrap.run({ reason: "manual" });
  jobs.pruneLocal = async () => (store.pruneLocal ? store.pruneLocal({ tickKeepDays: 90 }) : { skipped: "không có kho cục bộ" });
  const scheduler = createScheduler(jobs, { extraSchedule: [{ name: "pruneLocal", at: "03:45", tradingDayOnly: false }, ...SCANNER_SCHEDULE, ...RESEARCH_SCHEDULE, ...STRATEGY_SCHEDULE, ...SECTOR_SCHEDULE, ...CYCLE_SCHEDULE, ...TOP20_SCHEDULE, ...ALPHA_SCHEDULE, ...STRUCTURE_SCHEDULE, ...MATRIX_SCHEDULE, ...TOPBAR_SCHEDULE, { name: "authBackup", at: "03:50", tradingDayOnly: false }, { name: "elliottLedger", at: "16:10", tradingDayOnly: true }] }); // warmEliteIntraday TẠM TẮT lịch (29/10/2026): giữ đủ nến phút 120 phiên × 10 mã trong đệm đẩy heap 57 -> ~400/489 MB.

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

  runtime = { providers, store, service, hub, jobs, scheduler, tickRecorder, cotucScanner, tradingCalendar, nominalHistory, taSeries, corporateActions, cycles, top20, alpha, localBootstrap, structure, matrix, topbar, auth, elliottAlerts, elliottLedger, eventRadar, started: false };
  return runtime;
}

/** Bật Ingestor (lập lịch đồng bộ) khi MARKET_INGESTOR_ENABLED=true. */
export function startMarketIngestor() {
  const rt = getMarketRuntime();
  void rt.eventRadar.start();
  if (rt.started || !featureFlags().ingestorEnabled) return rt;
  rt.started = true;
  const runOnStart = String(process.env.MARKET_RUN_JOBS_ON_START ?? "true").toLowerCase() === "true" ? ["syncSecurities"] : [];
  rt.scheduler.start({ runOnStart });
  rt.tickRecorder.start();
  rt.cotucScanner.start();
  rt.elliottAlerts.start();
  // M0: kho cục bộ thiếu dữ liệu (lần đầu triển khai / volume mới) -> tự dựng lại từ nguồn gốc sau 60 giây.
  if (rt.store.localFirst) setTimeout(() => { rt.localBootstrap.autoStart().then((r) => console.log(`[local-bootstrap] ${JSON.stringify(r)}`)).catch((e) => console.warn(`[local-bootstrap] ${e.message}`)); }, 60_000).unref?.();
  console.log(`[market] Ingestor đã bật (store=${rt.store.kind}).`);
  return rt;
}

export function stopMarketRuntime() {
  if (!runtime) return;
  runtime.scheduler.stop();
  runtime.cotucScanner.stop();
  runtime.eventRadar.stop();
  runtime.tradingCalendar.stop();
  setHolidayProvider(null);
  void runtime.tickRecorder.stop();
  runtime.hub.shutdown();
  runtime = undefined;
}
