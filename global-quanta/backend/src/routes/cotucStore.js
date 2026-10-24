// B2 — API kho Cổ tức (thay Neon cho Project A). Đọc/ghi CHỈ cho Project A (Bearer PROJECT_A_CRON_SECRET — cùng bí mật Gateway
// đang dùng để gọi cron của Project A, không thêm bí mật mới); /status và /buy-timeline công khai (chỉ đọc) để giám sát.
//   GET  /api/cotuc-store/status
//   GET  /api/cotuc-store/health                B4: kho + Timeline (nguồn, đối chiếu Project A) + làn quét (ngắt mạch) — một chỗ
//   GET  /api/cotuc-store/buy-timeline          Timeline tính trên Gateway từ kho (B3) — đối chiếu với Project A (B4)
//   GET  /api/cotuc-store/:table?tickers=A,B&keys=k1,k2&fields=ticker,snapshot.exDate
//   POST /api/cotuc-store/:table  { rows: [...] }   ghi gộp theo cột
import express from "express";
import { timingSafeEqual } from "node:crypto";

const list = (v, re) => (typeof v === "string" && v ? v.split(",").map((s) => s.trim()).filter((s) => re.test(s)).slice(0, 2000) : null);

export function createCotucStoreRouter({ getStore, getTimeline, getHealth = null, secret = () => process.env.PROJECT_A_CRON_SECRET || "" }) {
  const router = express.Router();
  const authed = (req) => {
    const s = secret();
    const got = Buffer.from(String(req.headers.authorization ?? ""));
    const want = Buffer.from(`Bearer ${s}`);
    return s.length > 0 && got.length === want.length && timingSafeEqual(got, want);
  };
  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status ?? 500).json({ error: e.status ? e.message : "Kho Cổ tức lỗi." }));

  router.get("/status", wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getStore().status());
  }));

  router.get("/health", wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(getHealth ? await getHealth() : { store: await getStore().status() });
  }));

  router.get("/buy-timeline", wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getTimeline());
  }));

  router.get("/:table", wrap(async (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: "Unauthorized" });
    const rows = await getStore().list(req.params.table, {
      tickers: list(req.query.tickers, /^[A-Z0-9]{1,10}$/),
      keys: list(req.query.keys, /^[A-Za-z0-9_:.\-]{1,120}$/),
      fields: list(req.query.fields, /^[A-Za-z0-9_.]{1,80}$/),
    });
    res.set("Cache-Control", "no-store");
    res.json({ table: req.params.table, count: rows.length, rows });
  }));

  router.post("/:table", wrap(async (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: "Unauthorized" });
    const written = await getStore().upsert(req.params.table, req.body?.rows);
    res.json({ table: req.params.table, written });
  }));

  return router;
}
