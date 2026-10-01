// Chuẩn hoá dữ liệu từ SSI FC Data v2, SSI API v3 (SDK) và nguồn cũ về một
// định dạng chung. Giá luôn tính bằng VND (giống Yahoo .VN và mock-data hiện có),
// ngày là YYYY-MM-DD, thời điểm là ISO 8601 có múi giờ +07:00.
//
// SSI không thống nhất kiểu chữ của tên field giữa các endpoint (VD
// `Indexcode` / `IndexCode`, `Totalmatchvol` / `TotalMatchVol`) nên mọi truy
// cập field đều không phân biệt hoa thường.

/** @typedef {{ date: string, open: number, high: number, low: number, close: number, volume: number, value: number|null }} Bar */
/** @typedef {{ price: number, volume: number }} Level */
/**
 * @typedef {{ symbol: string, exchange: string|null, price: number|null, refPrice: number|null,
 *   ceiling: number|null, floor: number|null, change: number|null, changePct: number|null,
 *   open: number|null, high: number|null, low: number|null, avgPrice: number|null,
 *   totalVolume: number|null, totalValue: number|null, bid: Level[], ask: Level[],
 *   foreignBuyVolume: number|null, foreignSellVolume: number|null, session: string|null, time: string|null }} Quote
 */

const INDEX_ALIASES = new Map([
  ["VNINDEX", "VNINDEX"], ["^VNINDEX", "VNINDEX"], ["VN-INDEX", "VNINDEX"],
  ["HNX", "HNXINDEX"], ["HNXINDEX", "HNXINDEX"], ["HNX-INDEX", "HNXINDEX"],
  ["UPCOM", "HNXUPCOMINDEX"], ["UPCOMINDEX", "HNXUPCOMINDEX"], ["HNXUPCOMINDEX", "HNXUPCOMINDEX"],
]);
const KNOWN_INDICES = new Set([
  "VNINDEX", "VN30", "VN100", "VNMID", "VNSML", "VNALL", "VNALLSHARE", "VNX50", "VNXALL", "VNDIAMOND",
  "VNFINLEAD", "VNFINSELECT", "VNSI", "HNXINDEX", "HNX30", "HNXUPCOMINDEX",
]);
const SSI_V2_INDEX_IDS = new Map([["HNXINDEX", "HNXIndex"], ["HNXUPCOMINDEX", "HNXUpcomIndex"]]);

export function canonicalSymbol(raw) {
  const upper = String(raw ?? "").trim().toUpperCase().replace(/\.VN$/, "");
  return INDEX_ALIASES.get(upper) ?? upper;
}

export function isIndexSymbol(raw) {
  return KNOWN_INDICES.has(canonicalSymbol(raw));
}

/** Mã chỉ số theo cách SSI FC Data v2 đặt tên (IndexId). */
export function ssiV2IndexId(raw) {
  const canon = canonicalSymbol(raw);
  return SSI_V2_INDEX_IDS.get(canon) ?? canon;
}

const SYMBOL_RE = /^[A-Z0-9]{1,20}$/;
export function isValidSymbol(raw) {
  return SYMBOL_RE.test(canonicalSymbol(raw));
}

function lowerKeys(obj) {
  const map = new Map();
  if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) map.set(k.toLowerCase(), v);
  return map;
}

function pick(map, ...names) {
  for (const name of names) {
    const v = map.get(name.toLowerCase());
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function toNum(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const pad = (n) => String(n).padStart(2, "0");

/** Chuẩn hoá nhiều định dạng ngày (dd/mm/yyyy, yyyy/mm/dd, yyyy-mm-dd, epoch) về YYYY-MM-DD. */
export function toIsoDate(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms + 7 * 3600_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}

/** Ghép ngày + giờ (giờ Việt Nam) thành ISO có offset +07:00. */
export function toIsoDateTime(dateRaw, timeRaw) {
  const date = toIsoDate(dateRaw);
  if (!date) return null;
  const fromDate = String(dateRaw).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const t = String(timeRaw ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/) || fromDate;
  const time = t ? `${pad(t[1])}:${t[2]}:${t[3] ?? "00"}` : "00:00:00";
  return `${date}T${time}+07:00`;
}

/** Định dạng ngày SSI FC Data v2 yêu cầu: dd/mm/yyyy. */
export function toSsiV2Date(isoDate) {
  const [y, m, d] = String(isoDate).split("-");
  return `${d}/${m}/${y}`;
}

/** Định dạng ngày SDK v3 yêu cầu: YYYY/MM/DD. */
export function toSsiV3Date(isoDate) {
  return String(isoDate).replace(/-/g, "/");
}

/** @returns {Bar|null} */
export function normalizeBar(raw, { intraday = false } = {}) {
  const m = lowerKeys(raw);
  const dateRaw = pick(m, "tradingDate", "date", "time", "d", "t");
  const date = intraday
    ? toIsoDateTime(dateRaw, pick(m, "time", "intervalTime"))
    : toIsoDate(dateRaw);
  const bar = {
    date,
    open: toNum(pick(m, "open", "openPrice", "o")),
    high: toNum(pick(m, "high", "highPrice", "highestPrice", "h")),
    low: toNum(pick(m, "low", "lowPrice", "lowestPrice", "l")),
    close: toNum(pick(m, "close", "closePrice", "c")),
    volume: toNum(pick(m, "volume", "totalMatchVol", "totalVolume", "v")) ?? 0,
    value: toNum(pick(m, "value", "totalMatchVal", "totalValue")),
  };
  if (!bar.date || bar.close === null) return null;
  // Một số nguồn bỏ trống open/high/low ở nến không có giao dịch.
  bar.open ??= bar.close;
  bar.high ??= Math.max(bar.open, bar.close);
  bar.low ??= Math.min(bar.open, bar.close);
  return bar;
}

/** Chuẩn hoá + sắp xếp tăng dần theo thời gian + loại trùng ngày. */
export function normalizeBars(rows, opts) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const bar = normalizeBar(row, opts);
    if (bar) byDate.set(bar.date, bar);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function levels(m, side) {
  const out = [];
  for (let i = 1; i <= 10; i++) {
    const price = toNum(pick(m, `${side}Price${i}`));
    const volume = toNum(pick(m, `${side}Vol${i}`, `${side}Volume${i}`));
    if (price === null && volume === null) continue;
    out.push({ price: price ?? 0, volume: volume ?? 0 });
  }
  return out;
}

/** Quote từ SSI v2 stream X / DailyStockPrice, v3 SecuritiesSummary, hoặc Yahoo proxy. @returns {Quote|null} */
export function normalizeQuote(raw, symbolHint) {
  const content = raw?.Content && typeof raw.Content === "object" ? raw.Content : raw;
  const m = lowerKeys(content);
  const symbol = canonicalSymbol(pick(m, "symbol", "stockSymbol", "ticker") ?? symbolHint);
  if (!symbol) return null;
  const price = toNum(pick(m, "lastPrice", "matchPrice", "closePrice", "price", "estMatchedPrice"));
  const refPrice = toNum(pick(m, "refPrice", "referencePrice", "previousClose", "priorClosePrice"));
  let change = toNum(pick(m, "change", "priceChange"));
  let changePct = toNum(pick(m, "ratioChange", "perPriceChange", "priceChangePercent", "changePct"));
  if (change === null && price !== null && refPrice) change = price - refPrice;
  if (changePct === null && change !== null && refPrice) changePct = (change / refPrice) * 100;
  const tradingDate = pick(m, "tradingDate");
  const time = pick(m, "time", "tradingTime");
  return {
    symbol,
    exchange: pick(m, "exchange", "market", "board") ?? null,
    price,
    refPrice,
    ceiling: toNum(pick(m, "ceiling", "ceilingPrice")),
    floor: toNum(pick(m, "floor", "floorPrice")),
    change,
    changePct,
    open: toNum(pick(m, "open", "openPrice")),
    high: toNum(pick(m, "highest", "high", "highestPrice", "highPrice")),
    low: toNum(pick(m, "lowest", "low", "lowestPrice", "lowPrice")),
    avgPrice: toNum(pick(m, "avgPrice", "averagePrice")),
    totalVolume: toNum(pick(m, "totalVol", "totalMatchVol", "totalMatch", "totalVolume")),
    totalValue: toNum(pick(m, "totalVal", "totalMatchVal", "totalMatchValue", "totalValue")),
    bid: levels(m, "bid"),
    ask: levels(m, "ask"),
    foreignBuyVolume: toNum(pick(m, "foreignBuyVolTotal", "totalForeignBuy", "buyForeignQtty")),
    foreignSellVolume: toNum(pick(m, "foreignSellVolTotal", "totalForeignSell", "sellForeignQtty")),
    session: pick(m, "tradingSession") ?? null,
    time: tradingDate ? toIsoDateTime(tradingDate, time) : (typeof time === "string" && time.includes("T") ? time : null),
  };
}

/** Snapshot chỉ số từ SSI v2 MI / DailyIndex hoặc v3 MarketIndexSummary. */
export function normalizeIndexSnapshot(raw, codeHint) {
  const content = raw?.Content && typeof raw.Content === "object" ? raw.Content : raw;
  const m = lowerKeys(content);
  const code = canonicalSymbol(pick(m, "indexId", "indexCode", "index") ?? codeHint);
  const value = toNum(pick(m, "indexValue", "close"));
  if (!code || value === null) return null;
  const prior = toNum(pick(m, "priorIndexValue"));
  let change = toNum(pick(m, "change", "indexChange"));
  if (change === null && prior) change = value - prior;
  let changePct = toNum(pick(m, "ratioChange", "indexChangePercent"));
  if (changePct === null && change !== null && prior) changePct = (change / prior) * 100;
  // SSI DailyIndex trả `Change` lệch tỉ lệ (VD -0.1932 khi RatioChange = -1.09%,
  // tức thực tế -19.32 điểm). Khi hai trường mâu thuẫn, tin RatioChange.
  if (changePct !== null && change !== null && value) {
    const base = value - change;
    const impliedPct = base ? (change / base) * 100 : null;
    if (impliedPct === null || Math.abs(impliedPct - changePct) > 0.05) {
      change = value - value / (1 + changePct / 100);
    }
  }
  const tradingDate = pick(m, "tradingDate");
  return {
    code,
    value,
    change,
    changePct,
    totalVolume: toNum(pick(m, "totalMatchVol", "totalQtty", "totalMatch", "allQty")),
    totalValue: toNum(pick(m, "totalMatchVal", "totalValue", "totalMatchValue", "allValue")),
    advances: toNum(pick(m, "advances", "totalAdvanceStock", "advancers")),
    declines: toNum(pick(m, "declines", "totalDeclineStock", "decliners")),
    noChanges: toNum(pick(m, "noChanges", "nochanges", "totalSteadyStock")),
    ceilings: toNum(pick(m, "ceilings", "totalCeilingStock")),
    floors: toNum(pick(m, "floors", "totalFloorStock")),
    session: pick(m, "tradingSession") ?? null,
    date: toIsoDate(tradingDate),
    time: tradingDate ? toIsoDateTime(tradingDate, pick(m, "time")) : null,
  };
}

export function normalizeSecurity(raw) {
  const m = lowerKeys(raw);
  const symbol = canonicalSymbol(pick(m, "symbol", "stockSymbol", "ticker"));
  if (!symbol) return null;
  return {
    symbol,
    exchange: pick(m, "market", "board", "exchange") ?? null,
    name: pick(m, "stockName", "symbolNameVi", "name", "companyName") ?? null,
    nameEn: pick(m, "stockEnName", "symbolNameEn", "nameEn") ?? null,
    sector: pick(m, "icbName", "sector", "industry") ?? null,
    listedShares: toNum(pick(m, "listedShares", "listedShare")),
  };
}

const TRADABLE_SYMBOL = /^[A-Z][A-Z0-9]{2,11}$/;

export function normalizePriceLimit(raw) {
  const m = lowerKeys(raw);
  const symbol = canonicalSymbol(pick(m, "symbol"));
  const date = toIsoDate(pick(m, "tradingDate"));
  const refPrice = toNum(pick(m, "refPrice"));
  const ceiling = toNum(pick(m, "ceiling", "ceilingPrice"));
  const floor = toNum(pick(m, "floor", "floorPrice"));
  // DailyStockPrice toàn sàn có lẫn bản ghi rác (mã "0.8536:", trần = 0...): loại bỏ.
  if (!TRADABLE_SYMBOL.test(symbol) || !date) return null;
  if (!(ceiling > 0 && floor > 0 && refPrice > 0 && floor <= refPrice && refPrice <= ceiling)) return null;
  return { symbol, date, refPrice, ceiling, floor };
}

/** Mọi response của tầng dữ liệu đều mang provenance này. */
export function provenance({ source, asOf = null, isStale = false, fallbackReason = null, attempts = [] }) {
  return {
    source,
    asOf,
    fetchedAt: new Date().toISOString(),
    isStale,
    fallbackReason,
    attempts,
  };
}
