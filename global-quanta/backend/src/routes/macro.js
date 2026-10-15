// /api/macro/* — Trung tâm vĩ mô (gói MacroCenter) trên Gateway.
// Đọc: CÔNG KHAI (chỉ tính toán chỉ-đọc trên số liệu công bố/mô phỏng, không có dữ liệu người dùng) + giới hạn tần suất theo IP.
//   Lệch với HANDOFF (requireAuth): tab Chất xúc tác mở cho mọi người xem như các tab khác — ghi rõ ở INTEGRATION-tab-xuc-tac.md.
// Ghi (nạp CSV, làm mới chỉ số HOSE): chỉ admin — Bearer MARKET_ADMIN_TOKEN.
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";

const ENGINE_ROUTES = new Set(["health", "series", "impact", "cell", "scenario", "score", "regime", "regime-impact", "report", "alerts", "calendar"]);

/** Giới hạn tần suất cửa sổ cố định theo IP (bộ nhớ trong; một instance Gateway). */
export function createRateLimiter({ limit, windowMs = 60_000, now = Date.now }) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = String(req.get("x-forwarded-for") || req.ip || "?").split(",")[0].trim();
    const t = now();
    let h = hits.get(ip);
    if (!h || t - h.start >= windowMs) {
      h = { start: t, n: 0 };
      hits.set(ip, h);
    }
    h.n++;
    if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    if (h.n > limit) {
      res.set("Retry-After", String(Math.ceil((h.start + windowMs - t) / 1000)));
      res.status(429).json({ error: "Quá nhiều yêu cầu vĩ mô — thử lại sau ít giây." });
      return;
    }
    next();
  };
}

function isAdmin(req, expected) {
  const header = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const strQuery = (q) => Object.fromEntries(Object.entries(q ?? {}).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v]));

export function createMacroRouter({ getService, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "", readLimit = 120, computeLimit = 40, now } = {}) {
  const router = Router();
  const readRl = createRateLimiter({ limit: readLimit, now });
  const computeRl = createRateLimiter({ limit: computeLimit, now });
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e?.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
      res.status(status).json({ error: status === 500 ? "Lỗi Trung tâm vĩ mô." : e.message });
      if (status === 500) console.warn(`[macro] ${req.method} ${req.path}: ${e?.message}`);
    }
  };
  const admin = (req, res, next) => (isAdmin(req, adminToken()) ? next() : res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." }));

  router.get("/source", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json(await getService().source());
  }));

  router.get("/tools", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(await getService().toolSpecs());
  }));

  router.post("/tools/:name", computeRl, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getService().runTool(req.params.name, req.body ?? {}));
  }));

  router.post("/admin/import", admin, wrap(async (req, res) => {
    const b = req.body ?? {};
    res.set("Cache-Control", "no-store");
    res.json(await getService().importCsv({
      seriesId: b.seriesId, csv: b.csv, locale: b.locale, delimiter: b.delimiter, hasHeader: b.hasHeader, monthly: b.monthly,
      asOf: b.asOf, source: b.source, dryRun: b.dryRun === true, force: b.force === true,
    }));
  }));

  router.post("/admin/refresh-hose", admin, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getService().refreshHoseTargets({ force: true }));
  }));

  for (const method of ["get", "post"]) {
    router[method]("/:route", method === "get" ? readRl : computeRl, wrap(async (req, res, next) => {
      if (!ENGINE_ROUTES.has(req.params.route)) {
        res.status(404).json({ error: "Không tìm thấy." });
        return;
      }
      const r = await getService().handle({ method: req.method === "HEAD" ? "GET" : req.method, path: `/api/macro/${req.params.route}`, query: strQuery(req.query), body: req.body });
      res.set("Cache-Control", r.status === 200 ? "public, max-age=120" : "no-store");
      res.status(r.status).json(r.body);
    }));
  }

  return router;
}
