// /api/world/* — Kết nối thế giới (engine world của gói macro-center 1.2) trên Gateway.
// Đọc: công khai (tính toán chỉ-đọc trên số liệu thị trường công bố, không có dữ liệu người dùng) + giới hạn tần suất theo IP;
// route nặng (matrix, scenario, connectedness) dùng hạn mức tính toán. Dựng lại dữ liệu: chỉ admin (Bearer MARKET_ADMIN_TOKEN).
import { Router } from "express";
import { createRateLimiter, isAdmin } from "./macro.js";
import { createWorldPulse } from "../market/world/worldPulse.js";
import { createWorldMonitor } from "../market/world/worldMonitor.js";
import { TOPICS } from "../market/world/worldNews.js";

const strQuery = (q) => Object.fromEntries(Object.entries(q ?? {}).filter(([, v]) => typeof v === "string"));
let pulse = null;
/** Nhịp đập thế giới dùng chung (route /pulse + chiến lược ngành). */
export const defaultPulse = () => (pulse ??= createWorldPulse());
let monitor = null;
const defaultMonitor = () => (monitor ??= createWorldMonitor());
const HEAVY = /^\/(matrix|scenario|connectedness|overview|confirmatory)$/;

export function createWorldRouter({ getService, getPulse = defaultPulse, getMonitor = defaultMonitor, getNews = null, getBrief = null, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "", readLimit = 120, computeLimit = 30, now } = {}) {
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

  // Nhịp đập thế giới (W6/W7): giá mới nhất kèm ngày + nguồn — một nguồn thống nhất cho tab Kết nối thế giới.
  router.get("/pulse", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json(await getPulse().get());
  }));

  // Giám sát thị trường (U1): một kho giá cho chỉ số, vĩ mô, hàng hoá, kèm nguồn, ngày, z và cờ dữ liệu cũ.
  router.get("/monitor", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json(await getMonitor().get());
  }));

  // Tin kinh tế thế giới (U1): nguồn chính thức và báo chí có danh tính, kèm thời gian đăng và mức xác nhận.
  router.get("/news", readRl, wrap(async (req, res) => {
    if (!getNews) return res.status(503).json({ error: "Tin thế giới chưa bật." });
    const topic = typeof req.query.topic === "string" && Object.hasOwn(TOPICS, req.query.topic) ? req.query.topic : null;
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 60));
    res.set("Cache-Control", "public, max-age=60");
    res.json(await getNews().get({ topic, limit }));
  }));

  // Bản tin AI có kiểm chứng (U4). Chạy tay qua giãn cách và trần lượt theo ngày ở dịch vụ, nên công khai vẫn không vượt chi phí.
  router.get("/brief", readRl, wrap(async (req, res) => {
    if (!getBrief) return res.status(503).json({ error: "Bản tin AI chưa bật." });
    const runId = typeof req.query.runId === "string" && /^\d{1,16}$/.test(req.query.runId) ? req.query.runId : null;
    res.set("Cache-Control", "no-store");
    res.json({ ...(await getBrief().get({ runId })), configured: !!process.env.GEMINI_API_KEY });
  }));
  router.post("/brief/run", computeRl, wrap(async (req, res) => {
    if (!getBrief) return res.status(503).json({ error: "Bản tin AI chưa bật." });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "Gateway chưa có khoá Gemini." });
    res.set("Cache-Control", "no-store");
    res.json(await getBrief().runManual());
  }));

  router.get("/source", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getService().source());
  }));

  // Công cụ chat world_* (cho "Hỏi đáp xúc tác" ở Project A) — cùng hợp đồng với /api/macro/tools.
  router.get("/tools", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(await getService().toolSpecs());
  }));
  router.post("/tools/:name", computeRl, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getService().runTool(req.params.name, req.body ?? {}));
  }));

  // Tín hiệu bối cảnh thế giới theo ngành cho bộ máy quyết định Lọc ngành (chỉ dùng được khi cổng ngoài mẫu đạt).
  router.get("/sector-signals", computeRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=1800");
    res.json(await getService().sectorSignals());
  }));

  router.post("/admin/refresh", (req, res, next) => (isAdmin(req, adminToken()) ? next() : res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." })), wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getService().refresh({ force: true }));
  }));

  router.all(/^\/(series|overview|matrix|confirmatory|connectedness|events|events\/[A-Za-z0-9_-]+|stock\/[A-Za-z0-9_-]+|scenario)$/,
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
