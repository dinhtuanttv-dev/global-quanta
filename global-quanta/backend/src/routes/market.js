// API dữ liệu thị trường chuẩn hoá: SSI là nguồn chính, nguồn cũ là dự phòng.
// Mọi response đều có `provenance` { source, asOf, isStale, fallbackReason }.

import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { getMarketRuntime } from "../market/runtime.js";
import { KV } from "../market/scanner/scannerJobs.js";
import { getVolumeAnalysis } from "../market/scanner/volumeService.js";
import { getIntradayCycle, getIntradaySessions } from "../market/scanner/intradayService.js";
import { buildIntentFootprint } from "../market/scanner/ife.js";
import { loadTickFlows } from "../market/scanner/tickFlowService.js";
import { scoreCustomTickers, parseTickers } from "../market/scanner/customScan.js";
import { getNewsForTickers, parseTickers as parseNewsTickers } from "../market/news/newsService.js";
import { getResearchOverview, getResearchSymbol } from "../market/research/researchService.js";
import { createAuthVerifier, getHistory, saveSnapshot } from "../market/radar/radarHistory.js";
import { getRadarSignals, parseSignalTickers } from "../market/radar/radarSignals.js";

const router = Router();

const splitList = (value) => (typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);

function sendError(res, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
  const body = { error: error?.message || "Market data request failed." };
  if (Array.isArray(error?.attempts)) body.attempts = error.attempts;
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

router.get("/status", handle(async (req, res) => {
  const rt = getMarketRuntime();
  res.set("Cache-Control", "no-store");
  res.json({ ...(await rt.service.status()), ingestor: { enabled: rt.started, jobs: rt.scheduler.status() }, tickRecorder: rt.tickRecorder.status() });
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
router.get("/breadth", handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await service().getBreadth(typeof req.query.index === "string" ? req.query.index : "VNINDEX"));
}));

// Siêu Quét AI (engine trên Gateway, nguồn SSI). Cùng định dạng với Project A
// /api/sieu-quet-ai/scanner: { generatedAt, indexState, items, totalCount } + dataAsOf/meta.
router.get("/scanner", handle(async (req, res) => {
  const doc = (await getMarketRuntime().store.getKv(KV.latest))?.value;
  if (!doc) {
    res.status(503).json({ error: "Siêu Quét trên Gateway chưa có kết quả (chưa chạy scanUniverse)." });
    return;
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json(doc);
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

// Lịch sử ELITE COMMAND RADAR theo người dùng đăng nhập (Supabase Auth) × ★ danh mục.
// GET /radar/history?list=<tên danh mục>&days=30 · PUT /radar/snapshot { list, items } (ghi đè ảnh của ngày giao dịch hiện tại).
const verifyUser = createAuthVerifier();

router.get("/radar/history", handle(async (req, res) => {
  const userId = await verifyUser(req.headers.authorization);
  res.set("Cache-Control", "no-store");
  res.json(await getHistory(getMarketRuntime().store, userId, { list: req.query.list, days: req.query.days }));
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

// Danh mục tự chọn / rổ chỉ số: chấm điểm theo cùng công thức + bối cảnh của lần quét gần nhất.
// GET /scanner/custom?tickers=FPT,HPG,... (tối đa 60 mã)
router.get("/scanner/custom", handle(async (req, res) => {
  const rt = getMarketRuntime();
  const tickers = parseTickers(req.query.tickers);
  const latest = (await rt.store.getKv(KV.latest))?.value;
  const key = `scanner-custom:${latest?.generatedAt ?? "none"}:${[...tickers].sort().join(",")}`;
  const data = await rt.service.cache.wrap(key, 10 * 60_000, () => scoreCustomTickers(rt.service, tickers));
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
