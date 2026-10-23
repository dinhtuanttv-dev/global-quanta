// DW8 (23/10/2026) — cách đếm Elliott CHỈNH TAY: hàm thuần cho bản nháp, bám nến, kiểm tra quy tắc, trạng thái phiên bản.
// Lưu ở Gateway (/api/market/elliott/counts, bảng local-only) — tách hẳn khỏi hình vẽ tay (chart-state) và khỏi cách đếm tự động.
import type { OhlcvBar } from "../../ta-command-center/types";
import type { ElliottState } from "./index";
import { classifyMotive, classifyThreeLeg, type PatternTag } from "./patterns";

export interface UserCountPoint { date: string; price: number; label: string }
export type UserCountStatus = "user_edited" | "user_confirmed";
export type UserCountDisplayStatus = UserCountStatus | "stale" | "invalidated";
export interface UserCountVersion {
  id: string;
  createdAt: string;
  status: UserCountStatus;
  points: UserCountPoint[];
  degree: string | null;
  pattern: PatternTag | null;
  note: string;
  basedOn: { source: string; asOf: string | null; rank: number | null };
  violations: string[];
}
export interface UserCountsDoc { schemaVersion: number; activeId: string | null; versions: UserCountVersion[]; updatedAt?: string | null }

/** Thứ tự nhãn chuẩn của một cách đếm: 0–5 rồi A, B, C. */
export const COUNT_LABELS = ["0", "1", "2", "3", "4", "5", "A", "B", "C"] as const;
export const STATUS_LABEL: Record<UserCountDisplayStatus, string> = {
  user_edited: "Đã chỉnh", user_confirmed: "Đã xác nhận", stale: "Cũ — giá đã đi tiếp", invalidated: "Đã vô hiệu",
};

/** Bám điểm vào nến gần nhất theo ngày: chọn high hay low tuỳ giá bấm gần bên nào hơn. */
export function snapToCandle(bars: OhlcvBar[], date: string, price: number): UserCountPoint | null {
  if (!bars.length) return null;
  let k = bars.findIndex((b) => b.date >= date);
  if (k < 0) k = bars.length - 1;
  if (k > 0 && bars[k].date !== date && Math.abs(Date.parse(bars[k - 1].date) - Date.parse(date)) < Math.abs(Date.parse(bars[k].date) - Date.parse(date))) k--;
  const b = bars[k];
  return { date: b.date, price: Math.abs(price - b.high) <= Math.abs(price - b.low) ? b.high : b.low, label: "" };
}

/** Bản nháp từ cách đếm của engine (0–5 + A/B/C đã xác nhận sau sóng 5). */
export function draftFromState(st: ElliottState | null): UserCountPoint[] {
  const sc = st?.scenario;
  if (!st || !sc) return [];
  const pts: UserCountPoint[] = sc.points.map((p, k) => ({ date: String(p.time), price: p.price, label: String(k) }));
  if (sc.points[5]?.confirmed) st.pivots.filter((x) => x.i > sc.points[5].i && x.ci != null).slice(0, 3)
    .forEach((p, k) => pts.push({ date: String(p.time), price: p.price, label: "ABC"[k] }));
  return pts;
}

const idx = (bars: OhlcvBar[], date: string) => bars.findIndex((b) => b.date === date);

/**
 * Kiểm tra quy tắc CỨNG của cách đếm chỉnh tay (vi phạm vẫn cho lưu nhưng gắn cờ):
 *   thời gian tăng dần · nhãn đúng thứ tự · đỉnh/đáy xen kẽ · mỗi điểm là cực trị của đoạn kề bên · quy tắc sóng đẩy (patterns)
 *   · sóng điều chỉnh A-B-C hợp lệ với ít nhất một mô hình.
 */
export function validateUserCount(points: UserCountPoint[], bars: OhlcvBar[]): string[] {
  const v: string[] = [];
  if (points.length < 2) return ["Cần ít nhất 2 điểm."];
  for (let k = 1; k < points.length; k++) if (points[k].date <= points[k - 1].date) { v.push(`Điểm ${points[k].label} không nằm sau điểm ${points[k - 1].label}.`); break; }
  const order = points.map((p) => COUNT_LABELS.indexOf(p.label as (typeof COUNT_LABELS)[number]));
  if (order.some((o, k) => o < 0 || (k > 0 && o !== order[k - 1] + 1))) v.push("Nhãn phải theo thứ tự 0, 1, 2, 3, 4, 5, A, B, C (liên tiếp).");
  for (let k = 2; k < points.length; k++) {
    const a = Math.sign(points[k - 1].price - points[k - 2].price), b = Math.sign(points[k].price - points[k - 1].price);
    if (a === b || a === 0) { v.push(`Điểm ${points[k - 1].label}: đỉnh/đáy phải xen kẽ.`); break; }
  }
  for (let k = 1; k < points.length - 1; k++) {
    const i0 = idx(bars, points[k - 1].date), i1 = idx(bars, points[k + 1].date);
    if (i0 < 0 || i1 < 0) continue;
    const up = points[k].price > points[k - 1].price;
    for (let i = i0 + 1; i < i1; i++) {
      if (up ? bars[i].high > points[k].price + 1e-9 : bars[i].low < points[k].price - 1e-9) { v.push(`Điểm ${points[k].label} không phải cực trị của đoạn ${points[k - 1].label}–${points[k + 1].label}.`); break; }
    }
  }
  const P = points.map((p) => ({ i: Math.max(0, idx(bars, p.date)), price: p.price }));
  const at0 = points.findIndex((p) => p.label === "0");
  if (at0 === 0 && points.length >= 6) {
    const m = classifyMotive(P.slice(0, 6), "unknown");
    if (!m.some((f) => f.valid)) v.push(...(m[0]?.rules.filter((r) => r.severity === "hard" && r.pass === false).map((r) => `Sóng đẩy: ${r.text}`) ?? []).slice(0, 3));
  } else if (at0 === 0 && points.length >= 3) {
    if (!(Math.abs(P[2].price - P[1].price) < Math.abs(P[1].price - P[0].price))) v.push("Sóng 2 vượt gốc sóng 1.");
  }
  const a5 = points.findIndex((p) => p.label === "5");
  if (a5 >= 0 && points.length >= a5 + 3) {
    const C = P[a5 + 3] ?? null;
    if (!classifyThreeLeg(P[a5], P[a5 + 1], P[a5 + 2], C).some((f) => f.valid)) v.push("Điều chỉnh A-B-C không khớp mô hình nào (zigzag / flat).");
  }
  return v;
}

/** Mốc vô hiệu của cách đếm chỉnh tay (theo sóng cuối): 2 -> gốc 0 · 3/4 -> đỉnh/đáy 1 (sóng 4 không lấn sóng 1) · 5 -> đáy/đỉnh 4. */
export function userInvalidation(points: UserCountPoint[]): { price: number; side: "above" | "below"; reason: string } | null {
  const by = (l: string) => points.find((p) => p.label === l);
  const last = points[points.length - 1]?.label;
  const p0 = by("0"), p1 = by("1");
  if (!p0 || !p1) return null;
  const side = p1.price > p0.price ? "below" : "above";
  if (last === "1" || last === "2") return { price: p0.price, side, reason: "Sóng 2 không vượt gốc sóng 1" };
  if (last === "3" || last === "4") return { price: p1.price, side, reason: "Sóng 4 không lấn vùng giá sóng 1" };
  const p4 = by("4");
  if (last === "5" && p4) return { price: p4.price, side, reason: "Thủng đáy/đỉnh sóng 4 khi sóng 5 chưa xong" };
  return null;
}

/**
 * Trạng thái hiển thị: "invalidated" khi giá đóng cửa nến cuối đã vượt mốc vô hiệu; "stale" khi engine đã xác nhận pivot mới
 * sau điểm cuối của cách đếm (giá đã đi tiếp — nên cập nhật); còn lại giữ trạng thái đã lưu.
 */
export function displayStatus(v: UserCountVersion, lastClose: number | null, engine: ElliottState | null): UserCountDisplayStatus {
  const inv = userInvalidation(v.points);
  if (inv && lastClose != null && (inv.side === "below" ? lastClose < inv.price : lastClose > inv.price)) return "invalidated";
  const lastDate = v.points[v.points.length - 1]?.date ?? "";
  if (engine?.pivots.some((p) => p.ci != null && String(p.time) > lastDate)) return "stale";
  return v.status;
}

let seq = 0;
export const newVersionId = (now = Date.now()) => `c${now.toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}`;
