// Dựng Scene (toạ độ miền) từ kết quả phân tích + hình vẽ tay — hàm thuần, thay toàn bộ lớp SVG cũ trong TVChartPanel.
import type { SmcState } from "../AnalysisController";
import type { WyckoffResult } from "../detectors/wyckoffDetector";
import type { LayerState } from "../LayerManager";
import type { DomainPoint, DrawingToolType, DrawnPrimitive } from "../DrawingManager";
import { buildFibLevels, FIB_TIME_SEQUENCE } from "../DrawingManager";
import { countZoneTests } from "../detectors/smcDetector";
import type { OhlcvBar } from "../types";
import { GQ_COLORS, LABEL_PRIORITY, rgba, type Scene, type SceneItem } from "./scene";

export interface SceneInput {
  bars: OhlcvBar[];
  smc: SmcState;
  wyckoff: WyckoffResult | null;
  layers: LayerState | null;
  primitives: DrawnPrimitive[];
  draft: { toolType: DrawingToolType; p1: DomainPoint; p2: DomainPoint } | null;
  elliottDraft: DomainPoint[];
  fibExtension: boolean;
  highlight: { start: string; end: string } | null;
}

const dirColor = (dir: string) => (dir === "bullish" ? GQ_COLORS.bull : GQ_COLORS.bear);

export function buildScene(inp: SceneInput): Scene {
  const items: SceneItem[] = [];
  const { bars, smc, layers } = inp;
  if (!bars.length) return { items };
  const last = bars[bars.length - 1].date;

  if (inp.highlight) {
    items.push({ kind: "band", t1: inp.highlight.start, t2: inp.highlight.end, fill: rgba(GQ_COLORS.uv, 0.08), stroke: rgba(GQ_COLORS.uv, 0.6), dash: [5, 3], label: { text: "Mẫu hình", color: GQ_COLORS.uv, priority: LABEL_PRIORITY.user } });
  }

  if (layers?.smc) {
    const pd = smc.premiumDiscount;
    if (pd) {
      const from = bars[Math.max(0, bars.length - 50)].date;
      items.push({ kind: "zone", t1: from, t2: null, top: pd.swingHigh, bottom: pd.midpoint, fill: rgba(GQ_COLORS.bear, 0.035) });
      items.push({ kind: "zone", t1: from, t2: null, top: pd.midpoint, bottom: pd.swingLow, fill: rgba(GQ_COLORS.bull, 0.035) });
      items.push({ kind: "zone", t1: from, t2: null, top: pd.oteHigh, bottom: pd.oteLow, fill: rgba(GQ_COLORS.amber, 0.06), stroke: rgba(GQ_COLORS.amber, 0.35), dash: [2, 2],
        label: { text: `OTE ${pd.legDir === "bullish" ? "▲" : "▼"} · ${pd.currentZone === "premium" ? "Premium" : pd.currentZone === "discount" ? "Discount" : "EQ"}`, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
    }
    for (const ob of smc.obs) {
      if (ob.status === "EXPIRED") continue;
      const active = ob.status === "ACTIVE";
      const breaker = ob.status === "BREAKER";
      const c = dirColor(ob.type);
      items.push({
        kind: "zone", t1: ob.date, t2: active ? null : ob.mitigatedAt, top: ob.top, bottom: ob.bottom,
        fill: rgba(c, active ? 0.14 : 0.05), stroke: active ? rgba(c, 0.5) : undefined, dash: breaker ? [3, 3] : undefined,
        label: { text: `${breaker ? "Breaker" : "OB"} ${ob.type === "bullish" ? "▲" : "▼"}${active ? "" : ob.status === "MITIGATED" ? " · 50%" : ""}`, color: c, priority: active ? LABEL_PRIORITY.obActive : LABEL_PRIORITY.other },
      });
    }
    for (const g of smc.fvgs) {
      const open = g.state === "OPEN" || g.state === "PARTIAL";
      const c = g.type === "bullish" ? GQ_COLORS.cyan : GQ_COLORS.amber;
      items.push({
        kind: "zone", t1: g.startDate, t2: g.filledAt ?? null, top: g.top, bottom: g.bottom,
        fill: rgba(c, open ? 0.12 : 0.04),
        label: { text: `FVG${g.state === "CE" ? " · CE" : g.state === "INVERTED" ? " · IFVG" : g.state === "FILLED" ? " · lấp" : ""}`, color: c, priority: open ? LABEL_PRIORITY.fvgOpen : LABEL_PRIORITY.other },
      });
      if (open) items.push({ kind: "hline", t1: g.startDate, t2: null, price: (g.top + g.bottom) / 2, color: rgba(c, 0.35), dash: [2, 3] });
    }
    for (const l of smc.liquidity) {
      const c = l.type === "EQH" ? GQ_COLORS.bear : GQ_COLORS.bull;
      const swept = l.state !== "RESTING";
      items.push({
        kind: "hline", t1: l.date, t2: swept ? l.stateDate : null, price: l.price, color: rgba(c, swept ? 0.25 : 0.55), dash: [3, 2],
        label: { text: `${l.type === "EQH" ? "BSL" : "SSL"} (${l.touches})${l.state === "SWEPT" ? " · swept" : l.state === "RUN" ? " · run" : ""}`, color: c, priority: swept ? LABEL_PRIORITY.other : LABEL_PRIORITY.liquidity },
      });
    }
  }

  const w = inp.wyckoff;
  if (layers?.wyckoff && w && w.rangeHigh !== null && w.rangeLow !== null && w.rangeStartDate) {
    items.push({ kind: "zone", t1: w.rangeStartDate, t2: w.rangeEndDate ?? last, top: w.rangeHigh, bottom: w.rangeLow, fill: rgba(GQ_COLORS.uv, 0.05), stroke: rgba(GQ_COLORS.uv, 0.6), dash: [4, 3],
      label: { text: `Wyckoff range · khớp mẫu ${w.confidenceScore}%`, color: GQ_COLORS.uv, priority: LABEL_PRIORITY.wyckoff } });
    for (const e of w.events) {
      items.push({ kind: "vline", t: e.date, color: rgba(GQ_COLORS.uv, 0.35), dash: [2, 2], label: { text: e.event, color: GQ_COLORS.uv, priority: LABEL_PRIORITY.wyckoff } });
    }
  }

  // ---- Hình vẽ tay ----
  for (const p of inp.primitives) {
    if (p.toolType === "rectangle" && layers?.demandzone !== false) {
      const top = Math.max(p.p1.price, p.p2.price);
      const bottom = Math.min(p.p1.price, p.p2.price);
      const tests = countZoneTests(bars, top, bottom, p.p1.date);
      items.push({ kind: "zone", t1: p.p1.date, t2: p.p2.date, top, bottom, fill: rgba(GQ_COLORS.amber, Math.max(0.03, 0.12 - tests * 0.025)), stroke: rgba(GQ_COLORS.amber, 0.6), dash: [4, 2],
        label: tests > 0 ? { text: `Zone · test ${tests}`, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.user } : undefined });
    } else if (p.toolType === "trendline" && layers?.trendline !== false) {
      items.push({ kind: "segment", a: { t: p.p1.date, price: p.p1.price }, b: { t: p.p2.date, price: p.p2.price }, color: GQ_COLORS.cyan, width: 1.5 });
    } else if (p.toolType === "fibonacci") {
      const [from, to] = p.p1.date <= p.p2.date ? [p.p1.date, p.p2.date] : [p.p2.date, p.p1.date];
      for (const lvl of p.levels) {
        const ext = lvl.ratio > 1;
        items.push({ kind: "hline", t1: from, t2: to, price: lvl.price, color: rgba(ext ? "#F472B6" : GQ_COLORS.uv, 0.6), dash: [2, 2],
          label: { text: `${(lvl.ratio * 100).toFixed(1)}%`, color: ext ? "#F472B6" : GQ_COLORS.uv, priority: LABEL_PRIORITY.user } });
      }
    } else if (p.toolType === "elliott" && layers?.elliott) {
      const bad = p.violations.length > 0;
      items.push({ kind: "poly", points: p.points.map((pt) => ({ t: pt.date, price: pt.price })), color: bad ? GQ_COLORS.bear : GQ_COLORS.amber, dash: bad ? [4, 3] : undefined, nodeLabels: p.labels,
        label: bad ? { text: `Vi phạm ${p.violations.length} quy tắc`, color: GQ_COLORS.bear, priority: LABEL_PRIORITY.user } : undefined });
    } else if (p.toolType === "fibTimeZone") {
      const anchor = bars.findIndex((b) => b.date === p.anchor.date);
      if (anchor < 0) continue;
      for (const seq of FIB_TIME_SEQUENCE) {
        const k = anchor + seq;
        if (k >= bars.length) break;
        items.push({ kind: "vline", t: bars[k].date, color: rgba("#F472B6", 0.5), dash: [3, 3], label: { text: String(seq), color: "#F472B6", priority: LABEL_PRIORITY.user } });
      }
    }
  }

  // ---- Hình đang vẽ dở (luôn hiện, bất kể lớp bật/tắt) ----
  const d = inp.draft;
  if (d) {
    if (d.toolType === "rectangle") items.push({ kind: "zone", t1: d.p1.date, t2: d.p2.date, top: Math.max(d.p1.price, d.p2.price), bottom: Math.min(d.p1.price, d.p2.price), fill: rgba(GQ_COLORS.amber, 0.08), stroke: rgba(GQ_COLORS.amber, 0.8), dash: [3, 3] });
    else if (d.toolType === "trendline") items.push({ kind: "segment", a: { t: d.p1.date, price: d.p1.price }, b: { t: d.p2.date, price: d.p2.price }, color: GQ_COLORS.cyan, dash: [4, 3] });
    else if (d.toolType === "fibonacci") {
      const [from, to] = d.p1.date <= d.p2.date ? [d.p1.date, d.p2.date] : [d.p2.date, d.p1.date];
      for (const lvl of buildFibLevels(d.p1, d.p2, inp.fibExtension)) {
        items.push({ kind: "hline", t1: from, t2: to, price: lvl.price, color: rgba(lvl.ratio > 1 ? "#F472B6" : GQ_COLORS.uv, 0.7), dash: [2, 2],
          label: { text: `${(lvl.ratio * 100).toFixed(1)}%`, color: GQ_COLORS.uv, priority: LABEL_PRIORITY.user } });
      }
    }
  }
  if (inp.elliottDraft.length) {
    items.push({ kind: "poly", points: inp.elliottDraft.map((pt) => ({ t: pt.date, price: pt.price })), color: GQ_COLORS.amber, dash: [3, 2], nodeLabels: inp.elliottDraft.map((_, i) => String(i)) });
  }
  return { items };
}
