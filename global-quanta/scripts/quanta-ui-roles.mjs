#!/usr/bin/env node
// QUANTA UI v2 — codemod THEO VAI TRÒ (U3, 28/11/2026). Sửa lỗi của U1: U1 đổi màu theo MÀU (vàng -> xanh) nên mọi chữ vàng
// (mã cổ phiếu, tiêu đề, số nhấn) thành CHỮ XANH. Chuẩn thật của tab TỔNG QUAN (đo trên trang: 0 chữ xanh, 269/269 mã trắng):
//   - Xanh là VẠCH, không phải màu chữ: gạch chân tab đang chọn, vạch trong nút phân đoạn, viền focus, viền chip đang bật, hàng đang mở.
//   - Mã cổ phiếu, tiêu đề, số nhấn: TRẮNG (--q-text). Tag trạng thái: viền trung tính + chữ xám (màu ý nghĩa chỉ ở biểu tượng nhỏ).
//   - Chữ xanh CHỈ ở: nút / chip đang bật có nền xanh nhạt (aria-pressed, như .scan-tool), liên kết thật (.ov-link).
// Quy tắc áp cho từng CHUỖI className (literal "…" / '…'): chuỗi có nền xanh nhạt (bg-q-accent/…) = nút đang bật -> giữ nguyên.
// Bỏ qua: tệp miễn trừ (src/styles/ui-exempt.json), thư mục khoá, dòng vẽ biểu đồ, và các dòng trong SKIP_NEEDLES (chú giải biểu đồ, thanh dữ liệu).
//   node scripts/quanta-ui-roles.mjs <thư mục trong src> [...] [--write]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const exempt = JSON.parse(fs.readFileSync(path.join(SRC, "styles", "ui-exempt.json"), "utf8"));
const SKIP_FILES = new Set((exempt.files ?? []).map((f) => path.join(SRC, f)));
const LOCKED = (exempt.lockedDirs ?? []).map((d) => path.join(SRC, d));
const CHART_LINE = /\bfill=|\bstroke=|fillStyle|strokeStyle|<circle|<path|<rect|<line\b|<text\b|polyline|polygon|ui-exempt/;
/** Dòng là chú giải / thanh dữ liệu của biểu đồ (màu chuỗi phải khớp biểu đồ) — giữ nguyên. */
const SKIP_NEEDLES = ["hover.ribbon.kind", "inline-block h-0.5 w-4 bg-cyan-300", "inline-block h-1.5 rounded bg-cyan-400/70", "h-1.5 w-5 rounded ${x.ok ? \"bg-cyan-300/80\""];
// Nền xanh nhạt THƯỜNG TRỰC (không phải hover:bg-…) = nút đang bật.
const PRESSED = /(?<![\w:-])bg-q-accent\/|(?<![\w:-])bg-\[#4f8ef7\]\//;

function roleLiteral(s) {
  if (PRESSED.test(s)) return s; // nút / chip đang bật (nền xanh nhạt): đúng chuẩn .scan-tool[aria-pressed]
  return s
    // chữ xanh nhấn -> trắng
    .replace(/\bhover:text-(?:q-accent(?:-strong)?|\[#79a8ff\]|\[#4f8ef7\]|sky-\d{2,3}|cyan-\d{2,3})\b/g, "hover:text-q-text")
    .replace(/(^|[\s"'`])text-q-accent-strong(\/\d+)?(?=[\s"'`]|$)/g, "$1text-q-text$2")
    .replace(/(^|[\s"'`])text-q-accent(?=[\s"'`]|$)/g, "$1text-q-text")
    .replace(/(^|[\s"'`])text-\[#(?:79a8ff|4f8ef7)\]/g, "$1text-q-text")
    // xanh trời / xanh lơ làm chữ -> trắng (100–200) hoặc xám nhạt (300–400)
    .replace(/(^|[\s"'`])text-(?:sky|cyan)-(?:50|100|200)(\/[\d.]+)?(?=[\s"'`]|$)/g, "$1text-q-text")
    .replace(/(^|[\s"'`])text-(?:sky|cyan)-(?:300|400|500)(\/[\d.]+)?(?=[\s"'`]|$)/g, "$1text-q-text-2")
    // viền / nền xanh trời, xanh lơ của tag -> trung tính (như .scan-sig)
    .replace(/\bhover:border-(?:sky|cyan)-\d{2,3}(?:\/[\d.]+)?/g, "hover:border-white/30")
    .replace(/(^|[\s"'`])border-(?:sky|cyan)-\d{2,3}(?:\/[\d.]+)?(?=[\s"'`]|$)/g, "$1border-white/15")
    .replace(/\bhover:bg-(?:sky|cyan)-\d{2,3}(?:\/[\d.]+)?/g, "hover:bg-white/10")
    .replace(/(^|[\s"'`])bg-(?:sky|cyan)-\d{2,3}(?:\/(?:[\d.]+|\[[\d.]+\]))?(?=[\s"'`]|$)/g, "$1bg-white/5")
    .replace(/\bring-cyan-\d{2,3}\b/g, "ring-q-accent").replace(/\baccent-cyan-\d{2,3}\b/g, "accent-q-accent")
    // nút viền xanh lặp mỗi dòng ("Chu kỳ →") -> nút trung tính (.ov-btn)
    .replace(/\bhover:border-\[#4f8ef7\]\/\d+/g, "hover:border-white/30").replace(/\bhover:bg-\[#4f8ef7\]\/\d+/g, "hover:bg-white/5")
    .replace(/(^|[\s"'`])border-\[#4f8ef7\]\/\d+/g, "$1border-white/15")
    // vạch xanh trang trí bên trái thẻ -> trung tính
    .replace(/\bborder-l-\[#4f8ef7\]/g, "border-l-white/20");
}

function walk(d, out = []) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) { if (!LOCKED.includes(p) && f !== "__snapshots__") walk(p, out); } else if (/\.tsx$/.test(f) && !/\.test\.tsx$/.test(f)) out.push(p); } return out; }

const WRITE = process.argv.includes("--write");
const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!dirs.length) { console.error("cần ít nhất một thư mục trong src"); process.exit(2); }
const stats = { files: 0, lines: 0 };
for (const dir of dirs) for (const f of walk(path.join(SRC, dir))) {
  if (SKIP_FILES.has(f) || LOCKED.some((d) => f.startsWith(d))) continue;
  const raw = fs.readFileSync(f, "utf8"), crlf = raw.includes("\r\n");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let changed = false;
  lines.forEach((line, i) => {
    if (CHART_LINE.test(line) || SKIP_NEEDLES.some((n) => line.includes(n))) return;
    const next = line.replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, (lit) => roleLiteral(lit))
      // style inline: color: "var(--q-accent…)" (kể cả nhánh đúng của toán tử ?:) -> trắng; viền thẻ xanh 1px -> trung tính.
      .replace(/(\bcolor:\s*(?:[^,{}]*?\?\s*)?)(["'])var\(--q-accent(?:-strong)?\)\2/g, "$1$2var(--q-text)$2")
      .replace(/(\bborder:\s*)(["'])1px solid var\(--q-accent\)\2/g, "$1$21px solid var(--q-line-3)$2");
    if (next !== line) { lines[i] = next; changed = true; stats.lines++; }
  });
  if (changed) { stats.files++; if (WRITE) fs.writeFileSync(f, crlf ? lines.join("\r\n") : lines.join("\n")); }
}
console.log(`tệp đổi ${stats.files} · dòng đổi ${stats.lines}${WRITE ? "" : " (chạy thử)"}`);
