// DW6 (23/10/2026) — LỒNG BẬC: sóng con bậc nhỏ bên trong từng sóng của cách đếm đang chọn + nhãn kép bậc lớn "(1)/(A)".
// Quy ước ký hiệu (như bộ phác đồ tham khảo): bậc lớn (n) / (X) · bậc đang xem 1…5 / A B C · bậc nhỏ i…v / a b c (d e, w x y).
//   - Sóng đẩy 1, 3, 5: tìm 5 chặng bên trong bằng zigzag mịn (thang ngưỡng), nhãn i…v; không tìm được 5 chặng -> bỏ trống
//     (không bịa nhãn).
//   - Sóng điều chỉnh 2, 4: dùng điểm của mô hình DW4 (patterns) — a b c / a…e / a b w x a b y.
//   - Sau 5 sóng hoàn tất: bậc lớn chưa rõ là sóng (1) của xung lực mới hay (A) của điều chỉnh -> nhãn kép "(1)/(A)"
//     (khi khung tuần đã có cách đếm thì dùng bối cảnh tuần — xem mtf).
import type { ElliottCandle } from "./elliottGet.js";
import type { ElliottState } from "./index";
import { innerPivots, type PatternPoint } from "./patterns";

export interface SubLabel { i: number; price: number; time: string; label: string }
export interface ElliottNesting {
  /** Nhãn bậc nhỏ theo từng sóng của bậc đang xem (key = "1".."5"). */
  waves: Record<string, SubLabel[]>;
  /** Nhãn kép bậc lớn tại đỉnh/đáy sóng 5 đã xác nhận ("(1)/(A)"), null nếu sóng 5 chưa xong. */
  higherAt5: string | null;
}

const MOTIVE_SUB = ["i", "ii", "iii", "iv", "v"];
const MOTIVE_LADDER = [0.5, 0.35, 0.25, 0.7] as const;

/** 5 chặng bên trong sóng đẩy [a, b]; null nếu không thang ngưỡng nào cho đúng 5 chặng cùng chiều tổng thể. */
export function motiveSubwaves(candles: ElliottCandle[], a: PatternPoint, b: PatternPoint, pct: number): PatternPoint[] | null {
  for (const m of MOTIVE_LADDER) {
    const pts = innerPivots(candles, a, b, pct * m);
    if (pts.length === 6) {
      const s = Math.sign(b.price - a.price);
      // sóng con 1, 3, 5 cùng chiều sóng lớn; sóng con 2 không vượt gốc (quy tắc cứng tối thiểu)
      if (Math.sign(pts[1].price - pts[0].price) === s && s * (pts[2].price - pts[0].price) > 0) return pts;
    }
  }
  return null;
}

const corrLabels = (labels: string[]) => labels.slice(1).map((l) => l.toLowerCase());

export function elliottNesting(st: ElliottState | null, candles: ElliottCandle[], basePct: number, higherContext: "impulse" | "correction" | null = null): ElliottNesting | null {
  const sc = st?.scenario;
  if (!st || !sc || candles.length !== st.barCount) return null;
  const k = (sc as { degreeK?: number }).degreeK ?? 1;
  const pct = basePct * k;
  const P = sc.points.map((p) => ({ i: p.i, price: p.price, time: String(p.time) }));
  const waves: Record<string, SubLabel[]> = {};
  for (const w of [1, 3, 5]) {
    if (!P[w] || (w === 5 && !sc.points[5]?.confirmed)) continue;
    const sub = motiveSubwaves(candles, P[w - 1], P[w], pct);
    if (sub) waves[String(w)] = sub.slice(1, 5).map((p, j) => ({ i: p.i, price: p.price, time: String(p.time ?? candles[p.i]?.time ?? ""), label: MOTIVE_SUB[j] }));
  }
  for (const [w, seg] of [[2, st.patterns?.wave2], [4, st.patterns?.wave4]] as const) {
    if (!seg?.best || seg.points.length < 4) continue;
    const labs = corrLabels(seg.best.labels);
    // bỏ điểm cuối (trùng nhãn 2 / 4 của bậc đang xem)
    waves[String(w)] = seg.points.slice(1, -1).map((p, j) => ({ i: p.i, price: p.price, time: String(p.time ?? candles[p.i]?.time ?? ""), label: labs[j] ?? "" }));
  }
  const done5 = !!sc.points[5]?.confirmed;
  const higherAt5 = !done5 ? null : higherContext === "impulse" ? "(1)" : higherContext === "correction" ? "(A)" : "(1)/(A)";
  return { waves, higherAt5 };
}
