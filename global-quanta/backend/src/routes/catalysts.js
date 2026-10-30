// 31/10/2026 — GET /api/catalysts/latest: snapshot Chất xúc tác lưu trên Railway Volume (job catalystScan*, xem cotuc/qmsJobs.js), thay Upstash + Neon.
// Giữ hợp đồng route cũ của Project A: { error } khi chưa có dữ liệu, 503 + transient khi kho lỗi; có isStale + ageMinutes khi đọc.
import express from "express";

export const CATALYST_SNAPSHOT_KEY = "catalyst:snapshot:latest";
/** Quét 4 lần/ngày, khoảng nghỉ đêm dài nhất ~12 giờ: quá 13 giờ nghĩa là lượt quét đã lỗi. */
export const CATALYST_STALE_MINUTES = 13 * 60;

export async function readCatalystSnapshot(store, now = Date.now()) {
  const row = (await store.list("catkv", { keys: [CATALYST_SNAPSHOT_KEY], fields: ["value"] }))[0];
  const snapshot = row?.value;
  if (!snapshot?.scannedAt) return null;
  const ageMinutes = Math.max(0, Math.round((now - Date.parse(snapshot.scannedAt)) / 60_000));
  return { ...snapshot, isStale: ageMinutes > CATALYST_STALE_MINUTES, ageMinutes };
}

export function createCatalystRouter({ getStore, now = Date.now }) {
  const router = express.Router();
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
