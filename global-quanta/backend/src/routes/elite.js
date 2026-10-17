// Elite 10 — trung tâm quyết định (E1 2026-10-17): sổ đăng ký tín hiệu.
//   GET  /api/elite/signals          danh mục tín hiệu (tab nguồn, ý nghĩa, bậc bằng chứng ban đầu, ghi chú bằng chứng)
//   GET  /api/elite/panel[?date=]    bảng tín hiệu mã × tín hiệu của một phiên (mặc định phiên mới nhất)
//   GET  /api/elite/panel/:ticker    các tín hiệu của một mã ở phiên mới nhất
//   POST /api/elite/admin/build      dựng lại bảng phiên mới nhất (Bearer MARKET_ADMIN_TOKEN; ?force=1 ghi đè)
// E2: GET  /api/elite/evidence       bằng chứng từng tín hiệu (IC theo kỳ hạn, q BH, bậc A/B/C theo E2-prereg.md)
//     POST /api/elite/admin/evidence  cập nhật chuỗi IC + bậc (admin)
// E3: GET  /api/elite/decision        Điểm Elite + danh mục Elite 10 phiên mới nhất (?date=) — E3-prereg.md
//     GET  /api/elite/decision/:ticker điểm và đóng góp từng tín hiệu của một mã
//     GET  /api/elite/ledger          sổ theo dõi tiến của danh mục (khoá lúc dựng, chấm sau d+1+h)
//     POST /api/elite/admin/decision  dựng quyết định + chấm sổ (admin)
// E5: GET  /api/elite/tools           công cụ chat elite_* cho Claude/Gemini (Project A) — cùng hợp đồng /api/world-sectors/tools
//     POST /api/elite/tools/:name
// E7: GET  /api/elite/retro           kiểm định hồi cứu walk-forward (E7-prereg.md); POST /admin/retro chạy lại (admin)
// E6: GET  /api/elite/risk            rủi ro danh mục Elite 10 (Ledoit–Wolf, đóng góp rủi ro, VaR/CVaR, beta, ENB, căng thẳng)
import express from "express";
import { isAdmin } from "./macro.js";
import { SIGNAL_SPECS } from "../market/elite/signalRegistry.js";

export function createEliteRouter({ getPanel, getEvidence = null, getDecision = null, getChatTools = null, getRisk = null, getRetro = null, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
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

  router.get("/evidence", wrap(async (req, res) => {
    const ev = getEvidence ? await getEvidence().evidence() : null;
    if (!ev) return res.status(404).json({ error: "Chưa có kết quả engine bằng chứng." });
    res.set("Cache-Control", "public, max-age=600");
    res.json(ev);
  }));

  const admin = (req, res, next) => (isAdmin(req, adminToken()) ? next() : res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." }));
  router.post("/admin/evidence", admin, wrap(async (req, res) => {
    if (!getEvidence) return res.status(503).json({ error: "Engine bằng chứng chưa cấu hình." });
    const ev = await getEvidence().update();
    res.json({ version: ev.version, calendarLast: ev.calendarLast, tests: ev.tests, counts: ev.counts });
  }));

  router.get("/decision", wrap(async (req, res) => {
    const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
    const doc = getDecision ? await getDecision().decision(date) : null;
    if (!doc) return res.status(404).json({ error: "Chưa có quyết định Elite 10." });
    res.set("Cache-Control", "public, max-age=300");
    res.json(doc);
  }));

  router.get("/decision/:ticker", wrap(async (req, res) => {
    const ticker = String(req.params.ticker || "").toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(ticker)) return res.status(400).json({ error: "Mã không hợp lệ." });
    const doc = getDecision ? await getDecision().decision() : null;
    if (!doc) return res.status(404).json({ error: "Chưa có quyết định Elite 10." });
    const score = doc.scores.find((x) => x.ticker === ticker);
    if (!score) return res.status(404).json({ error: `${ticker} không nằm trong vũ trụ phiên ${doc.date}.` });
    res.set("Cache-Control", "public, max-age=300");
    res.json({ date: doc.date, version: doc.version, icComb: doc.icComb, weights: doc.weights, inPortfolio: doc.portfolio.some((x) => x.ticker === ticker), universe: doc.universe, ...score });
  }));

  router.get("/ledger", wrap(async (req, res) => {
    const l = getDecision ? await getDecision().ledger() : null;
    if (!l) return res.status(404).json({ error: "Sổ theo dõi chưa có bản ghi." });
    res.set("Cache-Control", "public, max-age=600");
    res.json(l);
  }));

  router.post("/admin/decision", admin, wrap(async (req, res) => {
    if (!getDecision) return res.status(503).json({ error: "Engine quyết định chưa cấu hình." });
    const d = await getDecision().build({ force: req.query.force === "1" });
    res.json({ date: d.date, icComb: d.icComb, universe: d.universe, portfolio: d.portfolio.map((x) => `${x.ticker} ${(x.weight * 100).toFixed(1)}%`), label: d.ledgerSummary?.label });
  }));

  router.get("/risk", wrap(async (req, res) => {
    const r = getRisk ? await getRisk().risk() : null;
    if (!r) return res.status(404).json({ error: "Chưa có danh mục Elite 10 để tính rủi ro." });
    res.set("Cache-Control", "public, max-age=600");
    res.json(r);
  }));

  router.get("/retro", wrap(async (req, res) => {
    const r = getRetro ? await getRetro().result() : null;
    if (!r) return res.status(404).json({ error: "Chưa chạy kiểm định hồi cứu E7." });
    res.set("Cache-Control", "public, max-age=3600");
    res.json(r);
  }));
  router.post("/admin/retro", admin, wrap(async (req, res) => {
    if (!getRetro) return res.status(503).json({ error: "Chưa cấu hình kiểm định hồi cứu." });
    const r = await getRetro().run();
    res.json({ version: r.version, period: r.period, label: r.label, verdictVi: r.verdictVi, runtimeMs: r.runtimeMs, data: r.data });
  }));

  router.get("/tools", (req, res) => {
    if (!getChatTools) return res.status(503).json({ error: "Chưa bật công cụ." });
    res.set("Cache-Control", "public, max-age=300");
    res.json(getChatTools().specs());
  });
  router.post("/tools/:name", wrap(async (req, res) => {
    if (!getChatTools) return res.status(503).json({ error: "Chưa bật công cụ." });
    res.set("Cache-Control", "no-store");
    res.json(await getChatTools().run(String(req.params.name || ""), req.body ?? {}));
  }));

  router.post("/admin/build", (req, res, next) => (isAdmin(req, adminToken()) ? next() : res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." })), wrap(async (req, res) => {
    const doc = await getPanel().build({ force: req.query.force === "1" });
    res.json({ date: doc.date, universe: doc.universe, coverage: doc.coverage, missingSources: doc.missingSources, builtAt: doc.builtAt });
  }));

  return router;
}
