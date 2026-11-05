// Mã hoá ngữ cảnh thư viện Cycle Fingerprint (lịch, chuỗi, thư viện cửa sổ) thành một khối nhị phân để lưu trên Railway Volume.
// Mảng có kiểu (Float32/Float64/Int32/Int16/Uint8) được ghi nguyên byte, không chuyển qua JSON, nên đọc lại cho đúng từng bit
// và nhanh: khởi động lại chỉ cần đọc file thay vì dựng lại thư viện từ kho (~40 giây). Map giữ nguyên thứ tự; NaN/±∞ được giữ.
//   Bố cục: "GQCY" | u32 phiên bản | u32 độ dài JSON | JSON (UTF-8) | đệm tới bội 8 | các khối byte nối tiếp (mỗi khối bội 8).
const MAGIC = 0x59435147; // "GQCY" little-endian
export const CODEC_VERSION = 1;
const TYPED = { Float64Array, Float32Array, Int32Array, Int16Array, Uint8Array, Uint16Array, Uint32Array, Int8Array };
const pad8 = (n) => (n + 7) & ~7;

/** Mã hoá. `meta` là thông tin đầu file (cấu hình, ngày dữ liệu) để kiểm tra trước khi giải mã phần lớn. */
export function encodeCtx(ctx, meta = {}) {
  const blobs = [];
  let offset = 0;
  const walk = (v) => {
    if (v == null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : { $n: String(v) };
    if (ArrayBuffer.isView(v)) {
      const name = v.constructor.name;
      if (!TYPED[name]) throw new Error(`Không mã hoá được ${name}`);
      const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      const ref = { $ta: name, o: offset, n: v.length };
      blobs.push(bytes); offset += pad8(bytes.byteLength);
      return ref;
    }
    if (v instanceof Map) return { $map: [...v].map(([k, x]) => [walk(k), walk(x)]) };
    if (v instanceof Set) return { $set: [...v].map(walk) };
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    throw new Error(`Không mã hoá được kiểu ${typeof v}`);
  };
  const json = Buffer.from(JSON.stringify({ meta, body: walk(ctx) }), "utf8");
  const head = 12, start = pad8(head + json.length);
  const out = Buffer.alloc(start + offset);
  out.writeUInt32LE(MAGIC, 0); out.writeUInt32LE(CODEC_VERSION, 4); out.writeUInt32LE(json.length, 8);
  json.copy(out, head);
  let at = start;
  for (const b of blobs) { out.set(b, at); at += pad8(b.byteLength); }
  return out;
}

/** Chỉ đọc phần đầu (meta) để quyết định có dùng file hay không. */
export function readCtxMeta(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== MAGIC) throw new Error("File thư viện Cycle không hợp lệ.");
  if (buf.readUInt32LE(4) !== CODEC_VERSION) throw new Error("Phiên bản file thư viện Cycle không khớp.");
  const n = buf.readUInt32LE(8);
  return JSON.parse(buf.subarray(12, 12 + n).toString("utf8")).meta;
}

/** Giải mã. Mảng có kiểu được sao ra bộ nhớ riêng, căn đúng biên, không giữ tham chiếu tới buffer đầu vào. */
export function decodeCtx(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== MAGIC) throw new Error("File thư viện Cycle không hợp lệ.");
  if (buf.readUInt32LE(4) !== CODEC_VERSION) throw new Error("Phiên bản file thư viện Cycle không khớp.");
  const n = buf.readUInt32LE(8), start = pad8(12 + n);
  const { meta, body } = JSON.parse(buf.subarray(12, 12 + n).toString("utf8"));
  const walk = (v) => {
    if (v == null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    if ("$n" in v) return Number(v.$n);
    if ("$ta" in v) {
      const T = TYPED[v.$ta];
      const bytes = v.n * T.BYTES_PER_ELEMENT, copy = new ArrayBuffer(bytes);
      new Uint8Array(copy).set(buf.subarray(start + v.o, start + v.o + bytes));
      return new T(copy);
    }
    if ("$map" in v) return new Map(v.$map.map(([k, x]) => [walk(k), walk(x)]));
    if ("$set" in v) return new Set(v.$set.map(walk));
    const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o;
  };
  return { meta, ctx: walk(body) };
}
