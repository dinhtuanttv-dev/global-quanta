// Chuỗi tổng hợp cho test Wyckoff (tất định — không ngẫu nhiên).
import type { Bar } from "../math";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const wave = (i: number, amp: number, per: number) => amp * Math.sin((2 * Math.PI * i) / per);

/** Đẩy một đoạn giá theo hàm path(k) (k = 0..len-1) với KL vol(k). */
function push(out: Bar[], len: number, path: (k: number) => number, vol: (k: number) => number, spread = 0.006) {
  const start = out.length;
  for (let k = 0; k < len; k++) {
    const c = path(k), prev = out.length ? out[out.length - 1].close : c;
    const o = prev, hi = Math.max(o, c) * (1 + spread), lo = Math.min(o, c) * (1 - spread);
    out.push({ date: day(start + k), open: o, high: hi, low: lo, close: c, volume: vol(k) });
  }
}

/**
 * Lỗi "range cũ nhưng pha hiện tại": giảm -> range 60 phiên (100–108) -> SOW thủng range (KL lớn) -> Spring quay lại range
 * -> đóng cửa dưới đáy Spring rồi giảm kéo dài `tail` phiên (giá xa dưới range, không còn sự kiện Wyckoff nào).
 */
export function staleSpringSeries(tail = 90): Bar[] {
  const out: Bar[] = [];
  push(out, 60, (k) => 140 - k * 0.6, () => 1_000_000);                       // xu hướng giảm 140 -> ~104
  push(out, 60, (k) => 104 + wave(k, 3.5, 15), () => 800_000, 0.004);          // trading range ~100–108
  push(out, 6, (k) => 100 - (k + 1) * 1.6, (k) => (k === 0 ? 3_000_000 : 1_400_000)); // SOW: thủng range, KL lớn
  push(out, 8, (k) => 91 + (k + 1) * 1.6, () => 1_200_000);                    // hồi về range
  push(out, 12, (k) => 103 + wave(k, 2, 12), () => 700_000, 0.004);             // dao động trong range
  push(out, 3, (k) => [99.2, 98.5, 102.5][k], () => 650_000);                  // Spring: thủng nhẹ đáy range rồi đóng cửa trở lại
  push(out, 10, (k) => 103 + wave(k, 1.5, 10), () => 700_000, 0.004);
  push(out, tail, (k) => 98 - k * 0.35, () => 900_000);                       // đóng cửa dưới đáy Spring, giảm kéo dài
  return out;
}

/** Nến tường minh: [open, high, low, close, volume]. */
function explicit(out: Bar[], rows: [number, number, number, number, number][]) {
  for (const [o, h, l, c, v] of rows) out.push({ date: day(out.length), open: o, high: h, low: l, close: c, volume: v });
}

/**
 * Tích luỹ Wyckoff chuẩn: giảm -> SC (KL 4×, biên rộng) -> AR -> ST (KL thấp) -> Phase B -> Spring (KL thấp, 1 nến đóng dưới)
 * -> hồi -> Test (đáy cao hơn) -> SOS (biên rộng, KL 2×) -> tăng -> BUA -> phá đỉnh (Phase E).
 */
export function classicAccumulationSeries(): Bar[] {
  const out: Bar[] = [];
  const V = 1_000_000;
  // xu hướng giảm đều 60 nến: 150 -> ~102
  for (let k = 0; k < 60; k++) { const c = 150 - k * 0.8; explicit(out, [[c + 0.6, c + 1, c - 0.4, c, V]]); }
  explicit(out, [[102.2, 102.5, 92, 93, 4 * V]]);                                       // SC
  explicit(out, [[93, 97, 92.8, 96.5, 1.6 * V], [96.5, 100.5, 96, 100, 1.4 * V], [100, 103, 99.5, 102.5, 1.2 * V]]); // AR
  explicit(out, [[102.5, 102.8, 98.5, 99, V], [99, 99.5, 96.5, 97, 0.9 * V], [97, 97.5, 94.5, 95, 0.8 * V]]);       // giảm từ AR
  explicit(out, [[95, 95.5, 93.5, 94.5, 0.6 * V], [94.5, 96, 94, 95.8, 0.6 * V], [95.8, 97, 95.5, 96.8, 0.6 * V]]);  // ST (KL thấp)
  for (let k = 0; k < 18; k++) { const c = 98 + 3 * Math.sin((2 * Math.PI * k) / 9); explicit(out, [[c - 0.3, c + 0.8, c - 0.8, c, 0.7 * V]]); } // Phase B
  explicit(out, [[96, 96.3, 90.8, 91.5, 0.5 * V], [91.5, 94.8, 91.3, 94.6, 0.6 * V]]);   // Spring: 1 nến đóng dưới hỗ trợ 92 (KL thấp), quay lại
  explicit(out, [[94.6, 97, 94.4, 96.8, 0.8 * V], [96.8, 99.5, 96.5, 99.2, 0.9 * V], [99.2, 100.2, 98.6, 99.6, 0.8 * V]]); // hồi ≥ 35% TR
  explicit(out, [[99.6, 99.8, 96.5, 96.8, 0.6 * V], [96.8, 97, 94.2, 94.6, 0.5 * V], [94.6, 97.5, 94.4, 97.4, 0.7 * V]]);   // Test: đáy 94.2 > Spring, đảo chiều
  explicit(out, [[97.4, 100, 97.2, 99.8, 0.9 * V], [99.8, 102, 99.5, 101.6, V]]);
  explicit(out, [[101.6, 108.5, 101.5, 108, 2.4 * V]]);                                // SOS
  explicit(out, [[108, 110.5, 107.6, 110, 1.3 * V], [110, 112, 109.5, 111.5, 1.2 * V]]); // tăng tiếp
  explicit(out, [[111.5, 111.8, 109, 109.5, 0.6 * V], [109.5, 110, 107.8, 108.4, 0.5 * V], [108.4, 109.4, 107.6, 109, 0.5 * V]]); // BUA (KL thấp)
  explicit(out, [[109, 113.5, 108.8, 113, 1.6 * V], [113, 115, 112.5, 114.6, 1.3 * V]]); // phá đỉnh BUA -> Phase E
  return out;
}
