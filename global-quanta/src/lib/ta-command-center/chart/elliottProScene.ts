// EP3 (24/10/2026) — LỚP "ELLIOTT PRO": một chỉ báo tổng hợp vẽ từ cây sóng v3 + kịch bản có vòng đời (EP1/EP2).
//   Gọn        — cách đếm ở bậc hiển thị + MT1 + mốc kích hoạt + mốc vô hiệu của kịch bản chính.
//   Phác đồ    — như bộ phác đồ tham khảo: + sóng con bậc dưới, kênh hiện hành theo mẫu kịch bản, MT1/MT2, vòng kích hoạt,
//                đường kịch bản có hình sóng con, kịch bản phụ (xám chấm), thẻ mô hình, nhãn kép (1)/(A).
//   Chuyên sâu — + mọi bậc, kịch bản phụ đầy đủ.
// Hàm thuần, toạ độ miền (ngày, giá); điểm nào không trùng một nến của khung đang xem thì bỏ (ghim chặt vào nến).
// Nhãn có tầng ưu tiên riêng (vô hiệu > mục tiêu > kích hoạt > thông tin) + ngân sách nhãn theo chế độ.
import type { OhlcvBar } from "../types";
import type { WaveNode, WaveTree } from "../../quant-core/elliott/v3/waveTree";
import { STATE_LABEL, type EwScenario, type ScenarioLifecycle } from "../../quant-core/elliott/v3/scenarios";
import { PROJECTION_SHAPES } from "../../quant-core/elliott/projection";
import { GQ_COLORS, rgba, type SceneItem } from "./scene";

export type ElliottProMode = "compact" | "chart" | "deep";
export const ELLIOTT_PRO_MODES: { id: ElliottProMode; label: string }[] = [
  { id: "compact", label: "Gọn" }, { id: "chart", label: "Phác đồ" }, { id: "deep", label: "Chuyên sâu" },
];
export const ELLIOTT_PRO_LABEL_BUDGET: Record<ElliottProMode, number> = { compact: 14, chart: 20, deep: 28 };
/** Tầng ưu tiên nhãn Elliott (cao hơn nhãn "khác" của các lớp khác). */
export const EW_PRIORITY = { invalid: 79, target: 77, trigger: 75, tag: 60, info: 36 } as const;

export interface ScenarioView { sc: EwScenario; lc: ScenarioLifecycle }
export interface ElliottProInput { tree: WaveTree | null; scenarios: ScenarioView[]; mode: ElliottProMode }

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
const isStruct = (n: WaveNode | undefined): n is WaveNode => !!n && (n.kind === "motive" || n.kind === "corrective") && n.children.length >= 2;
const ptsOf = (n: WaveNode) => [n.children[0].start, ...n.children.map((c) => c.end)];

/** Bậc hiển thị: bậc cao nhất có nút cuối là cấu trúc ≥ 2 sóng (vị trí hiện tại có ý nghĩa nhất). */
export function displayLevel(t: WaveTree): number {
  for (let lv = t.levels.length - 1; lv >= 1; lv--) if (isStruct(t.levels[lv][t.levels[lv].length - 1])) return lv;
  return 0;
}

/** Kịch bản chính để vẽ: ưu tiên kịch bản đã xác nhận còn hiệu lực, rồi kịch bản "tạm". */
export function primaryScenario(list: ScenarioView[]): ScenarioView | null {
  const live = (v: ScenarioView) => v.lc.state === "waiting" || v.lc.state === "triggered" || v.lc.state === "target1";
  return list.find((v) => v.sc.role === "primary" && !v.sc.provisional && live(v)) ?? list.find((v) => !v.sc.provisional && live(v)) ?? list.find(live) ?? list[0] ?? null;
}

/** Dòng tóm tắt trên biểu đồ. */
export function elliottProSummary(inp: ElliottProInput): string | null {
  const t = inp.tree;
  if (!t) return null;
  const lv = displayLevel(t);
  const n = lv ? t.levels[lv][t.levels[lv].length - 1] : null;
  const pos = n ? `${n.childLabels[n.childLabels.length - 1] ?? "?"} của ${n.pattern ?? ""} ${n.dir > 0 ? "↑" : "↓"}${n.complete ? "" : " (đang chạy)"}` : "chưa rõ cấu trúc";
  const p = primaryScenario(inp.scenarios);
  if (!p) return `EW · ${pos}${t.dualLabel ? ` · ${t.dualLabel}` : ""}`;
  const st = p.sc.provisional ? "tạm" : STATE_LABEL[p.lc.state];
  return `EW · ${pos}${t.dualLabel ? ` · ${t.dualLabel}` : ""} · ${p.sc.title} ${p.sc.dir > 0 ? "↑" : "↓"} (${st}) · kích hoạt ${fmt(p.sc.trigger.price)} · MT ${fmt(p.sc.targets[0].price)} · vô hiệu ${fmt(p.sc.invalidation.price)}`;
}

/** Hình đường kịch bản: chặng đẩy 5 nhịp (đi theo hướng kịch bản), điều chỉnh sau 5 sóng a-b-c. */
const shapeOf = (sc: EwScenario) => PROJECTION_SHAPES[sc.template === "afterImpulse" ? "zigzag" : "motive"];

/** Đường kịch bản tương lai: nến cuối -> MT1 -> MT2; thời gian ước theo độ dài chặng tham chiếu của mẫu. */
export function scenarioPathItems(v: ScenarioView, t: WaveTree, bars: OhlcvBar[], color: string, dash: number[], prefix: string): SceneItem[] {
  const last = bars[bars.length - 1];
  if (!last || last.date !== t.asOf) return [];
  const sc = v.sc;
  if (v.lc.state === "invalidated" || v.lc.state === "expired" || v.lc.state === "target2") return [];
  const idx = new Map(t.pivots.map((p) => [p.time, p.i]));
  const a = sc.anchors.map((x) => idx.get(x.time)).filter((x): x is number => x != null);
  const ref = a.length >= 2 ? Math.max(3, a[1] - a[0]) : 10;
  const goals = v.lc.state === "target1" ? sc.targets.slice(1) : sc.targets;
  const out: SceneItem[] = [];
  let prev = { k: 0, price: last.close };
  goals.forEach((g, j) => {
    const dk = Math.round(ref * (j === 0 ? 1 : 0.8));
    const sh = shapeOf(sc), dp = g.price - prev.price;
    const points = [prev];
    for (let s = 1; s < sh.price.length; s++) points.push({ k: s === sh.price.length - 1 ? prev.k + dk : prev.k + Math.max(1, Math.round(dk * sh.time[s])), price: s === sh.price.length - 1 ? g.price : prev.price + dp * sh.price[s] });
    out.push({ kind: "future", from: last.date, points, color, width: 1.5, dash, arrow: j === goals.length - 1,
      label: { text: `${j === 0 ? prefix : ""}MT${v.lc.state === "target1" ? 2 : j + 1}`, color, priority: EW_PRIORITY.info } });
    prev = { k: prev.k + dk, price: g.price };
  });
  return out;
}

/** Kênh hiện hành theo mẫu kịch bản (Base 0–2∥1 · Final 2–4∥3 · Corrective 0–B∥A · tam giác A–C & B–D), kéo tới nến cuối. */
function channelItems(sc: EwScenario, bars: OhlcvBar[], dates: Map<string, number>): SceneItem[] {
  const A = sc.anchors, L = bars.length - 1, lastDate = bars[L].date;
  const at = (p: { time: string; price: number }, q: { time: string; price: number }, i: number) => {
    const ip = dates.get(p.time)!, iq = dates.get(q.time)!;
    return p.price + ((q.price - p.price) / Math.max(1, iq - ip)) * (i - ip);
  };
  const lines: [{ time: string; price: number }, { time: string; price: number }, { time: string; price: number } | null][] = [];
  if (sc.template === "wave3" && A.length >= 3) lines.push([A[0], A[2], A[1]]);
  else if (sc.template === "wave5" && A.length >= 5) lines.push([A[2], A[4], A[3]]);
  else if ((sc.template === "waveC" || sc.template === "afterCorrection") && A.length >= 3) lines.push([A[0], A[2], A[1]]);
  else if (sc.template === "triangleThrust" && A.length >= 5) { lines.push([A[1], A[3], null]); lines.push([A[2], A[4], null]); }
  else if (sc.template === "afterImpulse" && A.length >= 6) lines.push([A[2], A[4], A[3]]);
  const out: SceneItem[] = [];
  const col = rgba(GQ_COLORS.cyan, 0.45);
  for (const [p, q, par] of lines) {
    if (!dates.has(p.time) || !dates.has(q.time)) continue;
    const ip = dates.get(p.time)!;
    out.push({ kind: "segment", a: { t: p.time, price: p.price }, b: { t: lastDate, price: at(p, q, L) }, color: col, width: 1, dash: [4, 3] });
    if (par && dates.has(par.time)) {
      const off = par.price - at(p, q, dates.get(par.time)!);
      out.push({ kind: "segment", a: { t: bars[ip].date, price: p.price + off }, b: { t: lastDate, price: at(p, q, L) + off }, color: col, width: 1, dash: [4, 3] });
    }
  }
  return out;
}

/** Các mốc của một kịch bản: kích hoạt (đường / vòng tròn nếu đã kích hoạt), MT1/MT2, ✕ vô hiệu. */
function scenarioMarks(v: ScenarioView, bars: OhlcvBar[], dates: Map<string, number>, compact: boolean): SceneItem[] {
  const sc = v.sc, out: SceneItem[] = [];
  // Neo tại điểm neo ĐẦU TIÊN có trên biểu đồ: đường trải từ cấu trúc sang phải, nhãn nằm trong khung nhìn (như phác đồ tham khảo).
  const from = sc.anchors.find((a) => dates.has(a.time))?.time;
  if (!from) return out;
  const trig = v.lc.events.find((e) => e.type === "triggered");
  if (trig && dates.has(trig.time)) out.push({ kind: "ring", t: trig.time, price: trig.price, color: GQ_COLORS.cyan, r: 6, label: { text: "kích hoạt", color: GQ_COLORS.cyan, priority: EW_PRIORITY.trigger } });
  else if (sc.trigger.line && dates.has(sc.trigger.line.a.time) && dates.has(sc.trigger.line.b.time)) {
    const a = sc.trigger.line.a, b = sc.trigger.line.b, ia = dates.get(a.time)!, ib = dates.get(b.time)!, L = bars.length - 1;
    out.push({ kind: "segment", a: { t: a.time, price: a.price }, b: { t: bars[L].date, price: a.price + ((b.price - a.price) / Math.max(1, ib - ia)) * (L - ia) }, color: rgba(GQ_COLORS.cyan, 0.8), width: 1.2, dash: [5, 3] });
    out.push({ kind: "text", t: b.time, price: b.price, dy: -8, label: { text: "đường kích hoạt B–D", color: GQ_COLORS.cyan, priority: EW_PRIORITY.trigger } });
  } else out.push({ kind: "hline", t1: from, t2: null, price: sc.trigger.price, color: rgba(GQ_COLORS.cyan, 0.75), dash: [5, 3], label: { text: `Kích hoạt ${fmt(sc.trigger.price)}`, color: GQ_COLORS.cyan, priority: EW_PRIORITY.trigger } });
  (compact ? sc.targets.slice(0, 1) : sc.targets).forEach((tg, j) => out.push({ kind: "hline", t1: from, t2: null, price: tg.price, color: rgba(GQ_COLORS.amber, 0.7), dash: [1, 3],
    label: { text: `MT${j + 1} ${tg.label} · ${fmt(tg.price)}`, color: GQ_COLORS.amber, priority: EW_PRIORITY.target } }));
  out.push({ kind: "hline", t1: from, t2: null, price: sc.invalidation.price, color: rgba(GQ_COLORS.bear, 0.8), dash: [5, 3],
    label: { text: `✕ Vô hiệu ${fmt(sc.invalidation.price)}`, color: GQ_COLORS.bear, priority: EW_PRIORITY.invalid } });
  return out;
}

export function elliottProItems(inp: ElliottProInput, bars: OhlcvBar[]): SceneItem[] {
  const t = inp.tree;
  if (!t || !bars.length) return [];
  const dates = new Map(bars.map((b, i) => [b.date, i]));
  const out: SceneItem[] = [];
  const lv = displayLevel(t);
  const mode = inp.mode;
  if (lv) {
    const lvl = t.levels[lv];
    const show = lvl.slice(mode === "compact" ? -1 : -2).filter(isStruct);
    for (const n of show) {
      const ps = ptsOf(n);
      if (!ps.every((p) => dates.has(p.time))) continue;
      const up = n.dir > 0, color = up ? GQ_COLORS.bull : GQ_COLORS.bear;
      out.push({ kind: "poly", points: ps.map((p) => ({ t: p.time, price: p.price })), color, width: 1.5, dash: n.complete ? undefined : [4, 3],
        nodeLabels: [n.kind === "motive" ? "0" : "·", ...n.childLabels] });
      if (mode !== "compact" && n.pattern) {
        const e = ps[ps.length - 1];
        out.push({ kind: "text", t: e.time, price: e.price, dy: e.price >= ps[ps.length - 2].price ? -16 : 22, label: { text: `"${n.pattern}"`, color: GQ_COLORS.amber, priority: EW_PRIORITY.tag } });
      }
      // sóng con bậc dưới (chữ nhỏ, không đường nối)
      if (mode !== "compact") for (const ch of n.children) {
        if (!isStruct(ch)) continue;
        const cps = ptsOf(ch).slice(1, -1).filter((p) => dates.has(p.time));
        if (cps.length) out.push({ kind: "poly", points: cps.map((p) => ({ t: p.time, price: p.price })), color: rgba(color, 0.8), width: 0, nodeStyle: "plain", nodeLabels: ch.childLabels.slice(0, -1) });
      }
    }
    // Chuyên sâu: cấu trúc cuối của các bậc thấp hơn bậc hiển thị
    if (mode === "deep") for (let k = lv - 1; k >= 1; k--) {
      const n = t.levels[k][t.levels[k].length - 1];
      if (!isStruct(n)) continue;
      const ps = ptsOf(n).filter((p) => dates.has(p.time));
      if (ps.length >= 2) out.push({ kind: "poly", points: ps.map((p) => ({ t: p.time, price: p.price })), color: rgba(GQ_COLORS.uv, 0.7), width: 1, dash: [2, 2], nodeStyle: "plain", nodeLabels: ["", ...n.childLabels].slice(-ps.length) });
    }
    if (t.dualLabel && mode !== "compact") {
      const n = lvl[lvl.length - 1], e = n.end;
      if (dates.has(e.time)) out.push({ kind: "text", t: e.time, price: e.price, dy: e.price >= n.start.price ? -30 : 36, label: { text: t.dualLabel, color: GQ_COLORS.amber, priority: EW_PRIORITY.tag + 1 } });
    }
  }
  const prim = primaryScenario(inp.scenarios);
  if (prim) {
    out.push(...scenarioMarks(prim, bars, dates, mode === "compact"));
    if (mode !== "compact") {
      out.push(...channelItems(prim.sc, bars, dates));
      out.push(...scenarioPathItems(prim, t, bars, rgba(GQ_COLORS.amber, 0.9), [6, 3], `${prim.sc.title}: `));
      const alt = inp.scenarios.find((v) => v !== prim && v.sc.dir !== prim.sc.dir && (v.lc.state === "waiting" || v.lc.state === "triggered"));
      if (alt) out.push(...scenarioPathItems(alt, t, bars, rgba(GQ_COLORS.text2, 0.8), [2, 3], "kịch bản phụ: "));
    }
    if (mode === "deep") for (const v of inp.scenarios) if (v !== prim && !v.sc.provisional) out.push(...scenarioMarks(v, bars, dates, true).filter((x) => x.kind === "hline").map((x) => (x.kind === "hline" ? { ...x, color: rgba(GQ_COLORS.text2, 0.5), label: x.label ? { ...x.label, priority: EW_PRIORITY.info } : undefined } : x)));
  }
  // gộp mức giá trùng (±0,15%): giữ nhãn ưu tiên cao hơn
  const seen: { price: number; prio: number; idx: number }[] = [];
  const res: SceneItem[] = [];
  for (const it of out) {
    if (it.kind === "hline") {
      const prio = it.label?.priority ?? 0;
      const dup = seen.find((s) => Math.abs(s.price - it.price) <= 0.0015 * Math.max(1, Math.abs(it.price)));
      if (dup) { if (prio > dup.prio) { res[dup.idx] = it; dup.prio = prio; } continue; }
      seen.push({ price: it.price, prio, idx: res.length });
    }
    res.push(it);
  }
  return res;
}
