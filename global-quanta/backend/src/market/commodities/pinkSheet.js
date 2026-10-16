// World Bank Pink Sheet (giá hàng hoá THÁNG, USD danh nghĩa) — tự tìm link xlsx mới nhất trên trang World Bank (doc ID đổi
// theo đợt), đọc sheet "Monthly Prices", trả chuỗi [kỳ, giá] cho các cột cần. Kỳ T được coi là có sẵn từ ngày công bố của
// bản đầu tiên chứa kỳ đó (dòng "Updated on ..."); bản sau có thể chỉnh nhẹ kỳ cũ.
import { readXlsx } from "./xlsxLite.js";

export const WB_PAGE = "https://www.worldbank.org/en/research/commodity-markets";
// Phương án dự phòng khi trang đổi cấu trúc (link đã xác nhận còn sống 2026-10-16).
export const WB_FALLBACK_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const norm = (s) => String(s ?? "").replace(/\*+/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** "Updated on October 02, 2026" -> "2026-10-02" (null nếu không đọc được). */
export function parseUpdatedOn(text) {
  const m = /updated on\s+([a-z]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(String(text ?? ""));
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** rows của sheet "Monthly Prices" -> { updatedOn, lastPeriod, series: { [column]: { unit, points: [["YYYY-MM", v]] } } }. */
export function parsePinkSheetRows(rows, columns) {
  const updatedOn = rows.slice(0, 6).map((r) => parseUpdatedOn(r?.[0])).find(Boolean) ?? null;
  const hdrIdx = rows.findIndex((r, i) => i < 12 && r?.some((c) => norm(c) === "crude oil, brent"));
  if (hdrIdx < 0) throw new Error("Pink Sheet: không tìm thấy dòng tiêu đề");
  const header = rows[hdrIdx].map(norm), units = rows[hdrIdx + 1] ?? [];
  const series = {};
  let lastPeriod = null;
  for (const col of columns) {
    const j = header.indexOf(norm(col));
    if (j < 0) { series[col] = { unit: null, points: [], missing: true }; continue; }
    const points = [];
    for (const r of rows.slice(hdrIdx + 2)) {
      const m = /^(\d{4})M(\d{2})$/.exec(String(r?.[0] ?? ""));
      if (!m) continue;
      const v = r[j];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) points.push([`${m[1]}-${m[2]}`, v]);
    }
    series[col] = { unit: units[j] ?? null, points };
    if (points.length && (!lastPeriod || points.at(-1)[0] > lastPeriod)) lastPeriod = points.at(-1)[0];
  }
  return { updatedOn, lastPeriod, series };
}

export async function discoverPinkSheetUrl(fetchImpl = globalThis.fetch) {
  try {
    const r = await fetchImpl(WB_PAGE, { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { url: WB_FALLBACK_URL, discovered: false };
    const m = /https:\/\/thedocs\.worldbank\.org\/[^"'\s]+CMO-Historical-Data-Monthly\.xlsx/i.exec(await r.text());
    return m ? { url: m[0], discovered: true } : { url: WB_FALLBACK_URL, discovered: false };
  } catch {
    return { url: WB_FALLBACK_URL, discovered: false };
  }
}

export async function fetchPinkSheet(columns, fetchImpl = globalThis.fetch) {
  const { url, discovered } = await discoverPinkSheetUrl(fetchImpl);
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`Pink Sheet HTTP ${r.status}`);
  const sheets = readXlsx(Buffer.from(await r.arrayBuffer()), ["Monthly Prices"]);
  if (!sheets["Monthly Prices"]) throw new Error("Pink Sheet: thiếu sheet Monthly Prices");
  return { url, discovered, ...parsePinkSheetRows(sheets["Monthly Prices"], columns) };
}
