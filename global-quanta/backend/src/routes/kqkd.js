// K0 (06/11/2026) — API KQKD theo quý (tab PHÂN TÍCH CƠ BẢN › Kết quả kinh doanh).
//   GET  /api/fundamentals/kqkd/summary          bảng toàn thị trường (mọi mã, quý mới nhất, lũy kế, chất lượng, bản đồ nhiệt 12 quý)
//   GET  /api/fundamentals/kqkd/ticker/:ticker   chi tiết một mã (ma trận 20 năm × Q1–Q4 + lũy kế, thác nước, chất lượng, mùa vụ, 3D/4D)
//   GET  /api/fundamentals/kqkd/status           trạng thái kho (số file, lần làm mới, mã lỗi)
//   POST /api/fundamentals/kqkd/admin/refresh    nạp lại từ VNDirect ngay (Bearer MARKET_ADMIN_TOKEN; chạy nền, trả 202)
import zlib from "node:zlib";
import { Router } from "express";
import { createRateLimiter, isAdmin } from "./macro.js";

export function createKqkdRouter({ getService, getAgm = null, getEventStudy = null, getSeasonMap = null, getSeasonOracle = null, getSeasonX = null, getCafef = null, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
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
  // S7: Mùa vụ KQKD — gói 9 API Project A + kiểm ngày làm mốc (S3) + bối cảnh kỳ tới (S5).
  router.get("/seasonality/:ticker", readRl, async (req, res) => {
    const t = String(req.params.ticker ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    try { const doc = await getService().seasonality(t); if (!doc) return res.status(404).json({ error: `${t} không thuộc danh mục KQKD.` }); send(req, res, doc); } catch (e) { fail(res, e); }
  });
  // S2: bản đồ mùa vụ toàn thị trường · S6: sổ theo dõi cửa sổ THEO DÕI / ĐẠT.
  router.get("/season-map", readRl, (req, res) => {
    const m = getSeasonMap?.()?.map?.();
    if (!m) return res.status(503).json({ error: "Bản đồ mùa vụ chưa dựng (20 phút sau khởi động, sau đó mỗi tuần).", status: getSeasonMap?.()?.status?.() ?? null });
    send(req, res, m);
  });
  router.get("/season-ledger", readRl, (_req, res) => { const sm = getSeasonMap?.(); if (!sm) return res.status(503).json({ error: "Chưa bật." }); res.json(sm.ledger()); });
  router.post("/admin/season-map", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const sm = getSeasonMap?.(); if (!sm) return res.status(503).json({ error: "Chưa bật." });
    void sm.build().then(() => sm.ledgerTick()).catch((e) => console.warn(`[season-map] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true });
  });
  // SD-v1: đối chiếu kho Gateway với 3 route Project A (mọi mã × 9 mục) — chạy nền (admin), xem kết quả công khai.
  router.get("/season-oracle", (_req, res) => res.json(getSeasonOracle?.()?.status?.() ?? { available: false }));
  router.post("/admin/season-oracle", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const o = getSeasonOracle?.(); if (!o) return res.status(503).json({ error: "Chưa bật." });
    const limit = Number(req.query.limit) > 0 ? Math.min(400, Number(req.query.limit)) : null;
    void o.run({ limit }).catch((e) => console.warn(`[season-oracle] lỗi: ${e.message}`));
    res.status(202).json({ started: true, limit });
  });
  // S8: Mùa vụ bản THĂM DÒ (ngày làm mốc = ngày công bố thật CafeF) + trạng thái / tiêu chí đặt trước của ngày CafeF.
  router.get("/seasonality-x/:ticker", readRl, (req, res) => {
    const t = String(req.params.ticker ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    const d = getSeasonX?.()?.items?.(t);
    if (!d) return res.status(503).json({ error: "Bản THĂM DÒ chưa dựng (sau khi đọc xong lịch sử CafeF tới 2020).", status: getSeasonX?.()?.status?.() ?? null });
    const ca = getCafef?.(); const m = ca?.dates?.(t);
    send(req, res, { ...d, ticker: t, cafef: m ? [...m].map(([fiscal, v]) => ({ fiscal, date: v.date, tier: v.tier, title: v.title })).sort((a, b) => b.fiscal.localeCompare(a.fiscal)) : [] });
  });
  router.get("/season-x/status", (_req, res) => { const ca = getCafef?.(); res.json({ seasonX: getSeasonX?.()?.status?.() ?? null, cafef: ca?.status?.() ?? null, evaluate: ca?.evaluate?.() ?? null }); });
  router.post("/admin/cafef-crawl", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const ca = getCafef?.(); if (!ca) return res.status(503).json({ error: "Chưa bật." });
    const until = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.until)) ? String(req.query.until) : "2020-01-01";
    void ca.crawl({ until }).catch((e) => console.warn(`[cafef] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true, until });
  });
  router.post("/admin/season-x", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const sx = getSeasonX?.(); if (!sx) return res.status(503).json({ error: "Chưa bật." });
    void sx.run({ force: req.query.force === "1" }).then((r) => console.log(`[season-x] admin: ${JSON.stringify(r).slice(0, 300)}`)).catch((e) => console.warn(`[season-x] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true });
  });
  // LC4: lịch công bố KQKD (mùa hiện tại + mùa kế tiếp).
  router.get("/calendar", readRl, async (req, res) => {
    try { const doc = await getService().calendar(); if (!doc) return res.status(503).json({ error: "Kho KQKD chưa có dữ liệu." }); send(req, res, doc); } catch (e) { fail(res, e); }
  });
  // LC3: phản ứng giá quanh công bố (tổng hợp theo SUE + trạng thái job).
  router.get("/event-study", readRl, (req, res) => {
    const es = getEventStudy?.(); const d = es?.doc?.();
    if (!d) return res.status(503).json({ error: "Nghiên cứu sự kiện chưa dựng (job 19:45 hoặc 12 phút sau khởi động).", status: es?.status?.() ?? null });
    send(req, res, { version: d.version, builtAt: d.builtAt, asOf: d.asOf, aggregate: d.aggregate });
  });
  router.post("/admin/event-study", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    const es = getEventStudy?.(); if (!es) return res.status(503).json({ error: "Chưa bật." });
    void es.run().catch((e) => console.warn(`[event-study] admin lỗi: ${e.message}`));
    res.status(202).json({ started: true });
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
