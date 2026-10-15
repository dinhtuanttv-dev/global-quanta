// Top 20 v2 — dữ liệu VNDirect finfo (công khai) cho production: CHỈ cửa sổ gần đây cần cho yếu tố của ngày hôm nay
//   BCTC quý (21001 doanh thu, 23000 LNST mẹ, 13000 nợ, 14000 VCSH) ~15 quý kèm createdDate (≈ ngày công bố),
//   khối ngoại theo ngày ~150 ngày lịch, vốn hoá 10 ngày gần nhất. Cùng nguồn & định nghĩa với kiểm định T3.
const BASE = "https://api-finfo.vndirect.com.vn/v4";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "application/json" };
const ITEM = { 21001: "revenue", 23000: "npat", 13000: "liabilities", 14000: "equity" };
const iso = (t) => new Date(t).toISOString().slice(0, 10);

async function getJson(url, fetchImpl) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
      if (r.ok) return (await r.json())?.data ?? [];
    } catch { /* thử lại */ }
    await new Promise((res) => setTimeout(res, 1200 * (a + 1)));
  }
  return null;
}

/** Gom dòng BCTC VNDirect thành quý { fiscal, created (sớm nhất), revenue, npat, liabilities, equity }. */
export function groupStatements(rows) {
  const byQ = new Map();
  for (const r of rows ?? []) {
    const item = ITEM[r.itemCode]; const fiscal = r.fiscalDate;
    if (!item || !fiscal) continue;
    const q = byQ.get(fiscal) ?? { fiscal, created: null };
    q[item] = r.numericValue;
    const c = r.createdDate?.slice(0, 10) ?? null;
    if (c && (!q.created || c < q.created)) q.created = c;
    byQ.set(fiscal, q);
  }
  return [...byQ.values()].sort((a, b) => a.fiscal.localeCompare(b.fiscal));
}

export async function fetchVndRecent(tickers, { fetchImpl = globalThis.fetch, now = Date.now, concurrency = 3 } = {}) {
  const fund = {}, foreign = {}, mcap = {}, failed = [];
  const fromForeign = iso(now() - 150 * 864e5), fromMcap = iso(now() - 14 * 864e5);
  const todo = [...tickers];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (todo.length) {
      const t = todo.shift();
      const [st, fo, mc] = await Promise.all([
        getJson(`${BASE}/financial_statements?q=code:${t}~reportType:QUARTER~itemCode:21001,23000,13000,14000&size=60&sort=fiscalDate:desc`, fetchImpl),
        getJson(`${BASE}/foreigns?q=code:${t}~tradingDate:gte:${fromForeign}&size=200&sort=tradingDate:asc`, fetchImpl),
        getJson(`${BASE}/ratios?q=code:${t}~ratioCode:MARKETCAP~reportDate:gte:${fromMcap}&size=20&sort=reportDate:asc`, fetchImpl),
      ]);
      if (!st && !fo && !mc) { failed.push(t); continue; }
      if (st) fund[t] = groupStatements(st);
      if (fo) foreign[t] = fo.map((r) => [r.tradingDate, r.netVal]);
      if (mc) mcap[t] = mc.filter((r) => r.value > 0).map((r) => [r.reportDate, r.value]);
    }
  }));
  return { source: "VNDIRECT_FINFO", fetchedAt: new Date(now()).toISOString(), fund, foreign, mcap, failed };
}
