// X5 — Dữ liệu THẬT cho ngăn kéo "Phân tích sâu" (tab Chất xúc tác), thay buildDemoFinancials / MOCK_PORTFOLIO_DAILY_RETURNS.
//   1) Forensics (Beneish M, Altman Z, Piotroski F): BCTC NĂM của 2 năm tài chính gần nhất từ VNDirect finfo (công khai).
//      Mã chỉ tiêu theo mô hình BCTC doanh nghiệp sản xuất/dịch vụ; ngân hàng/chứng khoán/bảo hiểm dùng mô hình khác ->
//      thiếu chỉ tiêu -> trả `applicable: false` (KHÔNG bịa số).
//   2) Rủi ro danh mục: lợi suất ngày THẬT (giá điều chỉnh cộng dồn của /ta-series) của danh mục cân bằng tỷ trọng từ các mã
//      người dùng chọn (★), beta so với VN-Index.
const BASE = "https://api-finfo.vndirect.com.vn/v4";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "application/json" };

// itemCode VNDirect (financial_models, modelType 1 = CĐKT, 2 = KQKD, 3 = LCTT)
export const FORENSIC_ITEMS = {
  11000: "currentAssets", 11310: "receivables", 12220: "ppeGross", 12210: "ppeNet", 12700: "totalAssets",
  13000: "totalLiabilities", 13100: "currentLiabilities", 13340: "totalLongTermDebt", 14000: "bookValueEquity",
  14110: "paidInCapital", 14200: "retainedEarnings", 21001: "sales", 22100: "costOfGoodsSold", 22110: "sellingExpense",
  22200: "adminExpense", 22230: "depreciation", 22510: "interestExpense", 23003: "netIncome", 23800: "profitBeforeTax",
  32000: "operatingCashFlow",
};
const REQUIRED = ["sales", "totalAssets", "currentAssets", "currentLiabilities", "totalLiabilities", "bookValueEquity", "netIncome", "profitBeforeTax", "operatingCashFlow"];
const PAR_VALUE = 10_000; // mệnh giá cổ phiếu VN

/** Gom dòng VNDirect -> { fiscalDate: { field: value } }. */
export function groupAnnual(rows) {
  const by = new Map();
  for (const r of rows ?? []) {
    const f = FORENSIC_ITEMS[r.itemCode];
    if (!f || !r.fiscalDate || typeof r.numericValue !== "number") continue;
    const p = by.get(r.fiscalDate) ?? {};
    p[f] = r.numericValue;
    by.set(r.fiscalDate, p);
  }
  return [...by.entries()].sort(([a], [b]) => b.localeCompare(a));
}

/** Một kỳ VNDirect -> FinancialStatementInput (frontend src/types/financialEngineering.ts). null nếu thiếu chỉ tiêu bắt buộc. */
export function toStatementInput(ticker, fiscalDate, p) {
  const missing = REQUIRED.filter((k) => typeof p[k] !== "number");
  if (missing.length) return { input: null, missing };
  const n = (x) => (typeof x === "number" ? x : 0);
  return {
    missing: [],
    input: {
      ticker, period: fiscalDate.slice(0, 4),
      receivables: n(p.receivables), sales: p.sales, costOfGoodsSold: n(p.costOfGoodsSold), currentAssets: p.currentAssets,
      ppeGross: typeof p.ppeGross === "number" ? p.ppeGross : n(p.ppeNet), totalAssets: p.totalAssets, depreciation: n(p.depreciation),
      sgaExpense: n(p.sellingExpense) + n(p.adminExpense), netIncome: p.netIncome, totalLongTermDebt: n(p.totalLongTermDebt),
      operatingCashFlow: p.operatingCashFlow, currentLiabilities: p.currentLiabilities, retainedEarnings: n(p.retainedEarnings),
      ebit: p.profitBeforeTax + n(p.interestExpense), bookValueEquity: p.bookValueEquity, totalLiabilities: p.totalLiabilities,
      workingCapital: p.currentAssets - p.currentLiabilities, sharesOutstanding: n(p.paidInCapital) / PAR_VALUE,
    },
  };
}

export function buildForensicPayload(ticker, rows, fetchedAt) {
  const periods = groupAnnual(rows);
  const base = { ticker, source: "VNDIRECT_FINFO", reportType: "ANNUAL", fetchedAt };
  if (periods.length < 2) return { ...base, applicable: false, reason: "Chưa đủ 2 năm BCTC trên VNDirect.", current: null, prior: null };
  const [c, p] = periods;
  const cur = toStatementInput(ticker, c[0], c[1]);
  const pri = toStatementInput(ticker, p[0], p[1]);
  if (!cur.input || !pri.input) {
    return { ...base, applicable: false, reason: `Thiếu chỉ tiêu ${[...new Set([...cur.missing, ...pri.missing])].join(", ")} — có thể là ngân hàng/chứng khoán/bảo hiểm (mẫu BCTC khác), các mô hình Beneish/Altman/Piotroski không áp dụng.`, current: null, prior: null };
  }
  return { ...base, applicable: true, reason: null, current: cur.input, prior: pri.input, fiscalDates: [c[0], p[0]] };
}

export function createForensicSource({ fetchImpl = globalThis.fetch, ttlMs = 12 * 3600_000, now = Date.now } = {}) {
  const cache = new Map();
  return async function get(rawSymbol) {
    const symbol = String(rawSymbol || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3,5}$/.test(symbol)) throw Object.assign(new Error("Mã cổ phiếu không hợp lệ."), { statusCode: 400 });
    const hit = cache.get(symbol);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const codes = Object.keys(FORENSIC_ITEMS).join(",");
    const url = `${BASE}/financial_statements?q=code:${symbol}~reportType:ANNUAL~itemCode:${codes}&size=400&sort=fiscalDate:desc`;
    let rows = null;
    for (let a = 0; a < 3 && rows == null; a++) {
      try {
        const r = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
        if (r.ok) rows = (await r.json())?.data ?? [];
      } catch { /* thử lại */ }
      if (rows == null) await new Promise((res) => setTimeout(res, 800 * (a + 1)));
    }
    if (rows == null) throw Object.assign(new Error("Không tải được BCTC từ VNDirect — thử lại sau."), { statusCode: 503 });
    const value = buildForensicPayload(symbol, rows, new Date(now()).toISOString());
    cache.set(symbol, { at: now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  };
}

// ── Rủi ro danh mục ─────────────────────────────────────────────────────────

/** Lợi suất ngày của danh mục cân bằng tỷ trọng (tái cân bằng hằng ngày) trên các ngày CHUNG của mọi mã + beta với chỉ số. */
export function equalWeightPortfolio(seriesBySymbol, benchBars, maxDays = 250) {
  const symbols = Object.keys(seriesBySymbol).filter((s) => (seriesBySymbol[s]?.length ?? 0) > 20);
  if (!symbols.length) return { symbols: [], dailyReturns: [], dates: [], beta: null };
  const closeMaps = symbols.map((s) => new Map(seriesBySymbol[s].filter((b) => b.close > 0 && !b.partial).map((b) => [b.date, b.close])));
  const common = [...closeMaps[0].keys()].filter((d) => closeMaps.every((m) => m.has(d))).sort();
  const dates = common.slice(-(maxDays + 1));
  const dailyReturns = [];
  for (let i = 1; i < dates.length; i++) {
    let s = 0;
    for (const m of closeMaps) s += m.get(dates[i]) / m.get(dates[i - 1]) - 1;
    dailyReturns.push(s / closeMaps.length);
  }
  const bench = new Map((benchBars ?? []).filter((b) => b.close > 0).map((b) => [b.date, b.close]));
  const pairs = [];
  for (let i = 1; i < dates.length; i++) {
    const a = bench.get(dates[i]), b = bench.get(dates[i - 1]);
    if (a && b) pairs.push([dailyReturns[i - 1], a / b - 1]);
  }
  let beta = null;
  if (pairs.length >= 60) {
    const mx = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    const my = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    let cov = 0, vx = 0;
    for (const [y, x] of pairs) { cov += (x - mx) * (y - my); vx += (x - mx) ** 2; }
    beta = vx > 0 ? Math.round((cov / vx) * 1000) / 1000 : null;
  }
  return { symbols, dates: dates.slice(1), dailyReturns: dailyReturns.map((x) => Math.round(x * 1e6) / 1e6), beta };
}

export function createPortfolioRisk({ taSeries, ttlMs = 30 * 60_000, now = Date.now, concurrency = 3 }) {
  const cache = new Map();
  return async function get(rawSymbols) {
    const symbols = [...new Set(String(rawSymbols || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{3,5}$/.test(s)))].sort();
    if (!symbols.length) throw Object.assign(new Error("Cần ít nhất 1 mã (symbols=HPG,FPT,...)."), { statusCode: 400 });
    if (symbols.length > 20) throw Object.assign(new Error("Tối đa 20 mã."), { statusCode: 400 });
    const key = symbols.join(",");
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const series = {};
    const failed = [];
    const todo = [...symbols];
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (todo.length) {
        const s = todo.shift();
        try {
          series[s] = (await taSeries.get({ symbol: s, range: "2y", limit: 300 })).bars;
        } catch {
          failed.push(s);
        }
      }
    }));
    let bench = [];
    try {
      bench = (await taSeries.get({ symbol: "VNINDEX", range: "2y", limit: 300 })).bars;
    } catch { /* beta = null */ }
    const p = equalWeightPortfolio(series, bench);
    const value = {
      requested: symbols, used: p.symbols, failed, priceBasis: "ADJUSTED_CUMULATIVE", weighting: "EQUAL_DAILY_REBALANCE",
      from: p.dates[0] ?? null, to: p.dates.at(-1) ?? null, sampleSize: p.dailyReturns.length, dailyReturns: p.dailyReturns, beta: p.beta,
    };
    cache.set(key, { at: now(), value });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return value;
  };
}
