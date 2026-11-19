// 31/10/2026 — GET /api/catalysts/latest: snapshot Chất xúc tác lưu trên Railway Volume (job catalystScan*, xem cotuc/qmsJobs.js), thay Upstash + Neon.
// Giữ hợp đồng route cũ của Project A: { error } khi chưa có dữ liệu, 503 + transient khi kho lỗi; có isStale + ageMinutes khi đọc.
import express from "express";

export const CATALYST_SNAPSHOT_KEY = "catalyst:snapshot:latest";
/** Lượt cuối 20:30, lượt đầu 08:35 -> khoảng nghỉ đêm dài nhất ~12 giờ: quá 13 giờ nghĩa là lượt quét đã lỗi. */
export const CATALYST_STALE_MINUTES = 13 * 60;

export async function readCatalystSnapshot(store, now = Date.now()) {
  const row = (await store.list("catkv", { keys: [CATALYST_SNAPSHOT_KEY], fields: ["value"] }))[0];
  const snapshot = row?.value;
  if (!snapshot?.scannedAt) return null;
  const ageMinutes = Math.max(0, Math.round((now - Date.parse(snapshot.scannedAt)) / 60_000));
  return { ...snapshot, isStale: ageMinutes > CATALYST_STALE_MINUTES, ageMinutes };
}

export function createCatalystRouter({ getStore, getChat = null, getDomesticEvents = null, getLedger = null, isAdmin = () => false, now = Date.now }) {
  const router = express.Router();
  // I0-G1 (19/11/2026): tiến độ kiểm định tiến X6-F — SỔ BỊT MẮT: chỉ số đếm, không có lợi suất trước ngày chấm theo đăng ký trước.
  if (getLedger) {
    router.get("/ledger/progress", async (req, res) => {
      try {
        res.set("Cache-Control", "public, max-age=300");
        res.json(await getLedger().progress());
      } catch (e) {
        console.warn(`[catalyst-ledger] ${e?.message}`);
        res.status(503).json({ error: "Chưa đọc được sổ tín hiệu." });
      }
    });
    router.post("/ledger/evaluate", async (req, res) => {
      if (!isAdmin(req)) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
      try {
        res.set("Cache-Control", "no-store");
        res.json(await getLedger().run());
      } catch (e) {
        res.status(500).json({ error: `Chấm sổ lỗi: ${e?.message}` });
      }
    });
  }
  // V4 (19/11/2026): hai route chuyển từ Project A về Gateway, cùng hợp đồng.
  if (getDomesticEvents) {
    router.get("/domestic-events", (req, res) => {
      res.set("Cache-Control", "public, max-age=3600");
      res.json({ events: getDomesticEvents(now()) });
    });
  }
  if (getChat) {
    router.get("/chat/config", (req, res) => {
      res.set("Cache-Control", "public, max-age=60");
      res.json(getChat().config());
    });
    router.post("/chat", (req, res) => {
      getChat().handle(req, res).catch((e) => {
        console.warn(`[catalyst-chat] ${e?.message}`);
        if (!res.headersSent) res.status(500).json({ error: "Lỗi Hỏi đáp xúc tác." });
        else res.end();
      });
    });
  }
  router.get("/latest", async (req, res) => {
    try {
      const snapshot = await readCatalystSnapshot(getStore(), now());
      res.set("Cache-Control", "public, max-age=120");
      res.json(snapshot ?? { error: "Chua co du lieu - cho lan quet dau tien" });
    } catch (e) {
      console.warn(`[catalysts] đọc snapshot lỗi: ${e.message}`);
      res.status(503).json({ error: "Dich vu du lieu tam thoi gian doan - vui long thu lai sau it phut.", transient: true });
    }
  });
  return router;
}
