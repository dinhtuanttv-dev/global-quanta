// @gq/quant-core · MTF v3 · S2 — cấu trúc thị trường: sóng xác nhận bằng giá đóng cửa, máy trạng thái Dow có đáy bảo vệ (押し安値) /
// đỉnh hồi (戻り高値) và 3 tiêu chí gãy – đảo xu hướng (ảnh 324 / 325 / 338), sự kiện CHoCH / BOS, giai đoạn Minervini S1–S4 trên bộ
// EMA21 · EMA50 · EMA100 · MA200 (MTF-v3-prereg.md). Mọi giá trị tại nến t chỉ dùng bars[0..t]; sóng đã xác nhận không vẽ lại.
import type { Bar } from "../math";
import type { RibbonSeries } from "./ribbon";

export const STRUCT = { kMinor: 2.0, kMajor: 3.5, hiLoWindow: 252, stageHold: 3, stageS3Lookback: 60, ma200Flat: 0.005, slope200Len: 20 } as const;

export interface Swing3 { kind: "H" | "L"; index: number; price: number; confirmedIndex: number }

/**
 * ZigZag theo ATR, xác nhận bằng GIÁ ĐÓNG CỬA: đỉnh (cực trị đo bằng high) được xác nhận khi đóng cửa ≤ đỉnh − k·ATR; đáy đối xứng.
 * Trước khi có hướng, theo dõi cả đỉnh và đáy; phía nào xác nhận trước thì bắt đầu chuỗi xen kẽ H/L.
 */
export function swings3(bars: Bar[], atr: number[], k: number): Swing3[] {
  const out: Swing3[] = [], n = bars.length;
  let dir: 0 | 1 | -1 = 0; // +1 đang tìm đỉnh, −1 đang tìm đáy
  let hiI = -1, hiP = -Infinity, loI = -1, loP = Infinity;
  for (let i = 0; i < n; i++) {
    const a = atr[i];
    const b = bars[i];
    if (b.high > hiP && dir >= 0) { hiP = b.high; hiI = i; }
    if (b.low < loP && dir <= 0) { loP = b.low; loI = i; }
    if (!(a > 0)) continue;
    const th = k * a;
    if (dir >= 0 && hiI >= 0 && b.close <= hiP - th && (dir === 1 || hiI > loI || loI < 0)) {
      out.push({ kind: "H", index: hiI, price: hiP, confirmedIndex: i });
      dir = -1; loP = Infinity; loI = -1;
      for (let j = hiI + 1; j <= i; j++) if (bars[j].low < loP) { loP = bars[j].low; loI = j; }
      continue;
    }
    if (dir <= 0 && loI >= 0 && b.close >= loP + th && (dir === -1 || loI > hiI || hiI < 0)) {
      out.push({ kind: "L", index: loI, price: loP, confirmedIndex: i });
      dir = 1; hiP = -Infinity; hiI = -1;
      for (let j = loI + 1; j <= i; j++) if (bars[j].high > hiP) { hiP = bars[j].high; hiI = j; }
    }
  }
  return out;
}

export type DowState = "UP" | "UP_WEAK" | "BROKEN_UP" | "DOWN" | "DOWN_WEAK" | "BROKEN_DOWN" | "RANGE";
export type DowEvent = "CHOCH_UP" | "CHOCH_DOWN" | "BOS_UP" | "BOS_DOWN" | "BREAK_PROTECTED_LOW" | "BREAK_PULLBACK_HIGH" | null;

export interface DowSeries {
  state: DowState[];
  event: DowEvent[];
  /** Đáy bảo vệ / đỉnh hồi đang có hiệu lực tại từng nến (NaN nếu không có). */
  protectedLow: number[]; pullbackHigh: number[];
  /** Đỉnh / đáy sóng gần nhất đã xác nhận tại từng nến. */
  lastHigh: number[]; lastLow: number[];
}

const isUp = (s: DowState) => s === "UP" || s === "UP_WEAK";
const isDown = (s: DowState) => s === "DOWN" || s === "DOWN_WEAK";

/**
 * Máy trạng thái Dow trên sóng nhỏ đã xác nhận.
 *  • UP: đỉnh sau cao hơn VÀ đáy sau cao hơn. Đáy bảo vệ = đáy đã tạo ra đỉnh cao hơn gần nhất.
 *  • Tiêu chí ① đỉnh thấp hơn → UP_WEAK (chưa gãy). ② đóng cửa thủng đáy bảo vệ → BROKEN_UP (sự kiện BREAK_PROTECTED_LOW).
 *    ③ cả đỉnh thấp hơn và đáy thấp hơn → DOWN (đảo chiều xác nhận). Đối xứng cho xu hướng giảm với đỉnh hồi.
 *  • CHoCH↑: đang không ở UP, đáy gần nhất CAO HƠN đáy trước, rồi đóng cửa vượt đỉnh sóng gần nhất — "chân dưới đổi hướng".
 *  • BOS↑: đang UP, đóng cửa vượt đỉnh sóng gần nhất (phá cấu trúc thuận chiều). Đối xứng.
 */
export function dowSeries3(bars: Bar[], sw: Swing3[]): DowSeries {
  const n = bars.length;
  const state = new Array<DowState>(n).fill("RANGE"), event = new Array<DowEvent>(n).fill(null);
  const protectedLow = new Array<number>(n).fill(NaN), pullbackHigh = new Array<number>(n).fill(NaN);
  const lastHigh = new Array<number>(n).fill(NaN), lastLow = new Array<number>(n).fill(NaN);
  const H: Swing3[] = [], L: Swing3[] = [];
  let k = 0, st: DowState = "RANGE", pLow = NaN, pHigh = NaN;
  let crossedH = -1, crossedL = -1; // chỉ số đỉnh / đáy đã bị vượt (tránh sự kiện lặp)
  for (let i = 0; i < n; i++) {
    while (k < sw.length && sw[k].confirmedIndex === i) {
      const s = sw[k++];
      if (s.kind === "H") {
        const prev = H[H.length - 1];
        H.push(s);
        if (prev) {
          if (s.price > prev.price) {
            // đỉnh cao hơn: đáy ngay trước đỉnh này trở thành đáy bảo vệ
            const lb = L.filter((x) => x.index < s.index).pop();
            if (lb) pLow = lb.price;
            const lPrev = L.length >= 2 ? L[L.length - 2] : null, lLast = L[L.length - 1];
            if (lLast && lPrev && lLast.price > lPrev.price) st = "UP";
            else if (st === "UP_WEAK") st = "UP";
          } else if (isUp(st)) st = "UP_WEAK";                                      // tiêu chí ①
          else if (st === "BROKEN_UP" || st === "RANGE" || isDown(st) || st === "BROKEN_DOWN") {
            const lLast = L[L.length - 1], lPrev = L.length >= 2 ? L[L.length - 2] : null;
            if (lLast && lPrev && lLast.price < lPrev.price) st = "DOWN";             // tiêu chí ③
          }
        }
      } else {
        const prev = L[L.length - 1];
        L.push(s);
        if (prev) {
          if (s.price < prev.price) {
            const hb = H.filter((x) => x.index < s.index).pop();
            if (hb) pHigh = hb.price;
            const hPrev = H.length >= 2 ? H[H.length - 2] : null, hLast = H[H.length - 1];
            if (hLast && hPrev && hLast.price < hPrev.price) st = "DOWN";
            else if (st === "DOWN_WEAK") st = "DOWN";
          } else if (isDown(st)) st = "DOWN_WEAK";
          else if (st === "BROKEN_DOWN" || st === "RANGE" || isUp(st) || st === "BROKEN_UP") {
            const hLast = H[H.length - 1], hPrev = H.length >= 2 ? H[H.length - 2] : null;
            if (hLast && hPrev && hLast.price > hPrev.price) st = "UP";
          }
        }
      }
    }
    const c = bars[i].close, lh = H[H.length - 1], ll = L[L.length - 1];
    const higherLow = L.length >= 2 && L[L.length - 1].price > L[L.length - 2].price;
    const lowerHigh = H.length >= 2 && H[H.length - 1].price < H[H.length - 2].price;
    const newHigh = lh && c > lh.price && crossedH !== lh.index, newLow = ll && c < ll.price && crossedL !== ll.index;
    if (isUp(st)) {
      // ② đóng cửa thủng đáy bảo vệ -> xu hướng tăng gãy; thủng đáy sóng gần nhất (cao hơn đáy bảo vệ) CHƯA đủ
      if (Number.isFinite(pLow) && c < pLow) { st = "BROKEN_UP"; event[i] = "BREAK_PROTECTED_LOW"; }
      else if (newHigh) event[i] = "BOS_UP";
    } else if (isDown(st)) {
      // vượt đỉnh hồi: đã có đáy cao hơn = chân dưới đổi hướng (CHoCH↑), chưa có = xu hướng giảm gãy
      if (Number.isFinite(pHigh) && c > pHigh) {
        if (higherLow) { event[i] = "CHOCH_UP"; st = "UP"; pLow = ll!.price; }
        else { st = "BROKEN_DOWN"; event[i] = "BREAK_PULLBACK_HIGH"; }
      } else if (newLow) event[i] = "BOS_DOWN";
    } else {
      // đã gãy / đi ngang: "đỉnh hồi gần nhất" = đỉnh sóng gần nhất (đáy cao hơn + vượt nó = CHoCH↑), đối xứng cho chiều giảm
      if (newHigh && higherLow) { event[i] = "CHOCH_UP"; st = "UP"; pLow = ll!.price; }
      else if (newLow && lowerHigh) { event[i] = "CHOCH_DOWN"; st = "DOWN"; pHigh = lh!.price; }
    }
    if (newHigh) crossedH = lh!.index;
    if (newLow) crossedL = ll!.index;
    state[i] = st;
    protectedLow[i] = isUp(st) ? pLow : NaN;
    pullbackHigh[i] = isDown(st) ? pHigh : NaN;
    lastHigh[i] = lh ? lh.price : NaN;
    lastLow[i] = ll ? ll.price : NaN;
  }
  return { state, event, protectedLow, pullbackHigh, lastHigh, lastLow };
}

export type Stage4 = "S1" | "S2" | "S3" | "S4" | "NA";

export interface TemplateCheck { key: string; ok: boolean | null; text: string }

/** Trend Template v3 (7 điều kiện giá, MTF-v3-prereg.md) tại nến t. */
export function trendTemplateAt(r: RibbonSeries, t: number): TemplateCheck[] {
  const b = r.bars, c = b[t].close, e21 = r.ema21[t], e50 = r.ema50[t], e100 = r.ema100[t], m200 = r.ma200[t];
  const m200p = t >= STRUCT.slope200Len ? r.ma200[t - STRUCT.slope200Len] : NaN;
  let hi = -Infinity, lo = Infinity;
  const from = Math.max(0, t - STRUCT.hiLoWindow + 1);
  for (let j = from; j <= t; j++) { hi = Math.max(hi, b[j].high); lo = Math.min(lo, b[j].low); }
  const enough = t - from + 1 >= 120;
  const f = (x: number) => Number.isFinite(x);
  const ok = (cond: boolean, ...need: number[]) => (need.every(f) ? cond : null);
  return [
    { key: "c1", ok: ok(c > e100 && c > m200, e100, m200), text: "Giá trên EMA100 và MA200" },
    { key: "c2", ok: ok(e100 > m200, e100, m200), text: "EMA100 trên MA200" },
    { key: "c3", ok: ok(m200 > m200p, m200, m200p), text: "MA200 dốc lên (so với 20 phiên trước)" },
    { key: "c4", ok: ok(e21 > e50 && e50 > e100 && e100 > m200, e21, e50, e100, m200), text: "Xếp lớp EMA21 > EMA50 > EMA100 > MA200" },
    { key: "c5", ok: ok(c > e50, e50), text: "Giá trên EMA50" },
    { key: "c6", ok: enough ? c >= 1.3 * lo : null, text: "Cao hơn đáy 52 tuần ≥ 30%" },
    { key: "c7", ok: enough ? c >= 0.75 * hi : null, text: "Cách đỉnh 52 tuần ≤ 25%" },
  ];
}

export interface StageSeries { stage: Stage4[]; stageAge: number[]; templateScore: number[] }

/**
 * Giai đoạn Minervini (Weinstein) S1–S4 tuần tự, trễ chống nhiễu: điều kiện giai đoạn mới phải giữ ≥ 3 nến liên tiếp (S2 → S3 / S4 đổi
 * ngay khi đóng cửa dưới MA200). Vào S2 = đủ 7 điều kiện Trend Template; giữ S2 khi đang S2 và giá > MA200 đang lên, EMA50 > MA200
 * (nhịp điều chỉnh / nền trong giai đoạn 2 — Sửa đổi 2); S4 = dưới MA200, MA200 dốc xuống, EMA50 < MA200; S3 = đã ở S2 trong 60 nến và
 * (MA200 phẳng hoặc giá dưới EMA100); còn lại S1.
 */
export function stageSeries(r: RibbonSeries): StageSeries {
  const n = r.bars.length;
  const stage = new Array<Stage4>(n).fill("NA"), stageAge = new Array<number>(n).fill(0), templateScore = new Array<number>(n).fill(0);
  let cur: Stage4 = "NA", age = 0, cand: Stage4 | null = null, candN = 0, lastS2 = -1e9;
  for (let t = 0; t < n; t++) {
    const m200 = r.ma200[t], m200p = t >= STRUCT.slope200Len ? r.ma200[t - STRUCT.slope200Len] : NaN, c = r.bars[t].close;
    let raw: Stage4 = "NA";
    if (Number.isFinite(m200) && Number.isFinite(m200p) && Number.isFinite(r.ema100[t])) {
      const tpl = trendTemplateAt(r, t);
      const score = tpl.filter((x) => x.ok).length;
      templateScore[t] = score;
      const slope = m200 / m200p - 1;
      if (tpl.every((x) => x.ok === true)) raw = "S2";
      // điều chỉnh / tạo nền TRONG giai đoạn 2 (Minervini: nền giá hình thành giữa giai đoạn 2) — giữ S2 khi vẫn trên MA200 đang lên
      else if (cur === "S2" && c > m200 && slope > 0 && r.ema50[t] > m200) raw = "S2";
      else if (c < m200 && slope < 0 && r.ema50[t] < m200) raw = "S4";
      else if (t - lastS2 <= STRUCT.stageS3Lookback && (Math.abs(slope) < STRUCT.ma200Flat || c < r.ema100[t])) raw = "S3";
      else raw = "S1";
    }
    if (raw === "S2") lastS2 = t;
    if (raw !== cur) {
      const immediate = cur === "NA" || (cur === "S2" && (raw === "S3" || raw === "S4") && Number.isFinite(m200) && c < m200);
      if (raw === cand) candN++; else { cand = raw; candN = 1; }
      if (immediate || candN >= STRUCT.stageHold) { cur = raw; age = 0; cand = null; candN = 0; }
    } else { cand = null; candN = 0; }
    stage[t] = cur;
    stageAge[t] = ++age;
  }
  return { stage, stageAge, templateScore };
}

export const STAGE4_LABEL: Record<Stage4, string> = { S1: "Giai đoạn 1 · Tích lũy nền", S2: "Giai đoạn 2 · Tăng giá", S3: "Giai đoạn 3 · Phân phối", S4: "Giai đoạn 4 · Giảm giá", NA: "Chưa đủ dữ liệu" };
export const DOW_LABEL: Record<DowState, string> = {
  UP: "Tăng (đỉnh và đáy cao dần)", UP_WEAK: "Tăng suy yếu (đỉnh thấp hơn, chưa thủng đáy bảo vệ)", BROKEN_UP: "Xu hướng tăng đã gãy (thủng đáy bảo vệ)",
  DOWN: "Giảm (đỉnh và đáy thấp dần)", DOWN_WEAK: "Giảm suy yếu (đáy cao hơn, chưa vượt đỉnh hồi)", BROKEN_DOWN: "Xu hướng giảm đã gãy (vượt đỉnh hồi)", RANGE: "Đi ngang / chưa rõ cấu trúc",
};
export const DOW_EVENT_LABEL: Record<Exclude<DowEvent, null>, string> = {
  CHOCH_UP: "Đổi tính chất ↑ (đáy cao hơn + vượt đỉnh sóng)", CHOCH_DOWN: "Đổi tính chất ↓ (đỉnh thấp hơn + thủng đáy sóng)",
  BOS_UP: "Phá cấu trúc ↑ (thuận xu hướng)", BOS_DOWN: "Phá cấu trúc ↓ (thuận xu hướng)",
  BREAK_PROTECTED_LOW: "Thủng đáy bảo vệ (押し安値)", BREAK_PULLBACK_HIGH: "Vượt đỉnh hồi (戻り高値)",
};
