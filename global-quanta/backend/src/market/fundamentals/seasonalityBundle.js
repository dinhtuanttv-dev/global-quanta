// S7/S3 (06/11/2026) — Mùa vụ KQKD: GÓI 9 API Project A của một mã (lịch cả năm + thống kê 4 quý + đường CAR 4 quý) qua Gateway,
// đệm 30 phút, bản gần nhất khi nguồn lỗi. Giao diện vẫn kiểm tra schema / khớp mã-quý bằng ĐÚNG hàm cũ (chỉ thay nguồn fetch),
// nên công thức, ngưỡng và hiển thị của Mùa vụ KQKD giữ nguyên.
// S3 — kiểm ngày làm mốc: ngày sự kiện Project A dùng cho từng kỳ (eventPaths[].exDate) so với ngày công bố chính xác (tin BCTC chính thức
// VNDirect, earningsCalendar.publishDates) -> số phiên lệch. Chỉ chú thích, không đổi số.
import { publishDates, quarterEnd } from "./earningsCalendar.js";
import { readSeasonItems } from "./seasonStore.js";

export const SB_VERSION = "SB-v1 (2026-11-06)";
const PATHS = (t) => ({
  calendar: `/api/cotuc/annual-earnings-calendar?ticker=${encodeURIComponent(t)}`,
  ...Object.fromEntries([1, 2, 3, 4].flatMap((q) => [[`stats:${q}`, `/api/cotuc/earnings-cycle-stats?ticker=${encodeURIComponent(t)}&quarter=${q}`], [`paths:${q}`, `/api/cotuc/earnings-cycle-paths?ticker=${encodeURIComponent(t)}&quarter=${q}`]])),
});

/** Quý tài chính (loại q) mà sự kiện ngày `date` công bố: kết thúc quý loại q gần nhất trước ngày đó. */
export function fiscalForEvent(date, q) {
  const y = Number(String(date).slice(0, 4));
  for (const yy of [y, y - 1]) { const f = quarterEnd(yy, q); if (f < date) return f; }
  return quarterEnd(y - 1, q);
}

/** Kiểm ngày làm mốc cho các kỳ trong đường CAR. sessionsOf(date) -> chỉ số phiên (để đếm phiên lệch), có thể null. */
export function auditEventDates(pathsByQ, rec, disclosures, sessionsOf = null) {
  const pub = rec ? publishDates(rec, disclosures ?? []) : new Map();
  const out = {};
  for (const q of [1, 2, 3, 4]) {
    const ev = pathsByQ[q]?.eventPaths ?? [];
    const rows = ev.map((e) => {
      const used = String(e.exDate ?? "").slice(0, 10);
      const fiscal = fiscalForEvent(used, q), p = pub.get(fiscal) ?? null;
      const days = p ? Math.round((Date.parse(`${used}T00:00:00Z`) - Date.parse(`${p.date}T00:00:00Z`)) / 864e5) : null;
      let sessions = null;
      if (p && sessionsOf) { const a = sessionsOf(used), b = sessionsOf(p.date); if (a != null && b != null) sessions = a - b; }
      return { used, fiscal, precise: p?.date ?? null, source: p?.source ?? null, days, sessions };
    });
    const checked = rows.filter((r) => r.precise && r.source === "DISCLOSURE");
    const lag = (r) => (r.sessions ?? (r.days != null ? Math.round(r.days * 5 / 7) : null));
    out[q] = { rows, checked: checked.length, offBy2: checked.filter((r) => Math.abs(lag(r) ?? 0) >= 2).length, maxOff: checked.length ? Math.max(...checked.map((r) => Math.abs(lag(r) ?? 0))) : null };
  }
  return out;
}

export function createSeasonalityBundle({ base = (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""), fetchImpl = globalThis.fetch, now = Date.now, ttlMs = 30 * 60_000, max = 120, readLocal = readSeasonItems, log = console } = {}) {
  const memo = new Map(); // t -> { at, items }
  async function one(path) {
    try {
      const r = await fetchImpl(`${base}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 404 || r.status === 204) return { status: 404, body: null };
      if (!r.ok) return { status: r.status, body: null, error: `HTTP ${r.status}` };
      return { status: 200, body: await r.json() };
    } catch (e) { return { status: 0, body: null, error: String(e?.message ?? e).slice(0, 120) }; }
  }
  /** 9 API của mã (song song), đệm 30 phút; lỗi tạm -> giữ bản gần nhất của mục đó. */
  async function get(t) {
    const hit = memo.get(t);
    if (hit && now() - hit.at < ttlMs) return { ...hit, cached: true };
    // SD-v1: đọc thẳng kho Gateway (cùng dữ liệu 3 route Project A trả); kho lỗi / chưa gắn -> gọi Project A như cũ.
    let got = null, origin = "projectA";
    try { got = await readLocal?.(t); if (got) origin = "store"; } catch (e) { log.warn?.(`[season] kho lỗi ${t}: ${e.message} — dùng Project A`); got = null; }
    if (!got) got = Object.fromEntries(await Promise.all(Object.entries(PATHS(t)).map(async ([k, p]) => [k, await one(p)])));
    let stale = false;
    for (const [k, v] of Object.entries(got)) if (v.status !== 200 && v.status !== 404 && hit?.items?.[k]?.status === 200) { got[k] = { ...hit.items[k], stale: true }; stale = true; }
    const doc = { at: now(), items: got, stale, origin };
    memo.set(t, doc); memo.delete(t); memo.set(t, doc);
    while (memo.size > max) memo.delete(memo.keys().next().value);
    return { ...doc, cached: false };
  }
  return { get, base };
}
