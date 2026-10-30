// Cấu trúc thị trường — tệp JSON nhỏ trên Railway Volume (bản tóm tắt toàn universe, sổ dự báo, sổ M1). Không dùng Supabase/Neon.
// 30/10/2026 (MTF v3 S7): bỏ kho nến 1 giờ — khi khởi tạo, xoá MỘT lần thư mục cũ `<dir>/h1/` (nến 1 giờ của MTF v2) nếu còn.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export function structureCacheDir(env = process.env) {
  if (env.STRUCTURE_CACHE_DIR) return env.STRUCTURE_CACHE_DIR;
  return env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/structure` : null;
}

/** Xoá thư mục nến 1 giờ cũ; trả số tệp đã xoá (0 nếu không có). */
export function pruneLegacyH1(dir, log = console) {
  const h1 = dir ? path.join(dir, "h1") : null;
  if (!h1 || !fs.existsSync(h1)) return 0;
  let files = 0, bytes = 0;
  try {
    for (const f of fs.readdirSync(h1)) { try { bytes += fs.statSync(path.join(h1, f)).size; files++; } catch { /* bỏ qua */ } }
    fs.rmSync(h1, { recursive: true, force: true });
    log.info?.(`[structure] đã xoá kho nến 1 giờ cũ: ${files} tệp, ${Math.round(bytes / 1024)} KB`);
  } catch (e) { log.warn?.(`[structure] xoá kho nến 1 giờ cũ lỗi: ${e.message}`); }
  return files;
}

/** @returns {{ readJson(name): Promise<any>, writeJson(name, value): Promise<boolean>, stats(): object }} */
export function createStructureDisk({ dir = structureCacheDir(), log = console } = {}) {
  const stats = { diskWrites: 0, diskErrors: 0, prunedH1: 0 };
  let disk = false;
  if (dir) {
    try { fs.mkdirSync(dir, { recursive: true }); disk = true; stats.prunedH1 = pruneLegacyH1(dir, log); }
    catch (e) { log.warn?.(`[structure] không dùng được ${dir}: ${e.message} — không lưu đĩa.`); }
  }
  return {
    stats: () => ({ ...stats, disk, dir: disk ? dir : null }),
    async readJson(name) {
      if (!disk) return null;
      try { return JSON.parse(zlib.gunzipSync(await fs.promises.readFile(path.join(dir, `${name}.json.gz`))).toString("utf8")); } catch { return null; }
    },
    async writeJson(name, value) {
      if (!disk) return false;
      try { await fs.promises.writeFile(path.join(dir, `${name}.json.gz`), zlib.gzipSync(JSON.stringify(value))); stats.diskWrites++; return true; }
      catch (e) { stats.diskErrors++; log.warn?.(`[structure] ghi ${name} lỗi: ${e.message}`); return false; }
    },
  };
}
