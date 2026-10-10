// Lớp "Mô hình giá (Pring)" (P5): mô hình của Pattern Scanner v2 (Gateway, pring/P4) vẽ lên biểu đồ TA — hàm thuần, toạ độ miền.
//   - Chỉ mô hình còn "tươi" của khung đang xem (D: khung ngày, W: khung tuần) — Gateway đã lọc mô hình cũ.
//   - Ghim chặt vào nến: mọi điểm / đầu mút phải trùng một nến của khung đang xem, không khớp thì bỏ phần đó (không trôi).
//   - Vẽ: biên / viền cổ / cột cờ, các điểm mô hình (nhãn), phá vỡ, mục tiêu 1× và mức thất bại 50% (kéo tới mép phải).
//   - EXPERIMENTAL (kiểm định P3 chưa đạt) — nhãn ghi rõ.
import type { OhlcvBar } from "../types";
import { GQ_COLORS, LABEL_PRIORITY, rgba, type SceneItem } from "./scene";

export interface PringScenePattern {
  type: string; label: string; dir: "bull" | "bear"; stateLabel: string; startDate: string; endDate: string;
  points: { name: string; date: string; price: number }[];
  lines: { name: string; p0: number; p1: number; d0: string; d1: string }[];
  breakout: { date: string; price: number } | null; failLevel: number | null; targets: number[];
}

const fmt = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

export function pringSceneItems(bars: OhlcvBar[], patterns: PringScenePattern[], { max = 2 } = {}): SceneItem[] {
  const items: SceneItem[] = [];
  if (!bars.length) return items;
  const dates = new Set(bars.map((b) => b.date));
  for (const p of patterns.slice(0, max)) {
    if (!dates.has(p.startDate) || !dates.has(p.endDate)) continue;
    const c = p.dir === "bull" ? GQ_COLORS.bull : GQ_COLORS.bear;
    for (const l of p.lines) {
      if (!dates.has(l.d0) || !dates.has(l.d1)) continue;
      items.push({ kind: "segment", a: { t: l.d0, price: l.p0 }, b: { t: l.d1, price: l.p1 }, color: rgba(c, 0.75), width: 1.5 });
    }
    const pts = p.points.filter((x) => dates.has(x.date)).sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length >= 2) items.push({ kind: "poly", points: pts.map((x) => ({ t: x.date, price: x.price })), color: rgba(c, 0.35), width: 1, dash: [2, 3], nodeLabels: pts.map((x) => x.name),
      label: { text: `${p.label} · ${p.stateLabel} · EXPERIMENTAL`, color: c, priority: LABEL_PRIORITY.user } });
    const from = p.breakout && dates.has(p.breakout.date) ? p.breakout.date : p.endDate;
    if (p.breakout && dates.has(p.breakout.date)) items.push({ kind: "vline", t: p.breakout.date, color: rgba(GQ_COLORS.amber, 0.45), dash: [2, 3], labelPrice: p.breakout.price,
      label: { text: "Phá vỡ", color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
    if (p.targets[0] != null) items.push({ kind: "hline", t1: from, t2: null, price: p.targets[0], color: rgba(c, 0.6), dash: [4, 3],
      label: { text: `Mục tiêu 1× ${fmt(p.targets[0])}`, color: c, priority: LABEL_PRIORITY.other } });
    if (p.failLevel != null) items.push({ kind: "hline", t1: from, t2: null, price: p.failLevel, color: rgba(GQ_COLORS.bear, 0.5), dash: [2, 2],
      label: { text: `Thất bại 50% ${fmt(p.failLevel)}`, color: GQ_COLORS.bear, priority: LABEL_PRIORITY.other } });
  }
  return items;
}

/** Thứ Hai của tuần chứa `date` (khóa nến tuần của TimeframeController). */
export function mondayOf(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`), day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/** Mô hình khung tuần của Gateway (ngày = phiên cuối tuần) -> ngày khóa nến tuần của biểu đồ (thứ Hai). */
export function toChartWeekly(patterns: PringScenePattern[]): PringScenePattern[] {
  return patterns.map((p) => ({
    ...p, startDate: mondayOf(p.startDate), endDate: mondayOf(p.endDate),
    points: p.points.map((x) => ({ ...x, date: mondayOf(x.date) })),
    lines: p.lines.map((l) => ({ ...l, d0: mondayOf(l.d0), d1: mondayOf(l.d1) })),
    breakout: p.breakout ? { ...p.breakout, date: mondayOf(p.breakout.date) } : null,
  }));
}
