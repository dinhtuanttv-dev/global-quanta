// @gq/quant-core · MTF v3 · S2 — ghép dải MA + sóng + Dow + giai đoạn cho từng khung D / W / M và ảnh chụp tại nến ngày t.
// "Chân dưới đổi theo chân trên" (K3, ảnh 176 / 212 / 235): Tuần (chân trên) thuận chiều + Ngày (chân dưới) vừa đổi tính chất cùng chiều.
import type { Bar } from "../math";
import { contextAt, ribbon3, type Ribbon3, type RibbonContext, type RibbonSeries } from "./ribbon";
import type { Tf3 } from "./series";
import {
  DOW_EVENT_LABEL, DOW_LABEL, dowSeries3, STAGE4_LABEL, STRUCT, stageSeries, swings3, trendTemplateAt,
  type DowEvent, type DowSeries, type DowState, type Stage4, type StageSeries, type Swing3, type TemplateCheck,
} from "./structure";

export interface Frame3 { tf: Tf3; r: RibbonSeries; minor: Swing3[]; major: Swing3[]; dow: DowSeries; stage: StageSeries }
export interface Analysis3 { ribbon: Ribbon3; D: Frame3; W: Frame3; M: Frame3 }

export function frameOf(r: RibbonSeries): Frame3 {
  const minor = swings3(r.bars, r.atr, STRUCT.kMinor), major = swings3(r.bars, r.atr, STRUCT.kMajor);
  return { tf: r.tf, r, minor, major, dow: dowSeries3(r.bars, minor), stage: stageSeries(r) };
}

/** Phân tích ba khung từ một chuỗi nến ngày (tuần / tháng gộp, chỉ kỳ đã đóng khi ghép). */
export function analyze3(daily: Bar[]): Analysis3 {
  const ribbon = ribbon3(daily);
  return { ribbon, D: frameOf(ribbon.D), W: frameOf(ribbon.W), M: frameOf(ribbon.M) };
}

const px = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export interface FrameSnapshot {
  tf: Tf3; date: string | null;
  dow: DowState; dowLabel: string;
  protectedLow: number | null; pullbackHigh: number | null; lastHigh: number | null; lastLow: number | null;
  /** Sự kiện cấu trúc gần nhất trong 20 nến: loại, cách bao nhiêu nến, ngày, giá đóng cửa. */
  lastEvent: { type: Exclude<DowEvent, null>; label: string; ago: number; date: string; close: number } | null;
  stage: Stage4; stageLabel: string; stageAge: number; templateScore: number; template: TemplateCheck[];
}

export function frameSnapshot(f: Frame3, i: number): FrameSnapshot {
  if (i < 0 || i >= f.r.bars.length) {
    return { tf: f.tf, date: null, dow: "RANGE", dowLabel: DOW_LABEL.RANGE, protectedLow: null, pullbackHigh: null, lastHigh: null, lastLow: null, lastEvent: null, stage: "NA", stageLabel: STAGE4_LABEL.NA, stageAge: 0, templateScore: 0, template: [] };
  }
  let lastEvent: FrameSnapshot["lastEvent"] = null;
  for (let j = i; j >= Math.max(0, i - 20); j--) {
    const e = f.dow.event[j];
    if (e) { lastEvent = { type: e, label: DOW_EVENT_LABEL[e], ago: i - j, date: f.r.bars[j].date, close: px(f.r.bars[j].close)! }; break; }
  }
  const st = f.dow.state[i], sg = f.stage.stage[i];
  return {
    tf: f.tf, date: f.r.bars[i].date, dow: st, dowLabel: DOW_LABEL[st],
    protectedLow: px(f.dow.protectedLow[i]), pullbackHigh: px(f.dow.pullbackHigh[i]), lastHigh: px(f.dow.lastHigh[i]), lastLow: px(f.dow.lastLow[i]),
    lastEvent, stage: sg, stageLabel: STAGE4_LABEL[sg], stageAge: f.stage.stageAge[i], templateScore: f.stage.templateScore[i],
    template: Number.isFinite(f.r.ma200[i]) ? trendTemplateAt(f.r, i) : [],
  };
}

export type TriggerSide = "L" | "S";
export interface MtfTrigger {
  side: TriggerSide | null;
  /** Điều kiện từng bước (để giải thích trên giao diện). */
  steps: { key: string; ok: boolean; text: string }[];
  /** Số nến từ CHoCH khung ngày (null nếu không có trong 5 nến). */
  ago: number | null;
}

/**
 * "Chân dưới đổi theo chân trên": W ở UP (Dow tuần UP, đóng cửa tuần > EMA50w, EMA21w > EMA50w) + Ngày có CHoCH↑ trong ≤ 5 phiên
 * (đáy cao hơn + đóng cửa vượt đỉnh hồi). Đối xứng cho chiều giảm. Chỉ MÔ TẢ cho tới khi H2 (MTF-v3-prereg) được kiểm định.
 */
export function mtfTriggerAt(a: Analysis3, t: number): MtfTrigger {
  const wi = a.ribbon.wIdx[t] ?? -1, W = a.W, D = a.D;
  const wUp = wi >= 0 && (W.dow.state[wi] === "UP") && W.r.bars[wi].close > W.r.ema50[wi] && W.r.ema21[wi] > W.r.ema50[wi];
  const wDn = wi >= 0 && (W.dow.state[wi] === "DOWN") && W.r.bars[wi].close < W.r.ema50[wi] && W.r.ema21[wi] < W.r.ema50[wi];
  let up: number | null = null, dn: number | null = null;
  for (let j = t; j >= Math.max(0, t - 5); j--) {
    if (up == null && D.dow.event[j] === "CHOCH_UP") up = t - j;
    if (dn == null && D.dow.event[j] === "CHOCH_DOWN") dn = t - j;
  }
  const side: TriggerSide | null = wUp && up != null ? "L" : wDn && dn != null ? "S" : null;
  const lookUp = side !== "S";
  return {
    side,
    ago: side === "L" ? up : side === "S" ? dn : null,
    steps: lookUp
      ? [
          { key: "w", ok: wUp, text: "Chân trên (Tuần) tăng: Dow tuần tăng, giá trên EMA50 tuần, EMA21 > EMA50 tuần" },
          { key: "d", ok: up != null, text: "Chân dưới (Ngày) đổi tính chất ↑ trong 5 phiên: đáy cao hơn + đóng cửa vượt đỉnh hồi" },
        ]
      : [
          { key: "w", ok: wDn, text: "Chân trên (Tuần) giảm: Dow tuần giảm, giá dưới EMA50 tuần, EMA21 < EMA50 tuần" },
          { key: "d", ok: dn != null, text: "Chân dưới (Ngày) đổi tính chất ↓ trong 5 phiên: đỉnh thấp hơn + đóng cửa thủng đáy sóng" },
        ],
  };
}

export interface Context3 { ribbon: RibbonContext; D: FrameSnapshot; W: FrameSnapshot; M: FrameSnapshot; trigger: MtfTrigger }

export function context3At(a: Analysis3, t: number): Context3 {
  return {
    ribbon: contextAt(a.ribbon, t),
    D: frameSnapshot(a.D, t), W: frameSnapshot(a.W, a.ribbon.wIdx[t] ?? -1), M: frameSnapshot(a.M, a.ribbon.mIdx[t] ?? -1),
    trigger: mtfTriggerAt(a, t),
  };
}

/** Đoạn giai đoạn liên tiếp của một khung trong cửa sổ vẽ (để tô dải giai đoạn). */
export function stageSegments3(f: Frame3, from: number): { stage: Stage4; from: string; to: string; bars: number }[] {
  const out: { stage: Stage4; from: string; to: string; bars: number }[] = [];
  for (let i = Math.max(0, from); i < f.r.bars.length; i++) {
    const s = f.stage.stage[i], last = out[out.length - 1];
    if (last && last.stage === s) { last.to = f.r.bars[i].date; last.bars++; }
    else out.push({ stage: s, from: f.r.bars[i].date, to: f.r.bars[i].date, bars: 1 });
  }
  return out;
}

/** Bản gọn cho Gateway / giao diện: ngữ cảnh hiện tại + sóng / sự kiện / dải giai đoạn của cửa sổ vẽ từng khung. */
export function compactStructure3(a: Analysis3, opts: { window?: number } = {}) {
  const t = a.D.r.bars.length - 1, win = opts.window ?? 260;
  const frame = (f: Frame3) => {
    const from = Math.max(0, f.r.bars.length - win);
    const sw = (x: Swing3[]) => x.filter((s) => s.index >= from).map((s) => ({ kind: s.kind, date: f.r.bars[s.index].date, price: px(s.price), confirmedDate: f.r.bars[s.confirmedIndex].date }));
    const events: { date: string; type: Exclude<DowEvent, null>; label: string; close: number | null }[] = [];
    for (let i = from; i < f.r.bars.length; i++) { const e = f.dow.event[i]; if (e) events.push({ date: f.r.bars[i].date, type: e, label: DOW_EVENT_LABEL[e], close: px(f.r.bars[i].close) }); }
    return { swings: sw(f.minor), swingsMajor: sw(f.major), events, segments: stageSegments3(f, from) };
  };
  return { context: t >= 0 ? context3At(a, t) : null, frames: { D: frame(a.D), W: frame(a.W), M: frame(a.M) } };
}
