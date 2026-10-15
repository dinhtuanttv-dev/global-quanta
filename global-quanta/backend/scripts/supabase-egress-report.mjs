// Báo cáo băng thông Supabase theo TỪNG TRUY VẤN (pg_stat_statements) — CHỈ ĐỌC, qua Supabase Management API.
//
//   node scripts/supabase-egress-report.mjs [--out report.md] [--env path/to/backend/.env]
//
// Token: Supabase Management (sbp_…) đọc từ FILE, không bao giờ in ra / ghi log / đưa vào repo:
//   mặc định  %USERPROFILE%\.secrets\supabase-sbp.txt   (hoặc biến SUPABASE_SBP_FILE trỏ tới file khác)
// Project ref: lấy từ SUPABASE_URL (biến môi trường hoặc file .env truyền bằng --env) — ref không phải bí mật.
// Mọi câu SQL bên dưới chỉ SELECT. Không reset thống kê, không ghi gì vào database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const outPath = opt("--out", "supabase-egress-report.md");

class Fail extends Error {}
// không gọi process.exit() khi còn fetch đang mở (Windows/libuv assert) — ném lỗi, đặt exitCode ở cuối
function fail(msg) { throw new Fail(msg); }

try {

// ---- token (không in)
const tokenFile = process.env.SUPABASE_SBP_FILE || path.join(os.homedir(), ".secrets", "supabase-sbp.txt");
if (!fs.existsSync(tokenFile)) fail(`Chưa có file token: ${tokenFile}\n  Tạo token tại https://supabase.com/dashboard/account/tokens rồi lưu vào file này (một dòng, không dấu nháy).`);
const token = fs.readFileSync(tokenFile, "utf8").trim();
if (!/^sbp_[A-Za-z0-9_]{20,}$/.test(token)) fail(`File token không đúng định dạng sbp_… (${tokenFile}). Không in nội dung.`);

// ---- project ref
let supaUrl = process.env.SUPABASE_URL || "";
const envFile = opt("--env", null);
if (!supaUrl && envFile && fs.existsSync(envFile)) supaUrl = (fs.readFileSync(envFile, "utf8").match(/^SUPABASE_URL=(.+)$/m)?.[1] ?? "").replace(/["'\r]/g, "").trim();
const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(supaUrl)?.[1];
if (!ref) fail("Không xác định được project ref — đặt SUPABASE_URL hoặc truyền --env <đường dẫn backend/.env>.");

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(60_000),
  });
  const text = await r.text();
  if (r.status === 401) fail("Token bị từ chối (401) — token hết hạn / đã thu hồi. Tạo token mới.");
  if (!r.ok) fail(`Management API HTTP ${r.status}: ${text.slice(0, 300).replace(/sbp_[A-Za-z0-9_]+/g, "sbp_***")}`);
  return JSON.parse(text);
}

const READ_ONLY = (q) => { if (!/^\s*(select|with)\b/i.test(q) || /\b(insert|update|delete|drop|alter|truncate|reset|create|grant)\b/i.test(q.replace(/'[^']*'/g, ""))) throw new Error("Chỉ cho phép SELECT."); return q; };
const Q = {
  ext: `select extname, extversion from pg_extension where extname = 'pg_stat_statements'`,
  info: `select stats_reset, dealloc from pg_stat_statements_info`,
  tables: `select schemaname, relname, n_live_tup::bigint as rows, pg_total_relation_size(relid)::bigint as bytes
           from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 30`,
  top: `select left(regexp_replace(query, '\\s+', ' ', 'g'), 300) as query, calls::bigint, rows::bigint,
          round(total_exec_time)::bigint as total_ms, round((rows::numeric / greatest(calls, 1)), 1) as rows_per_call,
          (shared_blks_hit + shared_blks_read)::bigint as blocks
        from pg_stat_statements
        where query !~* 'pg_stat_statements|pg_catalog|information_schema'
        order by rows desc limit 40`,
  kv: `select key, octet_length(value::text)::bigint as bytes, updated_at from market_kv order by 2 desc limit 25`,
  json: `select 'CotucDecisionState.snapshot' as col, count(*)::bigint as n, coalesce(avg(pg_column_size(snapshot)), 0)::bigint as avg_bytes from "CotucDecisionState"
         union all select 'EarningsSeasonalityCache.samples', count(*), coalesce(avg(pg_column_size(samples)), 0)::bigint from "EarningsSeasonalityCache"
         union all select 'EarningsSeasonalityCache.paths', count(*), coalesce(avg(pg_column_size(paths)), 0)::bigint from "EarningsSeasonalityCache"
         union all select 'EarningsSeasonalityCache.stats', count(*), coalesce(avg(pg_column_size(stats)), 0)::bigint from "EarningsSeasonalityCache"`,
};

const fmtB = (b) => { b = Number(b); return b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${b} B`; };
const tableOf = (q) => (/\bfrom\s+"?(?:public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(q)?.[1] ?? null);

const res = {};
for (const [k, q] of Object.entries(Q)) {
  try { res[k] = await sql(READ_ONLY(q)); } catch (e) { if (e instanceof Fail) throw e; res[k] = { error: String(e.message ?? e) }; }
}
if (!Array.isArray(res.ext) || !res.ext.length) fail("pg_stat_statements chưa bật trên project (Database → Extensions).");

// ước tính byte trả về ≈ rows × (dung lượng bảng / số dòng) — có TOAST/index nên là ƯỚC TÍNH thô để xếp hạng
const avgRow = new Map((Array.isArray(res.tables) ? res.tables : []).map((t) => [t.relname, Number(t.rows) > 0 ? Number(t.bytes) / Number(t.rows) : null]));
const top = (Array.isArray(res.top) ? res.top : []).map((r) => { const t = tableOf(r.query); const a = t ? avgRow.get(t) : null; return { ...r, table: t, estBytes: a ? Number(r.rows) * a : null }; })
  .sort((a, b) => (b.estBytes ?? 0) - (a.estBytes ?? 0));

const lines = [];
lines.push(`# Báo cáo băng thông Supabase theo truy vấn`, ``, `- Project: \`${ref}\` · tạo lúc ${new Date().toISOString()}`);
lines.push(`- pg_stat_statements ${res.ext[0].extversion} · thống kê tính từ: ${Array.isArray(res.info) ? res.info[0]?.stats_reset ?? "?" : "?"}`);
lines.push(``, `## Truy vấn theo ước tính dữ liệu trả về (rows × kích thước dòng TB của bảng)`, ``, `| # | Bảng | Lượt gọi | Dòng trả về | Dòng/lượt | Ước tính | Truy vấn |`, `|---|---|---|---|---|---|---|`);
top.slice(0, 30).forEach((r, i) => lines.push(`| ${i + 1} | ${r.table ?? "—"} | ${r.calls} | ${r.rows} | ${r.rows_per_call} | ${r.estBytes ? fmtB(r.estBytes) : "—"} | \`${String(r.query).replace(/\|/g, "\\|").slice(0, 160)}\` |`));
lines.push(``, `## Bảng lớn nhất`, ``, `| Bảng | Dòng | Dung lượng |`, `|---|---|---|`);
for (const t of Array.isArray(res.tables) ? res.tables.slice(0, 20) : []) lines.push(`| ${t.relname} | ${t.rows} | ${fmtB(t.bytes)} |`);
lines.push(``, `## market_kv — tài liệu lớn nhất`, ``, `| Khoá | Kích thước | Cập nhật |`, `|---|---|---|`);
for (const k of Array.isArray(res.kv) ? res.kv : []) lines.push(`| ${k.key} | ${fmtB(k.bytes)} | ${String(k.updated_at).slice(0, 16)} |`);
lines.push(``, `## Cột JSON lớn (kích thước TB / dòng)`, ``, `| Cột | Dòng | TB / dòng | Toàn cột |`, `|---|---|---|---|`);
for (const j of Array.isArray(res.json) ? res.json : []) lines.push(`| ${j.col} | ${j.n} | ${fmtB(j.avg_bytes)} | ${fmtB(Number(j.avg_bytes) * Number(j.n))} |`);
for (const [k, v] of Object.entries(res)) if (v?.error) lines.push(``, `> Lỗi phần ${k}: ${v.error}`);
lines.push(``, `_Ghi chú: "Ước tính" là xếp hạng thô (dung lượng bảng gồm TOAST/index); con số egress chính xác xem Dashboard → Usage._`);
fs.writeFileSync(outPath, lines.join("\n"));
console.log(`✔ Đã ghi ${outPath} (${top.length} truy vấn, ${Array.isArray(res.tables) ? res.tables.length : 0} bảng).`);
} catch (e) {
  console.error(`✖ ${e instanceof Fail ? e.message : String(e?.message ?? e).replace(/sbp_[A-Za-z0-9_]+/g, "sbp_***")}`);
  process.exitCode = 1;
}
