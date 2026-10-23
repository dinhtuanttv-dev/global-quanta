// Lớp "Elliott tự động" (E5): đếm sóng của engine GET vẽ lên biểu đồ — hàm thuần, toạ độ miền (ngày, giá).
//   - CHỈ cấu trúc còn sống (elliottState đã lọc ≤ 3 pivot sau điểm cuối); không vẽ cấu trúc cũ.
//   - Mọi điểm phải trùng một nến của khung đang xem — điểm nào không khớp thì bỏ cả đường (ghim chặt vào nến, không trôi).
//   - Khung D có thể kèm đếm sóng TUẦN (ký hiệu (1)…(5), bậc lớn hơn) ghim vào nến ngày đạt cực trị của tuần.
import type { ElliottState } from "../../quant-core/elliott";
import { elliottProjection } from "../../quant-core/elliott/projection";
import { elliottChannels, lineAt, type ChannelKind } from "../../quant-core/elliott/channels";
import { elliottNesting } from "../../quant-core/elliott/nesting";
import type { OhlcvBar } from "../types";
import { GQ_COLORS, LABEL_PRIORITY, rgba, type ScenePoint, type SceneItem } from "./scene";

export interface ElliottHigherDegree { points: { date: string; price: number }[]; labels: string[] }

export interface ElliottSceneInput {
  bars: OhlcvBar[];
  /** Trạng thái Elliott tính trên CHÍNH khung đang xem (D: khung ngày, W: khung tuần). */
  primary: ElliottState | null;
  /** Đếm sóng bậc lớn hơn (tuần) đã ghim sang ngày — chỉ dùng trên khung D. */
  higher?: ElliottHigherDegree | null;
  /** DW (23/10/2026): phần nào được vẽ — count = đếm sóng (lớp elliottAuto), fib = thang Fibonacci (elliottFib),
   *  proj = đường kịch bản minh hoạ sang tương lai (elliottProj). Mặc định chỉ count (hành vi E5). */
  show?: { count?: boolean; fib?: boolean; proj?: boolean; guide?: boolean; sub?: boolean };
}

const isLive5 = (st: ElliottState) => {
  const sc = st.scenario!;
  return sc.status === "wave5-forming" || !!sc.provisional || !sc.points[5]?.confirmed;
};

/** Các điểm + nhãn của cách đếm chính: 0…5 (5? khi chưa xác nhận) rồi A, B, C sau đỉnh/đáy sóng 5. */
export function elliottCountPoints(st: ElliottState): { points: { date: string; price: number; i: number }[]; labels: string[] } | null {
  const sc = st.scenario;
  const P = (p: { time: string; price: number; i: number }) => ({ date: String(p.time), price: p.price, i: p.i });
  if (sc) {
    const pts = sc.points.map(P), labels = sc.points.map((p, k) => (k === 5 && !p.confirmed ? "5?" : String(k)));
    if (sc.points.length === 5 && sc.provisional) { pts.push(P(sc.provisional)); labels.push("5?"); }
    if (sc.points.length === 6 && sc.points[5].confirmed) {
      const after = st.pivots.filter((p) => p.i > sc.points[5].i).slice(0, 3);
      after.forEach((p, k) => { pts.push(P(p)); labels.push(`${"ABC"[k]}${p.confirmed ? "" : "?"}`); });
    }
    return { points: pts, labels };
  }
  if (st.wave === "3" && st.pivots.length >= 4) {                 // chưa đủ 5 sóng: 0-1-2 + sóng 3 đang chạy
    const last = st.pivots.slice(-4);
    return { points: last.map(P), labels: ["0", "1", "2", last[3].confirmed ? "3" : "3?"] };
  }
  return null;
}

const fmtP = (v: number) => Math.round(v).toLocaleString("vi-VN");

/** Giá đã được lớp đếm sóng vẽ (tránh vẽ trùng một mức khi bật cả hai lớp). */
function countLayerPrices(st: ElliottState): number[] {
  const sc = st.scenario;
  if (!sc) { const t = st.levels.find((l) => l.label.includes("×1,618")) ?? st.levels[0]; return t ? [t.price] : []; }
  return sc.afterWave5 && sc.points.length === 6 && !isLive5(st) ? [sc.afterWave5.firstTarget] : [];
}

/** Nhãn gọn trên biểu đồ (nhãn đầy đủ ở thẻ / phác đồ): "S5 ×1,618", "38,2%", "Sóng 4", "C ×1"… */
export function shortFib(label: string): string {
  let m: RegExpMatchArray | null;
  if ((m = label.match(/^Mục tiêu sóng 5 ([\d,]+%) 0→3/))) return `S5 ${m[1]} 0→3`;
  if ((m = label.match(/^Mục tiêu sóng (\d|B|C) (×[\d,]+)/))) return `${/\d/.test(m[1]) ? "S" + m[1] : m[1]} ${m[2]}`;
  if ((m = label.match(/^Hồi ([\d,]+%)/))) return m[1];
  if ((m = label.match(/^Cửa sổ sóng 5 \(sách\): (\d+%)/))) return `Cửa sổ S5 ${m[1]}`;
  if ((m = label.match(/^Vùng sóng 4 tương lai ([\d,]+)/))) return `S4 ${m[1]}`;
  if (label.startsWith("Mục tiêu đầu tiên của điều chỉnh")) return "Sóng 4";
  return label;
}

/** DW2: thang Fibonacci của cách đếm đang chọn — mức ngang có nhãn "tỷ lệ · giá", kéo từ pivot neo tới mép phải. */
export function elliottFibItems(st: ElliottState, bars: OhlcvBar[], skip: number[] = []): SceneItem[] {
  const dates = new Set(bars.map((b) => b.date));
  const sc = st.scenario;
  // Neo tại ĐIỂM KHỞI ĐẦU của sóng được đo (điểm 0 của xung lực; khi mới có sóng 3: điểm 0 của chặng 0-1-2-3) —
  // thang trải từ sóng gốc sang phải như phác đồ tham khảo, nhãn nằm trong khung nhìn.
  const anchor = sc ? String(sc.points[0].time) : String(st.pivots[st.pivots.length - 4]?.time ?? "");
  if (!dates.has(anchor)) return [];
  const lv = [...st.levels];
  // Sau 5 sóng, sóng B/C đang chạy: thêm mục tiêu sóng C của classifyABC (engine đã tính, ghi trong scenario.correction).
  if (sc?.correction?.cTargets && (st.wave === "B" || st.wave === "C"))
    for (const t of sc.correction.cTargets) lv.push({ label: `Mục tiêu sóng C ×${String(t.ratio).replace(".", ",")} sóng A`, price: t.price });
  const out: SceneItem[] = [];
  // DW5: tỷ lệ bổ sung theo quy ước của bộ phác đồ (78,6% · 127,2% · 138,2% · 361,8%) + vùng tô màu.
  const s = st.dir === "up" ? 1 : -1;
  const zone = (t1: string, a: number, b: number, text: string) => out.push({ kind: "zone", t1, t2: null, top: Math.max(a, b), bottom: Math.min(a, b),
    fill: rgba(GQ_COLORS.amber, 0.07), stroke: rgba(GQ_COLORS.amber, 0.25), dash: [2, 3], label: { text, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
  if (!sc && st.wave === "3") {
    const P = st.pivots.slice(-4);
    if (P.length === 4) {
      lv.push({ label: "Mục tiêu sóng 3 ×3,618 sóng 1", price: P[2].price + s * 3.618 * Math.abs(P[1].price - P[0].price) });
      const z = st.levels.filter((l) => l.label.startsWith("Vùng sóng 4"));
      if (z.length >= 2 && dates.has(String(P[2].time))) zone(String(P[2].time), z[0].price, z[1].price, "Vùng sóng 4 (38,2–50%)");
    }
  } else if (sc && st.wave === "5") {
    const [p0, , , p3, p4] = sc.points;
    lv.push({ label: "Mục tiêu sóng 5 38,2% 0→3", price: p4.price + s * 0.382 * Math.abs(p3.price - p0.price) });
  } else if (sc && sc.points[5]?.confirmed) {
    const [p0, , , p3, p4, p5] = sc.points, len05 = p5.price - p0.price;
    lv.push({ label: "Hồi 78,6% của 0→5", price: p5.price - 0.786 * len05 });
    if (dates.has(String(p5.time))) zone(String(p5.time), p5.price - 0.5 * len05, p5.price - 0.618 * len05, "Vùng (2)/(B) 50–61,8%");
    if (dates.has(String(p3.time))) zone(String(p3.time), p3.price, p4.price, "Vùng sóng 4 (bậc nhỏ)");
    const after = st.pivots.filter((x) => x.i > p5.i && x.ci != null);
    if (st.wave === "B" && after[0]) {
      const lenA = Math.abs(p5.price - after[0].price);
      for (const r of [1.272, 1.382]) lv.push({ label: `Mục tiêu sóng B ×${String(r).replace(".", ",")} A (flat mở rộng)`, price: after[0].price + s * r * lenA });
    }
  }
  const seen = new Set<number>();
  for (const l of lv) {
    if (!Number.isFinite(l.price)) continue;
    const key = Math.round(l.price * 100);
    if (seen.has(key) || skip.some((p) => Math.abs(p - l.price) < 1e-9)) continue;
    seen.add(key);
    out.push({ kind: "hline", t1: anchor, t2: null, price: l.price, color: rgba(GQ_COLORS.amber, 0.55), dash: [1, 3], width: 1,
      label: { text: `${shortFib(l.label)} · ${fmtP(l.price)}`, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
  }
  return out;
}

/** DW3: đường kịch bản minh hoạ từ nến cuối (ghim vào nến cuối, đi theo số nến tương lai). */
export function elliottProjectionItems(st: ElliottState, bars: OhlcvBar[]): SceneItem[] {
  const last = bars[bars.length - 1];
  if (!last || last.date !== st.asOf) return []; // kết quả engine phải khớp đúng nến cuối của khung đang xem
  const pr = elliottProjection(st, last.close);
  if (!pr) return [];
  const color = GQ_COLORS.amber, out: SceneItem[] = [];
  let prev = { k: 0, price: pr.fromPrice };
  pr.legs.forEach((g, j) => {
    const final = j === pr.legs.length - 1;
    out.push({ kind: "future", from: pr.from, points: [prev, { k: g.k, price: g.price }], color: rgba(color, 0.85), width: 1.5, dash: [6, 3], arrow: final,
      label: { text: j === 0 ? `${g.label} (kịch bản)` : g.label, color, priority: LABEL_PRIORITY.other } });
    prev = { k: g.k, price: g.price };
  });
  return out;
}

const CHANNEL_COLOR: Record<ChannelKind, string> = { base: GQ_COLORS.cyan, final: GQ_COLORS.amber, corrective: GQ_COLORS.uv };

/**
 * DW5: lớp "Elliott kênh & mốc" — kênh Base / Final / Corrective + vòng tròn kích hoạt, giá tại đỉnh/đáy của cách đếm,
 * thẻ mô hình (DW4) + luân phiên Sharp / Sideways. Chỉ vẽ khi kết quả engine khớp nến cuối của khung đang xem.
 */
export function elliottGuideItems(st: ElliottState, bars: OhlcvBar[]): SceneItem[] {
  const last = bars[bars.length - 1];
  if (!last || last.date !== st.asOf || bars.length < st.barCount) return [];
  const off = bars.length - st.barCount;
  const dateAt = (i: number) => bars[off + Math.max(0, Math.min(st.barCount - 1, Math.round(i)))].date;
  const closes = bars.slice(off).map((b) => b.close);
  const out: SceneItem[] = [];
  for (const ch of elliottChannels(st, closes)) {
    const c = CHANNEL_COLOR[ch.kind];
    for (const ln of [ch.main, ch.parallel])
      out.push({ kind: "segment", a: { t: dateAt(ch.from), price: lineAt(ln, ch.from) }, b: { t: dateAt(ch.to), price: lineAt(ln, ch.to) }, color: rgba(c, 0.5), width: 1, dash: [4, 3] });
    out.push({ kind: "text", t: dateAt(ch.from), price: lineAt(ch.parallel, ch.from), dy: -6, label: { text: ch.label, color: c, priority: LABEL_PRIORITY.other + 1 } });
    if (ch.trigger) out.push({ kind: "ring", t: dateAt(ch.trigger.i), price: ch.trigger.price, color: c, r: 5,
      label: { text: ch.kind === "base" ? "kích hoạt" : "phá kênh", color: c, priority: LABEL_PRIORITY.other } });
  }
  const sc = st.scenario;
  const pts = sc ? sc.points : st.wave === "3" ? st.pivots.slice(-4) : [];
  const dates = new Set(bars.map((b) => b.date));
  pts.forEach((p, k) => {
    if (!dates.has(String(p.time)) || pts.length < 2) return;
    const high = k > 0 ? p.price > pts[k - 1].price : p.price > pts[1].price;
    out.push({ kind: "text", t: String(p.time), price: p.price, dy: high ? -14 : 16, label: { text: fmtP(p.price), color: GQ_COLORS.text2, priority: LABEL_PRIORITY.other } });
  });
  const pt = st.patterns;
  if (sc && pt) {
    const tagAt = (k: number, text: string) => {
      const p = sc.points[k];
      if (p && dates.has(String(p.time))) out.push({ kind: "text", t: String(p.time), price: p.price, dy: p.price > sc.points[k - 1].price ? -26 : 28, label: { text, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other + 2 } });
    };
    if (pt.wave2) tagAt(2, `"${pt.wave2.best?.tag ?? "?"}" ${pt.wave2.alt}`);
    if (pt.wave4) tagAt(4, `"${pt.wave4.best?.tag ?? "?"}" ${pt.wave4.alt}`);
    if (pt.motive?.best && sc.points[5]) tagAt(5, `"${pt.motive.best.tag}"`);
    if (!pt.consistent && sc.points[3]) tagAt(3, "⚠ không nhất quán");
  }
  return out;
}

/**
 * DW6: lớp "Elliott bậc nhỏ" — sóng con i…v / a b c bên trong từng sóng của cách đếm đang chọn (chữ nhỏ, không đường nối)
 * + nhãn kép bậc lớn "(1)/(A)" tại đỉnh/đáy sóng 5 đã xong. Không tìm được đủ sóng con -> bỏ trống, không bịa nhãn.
 */
export function elliottSubItems(st: ElliottState, bars: OhlcvBar[]): SceneItem[] {
  const last = bars[bars.length - 1];
  if (!last || last.date !== st.asOf || bars.length < st.barCount) return [];
  const candles = bars.slice(bars.length - st.barCount).map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const n = elliottNesting(st, candles, st.zigzagPct ?? 0.03);
  if (!n) return [];
  const dates = new Set(bars.map((b) => b.date));
  const out: SceneItem[] = [];
  const color = rgba(st.dir === "up" ? GQ_COLORS.bull : GQ_COLORS.bear, 0.85);
  for (const subs of Object.values(n.waves)) {
    const ok = subs.filter((x) => dates.has(x.time));
    if (ok.length) out.push({ kind: "poly", points: ok.map((x) => ({ t: x.time, price: x.price })), color, width: 0, nodeLabels: ok.map((x) => x.label), nodeStyle: "plain" });
  }
  const p5 = st.scenario?.points[5];
  if (n.higherAt5 && p5 && dates.has(String(p5.time)))
    out.push({ kind: "text", t: String(p5.time), price: p5.price, dy: p5.price > st.scenario!.points[4].price ? -38 : 40, label: { text: n.higherAt5, color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other + 3 } });
  return out;
}

export function elliottSceneItems(inp: ElliottSceneInput): SceneItem[] {
  const show = { count: inp.show?.count ?? true, fib: !!inp.show?.fib, proj: !!inp.show?.proj, guide: !!inp.show?.guide, sub: !!inp.show?.sub };
  const extra: SceneItem[] = [];
  if (inp.bars.length && inp.primary && inp.primary.wave !== "none") {
    if (show.sub) extra.push(...elliottSubItems(inp.primary, inp.bars));
    if (show.guide) extra.push(...elliottGuideItems(inp.primary, inp.bars));
    if (show.fib) extra.push(...elliottFibItems(inp.primary, inp.bars, show.count ? countLayerPrices(inp.primary) : []));
    if (show.proj) extra.push(...elliottProjectionItems(inp.primary, inp.bars));
  }
  return show.count ? [...countItems(inp), ...extra] : extra;
}

function countItems(inp: ElliottSceneInput): SceneItem[] {
  const items: SceneItem[] = [];
  const dates = new Set(inp.bars.map((b) => b.date));
  if (!inp.bars.length) return items;
  const pinned = (pts: ScenePoint[]) => pts.every((p) => dates.has(p.t));

  const h = inp.higher;
  if (h && h.points.length >= 2) {
    const pts = h.points.map((p) => ({ t: p.date, price: p.price }));
    if (pinned(pts)) items.push({ kind: "poly", points: pts, color: rgba(GQ_COLORS.uv, 0.75), width: 1, dash: [6, 4], nodeLabels: h.labels,
      label: { text: "Elliott tuần", color: GQ_COLORS.uv, priority: LABEL_PRIORITY.other } });
  }

  const st = inp.primary;
  const cnt = st ? elliottCountPoints(st) : null;
  if (!st || !cnt) return items;
  const pts = cnt.points.map((p) => ({ t: p.date, price: p.price }));
  if (!pinned(pts)) return items;
  const up = st.dir === "up", color = up ? GQ_COLORS.bull : GQ_COLORS.bear;
  items.push({ kind: "poly", points: pts, color, width: 1.5, dash: st.scenario ? undefined : [4, 3], nodeLabels: cnt.labels,
    label: { text: `Elliott ${st.degree ?? ""}`.trim(), color, priority: LABEL_PRIORITY.other } });

  const sc = st.scenario;
  if (!sc) {
    // Sóng 3 đang chạy: chỉ mục tiêu đầu tiên (×1,618 sóng 1) — không rải toàn bộ mức.
    const t = st.levels.find((l) => l.label.includes("×1,618")) ?? st.levels[0];
    if (t) items.push({ kind: "hline", t1: pts[2].t, t2: null, price: t.price, color: rgba(color, 0.6), dash: [2, 3],
      label: { text: "Mục tiêu sóng 3 ×1,618", color, priority: LABEL_PRIORITY.other } });
    return items;
  }
  const p = sc.points;
  if (st.invalidation) {
    const from = isLive5(st) || sc.points.length < 6 ? String(p[4].time) : String(p[5].time);
    items.push({ kind: "hline", t1: from, t2: null, price: st.invalidation.price, color: rgba(GQ_COLORS.bear, 0.8), dash: [5, 3],
      label: { text: "Vô hiệu", color: GQ_COLORS.bear, priority: LABEL_PRIORITY.other } });
  }
  if (isLive5(st)) {
    const w = sc.targets.wave5.window03;
    items.push({ kind: "zone", t1: String(p[4].time), t2: null, top: Math.max(w.low, w.high), bottom: Math.min(w.low, w.high),
      fill: rgba(GQ_COLORS.amber, 0.06), stroke: rgba(GQ_COLORS.amber, 0.35), dash: [2, 3],
      label: { text: "Cửa sổ sóng 5 (sách)", color: GQ_COLORS.amber, priority: LABEL_PRIORITY.other } });
    // Kênh 2–4 và đường song song qua đỉnh sóng 1/3 (T-36), kéo tới nến cuối.
    const ch = sc.channel, L = st.barCount - 1, lastDate = inp.bars[inp.bars.length - 1].date;
    if (ch && L > p[4].i && lastDate === st.asOf) {
      const at = (a: { i: number; price: number }) => a.price + ch.slope * (L - a.i);
      items.push({ kind: "segment", a: { t: String(p[2].time), price: p[2].price }, b: { t: lastDate, price: at(p[2]) }, color: rgba(color, 0.45), width: 1, dash: [3, 3] });
      const anchor = ch.preferred === "upperW1" ? p[1] : p[3];
      items.push({ kind: "segment", a: { t: String(anchor.time), price: anchor.price }, b: { t: lastDate, price: at(anchor) }, color: rgba(color, 0.45), width: 1, dash: [3, 3] });
    }
  } else if (sc.points.length === 6 && sc.afterWave5) {
    // Sau 5 sóng: mục tiêu đầu tiên của điều chỉnh = cực trị sóng 4 (T-19).
    items.push({ kind: "hline", t1: String(p[5].time), t2: null, price: sc.afterWave5.firstTarget, color: rgba(GQ_COLORS.cyan, 0.6), dash: [2, 3],
      label: { text: "Mục tiêu điều chỉnh: sóng 4", color: GQ_COLORS.cyan, priority: LABEL_PRIORITY.other } });
  }
  return items;
}
