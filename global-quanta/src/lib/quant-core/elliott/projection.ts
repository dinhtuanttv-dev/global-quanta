// DW3 (23/10/2026) — đường KỊCH BẢN MINH HOẠ sang vùng tương lai cho một cách đếm Elliott (như các phác đồ tham khảo: đường gấp khúc
// từ nến cuối qua các sóng kế tiếp). Hàm thuần, chỉ dùng kết quả engine đã có (mục tiêu Fibonacci sóng 5 / sóng 3, cTargets của
// classifyABC, cực trị sóng 4) — KHÔNG thêm công thức dự báo mới:
//   - GIÁ mỗi chặng = mức Fibonacci đầu tiên của engine còn ở phía trước giá đóng cửa (theo chiều chặng).
//   - THỜI GIAN mỗi chặng = độ dài sóng tương ứng đã qua (sóng 5 ≈ sóng 1, A/C ≈ sóng 4, B ≈ ½ A) — ước lượng để vẽ, không phải dự báo.
// Kiểm định E4: mục tiêu sóng 5 không có lợi thế ngoài mẫu (lift 1,02) -> nhãn "minh hoạ", không phải tín hiệu.
import { classifyABC, type ElliottPivot } from "./elliottGet.js";
import type { ElliottState } from "./index";

export interface ProjectionLeg { label: string; k: number; price: number }
export interface ElliottProjection {
  /** Ngày nến cuối (gốc của đường) và giá đóng cửa tại đó. */
  from: string;
  fromPrice: number;
  /** Các chặng theo thứ tự, k = số nến sau nến cuối (tăng dần). */
  legs: ProjectionLeg[];
  /** Căn cứ từng chặng (mức nào của engine, thời gian ước từ sóng nào). */
  basis: string[];
}

export const PROJECTION_NOTE = "Kịch bản minh hoạ: giá theo mức Fibonacci của engine, thời gian ước theo độ dài sóng tương ứng đã qua — không phải dự báo (EXPERIMENTAL, E4 không thấy lợi thế ngoài mẫu).";

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
const ratioVi = (r: number) => String(r).replace(".", ",");

/** Mức đầu tiên còn ở phía trước `from` theo chiều `dir` (1 = lên, −1 = xuống), duyệt theo thứ tự tỷ lệ tăng dần. */
function ahead(levels: { ratio: number; price: number }[], from: number, dir: 1 | -1) {
  return [...levels].filter((l) => Number.isFinite(l.price)).sort((a, b) => a.ratio - b.ratio).find((l) => dir * (l.price - from) > 0) ?? null;
}

export function elliottProjection(st: ElliottState | null, lastClose: number): ElliottProjection | null {
  if (!st || !Number.isFinite(lastClose) || !st.dir) return null;
  const L = st.barCount - 1;
  const s: 1 | -1 = st.dir === "up" ? 1 : -1;
  const dur = (a: { i: number }, b: { i: number }) => Math.max(1, b.i - a.i);
  const legs: ProjectionLeg[] = [], basis: string[] = [];
  const push = (label: string, dk: number, price: number, why: string) => {
    const k = (legs[legs.length - 1]?.k ?? 0) + Math.max(2, Math.round(dk));
    legs.push({ label, k, price }); basis.push(`${label}: ${why} → ${fmt(price)}`);
  };
  const sc = st.scenario;

  if (!sc) {
    if (st.wave !== "3") return null;
    const P = st.pivots.slice(-4) as ElliottPivot[];
    if (P.length < 4) return null;
    const [p0, p1, p2] = P;
    const lvl = (re: RegExp) => st.levels.filter((l) => re.test(l.label)).map((l) => ({ ratio: Number(l.label.match(/×([\d,]+)/)?.[1]?.replace(",", ".")) || 0, price: l.price }));
    const t3 = ahead(lvl(/Mục tiêu sóng 3/), lastClose, s);
    if (!t3) return null;
    push("3", Math.max(2, 1.618 * dur(p0, p1) - (L - p2.i)), t3.price, `mục tiêu sóng 3 ×${ratioVi(t3.ratio)} sóng 1, thời gian ≈ 1,618 × sóng 1`);
    const z = st.levels.find((l) => l.label.startsWith("Vùng sóng 4"));
    if (z && -s * (z.price - t3.price) > 0) push("4", dur(p1, p2), z.price, "vùng sóng 4 tương lai của engine, thời gian ≈ sóng 2");
    return { from: st.asOf, fromPrice: lastClose, legs, basis };
  }

  const p = sc.points;
  const p5 = p[5];
  const forming5 = st.wave === "5";
  if (forming5) {
    const t5 = ahead(sc.targets.wave5.levels, lastClose, s);
    if (t5) push("5", dur(p[0], p[1]) - (L - p[4].i), t5.price, `mục tiêu sóng 5 ×${ratioVi(t5.ratio)} (${sc.targets.wave5.mode}), thời gian ≈ sóng 1`);
    const a = p[4].price;
    if (-s * (a - (legs[legs.length - 1]?.price ?? lastClose)) > 0) push("A", dur(p[3], p[4]), a, "mục tiêu đầu tiên của điều chỉnh = cực trị sóng 4 (T-19), thời gian ≈ sóng 4");
    return legs.length ? { from: st.asOf, fromPrice: lastClose, legs, basis } : null;
  }
  if (!p5 || !p5.confirmed || !["A", "B", "C"].includes(st.wave)) return null;

  const after = st.pivots.filter((x) => x.i > p5.i && x.ci != null);
  const d4 = dur(p[3], p[4]);
  if (st.wave === "A") {
    const aT = -s * (p[4].price - lastClose) > 0 ? p[4].price : null;
    if (aT == null) return null;
    push("A", d4 - (L - p5.i), aT, "cực trị sóng 4 (T-19), thời gian ≈ sóng 4");
    const A = { price: aT }, lenA = s * (p5.price - aT);
    const B = { price: aT + s * 0.5 * lenA };
    push("B", d4 / 2, B.price, "hồi 50% sóng A, thời gian ≈ ½ sóng 4");
    const c = classifyABC(p5, A, B, null, s).cTargets?.find((t) => t.ratio === 1);
    if (c) push("C", d4, c.price, "C = A (×1) theo classifyABC, thời gian ≈ sóng 4");
  } else if (st.wave === "B") {
    const a = after[0];
    const lenA = s * (p5.price - a.price);
    const bT = a.price + s * 0.618 * lenA;
    const bPrice = s * (bT - lastClose) > 0 ? bT : lastClose;
    if (bPrice !== lastClose) push("B", dur(p5, a) / 2 - (L - a.i), bPrice, "hồi 61,8% sóng A, thời gian ≈ ½ sóng A");
    const c = ahead(classifyABC(p5, a, { price: bPrice }, null, s).cTargets ?? [], bPrice, (-s) as 1 | -1);
    if (c) push("C", dur(p5, a), c.price, `C ×${ratioVi(c.ratio)} sóng A theo classifyABC, thời gian ≈ sóng A`);
  } else {
    const [a, b] = after;
    const c = ahead(classifyABC(p5, a, b, null, s).cTargets ?? [], lastClose, (-s) as 1 | -1);
    if (c) push("C", dur(p5, a) - (L - b.i), c.price, `C ×${ratioVi(c.ratio)} sóng A theo classifyABC, thời gian ≈ sóng A`);
  }
  return legs.length ? { from: st.asOf, fromPrice: lastClose, legs, basis } : null;
}
