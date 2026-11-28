#!/usr/bin/env node
// QUANTA UI v2 — ui-lint (U0, 28/11/2026, docs/quanta-ui-v2/04 §4). Quét .tsx / .css trong src/ (bỏ tệp kiểm thử) tìm dấu vết hệ giao diện cũ
// và lỗi so với quy chuẩn. Dùng NGÂN SÁCH NỢ (scripts/ui-lint-budget.json): mỗi quy tắc có trần = số hiện tại; PR chỉ được giảm, không được tăng.
//   node scripts/ui-lint.mjs            -> in bảng, thoát 1 nếu vượt ngân sách
//   node scripts/ui-lint.mjs --update   -> hạ ngân sách về số hiện tại (chỉ khi đã giảm; không bao giờ tăng)
//   node scripts/ui-lint.mjs --files    -> liệt kê vi phạm theo tệp
// Miễn trừ: tệp biểu đồ trong src/styles/ui-exempt.json; dòng có chú thích "ui-exempt" hoặc dòng sau "ui-exempt-next-line".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const BUDGET = path.join(ROOT, "scripts", "ui-lint-budget.json");

/** Quy tắc: id, mô tả, biểu thức (cờ g). Thứ tự = thứ tự in. */
export const UI_RULES = [
  { id: "legacy-gold", vi: "Vàng Quanta cũ làm màu nhấn (#E8B84B / #F5CE72)", re: /#(?:E8B84B|F5CE72)\b/gi },
  { id: "legacy-gold-var", vi: "Biến vàng hệ cũ var(--gold*)", re: /var\(--gold(?:-bright|-glow)?\)/g },
  { id: "legacy-display-font", vi: "Phông Space Grotesk / --font-display", re: /--font-display|Space Grotesk/g },
  { id: "legacy-surface-hex", vi: "Màu nền hệ cũ viết cứng", re: /#(?:0E131F|0B0F19|161D2E|1E273D|080B11)\b/gi },
  { id: "slate-surface", vi: "Nền slate Tailwind thay cho q-surface", re: /\bbg-slate-(?:800|900|950)(?:\/\d+)?\b/g },
  { id: "tiny-text", vi: "Chữ < 10px (class / CSS / inline)", re: /text-\[(?:6|7|7\.5|8|8\.5|9|9\.5)px\]|font-size:\s*(?:6|7|7\.5|8|8\.5|9|9\.5)px|fontSize:\s*["']?(?:6|7|8|9)(?:px)?["']?[,}\s]/g },
  { id: "text-10px", vi: "text-[10px] (chỉ cho lưới dày q-dense)", re: /text-\[10px\]/g },
  { id: "uppercase", vi: "Nhãn in hoa / giãn chữ", re: /\buppercase\b|\btracking-(?:wide|wider|widest)\b|text-transform:\s*uppercase/g },
  { id: "gradient", vi: "Nền gradient (ngoài biểu đồ)", re: /linear-gradient|radial-gradient|\bbg-gradient-to-/g },
  // U3 (28/11): xanh là VẠCH, không phải màu chữ (Tổng quan: 0 chữ xanh). Đếm mọi chữ xanh nhấn / xanh trời / xanh lơ trong className.
  { id: "accent-text", vi: "Chữ xanh nhấn / sky / cyan (chỉ cho nút đang bật, liên kết)", re: /(?<![\w:-])text-(?:q-accent(?:-strong)?|\[#(?:79a8ff|4f8ef7)\]|sky-\d{2,3}|cyan-\d{2,3})\b/g },
];

function loadExempt() {
  try { return JSON.parse(fs.readFileSync(path.join(SRC, "styles", "ui-exempt.json"), "utf8")); } catch { return { files: [] }; }
}

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (f !== "node_modules" && f !== "__snapshots__") walk(p, out); }
    else if (/\.(tsx|css)$/.test(f) && !/\.test\.tsx$/.test(f)) out.push(p);
  }
  return out;
}

/** Đếm vi phạm (hàm thuần trên nội dung một tệp, đã bỏ dòng miễn trừ). */
export function lintText(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept = lines.filter((l, i) => !/ui-exempt(?!-next-line)/.test(l) && !(i > 0 && /ui-exempt-next-line/.test(lines[i - 1])));
  const body = kept.join("\n");
  const out = {};
  for (const r of UI_RULES) out[r.id] = (body.match(r.re) || []).length;
  return out;
}

/** Quét toàn bộ src/: tổng theo quy tắc + chi tiết theo tệp. */
export function scanUi(srcDir = SRC) {
  const exempt = new Set((loadExempt().files ?? []).map((f) => path.join(srcDir, f)));
  const totals = Object.fromEntries(UI_RULES.map((r) => [r.id, 0]));
  const files = [];
  for (const f of walk(srcDir)) {
    if (exempt.has(f)) continue;
    const c = lintText(fs.readFileSync(f, "utf8"));
    let n = 0;
    for (const r of UI_RULES) { totals[r.id] += c[r.id]; n += c[r.id]; }
    if (n) files.push({ file: path.relative(srcDir, f).replace(/\\/g, "/"), counts: c, total: n });
  }
  files.sort((a, b) => b.total - a.total);
  return { totals, files };
}

/** So với ngân sách: danh sách quy tắc vượt trần. */
export function overBudget(totals, budget) {
  return UI_RULES.filter((r) => totals[r.id] > (budget[r.id] ?? 0)).map((r) => ({ id: r.id, vi: r.vi, now: totals[r.id], budget: budget[r.id] ?? 0 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { totals, files } = scanUi();
  const budget = fs.existsSync(BUDGET) ? JSON.parse(fs.readFileSync(BUDGET, "utf8")).budget : {};
  for (const r of UI_RULES) console.log(`${r.id.padEnd(22)} ${String(totals[r.id]).padStart(6)} / trần ${String(budget[r.id] ?? "—").padStart(6)}  ${r.vi}`);
  if (process.argv.includes("--files")) for (const f of files.slice(0, 60)) console.log(`  ${String(f.total).padStart(4)}  ${f.file}`);
  if (process.argv.includes("--update")) {
    const next = Object.fromEntries(UI_RULES.map((r) => [r.id, Math.min(totals[r.id], budget[r.id] ?? totals[r.id])]));
    fs.writeFileSync(BUDGET, JSON.stringify({ note: "QUANTA UI v2 — trần nợ giao diện; chỉ được giảm (node scripts/ui-lint.mjs --update). Đích: 0 sau U8/U9.", budget: next }, null, 2) + "\n");
    console.log("Đã cập nhật ngân sách (không tăng).");
  }
  const over = overBudget(totals, budget);
  if (over.length) { console.error(`VƯỢT NGÂN SÁCH: ${over.map((o) => `${o.id} ${o.now} > ${o.budget}`).join(" · ")}`); process.exit(1); }
}
