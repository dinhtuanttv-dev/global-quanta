// Engine quét Siêu Quét AI — tái hiện đúng trình tự của cron gốc
// (Project A app/api/cron/sieu-quet-scan/route.ts, commit 9306bc3) nhưng:
//   (a) chạy MỘT lượt trên toàn universe (RS, percentile FA, Breadth tính trên
//       toàn bộ thay vì lô ≤100 mã) — công thức không đổi;
//   (b) nến từ SSI (giá đóng cửa điều chỉnh cho chuỗi closes, OHLC gốc cho ATR,
//       giống cách bản gốc dùng adjClose/close của Yahoo);
//   (c) cờ khối ngoại mua ròng = top 5 HOSE theo giá trị mua ròng (dữ liệu SSI);
//   (d) sự kiện đã xác nhận đọc từ Project A.
// v2 (SCANNER_ENGINE "SQ-v2", anh duyệt 22/10/2026 — Q2/Q3/Q5): BCTC theo TTM / cùng kỳ / thiếu = null (faMetrics.js), FA
// trung lập ngành, thanh khoản theo GIÁ TRỊ giao dịch, chuỗi giá điều chỉnh cộng dồn (screenerSeries, cùng nguồn biểu đồ TA),
// F-Score không áp dụng cho tài chính, điểm sự kiện = null khi không có nguồn, R/R từ engine cấu trúc (gắn lúc đọc).
// Hàm thuần: mọi dữ liệu được truyền vào, không gọi mạng.

import {
  calculateSMA, calculateRSI, calculateMACDHistogram, calculateAtrSeries,
  computeTrendBias, computeMaAlignmentScore, computeImpulseScore, computeConfluence,
  computeTaScore, computeEventImpactScore,
  computeRiskAdjustedMomentum, computeTrendTag, computeRsRating, computeReturnOverPeriod,
} from "./formulas.js";
import { adjustOhlcSeries, repairUnexplainedGaps } from "../adjusted/corporateActions.js";
import { faMetrics } from "./faMetrics.js";
import { computeFaScoreV2, computeQualityTagV2, computeSmartScoreV2, peerKeyOf, riskRewardFromLevels } from "./formulasV2.js";

export const SCANNER_ENGINE = "SQ-v2";
const LIQ_SESSIONS = 20;

const DAY_MS = 1000 * 60 * 60 * 24;

/** Map sự kiện đã xác nhận -> ActiveEvent, đúng như bản gốc. */
export function toActiveEvents(events, now) {
  return events.map((e) => {
    const durationDays = e.expectedDurationDays ?? 14;
    const daysSinceCreated = Math.floor((now.getTime() - new Date(e.createdAt).getTime()) / DAY_MS);
    const daysRemaining = durationDays - daysSinceCreated;
    const status = daysRemaining < 0 ? "resolved" : daysSinceCreated <= 1 ? "upcoming" : "ongoing";
    return {
      verifiedStatus: e.verifiedStatus, sectors: e.sectors,
      magnitude: e.magnitude, direction: e.direction,
      status, daysRemaining: daysRemaining >= 0 ? daysRemaining : null,
    };
  });
}

/**
 * @param {{
 *   universe: { ticker: string, sector: string|null, name?: string|null }[],
 *   barsByTicker: Map<string, { date: string, open: number, high: number, low: number, close: number, closeAdj: number, volume: number }[]>,
 *   fundamentals: Map<string, { income: { available: boolean, quarters: any[] }, balance: { available: boolean, quarters: any[] } }>,
 *   indexBars: { date: string, open: number, high: number, low: number, close: number }[],
 *   events: any[],
 *   foreignNetBuySet: Set<string>,
 *   now?: Date,
 * }} input
 */
export function runScan({ universe, barsByTicker, fundamentals, indexBars, events, foreignNetBuySet, eventsAvailable = true, now = new Date() }) {
  const sectorOf = new Map(universe.map((u) => [u.ticker, u.sector ?? "Khac"]));
  const taxOf = new Map(universe.map((u) => [u.ticker, { industry: u.industry ?? null, sectorGroup: u.sectorGroup ?? null }]));
  const nameOf = new Map(universe.map((u) => [u.ticker, u.name ?? null]));
  const skipped = [];

  // Bước 1: chỉ báo từng mã
  const tickerData = [];
  for (const u of universe) {
    const r = computeTickerData(u.ticker, barsByTicker.get(u.ticker) ?? [], fundamentals.get(u.ticker), u);
    if (r.skip) skipped.push(r.skip); else tickerData.push(r.data);
  }
  if (tickerData.length === 0) throw new Error("Không có mã nào đủ dữ liệu để quét.");

  // Bước 2: trạng thái VN-Index
  if (!indexBars || indexBars.length < 50) throw new Error("Thiếu dữ liệu VN-Index (cần ≥ 50 phiên).");
  const idxCloses = indexBars.map((b) => b.close);
  const idxMa20 = calculateSMA(idxCloses, 20) ?? idxCloses[idxCloses.length - 1];
  const idxMa50 = calculateSMA(idxCloses, 50) ?? idxCloses[idxCloses.length - 1];
  const idxMa200 = idxCloses.length >= 200 ? calculateSMA(idxCloses, 200) ?? idxMa50 : idxMa50;
  const idxRsi = calculateRSI(idxCloses) ?? 50;
  const idxMacd = calculateMACDHistogram(idxCloses) ?? 0;

  const breadthPct = Math.round((tickerData.filter((t) => t.closes[t.closes.length - 1] > t.ma20).length / tickerData.length) * 1000) / 10;
  const breadth5dAgoCount = tickerData.filter((t) => {
    const closesUpTo5dAgo = t.closes.slice(0, -5);
    const ma20At5dAgo = calculateSMA(closesUpTo5dAgo, 20);
    return ma20At5dAgo !== null && closesUpTo5dAgo[closesUpTo5dAgo.length - 1] > ma20At5dAgo;
  }).length;
  const breadth5dAgo = Math.round((breadth5dAgoCount / tickerData.length) * 1000) / 10;
  const breadthDrop5d = Math.max(0, breadth5dAgo - breadthPct);
  const deathCrossRecent = idxMa50 < idxMa200 * 1.01 && idxCloses[idxCloses.length - 1] < idxMa50;

  const { bias, label } = computeTrendBias(idxCloses[idxCloses.length - 1], idxMa20, idxMa50, idxMa200, breadthPct, deathCrossRecent, breadthDrop5d);
  const maAlign = computeMaAlignmentScore(idxMa20, idxMa50, idxMa200);
  const idxAtrSeries = calculateAtrSeries(indexBars, 14);
  const idxAtrPct = idxAtrSeries.length > 0 ? (idxAtrSeries.filter((v) => v <= idxAtrSeries[idxAtrSeries.length - 1]).length / idxAtrSeries.length) * 100 : 50;
  const impulseScore = computeImpulseScore(idxRsi, breadthPct, maAlign, idxAtrPct);
  const breakoutProbability = Math.max(0, 100 - idxAtrPct - Math.abs(50 - breadthPct));
  const divergence = idxRsi < 45 && idxCloses[idxCloses.length - 1] > idxCloses[idxCloses.length - 10] ? "bearish" : "none";
  const computedAt = now.toISOString();

  const indexState = {
    id: "singleton", asOf: computedAt, ma20: idxMa20, ma50: idxMa50, ma200: idxMa200,
    maAlignmentScore: maAlign, trendBias: bias, trendLabel: label, rsi14: idxRsi, macdHistogram: idxMacd,
    marketBreadthPct: breadthPct, divergence,
    atr14: idxAtrSeries[idxAtrSeries.length - 1] ?? 0, atrPercentile: idxAtrPct, breakoutProbability, impulseScore,
    narrative: `VN-Index đang ở trạng thái '${label}' (bias=${bias}), breadth ${breadthPct}%, RSI14=${idxRsi.toFixed(1)}. Impulse Score=${impulseScore}/100.`,
    dataAsOf: indexBars[indexBars.length - 1].date,
  };

  // Bước 3: FA percentile trên toàn universe + chấm điểm từng mã
  const faUniverse = {
    roe: tickerData.map((t) => t.roe), margin: tickerData.map((t) => t.netMargin),
    growth: tickerData.map((t) => t.revenueGrowth), liq: tickerData.map((t) => t.liquidity),
    peer: tickerData.map((t) => t.peer),
  };
  const universeReturns64d = tickerData.map((t) => t.return64d);
  const activeEvents = toActiveEvents(events, now);

  const context = { engine: SCANNER_ENGINE, bias, breakoutProbability, faUniverse, universeReturns64d, computedAt, eventsAvailable };
  const items = tickerData.map((t) => scoreTickerData(t, { ...context, activeEvents, fundamentals, foreignNetBuySet, sectorOf, nameOf, taxOf }));

  return { indexState, items: sortScannerItems(items), skipped, context: { ...context, indexState, events } };
}


/**
 * Bước 1 (tách riêng để chấm điểm thêm mã ngoài universe với cùng công thức).
 * @param bars  nến ngày tăng dần; `closeAdj` (nếu có) là giá đóng cửa điều chỉnh, `close` của nến cuối = giá danh nghĩa hiện tại
 * @param tax   { industry, sectorGroup } để nhận diện ngân hàng / chứng khoán / bảo hiểm khi bản BCTC lưu cũ chưa có `kind`
 */
export function computeTickerData(ticker, bars, fa, tax = {}) {
  const closes = bars.map((b) => b.closeAdj ?? b.close);
  if (closes.length < 50) return { skip: { ticker, reason: "INSUFFICIENT_BARS", bars: closes.length } };

  const ma20 = calculateSMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma200 = closes.length >= 200 ? calculateSMA(closes, 200) : null;
  const rsi = calculateRSI(closes) ?? 50;
  const atrSeries = calculateAtrSeries(bars, 14);
  const atrPct = atrSeries.length > 0
    ? (atrSeries.filter((v) => v <= atrSeries[atrSeries.length - 1]).length / atrSeries.length) * 100
    : 50;

  const m = faMetrics(fa, { industry: tax.industry ?? null });
  // Thanh khoản = GIÁ TRỊ khớp bình quân 20 phiên (bản gốc: khối lượng -> ưu ái cổ phiếu giá thấp).
  const recent = bars.slice(-LIQ_SESSIONS);
  const liquidity = recent.reduce((s, b) => s + (b.value > 0 ? b.value : (b.close ?? 0) * (b.volume ?? 0)), 0) / Math.max(1, recent.length);

  const price = bars[bars.length - 1].close;
  const changePct = closes.length >= 2 ? Math.round((price / closes[closes.length - 2] - 1) * 10000) / 100 : 0;
  const return64d = computeReturnOverPeriod(closes, 64);

  return { data: {
    ticker, closes, ma20: ma20 ?? price, ma50: ma50 ?? price, ma200,
    rsi, atrPct, roe: m.roe, netMargin: m.netMargin, revenueGrowth: m.revenueGrowth, leverage: m.leverage,
    growthBasis: m.growthBasis, faPeriod: m.period, kind: m.kind, fScore: m.fScore,
    peer: peerKeyOf({ kind: m.kind, industry: tax.industry ?? null, sectorGroup: tax.sectorGroup ?? null }),
    liquidity, price, changePct, return64d, asOf: bars[bars.length - 1].date,
  } };
}


/** Bước 3 cho một mã: điểm FA/TA/sự kiện/Smart Score so với phân phối của universe trong `ctx`. */
export function scoreTickerData(t, ctx) {
  const { bias, breakoutProbability, faUniverse, universeReturns64d, activeEvents, foreignNetBuySet, sectorOf, nameOf, taxOf, computedAt } = ctx;
  const trendTag = computeTrendTag(t.price, t.ma20, t.ma50);
  const qualityTag = computeQualityTagV2(t.leverage, t.netMargin);
  const rsRating = computeRsRating(t.return64d, universeReturns64d);
  const stockDivergence = t.rsi < 45 && t.price > t.closes[Math.max(0, t.closes.length - 10)] ? "bearish" : "none";

  const fa = computeFaScoreV2(t, { ...faUniverse, peer: faUniverse.peer ?? [] });
  const taScore = computeTaScore(rsRating, trendTag, t.liquidity, faUniverse.liq, stockDivergence);
  // Không đọc được nguồn sự kiện -> null (bỏ khỏi Smart Score), không gán 50 cho mọi mã.
  const eventScore = ctx.eventsAvailable === false ? null : computeEventImpactScore(sectorOf.get(t.ticker) ?? "Khac", activeEvents);

  const confl = computeConfluence(bias, trendTag, rsRating, qualityTag, breakoutProbability);
  const smartScore = computeSmartScoreV2(fa.score, taScore, eventScore, confl.boost);
  const riskAdjMomentum = computeRiskAdjustedMomentum(t.closes);

  return {
    ticker: t.ticker, companyName: nameOf.get(t.ticker) ?? null, sector: sectorOf.get(t.ticker) ?? null,
    industry: taxOf.get(t.ticker)?.industry ?? null, sectorGroup: taxOf.get(t.ticker)?.sectorGroup ?? null,
    price: t.price, changePct: t.changePct, faScore: fa.score, taScore, eventImpactScore: eventScore, smartScore,
    faBasis: fa.basis, faPeriod: t.faPeriod ?? null, growthBasis: t.growthBasis ?? null, peerGroup: t.peer ?? null,
    roe: t.roe, netMargin: t.netMargin, revenueGrowth: t.revenueGrowth, liquidityValue20: Math.round(t.liquidity),
    // R/R gắn lúc đọc từ vùng hỗ trợ / kháng cự của engine cấu trúc (attachStructureRr) — engine quét không tự suy.
    rsRating, riskAdjustedMomentum: riskAdjMomentum, riskRewardRatio: null, riskRewardBasis: null,
    trendTag, qualityTag,
    confluenceStatusCode: confl.statusCode, confluenceStatusLabel: confl.statusLabel,
    confluenceBoost: confl.boost, confluenceReasonCodes: confl.reasonCodes, breakoutBoostBadge: confl.breakoutBoostBadge,
    piotroskiFScore: t.fScore.score, fScoreMax: t.fScore.max, fScoreApplicable: t.fScore.applicable, fScoreReason: t.fScore.reason,
    foreignNetBuyFlag: foreignNetBuySet.has(t.ticker),
    computedAt, dataAsOf: t.asOf,
  };
}

/**
 * Chấm điểm các mã NGOÀI universe theo bối cảnh của lần quét gần nhất (cùng công thức, cùng phân phối
 * FA/RS và trạng thái VN-Index) -> điểm so sánh được trực tiếp với các mã trong bảng.
 * @param {{ tickers: { ticker, sector?, name?, industry?, sectorGroup? }[], barsByTicker: Map, fundamentals: Map,
 *   context: { bias, breakoutProbability, faUniverse, universeReturns64d, computedAt, events }, foreignNetBuySet?: Set<string>, now?: Date }} input
 */
export function scoreCustom({ tickers, barsByTicker, fundamentals, context, foreignNetBuySet = new Set(), now = new Date() }) {
  const sectorOf = new Map(tickers.map((u) => [u.ticker, u.sector ?? "Khac"]));
  const nameOf = new Map(tickers.map((u) => [u.ticker, u.name ?? null]));
  const taxOf = new Map(tickers.map((u) => [u.ticker, { industry: u.industry ?? null, sectorGroup: u.sectorGroup ?? null }]));
  const activeEvents = toActiveEvents(context.events ?? [], now);
  const items = [], skipped = [];
  for (const u of tickers) {
    const ticker = u.ticker;
    const r = computeTickerData(ticker, barsByTicker.get(ticker) ?? [], fundamentals.get(ticker), u);
    if (r.skip) { skipped.push(r.skip); continue; }
    items.push(scoreTickerData(r.data, { ...context, activeEvents, fundamentals, foreignNetBuySet, sectorOf, nameOf, taxOf }));
  }
  return { items: sortScannerItems(items), skipped };
}

/**
 * Q3: chuỗi giá ĐIỀU CHỈNH CỘNG DỒN cho một mã từ dòng market_daily (OHLC DANH NGHĨA của sàn) + sự kiện quyền — cùng công thức
 * /ta-series và bộ lọc kỹ thuật (adjustOhlcSeries, rồi lưới an toàn khoảng cách > 20%). Thay cho ClosePriceAdjusted của SSI
 * (chỉ áp hệ số đợt quyền GẦN NHẤT cho cả lịch sử). Nến cuối giữ giá danh nghĩa = bảng giá.
 */
export function adjustedScanBars(rows, events) {
  const nominal = rows.filter((r) => r.close > 0).map((r) => ({
    date: r.date, open: r.open || r.close, high: r.high || r.close, low: r.low || r.close, close: r.close,
    volume: r.volume ?? 0, value: r.value ?? null,
  }));
  const adj = adjustOhlcSeries(nominal, events ?? []);
  const fix = repairUnexplainedGaps(adj.bars);
  return { bars: fix.bars.map((b) => ({ ...b, closeAdj: b.close })), applied: adj.applied.length, repaired: fix.repaired.length };
}

/**
 * Q5: R/R từ vùng hỗ trợ / kháng cự gần nhất của engine cấu trúc (bản tóm tắt job 15:47, khung ngày). Bản tóm tắt cũ hơn
 * phiên quét quá 7 ngày -> không gắn (null, không bịa).
 */
export function attachStructureRr(items, summary) {
  const rows = new Map((summary?.rows ?? []).map((r) => [r.t, r]));
  const fresh = (a, b) => a && b && Math.abs(Date.parse(a) - Date.parse(b)) <= 7 * 86_400_000;
  return items.map((i) => {
    const r = rows.get(i.ticker);
    if (!r || !fresh(r.asOf, i.dataAsOf)) return i;
    const rr = riskRewardFromLevels(i.price, r.sup, r.res);
    return { ...i, riskRewardRatio: rr, riskRewardBasis: rr === null ? null : { source: "STRUCTURE_D", support: r.sup, resistance: r.res, asOf: r.asOf } };
  });
}

/** Sắp xếp giống route /api/sieu-quet-ai/scanner của Project A. */
export function sortScannerItems(items) {
  const EXCLUSION_THRESHOLD_RATIO = 3 / 9;
  return [...items].sort((a, b) => {
    const aExcluded = a.piotroskiFScore !== null && a.piotroskiFScore <= Math.floor(a.fScoreMax * EXCLUSION_THRESHOLD_RATIO) ? 1 : 0;
    const bExcluded = b.piotroskiFScore !== null && b.piotroskiFScore <= Math.floor(b.fScoreMax * EXCLUSION_THRESHOLD_RATIO) ? 1 : 0;
    if (aExcluded !== bExcluded) return aExcluded - bExcluded;
    return (b.smartScore ?? 0) - (a.smartScore ?? 0);
  });
}

/** Cờ "NN mua ròng": top 5 mã HOSE có giá trị khối ngoại mua ròng lớn nhất phiên (bản gốc: top 5 bản tin HOSE). */
export function topForeignNetBuy(dailyRows, n = 5) {
  return new Set(dailyRows
    .filter((r) => r.exchange === "HOSE" && (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0) > 0)
    .sort((a, b) => ((b.foreignBuyVal - b.foreignSellVal) - (a.foreignBuyVal - a.foreignSellVal)))
    .slice(0, n)
    .map((r) => r.symbol));
}
