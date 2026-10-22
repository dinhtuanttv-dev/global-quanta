// M0 (2026-10-22) — tầng đĩa cho kho cục bộ: mỗi "đoạn" là một tệp JSON nén gzip trên Railway Volume.
//   - Ghi NGUYÊN TỬ: ghi tệp tạm rồi rename (tiến trình chết giữa chừng không để lại tệp hỏng).
//   - Ghi gom (debounce) theo đoạn: nhiều lần sửa liên tiếp (VD dòng lệnh theo phút) chỉ ghi đĩa một lần.
//   - Đệm RAM LRU giới hạn theo BYTE (ước lượng = độ dài JSON) — đoạn bẩn không bị đẩy ra trước khi ghi xong.
// Không có thư mục (chạy local/test không gắn volume) -> chỉ RAM, hành vi giống memoryStore.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const MB = 1024 * 1024;
export const safeName = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
export const unsafeName = (s) => s.replace(/%([0-9a-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

export function createSegments({ dir = null, ramMb = 96, flushMs = 2_000, log = console } = {}) {
  const ram = new Map(); // id -> { value, bytes, dirty }
  let ramBytes = 0;
  const timers = new Map();
  const stats = { reads: 0, ramHits: 0, diskReads: 0, diskWrites: 0, errors: 0, evictions: 0 };
  let disk = false;
  if (dir) {
    try { fs.mkdirSync(dir, { recursive: true }); disk = true; } catch (e) { log.warn?.(`[local-store] không dùng được ${dir}: ${e.message} — chỉ RAM.`); }
  }
  const fileOf = (id) => path.join(dir, ...id.split("/").map(safeName)) + ".json.gz";
  const size = (v) => { try { return JSON.stringify(v)?.length ?? 0; } catch { return 0; } };

  function touch(id, entry) {
    if (ram.has(id)) ramBytes -= ram.get(id).bytes;
    ram.delete(id); ram.set(id, entry); ramBytes += entry.bytes;
    if (ramBytes <= ramMb * MB) return;
    for (const [k, e] of ram) {
      if (ramBytes <= ramMb * MB * 0.8) break;
      if (e.dirty || !disk) continue; // không có đĩa: RAM là nơi lưu duy nhất -> không được đẩy ra
      ram.delete(k); ramBytes -= e.bytes; stats.evictions++;
    }
  }

  function readDisk(id) {
    if (!disk) return undefined;
    try {
      const v = JSON.parse(zlib.gunzipSync(fs.readFileSync(fileOf(id))).toString("utf8"));
      stats.diskReads++;
      return v;
    } catch (e) {
      if (e.code !== "ENOENT") { stats.errors++; log.warn?.(`[local-store] đọc ${id} lỗi: ${e.message}`); }
      return undefined;
    }
  }

  function writeNow(id) {
    timers.delete(id);
    const e = ram.get(id);
    if (!e || !e.dirty) return;
    e.dirty = false;
    if (!disk) return;
    const file = fileOf(id), tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (e.value === undefined) { fs.rmSync(file, { force: true }); }
      else { fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(e.value), { level: 6 })); fs.renameSync(tmp, file); }
      stats.diskWrites++;
    } catch (err) {
      e.dirty = true; stats.errors++;
      log.warn?.(`[local-store] ghi ${id} lỗi: ${err.message}`);
    }
  }

  return {
    disk: () => disk,
    /** Giá trị của đoạn (undefined nếu chưa có). Trả THAM CHIẾU — nơi gọi sửa rồi gọi put/markDirty. */
    get(id) {
      stats.reads++;
      const e = ram.get(id);
      if (e) { stats.ramHits++; touch(id, e); return e.value; }
      const v = readDisk(id);
      if (v !== undefined) touch(id, { value: v, bytes: size(v), dirty: false });
      return v;
    },
    put(id, value, { sync = false } = {}) {
      touch(id, { value, bytes: size(value), dirty: true });
      if (sync) { clearTimeout(timers.get(id)); writeNow(id); return; }
      if (!timers.has(id)) timers.set(id, setTimeout(() => writeNow(id), flushMs).unref?.() ?? null);
    },
    remove(id) { this.put(id, undefined, { sync: true }); ram.delete(id); },
    /** Liệt kê id con trực tiếp của một thư mục logic (VD "md" -> các ngày). */
    list(prefix) {
      const fromRam = [...ram.keys()].filter((k) => k.startsWith(`${prefix}/`) && ram.get(k).value !== undefined).map((k) => k.slice(prefix.length + 1)).filter((k) => !k.includes("/"));
      if (!disk) return [...new Set(fromRam)].sort();
      let names = [];
      try { names = fs.readdirSync(path.join(dir, ...prefix.split("/").map(safeName))).filter((f) => f.endsWith(".json.gz")).map((f) => unsafeName(f.slice(0, -8))); } catch { /* chưa có */ }
      return [...new Set([...names, ...fromRam])].sort();
    },
    listDirs(prefix) {
      if (!disk) return [...new Set([...ram.keys()].filter((k) => k.startsWith(`${prefix}/`)).map((k) => k.slice(prefix.length + 1).split("/")[0]))].sort();
      try { return fs.readdirSync(path.join(dir, ...prefix.split("/").map(safeName)), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => unsafeName(d.name)).sort(); } catch { return []; }
    },
    flushAll() { for (const id of [...timers.keys()]) { clearTimeout(timers.get(id)); writeNow(id); } for (const [id, e] of ram) if (e.dirty) writeNow(id); },
    stats() {
      let bytesOnDisk = null;
      if (disk) {
        bytesOnDisk = 0;
        const walk = (p) => { for (const d of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, d.name); if (d.isDirectory()) walk(f); else bytesOnDisk += fs.statSync(f).size; } };
        try { walk(dir); } catch { /* bỏ qua */ }
      }
      return { ...stats, disk, dir: disk ? dir : null, ramMb: Math.round((ramBytes / MB) * 10) / 10, ramEntries: ram.size, diskMb: bytesOnDisk == null ? null : Math.round((bytesOnDisk / MB) * 10) / 10, pendingWrites: timers.size };
    },
  };
}
