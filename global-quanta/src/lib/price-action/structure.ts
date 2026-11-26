import { tickAt } from "./math.ts";
import type { Bar, CandleFeature, PASwing, TrendContext, TrendState } from "./types.ts";

interface PivotCandidate {
  index: number;
  confirmedIndex: number;
  kind: "high" | "low";
  price: number;
}

export function detectConfirmedSwings(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  left: number,
  right: number,
  customTickSize?: (price: number) => number,
): PASwing[] {
  const candidates: PivotCandidate[] = [];
  for (let i = left; i + right < bars.length; i++) {
    let high = true;
    let low = true;
    for (let j = i - left; j < i && (high || low); j++) {
      if (bars[j].high >= bars[i].high) high = false;
      if (bars[j].low <= bars[i].low) low = false;
    }
    for (let j = i + 1; j <= i + right && (high || low); j++) {
      if (bars[j].high > bars[i].high) high = false;
      if (bars[j].low < bars[i].low) low = false;
    }
    if (high) candidates.push({ index: i, confirmedIndex: i + right, kind: "high", price: bars[i].high });
    if (low) candidates.push({ index: i, confirmedIndex: i + right, kind: "low", price: bars[i].low });
  }
  candidates.sort((a, b) => a.confirmedIndex - b.confirmedIndex || a.index - b.index);

  const swings: PASwing[] = [];
  let priorHigh: PivotCandidate | null = null;
  let priorLow: PivotCandidate | null = null;
  for (const pivot of candidates) {
    const atr = features[pivot.confirmedIndex]?.atr ?? 0;
    const tolerance = Math.max(2 * tickAt(pivot.price, customTickSize), 0.05 * atr);
    const prior = pivot.kind === "high" ? priorHigh : priorLow;
    let label: PASwing["label"] = "unclassified";
    if (prior) {
      const delta = pivot.price - prior.price;
      if (Math.abs(delta) <= tolerance) label = "equal";
      else if (pivot.kind === "high") label = delta > 0 ? "HH" : "LH";
      else label = delta > 0 ? "HL" : "LL";
    }
    const swing: PASwing = {
      kind: pivot.kind,
      price: pivot.price,
      label,
      originIndex: pivot.index,
      confirmedIndex: pivot.confirmedIndex,
      originDate: bars[pivot.index].date,
      confirmedDate: bars[pivot.confirmedIndex].date,
    };
    swings.push(swing);
    if (pivot.kind === "high") priorHigh = pivot;
    else priorLow = pivot;
  }
  return swings;
}

/**
 * Trạng thái cấu trúc tại từng phiên (một lượt, không nhìn trước):
 * - tăng khi swing high đã xác nhận gần nhất là HH và swing low gần nhất là HL; giảm khi LH + LL; đủ hai loại nhưng khác -> hỗn hợp;
 *   swing đầu tiên của mỗi loại chưa có nhãn -> chưa xác định.
 * - Sách: "Xu hướng tăng bị phá vỡ khi giá phá xuống swing low cấu trúc gần nhất" -> khi một giá ĐÓNG CỬA sau phiên xác nhận swing low
 *   nằm dưới đáy đó, trạng thái tăng hạ thành hỗn hợp (broken = true) cho tới khi có swing mới. Giảm: đối xứng với swing high.
 */
export function trendSeries(swings: readonly PASwing[], bars: readonly Bar[]): { state: TrendState; broken: boolean }[] {
  const byConfirm = new Map<number, PASwing[]>();
  for (const sw of swings) { const l = byConfirm.get(sw.confirmedIndex) ?? []; l.push(sw); byConfirm.set(sw.confirmedIndex, l); }
  let hi: PASwing | null = null, lo: PASwing | null = null, brokeLow = false, brokeHigh = false;
  return bars.map((bar, i) => {
    for (const sw of byConfirm.get(i) ?? []) {
      if (sw.kind === "high") { hi = sw; brokeHigh = false; } else { lo = sw; brokeLow = false; }
    }
    if (lo && i > lo.confirmedIndex && bar.close < lo.price) brokeLow = true;
    if (hi && i > hi.confirmedIndex && bar.close > hi.price) brokeHigh = true;
    const h = hi?.label, l = lo?.label;
    let state: TrendState = "undetermined", broken = false;
    if (!h || !l || h === "unclassified" || l === "unclassified") state = "undetermined";
    else if (h === "HH" && l === "HL") { state = brokeLow ? "mixed" : "bullish"; broken = brokeLow; }
    else if (h === "LH" && l === "LL") { state = brokeHigh ? "mixed" : "bearish"; broken = brokeHigh; }
    else state = "mixed";
    return { state, broken };
  });
}

function latestLabel(swings: readonly PASwing[], kind: "high" | "low") {
  const recent = swings.filter((swing) => swing.kind === kind).slice(-1)[0];
  return recent && recent.label !== "unclassified" ? recent.label : null;
}

export function classifyTrend(swings: readonly PASwing[], bars: readonly Bar[]): TrendContext {
  const asOfIndex = bars.length - 1;
  const last = asOfIndex >= 0 ? trendSeries(swings, bars)[asOfIndex] : { state: "undetermined" as TrendState, broken: false };
  const known = swings.filter((sw) => sw.confirmedIndex <= asOfIndex);
  const high = latestLabel(known, "high"), low = latestLabel(known, "low");
  return {
    state: last.state,
    broken: last.broken,
    latestHighLabel: high === "HH" || high === "LH" || high === "equal" ? high : null,
    latestLowLabel: low === "HL" || low === "LL" || low === "equal" ? low : null,
    asOfIndex,
    asOfDate: bars[asOfIndex]?.date ?? null,
  };
}

/** Trạng thái tại phiên `index` chỉ từ swing đã xác nhận (không có giá đóng cửa -> không xét phá cấu trúc). Dùng cho khung lớn (mtf.ts). */
export function trendStateAt(swings: readonly PASwing[], index: number): TrendState {
  const known = swings.filter((swing) => swing.confirmedIndex <= index);
  const high = latestLabel(known, "high"), low = latestLabel(known, "low");
  if (!high || !low) return "undetermined";
  if (high === "HH" && low === "HL") return "bullish";
  if (high === "LH" && low === "LL") return "bearish";
  return "mixed";
}
