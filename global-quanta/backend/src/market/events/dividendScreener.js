// BL1 (07/11/2026) — DS-v1: một nguồn dữ liệu THẬT duy nhất cho Bộ lọc cổ phiếu (tab Cổ tức), thay 5 API Project A.
// Ghép trên Gateway, không gọi mạng khi đọc:
//   giá / xu hướng MA50–MA200 / RSI / thanh khoản / RS   <- bản quét Siêu Quét (KV scanner:latest)
//   cổ tức (12 tháng, đợt kế tiếp, lịch sử theo năm tài chính) <- kho sự kiện VNDirect (corp-events)
//   P/E, P/B, ROE, nợ, chi trả, dòng tiền, F / M / Z        <- KQKD theo quý (BCTC VNDirect, 4 quý gần nhất)
//   giá quanh GDKHQ                                          <- XD-v1
// Chỉ tính số khi đủ dữ liệu; thiếu -> null (giao diện ghi "chưa có"). Không có giá trị mặc định.
import { dividendQuality } from "./dividendQuality.js";
import { FM_VERSION, rankScores, scoreCrossSection } from "./factorModel.js";
/** BL3: nhãn của điểm FM-v1 theo kết quả kiểm định đặt trước BL-r1 (BL-prereg.md). */
export const FM_LABEL = "MÔ TẢ"; // BL-r1 KHÔNG ĐẠT (H3 AUC 0,485) — xem BL-prereg.md
export const DS_VERSION = "DS-v2 (2026-11-07)";
export const TAX = 0.05;

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Cổ tức của một mã từ các sự kiện chuẩn hoá (corp-events). today: ISO. */
export function dividendProfile(events, today) {
  const cash = events.filter((e) => e.cat === "CASH" && e.ex && e.cash > 0);
  const yearAgo = addDays(today, -365);
  const past = cash.filter((e) => e.ex <= today).sort((a, b) => a.ex.localeCompare(b.ex));
  const ttm = past.filter((e) => e.ex > yearAgo);
  const next = cash.filter((e) => e.ex > today).sort((a, b) => a.ex.localeCompare(b.ex))[0] ?? null;
  const stock12 = events.filter((e) => (e.cat === "STOCK" || e.cat === "BONUS") && e.ex && e.ex > yearAgo && e.ex <= today).reduce((s, e) => s + (e.ratio ?? 0), 0);
  const agm = events.filter((e) => e.cat === "AGM" && e.meeting && e.meeting >= today).sort((a, b) => a.meeting.localeCompare(b.meeting))[0] ?? null;
  // Theo năm tài chính được chia (divYear của VNDirect; thiếu thì năm GDKHQ).
  const byYear = new Map();
  for (const e of past) { const y = e.year ?? Number(e.ex.slice(0, 4)); byYear.set(y, (byYear.get(y) ?? 0) + e.cash); }
  const thisYear = Number(today.slice(0, 4));
  // Năm tài chính gần nhất đã có chi trả (N−1 hoặc N−2: cổ tức năm N thường trả trong năm N+1).
  const lastFy = byYear.has(thisYear - 1) ? thisYear - 1 : byYear.has(thisYear - 2) ? thisYear - 2 : null;
  let streak = 0; if (lastFy != null) for (let y = lastFy; byYear.has(y); y--) streak += 1;
  const cagr3 = lastFy != null && byYear.get(lastFy - 3) > 0 && byYear.get(lastFy) > 0 ? Math.pow(byYear.get(lastFy) / byYear.get(lastFy - 3), 1 / 3) - 1 : null;
  let cuts5 = 0, years5 = 0;
  if (lastFy != null) for (let y = lastFy; y > lastFy - 5; y--) { const a = byYear.get(y), b = byYear.get(y - 1); if (fin(b) && b > 0) { years5 += 1; if (!(a > 0) || a < 0.9 * b) cuts5 += 1; } }
  return {
    ttmCash: ttm.reduce((s, e) => s + e.cash, 0), payments12m: ttm.length, stockPct12m: stock12 || 0,
    lastEx: past.at(-1)?.ex ?? null, lastCash: past.at(-1)?.cash ?? null,
    nextEx: next?.ex ?? null, nextCash: next?.cash ?? null, nextPay: next?.pay ?? null, nextRecord: next?.record ?? null, agmNext: agm?.meeting ?? null,
    lastFy, lastFyCash: lastFy != null ? byYear.get(lastFy) : null, streak, cagr3: r4(cagr3), cuts5, years5,
    history: [...byYear].sort((a, b) => a[0] - b[0]).slice(-10).map(([y, c]) => [y, c]),
  };
}

/** Một dòng Bộ lọc. scan: mục bản quét; kq: dòng tóm tắt KQKD; div: dividendProfile; ex: tóm tắt XD-v1. */
export function screenerRow({ t, uni, scan, kq, div, ex, dqBase = null }) {
  const price = fin(scan?.price) && scan.price > 0 ? scan.price : null;
  const eps = fin(kq?.ttm?.eps) ? kq.ttm.eps : null;
  const gross = price && div ? div.ttmCash / price : null;
  const payout = eps && eps > 0 && div ? div.ttmCash / eps : null;
  const shares = eps && eps > 0 && fin(kq?.ttm?.npat) ? kq.ttm.npat / eps : null;
  const fcf = fin(kq?.ttm?.cfo) ? kq.ttm.cfo - Math.abs(fin(kq?.ttm?.capex) ? kq.ttm.capex : 0) : null;
  const paid = shares && div?.ttmCash > 0 ? div.ttmCash * shares : null;
  return {
    t, name: uni?.name ?? scan?.companyName ?? t, sector: uni?.industry ?? scan?.industry ?? uni?.sector ?? null, sectorGroup: uni?.sectorGroup ?? scan?.sectorGroup ?? null,
    price, changePct: scan?.changePct ?? null, liquidity20: scan?.liquidityValue20 ?? null, mcap: fin(kq?.mcap) ? kq.mcap : null,
    trend: scan?.priceTrend ?? null, ma50: scan?.ma50 ?? null, ma200: scan?.ma200 ?? null, rsi14: scan?.rsi14 ?? null, rsRating: scan?.rsRating ?? null,
    yieldGross: r4(gross), yieldNet: r4(fin(gross) ? gross * (1 - TAX) : null),
    div: div ? { ttmCash: div.ttmCash, payments12m: div.payments12m, stockPct12m: div.stockPct12m, lastEx: div.lastEx, lastCash: div.lastCash, nextEx: div.nextEx, nextCash: div.nextCash, nextPay: div.nextPay, nextRecord: div.nextRecord, agmNext: div.agmNext, lastFy: div.lastFy, lastFyCash: div.lastFyCash, streak: div.streak, cagr3: div.cagr3, cuts5: div.cuts5, years5: div.years5, history: div.history } : null,
    fund: kq ? {
      quarter: kq.quarter, tpl: kq.tpl,
      pe: price && eps && eps > 0 ? r4(price / eps) : null, pb: fin(kq.mcap) && fin(kq.equity) && kq.equity > 0 ? r4(kq.mcap / kq.equity) : null,
      roe: kq.roe ?? null, de: kq.kpi?.debtToEquity ?? null, interestCover: kq.kpi?.interestCover ?? null, netDebtEbitda: kq.kpi?.netDebtToEbitda ?? null,
      netMargin: kq.netMarginTtm ?? null, growthTtm: kq.ttmGrowth?.value ?? null, npatYoY: kq.npatYoY?.value ?? null, epsTtm: eps,
      payout: r4(payout), fcfCover: paid && fin(fcf) ? r4(fcf / paid) : null, cfoToNpat: kq.cfoToNpat ?? null, accrual: kq.accrual ?? null,
      f: kq.f ?? null, m: kq.m ?? null, mFlag: kq.mFlag ?? null, z: kq.z ?? null, zZone: kq.zZone ?? null, flags: kq.flags ?? [],
    } : null,
    ex: ex ? { n: ex.n, dropMedian: ex.dropRatioMedian, fillWithin20: ex.fillWithin20, fillDaysMedian: ex.fillDaysMedian } : null,
    // BL2: lợi suất chuẩn hoá, độ bền, Lintner, rủi ro, cờ bẫy lợi suất (MÔ TẢ).
    dq: dqBase ? dividendQuality({ series: dqBase.series ?? [], price, mcap: fin(kq?.mcap) ? kq.mcap : null, ttmCash: div?.ttmCash ?? 0, fy: div, risk: dqBase.risk ?? null,
      kq: kq ? { cfoToNpat: kq.cfoToNpat ?? null, netDebtEbitda: kq.kpi?.netDebtToEbitda ?? null, growthTtm: kq.ttmGrowth?.value ?? null, nowcastEst: kq.nowcast?.est ?? null } : null,
      financial: ["bank", "sec", "ins"].includes(kq?.tpl ?? dqBase.tpl) }) : null,
  };
}

/** Toàn bộ danh mục. */
export function buildScreener({ universe, scanItems, kqRows, eventsByTicker, exByTicker, dqByTicker = {}, today, asOf = {} }) {
  const scan = new Map((scanItems ?? []).map((x) => [x.ticker, x]));
  const kq = new Map((kqRows ?? []).map((x) => [x.t, x]));
  const rows = (universe ?? []).map((u) => {
    const ev = eventsByTicker.get(u.ticker) ?? [];
    return screenerRow({ t: u.ticker, uni: u, scan: scan.get(u.ticker), kq: kq.get(u.ticker), div: dividendProfile(ev, today), ex: exByTicker?.[u.ticker] ?? null, dqBase: dqByTicker?.[u.ticker] ?? null });
  });
  // BL3: điểm FM-v1 toàn mặt cắt (z theo nhóm ngành), xếp hạng + ngũ phân vị.
  const sectorOf = new Map((universe ?? []).map((u) => [u.ticker, u.sectorGroup ?? u.industry ?? "?"]));
  const ranked = rankScores(scoreCrossSection(rows.map((r) => ({ t: r.t, sector: sectorOf.get(r.t), f: dqByTicker?.[r.t]?.fm ?? null }))));
  for (const r of rows) { const s = ranked.get(r.t); r.fm = s ? { version: FM_VERSION, label: FM_LABEL, score: Math.round(s.score * 1000) / 1000, groups: Object.fromEntries(Object.entries(s.groups).map(([g, v]) => [g, v == null ? null : Math.round(v * 1000) / 1000])), rank: s.rank, of: s.of, quintile: s.quintile, pct: Math.round(s.pct * 1000) / 1000 } : null; }
  const cov = (f) => rows.filter(f).length;
  return { version: DS_VERSION, today, asOf, count: rows.length,
    coverage: { price: cov((r) => r.price), yield: cov((r) => r.yieldGross != null), pe: cov((r) => r.fund?.pe != null), payout: cov((r) => r.fund?.payout != null), trend: cov((r) => r.trend), f: cov((r) => r.fund?.f != null), fcfCover: cov((r) => r.fund?.fcfCover != null), lintner: cov((r) => r.dq?.lintner?.ok), risk: cov((r) => r.dq?.risk), trap: cov((r) => r.dq?.trap), fm: cov((r) => r.fm) },
    rows };
}

/**
 * Dịch vụ: ghép khi có yêu cầu, đệm theo mốc cập nhật của từng nguồn (bản quét, KQKD, sự kiện, XD-v1) — đổi nguồn nào thì dựng lại.
 * getKv(key) -> value; getKqSummary() -> doc tóm tắt KQKD; getEvents() -> doc corp-events; getEx() -> doc XD-v1.
 */
export function createDividendScreener({ getKv, getKqSummary, getEvents, getEx, getDq = () => null, now = Date.now }) {
  let memo = null, memoKey = null;
  async function get() {
    const [uni, scan, kq] = await Promise.all([getKv("scanner:universe"), getKv("scanner:latest"), getKqSummary()]);
    const ev = getEvents(), ex = getEx(), dq = getDq();
    const today = new Date(now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const key = [today, uni?.builtAt, scan?.generatedAt ?? scan?.computedAt, kq?.builtAt ?? kq?.asOf, ev?.fetchedAt, ex?.builtAt, dq?.builtAt].join("|");
    if (memo && memoKey === key) return memo;
    const byT = new Map(); for (const e of ev?.events ?? []) (byT.get(e.t) ?? byT.set(e.t, []).get(e.t)).push(e);
    memo = buildScreener({ universe: uni?.tickers ?? [], scanItems: scan?.items ?? [], kqRows: kq?.rows ?? [], eventsByTicker: byT, exByTicker: ex?.byTicker ?? {}, dqByTicker: dq?.byTicker ?? {}, today,
      asOf: { scanner: scan?.generatedAt ?? null, scannerData: scan?.dataAsOf ?? null, kqkd: kq?.latestQuarter ?? null, kqkdBuilt: kq?.builtAt ?? null, events: ev?.fetchedAt ?? null, exStudy: ex?.builtAt ?? null, dq: dq?.builtAt ?? null } });
    memoKey = key;
    return memo;
  }
  return { get };
}
