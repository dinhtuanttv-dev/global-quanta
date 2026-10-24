// @gq/quant-core · MTF — chú thích tiếng Việt GHIM vào nến (ngày + giá) để vẽ trên biểu đồ, và đoạn diễn giải.
import { PATTERN_NAME, patternStatusAt } from "./patterns";
import { STAGE_LABEL } from "./stages";
import type { Stage, TfAnalysis, Tf } from "./types";

export type Tone = "bull" | "bear" | "neutral" | "warn";

export interface Annotation {
  tf: Tf;
  kind: "stage" | "pattern" | "signal" | "swing";
  date: string;            // ngày/giờ của nến được ghim
  index: number;
  price: number;
  text: string;            // nhãn ngắn trên biểu đồ
  detail: string;          // giải thích dài (tooltip)
  tone: Tone;
  confirmedIndex: number;
}

export interface StageSegment { stage: Stage; label: string; from: string; to: string; i0: number; i1: number }

const STAGE_TONE: Record<Stage, Tone> = { A: "bull", UP: "bull", B: "bull", C: "warn", D: "bear", DOWN: "bear", Bp: "warn", RANGE: "neutral" };
const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : x.toFixed(2).replace(".", ","));

export function stageSegments(a: TfAnalysis): StageSegment[] {
  const out: StageSegment[] = [];
  for (let i = 0; i < a.stage.length; i++) {
    const s = a.stage[i];
    const cur = out[out.length - 1];
    if (cur && cur.stage === s) { cur.i1 = i; cur.to = a.bars[i].date; continue; }
    out.push({ stage: s, label: STAGE_LABEL[s], from: a.bars[i].date, to: a.bars[i].date, i0: i, i1: i });
  }
  return out;
}

export function annotations(a: TfAnalysis, maxSignals = 12, maxStages = 8): Annotation[] {
  const t = a.bars.length - 1;
  const out: Annotation[] = [];
  const at = (i: number) => a.bars[Math.max(0, Math.min(t, i))];
  for (const seg of stageSegments(a).slice(-maxStages)) {
    if (seg.i0 === 0) continue;
    const b = at(seg.i0);
    const up = seg.stage === "UP" || seg.stage === "A";
    out.push({
      tf: a.tf, kind: "stage", date: b.date, index: seg.i0, price: up ? b.low : b.high,
      text: seg.label, detail: `Từ ${seg.from}: ${seg.label}.`, tone: STAGE_TONE[seg.stage], confirmedIndex: seg.i0,
    });
  }
  for (const p of a.patterns) {
    const st = patternStatusAt(p, t);
    if (!st || st === "failed") continue;
    if (p.points[0].index < t - a.params.levelLookback) continue;
    const i = st === "confirmed" ? (p.breakIndex as number) : p.confirmedIndex;
    const b = at(i);
    const name = PATTERN_NAME[p.type];
    out.push({
      tf: a.tf, kind: "pattern", date: b.date, index: i, price: p.dir === 1 ? b.low : b.high,
      text: st === "confirmed" ? `${name} – đã phá cổ` : `${name} – đang hình thành`,
      detail: st === "confirmed"
        ? `${name}: giá đóng cửa ${p.dir === 1 ? "vượt" : "thủng"} viền cổ. Mục tiêu đo theo độ cao mẫu ≈ ${fmt(p.target)}.`
        : `${name} đang hình thành: cần đóng cửa ${p.dir === 1 ? "trên" : "dưới"} viền cổ ≈ ${fmt(p.neck.p1)} để xác nhận.`,
      tone: p.dir === 1 ? "bull" : "bear", confirmedIndex: i,
    });
    for (const pt of p.points) {
      const pb = at(pt.index);
      out.push({ tf: a.tf, kind: "swing", date: pb.date, index: pt.index, price: pt.price, text: pt.label, detail: `${name}: ${pt.label} ${fmt(pt.price)}`, tone: p.dir === 1 ? "bull" : "bear", confirmedIndex: p.confirmedIndex });
    }
  }
  for (const s of a.signals.slice(-maxSignals)) {
    const b = at(s.index);
    out.push({
      tf: a.tf, kind: "signal", date: b.date, index: s.index, price: s.side === "MUA" ? b.low : b.high,
      text: s.code, detail: s.note, tone: s.side === "MUA" ? "bull" : "bear", confirmedIndex: s.confirmedIndex,
    });
  }
  return out.sort((x, y) => x.index - y.index);
}

/** Đoạn diễn giải ngắn cho một khung. */
export function narrateTf(a: TfAnalysis): string[] {
  const t = a.bars.length - 1;
  if (t < 0) return [];
  const name = a.tf === "W" ? "Khung tuần" : a.tf === "D" ? "Khung ngày" : "Khung 1 giờ";
  const c = a.bars[t].close;
  const lines = [`${name}: ${STAGE_LABEL[a.stage[t]]} (${a.stageAge[t]} nến).`];
  const ms = a.maSlow[t];
  if (Number.isFinite(ms)) lines.push(`Giá ${fmt(c)} ${c >= ms ? "trên" : "dưới"} MA chân trên ${fmt(ms)} (lệch ${a.dev[t].toFixed(1).replace(".", ",")} ATR); MA ${a.slope[t] > 0 ? "dốc lên" : a.slope[t] < 0 ? "dốc xuống" : "đi ngang"}.`);
  lines.push(a.dow[t] === 1 ? "Dow: đỉnh – đáy sau cao hơn (xu hướng tăng)." : a.dow[t] === -1 ? "Dow: đỉnh – đáy sau thấp hơn (xu hướng giảm)." : "Dow: chưa có cấu trúc rõ.");
  if (a.base && a.base.bars >= 15) {
    const b = a.base;
    lines.push(`Nền giá ${b.bars} nến (${fmt(b.lo)}–${fmt(b.hi)}, biên độ ${b.rangeAtr.toFixed(1).replace(".", ",")} ATR${b.contractions ? `, co hẹp ${b.contractions} lần` : ""}${b.tight ? ", đang siết chặt" : ""}).`);
  }
  return lines;
}
