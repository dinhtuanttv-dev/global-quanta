// API dữ liệu thị trường chuẩn hoá: SSI là nguồn chính, nguồn cũ là dự phòng.
// Mọi response đều có `provenance` { source, asOf, isStale, fallbackReason }.

import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { getMarketRuntime } from "../market/runtime.js";

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
  res.json({ ...(await rt.service.status()), ingestor: { enabled: rt.started, jobs: rt.scheduler.status() } });
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
