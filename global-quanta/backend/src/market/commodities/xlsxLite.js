// Bộ đọc .xlsx tối giản (chỉ đọc giá trị ô) — đủ cho World Bank Pink Sheet. Không thêm dependency: gói `xlsx` trên npm (0.18.x)
// có lỗ hổng đã biết. Hỗ trợ: zip (stored / deflate), sharedStrings, chuỗi inline, số; KHÔNG hỗ trợ công thức chưa lưu giá trị,
// zip64, mã hoá.
import { inflateRawSync } from "node:zlib";

/** Đọc mục lục zip -> Map(tên -> Buffer đã giải nén). `only` = lọc tên cần (tiết kiệm bộ nhớ). */
export function readZip(buf, only = null) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("xlsx: không tìm thấy mục lục zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("xlsx: mục lục zip hỏng");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (only && !only(name)) continue;
    const lnlen = buf.readUInt16LE(local + 26), lxlen = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data));
    else throw new Error(`xlsx: kiểu nén ${method} không hỗ trợ`);
  }
  return out;
}

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const textOf = (xml) => decode([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

/** Cột Excel ("A", "AB") -> chỉ số 0. */
export const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

/** Trả { [tên sheet]: rows (mảng mảng giá trị: number | string | null) } cho các sheet trong `sheets` (null = tất cả). */
export function readXlsx(buf, sheets = null) {
  const zip = readZip(buf, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || n.startsWith("xl/worksheets/sheet"));
  const wb = zip.get("xl/workbook.xml")?.toString("utf8");
  const rels = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!wb || !rels) throw new Error("xlsx: thiếu workbook");
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
  const ss = zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]+)"/.exec(m[0])?.[1] ?? "");
    if (sheets && !sheets.includes(name)) continue;
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const path = "xl/" + String(target.get(rid) ?? "").replace(/^\/?xl\//, "");
    const xml = zip.get(path)?.toString("utf8");
    if (!xml) continue;
    const rows = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const ri = Number(/r="(\d+)"/.exec(r[1])?.[1]) - 1;
      const row = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
        if (!ref) continue;
        const t = /t="([^"]+)"/.exec(c[1])?.[1];
        const body = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let val = null;
        if (t === "s") val = v != null ? shared[Number(v)] ?? null : null;
        else if (t === "inlineStr") val = textOf(body);
        else if (t === "str" || t === "e") val = v != null ? decode(v) : null;
        else if (t === "b") val = v === "1";
        else if (v != null && v !== "") { const n = Number(v); val = Number.isFinite(n) ? n : decode(v); }
        row[colIndex(ref)] = val;
      }
      rows[ri] = row;
    }
    out[name] = Array.from(rows, (r) => (r ? Array.from(r, (x) => x ?? null) : []));
  }
  return out;
}
