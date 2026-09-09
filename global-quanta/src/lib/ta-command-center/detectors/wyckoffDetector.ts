import type { OhlcvBar } from "../types";

// ĐÃ THÊM "decline" — pha sau khi phá đáy vùng phân phối, đối xứng với
// "markup" (pha sau khi phá đỉnh vùng tích lũy). Trước đây type khai báo
// "distribution" nhưng KHÔNG CÓ nhánh code nào từng gán giá trị này —
// toàn bộ nửa chu kỳ phân phối/tạo đỉnh chưa từng được cài đặt thật.
export type WyckoffPhase = "accumulation" | "spring" | "test" | "markup" | "distribution" | "decline" | "undetermined";

export type WyckoffEvent =
  | "PS" | "SC" | "AR" | "ST" | "Spring" | "Test" | "SOS" | "LPS" // nhánh tích lũy
  | "PSY" | "BC" | "UT" | "UTAD" | "SOW" | "LPSY"; // ĐÃ THÊM — nhánh phân phối, đối xứng nhánh trên

export interface WyckoffEventDetail {
  event: WyckoffEvent;
  date: string;
  index: number;
  price: number;
  volume: number;
  strength: number;
}

export interface WyckoffResult {
  phase: WyckoffPhase;
  // ĐÃ THÊM — điểm tin cậy % (0-100) dựa trên tỷ lệ sự kiện đã xác nhận
  // đúng thứ tự so với mẫu chuẩn của pha đã kết luận. Trước đây hệ thống
  // chỉ trả về 1 nhãn nhị phân (VD "markup") mà không cho biết mức độ
  // chắc chắn — dễ khiến người dùng hiểu nhầm là kết luận tuyệt đối.
  confidenceScore: number;
  rangeHigh: number | null;
  rangeLow: number | null;
  rangeStartDate: string | null;
  rangeEndDate: string | null;
  events: WyckoffEventDetail[];
  springDate: string | null;
  testDate: string | null;
  markupDate: string | null;
  declineDate: string | null;
  dataQuality: "ESTIMATED";
  phaseA?: string;
  phaseB?: string;
  phaseC?: string;
  phaseD?: string;
  phaseE?: string;
}

const RANGE_LOOKBACK = 50;
const RANGE_MAX_WIDTH = 0.15;
const RANGE_MIN_BARS = 30;

function averageVolume(bars: OhlcvBar[], n: number): number {
  const recent = bars.slice(-n);
  return recent.length === 0 ? 0 : recent.reduce((sum, b) => sum + b.volume, 0) / recent.length;
}

/**
 * ĐÃ SỬA: trước đây quét TOÀN BỘ lịch sử, chọn cửa sổ có biên độ hẹp nhất
 * bất kể vị trí — có thể chọn nhầm 1 vùng tích lũy đã xảy ra 2-3 năm
 * trước, không còn liên quan tới bối cảnh hiện tại của mã. Giờ ưu tiên
 * vùng GẦN HIỆN TẠI: chỉ xét 60% dữ liệu gần nhất trước, và trong số các
 * cửa sổ đạt điều kiện biên độ, chọn cửa sổ có điểm kết thúc gần hiện tại
 * nhất (không chỉ hẹp nhất). Chỉ nới ra toàn bộ lịch sử làm phương án dự
 * phòng nếu không tìm được vùng nào trong 60% gần nhất.
 */
function findTradingRange(bars: OhlcvBar[]): { high: number; low: number; startIdx: number; endIdx: number } | null {
  if (bars.length < RANGE_MIN_BARS) return null;
  const windowSize = Math.min(RANGE_LOOKBACK, Math.floor(bars.length / 3));
  const searchStart = Math.floor(bars.length * 0.4);

  const scan = (from: number) => {
    let best: { high: number; low: number; startIdx: number; endIdx: number; width: number } | null = null;
    for (let s = from; s < bars.length - windowSize; s += 5) {
      const window = bars.slice(s, s + windowSize);
      const high = Math.max(...window.map((x) => x.high));
      const low = Math.min(...window.map((x) => x.low));
      const width = (high - low) / low;
      if (width > RANGE_MAX_WIDTH) continue;
      if (!best || s + windowSize > best.endIdx) {
        best = { high, low, startIdx: s, endIdx: s + windowSize - 1, width };
      }
    }
    return best;
  };

  const recent = scan(searchStart);
  if (recent) return { high: recent.high, low: recent.low, startIdx: recent.startIdx, endIdx: recent.endIdx };

  const fallback = scan(0);
  return fallback ? { high: fallback.high, low: fallback.low, startIdx: fallback.startIdx, endIdx: fallback.endIdx } : null;
}

function isSpike(volume: number, avg: number): boolean { return volume > avg * 2; }
function isLow(volume: number, avg: number): boolean { return volume < avg * 0.6; }

export function classifyWyckoffPhase(bars: OhlcvBar[]): WyckoffResult {
  const base: WyckoffResult = {
    phase: "undetermined", confidenceScore: 0,
    rangeHigh: null, rangeLow: null, rangeStartDate: null, rangeEndDate: null,
    events: [], springDate: null, testDate: null, markupDate: null, declineDate: null,
    dataQuality: "ESTIMATED",
  };
  if (bars.length < RANGE_MIN_BARS) return base;

  const avgVol20 = averageVolume(bars, 20);
  const range = findTradingRange(bars);
  if (!range) return base;

  base.rangeHigh = range.high;
  base.rangeLow = range.low;
  base.rangeStartDate = bars[range.startIdx].date;
  base.rangeEndDate = bars[range.endIdx].date;

  const rangeBars = bars.slice(range.startIdx, range.endIdx + 1);
  const events: WyckoffEventDetail[] = [];

  // ============== NHÁNH TÍCH LŨY (accumulation side) ==============
  let idxPS = -1, idxSC = -1, idxSpring = -1, idxST = -1, idxSOS = -1, idxLPS = -1;
  const lowPoint = Math.min(...rangeBars.slice(0, 10).map((b) => b.low));

  for (let i = 0; i < rangeBars.length; i++) {
    const b = rangeBars[i];

    if (idxPS === -1 && b.volume > avgVol20 * 1.5 && b.close > b.open) {
      idxPS = i;
      events.push({ event: "PS", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.6 });
    }
    if (idxSC === -1 && isSpike(b.volume, avgVol20) && b.close < b.open * 0.97) {
      idxSC = i;
      events.push({ event: "SC", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.9 });
    }
    if (idxSC >= 0 && idxSpring === -1 && b.low < lowPoint * 1.01 && b.low > lowPoint * 0.98 && isLow(b.volume, avgVol20)) {
      idxSpring = i;
      events.push({ event: "Spring", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.8 });
      base.springDate = b.date;
    }
    if (idxSC >= 0 && idxST === -1 && Math.abs(b.low - lowPoint) / lowPoint <= 0.03 && i > idxSC + 2) {
      idxST = i;
      events.push({ event: "ST", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.7 });
      base.testDate = b.date;
    }
    if (i >= (idxSpring >= 0 ? idxSpring + 1 : 0) && idxSOS === -1 && b.close > range.high * 0.98 && b.volume > avgVol20 * 1.3) {
      idxSOS = i;
      events.push({ event: "SOS", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.85 });
      base.markupDate = b.date;
    }
    if (idxSOS >= 0 && idxLPS === -1 && b.low > range.low * 1.02 && b.close < b.open && b.volume < avgVol20) {
      idxLPS = i;
      events.push({ event: "LPS", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.75 });
    }
  }

  // ============== NHÁNH PHÂN PHỐI (distribution side) — ĐÃ THÊM, đối xứng nhánh trên ==============
  let idxPSY = -1, idxBC = -1, idxUT = -1, idxSOW = -1, idxLPSY = -1;
  const highPoint = Math.max(...rangeBars.slice(0, 10).map((b) => b.high));

  for (let i = 0; i < rangeBars.length; i++) {
    const b = rangeBars[i];

    // PSY (Preliminary Supply): nến giảm, khối lượng cao bất thường lần đầu — dấu hiệu cung bắt đầu vào
    if (idxPSY === -1 && b.volume > avgVol20 * 1.5 && b.close < b.open) {
      idxPSY = i;
      events.push({ event: "PSY", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.6 });
    }
    // BC (Buying Climax): khối lượng đột biến, nến tăng mạnh — lực mua đuổi kiệt sức
    if (idxBC === -1 && isSpike(b.volume, avgVol20) && b.close > b.open * 1.03) {
      idxBC = i;
      events.push({ event: "BC", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.9 });
    }
    // UT (Upthrust): giá chọc thủng đỉnh vùng rồi không giữ được, khối lượng không thấp — bẫy tăng giá giả
    if (idxBC >= 0 && idxUT === -1 && b.high > highPoint * 0.99 && b.high < highPoint * 1.02 && !isLow(b.volume, avgVol20)) {
      idxUT = i;
      events.push({ event: "UT", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.8 });
    }
    // SOW (Sign of Weakness): đóng cửa phá đáy vùng, khối lượng lớn — đối xứng SOS
    if (i >= (idxUT >= 0 ? idxUT + 1 : 0) && idxSOW === -1 && b.close < range.low * 1.02 && b.volume > avgVol20 * 1.3) {
      idxSOW = i;
      events.push({ event: "SOW", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.85 });
      base.declineDate = b.date;
    }
    // LPSY (Last Point of Supply): hồi phục yếu sau SOW, khối lượng thấp — đối xứng LPS
    if (idxSOW >= 0 && idxLPSY === -1 && b.high < range.high * 0.98 && b.close > b.open && b.volume < avgVol20) {
      idxLPSY = i;
      events.push({ event: "LPSY", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.75 });
    }
  }

  // ============== Quyết định pha cuối cùng ==============
  const accumScore = [idxPS, idxSC, idxSpring, idxST, idxSOS, idxLPS].filter((x) => x >= 0).length;
  const distScore = [idxPSY, idxBC, idxUT, idxSOW, idxLPSY].filter((x) => x >= 0).length;
  // ĐÃ THÊM: điểm tin cậy = tỷ lệ sự kiện đã xác nhận / tổng sự kiện của
  // mẫu chuẩn (6 sự kiện nhánh tích lũy, 5 sự kiện nhánh phân phối) — CỐ
  // Ý dùng mẫu số CỐ ĐỊNH (không đổi theo pha đang ở giai đoạn nào) để
  // không "thổi phồng" độ tin cậy cho các pha sớm (VD "test" chỉ mới có
  // 2-3/6 sự kiện thì không nên báo tin cậy cao).
  const accumConfidence = Math.round((accumScore / 6) * 100);
  const distConfidence = Math.round((distScore / 5) * 100);

  if (idxSOS !== -1 && idxLPS !== -1) {
    base.phase = "markup"; base.confidenceScore = accumConfidence;
    base.phaseA = "PS/SC/AR"; base.phaseB = "Spring/ST"; base.phaseD = "SOS/LPS";
  } else if (idxSOW !== -1 && idxLPSY !== -1) {
    base.phase = "decline"; base.confidenceScore = distConfidence;
    base.phaseA = "PSY/BC/AR"; base.phaseB = "UT"; base.phaseD = "SOW/LPSY";
  } else if (idxSOS !== -1) {
    base.phase = "markup"; base.confidenceScore = accumConfidence;
    base.phaseA = "Accumulation"; base.phaseD = "SOS breakout";
  } else if (idxSOW !== -1) {
    base.phase = "decline"; base.confidenceScore = distConfidence;
    base.phaseA = "Distribution"; base.phaseD = "SOW breakdown";
  } else if (idxSpring !== -1 && idxST !== -1) {
    base.phase = "test"; base.confidenceScore = accumConfidence;
    base.phaseA = "Accumulation"; base.phaseC = "Spring/ST completed";
  } else if (idxSpring !== -1) {
    base.phase = "spring"; base.confidenceScore = accumConfidence;
    base.phaseC = "Spring detected";
  } else if (distScore > accumScore && distScore >= 2) {
    base.phase = "distribution"; base.confidenceScore = distConfidence;
    base.phaseA = "PSY/BC detected";
  } else if (idxSC !== -1) {
    base.phase = "accumulation"; base.confidenceScore = accumConfidence;
    base.phaseA = "PS/SC completed"; base.phaseB = "AR in progress";
  } else {
    base.phase = "undetermined"; base.confidenceScore = 0;
  }

  base.events = events;
  return base;
}

export interface WyckoffChartMarker {
  date: string;
  price: number;
  type: WyckoffEvent;
  label: string;
  color: string;
  strength: number;
}

export function getWyckoffChartMarkers(res: WyckoffResult): WyckoffChartMarker[] {
  const colors: Record<string, string> = {
    PS: "#3b82f6", SC: "#ef4444", AR: "#f97316", ST: "#f97316",
    Spring: "#22c55e", Test: "#eab308", SOS: "#22c55e", LPS: "#84cc16",
    PSY: "#fb923c", BC: "#22c55e", UT: "#eab308", UTAD: "#ef4444",
    SOW: "#ef4444", LPSY: "#f97316",
  };
  return res.events.map((e) => ({
    date: e.date, price: e.price, type: e.event, label: e.event,
    color: colors[e.event] || "#888", strength: e.strength,
  }));
}

export function scoreWyckoffPhase(phase: WyckoffPhase): number {
  switch (phase) {
    case "markup": return 1.0;
    case "spring": return 0.8;
    case "test": return 0.7;
    case "accumulation": return 0.5;
    case "distribution": return 0.3;
    case "decline": return 0.1;
    default: return 0;
  }
}
