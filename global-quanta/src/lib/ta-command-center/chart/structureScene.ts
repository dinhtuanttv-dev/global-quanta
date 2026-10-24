// Lớp "Cấu trúc MTF" (T5): kết quả Gateway /api/market/structure vẽ lên biểu đồ TA — hàm thuần, toạ độ MIỀN (ngày, giá).
//   - Ghim chặt vào nến: mọi mốc thời gian phải trùng một nến của khung đang xem (W -> thứ Hai của tuần, 1H -> khoá tiết
//     "YYYY-MM-DDTHH:00:00+07:00" của TimeframeController); không khớp thì bỏ phần đó (không trôi, không kẹp sai nến).
//   - Vùng tương lai (nón dự báo, mũi tên kịch bản) dùng chỉ số logic "nến cuối + k" -> vẫn đi cùng nến khi kéo/zoom.
//   - Ba chế độ: Tổng quan (giai đoạn + 2 vùng gần nhất), Giao dịch (+ kịch bản, R:R "nếu mua ở giá hiện tại", nón, tín hiệu,
//     thang mức giá), Chuyên sâu (+ mọi vùng, mẫu hình, nền giá, sóng trung, mốc sóng lớn "mức 4 giờ"). Nhãn tiếng Việt,
//     ngân sách 12 nhãn của OverlayPrimitive. v2: giai đoạn theo tài liệu gốc (B = tái tích lũy), cờ quá đà, vị trí mẫu hình.
import type { OhlcvBar } from "../types";
import type { Timeframe } from "../TimeframeController";
import type { ChartMarkerInput } from "../TVChartManager";
import type { StructureDoc, StructureStage, StructureTf, StructureTfKey } from "../../../hooks/useStructure";
import { GQ_COLORS, rgba, type SceneItem } from "./scene";
import { mondayOf } from "./pringScene";

export type StructureMode = "overview" | "trade" | "deep";
export const STRUCTURE_MODES: { key: StructureMode; label: string; hint: string }[] = [
  { key: "overview", label: "Tổng quan", hint: "Giai đoạn chu kỳ + hỗ trợ / kháng cự gần nhất" },
  { key: "trade", label: "Giao dịch", hint: "Thêm 2 kịch bản, nón dự báo, tín hiệu Granville, thang mức giá" },
  { key: "deep", label: "Chuyên sâu", hint: "Thêm mọi vùng giá, mẫu hình, nền giá, sóng trung" },
];

// Như ảnh DEMO của tài liệu: xanh = tích lũy / tái tích lũy / tăng, đỏ = phân phối / đảo chiều / giảm.
const STAGE_FILL: Record<StructureStage, string | null> = {
  A: rgba(GQ_COLORS.bull, 0.08), UP: rgba(GQ_COLORS.bull, 0.04), B: rgba(GQ_COLORS.bull, 0.08), C: rgba(GQ_COLORS.bear, 0.07),
  D: rgba(GQ_COLORS.bear, 0.08), DOWN: rgba(GQ_COLORS.bear, 0.04), Bp: rgba(GQ_COLORS.amber, 0.05), RANGE: null,
};
const STAGE_COLOR: Record<StructureStage, string> = {
  A: GQ_COLORS.bull, UP: GQ_COLORS.bull, B: GQ_COLORS.bull, C: GQ_COLORS.amber, D: GQ_COLORS.bear, DOWN: GQ_COLORS.bear, Bp: GQ_COLORS.amber, RANGE: GQ_COLORS.text2,
};
/** Điểm vào cốt lõi L / S của tài liệu (màu hồng như ảnh DEMO). */
export const CORE_COLOR = "#EC4899";
const NODE: Record<string, string> = { "Đáy 1": "Đ1", "Đáy 2": "Đ2", "Đỉnh 1": "Đ1", "Đỉnh 2": "Đ2", "Cổ": "C", "Vai trái": "VT", "Vai phải": "VP", "Đầu": "Đ" };
const P = { stage: 20, zone: 30, scenario: 60, cone: 55, pattern: 45, today: 15, rr: 62 } as const;

export const fmtPrice = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

/** Khung biểu đồ -> khung phân tích cấu trúc tương ứng (null: khung khác chỉ vẽ mức giá của khung ngày). */
export function structureTfFor(tf: Timeframe): StructureTfKey | null {
  return tf === "D" ? "D" : tf === "W" ? "W" : tf === "1H" ? "H1" : null;
}

/** Ngày của Gateway -> khoá nến của biểu đồ ở khung đang xem. */
export function chartDateOf(tf: Timeframe, date: string): string {
  if (tf === "W") return mondayOf(date);
  if (tf === "1H") return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date) ? `${date.slice(0, 10)}T${date.slice(11, 16)}:00+07:00` : date;
  return date;
}

interface Ctx { tf: Timeframe; dates: Set<string>; first: string; last: string; map: (d: string) => string | null }

function ctxOf(bars: OhlcvBar[], tf: Timeframe): Ctx {
  const dates = new Set(bars.map((b) => b.date));
  const map = (d: string) => { const c = chartDateOf(tf, d); return dates.has(c) ? c : null; };
  return { tf, dates, first: bars[0]?.date ?? "", last: bars[bars.length - 1]?.date ?? "", map };
}

function zoneItems(a: StructureTf, c: Ctx, mode: StructureMode, close: number, t1: string): SceneItem[] {
  const strong = a.zones.filter((z) => z.strength >= 0.3);
  let pick = strong;
  if (mode === "overview") {
    const sup = strong.filter((z) => z.role === "support").sort((x, y) => y.mid - x.mid)[0];
    const res = strong.filter((z) => z.role === "resistance").sort((x, y) => x.mid - y.mid)[0];
    pick = [sup, res].filter(Boolean) as typeof strong;
  } else if (mode === "trade") {
    pick = [...strong].sort((x, y) => Math.abs(x.mid - close) - Math.abs(y.mid - close)).slice(0, 4);
  }
  return pick.map((z): SceneItem => {
    const col = z.role === "support" ? GQ_COLORS.bull : GQ_COLORS.bear;
    const role = z.role === "support" ? (z.flipped ? "Hỗ trợ (kháng cự cũ)" : "Hỗ trợ") : (z.flipped ? "Kháng cự (hỗ trợ cũ)" : "Kháng cự");
    return {
      kind: "zone", t1, t2: null, top: z.hi, bottom: z.lo, fill: rgba(col, 0.05 + 0.08 * z.strength), stroke: rgba(col, 0.35), dash: [3, 3],
      label: { text: `${role} ${fmtPrice(z.mid)} · ${z.sources.join("+")} · ${z.touches} lần chạm`, color: col, priority: P.zone + Math.round(z.strength * 10) },
    };
  });
}

/** Phần tử lớp phủ của lớp Cấu trúc MTF cho khung đang xem. */
export function structureSceneItems(bars: OhlcvBar[], timeframe: Timeframe, doc: StructureDoc | null | undefined, mode: StructureMode, opts: { asOf?: string } = {}): SceneItem[] {
  if (!doc || !bars.length) return [];
  const c = ctxOf(bars, timeframe);
  // Phát lại: "hôm nay" = nến của ngày phát lại (các nến sau đó vẫn hiện để đối chiếu kết quả thực tế).
  const replay = opts.asOf && c.dates.has(opts.asOf) ? opts.asOf : null;
  if (replay) c.last = replay;
  const key = structureTfFor(timeframe);
  const a = key ? doc.tfs[key] : null;
  const daily = doc.tfs.D;
  const items: SceneItem[] = [];
  const close = (opts.asOf && bars.find((b) => b.date === opts.asOf)?.close) || bars[bars.length - 1].close;

  // Khung không có phân tích riêng (1m/5m/15m/M): chỉ mức giá của khung ngày, neo từ nến đầu.
  if (!a) {
    if (daily) items.push(...zoneItems(daily, c, mode === "deep" ? "trade" : mode, close, c.first));
    if (mode !== "overview") items.push(...scenarioLines(doc, c.first));
    return items;
  }

  // 1. Dải giai đoạn chu kỳ (nền màu theo giai đoạn) — đoạn bắt đầu trước nến đầu được neo vào nến đầu.
  const segs = a.segments.slice(mode === "deep" ? -16 : -6);
  segs.forEach((s, i) => {
    const fill = STAGE_FILL[s.stage];
    const to = c.map(s.to) ?? (chartDateOf(timeframe, s.to) >= c.last ? c.last : null);
    let from = c.map(s.from);
    if (!from && chartDateOf(timeframe, s.from) < c.first && to) from = c.first;
    if (!from || !to) return;
    const labelled = i >= segs.length - 2;
    if (fill) items.push({ kind: "band", t1: from, t2: to, fill, label: labelled ? { text: `${s.label}${s.bars ? ` · ${s.bars} nến` : ""}`, color: STAGE_COLOR[s.stage], priority: P.stage + i } : undefined });
    else if (labelled) items.push({ kind: "vline", t: from, color: rgba(GQ_COLORS.text2, 0.25), dash: [2, 4], label: { text: s.label, color: GQ_COLORS.text2, priority: P.stage + i } });
  });
  const extTxt = a.ext ? ` · quá đà ${a.ext > 0 ? "+" : "−"}${Math.abs(a.dev ?? 0).toFixed(1).replace(".", ",")} ATR` : "";
  items.push({ kind: "vline", t: c.last, color: rgba(replay ? GQ_COLORS.amber : GQ_COLORS.cyan, replay ? 0.7 : 0.35), dash: [1, 3],
    label: { text: replay ? `Phát lại ${replay}` : `Hôm nay${extTxt}`, color: replay ? GQ_COLORS.amber : a.ext ? GQ_COLORS.amber : GQ_COLORS.cyan, priority: replay ? 95 : P.today + (a.ext ? 30 : 0) } });

  // 2. Vùng hỗ trợ / kháng cự — neo từ đầu giai đoạn hiện tại (hoặc 120 nến gần nhất).
  const lastSeg = a.segments[a.segments.length - 1];
  const zoneFrom = (lastSeg && c.map(lastSeg.from)) ?? bars[Math.max(0, bars.length - 120)].date;
  items.push(...zoneItems(a, c, mode, close, zoneFrom));

  if (mode === "overview") return items;

  // 3. R:R "nếu mua ở giá hiện tại" (cách của tài liệu) + hai kịch bản: mức kích hoạt / cắt lỗ / mục tiêu + mũi tên vào vùng tương lai.
  if (a.rrNow && !replay) {
    const r = a.rrNow, tag = r.ok ? "giao dịch ổn" : "giao dịch NG";
    items.push({ kind: "hline", t1: c.last, t2: null, price: r.stop, color: rgba(GQ_COLORS.bear, 0.75), dash: [2, 2],
      label: { text: `Nếu mua giá hiện tại: cắt lỗ ${fmtPrice(r.stop)} · R:R 1:${r.rr.toFixed(1).replace(".", ",")} (${tag})`, color: r.ok ? GQ_COLORS.bull : GQ_COLORS.amber, priority: P.rr } });
    items.push({ kind: "hline", t1: c.last, t2: null, price: r.target, color: rgba(GQ_COLORS.bull, 0.6), dash: [4, 3],
      label: { text: `Mục tiêu ${fmtPrice(r.target)}${r.targetBasis === "3R" ? " (3R)" : " (đỉnh sóng lớn)"}`, color: GQ_COLORS.bull, priority: P.rr - 1 } });
  }
  items.push(...scenarioLines(doc, c.last));
  const [L, S] = doc.scenarios;
  if (L && L.targets[0] != null) items.push({ kind: "future", from: c.last, points: [{ k: 0, price: close }, { k: 3, price: L.trigger }, { k: 12, price: L.targets[0] }], color: rgba(GQ_COLORS.bull, 0.8), dash: [5, 3], arrow: true });
  if (S && S.targets[0] != null) items.push({ kind: "future", from: c.last, points: [{ k: 0, price: close }, { k: 3, price: S.trigger }, { k: 12, price: S.targets[0] }], color: rgba(GQ_COLORS.bear, 0.8), dash: [5, 3], arrow: true });

  // 4. Nón dự báo (khung ngày, kỳ hạn tính bằng phiên).
  if (timeframe === "D" && doc.cone) {
    const hs = Object.entries(doc.cone.horizons).map(([h, v]) => ({ k: Number(h), lo: v.p10, mid: v.p50, hi: v.p90 })).sort((x, y) => x.k - y.k);
    if (hs.length) {
      const end = hs[hs.length - 1];
      const tag = doc.cone.label === "ĐÃ KIỂM ĐỊNH" ? "đã kiểm định" : "phân phối lịch sử";
      items.push({
        kind: "cone", from: c.last, fromPrice: close, steps: hs, fill: rgba(GQ_COLORS.uv, 0.1), stroke: rgba(GQ_COLORS.uv, 0.55), midColor: rgba(GQ_COLORS.uv, 0.9),
        labels: [
          { k: end.k, price: end.hi, label: { text: `P90 ${fmtPrice(end.hi)}`, color: GQ_COLORS.uv, priority: P.cone } },
          { k: end.k, price: end.mid, label: { text: `P50 ${fmtPrice(end.mid)} · ${end.k} phiên (${tag})`, color: GQ_COLORS.uv, priority: P.cone + 1 } },
          { k: end.k, price: end.lo, label: { text: `P10 ${fmtPrice(end.lo)}`, color: GQ_COLORS.uv, priority: P.cone } },
        ],
      });
    }
  }

  // 5. Mẫu hình đảo chiều (Giao dịch: mẫu gần nhất còn hiệu lực; Chuyên sâu: mọi mẫu chưa thất bại).
  const pats = a.patterns.filter((p) => p.status !== "failed");
  for (const p of mode === "deep" ? pats : pats.slice(-1)) {
    const col = p.dir === 1 ? GQ_COLORS.bull : GQ_COLORS.bear;
    const pts = p.points.map((x) => ({ t: c.map(x.date), price: x.price, label: x.label })).filter((x): x is { t: string; price: number; label: string } => x.t !== null);
    if (pts.length !== p.points.length) continue;
    items.push({ kind: "poly", points: pts.map((x) => ({ t: x.t, price: x.price })), color: rgba(col, 0.55), width: 1.2, dash: [2, 3], nodeLabels: pts.map((x) => NODE[x.label] ?? x.label.slice(0, 2)),
      label: { text: `${p.name} · ${p.status === "confirmed" ? "đã phá cổ" : "đang hình thành"}${p.contextLabel ? ` · ${p.contextLabel}` : ""}`, color: col, priority: P.pattern } });
    const n0 = c.map(p.neck.d0), n1 = c.map(p.neck.d1);
    const endD = (p.breakDate && c.map(p.breakDate)) ?? c.last;
    if (n0 && n1) {
      const slope = p.neck.d1 === p.neck.d0 ? 0 : (p.neck.p1 - p.neck.p0) / Math.max(1, barsBetween(bars, n0, n1));
      const pEnd = p.neck.p0 + slope * barsBetween(bars, n0, endD);
      items.push({ kind: "segment", a: { t: n0, price: p.neck.p0 }, b: { t: endD, price: pEnd }, color: rgba(col, 0.85), width: 1.5 });
    }
    if (p.status === "confirmed" && p.breakDate && c.map(p.breakDate)) {
      items.push({ kind: "hline", t1: c.map(p.breakDate)!, t2: null, price: p.target, color: rgba(col, 0.55), dash: [4, 3],
        label: { text: `Mục tiêu mẫu ${fmtPrice(p.target)}`, color: col, priority: P.pattern - 1 } });
    }
  }

  if (mode !== "deep") return items;

  // 6. Nền giá + sóng trung (Dow).
  if (a.base && a.base.bars >= 15) {
    const f = c.map(a.base.from) ?? (chartDateOf(timeframe, a.base.from) < c.first ? c.first : null), t = c.map(a.base.to);
    if (f && t) items.push({ kind: "zone", t1: f, t2: t, top: a.base.hi, bottom: a.base.lo, fill: rgba(GQ_COLORS.cyan, 0.04), stroke: rgba(GQ_COLORS.cyan, 0.4), dash: [2, 2],
      label: { text: `Nền ${a.base.bars} nến${a.base.contractions ? ` · co hẹp ${a.base.contractions}` : ""}${a.base.tight ? " · siết chặt" : ""}`, color: GQ_COLORS.cyan, priority: 25 } });
  }
  const sw = a.swings.map((s) => ({ t: c.map(s.date), price: s.price })).filter((x): x is { t: string; price: number } => x.t !== null);
  if (sw.length >= 3) items.push({ kind: "poly", points: sw, color: rgba(GQ_COLORS.text2, 0.45), width: 1, dash: [1, 3] });
  // Mốc sóng lớn ("mức 4 giờ" ở khung 1 giờ): đoạn ngang ngắn tại đỉnh (đỏ) / đáy (xanh dương) như các ảnh của tài liệu.
  const lvl = timeframe === "1H" ? "4 giờ" : timeframe === "W" ? "tháng" : "tuần";
  for (const s of (a.swingsLarge ?? []).slice(-6)) {
    const t = c.map(s.date);
    const i = t ? bars.findIndex((x) => x.date === t) : -1;
    if (!t || i < 0) continue;
    items.push({ kind: "hline", t1: bars[Math.max(0, i - 2)].date, t2: bars[Math.min(bars.length - 1, i + 2)].date, price: s.price, color: rgba(s.kind === "H" ? GQ_COLORS.bear : GQ_COLORS.cyan, 0.8), width: 2,
      label: { text: `${s.kind === "H" ? "Đỉnh" : "Đáy"} mức ${lvl}`, color: s.kind === "H" ? GQ_COLORS.bear : GQ_COLORS.cyan, priority: 22 } });
  }
  return items;
}

function barsBetween(bars: OhlcvBar[], a: string, b: string): number {
  const ia = bars.findIndex((x) => x.date === a), ib = bars.findIndex((x) => x.date === b);
  return ia < 0 || ib < 0 ? 0 : ib - ia;
}

function scenarioLines(doc: StructureDoc, t1: string): SceneItem[] {
  const out: SceneItem[] = [];
  const [L, S] = doc.scenarios;
  if (L) {
    out.push({ kind: "hline", t1, t2: null, price: L.trigger, color: rgba(GQ_COLORS.bull, 0.8), dash: [6, 3], width: 1.2, label: { text: `Kích hoạt tăng ${fmtPrice(L.trigger)}`, color: GQ_COLORS.bull, priority: P.scenario + 2 } });
    out.push({ kind: "hline", t1, t2: null, price: L.stop, color: rgba(GQ_COLORS.bear, 0.7), dash: [2, 2], label: { text: `Cắt lỗ ${fmtPrice(L.stop)}`, color: GQ_COLORS.bear, priority: P.scenario + 1 } });
    L.targets.slice(0, 2).forEach((t, i) => out.push({ kind: "hline", t1, t2: null, price: t, color: rgba(GQ_COLORS.bull, 0.4), dash: [1, 3], label: { text: `Mục tiêu ${i + 1} ${fmtPrice(t)}`, color: GQ_COLORS.bull, priority: P.scenario - i } }));
  }
  if (S) out.push({ kind: "hline", t1, t2: null, price: S.trigger, color: rgba(GQ_COLORS.bear, 0.8), dash: [6, 3], width: 1.2, label: { text: `Kích hoạt giảm ${fmtPrice(S.trigger)}`, color: GQ_COLORS.bear, priority: P.scenario + 2 } });
  return out;
}

/** Tín hiệu Granville (M1–M4, B1–B4, mua 3 bước G3) dạng marker của thư viện — chỉ chế độ Giao dịch / Chuyên sâu. */
export function structureMarkers(bars: OhlcvBar[], timeframe: Timeframe, doc: StructureDoc | null | undefined, mode: StructureMode): ChartMarkerInput[] {
  if (!doc || mode === "overview") return [];
  const key = structureTfFor(timeframe);
  const a = key ? doc.tfs[key] : null;
  if (!a) return [];
  const c = ctxOf(bars, timeframe);
  return a.signals.slice(mode === "deep" ? -24 : -10).flatMap((s): ChartMarkerInput[] => {
    const t = c.map(s.date);
    if (!t) return [];
    const buy = s.side === "MUA";
    const core = s.code === "L" || s.code === "S";
    return [{ time: t, position: buy ? "belowBar" : "aboveBar", color: core ? CORE_COLOR : s.code === "G3" ? GQ_COLORS.amber : buy ? GQ_COLORS.bull : GQ_COLORS.bear, shape: buy ? "arrowUp" : "arrowDown", text: s.code }];
  });
}

export interface PriceLevel { price: number; color: string; title: string }

/** Thang mức giá ở trục phải (priceLine của thư viện): kích hoạt / cắt lỗ / hỗ trợ / kháng cự mạnh nhất. */
export function structureLevels(doc: StructureDoc | null | undefined, mode: StructureMode, close: number): PriceLevel[] {
  if (!doc || mode === "overview") return [];
  const out: PriceLevel[] = [];
  const [L, S] = doc.scenarios;
  if (L) { out.push({ price: L.trigger, color: GQ_COLORS.bull, title: "Kích hoạt tăng" }); out.push({ price: L.stop, color: GQ_COLORS.bear, title: "Cắt lỗ" }); }
  if (doc.rrNow) out.push({ price: doc.rrNow.stop, color: rgba(GQ_COLORS.bear, 0.8), title: `Cắt lỗ (R:R 1:${doc.rrNow.rr.toFixed(1).replace(".", ",")})` });
  if (S) out.push({ price: S.trigger, color: GQ_COLORS.bear, title: "Kích hoạt giảm" });
  const z = doc.tfs.D?.zones ?? [];
  const sup = z.filter((x) => x.role === "support" && x.mid < close).sort((a, b) => b.strength - a.strength)[0];
  const res = z.filter((x) => x.role === "resistance" && x.mid > close).sort((a, b) => b.strength - a.strength)[0];
  if (sup) out.push({ price: sup.mid, color: rgba(GQ_COLORS.bull, 0.7), title: "Hỗ trợ mạnh" });
  if (res) out.push({ price: res.mid, color: rgba(GQ_COLORS.bear, 0.7), title: "Kháng cự mạnh" });
  return out;
}
