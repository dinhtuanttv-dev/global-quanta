// @gq/quant-core · Wyckoff v2 (TA_VNINDEX_UPGRADE_SPEC §2.1.3 — bước 1, chưa có xác suất hiệu chỉnh của P6).
// Sửa các lỗi phương pháp của bản cũ:
//   - Khối lượng so với TB 20 phiên NGAY TRƯỚC sự kiện (bản cũ: 20 phiên cuối chuỗi).
//   - Trading range: (HH − LL) / TR trung vị ≤ 8, không có nến displacement (> 3× TR trung vị), 30–80 phiên, ưu tiên vùng DÀI nhất gần hiện tại.
//   - SOS/SOW = đóng cửa VƯỢT biên range ± 0,25×ATR, tìm cả SAU khi range kết thúc (bản cũ chỉ tìm bên trong range).
//   - PS/SC chỉ khi có xu hướng giảm trước range; PSY/BC chỉ khi có xu hướng tăng trước range (bản cũ: gần như luôn có cả hai).
//   - Spring/UT: thủng biên ≤ 1,5×ATR rồi đóng cửa trở lại trong range (≤ 3 nến).
// Đầu ra giữ kiểu WyckoffResult để giao diện dùng chung. "% khớp mẫu" là tỷ lệ sự kiện, KHÔNG phải xác suất.

import { atrSeries, type Bar } from "./math";
import { classifyWyckoffPhase, type WyckoffEventDetail, type WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";

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
  const base = classifyWyckoffPhase([]);
  const atr = atrSeries(bars, 14);
  const range = findTradingRange(bars);
  if (!range) return base;
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
  const closesBackInside = (k: number, side: "low" | "high") => {
    for (let j = k; j <= Math.min(n - 1, k + 3); j++) {
      if (side === "low" ? bars[j].close > range.low : bars[j].close < range.high) return true;
    }
    return false;
  };

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
  res.events = events.sort((x, y) => x.index - y.index);
  return res;
}
