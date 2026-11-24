import express from "express";

export function createResearchRoomRouter({ getRoom, verifyUser, getSession }) {
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
