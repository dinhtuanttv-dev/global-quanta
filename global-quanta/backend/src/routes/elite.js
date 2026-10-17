// Elite 10 — trung tâm quyết định (E1 2026-10-17): sổ đăng ký tín hiệu.
//   GET  /api/elite/signals          danh mục tín hiệu (tab nguồn, ý nghĩa, bậc bằng chứng ban đầu, ghi chú bằng chứng)
//   GET  /api/elite/panel[?date=]    bảng tín hiệu mã × tín hiệu của một phiên (mặc định phiên mới nhất)
//   GET  /api/elite/panel/:ticker    các tín hiệu của một mã ở phiên mới nhất
//   POST /api/elite/admin/build      dựng lại bảng phiên mới nhất (Bearer MARKET_ADMIN_TOKEN; ?force=1 ghi đè)
import express from "express";
import { isAdmin } from "./macro.js";
import { SIGNAL_SPECS } from "../market/elite/signalRegistry.js";

export function createEliteRouter({ getPanel, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
  const router = express.Router();
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(500).json({ error: String(e?.message ?? e).slice(0, 300) });
    }
  };

  router.get("/signals", (req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json({ signals: SIGNAL_SPECS });
  });

  router.get("/panel", wrap(async (req, res) => {
    const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
    const doc = await getPanel().panel(date);
    if (!doc) return res.status(404).json({ error: date ? `Chưa có bảng tín hiệu phiên ${date}.` : "Chưa có bảng tín hiệu nào." });
    res.set("Cache-Control", "public, max-age=300");
    res.json(doc);
  }));

  router.get("/panel/:ticker", wrap(async (req, res) => {
    const ticker = String(req.params.ticker || "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(ticker)) return res.status(400).json({ error: "Mã không hợp lệ." });
    const doc = await getPanel().panel();
    if (!doc) return res.status(404).json({ error: "Chưa có bảng tín hiệu nào." });
    const row = doc.rows.find((r) => r.ticker === ticker);
    if (!row) return res.status(404).json({ error: `${ticker} không nằm trong vũ trụ Siêu quét phiên ${doc.date}.` });
    res.set("Cache-Control", "public, max-age=300");
    res.json({ date: doc.date, version: doc.version, asOf: doc.asOf, missingSources: doc.missingSources, signals: doc.signals, ...row });
  }));

  router.post("/admin/build", (req, res, next) => (isAdmin(req, adminToken()) ? next() : res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." })), wrap(async (req, res) => {
    const doc = await getPanel().build({ force: req.query.force === "1" });
    res.json({ date: doc.date, universe: doc.universe, coverage: doc.coverage, missingSources: doc.missingSources, builtAt: doc.builtAt });
  }));

  return router;
}
