// K0 (06/11/2026) — API KQKD theo quý (tab PHÂN TÍCH CƠ BẢN › Kết quả kinh doanh).
//   GET  /api/fundamentals/kqkd/summary          bảng toàn thị trường (mọi mã, quý mới nhất, lũy kế, chất lượng, bản đồ nhiệt 12 quý)
//   GET  /api/fundamentals/kqkd/ticker/:ticker   chi tiết một mã (ma trận 20 năm × Q1–Q4 + lũy kế, thác nước, chất lượng, mùa vụ, 3D/4D)
//   GET  /api/fundamentals/kqkd/status           trạng thái kho (số file, lần làm mới, mã lỗi)
//   POST /api/fundamentals/kqkd/admin/refresh    nạp lại từ VNDirect ngay (Bearer MARKET_ADMIN_TOKEN; chạy nền, trả 202)
import zlib from "node:zlib";
import { Router } from "express";
import { createRateLimiter, isAdmin } from "./macro.js";

export function createKqkdRouter({ getService, getAgm = null, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
  const router = Router();
  const readRl = createRateLimiter({ limit: 90 });
  // Gateway không có middleware nén: nén gzip một lần cho mỗi bản tài liệu (đệm theo đối tượng) — bảng ~320 KB -> ~45 KB.
  const gz = new WeakMap();
  const send = (req, res, doc) => {
    res.set("Cache-Control", "public, max-age=600");
    res.set("Vary", "Accept-Encoding");
    if (!/\bgzip\b/.test(String(req.get("accept-encoding") ?? ""))) return res.json(doc);
    let buf = gz.get(doc);
    if (!buf) { buf = zlib.gzipSync(JSON.stringify(doc)); gz.set(doc, buf); }
    res.set("Content-Type", "application/json; charset=utf-8");
    res.set("Content-Encoding", "gzip");
    return res.end(buf);
  };
  const fail = (res, e) => res.status(503).json({ error: `Kho KQKD tạm không đọc được: ${e?.message ?? e}` });

  router.get("/summary", readRl, async (req, res) => {
    try {
      const doc = await getService().summary();
      if (!doc) return res.status(503).json({ error: "Kho KQKD đang nạp lần đầu (khoảng 10 phút sau khi Gateway khởi động).", status: getService().status() });
      send(req, res, doc);
    } catch (e) { fail(res, e); }
  });

  router.get("/ticker/:ticker", readRl, async (req, res) => {
    const t = String(req.params.ticker ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    try {
      const doc = await getService().detail(t);
      if (!doc) return res.status(404).json({ error: `Chưa có BCTC quý của ${t}.` });
      send(req, res, doc);
    } catch (e) { fail(res, e); }
  });

  router.get("/status", (_req, res) => res.json(getService().status()));
  // LC4: lịch công bố KQKD (mùa hiện tại + mùa kế tiếp).
  router.get("/calendar", readRl, async (req, res) => {
    try { const doc = await getService().calendar(); if (!doc) return res.status(503).json({ error: "Kho KQKD chưa có dữ liệu." }); send(req, res, doc); } catch (e) { fail(res, e); }
  });
  // KQ-L1: sổ theo dõi tiến của tăng trưởng ước tính cả năm.
  router.get("/ledger", readRl, async (req, res) => {
    try { send(req, res, await getService().ledger()); } catch (e) { fail(res, e); }
  });

  // AGM-v1: trạng thái + chạy một lượt thu kế hoạch ĐHĐCĐ (admin).
  router.get("/agm/status", (_req, res) => res.json(getAgm?.()?.status?.() ?? { available: false }));
  router.post("/admin/agm", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const agm = getAgm?.(); if (!agm) return res.status(503).json({ error: "Chưa bật." });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
    void agm.run({ limit }).then(() => getService().rebuildSummary("agm")).catch((e) => console.warn(`[agm] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true, limit });
  });
  router.post("/admin/refresh", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const svc = getService();
    if (svc.status().running) return res.status(409).json({ error: "Đang nạp.", status: svc.status() });
    void svc.refresh({ force: req.query.force !== "0", reason: "admin" }).catch((e) => console.warn(`[kqkd] admin refresh lỗi: ${e.message}`));
    res.status(202).json({ started: true, status: svc.status() });
  });

  return router;
}
