import express from "express";

export function createResearchRoomRouter({ getRoom, verifyUser, getSession, precomputed, observation, ledger = null }) {
  const router = express.Router();
  const authed = (work) => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const owner = await verifyUser(req.get("authorization")).catch(() => null);
    if (typeof owner !== "string" || !owner) return res.status(401).json({ error: "Cần đăng nhập để mở kho nghiên cứu." });
    try { return res.json(await work(getRoom(), owner, req)); }
    catch (error) {
      return res.status(error.statusCode ?? 503).json({ error: error.statusCode ? error.message : "Kho nghiên cứu tạm thời không khả dụng." });
    }
  };
  if (getSession) router.get("/session", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.json(await getSession()); }
    catch { return res.status(503).json({ error: "Chưa đọc được tiến độ công bố phiên." }); }
  });
  // ARL-v1 (26/11/2026): sổ phán quyết Phòng họp AI — tổng hợp công khai (không có dữ liệu cá nhân), giống /api/elite/ledger.
  if (ledger) router.get("/ledger", async (req, res) => {
    const t = typeof req.query.ticker === "string" ? req.query.ticker.toUpperCase() : null;
    if (t && !/^[A-Z][A-Z0-9]{2}$/.test(t)) return res.status(400).json({ error: "Mã không hợp lệ." });
    try { res.set("Cache-Control", "public, max-age=300"); return res.json(await ledger().read({ ticker: t, limit: req.query.limit })); }
    catch { return res.status(503).json({ error: "Chưa đọc được sổ phán quyết." }); }
  });
  if (precomputed) router.get("/precomputed", authed((_room, _owner, req) => precomputed(req.query.ticker)));
  if (observation) router.get("/observation", authed((_room, _owner, req) => observation(req.query.ticker)));
  router.post("/snapshots", authed((room, owner, req) => room.lock(owner, req.body?.ticker ?? null)));
  router.post("/scenarios/parent", authed((room, owner, req) => room.scenarios.parent(owner, req.body)));
  router.post("/scenarios/preview", authed((room, owner, req) => room.scenarios.preview(owner, req.body)));
  router.get("/scenarios", authed((room, owner, req) => room.scenarios.list(owner, req.query.ticker)));
  router.get("/scenarios/:id", authed((room, owner, req) => room.scenarios.get(owner, req.params.id)));
  router.put("/scenarios/:id", authed((room, owner, req) => room.scenarios.save(owner, req.params.id, req.body)));
  router.get("/runs", authed((room, owner, req) => room.list(owner, req.query.ticker ?? null, req.query.offset ?? "0")));
  router.get("/runs/:id", authed((room, owner, req) => room.get(owner, req.params.id)));
  router.put("/runs/:id", authed((room, owner, req) => room.save(owner, req.params.id, req.body?.run, req.body?.approve === true)));
  return router;
}
