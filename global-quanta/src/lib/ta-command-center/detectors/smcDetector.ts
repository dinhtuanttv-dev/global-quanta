import type { OhlcvBar } from "../types";

export interface OrderBlock {
  date: string;
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  mitigated: boolean;
  // ĐÃ THÊM (v2): ngày cụ thể OB bị mitigated — để rendering vẽ đúng độ
  // dài thật của vùng (từ lúc hình thành tới lúc bị lấp/test), thay vì
  // chiều rộng pixel cố định như trước ("rán lên" biểu đồ, không theo
  // zoom, không có ý nghĩa thời gian thật).
  mitigatedAt: string | null;
}
export interface FairValueGap {
  startDate: string;
  endDate: string;
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  filled: boolean;
  // ĐÃ THÊM (v2): tương tự OrderBlock.mitigatedAt
  filledAt: string | null;
}
export interface BreakOfStructure { date: string; type: "bullish" | "bearish"; brokenLevel: number; }

const ATR_PERIOD = 14;
const STRONG_MOVE_ATR_MULTIPLIER = 1.2;
const MIN_FVG_ATR_RATIO = 0.15;
const SWING_LOOKBACK = 5;

function calcATRSeries(bars: OhlcvBar[], period = ATR_PERIOD): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    tr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  const atr: number[] = new Array(bars.length).fill(0);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    atr[i] = i >= period - 1 ? sum / period : tr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
  }
  return atr;
}

export function detectOrderBlocks(bars: OhlcvBar[]): OrderBlock[] {
  const atr = calcATRSeries(bars);
  const obs: OrderBlock[] = [];
  for (let i = 0; i < bars.length - 3; i++) {
    const bar = bars[i];
    const future = bars[i + 3];
    const move = future.close - bar.close;
    const threshold = atr[i] * STRONG_MOVE_ATR_MULTIPLIER;
    if (threshold <= 0) continue;
    if (bar.close < bar.open && move >= threshold) {
      obs.push({ date: bar.date, type: "bullish", top: bar.high, bottom: bar.low, mitigated: false, mitigatedAt: null });
    } else if (bar.close > bar.open && -move >= threshold) {
      obs.push({ date: bar.date, type: "bearish", top: bar.high, bottom: bar.low, mitigated: false, mitigatedAt: null });
    }
  }
  const recent = obs.slice(-10);
  for (const ob of recent) {
    const obIndex = bars.findIndex((b) => b.date === ob.date);
    if (obIndex === -1) continue;
    for (let j = obIndex + 4; j < bars.length; j++) {
      const b = bars[j];
      if (b.low <= ob.top && b.high >= ob.bottom) {
        ob.mitigated = true;
        ob.mitigatedAt = b.date;
        break;
      }
    }
  }
  return recent;
}

export function detectFVG(bars: OhlcvBar[]): FairValueGap[] {
  const atr = calcATRSeries(bars);
  const gaps: FairValueGap[] = [];
  for (let i = 0; i < bars.length - 2; i++) {
    const c1 = bars[i];
    const c3 = bars[i + 2];
    const minGap = atr[i] * MIN_FVG_ATR_RATIO;
    if (c1.high < c3.low && c3.low - c1.high >= minGap) {
      gaps.push({ startDate: c1.date, endDate: c3.date, type: "bullish", top: c3.low, bottom: c1.high, filled: false, filledAt: null });
    } else if (c1.low > c3.high && c1.low - c3.high >= minGap) {
      gaps.push({ startDate: c1.date, endDate: c3.date, type: "bearish", top: c1.low, bottom: c3.high, filled: false, filledAt: null });
    }
  }
  const recent = gaps.slice(-10);
  for (const gap of recent) {
    const gapIndex = bars.findIndex((b) => b.date === gap.endDate);
    if (gapIndex === -1) continue;
    for (let j = gapIndex + 1; j < bars.length; j++) {
      const b = bars[j];
      if (b.low <= gap.bottom && b.high >= gap.top) {
        gap.filled = true;
        gap.filledAt = b.date;
        break;
      }
    }
  }
  return recent;
}

// ĐÃ SỬA — LỖI THIẾT KẾ (không phải bug, là thiếu tính năng): detectBOS
// gốc trả về MỌI lần phá swing high/low, không phân biệt đó là tiếp diễn
// xu hướng (BOS thật) hay ĐẢO CHIỀU xu hướng (CHoCH — Change of
// Character). Trong SMC/ICT hiện đại, CHoCH là tín hiệu đảo chiều SỚM
// NHẤT (phá cấu trúc nội bộ theo hướng ngược lại xu hướng đang có) — nếu
// gộp chung với BOS, trader mất đúng lúc thị trường bắt đầu đổi hướng.
//
// Cách phân biệt: theo dõi "xu hướng hiện tại" theo thời gian — lần phá
// đầu tiên thiết lập xu hướng ban đầu; các lần phá TIẾP THEO cùng hướng
// là BOS (tiếp diễn); lần phá ĐẦU TIÊN ngược hướng xu hướng đang có là
// CHoCH (đảo chiều) — sau đó xu hướng đổi sang hướng mới, các lần phá
// tiếp theo cùng hướng mới lại là BOS.

interface SwingPoint { index: number; price: number; date: string }

function detectSwingPoints(bars: OhlcvBar[]): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  for (let i = SWING_LOOKBACK; i < bars.length - SWING_LOOKBACK; i++) {
    const window = bars.slice(i - SWING_LOOKBACK, i + SWING_LOOKBACK + 1);
    if (window.every((b) => bars[i].high >= b.high)) highs.push({ index: i, price: bars[i].high, date: bars[i].date });
    if (window.every((b) => bars[i].low <= b.low)) lows.push({ index: i, price: bars[i].low, date: bars[i].date });
  }
  return { highs, lows };
}

function computeStructureEvents(bars: OhlcvBar[]): { bos: BreakOfStructure[]; choch: BreakOfStructure[] } {
  const { highs: swingHighs, lows: swingLows } = detectSwingPoints(bars);
  const bos: BreakOfStructure[] = [];
  const choch: BreakOfStructure[] = [];
  let currentTrend: "bullish" | "bearish" | null = null;

  for (let i = SWING_LOOKBACK; i < bars.length; i++) {
    const priorHigh = [...swingHighs].reverse().find((s) => s.index < i);
    const priorLow = [...swingLows].reverse().find((s) => s.index < i);
    const events: BreakOfStructure[] = [];
    if (priorHigh && bars[i].close > priorHigh.price) events.push({ date: bars[i].date, type: "bullish", brokenLevel: priorHigh.price });
    if (priorLow && bars[i].close < priorLow.price) events.push({ date: bars[i].date, type: "bearish", brokenLevel: priorLow.price });

    for (const ev of events) {
      if (currentTrend === null || ev.type === currentTrend) {
        bos.push(ev);
        currentTrend = ev.type;
      } else {
        choch.push(ev);
        currentTrend = ev.type;
      }
    }
  }
  // ĐÃ SỬA: KHÔNG cắt bớt ở đây nữa — trả về TOÀN BỘ lịch sử, để dùng
  // được cho backtest (cần mọi lần xuất hiện trong quá khứ). Việc cắt bớt
  // cho gọn hiển thị UI chuyển sang detectBOS()/detectCHoCH() bên dưới.
  return { bos, choch };
}

/** ĐÃ THÊM — bản KHÔNG cắt bớt, dùng cho backtest (xem signalBacktest.ts). */
export function computeStructureEventsFull(bars: OhlcvBar[]): { bos: BreakOfStructure[]; choch: BreakOfStructure[] } {
  return computeStructureEvents(bars);
}

export function detectBOS(bars: OhlcvBar[]): BreakOfStructure[] {
  return computeStructureEvents(bars).bos.slice(-6);
}

/** ĐÃ THÊM — CHoCH (Change of Character): tín hiệu đảo chiều sớm, phân
 * biệt rõ với BOS (tiếp diễn xu hướng). */
export function detectCHoCH(bars: OhlcvBar[]): BreakOfStructure[] {
  return computeStructureEvents(bars).choch.slice(-4);
}

/** ĐÃ THÊM — Liquidity Sweep / Equal Highs-Equal Lows (EQH/EQL): vùng
 * đỉnh hoặc đáy có 2+ điểm giá gần bằng nhau (trong ngưỡng dung sai nhỏ)
 * — nơi lệnh dừng lỗ (stop-loss) của số đông thường dồn cụm, mục tiêu
 * kinh điển của "quét thanh khoản" trong SMC/ICT hiện đại. */
export interface LiquidityPool {
  date: string;
  price: number;
  type: "EQH" | "EQL";
  touches: number;
}

const EQUAL_LEVEL_TOLERANCE = 0.0015; // 0.15% — 2 đỉnh/đáy trong ngưỡng này coi là "bằng nhau"

export function detectLiquidityPools(bars: OhlcvBar[]): LiquidityPool[] {
  const { highs, lows } = detectSwingPoints(bars);
  const pools: LiquidityPool[] = [];

  const clusterPoints = (points: SwingPoint[], type: "EQH" | "EQL") => {
    const used = new Set<number>();
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const cluster = [points[i]];
      for (let j = i + 1; j < points.length; j++) {
        if (used.has(j)) continue;
        const diff = Math.abs(points[j].price - points[i].price) / points[i].price;
        if (diff <= EQUAL_LEVEL_TOLERANCE) {
          cluster.push(points[j]);
          used.add(j);
        }
      }
      if (cluster.length >= 2) {
        const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
        const latest = cluster[cluster.length - 1];
        pools.push({ date: latest.date, price: avgPrice, type, touches: cluster.length });
      }
    }
  };

  clusterPoints(highs, "EQH");
  clusterPoints(lows, "EQL");
  return pools.slice(-6);
}

/** ĐÃ THÊM — Premium/Discount Zone (chia đôi vùng giá theo swing gần
 * nhất) + OTE (Optimal Trade Entry, vùng 62-79% retracement) — công cụ ra
 * quyết định vào lệnh phổ biến nhất trong ICT/SMC hiện đại: giá ở nửa
 * dưới (discount) = vùng cân nhắc mua, nửa trên (premium) = vùng cân
 * nhắc bán. */
export interface PremiumDiscountZone {
  swingHigh: number;
  swingLow: number;
  midpoint: number;
  oteLow: number;
  oteHigh: number;
  currentZone: "premium" | "discount" | "equilibrium";
}

const PD_LOOKBACK = 50;
const OTE_LOW_RATIO = 0.62;
const OTE_HIGH_RATIO = 0.79;
const EQUILIBRIUM_BAND = 0.02; // ±2% quanh trung điểm coi là "cân bằng", không nghiêng hẳn bên nào

export function computePremiumDiscountZone(bars: OhlcvBar[]): PremiumDiscountZone | null {
  if (bars.length < PD_LOOKBACK) return null;
  const recent = bars.slice(-PD_LOOKBACK);
  const swingHigh = Math.max(...recent.map((b) => b.high));
  const swingLow = Math.min(...recent.map((b) => b.low));
  if (swingHigh <= swingLow) return null;

  const midpoint = (swingHigh + swingLow) / 2;
  const range = swingHigh - swingLow;
  const oteLow = swingHigh - range * OTE_HIGH_RATIO;
  const oteHigh = swingHigh - range * OTE_LOW_RATIO;

  const currentClose = bars[bars.length - 1].close;
  const distFromMid = (currentClose - midpoint) / midpoint;
  const currentZone: PremiumDiscountZone["currentZone"] =
    Math.abs(distFromMid) <= EQUILIBRIUM_BAND ? "equilibrium" : distFromMid > 0 ? "premium" : "discount";

  return { swingHigh, swingLow, midpoint, oteLow, oteHigh, currentZone };
}

/** ĐÃ THÊM — đếm số lần giá quay lại "test" 1 vùng giá (dùng cho
 * Demand/Supply Zone vẽ tay). Chỉ đếm khi giá VỪA chạm vào vùng sau 1
 * khoảng không chạm (tránh đếm trùng nhiều nến liên tiếp nằm sẵn trong
 * vùng thành nhiều lần test). Độ tin cậy của vùng giảm dần theo số lần
 * test — đúng nguyên lý SMC/ICT chuẩn: vùng bị "cày" nhiều lần thì lệnh
 * chờ tại đó đã cạn dần, không còn nguyên vẹn như lúc mới hình thành. */
export function countZoneTests(bars: OhlcvBar[], top: number, bottom: number, sinceDate: string): number {
  let count = 0;
  let wasInside = false;
  for (const b of bars) {
    if (b.date <= sinceDate) continue;
    const touches = b.low <= top && b.high >= bottom;
    if (touches && !wasInside) count++;
    wasInside = touches;
  }
  return count;
}
