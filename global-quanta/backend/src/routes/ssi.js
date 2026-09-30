import { Router } from "express";
import { getMarketData } from "../services/ssiFastConnect.js";
import { subscribeMarketStream, unsubscribeMarketStream } from "../services/ssiMarketStream.js";

const router = Router();
const allowedQueryKeys = new Set([
  "market", "symbol", "indexId", "indexCode", "exchange", "fromDate", "toDate", "pageIndex", "pageSize", "ascending",
]);

router.get("/stream/market", async (req, res) => {
  try {
    const rawSymbols = typeof req.query.symbols === "string" ? req.query.symbols : "";
    const symbols = rawSymbols.split(",").map((symbol) => symbol.trim()).filter(Boolean);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    let heartbeat;
    res.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribeMarketStream(res);
    });
    heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
    await subscribeMarketStream(res, symbols);
  } catch (error) {
    if (!res.headersSent) res.status(error.statusCode || 502).json({ error: error.message || "SSI market stream failed." });
    else if (!res.destroyed && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || "SSI market stream failed." })}\n\n`);
      res.end();
    }
  }
});

router.get("/market/:endpoint", async (req, res) => {
  try {
    const query = Object.fromEntries(
      Object.entries(req.query).filter(([key, value]) => allowedQueryKeys.has(key) && typeof value === "string"),
    );
    const result = await getMarketData(req.params.endpoint, query);
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
    // Never include credentials, token contents, or upstream request headers in client errors.
    res.status(status).json({ error: error.message || "SSI FastConnect request failed." });
  }
});

export default router;
