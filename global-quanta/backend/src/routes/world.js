// /api/world/* — Kết nối thế giới (engine world của gói macro-center 1.2) trên Gateway.
// Đọc: công khai (tính toán chỉ-đọc trên số liệu thị trường công bố, không có dữ liệu người dùng) + giới hạn tần suất theo IP;
// route nặng (matrix, scenario, connectedness) dùng hạn mức tính toán. Dựng lại dữ liệu: chỉ admin (Bearer MARKET_ADMIN_TOKEN).
import { Router } from "express";
import { createRateLimiter, isAdmin } from "./macro.js";

const strQuery = (q) => Object.fromEntries(Object.entries(q ?? {}).filter(([, v]) => typeof v === "string"));
const HEAVY = /^\/(matrix|scenario|connectedness|overview)$/;

export function createWorldRouter({ getService, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "", readLimit = 120, computeLimit = 30, now } = {}) {
  const router = Router();
  const readRl = createRateLimiter({ limit: readLimit, now });
  const computeRl = createRateLimiter({ limit: computeLimit, now });
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(500).json({ error: "Lỗi Kết nối thế giới." });
      console.warn(`[world] ${req.method} ${req.path}: ${e?.message}`);
    }
  };

  router.get("/source", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getService().source());
  }));

  router.post("/admin/refresh", (req, res, next) => (isAdmin(req, adminToken()) ? next() : res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." })), wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getService().refresh({ force: true }));
  }));

  router.all(/^\/(series|overview|matrix|connectedness|events|events\/[A-Za-z0-9_-]+|stock\/[A-Za-z0-9_-]+|scenario)$/,
    (req, res, next) => (HEAVY.test(req.path) ? computeRl : readRl)(req, res, next),
    wrap(async (req, res) => {
      const method = req.method === "HEAD" ? "GET" : req.method;
      const r = await getService().handle({ method, path: `/api/world${req.path}`, query: strQuery(req.query), body: req.body });
      res.set("Cache-Control", r.status === 200 ? "public, max-age=300" : "no-store");
      res.status(r.status).json(r.body);
    }));

  router.use((req, res) => res.status(404).json({ error: "Không tìm thấy." }));
  return router;
}
