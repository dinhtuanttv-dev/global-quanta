// D0/D1 (2026-10-20) — sức khoẻ hạn mức kho dữ liệu.
//   GET  /api/health/db-budget                 egress Supabase hôm nay theo job/route/bảng, dự báo tháng, trạng thái kho đệm
//   POST /api/health/db-budget/reset-warehouse  xoá sạch kho đệm (admin) — sau khi sửa dữ liệu Supabase từ ngoài Gateway
//   GET  /api/health/db-budget/ledgers-export   xuất sổ theo dõi dạng NDJSON để sao lưu ngoài Railway (admin)
import express from "express";
import { isAdmin } from "./macro.js";
import { notifyOps } from "../market/alerts.js";
import { BOOTSTRAP_KV } from "../market/store/localBootstrap.js";
import { LEDGER_BACKUP_STATE_KV } from "../market/ledgerBackup.js";

export const EGRESS_KV = "ops:egress";

export function createDbBudgetRouter({ getStore, meter, adminToken = () => process.env.MARKET_ADMIN_TOKEN || "" }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let warehouse = null, local = null, bootstrap = null, ledgerBackup = null;
    try { warehouse = getStore().warehouseInfo?.() ?? null; } catch { /* store chưa sẵn sàng */ }
    // M0: kho cục bộ (Railway Volume) + tiến độ tự dựng lại dữ liệu.
    try { local = getStore().localInfo?.() ?? null; if (local) bootstrap = (await getStore().getKv(BOOTSTRAP_KV))?.value ?? null; } catch { /* bỏ qua */ }
    try { ledgerBackup = (await getStore().getKv(LEDGER_BACKUP_STATE_KV))?.value?.lastRun ?? null; } catch { /* bỏ qua */ }
    res.json({ supabaseEgress: meter.snapshot(), warehouse, local, bootstrap, ledgerBackup });
  });
  router.post("/reset-warehouse", (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    getStore().resetWarehouse?.();
    res.json({ ok: true, warehouse: getStore().warehouseInfo?.() ?? null });
  });
  router.get("/ledgers-export", async (req, res) => {
    if (!isAdmin(req, adminToken())) return res.status(401).json({ error: "Cần MARKET_ADMIN_TOKEN hợp lệ." });
    res.set("Cache-Control", "no-store");
    res.type("application/x-ndjson");
    const store = getStore();
    // Đọc và ghi từng khoá để không giữ cả sổ trong bộ nhớ.
    for (const prefix of ["cycles:ledger:", "alpha:snap:", "alpha:ic"]) {
      for (const key of (await store.listKv?.(prefix)) ?? []) {
        const doc = await store.getKv(key);
        if (doc) res.write(`${JSON.stringify({ key, value: doc.value, updatedAt: doc.updatedAt ?? null })}\n`);
      }
    }
    res.end();
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
