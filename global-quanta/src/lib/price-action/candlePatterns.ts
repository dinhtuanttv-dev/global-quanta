// pa-book-2 (26/11/2026) — 10 mẫu hình Price Action theo ĐÚNG định nghĩa trong sách "Price Action – Hành động giá chuyên sâu" Tập 2
// ("10 mẫu hình Price Action Trader cần phải biết") + trend bar (Tập 3). Mỗi mẫu hình mang `definition` để truy vết.
// Bản pa-v1 cũ: REVERSAL_BAR dùng hình pin (sai sách), KEY_REVERSAL/EXHAUSTION/THREE_BAR_* bị tắt, inside/outside chấp nhận cạnh bằng
// (sách yêu cầu nằm "toàn bộ" trong / bao "toàn bộ"), pin bar loại nến thân bằng 0 (nến búa doji rất phổ biến ở bước giá VN).
// Mẫu hình KHÔNG tự là lệnh: sách nhấn mạnh "thiếu 2 yếu tố, đó là vị trí của mô hình nến, và xu hướng hiện tại" -> lớp setup.
import type { PAParams } from "./params.ts";
import type { Bar, CandleFeature, Direction, PAPattern, PatternId, PatternRole } from "./types.ts";

function makePattern(
  bars: readonly Bar[],
  id: PatternId,
  direction: PAPattern["direction"],
  role: PatternRole,
  originIndex: number,
  confirmedIndex: number,
  evidence: PAPattern["evidence"],
  caveats: string[] = [],
  levels: { trigger?: number | null; stop?: number | null } = {},
): PAPattern {
  const span = bars.slice(originIndex, confirmedIndex + 1);
  const priceLow = Math.min(...span.map((bar) => bar.low));
  const priceHigh = Math.max(...span.map((bar) => bar.high));
  // Mặc định theo sách: mua khi phá đỉnh cao nhất của cụm, cắt lỗ dưới đáy thấp nhất của cụm (bán: đối xứng).
  const trigger = levels.trigger !== undefined ? levels.trigger : direction === "bullish" ? priceHigh : direction === "bearish" ? priceLow : null;
  const stop = levels.stop !== undefined ? levels.stop : direction === "bullish" ? priceLow : direction === "bearish" ? priceHigh : null;
  return {
    id, direction, role, state: "confirmed", originIndex, confirmedIndex,
    originDate: bars[originIndex].date, confirmedDate: bars[confirmedIndex].date,
    priceLow, priceHigh, triggerLevel: trigger, stopLevel: stop, evidence, source: "DERIVED", caveats,
  };
}

/** Sách: pin bar có "1 cái đuôi dài … chiếm phần lớn chiều dài nến", "đuôi còn lại phải gần với phần thân nến". */
export function pinDirection(feature: CandleFeature, params: PAParams): Direction | null {
  if (!(feature.range > 0)) return null;
  if (feature.rangeAtr !== null && feature.rangeAtr < params.pinBar.minRangeAtr) return null;
  const lower = feature.lowerWick / feature.range, upper = feature.upperWick / feature.range;
  const bull = lower >= params.pinBar.minDominantWickRange && upper <= params.pinBar.maxOppositeWickRange;
  const bear = upper >= params.pinBar.minDominantWickRange && lower <= params.pinBar.maxOppositeWickRange;
  if (bull === bear) return null;
  return bull ? "bullish" : "bearish";
}

const dirOf = (bar: Bar) => (bar.close > bar.open ? "bullish" : bar.close < bar.open ? "bearish" : "neutral");

export function detectCandlePatterns(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  params: PAParams,
): PAPattern[] {
  const patterns: PAPattern[] = [];
  const strong = (f: CandleFeature) => f.bodyToRange !== null && f.bodyToRange >= params.bars.strongBodyRange;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const f = features[i];
    if (!f.complete) continue;

    // Trend bar (Tập 3): thân lớn, đóng gần đỉnh/đáy, biên độ ≥ ATR. Chỉ là bối cảnh.
    if (f.bodyToRange !== null && f.closeLocation !== null && f.rangeAtr !== null
      && f.bodyToRange >= params.trendBar.minBodyRange && f.rangeAtr >= params.trendBar.minRangeAtr) {
      if (f.direction === "bullish" && f.closeLocation >= params.trendBar.bullCloseLoc)
        patterns.push(makePattern(bars, "TREND_BAR", "bullish", "context", i, i, { bodyToRange: f.bodyToRange, rangeAtr: f.rangeAtr, closeLocation: f.closeLocation }));
      else if (f.direction === "bearish" && f.closeLocation <= params.trendBar.bearCloseLoc)
        patterns.push(makePattern(bars, "TREND_BAR", "bearish", "context", i, i, { bodyToRange: f.bodyToRange, rangeAtr: f.rangeAtr, closeLocation: f.closeLocation }));
    }

    // Pin bar — mua khi phá "phần đầu" (đỉnh) của pin tăng; cắt lỗ dưới đuôi.
    const pin = pinDirection(f, params);
    if (pin) {
      patterns.push(makePattern(bars, "PIN_BAR", pin, "reversal", i, i, {
        lowerWickToRange: f.lowerWick / f.range, upperWickToRange: f.upperWick / f.range, rangeAtr: f.rangeAtr, definition: "pin-book-v2",
      }, ["Hình dạng nến; chỉ có nghĩa tại hỗ trợ/kháng cự và theo xu hướng"]));
    }

    if (i >= 1) {
      const prev = bars[i - 1];
      const pf = features[i - 1];

      // Nến đảo chiều (sách): tăng = đáy thấp hơn nến trước nhưng đóng cửa tăng (so với giá đóng trước); giảm đối xứng.
      if (bar.low < prev.low && bar.close > prev.close)
        patterns.push(makePattern(bars, "REVERSAL_BAR", "bullish", "reversal", i, i, { priorLow: prev.low, priorClose: prev.close, definition: "reversal-bar-book-v2" }));
      else if (bar.high > prev.high && bar.close < prev.close)
        patterns.push(makePattern(bars, "REVERSAL_BAR", "bearish", "reversal", i, i, { priorHigh: prev.high, priorClose: prev.close, definition: "reversal-bar-book-v2" }));

      // Nến đảo chiều chủ chốt (sách): tăng = mở cửa thấp hơn giá mở nến trước, đóng cửa cao hơn giá đóng nến trước; sách giải thích
      // "nôm na cây nến sau nhận chìm cây nến trước" -> thân nến nhận chìm thân nến trước (không phân biệt màu nến trước).
      // (Chỉ theo câu chữ "mở < mở trước, đóng > đóng trước" thì 37% phiên của HPG 2013–2026 đạt — quá phổ biến để là "chủ chốt".)
      const pTop = Math.max(prev.open, prev.close), pBot = Math.min(prev.open, prev.close);
      if (bar.open < prev.open && bar.close > prev.close && bar.close > bar.open && bar.open <= pBot && bar.close >= pTop && bar.close - bar.open > pTop - pBot)
        patterns.push(makePattern(bars, "KEY_REVERSAL_BAR", "bullish", "reversal", i, i, { priorOpen: prev.open, priorClose: prev.close, definition: "key-reversal-book-v2" }));
      else if (bar.open > prev.open && bar.close < prev.close && bar.close < bar.open && bar.open >= pTop && bar.close <= pBot && bar.open - bar.close > pTop - pBot)
        patterns.push(makePattern(bars, "KEY_REVERSAL_BAR", "bearish", "reversal", i, i, { priorOpen: prev.open, priorClose: prev.close, definition: "key-reversal-book-v2" }));

      // Nến đuối sức (sách): tăng = mở cửa gap xuống, đóng cửa cao hơn giá mở, gap KHÔNG được lấp (đỉnh nến vẫn dưới đáy nến trước).
      if (bar.open < prev.low && bar.close > bar.open && bar.high < prev.low)
        patterns.push(makePattern(bars, "EXHAUSTION_CANDIDATE", "bullish", "reversal", i, i, { gapTop: prev.low, definition: "exhaustion-book-v2" },
          ["Sách: thường kèm khối lượng tăng vọt — xem RVOL của phiên"]));
      else if (bar.open > prev.high && bar.close < bar.open && bar.low > prev.high)
        patterns.push(makePattern(bars, "EXHAUSTION_CANDIDATE", "bearish", "reversal", i, i, { gapBottom: prev.high, definition: "exhaustion-book-v2" },
          ["Sách: thường kèm khối lượng tăng vọt — xem RVOL của phiên"]));

      // Đảo chiều 2 thanh (sách): 2 nến mạnh đuôi ngắn, ngược hướng; nến sau "xoá đi đà" của nến trước. Mua khi phá đỉnh cao nhất 2 nến.
      if (dirOf(prev) === "bearish" && dirOf(bar) === "bullish" && strong(pf) && strong(f) && bar.close >= prev.open)
        patterns.push(makePattern(bars, "TWO_BAR_REVERSAL", "bullish", "reversal", i - 1, i, { definition: "two-bar-book-v2" }));
      else if (dirOf(prev) === "bullish" && dirOf(bar) === "bearish" && strong(pf) && strong(f) && bar.close <= prev.open)
        patterns.push(makePattern(bars, "TWO_BAR_REVERSAL", "bearish", "reversal", i - 1, i, { definition: "two-bar-book-v2" }));

      // Inside bar (sách): "nằm toàn bộ" trong nến mẹ — đỉnh thấp hơn VÀ đáy cao hơn. Mua khi phá đỉnh NẾN MẸ (tiếp diễn xu hướng).
      if (bar.high < prev.high && bar.low > prev.low)
        patterns.push(makePattern(bars, "INSIDE_BAR", "two_sided", "continuation", i - 1, i, { motherHigh: prev.high, motherLow: prev.low, definition: "inside-book-v2" },
          ["Tạm ngưng, không phải đảo chiều; hướng do xu hướng quyết định"], { trigger: prev.high, stop: prev.low }));

      // Outside bar (sách): bao "toàn bộ" nến trước. Chỉ mô tả biến động mở rộng; sách không dùng làm tín hiệu mua trực tiếp.
      if (bar.high > prev.high && bar.low < prev.low)
        patterns.push(makePattern(bars, "OUTSIDE_BAR", f.closeLocation !== null && f.closeLocation >= 0.75 ? "bullish" : f.closeLocation !== null && f.closeLocation <= 0.25 ? "bearish" : "two_sided",
          "context", i, i, { closeLocation: f.closeLocation, definition: "outside-book-v2" }, ["Biến động mở rộng hai phía — chỉ mô tả"]));
    }

    if (i >= 2) {
      const a = bars[i - 2], b = bars[i - 1];
      // Đảo chiều 3 thanh (sách): nến giảm; nến có đỉnh thấp hơn và đáy thấp hơn; nến tăng có đáy cao hơn và đóng cửa cao hơn đỉnh nến trước.
      if (dirOf(a) === "bearish" && b.high < a.high && b.low < a.low && dirOf(bar) === "bullish" && bar.low > b.low && bar.close > b.high)
        patterns.push(makePattern(bars, "THREE_BAR_REVERSAL", "bullish", "reversal", i - 2, i, { definition: "three-bar-book-v2" }));
      else if (dirOf(a) === "bullish" && b.high > a.high && b.low > a.low && dirOf(bar) === "bearish" && bar.high < b.high && bar.close < b.low)
        patterns.push(makePattern(bars, "THREE_BAR_REVERSAL", "bearish", "reversal", i - 2, i, { definition: "three-bar-book-v2" }));
    }

    if (i >= 3) {
      // 3 nến hồi (sách): 3 nến giảm NHỎ liên tiếp rồi 1 nến tăng; mua khi phá đỉnh nến tăng đó. Chỉ có nghĩa trong xu hướng tăng (lớp setup).
      const three = [i - 3, i - 2, i - 1];
      const small = (k: number) => features[k].rangeAtr !== null && features[k].rangeAtr! < params.bars.smallRangeAtr;
      if (three.every((k) => dirOf(bars[k]) === "bearish" && small(k)) && dirOf(bar) === "bullish")
        patterns.push(makePattern(bars, "THREE_BAR_PULLBACK", "bullish", "continuation", i - 3, i, { definition: "three-bar-pullback-book-v2" }, [],
          { trigger: bar.high, stop: Math.min(...three.map((k) => bars[k].low), bar.low) }));
      else if (three.every((k) => dirOf(bars[k]) === "bullish" && small(k)) && dirOf(bar) === "bearish")
        patterns.push(makePattern(bars, "THREE_BAR_PULLBACK", "bearish", "continuation", i - 3, i, { definition: "three-bar-pullback-book-v2" }, [],
          { trigger: bar.low, stop: Math.max(...three.map((k) => bars[k].high), bar.high) }));
    }

    if (i >= 6) {
      // NR7 (sách): nến cuối của chuỗi 7 nến có biên độ ngắn nhất. Mua khi phá đỉnh NR7 nếu xu hướng tăng.
      const window = features.slice(i - 6, i + 1).map((item) => item.range);
      const minRange = Math.min(...window);
      if (f.range === minRange && f.range > 0) {
        patterns.push(makePattern(bars, "NR7", "two_sided", "continuation", i, i, {
          windowBars: 7, range: f.range, tie: window.filter((value) => value === minRange).length > 1, definition: "nr7-book-v2",
        }, ["Nén biến động; hướng do xu hướng quyết định"], { trigger: bar.high, stop: bar.low }));
      }
    }
  }

  return patterns.sort((a, b) => a.confirmedIndex - b.confirmedIndex
    || a.originIndex - b.originIndex || a.id.localeCompare(b.id));
}

export function patternAt(
  patterns: readonly PAPattern[],
  index: number,
  id: PatternId,
  direction?: Direction,
): PAPattern | undefined {
  return patterns.find((pattern) => pattern.confirmedIndex === index
    && pattern.id === id
    && (direction === undefined || pattern.direction === direction));
}
