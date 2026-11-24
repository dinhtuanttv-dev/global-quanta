import express from "express";

export function createResearchRoomRouter({ getRoom, verifyUser }) {
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
  router.post("/snapshots", authed((room, owner, req) => room.lock(owner, req.body?.ticker ?? null)));
  router.get("/runs", authed((room, owner, req) => room.list(owner, req.query.ticker ?? null, req.query.offset ?? "0")));
  router.get("/runs/:id", authed((room, owner, req) => room.get(owner, req.params.id)));
  router.put("/runs/:id", authed((room, owner, req) => room.save(owner, req.params.id, req.body?.run, req.body?.approve === true)));
  return router;
}
