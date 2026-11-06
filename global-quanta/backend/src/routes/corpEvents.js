// LSK1 (07/11/2026) — API Lịch sự kiện doanh nghiệp (Gateway).
//   GET  /api/corp-events?from=&to=&groups=DIVIDEND,MEETING,CAPITAL,STATUS&tickers=   (mặc định: 7 ngày trước … 400 ngày tới)
//   GET  /api/corp-events/ticker/:ticker     toàn bộ lịch sử một mã
//   GET  /api/corp-events/status
//   POST /api/corp-events/admin/refresh      (Bearer MARKET_ADMIN_TOKEN)
import zlib from "node:zlib";
import { Router } from "express";
import { createRateLimiter, isAdmin } from "./macro.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GROUPS = new Set(["DIVIDEND", "MEETING", "CAPITAL", "STATUS"]);
export function createCorpEventsRouter({ getService, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
  const router = Router();
  const rl = createRateLimiter({ limit: 90 });
  const send = (req, res, doc) => {
    res.set("Cache-Control", "public, max-age=300");
    res.set("Vary", "Accept-Encoding");
    if (!/\bgzip\b/.test(String(req.get("accept-encoding") ?? ""))) return res.json(doc);
    res.set("Content-Type", "application/json; charset=utf-8"); res.set("Content-Encoding", "gzip");
    return res.end(zlib.gzipSync(JSON.stringify(doc)));
  };
  router.get("/", rl, (req, res) => {
    const svc = getService(); if (!svc) return res.status(503).json({ error: "Chưa bật." });
    const from = ISO.test(String(req.query.from ?? "")) ? String(req.query.from) : undefined;
    const to = ISO.test(String(req.query.to ?? "")) ? String(req.query.to) : undefined;
    const groups = req.query.groups ? String(req.query.groups).split(",").filter((g) => GROUPS.has(g)) : null;
    const tickers = req.query.tickers ? String(req.query.tickers).toUpperCase().split(",").filter((t) => /^[A-Z0-9]{3,10}$/.test(t)).slice(0, 300) : null;
    const doc = svc.window({ from, to, groups, tickers });
    if (!doc) return res.status(503).json({ error: "Kho sự kiện đang nạp lần đầu (khoảng 2 phút sau khi Gateway khởi động).", status: svc.status() });
    send(req, res, doc);
  });
  router.get("/ticker/:ticker", rl, (req, res) => {
    const t = String(req.params.ticker ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    const doc = getService()?.ticker(t); if (!doc) return res.status(503).json({ error: "Kho sự kiện chưa có dữ liệu." });
    send(req, res, doc);
  });
  router.get("/status", (_req, res) => res.json(getService()?.status() ?? { available: false }));
  router.post("/admin/refresh", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    void getService()?.refresh({ reason: "admin" }).catch((e) => console.warn(`[corp-events] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true });
  });
  return router;
}
