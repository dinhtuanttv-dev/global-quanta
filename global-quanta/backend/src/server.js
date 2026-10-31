import "dotenv/config";
import { createBuyTimingService } from "./market/elite/buyTiming.js";
import { createCotucStore } from "./market/cotuc/cotucStore.js";
import { createGatewayEliteZones, createGatewayTimeline } from "./market/cotuc/gatewayTimeline.js";
import { createCotucStoreRouter } from "./routes/cotucStore.js";
import { createCatalystRouter, readCatalystSnapshot } from "./routes/catalysts.js";
import express from "express";
import v8 from "node:v8";
import cors from "cors";
import scanRouter from "./routes/scan.js";
import ssiRouter from "./routes/ssi.js";
import marketRouter from "./routes/market.js";
import { createMacroRouter } from "./routes/macro.js";
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
import { createEvidenceEngine } from "./market/elite/evidenceEngine.js";
import { createDecisionService } from "./market/elite/decisionService.js";
import { createEliteChatTools } from "./market/elite/chatTools.js";
import { createRiskService } from "./market/elite/riskService.js";
import { createRetroService } from "./market/elite/retroService.js";
import { createEliteRouter } from "./routes/elite.js";
import { isTradingDay, vnDate } from "./market/calendar.js";
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
    mock_mode: process.env.USE_MOCK_DATA !== "false",
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

app.use("/api", scanRouter);
app.use("/api/ssi", ssiRouter);
app.use("/api/market", marketRouter);
app.use("/api/auth", createAuthRouter({ getAuth: () => getMarketRuntime().auth }));
// Trung tâm vĩ mô (tab Chất xúc tác): engine MacroCenter chạy trong worker thread, số liệu thật chỉ-thêm trong KV.
let macroService = null;
const getMacroService = () => (macroService ??= createMacroService({ store: getMarketRuntime().store, history: getMarketRuntime().nominalHistory }));
app.use("/api/macro", createMacroRouter({ getService: getMacroService }));
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
  const [macro, radar, broker] = await Promise.all([
    getMacroService().handle({ method: "GET", path: "/api/macro/series", query: { tail: "3" } }).then((r) => (r.status === 200 ? r.body : null)).catch(() => null),
    getMarketRuntime().eventRadar.list({ category: VN_MACRO_CATEGORIES, limit: 20 }).then((d) => d.events ?? []).catch(() => []),
    getBrokerViews().forBrief().catch(() => null),
  ]);
  return { macro, radar, broker };
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
}));
// E2: engine bằng chứng — IC hạng từng tín hiệu theo E2-prereg.md, cập nhật tăng dần sau mỗi bảng mới.
let eliteEvidence = null;
const getEliteEvidence = () => (eliteEvidence ??= createEvidenceEngine({ store: getMarketRuntime().store, panel: getElitePanel() }));
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
const getEliteDecision = () => (eliteDecision ??= createDecisionService({ store: getMarketRuntime().store, panel: getElitePanel(), evidence: getEliteEvidence(), vnIndex: vnIndexCloses, userFilters: getUserFilters(), buyZone: validatedBuyZone }));
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
let eliteZones = null;
const getEliteZones = () => (eliteZones ??= createGatewayEliteZones({ cotucStore: getCotucStore() }));
let eliteBuyTiming = null;
const getEliteBuyTiming = () => (eliteBuyTiming ??= createBuyTimingService({ store: getMarketRuntime().store, localTimeline: () => getGatewayTimeline()() }));
const getEliteRetro = () => (eliteRetro ??= createRetroService({ store: getMarketRuntime().store, taxonomy, vnIndex: vnIndexCloses }));
// E6: rủi ro danh mục Elite 10.
let eliteRisk = null;
const getEliteRisk = () => (eliteRisk ??= createRiskService({ store: getMarketRuntime().store, decision: () => getEliteDecision().decision(), vnIndex: vnIndexCloses }));
app.use("/api/catalysts", createCatalystRouter({ getStore: getCotucStore }));
app.use("/api/cotuc-store", createCotucStoreRouter({
  getStore: getCotucStore, getTimeline: async () => (await getGatewayTimeline()()) ?? { available: false },
  getHealth: async () => {
    const scan = getMarketRuntime().cotucScanner?.status?.() ?? null;
    const lane = (l) => (l ? { lastPassAt: l.lastPassAt, lastBatchAt: l.lastBatchAt, pausedUntil: l.pausedUntil, breakerTrips: l.breakerTrips, lastError: l.lastError?.message ?? null } : null);
    return { store: await getCotucStore().status(), buyTiming: getEliteBuyTiming().status(), scanner: scan ? { enabled: scan.enabled, timing: lane(scan.timing), seasonality: lane(scan.seasonality) } : null };
  },
}));
app.use("/api/elite", createEliteRouter({ getPanel: getElitePanel, getEvidence: getEliteEvidence, getDecision: getEliteDecision, getChatTools: getEliteChatTools, getRisk: getEliteRisk, getRetro: getEliteRetro, getBuyTiming: getEliteBuyTiming, getEliteZones, getUserFilters,
  verifyUser: async (authorization) => (await getMarketRuntime().auth.verifyAccess(authorization)).userId, knownSignals: new Set(SPEC_BY_ID.keys()) }));
if (process.env.NODE_ENV !== "test") {
  // Từ 17:00 giờ VN ngày giao dịch: dựng một lần cho phiên hôm nay (khởi động lại giữa chừng vẫn dựng bù); ngoài khung không đọc KV.
  // Mỗi phiên dựng một lần; lần dựng LỖI (VD kho dữ liệu tạm khoá) được thử lại sau 30 phút thay vì bỏ cả ngày.
  const ELITE_RETRY_MS = 30 * 60_000;
  const tried = { evidence: null, decision: null }; // { date, at, ok }
  const due = (k, date) => { const t = tried[k]; return !t || t.date !== date || (!t.ok && Date.now() - t.at >= ELITE_RETRY_MS); };
  const eliteTick = async () => {
    try {
      if (!panelDue(Date.now(), isTradingDay)) return;
      const latest = await getElitePanel().panel();
      if (latest?.date !== vnDate(new Date())) {
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
    } catch (e) {
      console.warn(`[elite] ${e.message}`);
    }
  };
  const eliteTagged = () => withDbTag("job:elite", eliteTick);
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
  console.log(`Mock mode: ${process.env.USE_MOCK_DATA !== "false" ? "BẬT (không cần API key)" : "TẮT (dùng API thật)"}`);
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
