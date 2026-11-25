// VNDirect stock_prices quotes OHLC in thousands of VND and matched volume in shares.
// Validate before converting so a missing field can never become a legitimate zero-volume bar.
export function validClosedBar(bar, date) {
  return Boolean(bar && bar.date === date && !bar.partial && !bar.unconfirmedEod &&
    [bar.open, bar.high, bar.low, bar.close].every((x) => Number.isFinite(x) && x > 0) &&
    bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close) &&
    Number.isFinite(bar.volume) && bar.volume >= 0);
}

async function dayRows(dataset, field, date, fetcher) {
  const result = [];
  for (let page = 1; page <= 10; page++) {
    const url = new URL("https://api-finfo.vndirect.com.vn/v4/" + dataset);
    url.search = new URLSearchParams({ q: field + ":" + date, sort: "code:asc", size: "500", page: String(page) });
    const response = await fetcher(url, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("VNDirect HTTP " + response.status);
    const { data, totalPages } = await response.json();
    if (!Array.isArray(data)) throw new Error("VNDirect response has no price rows");
    result.push(...data.filter((r) => r[field] === date && r.type === "STOCK" && /^[A-Z][A-Z0-9]{2}$/.test(r.code)));
    if (data.length < 500 || page >= totalPages) break;
  }
  return result;
}

const price = (x) => Number.isFinite(x) ? Math.round(x * 1000) : null;
const ohlcv = (row) => ({ date: row.date, open: price(row.open), high: price(row.high), low: price(row.low),
  close: price(row.close), volume: row.nmVolume, value: Number.isFinite(row.nmValue) ? row.nmValue : null });

export async function fetchVndirectClose(date, fetcher = fetch) {
  const rows = await dayRows("stock_prices", "date", date, fetcher);
  return new Map(rows.map((r) => [r.code, ohlcv(r)]).filter(([, bar]) => validClosedBar(bar, date)));
}

export async function fetchVndirectMarketDay(date, fetcher = fetch) {
  const [prices, foreign] = await Promise.all([dayRows("stock_prices", "date", date, fetcher), dayRows("foreigns", "tradingDate", date, fetcher)]);
  const flows = new Map(foreign.map((r) => [r.code, r]));
  const rows = [];
  for (const r of prices) {
    const f = flows.get(r.code), bar = ohlcv(r);
    if (!f || f.floor !== r.floor || !["HOSE", "HNX", "UPCOM"].includes(r.floor) || !validClosedBar(bar, date)) continue;
    if (![r.basicPrice, r.ceilingPrice, r.floorPrice, r.adClose].every((v) => Number.isFinite(v) && v > 0) ||
        ![r.nmValue, r.ptVolume, r.ptValue, f.buyVol, f.sellVol, f.buyVal, f.sellVal].every((v) => Number.isFinite(v) && v >= 0)) continue;
    rows.push({ ...bar, symbol: r.code, exchange: r.floor, closeAdj: price(r.adClose), refPrice: price(r.basicPrice),
      ceiling: price(r.ceilingPrice), floor: price(r.floorPrice), dealVolume: r.ptVolume, dealValue: r.ptValue,
      foreignBuyVol: f.buyVol, foreignSellVol: f.sellVol, foreignBuyVal: f.buyVal, foreignSellVal: f.sellVal, foreignRoom: f.currentRoom ?? null });
  }
  return rows;
}
