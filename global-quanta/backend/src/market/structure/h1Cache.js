// Cấu trúc đa khung (T4) — kho nến 1 GIỜ DANH NGHĨA theo phiên đã đóng, trên Railway Volume (không dùng Supabase/Neon).
// Phiên đã đóng không đổi -> chỉ tải từ SSI phiên còn thiếu (thường 1 phiên/ngày). Hệ số điều chỉnh áp lúc đọc
// (sự kiện quyền mới làm đổi hệ số của phiên cũ, nên kho chỉ giữ giá danh nghĩa).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export function structureCacheDir(env = process.env) {
  if (env.STRUCTURE_CACHE_DIR) return env.STRUCTURE_CACHE_DIR;
  return env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/structure` : null;
}

/** @returns {{ get(symbol): Promise<Record<string, Bar[]>>, put(symbol, days): Promise<void>, readJson, writeJson, stats }} */
export function createH1Cache({ dir = structureCacheDir(), maxRamSymbols = 120, log = console } = {}) {
  const ram = new Map(); // symbol -> { day -> bars } (LRU theo thứ tự chèn)
  const stats = { ramHits: 0, diskHits: 0, misses: 0, diskWrites: 0, diskErrors: 0 };
  let disk = false;
  if (dir) {
    try { fs.mkdirSync(path.join(dir, "h1"), { recursive: true }); disk = true; }
    catch (e) { log.warn?.(`[structure] không dùng được ${dir}: ${e.message} — chỉ đệm RAM.`); }
  }
  const fileOf = (symbol) => path.join(dir, "h1", `${symbol.replace(/[^A-Z0-9]/g, "")}.json.gz`);
  const touch = (symbol, v) => {
    ram.delete(symbol); ram.set(symbol, v);
    while (ram.size > maxRamSymbols) ram.delete(ram.keys().next().value);
  };

  return {
    stats: () => ({ ...stats, disk, dir: disk ? dir : null, ramSymbols: ram.size }),
    async get(symbol) {
      if (ram.has(symbol)) { stats.ramHits++; const v = ram.get(symbol); touch(symbol, v); return v; }
      if (disk) {
        try {
          const v = JSON.parse(zlib.gunzipSync(await fs.promises.readFile(fileOf(symbol))).toString("utf8"));
          stats.diskHits++; touch(symbol, v.days ?? {}); return v.days ?? {};
        } catch { /* chưa có */ }
      }
      stats.misses++;
      return {};
    },
    async put(symbol, days) {
      touch(symbol, days);
      if (!disk) return;
      try {
        await fs.promises.writeFile(fileOf(symbol), zlib.gzipSync(JSON.stringify({ v: 1, days })));
        stats.diskWrites++;
      } catch (e) { stats.diskErrors++; log.warn?.(`[structure] ghi kho H1 ${symbol} lỗi: ${e.message}`); }
    },
    /** Tệp JSON nhỏ trong cùng thư mục (bản tóm tắt cấu trúc toàn universe). */
    async readJson(name) {
      if (!disk) return null;
      try { return JSON.parse(zlib.gunzipSync(await fs.promises.readFile(path.join(dir, `${name}.json.gz`))).toString("utf8")); } catch { return null; }
    },
    async writeJson(name, value) {
      if (!disk) return false;
      try { await fs.promises.writeFile(path.join(dir, `${name}.json.gz`), zlib.gzipSync(JSON.stringify(value))); return true; }
      catch (e) { stats.diskErrors++; log.warn?.(`[structure] ghi ${name} lỗi: ${e.message}`); return false; }
    },
  };
}
