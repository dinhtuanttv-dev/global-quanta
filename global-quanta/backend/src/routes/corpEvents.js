// LSK1 (07/11/2026) — API Lịch sự kiện doanh nghiệp (Gateway).
//   GET  /api/corp-events?from=&to=&groups=DIVIDEND,MEETING,CAPITAL,STATUS&tickers=   (mặc định: 7 ngày trước … 400 ngày tới)
//   GET  /api/corp-events/ticker/:ticker     toàn bộ lịch sử một mã
//   GET  /api/corp-events/status
//   POST /api/corp-events/admin/refresh      (Bearer MARKET_ADMIN_TOKEN)
import zlib from "node:zlib";
import { Router } from "express";
import { dividendPlanNews } from "../market/events/corpEvents.js";
import { createRateLimiter, isAdmin } from "./macro.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GROUPS = new Set(["DIVIDEND", "MEETING", "CAPITAL", "STATUS"]);
export function createCorpEventsRouter({ getService, getExStudy = () => null, getCafefNews = () => null, getScreener = () => null, getFmLedger = () => null, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
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
  router.get("/habits", rl, (req, res) => {
    const days = Math.max(14, Math.min(180, Number(req.query.days) || 90));
    const doc = getService()?.habits({ days }); if (!doc) return res.status(503).json({ error: "Kho sự kiện chưa có dữ liệu." });
    send(req, res, doc);
  });
  // LSK5: hành vi giá quanh ngày GDKHQ (XD-v1, MÔ TẢ) — dựng cùng job nghiên cứu sự kiện 19:45.
  router.get("/ex-study", rl, (req, res) => {
    const d = getExStudy(); if (!d) return res.status(503).json({ error: "Chưa dựng (job 19:45)." });
    send(req, res, { version: d.version, builtAt: d.builtAt, events: d.events, aggregate: d.aggregate, label: "MÔ TẢ" });
  });
  router.get("/ex-study/:ticker", rl, (req, res) => {
    const t = String(req.params.ticker ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    const d = getExStudy(); if (!d) return res.status(503).json({ error: "Chưa dựng (job 19:45)." });
    send(req, res, { version: d.version, builtAt: d.builtAt, ticker: t, summary: d.byTicker?.[t] ?? null, market: d.aggregate?.all ?? null });
  });
  // LSK3 bản 1: tin về phương án / kế hoạch cổ tức 24 tháng (tiêu đề CafeF, MÔ TẢ — không tự tính phần còn chưa trả).
  router.get("/plan-news/:ticker", rl, (req, res) => {
    const t = String(req.params.ticker ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
    const otherCode = (title) => [...String(title).matchAll(/\(([A-Z0-9]{3})\)/g)].some((m) => m[1] !== t);
    const rows = dividendPlanNews(getCafefNews(t) ?? [], since).filter((x) => x.status !== "OTHER" && !otherCode(x.title));
    send(req, res, { ticker: t, label: "MÔ TẢ", source: "Tiêu đề tin doanh nghiệp CafeF", rows });
  });
  // BL1: dữ liệu Bộ lọc cổ phiếu (DS-v1) — mọi mã, mọi chỉ số thật kèm mốc cập nhật từng nguồn.
  router.get("/screener", rl, async (req, res) => {
    const s = getScreener(); if (!s) return res.status(503).json({ error: "Chưa bật." });
    try { send(req, res, await s.get()); } catch (e) { res.status(503).json({ error: String(e?.message ?? e) }); }
  });
  router.get("/fm-ledger", (_req, res) => res.json(getFmLedger()?.summary?.() ?? { available: false }));
  router.get("/status", (_req, res) => res.json(getService()?.status() ?? { available: false }));
  router.post("/admin/refresh", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    void getService()?.refresh({ reason: "admin" }).catch((e) => console.warn(`[corp-events] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true });
  });
  return router;
}
