// Lớp "Cấu trúc MTF v3" (S6, 30/10/2026): tài liệu /api/market/structure3 (hoặc bản phát lại tính trên trình duyệt) vẽ lên biểu đồ —
// hàm thuần, toạ độ MIỀN (ngày, giá), ghim chặt vào nến: mọi mốc quy về khoá nến của khung đang xem (Tuần -> thứ Hai, Tháng -> phiên đầu
// tháng của biểu đồ); không khớp nến có thật thì bỏ. Ba chế độ:
//   Tổng quan  — dải giai đoạn S1–S4 + hỗ trợ / kháng cự gần nhất.
//   Giao dịch  — + đáy bảo vệ / đỉnh hồi, nền giá + pivot, kế hoạch (cắt lỗ / mục tiêu), mốc CHoCH / BOS.
//   Chuyên sâu — + mọi mức giá, đường sóng, các nhịp co của nền, điểm kết thúc sóng 2 / 4 (Elliott × EMA).
import type { OhlcvBar } from "../types";
import type { Timeframe } from "../TimeframeController";
import type { ChartMarkerInput } from "../TVChartManager";
import type { Base3View, DowEvent, Stage4, Structure3Doc, Tf3 } from "../../../hooks/useStructure3";
import { GQ_COLORS, rgba, type SceneItem } from "./scene";
import { mondayOf } from "./pringScene";

export type StructureMode = "overview" | "trade" | "deep";
export const STRUCTURE_MODES: { key: StructureMode; label: string; hint: string }[] = [
  { key: "overview", label: "Tổng quan", hint: "Dải giai đoạn S1–S4 + hỗ trợ / kháng cự gần nhất" },
  { key: "trade", label: "Giao dịch", hint: "Thêm đáy bảo vệ / đỉnh hồi, nền giá + pivot, kế hoạch, mốc CHoCH / BOS" },
  { key: "deep", label: "Chuyên sâu", hint: "Thêm mọi mức giá, đường sóng, nhịp co của nền, kết thúc sóng 2 / 4" },
];
export const fmtPrice = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
export interface PriceLevel { price: number; color: string; title: string }

const STAGE_FILL: Record<Stage4, string | null> = { S1: rgba(GQ_COLORS.cyan, 0.035), S2: rgba(GQ_COLORS.bull, 0.05), S3: rgba(GQ_COLORS.amber, 0.06), S4: rgba(GQ_COLORS.bear, 0.06), NA: null };
const STAGE_COLOR: Record<Stage4, string> = { S1: GQ_COLORS.cyan, S2: GQ_COLORS.bull, S3: GQ_COLORS.amber, S4: GQ_COLORS.bear, NA: GQ_COLORS.text2 };
const STAGE_TEXT: Record<Stage4, string> = { S1: "GĐ1 tích lũy", S2: "GĐ2 tăng", S3: "GĐ3 phân phối", S4: "GĐ4 giảm", NA: "" };
const P = { stage: 20, level: 30, base: 40, protect: 50, plan: 62, wave: 45 } as const;
const EVENT_MARK: Record<DowEvent, { text: string; up: boolean }> = {
  CHOCH_UP: { text: "CH↑", up: true }, CHOCH_DOWN: { text: "CH↓", up: false }, BOS_UP: { text: "BOS↑", up: true }, BOS_DOWN: { text: "BOS↓", up: false },
  BREAK_PROTECTED_LOW: { text: "✕ ĐBV", up: false }, BREAK_PULLBACK_HIGH: { text: "✕ ĐH", up: true },
};

/** Khung biểu đồ -> khung phân tích v3 (null: khung trong ngày chỉ vẽ mức giá). */
export function structure3TfFor(tf: Timeframe): Tf3 | null {
  return tf === "D" ? "D" : tf === "W" ? "W" : tf === "M" ? "M" : null;
}

interface Ctx { tf: Timeframe; first: string; last: string; map: (d: string) => string | null }
function ctxOf(bars: OhlcvBar[], tf: Timeframe): Ctx {
  const dates = new Set(bars.map((b) => b.date));
  const month = new Map<string, string>();
  for (const b of bars) if (!month.has(b.date.slice(0, 7))) month.set(b.date.slice(0, 7), b.date);
  const map = (d: string) => {
    const k = tf === "W" ? mondayOf(d) : tf === "M" ? month.get(d.slice(0, 7)) ?? "" : d.slice(0, 10);
    return dates.has(k) ? k : null;
  };
  return { tf, first: bars[0]?.date ?? "", last: bars[bars.length - 1]?.date ?? "", map };
}

function baseItems(b: Base3View, c: Ctx, deep: boolean): SceneItem[] {
  const t1 = c.map(b.from) ?? c.first, t2 = c.map(b.to) ?? c.last, out: SceneItem[] = [];
  out.push({ kind: "zone", t1, t2, top: b.leftHigh, bottom: b.low, fill: rgba(GQ_COLORS.cyan, b.valid ? 0.04 : 0.015), stroke: rgba(GQ_COLORS.cyan, b.valid ? 0.4 : 0.15), dash: [2, 2],
    label: { text: `${b.patternLabel} · ${b.footprint}${b.valid ? "" : " · chưa đạt chuẩn"}`, color: GQ_COLORS.cyan, priority: P.base } });
  const tp = c.map(b.pivotDate) ?? t1;
  out.push({ kind: "hline", t1: tp, t2: null, price: b.pivot, color: rgba(GQ_COLORS.amber, 0.85), dash: [5, 3], width: 1.2, label: { text: `Pivot ${fmtPrice(b.pivot)}`, color: GQ_COLORS.amber, priority: P.base + 3 } });
  if (deep && b.contractions.length) {
    const pts = b.contractions.flatMap((k) => [{ t: c.map(k.hiDate), price: k.hi }, { t: c.map(k.loDate), price: k.lo }]).filter((p): p is { t: string; price: number } => !!p.t);
    if (pts.length >= 2) out.push({ kind: "poly", points: pts, color: rgba(GQ_COLORS.cyan, 0.6), width: 1, dash: [2, 2], nodeLabels: b.contractions.flatMap((k) => [`−${Math.round(k.depthPct)}%`, ""]) });
  }
  return out;
}

/** Phần tử lớp phủ MTF v3 cho khung đang xem. */
export function structure3SceneItems(bars: OhlcvBar[], timeframe: Timeframe, doc: Structure3Doc | null | undefined, mode: StructureMode, opts: { asOf?: string } = {}): SceneItem[] {
  if (!doc || !bars.length) return [];
  const c = ctxOf(bars, timeframe);
  if (opts.asOf && c.map(opts.asOf)) c.last = c.map(opts.asOf)!;
  const key = structure3TfFor(timeframe), items: SceneItem[] = [];
  const close = (opts.asOf ? bars.find((b) => b.date === c.last)?.close : undefined) ?? bars[bars.length - 1].close;
  const deep = mode === "deep", trade = mode !== "overview";
  // 1. mức hỗ trợ / kháng cự (ba khung) — neo từ nến đầu, có trong mọi khung
  const lv = doc.bases?.levels ?? [];
  const sup = lv.filter((l) => l.role === "support").sort((x, y) => y.price - x.price), res = lv.filter((l) => l.role === "resistance").sort((x, y) => x.price - y.price);
  const pick = deep ? lv : trade ? [...sup.slice(0, 2), ...res.slice(0, 2)] : [...sup.slice(0, 1), ...res.slice(0, 1)];
  for (const l of pick) {
    const col = l.role === "support" ? GQ_COLORS.bull : GQ_COLORS.bear, pad = Math.max(0, close * 0.0015 - (l.hi - l.lo) / 2);
    items.push({ kind: "zone", t1: c.first, t2: null, top: l.hi + pad, bottom: l.lo - pad, fill: rgba(col, 0.05 + Math.min(0.1, l.strength * 0.01)), stroke: rgba(col, 0.35), dash: [3, 3],
      label: { text: `${l.role === "support" ? "Hỗ trợ" : "Kháng cự"}${l.flipped ? " (đổi vai)" : ""} ${fmtPrice(l.price)} · ${l.frames.map((f) => (f === "D" ? "N" : f === "W" ? "T" : "Th")).join("/")} · ${l.touches} lần chạm`, color: col, priority: P.level + l.strength } });
  }
  if (!key) return items;
  const fr = doc.structure?.frames?.[key], ctx3 = doc.structure?.context?.[key];
  // 2. dải giai đoạn S1–S4
  for (const [i, s] of (fr?.segments ?? []).slice(deep ? -16 : -6).entries()) {
    const fill = STAGE_FILL[s.stage], t1 = c.map(s.from) ?? (s.from < c.first ? c.first : null), t2 = c.map(s.to);
    if (!fill || !t1 || !t2) continue;
    items.push({ kind: "band", t1, t2, fill, label: { text: `${STAGE_TEXT[s.stage]} · ${s.bars} nến`, color: STAGE_COLOR[s.stage], priority: P.stage + i } });
  }
  if (!trade) return items;
  // 3. đáy bảo vệ / đỉnh hồi (đường Dow mà đóng cửa vượt qua = gãy xu hướng)
  const lastL = fr?.swings.filter((s) => s.kind === "L").pop(), lastH = fr?.swings.filter((s) => s.kind === "H").pop();
  if (ctx3?.protectedLow != null) {
    const t = (lastL && c.map(lastL.date)) || c.first;
    items.push({ kind: "hline", t1: t, t2: null, price: ctx3.protectedLow, color: rgba(GQ_COLORS.bull, 0.85), dash: [6, 3], width: 1.3, label: { text: `Đáy bảo vệ ${fmtPrice(ctx3.protectedLow)}`, color: GQ_COLORS.bull, priority: P.protect } });
  }
  if (ctx3?.pullbackHigh != null) {
    const t = (lastH && c.map(lastH.date)) || c.first;
    items.push({ kind: "hline", t1: t, t2: null, price: ctx3.pullbackHigh, color: rgba(GQ_COLORS.bear, 0.85), dash: [6, 3], width: 1.3, label: { text: `Đỉnh hồi ${fmtPrice(ctx3.pullbackHigh)}`, color: GQ_COLORS.bear, priority: P.protect } });
  }
  // 4. nền giá + pivot (khung ngày / tuần)
  // nền chưa đạt chuẩn (quá sâu / chữ V…) chỉ hiện ở Chuyên sâu, dạng khung mờ không nhịp co — tránh rối biểu đồ
  const base = key === "D" ? doc.bases?.D : key === "W" ? doc.bases?.W : null;
  if (base && (base.valid || deep)) items.push(...baseItems(base, c, deep && base.valid));
  // 5. kế hoạch (khung ngày) — chỉ khi có thiết lập
  const plan = doc.decision?.plan;
  if (key === "D" && plan && doc.decision?.active) {
    items.push({ kind: "hline", t1: c.last, t2: null, price: plan.stop, color: rgba(GQ_COLORS.bear, 0.8), dash: [2, 2], label: { text: `Cắt lỗ ${fmtPrice(plan.stop)}`, color: GQ_COLORS.bear, priority: P.plan + 1 } });
    items.push({ kind: "hline", t1: c.last, t2: null, price: plan.target1, color: rgba(GQ_COLORS.bull, 0.7), dash: [4, 3], label: { text: `Mục tiêu 1 ${fmtPrice(plan.target1)} · R:R 1:${plan.rr1.toLocaleString("vi-VN")}`, color: GQ_COLORS.bull, priority: P.plan } });
  }
  if (!deep) return items;
  // 6. đường sóng + điểm kết thúc sóng 2 / 4
  const sw = (fr?.swings ?? []).map((s) => ({ t: c.map(s.date), price: s.price })).filter((p): p is { t: string; price: number } => !!p.t);
  if (sw.length >= 3) items.push({ kind: "poly", points: sw, color: rgba(GQ_COLORS.text2, 0.5), width: 1, dash: [1, 3] });
  const we = doc.elliott && !("error" in doc.elliott) ? doc.elliott.waveEnd : null;
  if (key === "D" && we?.date && c.map(we.date)) items.push({ kind: "ring", t: c.map(we.date)!, price: we.price, color: we.inFibZone && we.inEmaBand ? GQ_COLORS.bull : GQ_COLORS.amber, label: { text: `Kết thúc sóng ${we.wave}`, color: GQ_COLORS.amber, priority: P.wave } });
  return items;
}

/** Mốc CHoCH / BOS / gãy đáy bảo vệ dạng marker của thư viện (Giao dịch: 10 mốc gần nhất, Chuyên sâu: 24). */
export function structure3Markers(bars: OhlcvBar[], timeframe: Timeframe, doc: Structure3Doc | null | undefined, mode: StructureMode): ChartMarkerInput[] {
  const key = structure3TfFor(timeframe);
  if (!doc || mode === "overview" || !key) return [];
  const c = ctxOf(bars, timeframe);
  return (doc.structure?.frames?.[key]?.events ?? []).slice(mode === "deep" ? -24 : -10).flatMap((e): ChartMarkerInput[] => {
    const t = c.map(e.date), m = EVENT_MARK[e.type];
    return t ? [{ time: t, position: m.up ? "belowBar" : "aboveBar", color: m.up ? GQ_COLORS.bull : GQ_COLORS.bear, shape: m.up ? "arrowUp" : "arrowDown", text: m.text }] : [];
  });
}

/** Thang mức giá ở trục phải: kế hoạch (khi có thiết lập) + hỗ trợ / kháng cự mạnh nhất. */
export function structure3Levels(doc: Structure3Doc | null | undefined, mode: StructureMode, close: number): PriceLevel[] {
  if (!doc || mode === "overview") return [];
  const out: PriceLevel[] = [], p = doc.decision?.plan;
  if (p && doc.decision?.active) {
    out.push({ price: p.stop, color: GQ_COLORS.bear, title: "Cắt lỗ" });
    out.push({ price: p.target1, color: GQ_COLORS.bull, title: `Mục tiêu 1 (R:R 1:${p.rr1.toLocaleString("vi-VN")})` });
  }
  const lv = doc.bases?.levels ?? [];
  const sup = lv.filter((l) => l.role === "support" && l.price < close).sort((a, b) => b.strength - a.strength)[0];
  const res = lv.filter((l) => l.role === "resistance" && l.price > close).sort((a, b) => b.strength - a.strength)[0];
  if (sup) out.push({ price: sup.price, color: rgba(GQ_COLORS.bull, 0.7), title: "Hỗ trợ mạnh" });
  if (res) out.push({ price: res.price, color: rgba(GQ_COLORS.bear, 0.7), title: "Kháng cự mạnh" });
  return out;
}
