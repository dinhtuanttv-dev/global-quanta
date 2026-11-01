// Sao lưu sổ theo dõi ra ngoài Railway (Upstash Redis): mỗi ngày đẩy các khoá mới hoặc đã đổi, đọc lại để xác nhận rồi mới ghi nhận.
// Giá trị nén gzip + base64. Khôi phục chỉ nạp khoá đang thiếu trên kho, không bao giờ ghi đè dữ liệu đang có.
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { notifyOps } from "./alerts.js";

export const LEDGER_BACKUP_PREFIXES = Object.freeze(["cycles:ledger:", "alpha:snap:", "alpha:ic"]);
export const LEDGER_BACKUP_STATE_KV = "local:ledger-backup";
const REMOTE = (key) => `gq:ledger:${key}`;
const MAX_BYTES = 900_000; // dưới giới hạn một yêu cầu của gói miễn phí

export const packValue = (doc) => gzipSync(Buffer.from(JSON.stringify(doc))).toString("base64");
export const unpackValue = (s) => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8"));
const hashOf = (doc) => createHash("sha256").update(JSON.stringify(doc.value)).digest("hex");

export function createLedgerBackup({ store, url = process.env.LEDGER_BACKUP_REDIS_URL, token = process.env.LEDGER_BACKUP_REDIS_TOKEN, fetchImpl = globalThis.fetch, now = Date.now, notify = notifyOps }) {
  async function redis(command) {
    const r = await fetchImpl(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(command) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`Upstash ${command[0]}: ${j.error ?? r.status}`);
    return j.result;
  }
  async function keys() {
    const all = [];
    for (const p of LEDGER_BACKUP_PREFIXES) all.push(...((await store.listKv?.(p)) ?? []));
    return all;
  }
  return {
    async backup() {
      if (!url || !token) return { skipped: "chưa cấu hình LEDGER_BACKUP_REDIS_URL/TOKEN" };
      const state = (await store.getKv(LEDGER_BACKUP_STATE_KV))?.value ?? { hashes: {} };
      let sent = 0, unchanged = 0, bytes = 0;
      const failed = [];
      const all = await keys();
      for (const key of all) {
        const doc = await store.getKv(key);
        if (!doc) continue;
        const h = hashOf(doc);
        if (state.hashes[key] === h) { unchanged++; continue; }
        const body = packValue({ value: doc.value, updatedAt: doc.updatedAt ?? null });
        if (body.length > MAX_BYTES) { failed.push(`${key}: ${body.length} byte vượt giới hạn`); continue; }
        try {
          await redis(["SET", REMOTE(key), body]);
          // Chỉ ghi nhận khi đọc lại đúng nội dung vừa gửi.
          if ((await redis(["GET", REMOTE(key)])) !== body) throw new Error("đọc lại không khớp");
          state.hashes[key] = h; sent++; bytes += body.length;
        } catch (e) { failed.push(`${key}: ${e.message}`); }
      }
      state.lastRun = { at: new Date(now()).toISOString(), keys: all.length, sent, unchanged, bytes, failed: failed.length };
      await store.setKv(LEDGER_BACKUP_STATE_KV, state);
      if (failed.length) {
        void notify("ledger-backup", `Sao lưu sổ theo dõi lỗi ${failed.length} khoá: ${failed.slice(0, 3).join("; ")}`);
        throw new Error(`Sao lưu lỗi ${failed.length} khoá: ${failed[0]}`);
      }
      return state.lastRun;
    },
    /** Nạp từ bản sao các khoá đang thiếu trên kho. Không ghi đè. */
    async restoreMissing() {
      if (!url || !token) return { skipped: "chưa cấu hình LEDGER_BACKUP_REDIS_URL/TOKEN" };
      const restored = [];
      let cursor = "0", seen = 0;
      do {
        const [next, batch] = await redis(["SCAN", cursor, "MATCH", REMOTE("*"), "COUNT", 200]);
        cursor = next;
        for (const remote of batch) {
          seen++;
          const key = remote.slice(REMOTE("").length);
          if (await store.getKv(key)) continue;
          const doc = unpackValue(await redis(["GET", remote]));
          await store.setKv(key, doc.value);
          restored.push(key);
        }
      } while (String(cursor) !== "0");
      return { remote: seen, restored };
    },
  };
}

export const LEDGER_BACKUP_SCHEDULE = [{ name: "backupLedgers", at: "17:10", tradingDayOnly: false }];
