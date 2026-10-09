// Pattern Scanner v2 (Martin Pring) — P2: chạy engine pring/ trên universe trong job scanStrategies (15:45), cả khung NGÀY
// và khung TUẦN (resample W-FRI như SEPA; tuần đang diễn ra = nến tuần tạm tính tới phiên cuối, ghi `partialWeek`).
//
// KV strategies:patterns chỉ lưu BẢN TÓM TẮT mỗi mô hình (bản đầy đủ ≈ 3 KB/mô hình -> ≈ 2,5 MB cho cả universe);
// bảng phụ đọc chi tiết qua GET /api/market/strategies/patterns/:symbol (patternDetail — tính theo yêu cầu, cùng chuỗi giá).
// Kiểm định đặt trước P3 (pring/validation.js): không nhóm mô hình nào đạt ngoài mẫu, điểm không xếp hạng được -> EXPERIMENTAL.
// P2 KHÔNG ghi sổ tín hiệu (SCR_PAT_* bắt đầu từ P4 theo kế hoạch đã duyệt).

import { PATTERN_ENGINE, PRING, preparePattern, scanPatterns } from "./pring/index.js";
import { toWeekly, weekFriday } from "./sepa/indicators.js";
import { PRING_VALIDATION } from "./pring/validation.js";

export const PATTERNS_ENGINE = PATTERN_ENGINE;
export const PATTERN_TIMEFRAMES = Object.freeze(["D", "W"]);
/** Số nến tuần tối thiểu (scanPatterns cần t ≥ 60). */
const MIN_WEEKS = 61;
const ACTIVE = new Set(["BREAKOUT", "CONFIRMED", "PULLBACK"]);
const round = (x, nd = 4) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : x ?? null);
const roundPx = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : x ?? null);

/** Nến tuần từ nến ngày; `date` = phiên cuối tuần (thời điểm nến tuần được biết), `weekStart` = phiên đầu tuần. */
export function weeklyBars(bars) {
  const S = preparePattern(bars);
  if (!S.n) return [];
  return toWeekly(S, S.n - 1).map((w) => ({ date: S.date[w.end], weekStart: S.date[w.start], open: w.open, high: w.high, low: w.low, close: w.close, volume: w.volume }));
}

/** Tuần cuối chưa trọn khi phiên cuối không phải thứ Sáu của tuần đó. */
export const isPartialWeek = (lastDate) => Boolean(lastDate) && weekFriday(lastDate) !== lastDate;

/** Phân tích đầy đủ (khung ngày + tuần) cho một chuỗi — dùng chung cho job (rồi tóm tắt) và bảng phụ. */
export function analyzePatterns(bars) {
  const S = preparePattern(bars);
  const daily = S.n > 60 ? scanPatterns(S, S.n - 1) : [];
  const wk = weeklyBars(bars);
  const weekly = wk.length >= MIN_WEEKS ? scanPatterns(preparePattern(wk), wk.length - 1) : [];
  return {
    daily: daily.map((p) => ({ ...p, timeframe: "D" })),
    weekly: weekly.map((p) => ({ ...p, timeframe: "W" })),
    weeks: wk.length, partialWeek: isPartialWeek(bars.at(-1)?.date),
  };
}

/** Bản tóm tắt một mô hình cho danh sách. */
export function summarizePattern(p) {
  const failed = (p.checks ?? []).filter((c) => c.ok === false).length;
  return {
    timeframe: p.timeframe, type: p.type, label: p.label, family: p.family, familyLabel: p.familyLabel, subLabel: p.subLabel ?? null,
    dir: p.dir, role: p.role, degree: p.degree, state: p.state, stateLabel: p.stateLabel, score: p.score,
    startDate: p.startDate, endDate: p.endDate, width: p.width, heightPct: round(p.heightPct, 2),
    levelNow: roundPx(p.levelNow), distancePct: round(p.distancePct, 2),
    breakoutDate: p.breakout?.date ?? null, confirmDate: p.breakout?.confirmDate ?? null, breakoutVolRatio: round(p.breakout?.volRatio, 2),
    failure: p.failure ?? null, targets: (p.targets ?? []).map(roundPx), targetsHit: (p.targetsHit ?? []).map((x) => x.k),
    plan: p.plan ? { confirmed: p.breakout?.confirmDate != null, entry: roundPx(p.plan.entry), stop: roundPx(p.plan.stop), target: roundPx(p.plan.target), rr: round(p.plan.rr, 2), rrOk: p.plan.rr != null ? p.plan.rr >= PRING.minRewardRisk : null } : null,
    checksOk: (p.checks ?? []).length - failed, checksTotal: (p.checks ?? []).length,
    barWarn: (p.barSignals?.warn ?? []).map((b) => b.kind), barConfirm: (p.barSignals?.confirm ?? []).map((b) => b.kind),
    withTrend: p.context?.withTrend ?? null, counterTrend: p.context?.counterTrend ?? null, divergence: p.context?.divergence ?? null,
  };
}

/** Hạng để chọn mô hình chính / xếp danh sách: đang hiệu lực (phá vỡ/xác nhận/pullback) > hình thành > đạt mục tiêu > thất bại; tăng trước giảm. */
export function patternRank(p) {
  const st = ACTIVE.has(p.state) ? 4 : p.state === "FORMING" ? 3 : p.state.startsWith("TARGET") ? 2 : 1;
  return st * 1000 + (p.dir === "bull" ? 200 : 0) + (p.timeframe === "W" ? 50 : 0) + (p.score ?? 0);
}

/**
 * Quét universe (đã qua cổng giá/thanh khoản ở technicalFilters).
 * @returns { results, errors, counts }
 */
export function scanPatternUniverse({ eligible }) {
  const results = [], errors = [];
  const counts = { byState: {}, byFamily: {}, byTimeframe: { D: 0, W: 0 }, bull: 0, bear: 0 };
  for (const { item, bars, gate, priceBasis } of eligible) {
    try {
      const a = analyzePatterns(bars);
      const patterns = [...a.daily, ...a.weekly].map(summarizePattern).sort((x, y) => patternRank(y) - patternRank(x));
      if (!patterns.length) continue;
      for (const p of patterns) {
        counts.byState[p.state] = (counts.byState[p.state] ?? 0) + 1;
        counts.byFamily[p.family] = (counts.byFamily[p.family] ?? 0) + 1;
        counts.byTimeframe[p.timeframe]++;
        counts[p.dir]++;
      }
      const primary = patterns[0];
      results.push({
        ticker: item.ticker, name: item.name ?? null, sector: item.sector ?? null,
        status: primary.state, dir: primary.dir, type: primary.type, timeframe: primary.timeframe, date: bars.at(-1).date,
        metrics: { score: primary.score, rank: patternRank(primary), patterns: patterns.length },
        patterns, partialWeek: a.partialWeek, // patterns[0] = mô hình chính
        liquidity: { price: gate.price, avgValue20: gate.avgValue20 }, priceBasis, bars: bars.length,
      });
    } catch (error) {
      errors.push({ ticker: item.ticker, reason: "INVALID_DATA", message: error instanceof Error ? error.message : String(error) });
    }
  }
  results.sort((x, y) => y.metrics.rank - x.metrics.rank || x.ticker.localeCompare(y.ticker));
  return { results, errors, counts };
}

/** Bằng chứng: kiểm định đặt trước P3 (pring/validation.js) — không nhóm nào đạt -> EXPERIMENTAL, chỉ hiển thị. */
export const PATTERN_EVIDENCE = Object.freeze({
  label: PRING_VALIDATION.label,
  reason: PRING_VALIDATION.conclusion,
  validation: PRING_VALIDATION,
  all: { n: PRING_VALIDATION.H1.G2.oos.n + PRING_VALIDATION.H1.G3.oos.n },
});

/** Nến gọn [date, o, h, l, c, v] để vẽ trong bảng phụ. */
const compact = (b) => [b.date, roundPx(b.open), roundPx(b.high), roundPx(b.low), roundPx(b.close), Math.round(b.volume ?? 0)];

/** Chi tiết một mã cho bảng phụ: mô hình đầy đủ (hình học, vòng đời, checklist) + nến ngày/tuần để vẽ. */
export function patternDetail(symbol, series, { dailyBars = 320 } = {}) {
  const bars = (series?.bars ?? []).filter((b) => !b.partial && b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0)
    .map((b) => ({ ...b, high: Math.max(b.high, b.open, b.close), low: Math.min(b.low, b.open, b.close) }));
  if (!bars.length) return null;
  const a = analyzePatterns(bars);
  const wk = weeklyBars(bars);
  return {
    symbol, engine: PATTERNS_ENGINE, dataAsOf: bars.at(-1).date, priceBasis: series?.priceBasis ?? "UNKNOWN", warnings: series?.warnings ?? [],
    evidence: PATTERN_EVIDENCE, partialWeek: a.partialWeek,
    daily: a.daily, weekly: a.weekly,
    bars: { daily: bars.slice(-dailyBars).map(compact), weekly: wk.map((w) => [...compact(w), w.weekStart]) },
  };
}
