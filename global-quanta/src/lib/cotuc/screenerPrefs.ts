// BL4 (07/11/2026) — Bộ lọc cổ phiếu cổ tức: bộ lọc mẫu (chỉ dùng trường có số thật), bộ lọc đã lưu + cột hiển thị theo tài khoản.
// Miền giống hệt backend (market/watchlists/userScreenerPrefs.js).
import { DEFAULT_FILTER, type DividendFilter } from "../quant-cotuc";

export const SCREENER_COLUMNS = ["price", "yield", "ex", "payAgm", "pe", "roe", "fm", "window", "expected", "growth", "decision"] as const;
export type ScreenerColumn = (typeof SCREENER_COLUMNS)[number];
export const COLUMN_LABEL: Record<ScreenerColumn, string> = {
  price: "Giá", yield: "Yield 12T", ex: "GDKHQ", payAgm: "Thanh toán · ĐHCĐ", pe: "P/E", roe: "ROE", fm: "Hạng NT",
  window: "Săn cổ tức", expected: "Kỳ vọng nhóm", growth: "LNST YoY", decision: "Cảnh báo TO",
};
export type SortKey = "ticker" | "dividendYield" | "score" | "pe" | "roe" | "price";
export interface SavedScreen { name: string; filter: Partial<DividendFilter>; sort?: { field: SortKey; asc: boolean } }
export interface ScreenerPrefs { schemaVersion: 1; screens: SavedScreen[]; columns: Partial<Record<ScreenerColumn, boolean>>; defaultScreen?: string }
export const EMPTY_PREFS: ScreenerPrefs = { schemaVersion: 1, screens: [], columns: {} };

const NUM: Partial<Record<keyof DividendFilter, [number, number]>> = { minYield: [0, 15], minRoe: [0, 30], maxPe: [5, 60], maxDebt: [0, 99], minFscore: [0, 9], minQuintile: [0, 5] };
const ENUM: Partial<Record<keyof DividendFilter, string[]>> = {
  trend: ["All", "UP", "RECOVERING", "WEAKENING", "DOWN"],
  phase: ["All", "PRE_AGM", "PREPARATION", "ACCUMULATION", "RUN_UP", "DISCOUNT", "EXPIRED"],
};
const BOOL: (keyof DividendFilter)[] = ["upcomingGDKHQ", "upcomingAGM", "hideRiskFlags", "hideStaleEvents", "hideTraps", "showUnknown"];
const SORTS: SortKey[] = ["ticker", "dividendYield", "score", "pe", "roe", "price"];

/** Chỉ giữ trường khác mặc định (không lưu ô tìm kiếm). */
export function filterToSaved(f: DividendFilter): Partial<DividendFilter> {
  const out: Record<string, unknown> = {};
  for (const k of [...Object.keys(NUM), ...Object.keys(ENUM), ...BOOL] as (keyof DividendFilter)[]) if (f[k] !== undefined && f[k] !== DEFAULT_FILTER[k]) out[k] = f[k];
  return out as Partial<DividendFilter>;
}
export const savedToFilter = (s: Partial<DividendFilter>): DividendFilter => ({ ...DEFAULT_FILTER, ...s, searchQ: "" });

export function sanitizePrefs(raw: unknown): ScreenerPrefs {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const screens: SavedScreen[] = []; const seen = new Set<string>();
  for (const s of Array.isArray(r.screens) ? (r.screens as Record<string, unknown>[]) : []) {
    const name = typeof s?.name === "string" ? s.name.trim().slice(0, 40) : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const src = s.filter && typeof s.filter === "object" ? (s.filter as Record<string, unknown>) : {};
    const filter: Record<string, unknown> = {};
    for (const [k, [lo, hi]] of Object.entries(NUM) as [string, [number, number]][]) if (typeof src[k] === "number" && Number.isFinite(src[k])) filter[k] = Math.min(hi, Math.max(lo, src[k] as number));
    for (const [k, allowed] of Object.entries(ENUM) as [string, string[]][]) if (allowed.includes(src[k] as string)) filter[k] = src[k];
    for (const k of BOOL) if (typeof src[k] === "boolean") filter[k] = src[k];
    const sort = s.sort as { field?: string; asc?: unknown } | undefined;
    screens.push({ name, filter: filter as Partial<DividendFilter>, ...(sort && SORTS.includes(sort.field as SortKey) ? { sort: { field: sort.field as SortKey, asc: sort.asc === true } } : {}) });
    if (screens.length >= 20) break;
  }
  const columns: ScreenerPrefs["columns"] = {};
  const c = r.columns && typeof r.columns === "object" ? (r.columns as Record<string, unknown>) : {};
  for (const k of SCREENER_COLUMNS) if (typeof c[k] === "boolean") columns[k] = c[k] as boolean;
  const def = typeof r.defaultScreen === "string" && screens.some((s) => s.name === r.defaultScreen) ? r.defaultScreen : undefined;
  return { schemaVersion: 1, screens, columns, ...(def ? { defaultScreen: def } : {}) };
}

/** Bộ lọc mẫu — chỉ dùng trường có số thật (DS-v1/v2: lợi suất, ROE, P/E, F-Score, hạng FM-v1, bẫy, xu hướng MA, lịch sự kiện). */
export const SCREENER_PRESETS: { id: string; label: string; title: string; f: Partial<DividendFilter> }[] = [
  { id: "durable", label: "🛡️ Lợi suất bền", title: "Yield ≥ 5% · F-Score ≥ 5/9 · ẩn bẫy lợi suất", f: { minYield: 5, minFscore: 5, hideTraps: true } },
  { id: "topfm", label: "🧮 Hạng NT cao (Q5)", title: "Ngũ phân vị cao nhất của mô hình nhân tố FM-v1 (MÔ TẢ)", f: { minQuintile: 5 } },
  { id: "value", label: "💎 Giá trị + chất lượng", title: "Yield ≥ 3% · ROE ≥ 15% · P/E ≤ 12", f: { minYield: 3, minRoe: 15, maxPe: 12 } },
  { id: "highyield", label: "👑 Lợi suất cao, không bẫy", title: "Yield ≥ 7% · ẩn bẫy lợi suất · ẩn mã > 2 cờ rủi ro", f: { minYield: 7, hideTraps: true, hideRiskFlags: true } },
  { id: "uptrend", label: "📈 Xu hướng tăng", title: "Giá > MA50 > MA200", f: { trend: "UP" } },
  { id: "ex30", label: "📅 Sắp GDKHQ", title: "GDKHQ trong 30 ngày tới", f: { upcomingGDKHQ: true } },
  { id: "agm30", label: "📋 Sắp ĐHCĐ", title: "ĐHCĐ trong 30 ngày tới", f: { upcomingAGM: true } },
];
