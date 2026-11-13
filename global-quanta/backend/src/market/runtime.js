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
import { createKqkdService, kqkdDirFromEnv } from "./fundamentals/kqkdService.js";
import { createFundamentalsWarehouse } from "./fundamentals/warehouse.js";
import { createAgmPlansService } from "./fundamentals/agmPlansService.js";
import { createEventStudyService } from "./fundamentals/eventStudyService.js";
import { createSeasonMap } from "./fundamentals/seasonMap.js";
import { CA_RULES, createCafefAnnounce } from "./fundamentals/cafefAnnounceService.js";
import { createSeasonX } from "./fundamentals/seasonX.js";
import { createCorpEvents } from "./events/corpEventsService.js";
import { createDividendScreener } from "./events/dividendScreener.js";
import { createDivRunup } from "./events/divRunupService.js";
import { createSharesEps } from "./fundamentals/sharesEps.js";
import { createEliteToShadow } from "./elite/eliteToShadow.js";
import { setNominalFallback, vndNominalMap } from "./strategies/screenerSeries.js";
import { createHlLedger } from "./elite/confluence.js";
import { ELITE_KV } from "./elite/elitePanel.js";
import { DECISION_KV } from "./elite/decisionService.js";
import { createDividendQualityBase } from "./events/dividendQuality.js";
import { createFmLedger } from "./events/factorModel.js";
import pathCe from "node:path";
import { listSeasonMeta } from "./fundamentals/seasonStore.js";
import { qmsJobsConfig, runInWorker } from "./cotuc/qmsJobs.js";
import { callGeminiJSON } from "../services/geminiClient.js";
import zlibAgm from "node:zlib";
import fsAgm from "node:fs";
import { createQmsJobs } from "./cotuc/qmsJobs.js";
import { createTradingCalendarService } from "./tradingCalendar/tradingCalendarService.js";
import { createAdjustedHistory } from "./adjusted/adjustedHistory.js";
import { createCorporateActions } from "./adjusted/corporateActions.js";
import { fetchVndEvents } from "./adjusted/vndirectEvents.js";
import { createTaSeries } from "./adjusted/taSeries.js";
import { createMsGarchService } from "./volatility/msGarchService.js";
import { createPreopenService } from "./preopen/preopenService.js";
import { createStrategyJobs, STRATEGY_SCHEDULE } from "./strategies/strategyJobs.js";
import { createSectorJobs, SECTOR_SCHEDULE } from "./sectors/sectorJobs.js";
import { createLedgerBackup, LEDGER_BACKUP_SCHEDULE } from "./ledgerBackup.js";
import { createLedgerHealth } from "./ledgerHealth.js";
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
import { getEsaSessions } from "./scanner/intradayService.js";
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
  const msGarch = createMsGarchService({ getBars: (symbol) => taSeries.get({ symbol, range: "5y", limit: 800 }).then((r) => r.bars ?? []) });
  const preopen = createPreopenService({ store, getVnBars: () => service.getOhlcv({ symbol: "VNINDEX", limit: 800 }).then((r) => r.bars ?? []), getMsGarch: () => msGarch.get("VNINDEX") });

  // Cycle Fingerprint v2 (CF2): thư viện giai đoạn tương tự toàn universe, dựng trong bộ nhớ từ kho (16:05) hoặc khi được hỏi lần đầu.
  const cycles = createCycleService({ service, corporateActions, taSeries });
  // Radar Top 20 (T0): thành phần đầu vào trên chuỗi điều chỉnh cộng dồn của cả universe (Project A chấm điểm).
  const top20 = createTop20Service({ service, corporateActions, taSeries });
  // Top 20 v2 (M1 đa yếu tố, T3 EXPERIMENTAL): 18 yếu tố giá / dòng tiền / BCTC VNDirect / ngành + sổ theo dõi thực tế.
  const alpha = createAlphaService({ service, corporateActions, taSeries });
  // Cấu trúc thị trường đa khung (T4): SSI /ta-series + nến phút SSI; kho nến 1 giờ trên Railway Volume.
  const structure = createStructureService({ service, taSeries, corporateActions });
  const jobs = { ...createJobs(service), ...createScannerJobs(service, { corporateActions }), ...createResearchJobs(service), ...createStrategyJobs({ service, corporateActions }), ...createSectorJobs({ service, corporateActions, taSeries }), ...cycles.jobs, ...top20.jobs, ...alpha.jobs, ...structure.jobs };
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
      try { await getEsaSessions(service, t); out.warmed.push(t); } catch (error) { out.failed.push(`${t}: ${error.message}`); } // chỉ bản gọn
    }
    return out;
  };
  jobs.bootstrapLocal = () => localBootstrap.run({ reason: "manual" });
  jobs.pruneLocal = async () => (store.pruneLocal ? store.pruneLocal({ tickKeepDays: 90 }) : { skipped: "không có kho cục bộ" });
  // Vercel CPU giai đoạn 2 (30/10/2026): job nặng của Project A chạy trên Gateway (qmsJobs.js). Lọc ngành L5 — sổ theo dõi tín hiệu
  // ngành (trước: cron Vercel 09:20 UTC), sau job ngành 15:50 của Gateway.
  const qmsJobs = createQmsJobs();
  jobs.qmsSectorTiming = () => qmsJobs.call("/api/cron/sector-timing-scan");
  // Chất xúc tác (31/10/2026): quét trên Gateway, nguồn tin Event Radar, lưu Railway Volume — hết phụ thuộc Neon. 8 lượt/ngày (Hobby, 31/10/2026), gồm cuối tuần (tin vẫn ra).
  const CATALYST_SCANS = ["08:35", "09:35", "10:35", "11:35", "13:35", "14:35", "15:15", "20:30"].map((at, i) => ({ name: `catalystScan${i + 1}`, at, tradingDayOnly: false }));
  for (const c of CATALYST_SCANS) jobs[c.name] = () => qmsJobs.call("/api/catalysts/scan");
  // K0 (06/11/2026): kho BCTC quý đầy đủ (VNDirect, Railway Volume) cho KQKD theo quý — 2 lượt/ngày, cả cuối tuần.
  // AGM-v1 (06/11/2026): kế hoạch ĐHĐCĐ (nghị quyết scan) — 2 mô hình Gemini chép độc lập + code kiểm; 30 mã/lượt, trần token/ngày.
  const kqkdDir = kqkdDirFromEnv();
  const readStatementsAgm = (t) => { try { return JSON.parse(zlibAgm.gunzipSync(fsAgm.readFileSync(`${kqkdDir}/${t}.json.gz`)).toString("utf8")); } catch { return null; } };
  const agmPlans = createAgmPlansService({ dir: kqkdDir, callModel: (o) => callGeminiJSON(o), readStatements: readStatementsAgm,
    universe: async () => fsAgm.readdirSync(kqkdDir).filter((f) => /^[A-Z0-9]{3,10}\.json\.gz$/.test(f)).map((f) => f.slice(0, -8)).sort() });
  // LC3 (06/11/2026): phản ứng giá quanh ngày công bố KQKD — job 19:45 hằng ngày (sau lượt làm mới KQKD 19:15).
  let corpEventsRef = null; // LSK5: kho sự kiện (tạo phía dưới) cấp đợt GDKHQ tiền mặt cho XD-v1
  const eventStudy = createEventStudyService({ dir: kqkdDir, exEvents: (t) => corpEventsRef?.ticker(t)?.events ?? [] });
  // 13/11/2026: giá danh nghĩa dự phòng cho kho chuỗi giá của các bộ lọc (mã thiếu lịch sử ở market_adjusted_series) — kho VNDirect.
  setNominalFallback((t) => vndNominalMap(eventStudy.pricesOf(t)));
  // EPS-v1 (P0 kiểm toán BCTC 07/11/2026): EPS 12 tháng + số cổ phiếu lưu hành theo kỳ (VNDirect ratios) — làm mới 10 phút trước mỗi lượt KQKD.
  const sharesEps = createSharesEps({ dir: kqkdDir, universe: async () => ((await store.getKv("scanner:universe"))?.value?.tickers ?? []).map((x) => x.ticker) });
  jobs.sharesEps = () => sharesEps.refresh();
  jobs.sharesEps2 = () => sharesEps.refresh();
  // EPS-v2 (P1): sự kiện hồi tố + giá CHƯA điều chỉnh phiên trước GDKHQ (px: [ngày, adClose, nmValue, close nghìn đ]) cho quyền mua.
  const epsActions = (t) => ({ events: corpEventsRef?.ticker(t)?.events ?? [], pcumOf: (ex) => { const rows = eventStudy.pricesOf(t) ?? []; let p = null; for (const r of rows) { if (r[0] >= ex) break; p = r[3] ?? null; } return p > 0 ? p * 1000 : null; } });
  const kqkd = createKqkdService({ store, getEventStudy: () => eventStudy.doc(), getSharesEps: () => sharesEps.of, getActions: epsActions, isHoliday: (d) => tradingCalendar.isHoliday(d), getPlan: (t, y) => agmPlans.planOf(t, y), getCloses: (t) => taSeries.get({ symbol: t, range: "1y", limit: 400 }).then((r) => (r.bars ?? []).filter((b) => b.close > 0).map((b) => ({ date: b.date, close: b.close }))) });
  const KQKD_SCHEDULE = [{ name: "sharesEps", at: "12:05", tradingDayOnly: false }, { name: "sharesEps2", at: "19:05", tradingDayOnly: false }, { name: "kqkdRefresh", at: "12:15", tradingDayOnly: false }, { name: "kqkdRefreshEvening", at: "19:15", tradingDayOnly: false },
    { name: "agmPlans", at: "21:10", tradingDayOnly: false }, { name: "agmPlansNight", at: "02:10", tradingDayOnly: false },
    { name: "kqkdEventStudy", at: "19:45", tradingDayOnly: false },
    { name: "seasonMapBuild", at: "03:20", tradingDayOnly: false }, { name: "seasonLedgerTick", at: "20:20", tradingDayOnly: false },
    { name: "cafefHead", at: "20:40", tradingDayOnly: false }, { name: "dividendQuality", at: "20:05", tradingDayOnly: false }, { name: "fmLedger", at: "20:15", tradingDayOnly: false }, { name: "toBuild", at: "20:25", tradingDayOnly: false }, { name: "eliteToShadow", at: "20:35", tradingDayOnly: false }, { name: "hlLedger", at: "20:45", tradingDayOnly: false },
    { name: "corpEvents1", at: "07:40", tradingDayOnly: false }, { name: "corpEvents2", at: "12:10", tradingDayOnly: false }, { name: "corpEvents3", at: "17:40", tradingDayOnly: false }, { name: "corpEvents4", at: "21:05", tradingDayOnly: false }, { name: "cafefNight", at: "22:30", tradingDayOnly: false }, { name: "seasonXBuild", at: "04:10", tradingDayOnly: false }];
  jobs.kqkdRefresh = () => kqkd.refresh({ reason: "job" });
  jobs.kqkdRefreshEvening = () => kqkd.refresh({ reason: "job" });
  jobs.agmPlans = async () => { if (!process.env.GEMINI_API_KEY) return { skipped: "thiếu GEMINI_API_KEY" }; const r = await agmPlans.run({ limit: 30 }); if (r.processed) await kqkd.rebuildSummary("agm"); return r; };
  jobs.agmPlansNight = () => jobs.agmPlans();
  jobs.kqkdEventStudy = () => eventStudy.run();
  // S2/S6 (06/11/2026): bản đồ mùa vụ toàn thị trường (gom Project A mỗi tuần) + sổ theo dõi cửa sổ THEO DÕI / ĐẠT (mỗi ngày, không gọi Project A).
  const seasonMap = createSeasonMap({ dir: kqkdDir, getCalendar: () => kqkd.calendar() });
  jobs.seasonMapBuild = async () => { const m = seasonMap.map(); if (m && Date.now() - Date.parse(m.builtAt) < 6.5 * 86_400_000) return { skipped: "bản đồ chưa quá 6,5 ngày" }; return seasonMap.build(); };
  jobs.seasonLedgerTick = () => seasonMap.ledgerTick();
  // S8 (06/11/2026): ngày công bố thật từ CafeF (pha A tới 2020 ngay sau khởi động, pha B về 2013 ban đêm) + Mùa vụ bản THĂM DÒ
  // tính bằng đúng hàm Project A (vendor/seasonCore.mjs, worker riêng), lưu thư mục seasonx/ — bảng "season" và Timeline không đổi.
  const cafefAnnounce = createCafefAnnounce({ dir: kqkdDir });
  // P3 (FW-v1): kho BCTC quý hợp nhất (VNDirect > VCI) + ngày công bố thật cho SEPA / CAN SLIM (thay hết quý + 45 ngày).
  const fundWarehouse = createFundamentalsWarehouse({ vndRecOf: (t) => kqkd.raw(t), cafefDatesOf: (t) => cafefAnnounce.dates(t) });
  service.fundWarehouse = fundWarehouse;
  const sxConfig = qmsJobsConfig();
  const seasonX = createSeasonX({ dir: kqkdDir, cafef: cafefAnnounce, listMeta: listSeasonMeta, runJob: ({ fn, params, modulePath }) => runInWorker({ fn, params, modulePath, config: { ...sxConfig, timeoutMs: 600_000 } }) });
  jobs.cafefHead = async () => { const r = await cafefAnnounce.refreshHead(); cafefAnnounce.clearNews(); return r; };
  // LSK1 (07/11/2026): kho sự kiện doanh nghiệp (VNDirect, toàn bộ từ 2015, 4 lần/ngày) + kiểm chéo CafeF — nguồn của Lịch sự kiện.
  const corpEvents = createCorpEvents({ dir: process.env.CORP_EVENTS_DIR || pathCe.join(kqkdDir, "corp-events"),
    universe: async () => ((await store.getKv("scanner:universe"))?.value?.tickers ?? []).map((x) => x.ticker),
    isTradingDay: (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !tradingCalendar.isHoliday(d),
    cafefNews: (t) => cafefAnnounce.news(t) });
  corpEventsRef = corpEvents;
  // BL1: nguồn dữ liệu Bộ lọc cổ phiếu (ghép bản quét + KQKD + sự kiện + XD-v1 trên Gateway).
  // BL2: phần tính sẵn của độ bền cổ tức / Lintner / rủi ro giá (BCTC năm + giá điều chỉnh), mỗi tối 20:05.
  const dqBase = createDividendQualityBase({ dir: kqkdDir, getSharesEps: () => sharesEps.of, getEventsOf: (t) => corpEventsRef?.ticker(t)?.events ?? [] });
  jobs.dividendQuality = () => dqBase.run();
  const dividendScreener = createDividendScreener({ getDq: () => dqBase.doc(), getKv: async (k) => (await store.getKv(k))?.value ?? null, getKqSummary: () => kqkd.summary(), getEvents: () => corpEvents.doc(), getEx: () => eventStudy.exDoc() });
  // BL-L1: sổ theo dõi tiến FM-v1 (ghi 1 lần/tháng, chấm sau 12 tháng).
  const fmLedger = createFmLedger({ dir: kqkdDir, getRows: async () => (await dividendScreener.get()).rows });
  jobs.fmLedger = () => fmLedger.tick();
  // TO-v1: Săn cổ tức trước GDKHQ (radar, sổ TO-L1, mô phỏng, W1–W5 trên Gateway) — dựng 20:25 sau khi giá cập nhật 19:45.
  const divRunup = createDivRunup({ dir: pathCe.join(kqkdDir, "to"), pricesOf: (t) => eventStudy.pricesOf(t),
    getUniverse: async () => (await store.getKv("scanner:universe"))?.value ?? null, eventsOf: (t) => corpEvents.ticker(t)?.events ?? [],
    eventsVersion: () => corpEvents.status().fetchedAt, isTradingDay: (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !tradingCalendar.isHoliday(d) });
  jobs.toBuild = async () => { const b = await divRunup.build(); const t = await divRunup.tick(); return { build: b, ledger: t }; };
  // Elite × TO Giai đoạn II (ELITE-TO-prereg.md): sổ ảo COMP-r1 / DIV-IC — đọc danh mục Elite chính thức, KHÔNG đổi danh mục.
  const eliteToShadow = createEliteToShadow({ dir: pathCe.join(kqkdDir, "to"), getKv: async (k) => (await store.getKv(k))?.value ?? null,
    decisionKey: DECISION_KV.decision, decisionIndexKey: DECISION_KV.index, pricesOf: (t) => eventStudy.pricesOf(t), allFacts: () => divRunup.allFacts(),
    ledgerEntries: () => divRunup.ledgerEntries(), getUniverse: async () => (await store.getKv("scanner:universe"))?.value ?? null, exSummary: async () => divRunup.exSummary() });
  jobs.eliteToShadow = () => eliteToShadow.tick();
  // HL-v1 (12/11/2026): sổ theo dõi tiến của quy tắc hợp lưu đa yếu tố — đọc bảng tín hiệu E1 đã lưu, KHÔNG đổi Điểm Elite / danh mục.
  const hlLedger = createHlLedger({ dir: pathCe.join(kqkdDir, "hl"), getKv: async (k) => (await store.getKv(k))?.value ?? null,
    panelIndexKey: ELITE_KV.index, panelKey: ELITE_KV.panel, pricesOf: (t) => eventStudy.pricesOf(t) });
  jobs.hlLedger = () => hlLedger.tick();
  for (const k of [1, 2, 3, 4]) jobs[`corpEvents${k}`] = () => corpEvents.refresh();
  jobs.cafefNight = async () => { const r = await cafefAnnounce.crawl({ until: CA_RULES.phaseB, maxMs: 7 * 3_600_000 }); return r; };
  jobs.seasonXBuild = async () => { const i = seasonX.status().index; if (i && Date.now() - Date.parse(i.builtAt) < 6.5 * 86_400_000) return { skipped: "bản THĂM DÒ chưa quá 6,5 ngày" }; return seasonX.run(); };
  const ledgerBackup = createLedgerBackup({ store });
  jobs.backupLedgers = () => ledgerBackup.backup();
  jobs.restoreLedgers = () => ledgerBackup.restoreMissing();
  const scheduler = createScheduler(jobs, { extraSchedule: [...LEDGER_BACKUP_SCHEDULE, { name: "qmsSectorTiming", at: "16:20", tradingDayOnly: true }, ...CATALYST_SCANS, ...KQKD_SCHEDULE, { name: "pruneLocal", at: "03:45", tradingDayOnly: false }, ...SCANNER_SCHEDULE, ...RESEARCH_SCHEDULE, ...STRATEGY_SCHEDULE, ...SECTOR_SCHEDULE, ...CYCLE_SCHEDULE, ...TOP20_SCHEDULE, ...ALPHA_SCHEDULE, ...STRUCTURE_SCHEDULE, ...MATRIX_SCHEDULE, ...TOPBAR_SCHEDULE, { name: "authBackup", at: "03:50", tradingDayOnly: false }, { name: "elliottLedger", at: "16:10", tradingDayOnly: true }, { name: "warmEliteIntraday", at: "08:40", tradingDayOnly: true }] }); // bật lại với lịch sử ESA gọn (trước: nến phút đầy đủ đẩy heap ~400/489 MB)

  // Ghi dòng lệnh Lee–Ready theo phút vào store mỗi phút (bền vững qua khởi động lại khi MARKET_STORE=supabase).
  const tickRecorder = createTickRecorder({ hub, store });

  // Quét liên tục tab Cổ tức (~300 mã): chạy xoay vòng job theo lô của Project A (cần PROJECT_A_CRON_SECRET).
  // Vercel CPU giai đoạn 2 (30/10/2026): job chạy NGAY TRÊN Gateway (worker_thread, gói vendor/qmsJobs.mjs) thay vì gọi Vercel.
  const cotucScanner = createCotucScanner({ store, callJob: qmsJobs.call });

  // Lịch giao dịch tự vận hành: quan sát phiên VN-Index thật (10 năm) > MARKET_HOLIDAYS > quy tắc âm lịch/BLLĐ.
  const tradingCalendar = createTradingCalendarService({
    loadSessionDates: async () => (await createAdjustedHistory({ service, store }).get("VNINDEX", { years: 10 })).bars.map((b) => b.date),
    official: () => marketConfig().holidays,
  });
  setHolidayProvider(tradingCalendar.isHoliday);
  tradingCalendar.start();

  const ledgerHealth = createLedgerHealth({ store, structure, scheduler,
    getCalendar: () => service.getOhlcv({ symbol: "VNINDEX", limit: 400 }).then((r) => (r.bars ?? []).filter((b) => !b.partial && b.close > 0).map((b) => b.date)) });
  runtime = { kqkd, fundWarehouse, agmPlans, eventStudy, seasonMap, cafefAnnounce, seasonX, corpEvents, dividendScreener, dqBase, fmLedger, divRunup, eliteToShadow, hlLedger, sharesEps, ledgerHealth, msGarch, preopen, providers, store, service, hub, jobs, scheduler, tickRecorder, cotucScanner, qmsJobs, tradingCalendar, nominalHistory, taSeries, corporateActions, cycles, top20, alpha, localBootstrap, structure, matrix, topbar, auth, elliottAlerts, elliottLedger, eventRadar, started: false };
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
  // Chất xúc tác: khởi động lại mà chưa có snapshot hoặc snapshot đã cũ (lỡ lượt quét) -> quét bù một lần sau 2 phút, không chờ tới giờ.
  setTimeout(() => {
    fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/catalysts/latest`, { signal: AbortSignal.timeout(30_000) })
      .then((r) => r.json())
      .then((d) => { if (!d?.scannedAt || d.isStale) return rt.scheduler.run("catalystScan1", "startup"); return null; })
      .catch((e) => console.warn(`[catalysts] quét bù lỗi: ${e.message}`));
  }, 120_000).unref?.();
  rt.elliottAlerts.start();
  // K0: kho KQKD chưa có (lần đầu triển khai / volume mới) -> nạp sau 3 phút (bỏ qua mã đã nạp trong 20 giờ).
  // S2: chưa có bản đồ mùa vụ -> dựng sau 20 phút (tuần tự, ~1.420 lần gọi Project A).
  if (!rt.seasonMap.hasData()) setTimeout(() => { rt.seasonMap.build().then(() => rt.seasonMap.ledgerTick()).catch((e) => console.warn(`[season-map] dựng lần đầu lỗi: ${e.message}`)); }, 1_200_000).unref?.();
  // BL2: chưa có phần tính sẵn độ bền -> dựng sau 15 phút (sau lượt nạp KQKD đầu).
  if (!rt.sharesEps.hasData()) setTimeout(() => { rt.sharesEps.refresh().catch((e) => console.warn(`[eps] nạp lần đầu lỗi: ${e.message}`)); }, 60_000).unref?.();
  if (!rt.divRunup.hasData()) setTimeout(() => { rt.jobs.toBuild().catch((e) => console.warn(`[to] dựng lần đầu lỗi: ${e.message}`)); }, 1_500_000).unref?.();
  if (!rt.dqBase.hasData()) setTimeout(() => { rt.dqBase.run().catch((e) => console.warn(`[dq] dựng lần đầu lỗi: ${e.message}`)); }, 900_000).unref?.();
  // LSK1: chưa có kho sự kiện -> nạp sau 90 giây.
  if (!rt.corpEvents.hasData()) setTimeout(() => { rt.corpEvents.refresh({ reason: "bootstrap" }).catch((e) => console.warn(`[corp-events] nạp lần đầu lỗi: ${e.message}`)); }, 90_000).unref?.();
  // S8: pha A (tới 2020) sau 4 phút nếu chưa đọc, rồi dựng bản THĂM DÒ (chỉ khi đạt tiêu chí đặt trước).
  if (!rt.seasonX.status().index) setTimeout(() => { rt.cafefAnnounce.crawl({ until: CA_RULES.phaseA }).then(() => rt.seasonX.run()).then((r) => console.log(`[season-x] lần đầu: ${JSON.stringify(r).slice(0, 300)}`)).catch((e) => console.warn(`[season-x] lần đầu lỗi: ${e.message}`)); }, 240_000).unref?.();
  // LC3: chưa có nghiên cứu sự kiện -> dựng sau 12 phút (sau lượt nạp KQKD đầu).
  if (!rt.eventStudy.hasData()) setTimeout(() => { rt.eventStudy.run().catch((e) => console.warn(`[event-study] dựng lần đầu lỗi: ${e.message}`)); }, 720_000).unref?.();
  if (!rt.kqkd.hasData()) setTimeout(() => { rt.kqkd.refresh({ force: false, reason: "bootstrap" }).catch((e) => console.warn(`[kqkd] nạp lần đầu lỗi: ${e.message}`)); }, 180_000).unref?.();
  rt.preopen.startTimer();
  // Cycle Fingerprint: nạp sẵn thư viện vào worker (đọc file trên Volume nếu có) để yêu cầu đầu tiên không phải chờ dựng lại.
  setTimeout(() => { rt.cycles.warm().then((r) => console.log(`[cycles] nạp sẵn: ${JSON.stringify(r)}`)).catch((e) => console.warn(`[cycles] nạp sẵn lỗi: ${e.message}`)); }, 5_000).unref?.();
  // M0: kho cục bộ thiếu dữ liệu (lần đầu triển khai / volume mới) -> tự dựng lại từ nguồn gốc sau 60 giây.
  if (rt.store.localFirst) setTimeout(() => { rt.localBootstrap.autoStart().then((r) => console.log(`[local-bootstrap] ${JSON.stringify(r)}`)).catch((e) => console.warn(`[local-bootstrap] ${e.message}`)); }, 60_000).unref?.();
  if (rt.store.localFirst) setTimeout(() => { rt.jobs.repairForeign().then((r) => { console.log(`[foreign-repair] ${JSON.stringify(r)}`); if (r.repaired.length) rt.matrix.clearMemo(); }).catch((e) => console.warn(`[foreign-repair] ${e.message}`)); }, 90_000).unref?.();
  console.log(`[market] Ingestor đã bật (store=${rt.store.kind}).`);
  return rt;
}

export function stopMarketRuntime() {
  if (!runtime) return;
  runtime.scheduler.stop();
  runtime.cycles?.close?.();
  runtime.cotucScanner.stop();
  runtime.eventRadar.stop();
  runtime.tradingCalendar.stop();
  setHolidayProvider(null);
  void runtime.tickRecorder.stop();
  runtime.hub.shutdown();
  runtime = undefined;
}
