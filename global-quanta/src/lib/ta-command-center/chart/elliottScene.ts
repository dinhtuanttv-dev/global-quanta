// Lớp "Elliott tự động" (E5): đếm sóng của engine GET vẽ lên biểu đồ — hàm thuần, toạ độ miền (ngày, giá).
//   - CHỈ cấu trúc còn sống (elliottState đã lọc ≤ 3 pivot sau điểm cuối); không vẽ cấu trúc cũ.
//   - Mọi điểm phải trùng một nến của khung đang xem — điểm nào không khớp thì bỏ cả đường (ghim chặt vào nến, không trôi).
//   - Khung D có thể kèm đếm sóng TUẦN (ký hiệu (1)…(5), bậc lớn hơn) ghim vào nến ngày đạt cực trị của tuần.
import type { ElliottState } from "../../quant-core/elliott";
import type { OhlcvBar } from "../types";
import { GQ_COLORS, LABEL_PRIORITY, rgba, type ScenePoint, type SceneItem } from "./scene";

export interface ElliottHigherDegree { points: { date: string; price: number }[]; labels: string[] }

export interface ElliottSceneInput {
  bars: OhlcvBar[];
  /** Trạng thái Elliott tính trên CHÍNH khung đang xem (D: khung ngày, W: khung tuần). */
  primary: ElliottState | null;
  /** Đếm sóng bậc lớn hơn (tuần) đã ghim sang ngày — chỉ dùng trên khung D. */
  higher?: ElliottHigherDegree | null;
}

const isLive5 = (st: ElliottState) => {
  const sc = st.scenario!;
  return sc.status === "wave5-forming" || !!sc.provisional || !sc.points[5]?.confirmed;
};

/** Các điểm + nhãn của cách đếm chính: 0…5 (5? khi chưa xác nhận) rồi A, B, C sau đỉnh/đáy sóng 5. */
export function elliottCountPoints(st: ElliottState): { points: { date: string; price: number; i: number }[]; labels: string[] } | null {
  const sc = st.scenario;
  const P = (p: { time: string; price: number; i: number }) => ({ date: String(p.time), price: p.price, i: p.i });
  if (sc) {
    const pts = sc.points.map(P), labels = sc.points.map((p, k) => (k === 5 && !p.confirmed ? "5?" : String(k)));
    if (sc.points.length === 5 && sc.provisional) { pts.push(P(sc.provisional)); labels.push("5?"); }
    if (sc.points.length === 6 && sc.points[5].confirmed) {
      const after = st.pivots.filter((p) => p.i > sc.points[5].i).slice(0, 3);
      after.forEach((p, k) => { pts.push(P(p)); labels.push(`${"ABC"[k]}${p.confirmed ? "" : "?"}`); });
    }
    return { points: pts, labels };
  }
  if (st.wave === "3" && st.pivots.length >= 4) {                 // chưa đủ 5 sóng: 0-1-2 + sóng 3 đang chạy
    const last = st.pivots.slice(-4);
    return { points: last.map(P), labels: ["0", "1", "2", last[3].confirmed ? "3" : "3?"] };
  }
  return null;
}

export function elliottSceneItems(inp: ElliottSceneInput): SceneItem[] {
  const items: SceneItem[] = [];
  const dates = new Set(inp.bars.map((b) => b.date));
  if (!inp.bars.length) return items;
  const pinned = (pts: ScenePoint[]) => pts.every((p) => dates.has(p.t));

  const h = inp.higher;
  if (h && h.points.length >= 2) {
    const pts = h.points.map((p) => ({ t: p.date, price: p.price }));
    if (pinned(pts)) items.push({ kind: "poly", points: pts, color: rgba(GQ_COLORS.uv, 0.75), width: 1, dash: [6, 4], nodeLabels: h.labels,
      label: { text: "Elliott tuần", color: GQ_COLORS.uv, priority: LABEL_PRIORITY.other } });
  }

  const st = inp.primary;
  const cnt = st ? elliottCountPoints(st) : null;
  if (!st || !cnt) return items;
  const pts = cnt.points.map((p) => ({ t: p.date, price: p.price }));
  if (!pinned(pts)) return items;
  const up = st.dir === "up", color = up ? GQ_COLORS.bull : GQ_COLORS.bear;
  items.push({ kind: "poly", points: pts, color, width: 1.5, dash: st.scenario ? undefined : [4, 3], nodeLabels: cnt.labels,
    label: { text: `Elliott ${st.degree ?? ""}`.trim(), color, priority: LABEL_PRIORITY.other } });

  const sc = st.scenario;
  if (!sc) {
    // Sóng 3 đang chạy: chỉ mục tiêu đầu tiên (×1,618 sóng 1) — không rải toàn bộ mức.
    const t = st.levels.find((l) => l.label.includes("×1,618")) ?? st.levels[0];
    if (t) items.push({ kind: "hline", t1: pts[2].t, t2: null, price: t.price, color: rgba(color, 0.6), dash: [2, 3],
      label: { text: "Mục tiêu sóng 3 ×1,618", color, priority: LABEL_PRIORITY.other } });
    return items;
  }
  const p = sc.points;
  if (st.invalidation) {
    const from = isLive5(st) || sc.points.length < 6 ? String(p[4].time) : String(p[5].time);
    items.push({ kind: "hline", t1: from, t2: null, price: st.invalidation.price, color: rgba(GQ_COLORS.bear, 0.8), dash: [5, 3],
      label: { text: "Vô hiệu", color: GQ_COLORS.bear, priority: LABEL_PRIORITY.other } });
  }
  if (isLive5(st)) {
    const w = sc.targets.wave5.window03;
    items.push({ kind: "zone", t1: String(p[4].time), t2: null, top: Math.max(w.low, w.high), bottom: Math.min(w.low, w.high),
      fill: rgba(GQ_COLORS.amber, 0.06), stroke: rgba(GQ_COLORS.amber, 0.35), dash: [2, 3],
      label: { text: "Cửa sổ sóng 5 (sách)", color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
    // Kênh 2–4 và đường song song qua đỉnh sóng 1/3 (T-36), kéo tới nến cuối.
    const ch = sc.channel, L = st.barCount - 1, lastDate = inp.bars[inp.bars.length - 1].date;
    if (ch && L > p[4].i && lastDate === st.asOf) {
      const at = (a: { i: number; price: number }) => a.price + ch.slope * (L - a.i);
      items.push({ kind: "segment", a: { t: String(p[2].time), price: p[2].price }, b: { t: lastDate, price: at(p[2]) }, color: rgba(color, 0.45), width: 1, dash: [3, 3] });
      const anchor = ch.preferred === "upperW1" ? p[1] : p[3];
      items.push({ kind: "segment", a: { t: String(anchor.time), price: anchor.price }, b: { t: lastDate, price: at(anchor) }, color: rgba(color, 0.45), width: 1, dash: [3, 3] });
    }
  } else if (sc.points.length === 6 && sc.afterWave5) {
    // Sau 5 sóng: mục tiêu đầu tiên của điều chỉnh = cực trị sóng 4 (T-19).
    items.push({ kind: "hline", t1: String(p[5].time), t2: null, price: sc.afterWave5.firstTarget, color: rgba(GQ_COLORS.cyan, 0.6), dash: [2, 3],
      label: { text: "Mục tiêu điều chỉnh: sóng 4", color: GQ_COLORS.cyan, priority: LABEL_PRIORITY.other } });
  }
  return items;
}
