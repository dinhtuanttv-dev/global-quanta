// D1 (2026-10-20) — kho đệm phân vùng hai tầng cho dữ liệu đọc từ Supabase: RAM (giới hạn byte, LRU) -> đĩa
// (Railway Volume, MARKET_WAREHOUSE_DIR) -> Supabase. Khởi động lại / deploy không phải đọc lại lịch sử từ Supabase.
//
// Đúng dữ liệu là ưu tiên số 1:
//   - Phân vùng chỉ chứa đúng dòng Supabase trả về (không tự tính lại giá trị nào).
//   - Mọi lần GHI của tiến trình đánh dấu phần bị ảnh hưởng là "bẩn" TRƯỚC khi gửi lệnh ghi; lần đọc sau tải lại đúng phần đó.
//   - Dấu bẩn được ghi đồng bộ vào nhật ký (journal) trên đĩa trước lệnh ghi -> tiến trình chết trước khi phân vùng kịp ghi
//     ra đĩa thì lần khởi động sau vẫn áp dụng dấu khi nạp phân vùng (write-ahead).
//   - Định dạng đổi (FORMAT) -> xoá sạch bản đĩa cũ.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

const FORMAT = 1;
const MB = 1024 * 1024;
const SEP = "\u0001";
const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`);

export function createWarehouse({ dir = null, ramMb = 96, log = console } = {}) {
  const ram = new Map(); // id -> { value, bytes }   (thứ tự chèn = LRU)
  let ramBytes = 0;
  const codecs = new Map(); // ns -> { encode, decode, size, applyMarks }
  const pendingWrites = new Map(); // id -> timer
  const stats = { ramHits: 0, diskHits: 0, misses: 0, diskWrites: 0, evictions: 0, diskErrors: 0 };
  let journal = new Map(); // id -> Set(token) — dấu còn lại từ lần chạy trước
  let enabledDisk = false;

  const id = (ns, key) => `${ns}${SEP}${key}`;
  const split = (k) => k.split(SEP);
  const fileKey = (key) => { const s = safe(key); return s.length <= 120 ? s : `h-${createHash("sha1").update(String(key)).digest("hex")}`; };
  const fileOf = (ns, key) => path.join(dir, safe(ns), `${fileKey(key)}.json.gz`);
  const journalFile = () => path.join(dir, "journal.log");

  if (dir) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const manifest = path.join(dir, "manifest.json");
      let fmt = null;
      try { fmt = JSON.parse(fs.readFileSync(manifest, "utf8")).format; } catch { /* chưa có */ }
      if (fmt !== FORMAT) {
        for (const e of fs.readdirSync(dir)) if (e !== "manifest.json") fs.rmSync(path.join(dir, e), { recursive: true, force: true });
        fs.writeFileSync(manifest, JSON.stringify({ format: FORMAT, createdAt: new Date().toISOString() }));
      }
      journal = readJournal();
      enabledDisk = true;
    } catch (e) {
      log.warn?.(`[warehouse] không dùng được thư mục ${dir}: ${e.message} — chỉ đệm RAM.`);
    }
  }

  function readJournal() {
    const m = new Map();
    let text = "";
    try { text = fs.readFileSync(journalFile(), "utf8"); } catch { return m; }
    for (const line of text.split("\n")) {
      const [ns, key, token = ""] = line.split("\t");
      if (!ns || key === undefined) continue;
      const k = id(ns, key);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(token);
    }
    return m;
  }

  /** codec: encode(value)->JSON, decode(JSON)->value, size(value)->byte ước lượng, applyMarks(value, tokens)->value. */
  function register(ns, codec) {
    codecs.set(ns, { encode: (v) => v, decode: (v) => v, size: (v) => JSON.stringify(v).length, applyMarks: null, pinned: false, ...codec });
  }

  function evict() {
    const cap = ramMb * MB;
    for (const [k, entry] of ram) {
      if (ramBytes <= cap) break;
      if (codecs.get(split(k)[0])?.pinned) continue; // dấu thế hệ: luôn giữ trong RAM
      if (pendingWrites.has(k)) flushOne(k); // ghi đĩa trước khi bỏ khỏi RAM
      ram.delete(k);
      ramBytes -= entry.bytes;
      stats.evictions += 1;
    }
  }

  function setRam(k, value, bytes) {
    const old = ram.get(k);
    if (old) { ram.delete(k); ramBytes -= old.bytes; }
    ram.set(k, { value, bytes });
    ramBytes += bytes;
  }

  /** Trả giá trị hoặc undefined (RAM -> đĩa). */
  function get(ns, key) {
    const k = id(ns, key);
    const hit = ram.get(k);
    if (hit) { ram.delete(k); ram.set(k, hit); stats.ramHits += 1; return hit.value; }
    if (!enabledDisk) { stats.misses += 1; return undefined; }
    const codec = codecs.get(ns);
    let value;
    try {
      value = codec.decode(JSON.parse(zlib.gunzipSync(fs.readFileSync(fileOf(ns, key))).toString("utf8")));
    } catch (e) {
      if (e.code !== "ENOENT") { stats.diskErrors += 1; log.warn?.(`[warehouse] đọc ${ns}/${key}: ${e.message}`); }
      journal.delete(k); // không có bản đĩa -> lần đọc sau tải từ Supabase, dấu cũ không còn ý nghĩa
      stats.misses += 1;
      return undefined;
    }
    stats.diskHits += 1;
    const tokens = journal.get(k);
    if (tokens) {
      journal.delete(k);
      if (!codec.applyMarks) { drop(ns, key); return undefined; }
      value = codec.applyMarks(value, [...tokens]);
      put(ns, key, value, { delayMs: 0 });
      return value;
    }
    setRam(k, value, codec.size(value));
    evict();
    return value;
  }

  function flushOne(k) {
    clearTimeout(pendingWrites.get(k));
    pendingWrites.delete(k);
    const entry = ram.get(k);
    if (!entry || !enabledDisk) return;
    const [ns, key] = split(k);
    try {
      const file = fileOf(ns, key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(codecs.get(ns).encode(entry.value)), { level: 6 }));
      fs.renameSync(tmp, file);
      stats.diskWrites += 1;
    } catch (e) {
      stats.diskErrors += 1;
      log.warn?.(`[warehouse] ghi ${ns}/${key}: ${e.message}`);
    }
  }

  /** Lưu: RAM ngay, đĩa sau `delayMs` (gộp nhiều lần sửa liên tiếp). */
  function put(ns, key, value, { delayMs = 2_000 } = {}) {
    const k = id(ns, key);
    setRam(k, value, codecs.get(ns).size(value));
    if (enabledDisk) {
      clearTimeout(pendingWrites.get(k));
      const t = setTimeout(() => flushOne(k), delayMs);
      t.unref?.();
      pendingWrites.set(k, t);
    }
    evict();
  }

  /** Lưu và ghi đĩa NGAY (đồng bộ) — cho dấu hiệu phải bền trước lệnh ghi Supabase. */
  function putSync(ns, key, value) {
    const k = id(ns, key);
    setRam(k, value, codecs.get(ns).size(value));
    flushOne(k);
  }

  function drop(ns, key) {
    const k = id(ns, key);
    const old = ram.get(k);
    if (old) { ram.delete(k); ramBytes -= old.bytes; }
    clearTimeout(pendingWrites.get(k));
    pendingWrites.delete(k);
    journal.delete(k);
    if (enabledDisk) { try { fs.rmSync(fileOf(ns, key), { force: true }); } catch { /* bỏ qua */ } }
  }

  function dropNs(ns) {
    for (const k of [...ram.keys(), ...pendingWrites.keys(), ...journal.keys()]) {
      const [n, key] = split(k);
      if (n === ns) drop(ns, key);
    }
    if (enabledDisk) { try { fs.rmSync(path.join(dir, safe(ns)), { recursive: true, force: true }); } catch { /* bỏ qua */ } }
  }

  /** Ghi đồng bộ dấu bẩn vào nhật ký trên đĩa TRƯỚC lệnh ghi Supabase. entries: [[ns, key, token]].
   *  Nơi gọi tự áp dụng dấu vào phân vùng trong RAM rồi put lại; nhật ký chỉ cần khi tiến trình chết trước khi
   *  phân vùng được ghi ra đĩa. */
  function journalAppend(entries) {
    if (!entries.length || !enabledDisk) return;
    try {
      fs.appendFileSync(journalFile(), entries.map(([ns, key, token]) => `${ns}\t${key}\t${token ?? ""}`).join("\n") + "\n");
    } catch (e) {
      stats.diskErrors += 1;
      log.warn?.(`[warehouse] ghi nhật ký: ${e.message}`);
    }
  }

  /** Áp dụng nốt dấu nhật ký của lần chạy trước, ghi mọi phân vùng chờ ra đĩa rồi cắt nhật ký
   *  (lúc này mọi dấu đã nằm trong phân vùng trên đĩa). Gọi định kỳ và khi tắt tiến trình. */
  function flushAll() {
    for (const k of [...journal.keys()]) { const [ns, key] = split(k); if (codecs.has(ns)) get(ns, key); }
    for (const k of [...pendingWrites.keys()]) flushOne(k);
    if (!enabledDisk) return;
    const leftover = [...journal.keys()].filter((k) => !codecs.has(split(k)[0]));
    if (leftover.length === 0) {
      try { fs.rmSync(journalFile(), { force: true }); } catch { /* bỏ qua */ }
      journal.clear();
    }
  }

  function info() {
    return { disk: enabledDisk, ramMb: Math.round((ramBytes / MB) * 10) / 10, ramCapMb: ramMb, entries: ram.size, journalPending: journal.size, ...stats };
  }

  return { register, get, put, putSync, drop, dropNs, journalAppend, flushAll, info, diskEnabled: () => enabledDisk };
}
