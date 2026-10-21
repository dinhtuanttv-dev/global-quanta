// @gq/quant-core · MTF — bản GỌN cho giao diện (ngày + giá, không gửi mảng chỉ báo). Dùng chung cho Gateway
// (/api/market/structure) và chế độ PHÁT LẠI trên trình duyệt (tính lại trên bars[0..t]) -> cùng một định dạng.
import { PATTERN_NAME, patternStatusAt } from "./patterns";
import { STAGE_LABEL, STAGE_TEXT } from "./stages";
import type { Stage, TfAnalysis } from "./types";
import type { MtfStructure } from "./index";

const r2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

export interface CompactSegment { stage: Stage; label: string; from: string; to: string; bars: number }

export function compactTf(a: TfAnalysis, { segments = 16, signals = 24, swings = 24 } = {}) {
  const t = a.bars.length - 1, d = (i: number) => a.bars[Math.max(0, Math.min(t, i))].date;
  const segs: CompactSegment[] = [];
  for (let i = 0; i <= t; i++) {
    const s = a.stage[i], cur = segs[segs.length - 1];
    if (cur && cur.stage === s) { cur.to = d(i); cur.bars++; } else segs.push({ stage: s, label: STAGE_LABEL[s], from: d(i), to: d(i), bars: 1 });
  }
  const pats = a.patterns
    .map((p) => ({ p, status: patternStatusAt(p, t) }))
    .filter(({ p, status }) => status && (status !== "failed" || t - (p.failIndex ?? 0) <= 10) && p.start >= t - a.params.levelLookback)
    .slice(-8)
    .map(({ p, status }) => ({
      type: p.type, name: PATTERN_NAME[p.type], dir: p.dir, status: status as "forming" | "confirmed" | "failed",
      points: p.points.map((x) => ({ date: d(x.index), price: r2(x.price) as number, label: x.label })),
      neck: { d0: d(p.neck.i0), p0: r2(p.neck.p0) as number, d1: d(p.neck.i1), p1: r2(p.neck.p1) as number },
      confirmedDate: d(p.confirmedIndex), breakDate: p.breakIndex != null ? d(p.breakIndex) : null,
      failDate: p.failIndex != null && p.failIndex <= t ? d(p.failIndex) : null,
      target: r2(p.target) as number, height: r2(p.height) as number,
    }));
  return {
    tf: a.tf, asOf: d(t), close: r2(a.bars[t]?.close) as number,
    stage: a.stage[t], stageLabel: STAGE_LABEL[a.stage[t]], stageText: STAGE_TEXT[a.stage[t]], stageAge: a.stageAge[t],
    dow: a.dow[t], ma: { fast: a.params.maFast, slow: a.params.maSlow, fastValue: r2(a.maFast[t]), slowValue: r2(a.maSlow[t]) },
    dev: r2(a.dev[t]), slope: r2(a.slope[t]), spread: r2(a.spread[t]), atr: r2(a.atr[t]),
    segments: segs.slice(-segments),
    zones: a.zones.map((z) => ({ ...z, lo: r2(z.lo) as number, hi: r2(z.hi) as number, mid: r2(z.mid) as number, strength: r2(z.strength) as number })),
    base: a.base ? { ...a.base, from: d(a.base.start), to: d(a.base.end), lo: r2(a.base.lo) as number, hi: r2(a.base.hi) as number, rangeAtr: r2(a.base.rangeAtr) as number } : null,
    patterns: pats,
    signals: a.signals.slice(-signals).map((s) => ({ date: d(s.index), code: s.code, side: s.side, price: r2(s.price) as number, note: s.note })),
    swings: a.swings.mid.filter((s) => s.confirmedIndex <= t).slice(-swings).map((s) => ({ date: d(s.index), kind: s.kind, price: r2(s.price) as number, confirmedDate: d(s.confirmedIndex) })),
    checklistBuy: a.checklistBuy, checklistSell: a.checklistSell,
  };
}

/** Phần chung của tài liệu cấu trúc (không gồm nón dự báo / xác suất / nguồn dữ liệu — do Gateway bổ sung). */
export function compactStructure(m: MtfStructure) {
  const d = m.tfs.D!, h = m.tfs.H1, w = m.tfs.W;
  let dayContextOnH1: { stage: Stage | null; label: string | null; from: string; to: string }[] | null = null;
  if (h && m.dayStageOnH1) {
    dayContextOnH1 = [];
    m.dayStageOnH1.forEach((s, i) => {
      const cur = dayContextOnH1![dayContextOnH1!.length - 1], dt = h.bars[i].date;
      if (cur && cur.stage === s) cur.to = dt; else dayContextOnH1!.push({ stage: s, label: s ? STAGE_LABEL[s] : null, from: dt, to: dt });
    });
  }
  return {
    version: m.version, asOf: m.asOf, context: m.context, align: m.align, checklist: m.checklist,
    scenarios: m.scenarios.map((s) => ({ ...s, trigger: r2(s.trigger) as number, entry: r2(s.entry) as number, stop: r2(s.stop) as number, targets: s.targets.map((x) => r2(x) as number), rr: r2(s.rr) })),
    tfs: { ...(w ? { W: compactTf(w, { segments: 10 }) } : {}), D: compactTf(d), ...(h ? { H1: compactTf(h) } : {}) },
    annotations: m.annotations.map((a) => ({ tf: a.tf, kind: a.kind, date: a.date, price: r2(a.price) as number, text: a.text, detail: a.detail, tone: a.tone })),
    timeline: m.timeline.map((r) => ({ tf: r.tf, segments: r.segments.slice(-40).map((s) => ({ stage: s.stage, label: s.label, from: s.from, to: s.to })) })),
    dayContextOnH1, narrative: m.narrative,
  };
}
