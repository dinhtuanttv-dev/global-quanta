// Chẩn đoán RAM (23/10/2026, sau sự cố OOM): sampling heap profiler của V8 — chi phí thấp, KHÔNG chụp toàn bộ heap (không tự gây OOM).
//   POST /api/health/heap-profile/start   bắt đầu lấy mẫu (admin)
//   GET  /api/health/heap-profile          các vị trí cấp phát CÒN SỐNG kể từ lúc start, xếp theo dung lượng (admin)
//   POST /api/health/heap-profile/stop     dừng lấy mẫu (admin)
import express from "express";
import inspector from "node:inspector";
import v8 from "node:v8";
import { isAdmin } from "./macro.js";

const MB = 1048576;
const round = (b) => Math.round((b / MB) * 10) / 10;

/** Gộp cây mẫu theo vị trí: self = byte cấp phát tại chính hàm; inclusive = gồm các hàm nó gọi (đếm mỗi vị trí một lần trên một nhánh). */
export function summarizeProfile(head, { top = 40, appOnly = true } = {}) {
  const self = new Map(), incl = new Map();
  const keyOf = (f) => `${f.functionName || "(anonymous)"} ${String(f.url).replace(/^file:\/\/.*?\/src\//, "src/")}:${f.lineNumber + 1}`;
  const walk = (n, onPath) => {
    const k = keyOf(n.callFrame);
    const s = n.selfSize ?? 0;
    self.set(k, (self.get(k) ?? 0) + s);
    const path = onPath.has(k) ? onPath : new Set(onPath).add(k);
    for (const p of path) incl.set(p, (incl.get(p) ?? 0) + s);
    for (const c of n.children ?? []) walk(c, path);
  };
  walk(head, new Set());
  const isApp = (k) => !appOnly || k.includes("src/");
  const list = (m) => [...m].filter(([k]) => isApp(k)).sort((a, b) => b[1] - a[1]).slice(0, top).map(([site, b]) => ({ site, mb: round(b) }));
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return { sampledLiveMb: round(total), bySelf: list(self), byInclusive: list(incl) };
}

export function createHeapProfileRouter({ adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" } = {}) {
  const router = express.Router();
  let session = null, startedAt = null;
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (e, r) => (e ? reject(e) : resolve(r))));
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    next();
  });
  router.post("/start", async (req, res) => {
    try {
      if (!session) { session = new inspector.Session(); session.connect(); }
      await post("HeapProfiler.startSampling", { samplingInterval: 64 * 1024 });
      startedAt = new Date().toISOString();
      res.json({ ok: true, startedAt });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.get("/", async (req, res) => {
    if (!session || !startedAt) return res.status(409).json({ error: "Chưa start." });
    try {
      const { profile } = await post("HeapProfiler.getSamplingProfile");
      const m = process.memoryUsage();
      res.json({ startedAt, memory: { heapUsedMb: round(m.heapUsed), heapLimitMb: round(v8.getHeapStatistics().heap_size_limit), rssMb: round(m.rss) },
        ...summarizeProfile(profile.head, { top: Number(req.query.top) || 40, appOnly: req.query.all !== "1" }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post("/stop", async (req, res) => {
    try { if (session && startedAt) await post("HeapProfiler.stopSampling"); startedAt = null; res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  return router;
}
