// Chấm điểm danh mục tự chọn (Custom Watchlist) trên Gateway:
//   - Mã có trong lần quét gần nhất: trả nguyên kết quả (cùng điểm với bảng).
//   - Mã ngoài universe: tính bằng CÙNG công thức và CÙNG bối cảnh universe (phân phối FA/RS, trạng thái
//     VN-Index, sự kiện) của lần quét đó -> điểm so sánh được trực tiếp. BCTC thiếu thì tải VCI và lưu đệm.

import { canonicalSymbol, isValidSymbol, isIndexSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { mapLimit } from "../util.js";
import { KV } from "./scannerJobs.js";
import { scoreCustom, topForeignNetBuy } from "./scanEngine.js";
import { fetchQuarterlyIncome, fetchQuarterlyBalance } from "./vciFinancials.js";

export const MAX_CUSTOM_TICKERS = 60;
const HISTORY_SESSIONS = 260;

export function parseTickers(raw) {
  const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/)).map(canonicalSymbol).filter(Boolean);
  const uniq = [...new Set(list)];
  if (!uniq.length) throw new ValidationError("Cần ít nhất 1 mã.");
  if (uniq.length > MAX_CUSTOM_TICKERS) throw new ValidationError(`Tối đa ${MAX_CUSTOM_TICKERS} mã mỗi danh mục.`);
  const bad = uniq.filter((t) => !isValidSymbol(t) || isIndexSymbol(t));
  if (bad.length) throw new ValidationError(`Mã không hợp lệ: ${bad.join(", ")}`);
  return uniq;
}

export async function scoreCustomTickers(service, rawTickers, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const store = service.store;
  const tickers = parseTickers(rawTickers);
  const [latestKv, contextKv, taxKv] = await Promise.all([store.getKv(KV.latest), store.getKv(KV.context), store.getKv(KV.taxonomy)]);
  const latest = latestKv?.value;
  if (!latest) {
    const error = new Error("Siêu Quét trên Gateway chưa có kết quả (chưa chạy scanUniverse).");
    error.statusCode = 503;
    throw error;
  }
  const inScan = new Map(latest.items.map((i) => [i.ticker, i]));
  const others = tickers.filter((t) => !inScan.has(t));
  const tax = taxKv?.value?.map ?? {};
  const names = taxKv?.value?.names ?? {};

  let scored = [], notFound = [], insufficient = [], fundamentalsFetched = 0;
  if (others.length) {
    const context = contextKv?.value;
    if (!context || context.dataAsOf !== latest.dataAsOf) {
      const error = new Error("Chưa có bối cảnh chấm điểm của lần quét gần nhất (chạy lại scanUniverse).");
      error.statusCode = 503;
      throw error;
    }
    const securities = new Map(((await store.getSecurities())?.rows ?? []).map((r) => [r.symbol, r]));
    const known = others.filter((t) => securities.size === 0 || securities.has(t) || tax[t]);
    notFound = others.filter((t) => !known.includes(t));

    const dates = (await store.getMarketDailyDates()).filter((d) => d <= latest.dataAsOf).slice(-HISTORY_SESSIONS);
    const rows = known.length ? await store.getMarketDailyRange({ from: dates[0], to: dates.at(-1), symbols: known }) : [];
    const barsByTicker = new Map();
    for (const r of rows) {
      if (!barsByTicker.has(r.symbol)) barsByTicker.set(r.symbol, []);
      barsByTicker.get(r.symbol).push(r);
    }
    for (const t of known) if (!barsByTicker.has(t)) notFound.push(t);
    const withBars = known.filter((t) => barsByTicker.has(t));

    // BCTC: dùng bản đã lưu; thiếu thì tải VCI (song song 2), lưu đệm cho lần sau.
    const fundamentals = await store.getFundamentals(withBars);
    const missing = withBars.filter((t) => !fundamentals.get(t));
    const fetched = (await mapLimit(missing, 2, async (ticker) => {
      const [income, balance] = await Promise.all([fetchQuarterlyIncome(ticker, fetchImpl), fetchQuarterlyBalance(ticker, fetchImpl)]);
      if (!income.available && !balance.available) return null;
      return { ticker, income: { ...income, quarters: income.quarters.slice(0, 6) }, balance: { ...balance, quarters: balance.quarters.slice(0, 6) } };
    })).filter(Boolean);
    if (fetched.length) {
      await store.upsertFundamentals(fetched);
      for (const f of fetched) fundamentals.set(f.ticker, f);
      fundamentalsFetched = fetched.length;
    }

    const foreignNetBuySet = topForeignNetBuy(await store.getMarketDailyByDate(latest.dataAsOf));
    const result = scoreCustom({
      tickers: withBars.map((t) => ({
        ticker: t, sector: securities.get(t)?.sector ?? null, name: names[t] ?? securities.get(t)?.name ?? null,
        sectorGroup: tax[t]?.[0] ?? "Khác", industry: tax[t]?.[1] ?? "Khác",
      })),
      barsByTicker, fundamentals, context, foreignNetBuySet, now: new Date(now()),
    });
    scored = result.items.map((i) => ({ ...i, inUniverse: false }));
    insufficient = result.skipped.map((s) => s.ticker);
  }

  const order = new Map(tickers.map((t, i) => [t, i]));
  const items = [
    ...tickers.filter((t) => inScan.has(t)).map((t) => ({ ...inScan.get(t), inUniverse: true })),
    ...scored,
  ].sort((a, b) => order.get(a.ticker) - order.get(b.ticker));
  return {
    generatedAt: new Date(now()).toISOString(), dataAsOf: latest.dataAsOf, scanGeneratedAt: latest.generatedAt,
    requested: tickers.length, items, notFound, insufficient, fundamentalsFetched,
  };
}
