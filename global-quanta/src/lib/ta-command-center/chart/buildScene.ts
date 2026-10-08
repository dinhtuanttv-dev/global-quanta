// Dựng Scene (toạ độ miền) từ kết quả phân tích + hình vẽ tay — hàm thuần, thay toàn bộ lớp SVG cũ trong TVChartPanel.
// Mỗi lớp CHỈ vẽ khi người dùng bật (mặc định tắt hết). Mọi phần tử neo vào (ngày, giá) -> di chuyển cùng nến.
import type { SmcState } from "../AnalysisController";
import type { WyckoffResult } from "../detectors/wyckoffDetector";
import type { LayerState } from "../LayerManager";
import type { DomainPoint, DrawingToolType, DrawnPrimitive } from "../DrawingManager";
import { buildFibLevels, FIB_TIME_SEQUENCE } from "../DrawingManager";
import type { OhlcvBar } from "../types";
import { GQ_COLORS, LABEL_PRIORITY, rgba, type Scene, type SceneItem } from "./scene";
import type { SessionProfile, VolumeProfile, VwapPoint } from "../../quant-core";

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
  /** P4: Volume Profile (composite D/W/M hoặc theo phiên intraday) + Anchored VWAP mặc định — từ quant-core (Worker). */
  profile?: { sessions: SessionProfile[]; composite: VolumeProfile | null } | null;
  avwap?: { anchorDate: string; points: VwapPoint[] } | null;
}

/** Số phiên vẽ histogram trên khung intraday (POC còn "naked" của các phiên cũ hơn vẫn vẽ thành đường). */
export const SVP_SESSIONS_DRAWN = 5;

const dirColor = (dir: string) => (dir === "bullish" ? GQ_COLORS.bull : GQ_COLORS.bear);

export function buildScene(inp: SceneInput): Scene {
  const items: SceneItem[] = [];
  const { bars, smc, layers } = inp;
  if (!bars.length) return { items };
  const last = bars[bars.length - 1].date;

  if (inp.highlight) {
    items.push({ kind: "band", t1: inp.highlight.start, t2: inp.highlight.end, fill: rgba(GQ_COLORS.uv, 0.08), stroke: rgba(GQ_COLORS.uv, 0.6), dash: [5, 3], label: { text: "Mẫu hình", color: GQ_COLORS.uv, priority: LABEL_PRIORITY.user } });
  }

  // SMC: chỉ vùng CÒN HIỆU LỰC (OB chưa test, FVG còn mở, thanh khoản chưa quét) — không nhãn "test", không vạch CE.
  if (layers?.smc) {
    const pd = smc.premiumDiscount;
    if (pd) {
      // Neo vào điểm bắt đầu của dải giao dịch (swing đã xác nhận), kéo dài tới mép phải.
      items.push({ kind: "zone", t1: pd.startDate, t2: null, top: pd.swingHigh, bottom: pd.midpoint, fill: rgba(GQ_COLORS.bear, 0.03) });
      items.push({ kind: "zone", t1: pd.startDate, t2: null, top: pd.midpoint, bottom: pd.swingLow, fill: rgba(GQ_COLORS.bull, 0.03) });
      items.push({ kind: "zone", t1: pd.startDate, t2: null, top: pd.oteHigh, bottom: pd.oteLow, fill: rgba(GQ_COLORS.amber, 0.06), stroke: rgba(GQ_COLORS.amber, 0.3), dash: [2, 2],
        label: { text: `OTE ${pd.legDir === "bullish" ? "▲" : "▼"} · ${pd.currentZone === "premium" ? "Premium" : pd.currentZone === "discount" ? "Discount" : "EQ"}`, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
    }
    for (const ob of smc.obs) {
      const c = dirColor(ob.type);
      items.push({ kind: "zone", t1: ob.date, t2: null, top: ob.top, bottom: ob.bottom, fill: rgba(c, 0.13), stroke: rgba(c, 0.45),
        label: { text: `OB ${ob.type === "bullish" ? "▲" : "▼"}`, color: c, priority: LABEL_PRIORITY.obActive } });
    }
    for (const g of smc.fvgs) {
      const c = g.type === "bullish" ? GQ_COLORS.cyan : GQ_COLORS.amber;
      items.push({ kind: "zone", t1: g.startDate, t2: null, top: g.top, bottom: g.bottom, fill: rgba(c, 0.1),
        label: { text: "FVG", color: c, priority: LABEL_PRIORITY.fvgOpen } });
    }
    for (const l of smc.liquidity) {
      const c = l.type === "EQH" ? GQ_COLORS.bear : GQ_COLORS.bull;
      items.push({ kind: "hline", t1: l.date, t2: null, price: l.price, color: rgba(c, 0.5), dash: [3, 2],
        label: { text: l.type === "EQH" ? "BSL" : "SSL", color: c, priority: LABEL_PRIORITY.liquidity } });
    }
  }

  const w = inp.wyckoff;
  if (layers?.wyckoff && w && w.rangeHigh !== null && w.rangeLow !== null && w.rangeStartDate) {
    // Cấu trúc đang hoạt động: đậm; cấu trúc lịch sử / hết hiệu lực: mờ + nhãn "(lịch sử)" — không trình bày như pha hiện tại.
    const current = (w.status ?? "active") === "active" && w.phase !== "undetermined";
    const a = current ? 1 : 0.45;
    items.push({ kind: "zone", t1: w.rangeStartDate, t2: w.rangeEndDate ?? last, top: w.rangeHigh, bottom: w.rangeLow, fill: rgba(GQ_COLORS.uv, 0.05 * a), stroke: rgba(GQ_COLORS.uv, 0.6 * a), dash: current ? [4, 3] : [2, 4],
      label: { text: current ? "Wyckoff range" : "Wyckoff range (lịch sử)", color: GQ_COLORS.uv, priority: LABEL_PRIORITY.wyckoff } });
    const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    const ev = w.evidence ?? null;
    for (const e of w.events) {
      // Sự kiện ghi ở ngày XẢY RA; chưa xác nhận -> "?"; xác nhận muộn hơn -> thêm "✓dd/mm" (ngày biết được).
      // Spring/UT kèm loại #1/#2/#3 theo tài liệu VSA.
      const sp = ev?.springs.find((x) => x.index === e.index);
      const name = sp ? `${e.event}#${sp.kind}` : e.event;
      const text = e.confirmedIndex === null ? `${name}?` : e.confirmedDate && e.confirmedDate !== e.date ? `${name} ✓${dm(e.confirmedDate)}` : name;
      items.push({ kind: "vline", t: e.date, color: rgba(GQ_COLORS.uv, 0.3 * a), dash: [2, 2], labelPrice: e.price, label: { text, color: GQ_COLORS.uv, priority: LABEL_PRIORITY.wyckoff } });
    }
    // Creek / ICE và JAC · BUEC / phá ICE — chỉ với cấu trúc ĐANG HOẠT ĐỘNG (cấu trúc lịch sử không vẽ thêm).
    if (current && ev) {
      if (ev.creek) items.push({ kind: "poly", points: ev.creek.points.map((p) => ({ t: p.date, price: p.price })), color: rgba(GQ_COLORS.bull, 0.7), width: 1, dash: [5, 3],
        label: { text: "Creek", color: GQ_COLORS.bull, priority: LABEL_PRIORITY.wyckoff } });
      if (ev.ice) items.push({ kind: "poly", points: ev.ice.points.map((p) => ({ t: p.date, price: p.price })), color: rgba(GQ_COLORS.bear, 0.7), width: 1, dash: [5, 3],
        label: { text: "ICE", color: GQ_COLORS.bear, priority: LABEL_PRIORITY.wyckoff } });
      for (const b of ev.breaks) {
        // Chỉ cú phá còn hiệu lực (đủ biên độ + KL, chưa thất bại); cú phá yếu / thất bại chỉ liệt kê trong thẻ.
        if ((b.kind !== "JAC" && b.kind !== "ICE-break") || b.failed) continue;
        const c = b.kind === "JAC" ? GQ_COLORS.bull : GQ_COLORS.bear;
        items.push({ kind: "vline", t: b.date, color: rgba(c, 0.35), dash: [2, 2], labelPrice: b.price, label: { text: b.kind === "JAC" ? "JAC" : "phá ICE", color: c, priority: LABEL_PRIORITY.wyckoff } });
        if (b.backup) items.push({ kind: "vline", t: b.backup.date, color: rgba(c, 0.3), dash: [2, 2], labelPrice: b.backup.price, label: { text: b.kind === "JAC" ? "BUEC" : "hồi ICE", color: c, priority: LABEL_PRIORITY.wyckoff } });
      }
    }
  }

  // ---- Hình vẽ tay ----
  for (const p of inp.primitives) {
    if (p.toolType === "rectangle" && layers?.demandzone) {
      items.push({ kind: "zone", t1: p.p1.date, t2: p.p2.date, top: Math.max(p.p1.price, p.p2.price), bottom: Math.min(p.p1.price, p.p2.price),
        fill: rgba(GQ_COLORS.amber, 0.1), stroke: rgba(GQ_COLORS.amber, 0.6), dash: [4, 2] });
    } else if (p.toolType === "trendline" && layers?.trendline) {
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
  pushVolumeLayers(items, inp);
  return { items };
}

/** P4 — Volume Profile + Anchored VWAP (mỗi lớp chỉ vẽ khi người dùng bật). Neo theo (ngày, giá) -> bám nến. */
function pushVolumeLayers(items: SceneItem[], inp: SceneInput) {
  const layers = inp.layers;
  if (layers?.vprofile && inp.profile) {
    const drawProfile = (p: VolumeProfile, widthFrac: number, label: string) => {
      items.push({ kind: "profile", t1: p.fromDate, t2: p.toDate, bins: p.bins, maxVolume: p.maxVolume, vaLow: p.val, vaHigh: p.vah, widthFrac,
        color: rgba(GQ_COLORS.cyan, 0.16), vaColor: rgba(GQ_COLORS.cyan, 0.34) });
      items.push({ kind: "hline", t1: p.fromDate, t2: p.toDate, price: p.poc, color: GQ_COLORS.amber, width: 1.5, label: { text: label, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.obActive } });
      items.push({ kind: "hline", t1: p.fromDate, t2: p.toDate, price: p.vah, color: rgba(GQ_COLORS.cyan, 0.6), dash: [3, 3] });
      items.push({ kind: "hline", t1: p.fromDate, t2: p.toDate, price: p.val, color: rgba(GQ_COLORS.cyan, 0.6), dash: [3, 3] });
    };
    const { composite, sessions } = inp.profile;
    if (composite) drawProfile(composite, 0.45, `POC ${composite.method === "triangular" ? "≈" : ""}`.trim());
    const recent = sessions.slice(-SVP_SESSIONS_DRAWN);
    for (const sp of recent) drawProfile(sp.profile, 0.6, "POC");
    // Naked POC: POC phiên cũ chưa bị chạm lại -> kéo tới mép phải (mục tiêu thanh khoản kinh điển).
    for (const sp of sessions.slice(0, -1)) {
      if (!sp.naked) continue;
      items.push({ kind: "hline", t1: sp.profile.toDate, t2: null, price: sp.profile.poc, color: rgba(GQ_COLORS.amber, 0.55), dash: [6, 3],
        label: { text: "nPOC", color: GQ_COLORS.amber, priority: LABEL_PRIORITY.liquidity } });
    }
  }
  if (layers?.avwap && inp.avwap?.points.length) {
    const pts = inp.avwap.points;
    const line = (k: number) => pts.map((p) => ({ t: p.date, price: p.vwap + k * p.sigma }));
    items.push({ kind: "poly", points: line(0), color: GQ_COLORS.amber, width: 1.5, label: { text: "AVWAP · swing", color: GQ_COLORS.amber, priority: LABEL_PRIORITY.obActive } });
    for (const k of [1, -1]) items.push({ kind: "poly", points: line(k), color: rgba(GQ_COLORS.uv, 0.6), width: 1, dash: [4, 3] });
    for (const k of [2, -2]) items.push({ kind: "poly", points: line(k), color: rgba(GQ_COLORS.uv, 0.35), width: 1, dash: [2, 3] });
  }
}
