// @gq/quant-core · Cấu trúc thị trường đa khung (Tuần / Ngày / 1 giờ).
// Bất biến (có test): mọi đối tượng có confirmedIndex; giai đoạn / tín hiệu / sóng / mẫu tại nến t tính trên bars[0..t]
// trùng với kết quả tính trên toàn bộ dữ liệu (không nhìn trước, không vẽ lại). Khung lớn chỉ dùng nến đã đóng.
import type { Bar } from "../math";
import { alignMatrix, closedHtfIndex, recentBuy, scenarios, toWeekly, type AlignResult, type Scenario } from "./align";
import { dowSeries, indicators, smaSeries, zigzagSwings } from "./core";
import { annotations, narrateTf, stageSegments, type Annotation, type StageSegment } from "./explain";
import { baseAt, zonesAt } from "./levels";
import { detectPatterns } from "./patterns";
import { checklists, granville, rrNowAt } from "./signals";
import { extSeries, stageMachine } from "./stages";
import { TF_PARAMS, type CheckItem, type RrNow, type Stage, type Tf, type TfAnalysis, type TfParams } from "./types";

export const MTF_STRUCTURE_VERSION = "2.0.0";

export function analyzeTf(bars: Bar[], tf: Tf, over: Partial<TfParams> = {}): TfAnalysis {
  const p: TfParams = { ...TF_PARAMS[tf], ...over, tf };
  const ind = indicators(bars, p);
  const swings = {
    small: zigzagSwings(bars, ind.atr, p.dcSmall, "small", p.atr - 1),
    mid: zigzagSwings(bars, ind.atr, p.dcMid, "mid", p.atr - 1),
    large: zigzagSwings(bars, ind.atr, p.dcLarge, "large", p.atr - 1),
  };
  const dow = dowSeries(bars, swings.mid);
  const patterns = detectPatterns(bars, ind.atr, swings.mid, { maSlow: ind.maSlow, slope: ind.slope, maFast: p.maFast }, dow, p);
  const { stage, stageAge } = stageMachine(bars, ind, patterns, swings.large, p);
  const signals = granville(bars, ind, swings.small, p);
  const t = bars.length - 1;
  const zones = t >= 1 ? zonesAt(bars, ind, swings, patterns, t, p) : [];
  const base = t >= 15 ? baseAt(bars, ind, swings.small, t, p) : null;
  const rrNow = t >= 1 ? rrNowAt(bars, ind, swings.small, swings.large, t) : null;
  const ck = t >= 1 ? checklists(bars, ind, dow, zones, t, p, rrNow) : { buy: [], sell: [] };
  return {
    tf, params: p, bars,
    maFast: ind.maFast, maSlow: ind.maSlow, maCtx: p.maCtx ? smaSeries(bars.map((b) => b.close), p.maCtx) : null,
    atr: ind.atr, slope: ind.slope, dev: ind.dev, spread: ind.spread,
    swings, dow, ext: extSeries(ind, p), rrNow, stage, stageAge, patterns, signals, zones, base,
    checklistBuy: ck.buy, checklistSell: ck.sell,
  };
}

/**
 * Phân tích một khung + hàm ảnh chụp TẠI nến t (vùng giá, nền, bảng kiểm) — chỉ dùng dữ liệu ≤ t.
 * Dùng cho kiểm định / sổ dự báo: tránh tính lại toàn bộ trên bars[0..t] cho từng t.
 */
export function analyzeTfSeries(bars: Bar[], tf: Tf, over: Partial<TfParams> = {}) {
  const a = analyzeTf(bars, tf, over);
  const ind = indicators(bars, a.params);
  return {
    a,
    at(t: number) {
      const zones = zonesAt(bars, ind, a.swings, a.patterns, t, a.params);
      const base = t >= 15 ? baseAt(bars, ind, a.swings.small, t, a.params) : null;
      const rrNow = rrNowAt(bars, ind, a.swings.small, a.swings.large, t);
      const ck = checklists(bars, ind, a.dow, zones, t, a.params, rrNow);
      return { zones, base, rrNow, checklistBuy: ck.buy, checklistSell: ck.sell, rrBuy: ck.rrBuy, rrSell: ck.rrSell };
    },
  };
}

export interface MtfInput { w?: Bar[]; d: Bar[]; h1?: Bar[] }

export interface MtfTimelineRow { tf: Tf; segments: StageSegment[] }

export interface MtfStructure {
  version: string;
  asOf: string;                         // nến cuối của khung vào lệnh
  tfs: Partial<Record<Tf, TfAnalysis>>;
  /** Giai đoạn khung lớn ĐÃ ĐÓNG tại nến cuối khung nhỏ. */
  context: { week: Stage | null; day: Stage; h1: Stage | null };
  /** Cờ "Quá đà" của khung ngày (đã đóng) và khung vào lệnh; R:R "nếu mua ở giá hiện tại" của khung vào lệnh. */
  ext: { day: number; entry: number };
  rrNow: RrNow | null;
  align: AlignResult;
  /** Bảng kiểm 7 điểm của khung vào lệnh + mục 8 "khung lớn thuận chiều". */
  checklist: { buy: CheckItem[]; sell: CheckItem[]; buyScore: number; sellScore: number };
  scenarios: Scenario[];
  annotations: Annotation[];
  timeline: MtfTimelineRow[];
  narrative: string[];
  /** Giai đoạn khung ngày (đã đóng) gióng theo từng nến H1 — để tô dải bối cảnh trên biểu đồ 1 giờ. */
  dayStageOnH1: (Stage | null)[] | null;
}

export function analyzeStructureMtf(input: MtfInput): MtfStructure {
  const d = analyzeTf(input.d, "D");
  const wBars = input.w && input.w.length ? input.w : toWeekly(input.d);
  const w = wBars.length >= 20 ? analyzeTf(wBars, "W") : null;
  const h = input.h1 && input.h1.length >= 30 ? analyzeTf(input.h1, "H1") : null;
  const entry = h ?? d;
  const te = entry.bars.length - 1;

  // Khung lớn đã đóng tại nến cuối khung vào lệnh.
  let dayStage: Stage;
  let dayExt = 0;
  let dayStageOnH1: (Stage | null)[] | null = null;
  if (h) {
    const map = closedHtfIndex(h.bars, d.bars, false);
    dayStageOnH1 = map.map((j) => (j >= 0 ? d.stage[j] : null));
    const j = map[te];
    dayStage = j >= 0 ? d.stage[j] : "RANGE";
    dayExt = j >= 0 ? d.ext[j] : 0;
  } else {
    dayStage = d.stage[d.bars.length - 1] ?? "RANGE";
    dayExt = d.ext[d.bars.length - 1] ?? 0;
  }
  let weekStage: Stage | null = null;
  if (w) {
    const map = closedHtfIndex(entry.bars, w.bars, true);
    const j = map[te];
    weekStage = j >= 0 ? w.stage[j] : null;
  }
  const h1Stage = h ? h.stage[te] : null;
  const align = alignMatrix(dayStage, h1Stage, weekStage, recentBuy(entry.signals, te),
    { rrOk: entry.rrNow ? entry.rrNow.ok : null, extDay: dayExt, extEntry: entry.ext[te] ?? 0 });

  const htfOk = dayStage === "UP" || dayStage === "A" || dayStage === "B";
  const htfDn = dayStage === "DOWN" || dayStage === "D" || dayStage === "Bp" || dayStage === "C";
  const buy = [{ key: "htf", ok: !h ? (weekStage ? weekStage === "UP" || weekStage === "A" || weekStage === "B" : htfOk) : htfOk, text: h ? "Khung ngày thuận chiều tăng (tăng / tái tích lũy B / đáy MỘT)" : "Khung tuần thuận chiều tăng" }, ...entry.checklistBuy];
  const sell = [{ key: "htf", ok: !h ? (weekStage ? weekStage === "DOWN" || weekStage === "D" : htfDn) : htfDn, text: h ? "Khung ngày thuận chiều giảm" : "Khung tuần thuận chiều giảm" }, ...entry.checklistSell];

  const sc = scenarios(entry, h ? d.zones.filter((z) => z.strength >= 0.5) : []);
  const ann = [...(w ? annotations(w, 6, 4) : []), ...annotations(d), ...(h ? annotations(h) : [])];
  const timeline: MtfTimelineRow[] = [
    ...(w ? [{ tf: "W" as const, segments: stageSegments(w) }] : []),
    { tf: "D", segments: stageSegments(d) },
    ...(h ? [{ tf: "H1" as const, segments: stageSegments(h) }] : []),
  ];
  const narrative = [...(w ? narrateTf(w) : []), ...narrateTf(d), ...(h ? narrateTf(h) : []), `Kết luận: ${align.verdict} — ${align.text}`, ...align.rules];
  return {
    version: MTF_STRUCTURE_VERSION,
    asOf: entry.bars[te]?.date ?? "",
    tfs: { ...(w ? { W: w } : {}), D: d, ...(h ? { H1: h } : {}) },
    context: { week: weekStage, day: dayStage, h1: h1Stage },
    ext: { day: dayExt, entry: entry.ext[te] ?? 0 },
    rrNow: entry.rrNow,
    align,
    checklist: { buy, sell, buyScore: buy.filter((x) => x.ok).length, sellScore: sell.filter((x) => x.ok).length },
    scenarios: sc,
    annotations: ann,
    timeline,
    narrative,
    dayStageOnH1,
  };
}

/** Gộp nến phút (SSI) thành nến 1 giờ theo phiên VN: 9h, 10h, 11h (sáng), 13h, 14h (chiều, gồm ATC). */
export function minutesToH1(minutes: Bar[]): Bar[] {
  const out: Bar[] = [];
  let key = "";
  for (const m of minutes) {
    const day = m.date.slice(0, 10);
    const hh = Number(m.date.slice(11, 13));
    if (!Number.isFinite(hh)) continue;
    const slot = hh < 9 ? 9 : hh === 12 ? 11 : hh >= 15 ? 14 : hh;
    const k = `${day} ${String(slot).padStart(2, "0")}:00`;
    const cur = out[out.length - 1];
    if (k !== key || !cur) { out.push({ date: k, open: m.open, high: m.high, low: m.low, close: m.close, volume: m.volume }); key = k; continue; }
    cur.high = Math.max(cur.high, m.high); cur.low = Math.min(cur.low, m.low); cur.close = m.close; cur.volume += m.volume;
  }
  return out;
}

export * from "./types";
export { compactTf, compactStructure } from "./compact";
export { STAGE_LABEL, STAGE_TEXT } from "./stages";
export { PATTERN_NAME, PATTERN_CONTEXT_TEXT, patternStatusAt } from "./patterns";
export { SIGNAL_TEXT, rrNowAt } from "./signals";
export { displaySegments } from "./compact";
export { toWeekly, weekKey, closedHtfIndex, alignMatrix, stageBias, recentBuy, scenarios, VERDICT_DESCRIPTIVE, verdictLabel } from "./align";
export type { AlignResult, Scenario, Verdict } from "./align";
export type { Annotation, StageSegment } from "./explain";
