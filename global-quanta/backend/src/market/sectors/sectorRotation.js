// Lọc ngành (L1) — dựng xoay vòng ngành cho TOÀN BỘ ngành ICB cấp 2 (19 ngành) + cấp 3 (khi đủ ≥ 3 mã thanh khoản):
// chỉ số ngành tổng hợp từ universe (giá điều chỉnh cộng dồn, chỉ đọc kho) -> RRG tuần JdK so với VN-Index -> sự kiện chuyển
// góc phần tư (đã lọc nhiễu, chỉ tuần đã đóng). Lưu 2 KV: bản tóm tắt (tab Lọc ngành) và lịch sử đầy đủ (engine thống kê
// ở Project A — L2). Không gọi SSI, không ghi bảng nào ngoài KV.

import { isPartialWeek } from "../strategies/patternScan.js";
import { buildSectorIndex, computeRrg, INDEX_PARAMS, quadrantTransitions, RRG_PARAMS, weeklyCloses } from "./rrg.js";
import { SECTOR_VALIDATION } from "./validation.js";
import { rotationMatrix, rsPercentiles, sectorFlow, sectorState, totalValueByDate } from "./flow.js";

export const SECTOR_RRG_ENGINE = "sector-rrg/L5";
export const SECTOR_RRG_KV = "sectors:rrg";
export const SECTOR_RRG_HISTORY_KV = "sectors:rrg:history";

/** Pearson correlation of aligned daily returns; null until there are enough paired observations. */
export function rollingMarketCorrelation(indexSeries, benchmarkBars, { lookback = 60, minObservations = 30 } = {}) {
  const benchmarkByDate = new Map((benchmarkBars ?? []).map((bar) => [bar.date, Number(bar.close)]));
  const indexByDate = new Map((indexSeries ?? []).map((bar) => [bar.date, Number(bar.close)]));
  const dates = [...benchmarkByDate.keys()].sort();
  const sectorReturns = [], benchmarkReturns = [];
  for (let i = 1; i < dates.length; i++) {
    const previous = dates[i - 1], current = dates[i];
    const sectorPrev = indexByDate.get(previous), sectorNow = indexByDate.get(current);
    const benchmarkPrev = benchmarkByDate.get(previous), benchmarkNow = benchmarkByDate.get(current);
    // Do not bridge a missing sector-index observation across multiple benchmark sessions.
    if (sectorPrev > 0 && sectorNow > 0 && benchmarkPrev > 0 && benchmarkNow > 0) {
      sectorReturns.push(sectorNow / sectorPrev - 1);
      benchmarkReturns.push(benchmarkNow / benchmarkPrev - 1);
    }
  }
  const x = sectorReturns.slice(-lookback), y = benchmarkReturns.slice(-lookback), n = x.length;
  if (n < minObservations) return { value: null, observations: n, lookback, status: "insufficient_history" };
  const mx = x.reduce((sum, value) => sum + value, 0) / n;
  const my = y.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0, varianceX = 0, varianceY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    covariance += dx * dy; varianceX += dx * dx; varianceY += dy * dy;
  }
  const denominator = Math.sqrt(varianceX * varianceY);
  if (!(denominator > 0)) return { value: null, observations: n, lookback, status: "zero_variance" };
  return { value: Math.max(-1, Math.min(1, covariance / denominator)), observations: n, lookback, status: "ready" };
}

/**
 * @param universe  [{ ticker, name?, sector? }]
 * @param icb       { levels, symbols } (icbTaxonomy.js)
 * @param seriesOf  Map(ticker -> bars) giá điều chỉnh
 * @param benchBars nến ngày VN-Index
 */
export function buildSectorRotation({ universe, icb, seriesOf, benchBars, tagsOf = () => [], now = Date.now }) {
  const dates = benchBars.map((b) => b.date);
  const benchWeekly = weeklyCloses(benchBars.map((b) => ({ date: b.date, close: b.close })));
  const lastDate = dates.at(-1) ?? null;
  const partialWeek = isPartialWeek(lastDate);
  const closedThrough = partialWeek ? benchWeekly.at(-2)?.week ?? null : benchWeekly.at(-1)?.week ?? null;
  const tickers = universe.map((u) => u.ticker).filter((t) => seriesOf.get(t)?.length);
  const sectors = [], history = {}, unclassified = [], missing = [];
  const totals = totalValueByDate(seriesOf), rs = rsPercentiles(seriesOf);
  for (const t of tickers) if (!icb.symbols[t]?.l2) unclassified.push(t);
  for (const level of [2, 3]) {
    for (const it of icb.levels[level]) {
      const members = tickers.filter((t) => icb.symbols[t]?.[`l${level}`] === it.code).map((t) => ({ ticker: t, bars: seriesOf.get(t) }));
      if (members.length < INDEX_PARAMS.minMembers) { if (level === 2) missing.push({ code: it.code, name: it.name, reason: `chỉ ${members.length} mã trong universe (VNDirect: ${it.count})` }); continue; }
      // cấp 3 trùng nguyên rổ với cấp 2 cha (ví dụ Ngân hàng 8300/8350) -> bỏ bản cấp 3 để không lặp ngành
      if (level === 3) { const par = sectors.find((s) => s.code === it.parent); if (par && par.universeMembers === members.length) continue; }
      const idx = buildSectorIndex(members, dates);
      if (idx.series.length < 120) { if (level === 2) missing.push({ code: it.code, name: it.name, reason: `chưa đủ ${INDEX_PARAMS.minMembers} mã thanh khoản để dựng chỉ số` }); continue; }
      const weekly = weeklyCloses(idx.series);
      const rrg = computeRrg(weekly, benchWeekly);
      if (rrg.length < 8) { if (level === 2) missing.push({ code: it.code, name: it.name, reason: `lịch sử chỉ số ${weekly.length} tuần — cần ≥ ${RRG_PARAMS.window + 8} tuần để tính RRG (chờ nạp thêm lịch sử)` }); continue; }
      const tr = quadrantTransitions(rrg, { closedThrough });
      const last = rrg.at(-1), lastClosed = [...rrg].reverse().find((r) => !closedThrough || r.week <= closedThrough) ?? last;
      const lastInto = (q) => [...tr].reverse().find((x) => x.to === q) ?? null;
      const w = idx.rebalances.at(-1)?.weights ?? {};
      const flow = sectorFlow({ members, index: idx.series, dates, totals, rs, tagsOf });
      const marketCorrelation = rollingMarketCorrelation(idx.series, benchBars);
      sectors.push({
        code: it.code, level, name: it.name, en: it.en, parent: it.parent, universeMembers: members.length, indexMembers: idx.series.at(-1)?.n ?? 0,
        thin: (idx.series.at(-1)?.n ?? 0) < INDEX_PARAMS.thinBelow,
        constituents: Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ticker, weight]) => ({ ticker, weight })),
        latest: last, latestClosed: lastClosed, quadrant: lastClosed.quadrant, liveQuadrant: last.quadrant,
        tail: rrg.slice(-RRG_PARAMS.tail).map(({ week, date, ratio, momentum, quadrant }) => ({ week, date, ratio, momentum, quadrant })),
        transitions: tr.length, lastTransition: tr.at(-1) ?? null, lastIntoImproving: lastInto("IMPROVING"),
        weeksSinceImproving: lastInto("IMPROVING") ? rrg.filter((r) => r.week > lastInto("IMPROVING").week && (!closedThrough || r.week <= closedThrough)).length : null,
        historyWeeks: rrg.length, from: idx.series[0].date,
        flow, state: sectorState(flow, lastClosed.quadrant),
        // 4D research extension: canonical RRG axes + observed turnover-share anomaly + actual market correlation.
        // `flow.share.z` is the existing point-in-time z-score of sector traded-value share, not synthetic volume.
        rrg4d: {
          version: "sector-rrg-4d/v1",
          asOf: lastDate,
          flowShareZ: Number.isFinite(flow?.share?.z) ? flow.share.z : null,
          marketCorrelation60: marketCorrelation.value,
          correlationObservations: marketCorrelation.observations,
          correlationStatus: marketCorrelation.status,
          method: "x/y=weekly JdK RS-Ratio/RS-Momentum; z=250-session z-score of traded-value share; color=Pearson correlation of daily sector/VNINDEX returns over up to 60 paired sessions",
        },
      });
      history[it.code] = { code: it.code, level, name: it.name, rrg, transitions: tr, index: idx.series.map((b) => [b.date, b.close, b.n]), rebalances: idx.rebalances.slice(-3) };
    }
  }
  const summary = {
    engine: SECTOR_RRG_ENGINE, generatedAt: new Date(now()).toISOString(), dataAsOf: lastDate, benchmark: "VNINDEX",
    partialWeek, closedThrough, params: { rrg: RRG_PARAMS, index: INDEX_PARAMS },
    method: "Chỉ số ngành = rổ mã ICB trong universe (GTGD TB60 ≥ 300 triệu, ≥ 2 mã; < 3 mã = rổ mỏng), trọng số GTGD 60 phiên (trần 25%/mã), tái cân bằng đầu tháng, giá điều chỉnh. RRG tuần (W-FRI) so VN-Index: RS-Ratio = 100 + z(EMA4 RS, 26 tuần), RS-Momentum = 100 + z(EMA4 ΔRS-Ratio, 26 tuần) — 1 đơn vị = 1σ; góc phần tư lọc nhiễu bằng vùng đệm 0,15σ; sự kiện chỉ trên tuần đã đóng.",
    coverage: { universe: universe.length, withSeries: tickers.length, classified: tickers.length - unclassified.length, unclassified: unclassified.slice(0, 50),
      l2Total: icb.levels[2].length, l2Covered: sectors.filter((x) => x.level === 2).length, missing },
    rotation: { 2: rotationMatrix(sectors.filter((x) => x.level === 2)), 3: rotationMatrix(sectors.filter((x) => x.level === 3)) },
    evidence: { label: SECTOR_VALIDATION.label, reason: SECTOR_VALIDATION.conclusion, validation: SECTOR_VALIDATION },
    sectors,
  };
  return { summary, history: { engine: SECTOR_RRG_ENGINE, dataAsOf: lastDate, closedThrough, sectors: history } };
}
