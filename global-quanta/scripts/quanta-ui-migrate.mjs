#!/usr/bin/env node
// QUANTA UI v2 — codemod U1 (28/11/2026, docs/quanta-ui-v2/04 §2). Đổi VÀNG QUANTA CŨ (màu nhấn) -> XANH NHẤN, vàng mang nghĩa CẢNH BÁO -> --q-warn,
// Space Grotesk / --font-display -> Inter. CHỈ chạm chuỗi màu / phông trong className, style, CSS — không đổi logic, chữ, data-testid.
// Bỏ qua: tệp biểu đồ miễn trừ (src/styles/ui-exempt.json), thư mục khoá F0, tokens.css (gỡ ở U9), và mọi DÒNG vẽ biểu đồ (fill / stroke / canvas /
// bảng màu phân loại) — các dòng đó được in ra để duyệt tay.
//   node scripts/quanta-ui-migrate.mjs            -> chạy thử, in thống kê
//   node scripts/quanta-ui-migrate.mjs --write    -> ghi tệp
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const exempt = JSON.parse(fs.readFileSync(path.join(SRC, "styles", "ui-exempt.json"), "utf8"));
const SKIP_FILES = new Set([...(exempt.files ?? []), "styles/tokens.css", "styles/quanta-ui.css"].map((f) => path.join(SRC, f)));
const LOCKED = (exempt.lockedDirs ?? []).map((d) => path.join(SRC, d));
/** Dòng vẽ biểu đồ / bảng màu phân loại: giữ nguyên (biểu đồ 2D / 3D giữ thiết kế). */
const CHART_LINE = /\bfill\b|\bstroke\b|fillStyle|strokeStyle|goldRamp|TPL_COLOR|STATE_COLOR|<circle|<path|<rect|<line|<text|polyline|polygon|series|palette|ui-exempt/i;
/** Vàng mang nghĩa CẢNH BÁO (đã duyệt tay 28/11): tệp + đoạn chữ nhận diện dòng. */
const WARN_LINES = [
  ["components/MainTabs/ChatXucTac/ImpactBoard.tsx", "catalystStale"],
  ["components/MainTabs/ChatXucTac/ImpactBoard.tsx", "impact-catalyst-stale"],
  ["components/MainTabs/KetNoiTheGioi/center/AiBriefPanel.tsx", "STALE_HOURS"],
  ["components/MainTabs/KetNoiTheGioi/center/MarketMonitor.tsx", "tone === \"warn\""],
  ["components/MainTabs/KetNoiTheGioi/center/MarketMonitor.tsx", "i.stale"],
  ["components/MainTabs/LocNganh/timing/SectorDeepPanel.tsx", "data?.evidence.reason"],
  ["components/MainTabs/LocNganh/timing/SectorRotationPanel.tsx", "evidence?.reason"],
];

const toWarn = (l) => l
  .replace(/var\(--gold(?:-bright)?(?:,\s*#[0-9a-fA-F]{3,8})?\)/g, "var(--q-warn)")
  .replace(/#(?:E8B84B|F5CE72)\b/gi, "#fbbf24");

function toAccent(line, isCss) {
  let l = line;
  // Tiện ích Tailwind giá trị tuỳ ý: text-[#F5CE72] -> text-q-accent-strong ; border-[#E8B84B]/50 -> border-q-accent/50
  l = l.replace(/\b((?:[a-z-]+:)*(?:text|bg|border|ring|accent|outline|from|to|via|shadow|decoration|caret|divide))-\[#F5CE72\]/gi, "$1-q-accent-strong");
  l = l.replace(/\b((?:[a-z-]+:)*(?:text|bg|border|ring|accent|outline|from|to|via|shadow|decoration|caret|divide))-\[#E8B84B\]/gi, "$1-q-accent");
  // Biến hệ cũ.
  l = l.replace(/var\(--gold-bright(,\s*[^)]*)?\)/g, "var(--q-accent-strong$1)").replace(/var\(--gold-glow(,\s*[^)]*)?\)/g, "var(--q-accent-soft$1)").replace(/var\(--gold(,\s*[^)]*)?\)/g, "var(--q-accent$1)");
  // rgba của vàng cũ -> rgba của xanh nhấn (giữ độ trong).
  l = l.replace(/rgba?\(\s*232\s*,\s*184\s*,\s*75\s*,/g, "rgba(79, 142, 247,").replace(/rgba?\(\s*245\s*,\s*206\s*,\s*114\s*,/g, "rgba(121, 168, 255,");
  // Hex trần còn lại: CSS -> biến; TSX -> hex xanh (an toàn cả khi giá trị đi vào canvas).
  l = l.replace(/#F5CE72\b/gi, isCss ? "var(--q-accent-strong)" : "#79a8ff").replace(/#E8B84B\b/gi, isCss ? "var(--q-accent)" : "#4f8ef7");
  // Phông hiển thị cũ -> Inter.
  l = l.replace(/var\(--font-display\)/g, "var(--q-font-sans)").replace(/(["'])Space Grotesk\1/g, "$1Inter$1");
  return l;
}

function walk(d, out = []) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) { if (!LOCKED.includes(p) && f !== "__snapshots__") walk(p, out); } else if (/\.(tsx|css)$/.test(f) && !/\.test\.tsx$/.test(f)) out.push(p); } return out; }

const WRITE = process.argv.includes("--write");
const stats = { files: 0, accent: 0, warn: 0, kept: [] };
for (const f of walk(SRC)) {
  if (SKIP_FILES.has(f) || LOCKED.some((d) => f.startsWith(d))) continue;
  const rel = path.relative(SRC, f).replace(/\\/g, "/");
  const raw = fs.readFileSync(f, "utf8"), crlf = raw.includes("\r\n");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let changed = false;
  const isCss = f.endsWith(".css");
  lines.forEach((line, i) => {
    if (!/#(?:E8B84B|F5CE72)\b|var\(--gold|var\(--font-display\)|Space Grotesk|rgba?\(\s*(?:232\s*,\s*184|245\s*,\s*206)/i.test(line)) return;
    if (CHART_LINE.test(line)) { stats.kept.push(`${rel}:${i + 1}`); return; }
    const warn = WARN_LINES.some(([file, needle]) => file === rel && line.includes(needle));
    const next = warn ? toWarn(line) : toAccent(line, isCss);
    if (next !== line) { lines[i] = next; changed = true; warn ? stats.warn++ : stats.accent++; }
  });
  if (changed) { stats.files++; if (WRITE) fs.writeFileSync(f, crlf ? lines.join("\r\n") : lines.join("\n")); }
}
console.log(`tệp đổi ${stats.files} · dòng -> xanh nhấn ${stats.accent} · dòng -> cảnh báo ${stats.warn} · dòng biểu đồ giữ nguyên ${stats.kept.length}${WRITE ? "" : " (chạy thử)"}`);
for (const k of stats.kept) console.log("  giữ:", k);
