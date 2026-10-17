// Elite 10 E6 — dịch vụ rủi ro danh mục: áp riskCore lên danh mục Elite 10 đã khoá của phiên mới nhất. Đệm theo ngày quyết định
// (danh mục không đổi trong phiên) — mỗi phiên đọc ~250 phiên giá của 10 mã một lần.
import { portfolioRisk } from "./riskCore.js";

const WINDOW = 250;
const MIN_SESSIONS = 60;
const isoMinusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** Căn chuỗi giá theo các phiên mà MỌI mã đều có giá; lợi suất ngày đơn giản. */
export function alignReturns(series, tickers, benchCloses) {
  const maps = tickers.map((t) => new Map((series.get(t) ?? []).map((r) => [r.date, r.closeAdj])));
  const dates = [...(maps[0]?.keys() ?? [])].filter((d) => maps.every((m) => m.get(d) > 0)).sort();
  const returns = [], outDates = [], bench = [];
  for (let k = 1; k < dates.length; k++) {
    const a = dates[k - 1], b = dates[k];
    returns.push(maps.map((m) => m.get(b) / m.get(a) - 1));
    outDates.push(b);
    const ba = benchCloses.get(a), bb = benchCloses.get(b);
    bench.push(ba > 0 && bb > 0 ? bb / ba - 1 : null);
  }
  return { returns: returns.slice(-WINDOW), dates: outDates.slice(-WINDOW), bench: bench.slice(-WINDOW) };
}

export function createRiskService({ store, decision, vnIndex, log = console }) {
  let memo = null;
  let running = null;

  async function risk() {
    const d = await decision();
    if (!d?.portfolio?.length) return null;
    if (memo?.date === d.date && memo?.version === d.version) return memo.doc;
    if (running) return running;
    running = (async () => {
      const tickers = d.portfolio.map((p) => p.ticker);
      const rows = await store.getMarketDailyRange({ from: isoMinusDays(d.date, 400), to: d.date, symbols: tickers, columns: "symbol,trading_date,close_adj" });
      const series = new Map();
      for (const r of rows) if (r.closeAdj > 0) { if (!series.has(r.symbol)) series.set(r.symbol, []); series.get(r.symbol).push({ date: r.date, closeAdj: r.closeAdj }); }
      let bench = new Map();
      try { bench = new Map(await vnIndex()); } catch (e) { log.warn?.(`[elite] risk vnIndex: ${e.message}`); }
      const aligned = alignReturns(series, tickers, bench);
      const base = { date: d.date, version: d.version, generatedAt: new Date().toISOString(), label: d.ledgerSummary?.label ?? "EXPERIMENTAL" };
      const doc = aligned.returns.length < MIN_SESSIONS
        ? { ...base, available: false, reasonVi: `Chỉ có ${aligned.returns.length} phiên giá chung cho cả 10 mã (cần ≥ ${MIN_SESSIONS}).` }
        : { ...base, available: true, ...portfolioRisk({ tickers, weights: d.portfolio.map((p) => p.weight), sectors: d.portfolio.map((p) => p.sectorKey), ...aligned }) };
      memo = { date: d.date, version: d.version, doc };
      return doc;
    })().finally(() => { running = null; });
    return running;
  }

  return { risk };
}
