import "dotenv/config";
import { createBuyTimingService } from "./market/elite/buyTiming.js";
import { createCotucStore } from "./market/cotuc/cotucStore.js";
import { createGatewayEliteZones, createGatewayTimeline } from "./market/cotuc/gatewayTimeline.js";
import { createCotucStoreRouter } from "./routes/cotucStore.js";
import { createCatalystRouter, readCatalystSnapshot } from "./routes/catalysts.js";
import { createCatalystChat } from "./market/catalystChat/chatService.js";
import { domesticEventsWithCountdown } from "./market/catalystChat/domesticEvents.js";
import { createLedgerEvaluator, EVAL_META_KEY } from "./market/catalystLedger/ledgerEvaluator.js";
import express from "express";
import v8 from "node:v8";
import cors from "cors";
import scanRouter from "./routes/scan.js";
import ssiRouter from "./routes/ssi.js";
import marketRouter from "./routes/market.js";
import { clientIp, createMacroRouter, isAdmin } from "./routes/macro.js";
import { createMacroService } from "./market/macro/macroService.js";
import { createWorldRouter, defaultPulse } from "./routes/world.js";
import { createBrokerViews } from "./market/brokerViews/brokerViewsService.js";
import { createBrokerViewsRouter } from "./routes/brokerViews.js";
import { createWorldStrategyService } from "./market/worldSectors/worldStrategyService.js";
import { createWsChatTools } from "./market/worldSectors/chatTools.js";
import { ICB_KV } from "./market/sectors/icbTaxonomy.js";
import { createWorldService } from "./market/world/worldService.js";
import { createWorldNews } from "./market/world/worldNews.js";
import { createWorldBrief } from "./market/world/worldBrief.js";
import { callGeminiJSON } from "./services/geminiClient.js";
import { createWorldMonitor } from "./market/world/worldMonitor.js";
import { createCommodityService } from "./market/commodities/commodityService.js";
import { createCommoditiesRouter } from "./routes/commodities.js";
import { createWorldSectorService } from "./market/worldSectors/worldSectorService.js";
import { createWorldSectorsRouter } from "./routes/worldSectors.js";
import { SECTOR_RRG_HISTORY_KV, SECTOR_RRG_KV } from "./market/sectors/sectorRotation.js";
import { startMarketIngestor, getMarketRuntime } from "./market/runtime.js";
import { isOriginAllowed, parseAllowedOrigins } from "./utils/corsOrigins.js";
import { createElitePanelService, panelDue } from "./market/elite/elitePanel.js";
import { createProfileFa } from "./market/elite/profileFa.js";
import { createDilution } from "./market/elite/dilutionService.js";
import { createImpactProfile } from "./market/elite/impactProfile.js";
import { runCatalystTool } from "./market/catalystChat/catalystTools.js";
import { createEvidenceEngine } from "./market/elite/evidenceEngine.js";
import { createLeadershipService } from "./market/elite/leadershipService.js";
import { createScreenerSeries } from "./market/strategies/screenerSeries.js";
import { createEliteAdjustedBars, createEliteAdjustedCloses } from "./market/elite/adjustedCloses.js";
import { createHlWatch } from "./market/elite/hlWatch.js";
import { consensusDisplay } from "./market/scanner/scanEngine.js";
import { createDecisionService } from "./market/elite/decisionService.js";
import { createEliteChatTools } from "./market/elite/chatTools.js";
import { createRiskService } from "./market/elite/riskService.js";
import { createRetroService } from "./market/elite/retroService.js";
import { createCashGateService } from "./market/cashGate/cashGateService.js";
import { createEarningsQualityService } from "./market/fundamentals/earningsQualityService.js";
import { createKqkdRouter } from "./routes/kqkd.js";
import { createCorpEventsRouter } from "./routes/corpEvents.js";
import { createSeasonOracle, SEASON_FIELDS, setSeasonReader } from "./market/fundamentals/seasonStore.js";
import { createEliteRouter } from "./routes/elite.js";
import { createResearchRoomRouter } from "./routes/researchRoom.js";
import { createResearchRoom } from "./market/elite/researchRoom.js";
import { loadVolumeAnalysis, getVolumeAnalysis } from "./market/scanner/volumeService.js";
import { createResearchAutonomy, historicalPrices, selectSessionProjection } from "./market/elite/researchAutonomy.js";
import { createAiRoomLedger } from "./market/elite/aiRoomLedger.js";
import { isTradingDay, lastCompletedSessionDate, vnDate } from "./market/calendar.js";
import { sharedEgressMeter, withDbTag } from "./market/store/egressMeter.js";
import { createDbBudgetRouter, startDbBudgetPersistence } from "./routes/dbBudget.js";
import { createAuthRouter } from "./routes/auth.js";
import { createHeapProfileRouter } from "./routes/heapProfile.js";
import { createUserFilters } from "./market/elite/userFilters.js";
import { SPEC_BY_ID } from "./market/elite/signalRegistry.js";

const app = express();

// Chỉ số ngành ICB (KV `sectors:rrg:history`, ~2,3 MB) dùng chung cho Kết nối thế giới / hàng hoá / ngành thế giới / chiến lược.
// KV chỉ dựng lại 1 lần/ngày (job 15:50 giờ VN) -> đệm tới 09:15Z kế tiếp (tối đa 12 giờ): ~2 lần đọc/ngày thay vì mỗi request
// (egress Supabase gói miễn phí).
const kvMemoValid = (memo) => {
  if (!memo) return false;
  const age = Date.now() - memo.at;
  if (age > 12 * 3600_000) return false;
  const next = new Date(memo.at);
  next.setUTCHours(9, 15, 0, 0);
  if (next.getTime() <= memo.at) next.setUTCDate(next.getUTCDate() + 1);
  return Date.now() < next.getTime();
};
let sectorDocMemo = null;
const sectorIndices = async () => {
  if (kvMemoValid(sectorDocMemo)) return sectorDocMemo.value;
  const value = (await getMarketRuntime().store.getKv(SECTOR_RRG_HISTORY_KV))?.value?.sectors ?? null;
  if (value) sectorDocMemo = { at: Date.now(), value };
  return value;
};
const PORT = process.env.PORT || 4000;

// FRONTEND_ORIGIN: danh sách phân tách bằng dấu phẩy, hỗ trợ "*" cho URL preview
// Vercel (xem utils/corsOrigins.js) khi Gateway chạy ở domain riêng.
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN || "http://localhost:5173");
app.use(cors({ origin: (origin, callback) => callback(null, isOriginAllowed(origin, allowedOrigins)) }));
app.use(express.json({ limit: "15mb" })); // ảnh base64 cần payload lớn hơn mặc định
// D0: nhãn đo egress Supabase theo route (3 đoạn đầu đường dẫn, bỏ mã cổ phiếu / id ở cuối).
app.use((req, res, next) => withDbTag(`http:${req.path.split("/").slice(0, 4).join("/")}`, next));

function healthHandler(req, res) {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    // Theo dõi heap (Gateway từng OOM 23/10/2026): MB đang dùng / trần heap V8 / RSS.
    memory: (() => { const m = process.memoryUsage(), mb = (b) => Math.round(b / 1048576); return { heapUsedMb: mb(m.heapUsed), heapLimitMb: mb(v8.getHeapStatistics().heap_size_limit), rssMb: mb(m.rss) }; })(),
  });
}

app.get("/health", healthHandler);
// ĐÃ THÊM: alias /api/health — khớp với route trên bản Vercel
// (api/health.js) để frontend (checkHealth() trong api.ts) gọi đúng cùng
// 1 đường dẫn dù đang chạy local hay đã deploy, không cần code rẽ nhánh
// theo môi trường cho riêng health check.
app.get("/api/health", healthHandler);
// D0/D1: băng thông Supabase hôm nay + dự báo tháng, trạng thái kho đệm.
app.use("/api/health/db-budget", createDbBudgetRouter({ getStore: () => getMarketRuntime().store, meter: sharedEgressMeter() }));
app.use("/api/health/heap-profile", createHeapProfileRouter());
// V3 (19/11/2026): chẩn đoán header chuyển tiếp mà Gateway thực nhận sau proxy Railway — CHỈ quản trị viên. Dùng để chọn header IP
// mà client không giả được cho giới hạn tần suất / chống dò mật khẩu. Không trả gì khác ngoài các header này.
app.get("/api/health/client-ip", (req, res) => {
  if (!isAdmin(req, process.env.MARKET_ADMIN_TOKEN || "")) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
  const pickH = (k) => req.headers[k] ?? null;
  res.set("Cache-Control", "no-store").json({
    xForwardedFor: pickH("x-forwarded-for"), xRealIp: pickH("x-real-ip"), xEnvoyExternalAddress: pickH("x-envoy-external-address"),
    forwarded: pickH("forwarded"), cfConnectingIp: pickH("cf-connecting-ip"), trueClientIp: pickH("true-client-ip"),
    socket: req.socket?.remoteAddress ?? null, reqIp: req.ip ?? null, clientIpUsed: clientIp(req),
  });
});

app.use("/api", scanRouter);
app.use("/api/ssi", ssiRouter);
app.use("/api/market", marketRouter);
app.use("/api/auth", createAuthRouter({ getAuth: () => getMarketRuntime().auth }));
// Trung tâm vĩ mô (tab Chất xúc tác): engine MacroCenter chạy trong worker thread, số liệu thật chỉ-thêm trong KV.
let macroService = null;
const getMacroService = () => (macroService ??= createMacroService({ store: getMarketRuntime().store, history: getMarketRuntime().nominalHistory }));
app.use("/api/macro", createMacroRouter({ getService: getMacroService }));
// V3 (19/11/2026): nạp nguồn vĩ mô CHỦ ĐỘNG — 3 phút sau khởi động rồi mỗi 30 phút kiểm; chỉ gọi nguồn ngoài khi lần nạp gần nhất
// đã cũ quá 12 giờ (refreshAutoFeeds tự bỏ qua khi còn mới). Trước đây chỉ nạp khi có người mở tab.
const macroTick = () => getMacroService().refreshAutoFeeds().catch((e) => console.warn(`[macro] nạp theo lịch lỗi: ${e?.message}`));
setTimeout(() => { void macroTick(); setInterval(() => void macroTick(), 30 * 60_000).unref?.(); }, 3 * 60_000).unref?.();
// Kết nối thế giới (engine world của gói macro-center 1.2): dữ liệu thật dựng 2 lần/ngày, engine trong worker thread.
let worldService = null;
const getWorldService = () => (worldService ??= createWorldService({
  store: getMarketRuntime().store, history: getMarketRuntime().nominalHistory, corporateActions: getMarketRuntime().corporateActions,
  macroObservations: () => getMacroService().observations(),
  sectorIndices,
}));
let worldNews = null;
const getWorldNews = () => {
  if (!worldNews) { worldNews = createWorldNews({ store: getMarketRuntime().store }); worldNews.startTimer(); }
  return worldNews;
};
const worldMonitor = createWorldMonitor();
let brokerViews = null;
const getBrokerViews = () => {
  if (!brokerViews) {
    brokerViews = createBrokerViews({
      store: getMarketRuntime().store, callModel: callGeminiJSON,
      getIndexBars: () => getMarketRuntime().service.getOhlcv({ symbol: "VNINDEX", limit: 300 }).then((r) => (r.bars ?? []).filter((b) => !b.partial && b.close > 0)),
      getQuant: () => getWorldStrategy().strategy().then((s) => (s?.short?.rows ?? []).map((r) => ({ icb: r.icb, nameVi: r.nameVi, z: r.zx }))),
    });
    if (process.env.GEMINI_API_KEY) brokerViews.startTimer();
  }
  return brokerViews;
};
const VN_MACRO_CATEGORIES = "MONETARY_POLICY,FISCAL_POLICY,MACRO_DATA,MARKET_STRUCTURE";
/** Bằng chứng Việt Nam cho bản tin AI. Từng nguồn lỗi thì bản tin vẫn chạy với phần còn lại. */
async function vnBriefEvidence() {
  const [macro, radar, broker, preopen] = await Promise.all([
    getMacroService().handle({ method: "GET", path: "/api/macro/series", query: { tail: "3" } }).then((r) => (r.status === 200 ? r.body : null)).catch(() => null),
    getMarketRuntime().eventRadar.list({ category: VN_MACRO_CATEGORIES, limit: 20 }).then((d) => d.events ?? []).catch(() => []),
    getBrokerViews().forBrief().catch(() => null),
    getMarketRuntime().preopen.get().catch(() => null),
  ]);
  return { macro, radar, broker, preopen };
}
let worldBrief = null;
const getWorldBrief = () => {
  if (!worldBrief) {
    worldBrief = createWorldBrief({
      store: getMarketRuntime().store, getMonitor: () => worldMonitor.get(), getNews: (o) => getWorldNews().get(o), getStrategy: () => getWorldStrategy().strategy(), getVn: vnBriefEvidence,
      callModel: callGeminiJSON,
    });
    if (process.env.GEMINI_API_KEY) worldBrief.startTimer();
  }
  return worldBrief;
};
// Lịch tự động không phụ thuộc việc có người mở tab.
if (process.env.GEMINI_API_KEY) setTimeout(() => { getWorldBrief(); getBrokerViews(); }, 120_000).unref?.();
app.use("/api/broker-views", createBrokerViewsRouter({ getService: getBrokerViews }));
app.use("/api/world", createWorldRouter({ getService: getWorldService, getMonitor: () => worldMonitor, getNews: getWorldNews, getBrief: getWorldBrief }));
// Nhịp đập hàng hoá (C1): Yahoo (ngày) + World Bank Pink Sheet (tháng), mỗi số kèm kỳ + nguồn.
let commodityService = null;
const getCommodityService = () => (commodityService ??= createCommodityService({
  store: getMarketRuntime().store, taSeries: getMarketRuntime().taSeries,
  sectorIndices,
}));
app.use("/api/commodities", createCommoditiesRouter({ getService: getCommodityService }));
// Nhịp đập thị trường (M1): ngành thế giới (STOXX 600 / SPDR / TOPIX-17 / KODEX …) ↔ ngành ICB Việt Nam.
let worldSectorService = null;
const getWorldSectorService = () => (worldSectorService ??= createWorldSectorService({
  sectorIndices, taSeries: getMarketRuntime().taSeries, commoditySeries: (id) => getCommodityService().seriesOf(id),
}));
// Chiến lược ngắn/trung hạn (S1): ghép ngành thế giới, hàng hoá, engine Truyền dẫn, RRG Lọc ngành.
let rrgMemo = null;
const rrgDoc = async () => {
  if (kvMemoValid(rrgMemo)) return rrgMemo.value;
  const value = (await getMarketRuntime().store.getKv(SECTOR_RRG_KV))?.value ?? null;
  if (value) rrgMemo = { at: Date.now(), value };
  return value;
};
let worldStrategy = null;
const getWorldStrategy = () => (worldStrategy ??= createWorldStrategyService({
  worldSectors: getWorldSectorService(), worldService: getWorldService(), pulse: defaultPulse(), rrgDoc, store: getMarketRuntime().store,
  vnIndex: async () => (await getMarketRuntime().service.getOhlcv({ symbol: "VNINDEX", range: "2y" })).bars.filter((b) => !b.partial && b.close > 0).map((b) => [b.date, b.close]),
}));
let taxonomyMemo = null;
const taxonomy = async () => {
  if (kvMemoValid(taxonomyMemo)) return taxonomyMemo.value;
  const value = (await getMarketRuntime().store.getKv(ICB_KV))?.value ?? null;
  if (value) taxonomyMemo = { at: Date.now(), value };
  return value;
};
let wsChatTools = null;
const getWsChatTools = () => (wsChatTools ??= createWsChatTools({
  strategy: () => getWorldStrategy().strategy(), worldSectors: getWorldSectorService(), commodities: getCommodityService(), taxonomy,
}));
app.use("/api/world-sectors", createWorldSectorsRouter({ getService: getWorldSectorService, getStrategy: getWorldStrategy, getChatTools: getWsChatTools }));
// Elite 10 (E1): sổ đăng ký tín hiệu — gom kết quả mọi tab sau phiên thành bảng mã × tín hiệu (point-in-time, KV theo ngày).
let elitePanel = null;
const getElitePanel = () => (elitePanel ??= createElitePanelService({
  catalystSnapshot: () => readCatalystSnapshot(getCotucStore()),
  store: getMarketRuntime().store, wsStrategy: () => getWorldStrategy().strategy(), rrgDoc, taxonomy,
  structureSummary: () => getMarketRuntime().structure.summary(),
  leadership: (date) => getEliteLeadership().live(date),
}));
// LS-r1: dòng Siêu quét của một mã cho khối "Sức mạnh dẫn dắt" (nhãn Đồng thuận hiển thị tách "Đang tăng, chưa dẫn dắt").
const eliteScannerItem = async (t) => {
  const v = (await getMarketRuntime().store.getKv("scanner:latest"))?.value;
  const it = (v?.items ?? []).find((x) => String(x.ticker).toUpperCase() === t);
  if (!it) return null;
  const disp = consensusDisplay({ statusCode: it.confluenceStatusCode, statusLabel: it.confluenceStatusLabel }, it.trendTag);
  return { dataAsOf: v.dataAsOf ?? null, consensusCode: disp.confluenceStatusCode, consensus: disp.confluenceStatusLabel, trendTag: it.trendTag ?? null, rsRating: it.rsRating ?? null,
    breakout: Boolean(it.breakoutBoostBadge), smartScore: it.smartScore ?? null, fScore: it.piotroskiFScore ?? null, fScoreMax: it.fScoreMax ?? null, fScoreApplicable: it.fScoreApplicable ?? null, foreignNetBuy: it.foreignNetBuyFlag ?? null };
};
// LS-r1: điểm dẫn dắt LS-v1 (Hồ sơ 360° + E3-v5 khi cổng H4 ĐẠT).
// 13/11/2026: chuỗi giá ĐIỀU CHỈNH ĐẦY ĐỦ cho LS-v1 và engine quyết định — kho Gateway (ADJUSTED_CUMULATIVE), thiếu thì kho VNDirect
// (xem elite/adjustedCloses.js). Trả Map(mã -> [[ngày, giá đóng cửa điều chỉnh, GTGD]]).
let eliteAdjusted = null;
const eliteAdjustedCloses = (tickers, to) => {
  const rt = getMarketRuntime();
  eliteAdjusted ??= createEliteAdjustedCloses({ seriesSource: createScreenerSeries({ store: rt.store, corporateActions: rt.corporateActions }), pricesOf: (t) => rt.eventStudy.pricesOf(t), store: rt.store });
  return eliteAdjusted(tickers, to);
};
// PX0 + PX-L (18/11/2026): vòng đời đợt pha loãng ≥ 10% (chỉ hiển thị; PX-r1 KHÔNG ĐẠT) + sổ theo dõi tiến.
let eliteDilution = null;
const getEliteDilution = () => (eliteDilution ??= createDilution({ store: getMarketRuntime().store, corpEvents: getMarketRuntime().corpEvents, panel: getElitePanel(),
  adjustedCloses: eliteAdjustedCloses, pricesOf: (t) => getMarketRuntime().eventStudy?.pricesOf?.(t) ?? null,
  isTradingDay: (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !(getMarketRuntime().tradingCalendar?.isHoliday?.(d) ?? false) }));
// PFA-v1 (17/11/2026): Hồ sơ 360° · Doanh nghiệp & Sự kiện — read-model ghép KQKD, cổ tức, sự kiện, TO-v1 theo phiên E1 (chỉ đọc engine có sẵn).
let eliteProfileFa = null;
const getEliteProfileFa = () => (eliteProfileFa ??= createProfileFa({ store: getMarketRuntime().store, panel: getElitePanel(), kqkd: getMarketRuntime().kqkd,
  dividendScreener: getMarketRuntime().dividendScreener, corpEvents: getMarketRuntime().corpEvents, divRunup: getMarketRuntime().divRunup }));
let eliteLeadership = null;
const getEliteLeadership = () => (eliteLeadership ??= createLeadershipService({
  store: getMarketRuntime().store, pricesOf: (t) => getMarketRuntime().eventStudy.pricesOf(t), adjustedCloses: eliteAdjustedCloses, adjustedStats: () => eliteAdjusted?.stats() ?? null,
  universe: async () => ((await getMarketRuntime().store.getKv("scanner:universe"))?.value?.tickers ?? []).map((x) => x.ticker),
  vnIndexBars: async () => (await getMarketRuntime().service.getOhlcv({ symbol: "VNINDEX", limit: 500 })).bars.filter((b) => !b.partial && b.close > 0),
  retroInputs: () => getEliteRetro().inputs(), commit: () => process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
}));
// E2: engine bằng chứng — IC hạng từng tín hiệu theo E2-prereg.md, cập nhật tăng dần sau mỗi bảng mới.
let eliteEvidence = null;
const getEliteEvidence = () => (eliteEvidence ??= createEvidenceEngine({ store: getMarketRuntime().store, panel: getElitePanel(), leadership: getEliteLeadership(), adjustedCloses: eliteAdjustedCloses }));
// E3: Điểm Elite + danh mục Elite 10 + sổ theo dõi tiến (E3-prereg.md).
let eliteDecision = null;
const vnIndexCloses = async () => (await getMarketRuntime().service.getOhlcv({ symbol: "VNINDEX", range: "1y" })).bars.filter((b) => !b.partial && b.close > 0).map((b) => [b.date, b.close]);
// Bộ lọc Elite theo tài khoản + sổ theo dõi tiến (30/10/2026). Điều kiện "_buyzone" = vùng mua ĐẠT KIỂM ĐỊNH đang mở / ≤ 10 phiên (Timeline Gateway).
let userFilters = null;
const getUserFilters = () => (userFilters ??= createUserFilters({ store: getMarketRuntime().store }));
const validatedBuyZone = async () => {
  const t = await getGatewayTimeline()();
  return new Set((t?.rows ?? []).filter((r) => r.tier === "VALIDATED" && (r.status === "IN_WINDOW" || (r.status === "UPCOMING" && r.sessionsToEntry <= 10))).map((r) => r.ticker));
};
// Lịch phiên đã đóng cho cảnh báo độ mới: tính cả phiên mà nến chỉ số bị lỗi giá (đóng cửa = 0) nhưng có khối lượng.
const vnIndexSessionDates = async () => (await getMarketRuntime().service.getOhlcv({ symbol: "VNINDEX", range: "1y" })).bars.filter((b) => !b.partial && (b.close > 0 || b.volume > 0)).map((b) => b.date);
// PZ-v2: lớp Vị trí giá + bảng Theo dõi chờ nền của Elite HL (chỉ hiển thị — PZ_GATE = false).
let eliteHlWatch = null;
const getEliteHlWatch = () => (eliteHlWatch ??= createHlWatch({
  store: getMarketRuntime().store,
  ohlcBars: createEliteAdjustedBars({ seriesSource: createScreenerSeries({ store: getMarketRuntime().store, corporateActions: getMarketRuntime().corporateActions }) }),
  strategyDocs: async () => {
    const st = getMarketRuntime().store;
    const [sepa, baseBreakout] = await Promise.all(["sepa", "base-breakout"].map((k) => st.getKv(`strategies:${k}`).then((x) => x?.value ?? null).catch(() => null)));
    return { sepa, baseBreakout };
  },
  vnIndex: vnIndexCloses,
}));
const getEliteDecision = () => (eliteDecision ??= createDecisionService({ sessionDates: vnIndexSessionDates, priceWatch: getEliteHlWatch(), store: getMarketRuntime().store, panel: getElitePanel(), evidence: getEliteEvidence(), leadership: getEliteLeadership(), adjustedCloses: eliteAdjustedCloses, vnIndex: vnIndexCloses, userFilters: getUserFilters(), buyZone: validatedBuyZone,
  dilution: (date, tickers) => getEliteDilution().phases(date, tickers),
  // E4-HL v1.1: RRG tuần đã đóng (U1), phân ngành ICB, sự kiện chính thức VNDirect (U3) — đều đọc từ kho đã có, không gọi ra ngoài.
  hlContext: async () => ({ rrg: await rrgDoc(), taxonomy: await taxonomy(), events: getMarketRuntime().corpEvents?.doc?.()?.events ?? [] }) }));
// E5: công cụ chat elite_* (Claude / Gemini ở Project A).
let eliteChatTools = null;
const getEliteChatTools = () => (eliteChatTools ??= createEliteChatTools({
  decision: () => getEliteDecision().decision(), panel: () => getElitePanel().panel(), evidence: () => getEliteEvidence().evidence(),
}));
// E7: kiểm định hồi cứu walk-forward (chạy theo yêu cầu admin).
let eliteRetro = null;
// B1: Timeline điểm mua (Project A) qua Gateway — bản tốt gần nhất trên Railway Volume, làm mới nền, lùi khi lỗi.
// B2/B3: kho Cổ tức (thay Neon của Project A) + Timeline tính trên Gateway làm nguồn chính cho Radar / Elite 10.
let cotucStore = null, gatewayTimeline = null;
const getCotucStore = () => (cotucStore ??= createCotucStore({ store: getMarketRuntime().store }));
const getGatewayTimeline = () => (gatewayTimeline ??= createGatewayTimeline({ cotucStore: getCotucStore() }));
// SD-v1: Mùa vụ KQKD đọc thẳng bảng "season" (chỉ đọc) của cùng kho mà job Mùa vụ ghi — không vòng qua Project A.
setSeasonReader(async (t) => (await getCotucStore().list("season", { tickers: [t], fields: SEASON_FIELDS }))[0] ?? null,
  async () => (await getCotucStore().list("season", { fields: ["ticker", "sector"] })).map((r) => ({ ticker: r.ticker, sector: r.sector ?? null })));
const seasonOracle = createSeasonOracle();
let eliteZones = null;
const getEliteZones = () => (eliteZones ??= createGatewayEliteZones({ cotucStore: getCotucStore() }));
let eliteBuyTiming = null;
const getEliteBuyTiming = () => (eliteBuyTiming ??= createBuyTimingService({ store: getMarketRuntime().store, localTimeline: () => getGatewayTimeline()() }));
const getEliteRetro = () => (eliteRetro ??= createRetroService({ store: getMarketRuntime().store, taxonomy, vnIndex: vnIndexCloses, adjustedCloses: eliteAdjustedCloses }));
// CG-r1: Cổng tiền mặt (đăng ký trước, KHÔNG ĐẠT -> chỉ mô tả) + sổ tiến bóng.
let cashGate = null;
const getCashGate = () => (cashGate ??= createCashGateService({
  store: getMarketRuntime().store,
  vnIndexBars: async () => (await getMarketRuntime().service.getOhlcv({ symbol: "VNINDEX", limit: 800 })).bars.filter((b) => !b.partial && b.close > 0),
}));
// E6: rủi ro danh mục Elite 10.
let eliteRisk = null;
const getEliteRisk = () => (eliteRisk ??= createRiskService({ store: getMarketRuntime().store, decision: () => getEliteDecision().decision(), vnIndex: vnIndexCloses, adjustedCloses: eliteAdjustedCloses }));
function getResearchSession() {
  const rt = getMarketRuntime();
  return rt.service.cache.wrap("ai-room:published-session", 15_000, async () => {
    const [dates, scan, panel, decision] = await Promise.all([
      rt.store.getMarketDailyDates(), rt.store.getKv("scanner:latest"), getElitePanel().panel(), getEliteDecision().decision(),
    ]);
    const observedAt = new Date();
    const expectedClosedSession = lastCompletedSessionDate(observedAt);
    const marketDailySession = dates.at(-1) ?? null;
    const scannerSession = scan?.value?.dataAsOf ?? null;
    const decisionSession = decision?.date ?? null;
    const coverage = (await rt.store.getKv("local:eod:coverage:" + expectedClosedSession))?.value;
    const stage = !coverage || coverage.awaitingData ? "EOD" : marketDailySession !== expectedClosedSession ? "MARKET_DAILY" : scannerSession !== expectedClosedSession ? "SCANNER" :
      panel?.date !== expectedClosedSession || decisionSession !== expectedClosedSession ? "DECISION" : "PUBLISHED";
    const relevantJobs = rt.scheduler.status().filter((job) => ["syncEod", "syncMarketDaily", "sessionCatchUp", "sessionCatchUpLate", "scanUniverse"].includes(job.name));
    const eod = relevantJobs.find((job) => job.name === "syncEod")?.last?.result;
    const retryAt = relevantJobs.map((job) => job.retry?.at).filter((time) => Number.isFinite(time) && time > observedAt.getTime()).sort((a, b) => a - b)[0];
    return { expectedClosedSession, marketDailySession, scannerSession, decisionSession, stage,
      worker: await getResearchAutonomy().health(decision).catch(() => undefined),
      observedAt: observedAt.toISOString(), retryAt: retryAt ? new Date(retryAt).toISOString() : null,
      eod: coverage ? { confirmed: coverage.confirmed, expected: coverage.expected } : eod?.date === expectedClosedSession ? { confirmed: eod.confirmedCore, expected: eod.expectedCore } : null,
      publication: [expectedClosedSession, stage, marketDailySession, scannerSession, scan?.value?.generatedAt, panel?.date, panel?.builtAt, panel?.version, decisionSession, decision?.builtAt, decision?.version].join("|"),
    };
  });
}
const researchUser = async (authorization) => (await getMarketRuntime().auth.verifyAccess(authorization))?.userId ?? null;
let researchRoom = null;
let researchAutonomy;
// ARL-v1 (26/11/2026): sổ phán quyết Phòng họp AI — ghi từ vòng nền, chấm theo giá điều chỉnh so với VN-Index (kho đã có, không gọi ra ngoài).
let aiRoomLedger;
const getAiRoomLedger = () => (aiRoomLedger ??= createAiRoomLedger({ store: getMarketRuntime().store, adjustedCloses: eliteAdjustedCloses, vnIndex: vnIndexCloses }));
const getResearchAutonomy = () => (researchAutonomy ??= createResearchAutonomy({
  ledger: getAiRoomLedger(),
  store: getMarketRuntime().store, decision: () => getEliteDecision().decision(), session: getResearchSession,
  capture: (ticker, date) => getResearchRoom().capture(ticker, date),
  configured: () => getCatalystChat().config().providers,
  infer: (side, message, snapshot, lane) => getCatalystChat().analyzeSealed(side, message, snapshot, lane),
}));

async function selectResearchProjection(ticker, capture) {
  return selectSessionProjection(ticker, capture, await getResearchSession(), getResearchAutonomy().read);
}
const getResearchRoom = () => (researchRoom ??= createResearchRoom({
  store: getMarketRuntime().store,
  expectedClosedSession: lastCompletedSessionDate,
  selectProjection: selectResearchProjection,
  load: (ticker, date) => {
    const rt = getMarketRuntime();
    if (date) {
      // Cold start: reconstruct only dated records and anchor adjusted prices to the selected close.
      // Current news revisions, ledger and intraday quotes must not leak into a historical decision.
      const end = Date.parse(date + "T23:59:00+07:00");
      const rows = rt.store.getMarketDailyRange({ from: new Date(end - 540 * 86400_000).toISOString().slice(0, 10), to: date, symbols: [ticker] });
      return {
        decision: () => getEliteDecision().decision(date),
        panel: async () => { const doc = await getElitePanel().panel(date), row = doc?.rows.find((r) => r.ticker === ticker);
          return row ? { ...row, date: doc.date, version: doc.version, signals: doc.signals ?? [], missingSources: doc.missingSources ?? [] } : null; },
        instrument: async () => { const row = (await rows).at(-1); return row && { ticker, exchange: row.exchange }; },
        price: async () => historicalPrices(await rows, date),
        volume: () => getVolumeAnalysis(rt.service, ticker, { detail: "summary", closedDate: date, now: () => end }),
        events: async () => { const news = await rt.eventRadar.list({ ticker, limit: 12 });
          return { generatedAt: new Date(end).toISOString(), events: (news?.events ?? []).filter((e) =>
            Date.parse(e.firstSeenAt) <= end && Date.parse(e.updatedAt ?? e.firstSeenAt) <= end) }; },
      };
    }
    return {
      decision: async () => {
        const engine = getEliteDecision(), doc = await engine.decision();
        return doc ? engine.present(doc, { withFreshness: true }) : null;
      },
      evidence: () => getEliteEvidence().evidence(), ledger: () => getEliteDecision().ledger(null), risk: () => getEliteRisk().risk(),
      ...(ticker ? {
        instrument: async () => (await rt.service.getUniverse()).tickers.find((row) => row.ticker === ticker),
        price: () => rt.service.cache.wrap(`ta-series:${ticker}:5y:1300`, 60_000, () => rt.taSeries.get({ symbol: ticker, range: "5y", limit: 1300 })),
        panel: async () => {
          const doc = await getElitePanel().panel(), row = doc?.rows.find((item) => item.ticker === ticker);
          return row ? { ...row, date: doc.date, version: doc.version, missingSources: doc.missingSources ?? [], signals: doc.signals ?? [] } : null;
        },
        liquidity: () => getEliteDecision().liquidity(ticker),
        events: () => rt.eventRadar.list({ ticker, limit: 12 }),
        volume: () => loadVolumeAnalysis(rt.service, ticker, "research"),
        timeline: async () => {
          const doc = await getEliteBuyTiming().get({ tickers: [ticker] });
          return doc?.available && Array.isArray(doc.rows) && doc.asOf ? doc : null;
        },
      } : {}),
    };
  },
}));
// V4 (19/11/2026): "Hỏi đáp xúc tác" + "Sự kiện trong nước" chuyển từ Project A về Gateway; công cụ gọi thẳng dịch vụ trong tiến trình.
let catalystChat = null;
const getCatalystChat = () => (catalystChat ??= createCatalystChat({
  verifyUser: async (authorization) => (await getMarketRuntime().auth.verifyAccess(authorization))?.userId ?? null,
  store: getMarketRuntime().store,
  resolveSnapshotReview: (owner, id, role) => getResearchRoom().reviewPrompt(owner, id, role),
  finishSnapshotReview: (owner, review, role, text) => getResearchRoom().finishReview(owner, review, role, text),
  sources: {
    macro: () => getMacroService().toolSpecs(), world: () => getWorldService().toolSpecs(),
    ws: () => getWsChatTools().specs(), elite: () => getEliteChatTools().specs(),
  },
  run: {
    macro: (n, a) => getMacroService().runTool(n, a), world: (n, a) => getWorldService().runTool(n, a),
    ws: (n, a) => getWsChatTools().run(n, a), elite: (n, a) => getEliteChatTools().run(n, a),
  },
  getSnapshot: () => readCatalystSnapshot(getCotucStore()),
  calendar: (horizonDays) => getMacroService().catalystEvents({ horizonDays }),
}));
// I0-G1 (19/11/2026): chấm sổ tín hiệu xúc tác theo giao thức X6 (khoá riêng ledger-eval / ledger-context), mỗi ngày sau 15:30 giờ VN.
let catalystLedger = null;
const catKv = {
  get: async (key) => (await getCotucStore().list("catkv", { keys: [key], fields: ["value"] }))[0]?.value ?? null,
  set: (key, value) => getCotucStore().upsert("catkv", [{ key, value: JSON.parse(JSON.stringify(value)) }]),
};
const getCatalystLedger = () => (catalystLedger ??= createLedgerEvaluator({
  kvGet: catKv.get, kvSet: catKv.set,
  // cổ phiếu: giá điều chỉnh theo sự kiện quyền (tránh tụt giá do GDKHQ); VN-Index: điểm chỉ số
  getBars: async (symbol, from) => (await getMarketRuntime().service.getOhlcv({ symbol, from, to: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), ...(symbol === "VNINDEX" ? {} : { adjusted: "true" }) })).bars,
  // ngữ cảnh: sự kiện còn trong danh sách; nếu đã rời danh sách thì lấy bản sửa SỚM NHẤT còn trong sổ (gần thời điểm tín hiệu nhất)
  getRadarEvent: async (id) => {
    if (!id) return null;
    const rt = getMarketRuntime();
    const ev = (await rt.eventRadar.getEvent(id).catch(() => null))?.event;
    if (ev) return ev;
    const revs = await rt.eventRadarRepository.listRevisions(id, { limit: 500 }).catch(() => null);
    return revs?.rows?.[0]?.payload ?? null;
  },
}));
const ledgerTick = async () => {
  const vn = new Date(Date.now() + 7 * 3600_000);
  if (vn.getUTCHours() * 60 + vn.getUTCMinutes() < 15 * 60 + 30) return;
  const last = (await catKv.get(EVAL_META_KEY).catch(() => null))?.ranAt;
  if (last && new Date(Date.parse(last) + 7 * 3600_000).toISOString().slice(0, 10) === vn.toISOString().slice(0, 10)) return;
  await getCatalystLedger().run().catch((e) => console.warn(`[catalyst-ledger] chấm lỗi: ${e?.message}`));
};
setTimeout(() => { void ledgerTick(); setInterval(() => void ledgerTick(), 30 * 60_000).unref?.(); }, 4 * 60_000).unref?.();
app.use("/api/catalysts", createCatalystRouter({ getStore: getCotucStore, getChat: getCatalystChat, getDomesticEvents: domesticEventsWithCountdown,
  getLedger: getCatalystLedger, isAdmin: (req) => isAdmin(req, process.env.MARKET_ADMIN_TOKEN || "") }));
// F5 (06/11/2026): Chất lượng KQKD (SUE/SUR, tăng trưởng có kiểm soát) cho tab PHÂN TÍCH CƠ BẢN › Kết quả kinh doanh.
let earningsQuality = null;
app.get("/api/fundamentals/earnings-quality", async (req, res) => {
  try {
    earningsQuality ??= createEarningsQualityService({ store: getMarketRuntime().store });
    const doc = await earningsQuality.quality();
    if (!doc) return res.status(503).json({ error: "Chưa có BCTC quý (job alpha chưa chạy)." });
    res.set("Cache-Control", "public, max-age=900");
    res.json(doc);
  } catch (e) {
    res.status(503).json({ error: `Kho dữ liệu tạm không đọc được: ${e.message}` });
  }
});
// K0–K6 (06/11/2026): KQKD theo quý — BCTC đầy đủ VNDirect trên Railway Volume.
app.use("/api/corp-events", createCorpEventsRouter({ getService: () => getMarketRuntime().corpEvents, getExStudy: () => getMarketRuntime().eventStudy?.exDoc?.() ?? null, getCafefNews: (t) => getMarketRuntime().cafefAnnounce?.news?.(t) ?? null, getScreener: () => getMarketRuntime().dividendScreener, getFmLedger: () => getMarketRuntime().fmLedger, getRunup: () => getMarketRuntime().divRunup }));
app.use("/api/fundamentals/kqkd", createKqkdRouter({ getService: () => getMarketRuntime().kqkd, getWarehouse: () => getMarketRuntime().fundWarehouse, getVciFa: async (t) => (await getMarketRuntime().store.getFundamentals?.([t]))?.get?.(t) ?? null, getAgm: () => getMarketRuntime().agmPlans, getEventStudy: () => getMarketRuntime().eventStudy, getSeasonMap: () => getMarketRuntime().seasonMap, getSeasonOracle: () => seasonOracle, getSeasonX: () => getMarketRuntime().seasonX, getCafef: () => getMarketRuntime().cafefAnnounce }));
app.use("/api/cotuc-store", createCotucStoreRouter({
  getStore: getCotucStore, getTimeline: async () => (await getGatewayTimeline()()) ?? { available: false },
  getHealth: async () => {
    const scan = getMarketRuntime().cotucScanner?.status?.() ?? null;
    const lane = (l) => (l ? { lastPassAt: l.lastPassAt, lastBatchAt: l.lastBatchAt, pausedUntil: l.pausedUntil, breakerTrips: l.breakerTrips, lastError: l.lastError?.message ?? null } : null);
    return { store: await getCotucStore().status(), buyTiming: getEliteBuyTiming().status(), scanner: scan ? { enabled: scan.enabled, timing: lane(scan.timing), seasonality: lane(scan.seasonality) } : null };
  },
}));
// D4 (19/11/2026): khối "Tác động lên cổ phiếu" — gom lớp tác động từ dịch vụ sẵn có, dấu từ sổ bằng chứng (impactProfile.js).
let eliteImpact = null;
const getEliteImpact = () => (eliteImpact ??= createImpactProfile({ sources: {
  fa: (t) => getEliteProfileFa().ticker(t),
  commodities: () => getCommodityService().snapshot(),
  ws: (t) => getWsChatTools().run("ws_stock", { ticker: t }),
  catalyst: async (t) => runCatalystTool("catalyst_ticker", { ticker: t }, await readCatalystSnapshot(getCotucStore())),
  x6: () => getCatalystLedger().progress(),
  radar: (t) => getMarketRuntime().eventRadar.list({ ticker: t, limit: 250 }),
  dilution: (t) => getEliteDilution().ticker(t),
} }));
app.use("/api/elite/ai-room", createResearchRoomRouter({ getRoom: getResearchRoom, verifyUser: researchUser, getSession: getResearchSession,
  precomputed: (ticker) => getResearchAutonomy().read(ticker),
  ledger: getAiRoomLedger,
  observation: async (ticker) => {
    if (typeof ticker !== "string" || !/^[A-Z][A-Z0-9]{2}$/.test(ticker)) throw Object.assign(new Error("Mã không hợp lệ."), { statusCode: 400 });
    const status = await getResearchSession();
    return getMarketRuntime().service.cache.wrap("ai-room:observation:" + ticker + ":" + status.publication, 30_000,
      () => selectResearchProjection(ticker, getResearchRoom().capture));
  } }));
app.use("/api/elite", createEliteRouter({ getImpact: getEliteImpact, getProfileFa: getEliteProfileFa, getDilution: getEliteDilution, getHlWatch: getEliteHlWatch, getPanel: getElitePanel, getLeadership: getEliteLeadership, getScannerItem: eliteScannerItem, getCashGate, getEvidence: getEliteEvidence, getDecision: getEliteDecision, getChatTools: getEliteChatTools, getRisk: getEliteRisk, getRetro: getEliteRetro, getBuyTiming: getEliteBuyTiming, getEliteZones, getToShadow: () => getMarketRuntime().eliteToShadow ?? null, getHlLedger: () => getMarketRuntime().hlLedger ?? null, getUserFilters,
  verifyUser: async (authorization) => (await getMarketRuntime().auth.verifyAccess(authorization)).userId, knownSignals: new Set(SPEC_BY_ID.keys()) }));
if (process.env.NODE_ENV !== "test") {
  // Từ 17:00 giờ VN ngày giao dịch: dựng một lần cho phiên hôm nay (khởi động lại giữa chừng vẫn dựng bù); ngoài khung không đọc KV.
  // Mỗi phiên dựng một lần; lần dựng LỖI (VD kho dữ liệu tạm khoá) được thử lại sau 30 phút thay vì bỏ cả ngày.
  const ELITE_RETRY_MS = 30 * 60_000;
  const tried = { evidence: null, decision: null }; // { date, at, ok }
  let cashGateRecorded = null;
  const due = (k, date) => { const t = tried[k]; return !t || t.date !== date || (!t.ok && Date.now() - t.at >= ELITE_RETRY_MS); };
  let pzBackfillTried = null, frozenRetryAt = 0;
  // PFA-v1: dựng hồ sơ Doanh nghiệp & Sự kiện một lần cho phiên E1 mới nhất (vòng riêng, không đụng vòng dựng quyết định).
  let pfaTriedAt = 0;
  const pfaTick = async () => {
    try {
      const p = await getElitePanel().panel(); if (!p?.date) return;
      const st = getEliteProfileFa().status(); if (st.asOf === p.date) return;
      if (Date.now() - pfaTriedAt < 20 * 60_000) return; pfaTriedAt = Date.now();
      const d = await getEliteProfileFa().build();
      console.log(`[elite] hồ sơ PFA ${d.asOf}: ${d.coverage.tickers} mã · KQKD ${d.coverage.earnings} · cổ tức ${d.coverage.dividend} · ${d.ms} ms`);
    } catch (e) { console.warn(`[elite] hồ sơ PFA lỗi: ${e.message}`); }
  };
  setTimeout(() => { void pfaTick(); setInterval(() => void pfaTick(), 10 * 60_000).unref?.(); }, 6 * 60_000).unref?.();
  // PX-L: ghi đợt pha loãng mới + chấm kết quả, một lần cho mỗi phiên E1 (vòng riêng).
  let pxDate = null, pxTriedAt = 0;
  const pxTick = async () => {
    try {
      const p = await getElitePanel().panel(); if (!p?.date || p.date === pxDate) return;
      if (Date.now() - pxTriedAt < 20 * 60_000) return; pxTriedAt = Date.now();
      const r = await getEliteDilution().tick(); if (r) { pxDate = r.date; console.log(`[elite] sổ PX-L ${r.date}: ${r.entries} đợt · chấm ${r.due}`); }
    } catch (e) { console.warn(`[elite] sổ PX-L lỗi: ${e.message}`); }
  };
  setTimeout(() => { void pxTick(); setInterval(() => void pxTick(), 10 * 60_000).unref?.(); }, 7 * 60_000).unref?.();
  const eliteTick = async () => {
    try {
      const inWindow = panelDue(Date.now(), isTradingDay);
      const latest = await getElitePanel().panel();
      // Bù phiên (sự cố 13/11/2026): Siêu Quét đã có phiên mới hơn bảng tín hiệu (job bù phiên vừa quét lại phiên lỡ) -> dựng bảng và
      // quyết định cho phiên đó ngay, kể cả ngoài giờ / ngày nghỉ. Mọi nguồn của bảng lấy ngày từ dữ liệu nên không ghi sai phiên.
      const scanAsOf = (await getMarketRuntime().store.getKv("scanner:latest").catch(() => null))?.value?.dataAsOf ?? null;
      const catchUp = !inWindow && Boolean(scanAsOf && latest?.date && scanAsOf > latest.date);
      // Phiên bị CHỐT DỮ LIỆU (thiếu nguồn lúc dựng) -> thử dựng lại tối đa 1 lần / 60 phút khi nguồn có thể đã đủ (VD nến VN-Index lỗi
      // vừa được vá). Dịch vụ quyết định chỉ thay bản ghi sổ CHƯA chấm; bản ghi đã chấm giữ nguyên.
      const cur = await getEliteDecision().decision().catch(() => null);
      if (!catchUp && cur?.hl?.dataGuard?.frozen && cur.date === latest?.date && Date.now() - frozenRetryAt > 60 * 60_000) {
        frozenRetryAt = Date.now();
        const p2 = await getElitePanel().build({ force: true });
        const dec2 = await getEliteDecision().build({ force: true });
        console.log(`[elite] dựng lại phiên ${dec2.date} bị chốt dữ liệu: thiếu nguồn ${p2.missingSources.join(", ") || "không"} -> ${dec2.hl?.dataGuard?.frozen ? "vẫn chốt (" + dec2.hl.dataGuard.reasonsVi.join("; ") + ")" : "đủ dữ liệu, áp quy tắc"}`);
        return;
      }
      if (!inWindow && !catchUp) {
        // PZ-v2: tài liệu quyết định đã khoá trước khi có lớp Vị trí giá -> bổ sung trường hiển thị một lần (danh mục không đổi).
        const dec = await getEliteDecision().decision().catch(() => null);
        if (dec?.hl && !dec.hl.pz && pzBackfillTried !== dec.date) { pzBackfillTried = dec.date; await getEliteDecision().build(); console.log(`[elite] vị trí giá bổ sung cho phiên ${dec.date}`); }
        return;
      }
      if (catchUp) console.log(`[elite] bù phiên: bảng tín hiệu ${latest.date} -> Siêu Quét ${scanAsOf}`);
      if (catchUp || latest?.date !== vnDate(new Date())) {
        const doc = await getElitePanel().build();
        console.log(`[elite] bảng tín hiệu ${doc.date}: ${doc.universe} mã, thiếu nguồn: ${doc.missingSources.join(", ") || "không"}`);
      }
      const panelDate = (await getElitePanel().panel())?.date;
      const ev = await getEliteEvidence().evidence();
      if (panelDate && ev?.calendarLast !== panelDate && due("evidence", panelDate)) {
        tried.evidence = { date: panelDate, at: Date.now(), ok: false };
        const next = await getEliteEvidence().update();
        tried.evidence.ok = true;
        console.log(`[elite] bằng chứng ${next.calendarLast}: ${next.tests} phép thử, A ${next.counts.A} · B ${next.counts.B} · C ${next.counts.C}`);
      }
      if (panelDate && due("decision", panelDate)) {
        tried.decision = { date: panelDate, at: Date.now(), ok: false };
        const dec = await getEliteDecision().build();
        tried.decision.ok = true;
        console.log(`[elite] Elite 10 ${dec.date}: ${dec.portfolio.map((x) => x.ticker).join(", ")} · ${dec.ledgerSummary?.label}`);
      }
      // CG-r1: ghi sổ tiến bóng cho phiên đã đóng (một lần mỗi phiên; lỗi nguồn không chặn phần còn lại).
      if (panelDate && cashGateRecorded !== panelDate) {
        await getCashGate().status({ refresh: true, recordLedger: true }).then(() => { cashGateRecorded = panelDate; }).catch((e) => console.warn(`[elite] cash gate: ${e.message}`));
      }
    } catch (e) {
      console.warn(`[elite] ${e.message}`);
    }
  };
  const rt = getMarketRuntime();
  const refreshRoom = () => rt.started && getResearchAutonomy().tick().catch((e) => console.warn("[ai-room] " + e.message));
  rt.jobs.publishEliteDecision = async () => { await eliteTick(); void refreshRoom(); void getAiRoomLedger().score(); };
  const eliteTagged = () => rt.scheduler.run("publishEliteDecision").catch((e) => console.warn("[elite] " + e.message));
  setTimeout(refreshRoom, 5_000).unref?.();
  setInterval(refreshRoom, 30_000).unref?.();
  setTimeout(eliteTagged, 120_000).unref?.();
  setInterval(eliteTagged, 10 * 60_000).unref?.();
}
// Sổ theo dõi tiến (S2): dựng chiến lược 30 phút/lần để ghi & khoá bản ghi trước giờ mở cửa VN (không phụ thuộc người xem).
if (process.env.NODE_ENV !== "test") {
  const tick = () => withDbTag("job:worldStrategy", () => getWorldStrategy().strategy()).catch((e) => console.warn(`[strategy] ${e.message}`));
  setTimeout(tick, 90_000).unref?.();
  setInterval(tick, 30 * 60_000).unref?.();
}

app.use((req, res) => {
  res.status(404).json({ error: "Không tìm thấy route." });
});

app.listen(PORT, () => {
  console.log(`AI Chart Vision backend đang chạy tại http://localhost:${PORT}`);
  // Đồng bộ dữ liệu SSI vào kho theo lịch (chỉ khi MARKET_INGESTOR_ENABLED=true).
  startMarketIngestor();
  if (process.env.NODE_ENV !== "test") startDbBudgetPersistence({ getStore: () => getMarketRuntime().store, meter: sharedEgressMeter() });
});

// Railway gửi SIGTERM khi deploy/khởi động lại: ghi nốt dòng lệnh tick còn trong bộ nhớ rồi thoát.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, async () => {
    try {
      await Promise.race([getMarketRuntime().tickRecorder.flush(), new Promise((r) => setTimeout(r, 8_000))]);
      getMarketRuntime().store.flushWarehouse?.(); // D1: ghi nốt phân vùng đệm ra đĩa
    } finally {
      process.exit(0);
    }
  });
}
