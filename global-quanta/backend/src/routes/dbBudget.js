// D0/D1 (2026-10-20) — sức khoẻ hạn mức kho dữ liệu.
//   GET  /api/health/db-budget                 egress Supabase hôm nay theo job/route/bảng, dự báo tháng, trạng thái kho đệm
//   POST /api/health/db-budget/reset-warehouse  xoá sạch kho đệm (admin) — sau khi sửa dữ liệu Supabase từ ngoài Gateway
import express from "express";
import { isAdmin } from "./macro.js";
import { notifyOps } from "../market/alerts.js";
import { BOOTSTRAP_KV } from "../market/store/localBootstrap.js";

export const EGRESS_KV = "ops:egress";

export function createDbBudgetRouter({ getStore, meter, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let warehouse = null, local = null, bootstrap = null;
    try { warehouse = getStore().warehouseInfo?.() ?? null; } catch { /* store chưa sẵn sàng */ }
    // M0: kho cục bộ (Railway Volume) + tiến độ tự dựng lại dữ liệu.
    try { local = getStore().localInfo?.() ?? null; if (local) bootstrap = (await getStore().getKv(BOOTSTRAP_KV))?.value ?? null; } catch { /* bỏ qua */ }
    res.json({ supabaseEgress: meter.snapshot(), warehouse, local, bootstrap });
  });
  router.post("/reset-warehouse", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    getStore().resetWarehouse?.();
    res.json({ ok: true, warehouse: getStore().warehouseInfo?.() ?? null });
  });
  return router;
}

/** Khôi phục tổng egress tháng từ KV khi khởi động, lưu lại mỗi 15 phút; ghi đĩa kho đệm mỗi 5 phút; cảnh báo Telegram. */
export function startDbBudgetPersistence({ getStore, meter, everyMs = 15 * 60_000, log = console }) {
  meter.setAlert((level, text) => { void notifyOps(`egress:${level}`, text); });
  const store = () => { try { return getStore(); } catch { return null; } };
  void (async () => {
    try {
      const s = store();
      if (s?.kind === "supabase") meter.restore((await s.getKv(EGRESS_KV))?.value ?? null);
    } catch (e) {
      log.warn?.(`[egress] không khôi phục được số đo tháng: ${e.message}`);
    }
  })();
  const save = async () => {
    const s = store();
    if (s?.kind !== "supabase") return;
    try { await s.setKv(EGRESS_KV, meter.persistable()); } catch (e) { log.warn?.(`[egress] lưu số đo: ${e.message}`); }
  };
  setInterval(save, everyMs).unref?.();
  setInterval(() => { try { store()?.flushWarehouse?.(); } catch (e) { log.warn?.(`[warehouse] ${e.message}`); } }, 5 * 60_000).unref?.();
}
