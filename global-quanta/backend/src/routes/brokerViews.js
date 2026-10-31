// GET /api/broker-views — đồng thuận CTCK đã kiểm chứng. POST /refresh: chỉ admin.
import { Router } from "express";
import { createRateLimiter, isAdmin } from "./macro.js";

export function createBrokerViewsRouter({ getService, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" } = {}) {
  const router = Router();
  const rl = createRateLimiter({ limit: 120 });
  router.get("/", rl, async (req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=60");
      res.json(await getService().get());
    } catch (e) {
      console.warn(`[broker-views] ${e?.message}`);
      res.status(500).json({ error: "Lỗi đồng thuận CTCK." });
    }
  });
  router.post("/refresh", (req, res) => {
    if (!isAdmin(req, adminToken())) { res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." }); return; }
    void getService().runOnce().catch((e) => console.warn(`[broker-views] ${e?.message}`));
    res.json({ status: "started" });
  });
  return router;
}
