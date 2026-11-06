// SD-v1 (06/11/2026) — Mùa vụ KQKD đọc THẲNG kho Cổ tức trên Gateway (bảng "season"), thay vì vòng Gateway -> Project A (Vercel) -> Gateway.
// Từ 30/10 bộ tính Mùa vụ của Project A (earnings-seasonality-scan, gói vendor/qmsJobs.mjs) đã chạy trên Gateway và ghi bảng này; 3 route
// /api/cotuc/{annual-earnings-calendar, earnings-cycle-stats, earnings-cycle-paths} của Project A chỉ đọc lại đúng dòng đó và trả JSON.
// Ở đây tái tạo đúng hợp đồng của 3 route (200 + body, hoặc 404 khi thiếu cột / thiếu quý) — CHỈ ĐỌC, không ghi, không tính lại:
// công thức, dữ liệu và Timeline điểm mua (đọc cùng bảng) không đổi. Kiểm đối chiếu với Project A: oracle() bên dưới.
export const SD_VERSION = "SD-v1 (2026-11-06)";
export const SEASON_FIELDS = ["ticker", "calendar", "stats", "paths"];

let reader = null; // (t) => Promise<row | null>, gắn bởi server.js (cùng phiên bản cotucStore mà job QMS ghi vào)
let lister = null; // () => Promise<string[]> mọi mã có dòng trong bảng
export function setSeasonReader(fn, listFn = null) { reader = typeof fn === "function" ? fn : null; lister = typeof listFn === "function" ? listFn : null; }
export const listSeasonTickers = async () => (lister ? lister() : []);
export const hasSeasonReader = () => !!reader;

/** Dòng kho -> 9 mục như 9 API Project A (null row = mã chưa có trong danh mục quét: mọi mục 404). */
export function itemsFromRow(row) {
  const hit = (v) => (v ? { status: 200, body: v } : { status: 404, body: null });
  const items = { calendar: hit(row?.calendar) };
  for (const q of [1, 2, 3, 4]) {
    items[`stats:${q}`] = hit(row?.stats?.[String(q)]);
    items[`paths:${q}`] = hit(row?.paths?.[String(q)]);
  }
  return items;
}

/** 9 mục của mã từ kho; null = chưa gắn bộ đọc (khi đó dùng Project A như cũ). Lỗi kho -> ném (bên gọi lùi về Project A). */
export async function readSeasonItems(t) {
  if (!reader) return null;
  return itemsFromRow(await reader(t));
}

/** Chạy oracle nền, giữ kết quả gần nhất trong bộ nhớ. */
export function createSeasonOracle({ base = (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""), fetchImpl = globalThis.fetch, log = console } = {}) {
  let last = null, running = false;
  async function run({ limit = null } = {}) {
    if (running) return { running: true };
    running = true;
    try {
      const all = (await listSeasonTickers()).sort();
      last = await oracle({ tickers: limit ? all.slice(0, limit) : all, base, fetchImpl });
      log.log?.(`[season-oracle] ${last.equal}/${last.items} khớp, lệch ${last.mismatched}, lỗi ${last.errors}.`);
      return last;
    } finally { running = false; }
  }
  return { run, status: () => ({ running, last }) };
}

/** JSON khoá sắp xếp — so sánh không phụ thuộc thứ tự khoá. */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Đường dẫn Project A của từng mục (giống seasonalityBundle). */
export const projectAPath = (t, k) => (k === "calendar" ? `/api/cotuc/annual-earnings-calendar?ticker=${encodeURIComponent(t)}`
  : `/api/cotuc/earnings-cycle-${k.startsWith("stats") ? "stats" : "paths"}?ticker=${encodeURIComponent(t)}&quarter=${k.slice(-1)}`);

/**
 * Oracle: với mọi mã × 9 mục, so trạng thái (200/404) và nội dung JSON của kho với Project A. Chạy tuần tự `concurrency` luồng.
 * Trả { tickers, items, equal, mismatched, errors, diffs (≤ 30) }. Lỗi mạng của Project A tính riêng (không phải lệch).
 */
export async function oracle({ tickers, base, fetchImpl = globalThis.fetch, concurrency = 3, read = readSeasonItems }) {
  const todo = [...tickers];
  const res = { version: SD_VERSION, startedAt: new Date().toISOString(), tickers: tickers.length, items: 0, equal: 0, mismatched: 0, errors: 0, diffs: [], errorSamples: [] };
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (todo.length) {
      const t = todo.shift();
      let mine;
      try { mine = await read(t); } catch (e) { res.errors += 9; res.errorSamples.length < 10 && res.errorSamples.push(`${t}: kho ${e.message}`); continue; }
      for (const [k, m] of Object.entries(mine)) {
        res.items += 1;
        let theirs = null;
        for (let a = 0; a < 3 && !theirs; a++) {
          try {
            const r = await fetchImpl(`${base}${projectAPath(t, k)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
            if (r.status === 404) theirs = { status: 404, body: null };
            else if (r.ok) theirs = { status: 200, body: await r.json() };
          } catch { /* thử lại */ }
          if (!theirs) await new Promise((ok) => setTimeout(ok, 1500 * (a + 1)));
        }
        if (!theirs) { res.errors += 1; res.errorSamples.length < 10 && res.errorSamples.push(`${t} ${k}: Project A lỗi`); continue; }
        if (theirs.status === m.status && (m.status === 404 || stableJson(theirs.body) === stableJson(m.body))) res.equal += 1;
        else { res.mismatched += 1; if (res.diffs.length < 30) res.diffs.push({ t, k, store: m.status, projectA: theirs.status, bytes: [stableJson(m.body).length, stableJson(theirs.body).length] }); }
      }
    }
  }));
  res.finishedAt = new Date().toISOString();
  return res;
}
