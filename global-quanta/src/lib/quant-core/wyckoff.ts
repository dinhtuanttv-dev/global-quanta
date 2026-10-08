// @gq/quant-core · Wyckoff v2 (TA_VNINDEX_UPGRADE_SPEC §2.1.3 — bước 1, chưa có xác suất hiệu chỉnh của P6).
// Sửa các lỗi phương pháp của bản cũ:
//   - Khối lượng so với TB 20 phiên NGAY TRƯỚC sự kiện (bản cũ: 20 phiên cuối chuỗi).
//   - Trading range: (HH − LL) / TR trung vị ≤ 8, không có nến displacement (> 3× TR trung vị), 30–80 phiên, ưu tiên vùng DÀI nhất gần hiện tại.
//   - SOS/SOW = đóng cửa VƯỢT biên range ± 0,25×ATR, tìm cả SAU khi range kết thúc (bản cũ chỉ tìm bên trong range).
//   - PS/SC chỉ khi có xu hướng giảm trước range; PSY/BC chỉ khi có xu hướng tăng trước range (bản cũ: gần như luôn có cả hai).
//   - Spring/UT: thủng biên ≤ 1,5×ATR rồi đóng cửa trở lại trong range (≤ 3 nến).
// Đầu ra giữ kiểu WyckoffResult để giao diện dùng chung. "% khớp mẫu" là tỷ lệ sự kiện, KHÔNG phải xác suất.
// Sửa 2026-10-08 (lỗi "range cũ nhưng pha hiện tại"): trước đây pha = sự kiện quyết định gần nhất BẤT KỂ đã bao lâu và
// kể cả khi đã bị phá (VD Spring rồi giá đóng cửa dưới đáy Spring). Giờ: Spring/UT bị huỷ khi giá đóng cửa vượt cực trị
// của nó; sự kiện quyết định hết hiệu lực sau max(20, độ dài range) nến của CHÍNH khung đang phân tích; giá rời range
// quá 1× độ rộng range ngược chiều pha -> hết hiệu lực. Khi hết hiệu lực: phase = "undetermined", status = "historical",
// cấu trúc cũ nằm ở `historical`. Mỗi sự kiện có ngày xác nhận (Spring/UT: khi đóng cửa trở lại trong range).

import { atrSeries, type Bar } from "./math";
import { classifyWyckoffPhase, WYCKOFF_PHASE_LABEL, type WyckoffEventDetail, type WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";

/** Hết hiệu lực: không có sự kiện quyết định mới trong max(minBars, rangeFactor × độ dài range) nến (khung đang phân tích). */
export const WYCKOFF_STALE = { minBars: 20, rangeFactor: 1, awayHeights: 1 } as const;

export const WYCKOFF_RANGE = { maxWidthATR: 8, minBars: 30, maxBars: 80, recentBars: 120 } as const;

export interface TradingRange { start: number; end: number; high: number; low: number }

export function findTradingRange(bars: Bar[]): TradingRange | null {
  const n = bars.length;
  if (n < WYCKOFF_RANGE.minBars + 20) return null;
  // Ưu tiên vùng DÀI nhất (cause lớn) kết thúc càng gần hiện tại càng tốt.
  for (let len = WYCKOFF_RANGE.maxBars; len >= WYCKOFF_RANGE.minBars; len -= 5) {
    for (let end = n - 1; end >= Math.max(WYCKOFF_RANGE.minBars, n - 1 - WYCKOFF_RANGE.recentBars); end--) {
      const start = end - len + 1;
      if (start < 20) continue;
      let hh = -Infinity;
      let ll = Infinity;
      const trs: number[] = [];
      for (let k = start; k <= end; k++) {
        hh = Math.max(hh, bars[k].high);
        ll = Math.min(ll, bars[k].low);
        trs.push(Math.max(bars[k].high - bars[k].low, Math.abs(bars[k].high - bars[k - 1].close), Math.abs(bars[k].low - bars[k - 1].close)));
      }
      // ATR trung vị của chính cửa sổ (không bị cú phá vỡ làm phình) + vùng nén không chứa nến displacement (> 3× TR trung vị).
      const unit = [...trs].sort((x, y) => x - y)[Math.floor(trs.length / 2)];
      if (!(unit > 0) || (hh - ll) / unit > WYCKOFF_RANGE.maxWidthATR) continue;
      let displaced = false;
      for (let k = start; k <= end && !displaced; k++) if (Math.abs(bars[k].close - bars[k - 1].close) > 3 * unit) displaced = true;
      if (displaced) continue;
      // Nối dài về trước khi giá vẫn nằm trong [LL − 0,5 đơn vị, HH + 0,5 đơn vị].
      let s = start;
      while (s - 1 >= 20 && bars[s - 1].high <= hh + 0.5 * unit && bars[s - 1].low >= ll - 0.5 * unit) s--;
      return { start: s, end, high: hh, low: ll };
    }
  }
  return null;
}

const avgVolBefore = (bars: Bar[], i: number, w = 20) => {
  let s = 0;
  let c = 0;
  for (let j = Math.max(0, i - w); j < i; j++) { s += bars[j].volume; c++; }
  return c ? s / c : 0;
};

export function classifyWyckoffV2(bars: Bar[]): WyckoffResult {
  const base: WyckoffResult = { ...classifyWyckoffPhase([]), engine: "v2", asOf: bars.length ? bars[bars.length - 1].date : null };
  if (bars.length < WYCKOFF_RANGE.minBars + 20) return { ...base, status: "insufficient", statusReason: `Cần ≥ ${WYCKOFF_RANGE.minBars + 20} nến, có ${bars.length}.` };
  const atr = atrSeries(bars, 14);
  const range = findTradingRange(bars);
  if (!range) return { ...base, status: "insufficient", statusReason: "Không tìm thấy trading range (biên ≤ 8× ATR, 30–80 nến, trong 120 nến gần nhất)." };
  const n = bars.length;
  const res: WyckoffResult = {
    ...base, rangeHigh: range.high, rangeLow: range.low,
    rangeStartDate: bars[range.start].date, rangeEndDate: bars[range.end].date,
  };
  const ref = bars[Math.max(0, range.start - 20)].close;
  const priorDown = bars[range.start].close < ref * 0.97;
  const priorUp = bars[range.start].close > ref * 1.03;
  const events: WyckoffEventDetail[] = [];
  const push = (event: WyckoffEventDetail["event"], k: number, price: number, strength: number) => {
    events.push({ event, date: bars[k].date, index: k, price, volume: bars[k].volume, strength });
    return k;
  };
  // Sự kiện QUYẾT ĐỊNH (Spring/SOS/UT/SOW) ghi lần GẦN NHẤT (ghi đè), để pha phản ánh trạng thái hiện tại.
  const replace = (event: WyckoffEventDetail["event"], prev: number, k: number, price: number, strength: number) => {
    const at = prev >= 0 ? events.findIndex((e) => e.event === event && e.index === prev) : -1;
    if (at >= 0) events.splice(at, 1);
    return push(event, k, price, strength);
  };
  const a = (k: number) => atr[k] || 1;
  // Nến đầu tiên (k..k+3, không vượt dữ liệu hiện có) đóng cửa trở lại trong range = nến XÁC NHẬN Spring/UT; -1 nếu chưa.
  const backInsideAt = (k: number, side: "low" | "high") => {
    for (let j = k; j <= Math.min(n - 1, k + 3); j++) {
      if (side === "low" ? bars[j].close > range.low : bars[j].close < range.high) return j;
    }
    return -1;
  };
  const closesBackInside = (k: number, side: "low" | "high") => backInsideAt(k, side) >= 0;

  // ---------- Nhánh tích luỹ ----------
  let ps = -1, sc = -1, st = -1, spring = -1, sos = -1, lps = -1;
  for (let k = Math.max(1, range.start - 10); k < n; k++) {
    const b = bars[k];
    const av = avgVolBefore(bars, k);
    if (priorDown && ps < 0 && k <= range.start + 5 && b.volume > 1.5 * av && b.close > b.open) ps = push("PS", k, b.low, 0.6);
    if (priorDown && sc < 0 && k <= range.start + 10 && b.volume > 2 * av && b.close < bars[k - 1].close - a(k)) sc = push("SC", k, b.low, 0.9);
    if (sc >= 0 && st < 0 && k > sc + 2 && k <= range.end && Math.abs(b.low - bars[sc].low) <= a(k) && b.volume < bars[sc].volume) st = push("ST", k, b.low, 0.7);
    if (k > spring + 3 && k >= range.start + 5 && b.low < range.low && b.low >= range.low - 1.5 * a(k) && closesBackInside(k, "low")) spring = replace("Spring", spring, k, b.low, 0.8);
    // SOS / SOW = phiên đóng cửa CẮT qua ngưỡng (phiên trước còn trong ngưỡng) với effort ≥ 1,3× TB20.
    if (k > sos + 5 && k > range.start + 5 && b.close > range.high + 0.25 * a(k) && bars[k - 1].close <= range.high + 0.25 * a(k) && b.volume >= 1.3 * av) sos = replace("SOS", sos, k, b.high, 0.85);
    if (sos >= 0 && lps < sos && k > sos && b.low >= range.high - 0.5 * a(k) && b.close < b.open && b.volume < av) lps = lps >= 0 ? replace("LPS", lps, k, b.low, 0.75) : push("LPS", k, b.low, 0.75);
  }
  // ---------- Nhánh phân phối ----------
  let psy = -1, bc = -1, ut = -1, sow = -1, lpsy = -1;
  for (let k = Math.max(1, range.start - 10); k < n; k++) {
    const b = bars[k];
    const av = avgVolBefore(bars, k);
    if (priorUp && psy < 0 && k <= range.start + 5 && b.volume > 1.5 * av && b.close < b.open) psy = push("PSY", k, b.high, 0.6);
    if (priorUp && bc < 0 && k <= range.start + 10 && b.volume > 2 * av && b.close > bars[k - 1].close + a(k)) bc = push("BC", k, b.high, 0.9);
    if (k > ut + 3 && k >= range.start + 5 && b.high > range.high && b.high <= range.high + 1.5 * a(k) && closesBackInside(k, "high")) ut = replace("UT", ut, k, b.high, 0.8);
    if (k > sow + 5 && k > range.start + 5 && b.close < range.low - 0.25 * a(k) && b.volume >= 1.3 * av && bars[k - 1].close >= range.low - 0.25 * a(k)) sow = replace("SOW", sow, k, b.low, 0.85);
    if (sow >= 0 && lpsy < sow && k > sow && b.high <= range.low + 0.5 * a(k) && b.close > b.open && b.volume < av) lpsy = lpsy >= 0 ? replace("LPSY", lpsy, k, b.high, 0.75) : push("LPSY", k, b.high, 0.75);
  }

  const acc = [ps, sc, st, spring, sos, lps].filter((x) => x >= 0).length;
  const dis = [psy, bc, ut, sow, lpsy].filter((x) => x >= 0).length;
  const accPct = Math.round((acc / 6) * 100);
  const disPct = Math.round((dis / 5) * 100);
  res.springDate = spring >= 0 ? bars[spring].date : null;
  res.testDate = st >= 0 ? bars[st].date : null;
  res.markupDate = sos >= 0 ? bars[sos].date : null;
  res.declineDate = sow >= 0 ? bars[sow].date : null;
  // Pha hiện tại = sự kiện QUYẾT ĐỊNH gần nhất (SOS / SOW / Spring / UT): VD SOW rồi Spring kéo giá về lại range
  // = phá vỡ thất bại -> Phase C (Spring), không còn là Markdown.
  const decisive = [
    { k: sos, phase: "markup" as const }, { k: sow, phase: "decline" as const },
    { k: spring, phase: "spring" as const }, { k: ut, phase: "distribution" as const },
  ].filter((x) => x.k >= 0).sort((x, y) => y.k - x.k)[0];
  if (decisive?.phase === "markup") { res.phase = "markup"; res.confidenceScore = accPct; res.phaseD = lps > sos ? "SOS/LPS" : "SOS breakout"; }
  else if (decisive?.phase === "decline") { res.phase = "decline"; res.confidenceScore = disPct; res.phaseD = lpsy > sow ? "SOW/LPSY" : "SOW breakdown"; }
  else if (decisive?.phase === "spring") { res.phase = st > spring ? "test" : "spring"; res.confidenceScore = accPct; res.phaseC = sow >= 0 && sow < spring ? "Spring sau SOW (phá vỡ thất bại)" : "Spring"; }
  else if (decisive?.phase === "distribution") { res.phase = "distribution"; res.confidenceScore = disPct; res.phaseC = sos >= 0 && sos < ut ? "UT sau SOS (phá vỡ thất bại)" : "UT"; }
  else if (dis > acc && dis >= 2) { res.phase = "distribution"; res.confidenceScore = disPct; }
  else if (acc >= 2 || sc >= 0) { res.phase = "accumulation"; res.confidenceScore = accPct; }
  // Có trading range nhưng chưa có sự kiện quyết định -> Phase B theo bối cảnh xu hướng trước range.
  else if (priorDown) { res.phase = "accumulation"; res.confidenceScore = accPct; res.phaseB = "Trading range sau xu hướng giảm — chưa có Spring/SOS"; }
  else if (priorUp) { res.phase = "distribution"; res.confidenceScore = disPct; res.phaseB = "Trading range sau xu hướng tăng — chưa có UT/SOW"; }
  else { res.phase = "undetermined"; res.confidenceScore = 0; }
  const last = bars[n - 1].close;
  res.phaseE = last > range.high ? "Giá hiện TRÊN range" : last < range.low ? "Giá hiện DƯỚI range — chưa có SOW đủ effort xác nhận" : "Giá hiện TRONG range";
  if (last < range.low && sow >= 0 && sow === Math.max(sos, sow, spring, ut)) res.phaseE = "Giá hiện DƯỚI range (sau SOW)";
  // ---------- Ngày xác nhận của từng sự kiện ----------
  for (const e of events) {
    const ci = e.event === "Spring" ? backInsideAt(e.index, "low") : e.event === "UT" ? backInsideAt(e.index, "high") : e.index;
    e.confirmedIndex = ci >= 0 ? ci : null;
    e.confirmedDate = ci >= 0 ? bars[ci].date : null;
  }
  res.events = events.sort((x, y) => x.index - y.index);

  // ---------- Hiệu lực của pha hiện tại ----------
  const lastIdx = n - 1;
  const rangeLen = range.end - range.start + 1;
  const limit = Math.max(WYCKOFF_STALE.minBars, Math.round(WYCKOFF_STALE.rangeFactor * rangeLen));
  const height = Math.max(1e-9, range.high - range.low);
  const springCi = spring >= 0 ? backInsideAt(spring, "low") : -1;
  const utCi = ut >= 0 ? backInsideAt(ut, "high") : -1;
  let springBroken: number | null = null;
  let utBroken: number | null = null;
  if (spring >= 0) for (let j = Math.max(spring + 1, springCi); j <= lastIdx; j++) if (bars[j].close < bars[spring].low) { springBroken = j; break; }
  if (ut >= 0) for (let j = Math.max(ut + 1, utCi); j <= lastIdx; j++) if (bars[j].close > bars[ut].high) { utBroken = j; break; }
  const decisiveIdx = decisive
    ? (decisive.phase === "spring" ? Math.max(decisive.k, springCi) : decisive.phase === "distribution" ? Math.max(decisive.k, utCi) : decisive.k)
    : null;
  // Không có sự kiện quyết định: tuổi tính từ cuối range (pha B theo bối cảnh).
  const anchor = decisiveIdx ?? range.end;
  const age = lastIdx - anchor;
  const bullish = res.phase === "spring" || res.phase === "test" || res.phase === "markup" || res.phase === "accumulation";
  const bearish = res.phase === "distribution" || res.phase === "decline";
  const awayBelow = last < range.low - WYCKOFF_STALE.awayHeights * height;
  const awayAbove = last > range.high + WYCKOFF_STALE.awayHeights * height;
  const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
  let staleReason: string | null = null;
  if (res.phase !== "undetermined") {
    if ((res.phase === "spring" || res.phase === "test") && springBroken != null) {
      staleReason = `Spring ${bars[spring].date} đã bị phá: đóng cửa dưới đáy Spring (${fmt(bars[spring].low)}) ngày ${bars[springBroken].date}.`;
    } else if (res.phase === "distribution" && decisive?.phase === "distribution" && utBroken != null) {
      staleReason = `UT ${bars[ut].date} đã bị phá: đóng cửa trên đỉnh UT (${fmt(bars[ut].high)}) ngày ${bars[utBroken].date}.`;
    } else if (age > limit) {
      staleReason = `Sự kiện quyết định cuối cách đây ${age} nến, quá thời hạn hiệu lực ${limit} nến (= max(20, độ dài range ${rangeLen} nến)).`;
    } else if ((bullish && awayBelow) || (bearish && awayAbove)) {
      staleReason = `Giá hiện đã rời ${awayBelow ? "xuống dưới" : "lên trên"} range quá 1 lần độ rộng range, ngược chiều pha ${WYCKOFF_PHASE_LABEL[res.phase]}.`;
    }
  }
  res.checks = [
    { label: "Có xu hướng trước range (giảm → tích luỹ / tăng → phân phối)", ok: priorDown || priorUp },
    { label: "Climax (SC/BC) với KL ≥ 2× TB20", ok: sc >= 0 || bc >= 0 },
    { label: "Spring/UT: thủng biên ≤ 1,5 ATR rồi đóng cửa trở lại trong range", ok: spring >= 0 || ut >= 0 },
    { label: "SOS/SOW: đóng cửa vượt biên ± 0,25 ATR với KL ≥ 1,3× TB20", ok: sos >= 0 || sow >= 0 },
    { label: `Sự kiện quyết định còn hiệu lực (≤ ${limit} nến, chưa bị phá)`, ok: res.phase === "undetermined" ? null : staleReason == null },
  ];
  res.caveats = [
    "Engine v2 tìm range theo độ nén (biên ≤ 8× ATR), không theo chuỗi SC → AR → ST của Phase A.",
    "Spring/UT chỉ nhận ra khi giá thủng biên của range đã chọn — range có thể khác range người phân tích vẽ tay.",
  ];
  if (staleReason) {
    res.historical = {
      phase: res.phase, wyckoffPhase: null, kind: bullish ? "accumulation" : "distribution", status: "stale",
      rangeHigh: range.high, rangeLow: range.low, startDate: bars[range.start].date, endDate: bars[range.end].date, reason: staleReason,
    };
    res.phase = "undetermined";
    res.status = "historical";
    res.statusReason = staleReason;
  } else {
    res.status = res.phase === "undetermined" ? "insufficient" : "active";
    res.statusReason = res.phase === "undetermined"
      ? "Có trading range nhưng chưa đủ sự kiện / bối cảnh để xác định pha."
      : `Sự kiện quyết định cách đây ${age} nến (hiệu lực ≤ ${limit}).`;
  }
  return res;
}
