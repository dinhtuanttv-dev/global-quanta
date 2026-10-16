// /api/commodities/* — Nhịp đập hàng hoá (tab Kết nối thế giới). Công khai, chỉ đọc giá thị trường đã công bố; giới hạn tần suất theo IP.
import { Router } from "express";
import { createRateLimiter } from "./macro.js";

export function createCommoditiesRouter({ getService, readLimit = 120, now } = {}) {
  const router = Router();
  const readRl = createRateLimiter({ limit: readLimit, now });
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(500).json({ error: "Lỗi dữ liệu hàng hoá." });
      console.warn(`[commodities] ${req.method} ${req.path}: ${e?.message}`);
    }
  };

  router.get("/snapshot", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getService().snapshot());
  }));

  // Phân tích chuyên sâu một mặt hàng (C2): giá thế giới, quy đổi VND, chuỗi phía Việt Nam, thống kê, biến động, quan hệ (thăm dò).
  router.get("/:id/history", readRl, wrap(async (req, res) => {
    const r = await getService().history(String(req.params.id || "").toUpperCase(), typeof req.query.range === "string" ? req.query.range : "5y");
    res.set("Cache-Control", r.status === 200 ? "public, max-age=300" : "no-store");
    res.status(r.status).json(r.body);
  }));

  return router;
}
