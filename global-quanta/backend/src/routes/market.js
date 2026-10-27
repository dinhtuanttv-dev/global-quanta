// API dữ liệu thị trường chuẩn hoá: SSI là nguồn chính, nguồn cũ là dự phòng.
// Mọi response đều có `provenance` { source, asOf, isStale, fallbackReason }.

import { getUserWatchlists, saveUserWatchlists } from "../market/watchlists/userWatchlists.js";
import { getUserChartState, normalizeChartSymbol, saveUserChartState } from "../market/watchlists/userChartState.js";
import { getUserWorkspace, saveUserWorkspace } from "../market/watchlists/userWorkspace.js";
import { deleteUserElliottCounts, getUserElliottCounts, normalizeCountKey, saveUserElliottCounts } from "../market/watchlists/userElliottCounts.js";
import { listUserAlerts, markEventsRead, saveUserAlerts } from "../market/watchlists/userElliottAlerts.js";
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { getMarketRuntime } from "../market/runtime.js";
import { KV } from "../market/scanner/scannerJobs.js";
import { expectsLiveTicks, lastCompletedSessionDate, vnDate } from "../market/calendar.js";
import { buildSepaIntraday, sepaIntradayCandidates } from "../market/strategies/sepaIntraday.js";
import { getVolumeAnalysis } from "../market/scanner/volumeService.js";
import { getIntradayCycle, getIntradaySessions } from "../market/scanner/intradayService.js";
import { buildIntentFootprint } from "../market/scanner/ife.js";
import { loadTickFlows } from "../market/scanner/tickFlowService.js";
import { scoreCustomTickers, parseTickers } from "../market/scanner/customScan.js";
import { attachStructureRr } from "../market/scanner/scanEngine.js";
import { SCANNER_VALIDATION } from "../market/scanner/scannerValidation.js";
import { getNewsForTickers, parseTickers as parseNewsTickers } from "../market/news/newsService.js";
import { getResearchOverview, getResearchSymbol } from "../market/research/researchService.js";
import { createForensicSource, createPortfolioRisk } from "../market/research/deepAnalysis.js";
import { getHistory, saveSnapshot } from "../market/radar/radarHistory.js";
import { getRadarSignals, parseSignalTickers } from "../market/radar/radarSignals.js";
import { createTaIntraday } from "../market/adjusted/taIntraday.js";
import { createTaFlow } from "../market/adjusted/taFlow.js";
import { runTechnicalFilters, STRATEGY_ENGINE, STRATEGY_IDS, strategyKvKey } from "../market/strategies/technicalFilters.js";
import { createScreenerSeries } from "../market/strategies/screenerSeries.js";
import { patternDetail } from "../market/strategies/patternScan.js";
import { chartVision, screenerIndex } from "../market/chartVision/chartVision.js";
import { isIndexSymbol, canonicalSymbol, isValidSymbol } from "../market/normalizer.js";
import { SECTOR_RRG_ENGINE, SECTOR_RRG_HISTORY_KV, SECTOR_RRG_KV } from "../market/sectors/sectorRotation.js";
import { ICB_KV } from "../market/sectors/icbTaxonomy.js";
import { liveTracking, PERFORMANCE_KV } from "../market/strategies/signalTracking.js";
import { CONVERGENCE_EVIDENCE_KV, convergenceEvidenceFresh } from "../market/strategies/convergenceV2.js";
import { opsReport } from "../market/tradingMatrix/matrixOps.js";
import { buildEventReactionStudy, buildLeadershipStudy } from "../market/research/quantEdgeStudies.js";
import { buildEsaEarlySignal } from "../market/research/esaEarlySignal.js";
import { ValidationError } from "../market/errors.js";


const router = Router();

const splitList = (value) => (typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);

function sendError(res, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
  const body = { error: error?.message || "Market data request failed." };
  if (Array.isArray(error?.attempts)) body.attempts = error.attempts;
  if (error?.statusCode === 409 && error.current) body.current = error.current; // A2: bản đang lưu để máy khách gộp
  res.status(status).json(body);
}

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

const service = () => getMarketRuntime().service;

// ESA R0: anomaly research from Gateway minute bars. This endpoint does not
// emit a return forecast, calibrated probability, or trading recommendation.
router.get("/research/esa/:symbol", handle(async (req, res) => {
  const symbol = canonicalSymbol(req.params.symbol);
  if (!isValidSymbol(symbol) || isIndexSymbol(symbol)) throw new ValidationError("ESA cần mã cổ phiếu hợp lệ.");
  const rt = getMarketRuntime();
  const data = await service().cache.wrap(`esa:early:${symbol}`, 30_000, async () => {
    const [sessions, radar] = await Promise.all([
      getIntradaySessions(rt.service, symbol),
      rt.eventRadar.list({ ticker: symbol, limit: 10 }).catch(() => ({ events: [] })),
    ]);
    return buildEsaEarlySignal({ symbol, sessions, events: radar.events ?? [] });
  });
  res.set("Cache-Control", "private, max-age=15");
  res.json(data);
}));

function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveDailyEventSession(timestamp, sourceDate, bars) {
  const sessions = bars.filter((bar) => !bar.partial).map((bar) => bar.date).sort();
  if (!timestamp) {
    return sessions.includes(sourceDate)
      ? { date: sourceDate, reason: "date_only_legacy_mapping" }
      : { date: null, reason: "date_only_not_a_trading_session" };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (name) => Number(parts.find((item) => item.type === name)?.value ?? NaN);
  const minuteOfDay = part("hour") * 60 + part("minute");
  const beforeOpenSameDay = minuteOfDay < 9 * 60 && sessions.includes(sourceDate);
  // Daily bars cannot isolate an announcement published after the market opens.
  // Use the next full trading session to avoid attributing pre-publication moves.
  const eligible = sessions.find((date) => date > sourceDate || (date === sourceDate && beforeOpenSameDay));
  return {
    date: eligible ?? null,
    reason: eligible === sourceDate ? "before_open_same_session" : "next_full_session_daily_data",
  };
}

// Quant Edge H1: event reaction study. Consensus history is not available here, so this route
// deliberately reports observed reaction and drift, never a surprise score or probability.
router.get("/research/event-reaction", handle(async (req, res) => {
  const symbol = canonicalSymbol(req.query.symbol);
  const eventTimestamp = typeof req.query.eventTimestamp === "string" ? req.query.eventTimestamp : null;
  const timestampMs = eventTimestamp ? Date.parse(eventTimestamp) : null;
  if (eventTimestamp && (!Number.isFinite(timestampMs) || timestampMs > Date.now())) {
    throw new ValidationError("eventTimestamp phải là thời điểm hợp lệ, không ở tương lai.");
  }
  const eventDate = eventTimestamp ? vnDate(new Date(timestampMs)) : String(req.query.eventDate ?? "");
  const eventTimeSource = req.query.eventTimeSource === "gateway_first_seen" ? "gateway_first_seen" : eventTimestamp ? "publisher_timestamp" : "date_only_legacy";
  const eventLabel = String(req.query.eventLabel ?? "").trim().slice(0, 100);
  if (!isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
  const eventTime = Date.parse(`${eventDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(eventTime) || new Date(eventTime).toISOString().slice(0, 10) !== eventDate) {
    throw new ValidationError("eventDate phải là ngày hợp lệ dạng YYYY-MM-DD.");
  }
  if (eventDate > vnDate(new Date())) throw new ValidationError("Ngày sự kiện không được ở tương lai.");
  if (!eventLabel) throw new ValidationError("Nhập tên/loại sự kiện để lưu ngữ cảnh nghiên cứu.");

  const key = `qe:event-reaction:${symbol}:${eventTimestamp ?? eventDate}:${eventTimeSource}:${eventLabel}`;
  const result = await service().cache.wrap(key, 5 * 60_000, async () => {
    const rt = getMarketRuntime();
    const from = shiftDate(eventDate, -90), to = [shiftDate(eventDate, 60), vnDate(new Date())].sort()[0];
    const [stock, index] = await Promise.all([
      service().getOhlcv({ symbol, from, to, adjusted: true }),
      service().getOhlcv({ symbol: "VNINDEX", from, to }),
    ]);
    const mappedSession = resolveDailyEventSession(timestampMs, eventDate, stock.bars);
    if (!mappedSession.date) throw new ValidationError("Không tìm thấy phiên giao dịch đầy đủ sau thời điểm tin trong dữ liệu giá.");
    const [tick] = await Promise.all([
      loadTickFlows({ store: rt.store, hub: null, symbol, from: mappedSession.date, to: mappedSession.date }),
    ]);
    return buildEventReactionStudy({
      symbol, eventDate: mappedSession.date, eventLabel, stockBars: stock.bars, benchmarkBars: index.bars,
      eventTimestamp: eventTimestamp ? new Date(timestampMs).toISOString() : null,
      eventTimeSource, sourceEventDate: eventDate, timeMappingReason: mappedSession.reason,
      tickFlow: tick.history.get(mappedSession.date) ?? null,
      source: stock.provenance?.source ?? null, priceBasis: stock.priceBasis ?? null,
      fallbackReason: stock.provenance?.fallbackReason ?? null,
    });
  });
  res.set("Cache-Control", "private, max-age=60");
  res.json(result);
}));

// Quant Edge H2: mô tả độ bền leadership theo regime trên dữ liệu daily đã lưu.
// Tập mã và ngành hiện tại được dùng xuyên lịch sử; payload luôn công bố giới hạn này.
router.get("/research/leadership", handle(async (req, res) => {
  const lookback = Math.min(126, Math.max(20, Number(req.query.lookback) || 63));
  const horizon = Math.min(60, Math.max(5, Number(req.query.horizon) || 20));
  const key = `qe:leadership:${lookback}:${horizon}`;
  const result = await service().cache.wrap(key, 10 * 60_000, async () => {
    const rt = getMarketRuntime();
    const index = await service().getOhlcv({ symbol: "VNINDEX", range: "2y", limit: 600 });
    const bars = index.bars.filter((b) => !b.partial);
    if (bars.length <= horizon) return { status: "insufficient_data", reason: "Chưa đủ lịch sử VN-Index cho horizon yêu cầu." };
    const from = bars[Math.max(0, bars.length - lookback - horizon - 5)].date;
    const to = bars.at(-1).date;
    const universeResult = await service().getUniverse();
    const symbols = universeResult.tickers.map((x) => String(x.ticker).toUpperCase());
    const [marketRows, regimeRows] = await Promise.all([
      rt.store.getMarketDailyRange({ from, to, symbols }),
      rt.store.selectRows("market_regime_daily", { gte: { trading_date: from }, lte: { trading_date: to }, order: "trading_date.asc" }),
    ]);
    const universe = universeResult.tickers ?? [];
    const allowed = new Set(universe.map((x) => String(x.ticker).toUpperCase()));
    const filtered = marketRows.filter((x) => allowed.has(String(x.symbol).toUpperCase()));
    const analysis = buildLeadershipStudy({ marketRows: filtered, universe, indexBars: bars, regimeRows, lookback, horizon });
    return { ...analysis, meta: { ...analysis.meta, universeSource: universeResult.provenance?.source ?? null, priceSource: index.provenance?.source ?? null } };
  });
  res.set("Cache-Control", "private, max-age=300");
  res.json(result);
}));

router.get("/status", handle(async (req, res) => {
  const rt = getMarketRuntime();
  res.set("Cache-Control", "no-store");
  res.json({ ...(await rt.service.status()), ingestor: { enabled: rt.started, jobs: rt.scheduler.status() }, tickRecorder: rt.tickRecorder.status(), eventRadar: rt.eventRadar.status() });
}));

router.get("/quotes", handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await service().getQuotes(splitList(req.query.symbols)));
}));

// Tương thích tham số của Project A /api/ohlcv (ticker, range, limit).
router.get("/ohlcv", handle(async (req, res) => {
  const q = req.query;
  res.set("Cache-Control", "private, max-age=30");
  res.json(await service().getOhlcv({
    symbol: q.symbol ?? q.ticker,
    resolution: q.resolution,
    from: q.from,
    to: q.to,
    range: q.range,
    limit: q.limit,
    adjusted: q.adjusted,
  }));
}));

router.get("/securities", handle(async (req, res) => {
  res.set("Cache-Control", "private, max-age=300");
  res.json(await service().getSecurities({ exchange: req.query.exchange, index: req.query.index, q: req.query.q }));
}));

// Tương thích Project A /api/universe.
router.get("/universe", handle(async (req, res) => {
  res.set("Cache-Control", "private, max-age=600");
  res.json(await service().getUniverse());
}));

router.get("/indices/:code", handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await service().getIndexSnapshot(req.params.code));
}));

router.get("/indices/:code/components", handle(async (req, res) => {
  res.set("Cache-Control", "private, max-age=600");
  res.json(await service().getIndexComponents(req.params.code));
}));

// Tương thích Project A /api/market-data/breadth ({ advancers, decliners }).
// TOPBAR T1 — một snapshot cho thanh ngang; mỗi khối có DataMeta (nguồn, trạng thái, asOf, tuổi, lý do).
router.get("/topbar", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const data = await rt.service.cache.wrap("topbar:snapshot", 15_000, () => rt.topbar.snapshot());
  res.set("Cache-Control", "public, max-age=10");
  res.json(data);
}));

router.get("/breadth", handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await service().getBreadth(typeof req.query.index === "string" ? req.query.index : "VNINDEX"));
}));

// Siêu Quét AI (engine trên Gateway, nguồn SSI). Cùng định dạng với Project A
// /api/sieu-quet-ai/scanner: { generatedAt, indexState, items, totalCount } + dataAsOf/meta.
// v2: R/R gắn lúc đọc từ bản tóm tắt cấu trúc (job 15:47, Volume) + nhãn bằng chứng của kiểm định đặt trước (SQ-prereg.md).
async function structureSummaryOrNull(rt) {
  try { return (await rt.structure?.summary?.()) ?? null; } catch { return null; }
}
router.get("/scanner", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const doc = (await rt.store.getKv(KV.latest))?.value;
  if (!doc) {
    res.status(503).json({ error: "Siêu Quét trên Gateway chưa có kết quả (chưa chạy scanUniverse)." });
    return;
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json({ ...doc, items: attachStructureRr(doc.items ?? [], await structureSummaryOrNull(rt)), validation: SCANNER_VALIDATION });
}));
// Bộ lọc kỹ thuật độc lập của tab TA VN-Index (CAMSLIM Cup & Handle, Base Breakout) — xem strategies/technicalFilters.js.
// SEPA SP6: cảnh báo phá vỡ trong phiên cho mã SEPA đang chờ pivot (KV strategies:sepa + quotes trong phiên).
const sepaFirstSeen = new Map();
router.get("/strategies/sepa/intraday", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const data = await rt.service.cache.wrap("sepa-intraday", 30_000, async () => {
    const doc = (await rt.store.getKv(strategyKvKey("sepa")))?.value ?? null;
    if (!doc) return { error: "Chưa có kết quả quét SEPA." };
    const symbols = sepaIntradayCandidates(doc).map((r) => r.ticker);
    const quotes = symbols.length ? await rt.service.getQuotes(symbols) : {};
    const now = new Date();
    for (const k of sepaFirstSeen.keys()) if (!k.startsWith(vnDate(now))) sepaFirstSeen.delete(k);
    return buildSepaIntraday({ doc, quotes: quotes?.quotes ?? quotes, now, firstSeen: sepaFirstSeen });
  });
  if (data.error) { res.status(503).json(data); return; }
  res.set("Cache-Control", "private, max-age=20");
  res.json(data);
}));

// Pattern Scanner v2 (Pring) — bảng phụ: mô hình đầy đủ (hình học, vòng đời, checklist) khung ngày + tuần và nến để vẽ.
// Cùng chuỗi giá điều chỉnh với job quét (chỉ đọc kho, không gọi SSI); bộ nhớ đệm 10 phút / mã.
router.get("/strategies/patterns/:symbol", handle(async (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) { res.status(400).json({ error: "Mã không hợp lệ." }); return; }
  const rt = getMarketRuntime();
  const data = await rt.service.cache.wrap(`patterns-detail:${symbol}`, 10 * 60_000, async () => {
    const loadSeries = await createScreenerSeries({ store: rt.store, corporateActions: rt.corporateActions }).prepare([symbol]);
    return patternDetail(symbol, await loadSeries(symbol));
  });
  if (!data) { res.status(404).json({ error: `Chưa có chuỗi giá cho ${symbol}.` }); return; }
  res.set("Cache-Control", "private, max-age=120");
  res.json(data);
}));

// AI Chart Vision v2 — phân tích đa khung D/W/M từ chuỗi giá điều chỉnh (chỉ đọc kho, không gọi SSI, không gọi AI) + các bộ lọc
// đang chứa mã (đọc KV strategies:<id>, chỉ mục dùng chung 5 phút). Bộ nhớ đệm 10 phút / mã.
router.get("/chart-vision/:symbol", handle(async (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) { res.status(400).json({ error: "Mã không hợp lệ." }); return; }
  const rt = getMarketRuntime();
  const index = await rt.service.cache.wrap("chart-vision:screeners", 5 * 60_000, async () => {
    const docs = {};
    for (const id of STRATEGY_IDS) docs[id] = (await rt.store.getKv(strategyKvKey(id)))?.value ?? null;
    return screenerIndex(docs);
  });
  const data = await rt.service.cache.wrap(`chart-vision:${symbol}`, 10 * 60_000, async () => {
    const isIndex = isIndexSymbol(symbol);
    const loadSeries = await createScreenerSeries({ store: rt.store, corporateActions: rt.corporateActions }).prepare(isIndex ? [] : [symbol]);
    const raw = isIndex ? { bars: await loadSeries.index(symbol), priceBasis: "INDEX_POINTS" } : await loadSeries(symbol);
    const bars = (raw?.bars ?? []).filter((b) => !b.partial && b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0)
      .map((b) => ({ date: b.date, open: b.open, high: Math.max(b.high, b.open, b.close), low: Math.min(b.low, b.open, b.close), close: b.close, volume: b.volume ?? 0 }));
    if (bars.length < 60) return null;
    return { ...chartVision(symbol, bars, { screeners: index.get(symbol) ?? [], isIndex }), priceBasis: raw.priceBasis ?? "UNKNOWN", warnings: raw.warnings ?? [] };
  });
  if (!data) { res.status(404).json({ error: `Chưa đủ chuỗi giá cho ${symbol} (cần ≥ 60 phiên).` }); return; }
  res.set("Cache-Control", "private, max-age=120");
  res.json(data);
}));

// Lọc ngành (L1): xoay vòng ngành ICB (VNDirect cấp 2/3) — RRG tuần JdK so VN-Index, chỉ số ngành tổng hợp. Job buildSectorRotation
// 15:50 ghi KV; chưa có -> chạy một lần (cache 10 phút). Không gọi SSI.
async function sectorDoc(rt, key) {
  let doc = (await rt.store.getKv(key))?.value ?? null;
  // Migrate only the summary snapshot; the historical detail KV has a different schema.
  const needs4d = key === SECTOR_RRG_KV && doc?.engine === SECTOR_RRG_ENGINE
    && (doc.sectors ?? []).some((sector) => !sector.rrg4d?.version);
  if (!doc || needs4d) {
    await rt.service.cache.wrap("sectors:build", 10 * 60_000, () => rt.jobs.buildSectorRotation());
    doc = (await rt.store.getKv(key))?.value ?? null;
  }
  return doc;
}
router.get("/sectors/rrg", handle(async (req, res) => {
  const doc = await sectorDoc(getMarketRuntime(), SECTOR_RRG_KV);
  if (!doc) { res.status(503).json({ error: "Chưa dựng được xoay vòng ngành." }); return; }
  const level = Number(req.query.level) || null;
  res.set("Cache-Control", "public, max-age=120");
  res.json(level ? { ...doc, sectors: doc.sectors.filter((s) => s.level === level) } : doc);
}));
router.get("/sectors/taxonomy", handle(async (req, res) => {
  const doc = (await getMarketRuntime().store.getKv(ICB_KV))?.value ?? null;
  if (!doc) { res.status(503).json({ error: "Chưa có phân ngành ICB." }); return; }
  res.set("Cache-Control", "public, max-age=3600");
  res.json(doc);
}));
// Top 20 v2 (T2/T5) — mô hình M1 đa yếu tố (18 yếu tố, phân rã đóng góp), nhãn T3 và sổ theo dõi thực tế.
router.get("/alpha/top20", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().alpha.top20());
}));

// Radar Top 20 (T0) — thành phần đầu vào (RS 3 tháng căn ngày với VN-Index, GTGD 20/250, PVT, A/D, thanh khoản) cho cả universe.
router.get("/top20/inputs", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().top20.inputs());
}));

// Trading Matrix (M1) — trạng thái thị trường đa nguồn: regime, độ rộng (cuối phiên + trong phiên, có mẫu số), dòng tiền
// (tách nguồn), biến động, pha phiên, sức khoẻ từng nguồn. ?scope=VNINDEX|VN30|UNIVERSE
router.get("/trading-matrix/overview", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const scope = String(req.query.scope ?? "VNINDEX").toUpperCase();
  const live = expectsLiveTicks();
  const data = await rt.service.cache.wrap(`matrix:overview:${scope}`, live ? 20_000 : 5 * 60_000, () => rt.matrix.overview({ scope }));
  res.set("Cache-Control", live ? "private, max-age=15" : "private, max-age=120");
  res.json(data);
}));
// Trading Matrix (M2) — heatmap ngành (RS so VN-Index × độ rộng ngành × GTGD) + mã biến động đáng chú ý (không có trọng số chỉ số).
router.get("/trading-matrix/sectors", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const scope = String(req.query.scope ?? "VNINDEX").toUpperCase();
  const data = await rt.service.cache.wrap(`matrix:sectors:${scope}`, 5 * 60_000, () => rt.matrix.sectors({ scope }));
  res.set("Cache-Control", "private, max-age=120");
  res.json(data);
}));
// Trading Matrix — Index Impact (spec §6.8): điểm đóng góp từng mã vào VN-Index một phiên đã chốt, kèm kiểm tra Σ đóng góp vs thật.
router.get("/trading-matrix/index-impact", handle(async (req, res) => {
  if (String(req.query.live ?? "") === "1") {
    res.set("Cache-Control", "no-store");
    res.json(await getMarketRuntime().matrix.impactLive());
    return;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? "")) ? String(req.query.date) : null;
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().matrix.impact(date));
}));
router.get("/trading-matrix/movers", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const scope = String(req.query.scope ?? "VN30").toUpperCase();
  const data = await rt.service.cache.wrap(`matrix:movers:${scope}`, 5 * 60_000, () => rt.matrix.movers({ scope }));
  res.set("Cache-Control", "private, max-age=120");
  res.json(data);
}));
// Trading Matrix (M3) — sổ tín hiệu kịch bản (ghi đúng thời điểm), kết quả thực tế T+1/3/5/10 trên VN-Index, kiểm định đặt trước.
router.get("/trading-matrix/signals", handle(async (req, res) => {
  const scope = String(req.query.scope ?? "VNINDEX").toUpperCase();
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().matrix.signals({ scope }));
}));
// Trading Matrix (M6) — báo cáo vận hành: dữ liệu thiếu, sức khoẻ nguồn, khối lượng cảnh báo, độ trôi mô hình, kho cục bộ, nhật ký quy tắc.
router.get("/trading-matrix/ops", handle(async (req, res) => {
  const rt = getMarketRuntime();
  res.set("Cache-Control", "no-store");
  res.json(await opsReport({ store: rt.store, matrix: rt.matrix }));
}));
// M5 rollback mô hình / M6 phát lại (admin, Bearer MARKET_ADMIN_TOKEN).
router.post("/trading-matrix/admin/model", handle(async (req, res) => {
  if (!isAdmin(req)) { res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." }); return; }
  res.json(await getMarketRuntime().matrix.setActiveModel(String(req.body?.id ?? "")));
}));
router.post("/trading-matrix/admin/replay", handle(async (req, res) => {
  if (!isAdmin(req)) { res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." }); return; }
  const { scope = "VNINDEX", from, to } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) { res.status(400).json({ error: "from / to dạng YYYY-MM-DD." }); return; }
  res.json(await getMarketRuntime().matrix.replay({ scope: String(scope).toUpperCase(), from, to }));
}));
router.get("/trading-matrix/history", handle(async (req, res) => {
  const scope = String(req.query.scope ?? "VNINDEX").toUpperCase();
  res.set("Cache-Control", "public, max-age=300");
  res.json({ scope, rows: await getMarketRuntime().matrix.history({ scope, limit: Math.min(Number(req.query.limit) || 60, 250) }) });
}));

// Cấu trúc thị trường đa khung (T4) — bản tóm tắt toàn universe (job 15:47) để làm giàu bảng bộ lọc.
router.get("/structure-summary", handle(async (req, res) => {
  const doc = await getMarketRuntime().structure.summary();
  if (!doc) { res.status(404).json({ error: "Chưa có bản tóm tắt cấu trúc (job scanStructure chạy 15:47 ngày giao dịch)." }); return; }
  res.set("Cache-Control", "public, max-age=300");
  res.json(doc);
}));

// Cấu trúc đa khung (T6) — sổ dự báo thực tế: độ phủ nón 5/10/20 phiên, α của ACI, lợi suất 10 phiên theo kết luận.
router.get("/structure-ledger", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().structure.ledgerStats());
}));

// Cấu trúc thị trường đa khung (T4) — Tuần / Ngày / 1 giờ cho một mã. ?h1=0 để bỏ khung 1 giờ.
router.get("/structure/:symbol", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const symbol = String(req.params.symbol || "").toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(symbol)) { res.status(400).json({ error: "Mã không hợp lệ." }); return; }
  const h1 = String(req.query.h1 ?? "1") !== "0";
  const live = expectsLiveTicks();
  const data = await rt.service.cache.wrap(`structure:${symbol}:${h1 ? 1 : 0}`, live ? 60_000 : 10 * 60_000, () => rt.structure.analyze(symbol, { h1 }));
  res.set("Cache-Control", live ? "private, max-age=30" : "private, max-age=300");
  res.json(data);
}));

// Cycle Fingerprint v2 (CF4) — sổ theo dõi thực tế (bản chụp dự báo 20 phiên hằng ngày, chấm khi đủ 21 phiên).
router.get("/cycles-ledger", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().cycles.ledger());
}));

// Cycle Fingerprint v2 (CF2) — 30 giai đoạn tương tự toàn universe cho cửa sổ 30 phiên gần nhất + dự báo vượt VN-Index (EXPERIMENTAL theo CF3).
router.get("/cycles/:symbol", handle(async (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(symbol)) { res.status(400).json({ error: "Mã không hợp lệ." }); return; }
  const doc = await getMarketRuntime().cycles.query(symbol);
  if (!doc) { res.status(404).json({ error: `${symbol} chưa có trong thư viện chu kỳ (ngoài universe, thiếu lịch sử điều chỉnh cộng dồn hoặc < 1 năm dữ liệu).` }); return; }
  res.set("Cache-Control", "public, max-age=300");
  res.json(doc);
}));

router.get("/sectors/:code/history", handle(async (req, res) => {
  const code = String(req.params.code || "").padStart(4, "0");
  if (!/^\d{4}$/.test(code)) { res.status(400).json({ error: "Mã ngành không hợp lệ." }); return; }
  const doc = await sectorDoc(getMarketRuntime(), SECTOR_RRG_HISTORY_KV);
  const s = doc?.sectors?.[code];
  if (!s) { res.status(404).json({ error: `Không có ngành ${code}.` }); return; }
  res.set("Cache-Control", "public, max-age=300");
  res.json({ engine: doc.engine, dataAsOf: doc.dataAsOf, closedThrough: doc.closedThrough, ...s });
}));

router.get("/strategies/:strategy", handle(async (req, res) => {
  const { strategy } = req.params;
  if (!STRATEGY_IDS.includes(strategy)) {
    res.status(404).json({ error: `Unknown technical strategy: ${strategy}.` });
    return;
  }
  const rt = getMarketRuntime();
  // Kết quả quét sau ATC (job scanStrategies, KV strategies:<id>). Chưa có -> quét ngay một lần và lưu lại.
  const stored = (await rt.store.getKv(strategyKvKey(strategy)))?.value;
  // Bản lưu cũ hơn phiên đã đóng gần nhất (job lỗi/chưa chạy) và đã quá 30 phút -> quét lại.
  const outdated = stored && (stored.engine !== STRATEGY_ENGINE[strategy] ||
    (stored.dataAsOf < lastCompletedSessionDate(new Date()) && Date.now() - Date.parse(stored.generatedAt) > 30 * 60_000));
  let data = stored;
  if (!stored || outdated) {
    const docs = await rt.service.cache.wrap("technical-filters:all", 10 * 60_000, async () => {
      const all = await runTechnicalFilters(rt.service, { seriesSource: createScreenerSeries({ store: rt.store, corporateActions: rt.corporateActions }) });
      for (const id of STRATEGY_IDS) await rt.store.setKv(strategyKvKey(id), all[id]);
      return all;
    });
    data = docs[strategy];
  }
  // Hợp lưu v2: bằng chứng do job (worker) ghi KV riêng, có thể xong SAU lần quét -> luôn lấy bản mới nhất còn hiệu lực.
  if (strategy === "convergence") {
    const ev = (await rt.store.getKv(CONVERGENCE_EVIDENCE_KV))?.value;
    if (convergenceEvidenceFresh(ev)) data = { ...data, evidence: { ...ev.evidence, computedAt: ev.computedAt } };
  }
  // S6: hiệu suất THỰC TẾ (ngoài mẫu, từ ngày triển khai) do researchEvaluate chấm hằng ngày.
  const perf = (await rt.store.getKv(PERFORMANCE_KV))?.value;
  data = { ...data, liveTracking: liveTracking(perf, strategy) };
  res.set("Cache-Control", "private, max-age=60");
  res.json(data);
}));

// Dòng phụ Bảng Siêu Quét: phân tích chuyên sâu khối lượng của một mã.
router.get("/scanner/:symbol/volume", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const data = await rt.service.cache.wrap(`volume-analysis:${req.params.symbol.toUpperCase()}`, 60_000,
    () => getVolumeAnalysis(rt.service, req.params.symbol));
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
}));

// Dòng phụ: chu kỳ & xác suất khối lượng trong phiên (17 khung, 120 phiên lịch sử).
router.get("/scanner/:symbol/intraday-cycle", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const data = await rt.service.cache.wrap(`intraday-cycle:${req.params.symbol.toUpperCase()}`, 30_000,
    () => getIntradayCycle(rt.service, req.params.symbol));
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
}));

// Dòng phụ: IFE — bản đồ ý đồ dòng tiền (dòng lệnh có dấu, hấp thụ, chữ ký thực thi, stealth, HMM).
router.get("/scanner/:symbol/intent", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const symbol = req.params.symbol.toUpperCase();
  const data = await rt.service.cache.wrap(`ife:${symbol}`, 30_000, async () => {
    const s = await getIntradaySessions(rt.service, symbol);
    const usable = s.trainSessions.filter((x) => x.bars?.length);
    const ticks = await loadTickFlows({
      store: rt.store, hub: rt.hub, symbol,
      from: usable[0]?.date ?? s.viewDate, to: s.viewDate, today: s.viewDate,
    });
    const footprint = buildIntentFootprint({ history: s.trainSessions, today: s.todaySession, tickFlow: ticks.today, tickHistory: ticks.history });
    const validation = (await rt.store.getKv(KV.ifeValidation))?.value ?? null;
    return { symbol, live: s.sessionLive, viewDate: s.viewDate, ...footprint, validation,
      disclaimer: "IFE là suy luận xác suất từ dấu vết giao dịch (không có danh tính tài khoản); không phải khuyến nghị đầu tư." };
  });
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
}));

// Tầng nghiên cứu: hiệu suất tín hiệu (vòng phản hồi T+3/5/10) + mô hình trọng số thích ứng.
// Tin tức thông minh cho danh mục: công bố thông tin + tin doanh nghiệp + báo chí, gắn mã, khử trùng,
// phân loại sự kiện, chấm cảm xúc, phản ứng giá so VN-Index. GET /news?tickers=FPT,HPG&days=14 (≤ 60 mã).
router.get("/news", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const tickers = parseNewsTickers(req.query.tickers);
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 14));
  const key = `news:${days}:${[...tickers].sort().join(",")}`;
  const data = await rt.service.cache.wrap(key, 3 * 60_000, () => getNewsForTickers(rt.service, tickers, { days }));
  res.set("Cache-Control", "private, max-age=120");
  res.json(data);
}));

// Event Radar: event-ledger snapshot, source health and explicit coverage limits.
router.get("/event-radar", handle(async (req, res) => {
  const ticker = req.query.ticker ? canonicalSymbol(req.query.ticker) : null;
  if (ticker && !isValidSymbol(ticker)) throw new ValidationError("Mã lọc sự kiện không hợp lệ.");
  const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
  const status = typeof req.query.status === "string" ? req.query.status.slice(0, 60) : null;
  const category = typeof req.query.category === "string" ? req.query.category.slice(0, 60) : null;
  const data = await getMarketRuntime().eventRadar.list({ ticker, status, category, limit });
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
}));

router.post("/event-radar/refresh", handle(async (req, res) => {
  await verifyUser(req.headers.authorization);
  const result = await getMarketRuntime().eventRadar.refreshNow();
  res.set("Cache-Control", "no-store");
  res.json(result);
}));

router.get("/event-radar/:eventId", handle(async (req, res) => {
  if (!/^evt_[a-f0-9]{24}$/.test(req.params.eventId)) throw new ValidationError("Mã sự kiện không hợp lệ.");
  const limit = Math.min(500, Math.max(1, Number(req.query.revisionLimit) || 200));
  const before = typeof req.query.before === "string" ? req.query.before.slice(0, 180) : null;
  const data = await getMarketRuntime().eventRadar.getEvent(req.params.eventId, { limit, before });
  if (!data) { res.status(404).json({ error: "Không tìm thấy sự kiện." }); return; }
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
}));

router.get("/research/overview", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const data = await rt.service.cache.wrap("research:overview", 60_000, () => getResearchOverview(rt.store));
  res.set("Cache-Control", "private, max-age=60");
  res.json(data);
}));

router.get("/research/:symbol", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const symbol = req.params.symbol.toUpperCase();
  const data = await rt.service.cache.wrap(`research:${symbol}`, 60_000, () => getResearchSymbol(rt.store, symbol));
  res.set("Cache-Control", "private, max-age=60");
  res.json(data);
}));

// X5 — ngăn kéo Phân tích sâu (tab Chất xúc tác): BCTC năm thật cho forensics + lợi suất thật của danh mục ★.
let forensicSource = null;
let portfolioRisk = null;
router.get("/fundamentals/:symbol/forensic", handle(async (req, res) => {
  forensicSource ??= createForensicSource();
  res.set("Cache-Control", "public, max-age=3600");
  res.json(await forensicSource(req.params.symbol));
}));

router.get("/portfolio-risk", handle(async (req, res) => {
  portfolioRisk ??= createPortfolioRisk({ taSeries: getMarketRuntime().taSeries });
  res.set("Cache-Control", "private, max-age=600");
  res.json(await portfolioRisk(req.query.symbols));
}));

// Lịch sử ELITE COMMAND RADAR theo người dùng đăng nhập × ★ danh mục.
// GET /radar/history?list=<tên danh mục>&days=30 · PUT /radar/snapshot { list, items } (ghi đè ảnh của ngày giao dịch hiện tại).
// Đăng nhập trên Railway (23/10/2026): token JWT Ed25519 của Gateway, kiểm tại chỗ (không gọi Supabase Auth).
const verifyUser = async (authorization) => (await getMarketRuntime().auth.verifyAccess(authorization)).userId;

router.get("/radar/history", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await getHistory(getMarketRuntime().store, userId, { list: req.query.list, days: req.query.days }));
}));

// ★ Danh mục theo tài khoản (đồng bộ mọi máy): GET /watchlists · PUT /watchlists { state }. Cần đăng nhập (JWT Supabase).
router.get("/watchlists", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await getUserWatchlists(getMarketRuntime().store, userId));
}));

router.put("/watchlists", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await saveUserWatchlists(getMarketRuntime().store, userId, req.body ?? {}));
}));

// Hình vẽ tay TA VN-Index theo tài khoản + mã: GET /chart-state?symbol=FPT · PUT /chart-state?symbol=FPT { primitives }.
router.get("/chart-state", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await getUserChartState(getMarketRuntime().store, userId, normalizeChartSymbol(req.query.symbol)));
}));

router.put("/chart-state", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await saveUserChartState(getMarketRuntime().store, userId, normalizeChartSymbol(req.query.symbol), req.body ?? {}));
}));

// Super Chart SC1: bố cục tab TA VN-Index theo tài khoản (preset, lớp, bảng chi tiết, dock) — GET / PUT /workspace { workspace }.
router.get("/workspace", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await getUserWorkspace(getMarketRuntime().store, userId));
}));

router.put("/workspace", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await saveUserWorkspace(getMarketRuntime().store, userId, req.body ?? {}));
}));

// DW8: cách đếm Elliott chỉnh tay theo tài khoản + mã + khung (lịch sử phiên bản):
//   GET /elliott/counts?symbol=FPT&tf=D · PUT (body { activeId, versions }) · DELETE (xoá mọi phiên bản của mã + khung).
router.get("/elliott/counts", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await getUserElliottCounts(getMarketRuntime().store, userId, normalizeCountKey(req.query.symbol, req.query.tf)));
}));
router.put("/elliott/counts", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await saveUserElliottCounts(getMarketRuntime().store, userId, normalizeCountKey(req.query.symbol, req.query.tf), req.body ?? {}));
}));
router.delete("/elliott/counts", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await deleteUserElliottCounts(getMarketRuntime().store, userId, normalizeCountKey(req.query.symbol, req.query.tf)));
}));

// EP2: sổ theo dõi kịch bản Elliott (công khai, chỉ đọc): GET /elliott/ledger/summary · GET /elliott/ledger?symbol=FPT
router.get("/elliott/ledger/summary", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(await getMarketRuntime().elliottLedger.summary());
}));
router.get("/elliott/ledger/latest", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ bySymbol: await getMarketRuntime().elliottLedger.latest() });
}));
router.get("/elliott/ledger", handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  const symbol = normalizeChartSymbol(req.query.symbol);
  res.json({ symbol, rows: await getMarketRuntime().elliottLedger.forSymbol(symbol) });
}));

// DW10: cảnh báo Elliott khi giá chạm mốc (người dùng tự bật): GET /elliott/alerts (cảnh báo + 50 lần báo gần nhất) ·
//   PUT /elliott/alerts { alerts } (thay cả danh sách) · POST /elliott/alerts/read { ids? } (đánh dấu đã đọc).
//   Telegram chỉ cho tài khoản quản trị (bot gửi về chat vận hành của chủ hệ thống).
router.get("/elliott/alerts", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await listUserAlerts(getMarketRuntime().store, userId));
}));
router.put("/elliott/alerts", handle(async (req, res) => {
  const who = await getMarketRuntime().auth.verifyAccess(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await saveUserAlerts(getMarketRuntime().store, who.userId, req.body ?? {}, { allowTelegram: !!who.admin }));
}));
router.post("/elliott/alerts/read", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => String(x).slice(0, 80)) : null;
  res.json(await markEventsRead(getMarketRuntime().store, userId, ids));
}));

router.put("/radar/snapshot", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await saveSnapshot(getMarketRuntime().store, userId, req.body ?? {}));
}));

// Lớp tín hiệu dòng tiền trên Radar: Stealth 20 / IFE / mô hình thích ứng (chỉ khi đạt kiểm định) + bằng chứng thống kê.
// GET /radar/signals?tickers=FPT,HPG (≤ 80 mã)
router.get("/radar/signals", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const tickers = parseSignalTickers(req.query.tickers);
  const data = await rt.service.cache.wrap(`radar-signals:${[...tickers].sort().join(",")}`, 5 * 60_000, () => getRadarSignals(rt.store, tickers));
  res.set("Cache-Control", "private, max-age=120");
  res.json(data);
}));

// Lịch sử giá DANH NGHĨA dài hạn từ SSI (kho bền vững) + gợi ý sự kiện quyền từ giá tham chiếu — nguồn giá chính cho
// Timing Engine cổ tức ở Project A (Project A tự điều chỉnh bằng sự kiện quyền VCI). GET /ohlcv/nominal-history?ticker=VNM&years=5
router.get("/ohlcv/nominal-history", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const r = await rt.nominalHistory.get(req.query.ticker ?? req.query.symbol, { years: req.query.years });
  res.set("Cache-Control", "private, max-age=600");
  res.json({
    symbol: r.symbol, priceType: "NOMINAL", isIndex: Boolean(r.index), referenceBase: r.base,
    bars: r.bars, referenceAdjustments: r.events, referenceAnomalies: r.anomalies,
    provenance: { source: r.source, refresh: r.refresh, asOf: r.bars.at(-1)?.date ?? null, from: r.bars[0]?.date ?? null, count: r.bars.length,
      note: "Giá khớp danh nghĩa SSI. referenceAdjustments suy từ RefPrice — đáng tin tới ~2024 (từ 2025 SSI không còn điều chỉnh RefPrice vào ngày GDKHQ)." },
  });
}));

// Chuỗi giá cho TA VN-Index: điều chỉnh CỘNG DỒN theo sự kiện quyền (cổ tức tiền/cổ phiếu, thưởng) — xem adjusted/taSeries.js.
// GET /ta-series?ticker=FPT&range=5y&limit=750 · chỉ số trả điểm chỉ số. Luôn có priceBasis + warnings.
const getTaSeries = () => getMarketRuntime().taSeries;

router.get("/ta-series", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const series = getTaSeries();
  const q = req.query;
  const key = `ta-series:${String(q.ticker ?? q.symbol ?? "").toUpperCase()}:${q.range ?? "5y"}:${q.limit ?? 750}`;
  const data = await rt.service.cache.wrap(key, 60_000, () => series.get({ symbol: q.ticker ?? q.symbol, range: q.range, limit: q.limit }));
  res.set("Cache-Control", "private, max-age=30");
  res.json(data);
}));

// Nến phút N phiên gần nhất cho khung 1m/5m/15m/1H + Session Volume Profile — cùng cơ sở giá với /ta-series.
// GET /ta-intraday?ticker=FPT&days=20 (tối đa 30). Nến khớp định kỳ (ATO/ATC) có cờ `auction`.
// Order Flow: dòng lệnh theo phút (Lee–Ready, ATO/ATC tách riêng, lệnh lớn ≥ p99) + khối ngoại theo ngày.
// GET /ta-flow?ticker=FPT&days=20
let taFlow = null;
router.get("/ta-flow", handle(async (req, res) => {
  const rt = getMarketRuntime();
  taFlow ??= createTaFlow({ store: rt.store, hub: rt.hub });
  const q = req.query;
  const key = `ta-flow:${String(q.ticker ?? q.symbol ?? "").toUpperCase()}:${q.days ?? 20}`;
  const data = await rt.service.cache.wrap(key, 30_000, () => taFlow.get({ symbol: q.ticker ?? q.symbol, days: q.days }));
  res.set("Cache-Control", "private, max-age=20");
  res.json(data);
}));

let taIntraday = null;
router.get("/ta-intraday", handle(async (req, res) => {
  const rt = getMarketRuntime();
  taIntraday ??= createTaIntraday({ service: rt.service, taSeries: getTaSeries() });
  const q = req.query;
  const key = `ta-intraday:${String(q.ticker ?? q.symbol ?? "").toUpperCase()}:${q.days ?? 20}`;
  const data = await rt.service.cache.wrap(key, 30_000, () => taIntraday.get({ symbol: q.ticker ?? q.symbol, days: q.days }));
  res.set("Cache-Control", "private, max-age=20");
  res.json(data);
}));

// Danh mục tự chọn / rổ chỉ số: chấm điểm theo cùng công thức + bối cảnh của lần quét gần nhất.
// GET /scanner/custom?tickers=FPT,HPG,... (tối đa 60 mã)
router.get("/scanner/custom", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const tickers = parseTickers(req.query.tickers);
  const latest = (await rt.store.getKv(KV.latest))?.value;
  const key = `scanner-custom:${latest?.generatedAt ?? "none"}:${[...tickers].sort().join(",")}`;
  const data = await rt.service.cache.wrap(key, 10 * 60_000, async () => {
    const r = await scoreCustomTickers(rt.service, tickers, { corporateActions: rt.corporateActions });
    return { ...r, items: attachStructureRr(r.items, await structureSummaryOrNull(rt)) };
  });
  res.set("Cache-Control", "private, max-age=60");
  res.json(data);
}));

router.get("/scanner/universe", handle(async (req, res) => {
  const doc = (await getMarketRuntime().store.getKv(KV.universe))?.value;
  if (!doc) {
    res.status(503).json({ error: "Chưa có universe (chưa chạy buildUniverse)." });
    return;
  }
  res.set("Cache-Control", "public, max-age=600");
  res.json(doc);
}));

// Lịch nghỉ giao dịch tự tính (không cần nạp tay): GET /trading-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (tối đa 6 năm).
// Mỗi ngày nghỉ ghi nguồn: OBSERVED (phiên thật), OFFICIAL (MARKET_HOLIDAYS), RULE (âm lịch + Bộ luật Lao động).
router.get("/trading-calendar", handle(async (req, res) => {
  const cal = getMarketRuntime().tradingCalendar;
  const y = new Date().getUTCFullYear();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(String(req.query.from ?? "")) ? String(req.query.from) : `${y - 1}-01-01`;
  const to = re.test(String(req.query.to ?? "")) ? String(req.query.to) : `${y + 2}-12-31`;
  if (to < from || Date.parse(to) - Date.parse(from) > 6 * 366 * 86_400_000) {
    res.status(400).json({ error: "Khoảng from..to không hợp lệ (tối đa 6 năm)." });
    return;
  }
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ from, to, holidays: cal.list(from, to), status: cal.status() });
}));

// Trạng thái quét liên tục tab Cổ tức (không chứa secret) — giao diện hiển thị "đang quét · vòng · cập nhật lúc".
router.get("/cotuc-scan/status", handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(getMarketRuntime().cotucScanner.status());
}));

router.get("/price-limits", handle(async (req, res) => {
  res.set("Cache-Control", "private, max-age=600");
  res.json(await service().getPriceLimits(typeof req.query.date === "string" ? req.query.date : undefined));
}));

/**
 * SSE: một kết nối cho mọi mã của trình duyệt (backend tự chia shard upstream).
 * Sự kiện: `quote` (Quote + provenance), `index` (IndexSnapshot + provenance),
 * `status` ({ transport, session, live[], stale[], fallback[], closed[], pending[] }).
 */
router.get("/stream", (req, res) => {
  const hub = getMarketRuntime().hub;
  let unsubscribe;
  try {
    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    unsubscribe = hub.subscribe({ symbols: splitList(req.query.symbols), indices: splitList(req.query.indices), send });
    res.flushHeaders();
  } catch (error) {
    sendError(res, error);
    return;
  }
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe?.();
  });
});

function isAdmin(req) {
  const expected = process.env.MARKET_ADMIN_TOKEN || "";
  const header = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Chạy job thủ công: POST /api/market/admin/jobs/syncEod (Bearer MARKET_ADMIN_TOKEN). */
router.post("/admin/jobs/:name", handle(async (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    return;
  }
  const result = await getMarketRuntime().scheduler.run(req.params.name);
  res.json({ job: req.params.name, result });
}));

export default router;
