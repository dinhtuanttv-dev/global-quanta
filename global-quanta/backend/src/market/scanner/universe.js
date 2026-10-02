// Universe Siêu Quét: top N mã theo GIÁ TRỊ KHỚP LỆNH bình quân 20 phiên trên cả
// 3 sàn, ngưỡng tối thiểu (mặc định 1 tỷ/phiên), cộng nhóm mã ghim (17 mã cổ tức +
// universe gốc của Project A) luôn có mặt. Ngành giữ đúng cách Project A gán để
// điểm sự kiện (so khớp theo tên ngành) không đổi.

import { fetchJson } from "../util.js";

// Project A lib/quant-cotuc.ts DIVIDEND_STOCKS (commit 9306bc3) — ưu tiên ngành cao nhất.
export const DIVIDEND_STOCKS = [
  ["BMP", "Vật liệu XD"], ["FPT", "Công nghệ TT"], ["VNM", "Thực phẩm"], ["DPM", "Hóa chất"],
  ["DCM", "Hóa chất"], ["REE", "Năng lượng"], ["ACB", "Ngân hàng"], ["GAS", "Dầu khí"],
  ["DHG", "Dược phẩm"], ["SAB", "Thực phẩm"], ["GMD", "Vận tải biển"], ["MWG", "Bán lẻ"],
  ["VCI", "Chứng khoán"], ["TCB", "Ngân hàng"], ["HPG", "Thép"], ["NLG", "Bất động sản"], ["VCB", "Ngân hàng"],
];

export function universeConfig() {
  const size = Number(process.env.SCANNER_UNIVERSE_SIZE) || 300;
  const minValue = Number(process.env.SCANNER_MIN_AVG_VALUE) || 1e9;
  const sessions = Number(process.env.SCANNER_LIQUIDITY_SESSIONS) || 20;
  return { size, minValue, sessions };
}

/**
 * Xếp hạng thanh khoản: bình quân giá trị khớp trên `sessionCount` phiên
 * (phiên mã không giao dịch tính là 0, giống cách đo đã dùng để chốt ngưỡng).
 * @param {{ symbol: string, exchange: string, value: number, date: string }[]} rows
 */
export function rankByLiquidity(rows, sessionCount) {
  const agg = new Map();
  for (const r of rows) {
    const e = agg.get(r.symbol) ?? { symbol: r.symbol, exchange: r.exchange, total: 0 };
    e.total += r.value || 0;
    e.exchange = r.exchange;
    agg.set(r.symbol, e);
  }
  return [...agg.values()]
    .map((e) => ({ symbol: e.symbol, exchange: e.exchange, avgValue: e.total / Math.max(1, sessionCount) }))
    .sort((a, b) => b.avgValue - a.avgValue);
}

/**
 * @param {{ ranked: {symbol,exchange,avgValue}[], pinned: string[], sectors: Map<string,string>, names?: Map<string,string>, size: number, minValue: number }} p
 */
export function buildUniverse({ ranked, pinned, sectors, names = new Map(), taxonomy = new Map(), size, minValue }) {
  const chosen = new Map();
  for (const r of ranked) {
    if (chosen.size >= size) break;
    if (r.avgValue < minValue) break;
    chosen.set(r.symbol, { ...r, pinned: false });
  }
  const byRank = new Map(ranked.map((r) => [r.symbol, r]));
  for (const symbol of pinned) {
    if (!chosen.has(symbol)) chosen.set(symbol, { symbol, exchange: byRank.get(symbol)?.exchange ?? null, avgValue: byRank.get(symbol)?.avgValue ?? 0, pinned: true });
    else chosen.get(symbol).pinned = true;
  }
  return [...chosen.values()].map((u) => ({
    ticker: u.symbol,
    exchange: u.exchange,
    avgValue20: Math.round(u.avgValue),
    pinned: u.pinned,
    sector: sectors.get(u.symbol) ?? "Khac",
    name: names.get(u.symbol) ?? null,
    industry: taxonomy.get(u.symbol)?.industry ?? "Khác",
    sectorGroup: taxonomy.get(u.symbol)?.group ?? "Khác",
  }));
}

// ---------- Nguồn ngành (theo thứ tự ưu tiên tăng dần) ----------

/** TradingView (API công khai không chính thức) — CHỈ dùng làm nhãn ngành dự phòng. */
export async function fetchTradingViewSectors(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl("https://scanner.tradingview.com/vietnam/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ columns: ["name", "sector", "description", "industry"], range: [0, 3000] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TradingView HTTP ${res.status}`);
  const json = await res.json();
  const sectors = new Map();
  const names = new Map();
  const industries = new Map();
  for (const row of json?.data ?? []) {
    const symbol = String(row.s ?? "").split(":").pop();
    if (!symbol) continue;
    if (row.d?.[1]) sectors.set(symbol, String(row.d[1]));
    if (row.d?.[2]) names.set(symbol, String(row.d[2]));
    if (row.d?.[3]) industries.set(symbol, String(row.d[3]));
  }
  return { sectors, names, industries };
}

/** Ngành/universe từ Project A: ngành đang hiển thị ở Siêu Quét + universe gốc (mã ghim). */
export async function fetchProjectASectors(base, fetchImpl = globalThis.fetch) {
  const headers = process.env.INTERNAL_HISTORICAL_API_BYPASS_SECRET
    ? { "x-vercel-protection-bypass": process.env.INTERNAL_HISTORICAL_API_BYPASS_SECRET } : {};
  const [scanner, universe] = await Promise.allSettled([
    fetchJson(`${base}/api/sieu-quet-ai/scanner`, { headers, fetchImpl, timeoutMs: 20_000 }),
    fetchJson(`${base}/api/universe`, { headers, fetchImpl, timeoutMs: 20_000 }),
  ]);
  const scannerSectors = new Map();
  if (scanner.status === "fulfilled") for (const i of scanner.value?.items ?? []) if (i.sector) scannerSectors.set(i.ticker, i.sector);
  const universeSectors = new Map();
  const universeTickers = [];
  if (universe.status === "fulfilled") {
    for (const t of universe.value?.tickers ?? []) {
      universeTickers.push(t.ticker);
      if (t.sector) universeSectors.set(t.ticker, t.sector);
    }
  }
  return { scannerSectors, universeSectors, universeTickers, ok: scanner.status === "fulfilled" || universe.status === "fulfilled" };
}

/** Gộp ngành: TradingView < ngành Siêu Quét hiện tại < universe Project A < DIVIDEND_STOCKS. */
export function mergeSectors({ tradingView = new Map(), scanner = new Map(), universe = new Map() }) {
  const merged = new Map(tradingView);
  for (const [k, v] of scanner) merged.set(k, v);
  for (const [k, v] of universe) merged.set(k, v);
  for (const [k, v] of DIVIDEND_STOCKS) merged.set(k, v);
  return merged;
}
