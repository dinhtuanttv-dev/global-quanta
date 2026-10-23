// EP1 (24/10/2026) — ENGINE v3: CÂY SÓNG NHIỀU BẬC bằng phân tích cú pháp từ dưới lên (grammar parsing).
//
//   1. Pivot nền: zigzag với ngưỡng = trung vị ATR%(14) của 200 nến cuối (kẹp 0,8%…8%) — chuẩn hoá theo biến động của mã.
//   2. Chữ ký sóng con: mỗi chặng nền được đếm số sóng con bằng zigzag mịn (ngưỡng × 0,45): 5 ~ "đẩy", 3 ~ "điều chỉnh"
//      (nguyên tắc cốt lõi: đẩy 5-3-5-3-5, zigzag 5-3-5, flat 3-3-5, tam giác 3-3-3-3-3).
//   3. Mỗi bậc: chia chuỗi chặng thành cấu trúc bằng QUY HOẠCH ĐỘNG PHÂN ĐOẠN (segmental Viterbi, giữ 2 lời giải tốt nhất):
//      ứng viên 5 chặng (IM / LD / ED, TR / RTR / ETR), 3 chặng (ZZ / FL / EX-FL / RFL / D3), 1 chặng mồ côi (phạt);
//      quy tắc CỨNG (patterns.ts + "mỗi điểm là cực trị của đoạn kề bên") loại bỏ; điểm = hướng dẫn mềm + khớp chữ ký sóng con.
//      Cấu trúc của bậc này là CHẶNG của bậc trên — lặp tới khi không ghép thêm được.
//   4. Mép phải: chấp nhận cấu trúc DỞ DANG (tiền tố xung lực 1–4 sóng, zigzag A / A-B, tam giác A–C / A–D) với quy tắc cứng
//      áp dụng được -> mã nào cũng có "vị trí hiện tại".
//   5. Lời giải thứ 2 khác loại (đẩy vs điều chỉnh) ở cấu trúc cuối -> nhãn kép kiểu (1)/(A).
// Không nhìn trước: pivot cuối của zigzag chưa xác nhận -> cấu trúc chứa nó là "tạm" (provisional).
// Kết quả là DIỄN GIẢI (EXPERIMENTAL): Elliott chưa có lợi thế ngoài mẫu trên VN (E4, DW4).
import { zigzag, type ElliottCandle } from "../elliottGet.js";
import { classifyMotive, classifyThreeLeg, classifyTriangle, innerPivots, rankFits, type PatternFit, type PatternPoint, type PatternTag } from "../patterns";

export const WAVE_TREE_VERSION = "ew-v3.0";
export const BASE_PCT_STEP = 0.002;
export const WINDOW_ANCHOR = 25;

export interface TreePivot { i: number; price: number; time: string; type: "H" | "L"; confirmed: boolean }
export type NodeKind = "leg" | "motive" | "corrective" | "orphan";
export interface WaveNode {
  level: number;
  kind: NodeKind;
  pattern: PatternTag | null;
  /** Cấu trúc đã đủ sóng (false = dở dang ở mép phải). */
  complete: boolean;
  /** Có dùng pivot chưa xác nhận (pivot cuối của zigzag). */
  provisional: boolean;
  dir: 1 | -1;
  start: TreePivot;
  end: TreePivot;
  children: WaveNode[];
  /** Nhãn các nút con trong cấu trúc này, VD ["1","2","3"] / ["a","b","c"] (lưu ở CHA: nút con có thể dùng chung giữa các lời giải). */
  childLabels: string[];
  /** Số sóng con (chặng nền) hoặc 5 / 3 cho cấu trúc đẩy / điều chỉnh. */
  sig: number;
  score: number;
  fit: PatternFit | null;
}
export interface WaveTree {
  version: string;
  basePct: number;
  pivots: TreePivot[];
  /** levels[0] = chặng nền; levels[k] = cấu trúc bậc k (đã gán nhãn). */
  levels: WaveNode[][];
  /** Đường "vị trí hiện tại" từ bậc cao nhất xuống chặng nền (nút cuối của mỗi bậc). */
  position: WaveNode[];
  /** Phương án thay thế cho cấu trúc cuối của từng bậc (lời giải thứ 2 của quy hoạch động). */
  alternates: { level: number; node: WaveNode }[];
  /** Nhãn kép bậc lớn nhất có tranh chấp đẩy / điều chỉnh, VD "(1)/(A)". */
  dualLabel: string | null;
  asOf: string;
  barCount: number;
}

const NOTATION: ((k: number, motive: boolean) => string)[] = [
  () => "",
  (k, m) => (m ? ["i", "ii", "iii", "iv", "v"][k] : ["a", "b", "c", "d", "e"][k]),
  (k, m) => (m ? String(k + 1) : "ABCDE"[k]),
  (k, m) => `(${m ? k + 1 : "ABCDE"[k]})`,
  (k, m) => `[${m ? k + 1 : "ABCDE"[k]}]`,
  (k, m) => `{${m ? k + 1 : "ABCDE"[k]}}`,
];
const WXY = ["W", "X", "Y"];

/** Ký hiệu nhãn theo bậc (1 = nhỏ nhất: i…v / a b c; 2: 1…5 / A B C; 3: (1)…(5); 4: [1]…; 5: {1}…). */
export function waveLabel(level: number, index: number, pattern: PatternTag | null): string {
  const f = NOTATION[Math.min(level, NOTATION.length - 1)];
  if (pattern === "D3") { const w = WXY[index] ?? "?"; return level === 1 ? w.toLowerCase() : level >= 3 ? `(${w})` : w; }
  return f(index, pattern === "IM" || pattern === "LD" || pattern === "ED");
}

export function medianAtrPct(c: ElliottCandle[], n = 14, lookback = 200): number {
  if (c.length < n + 2) return 0.03;
  const tr: number[] = [];
  let prev = NaN;
  const pcts: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const t = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    tr.push(t);
    if (tr.length === n) prev = tr.reduce((a, b) => a + b, 0) / n;
    else if (tr.length > n) prev = (prev * (n - 1) + t) / n;
    if (tr.length >= n && i >= c.length - lookback && c[i].close > 0) pcts.push(prev / c[i].close);
  }
  pcts.sort((a, b) => a - b);
  return pcts.length ? pcts[pcts.length >> 1] : 0.03;
}

const PT = (p: TreePivot): PatternPoint => ({ i: p.i, price: p.price, time: p.time });

/**
 * Mỗi điểm giữa là cực trị (high / low của nến) của đoạn giữa hai điểm kề bên. Mỗi nến chỉ đóng MỘT vai trò như zigzag:
 * khi kiểm một đáy, bỏ qua nến đã là ĐỈNH pivot (nến bao trùm: high là đỉnh pivot, low có thể thấp hơn đáy kế tiếp) và ngược lại.
 */
let ROLE_H = new Set<number>(), ROLE_L = new Set<number>();
export function extremesOk(c: ElliottCandle[], pts: { i: number; price: number }[], roleH: Set<number> = ROLE_H, roleL: Set<number> = ROLE_L): boolean {
  for (let k = 1; k < pts.length - 1; k++) {
    const up = pts[k].price > pts[k - 1].price;
    for (let i = pts[k - 1].i + 1; i < pts[k + 1].i; i++) {
      if (up ? !roleL.has(i) && c[i].high > pts[k].price * (1 + 1e-9) : !roleH.has(i) && c[i].low < pts[k].price * (1 - 1e-9)) return false;
    }
  }
  return true;
}

/** Vai trò của nút trong ngữ pháp: 5 = đẩy, 3 = điều chỉnh, 1 = chưa rõ. */
const role = (n: WaveNode) => (n.kind === "motive" ? 5 : n.kind === "corrective" ? 3 : n.kind === "leg" ? (n.sig >= 5 ? 5 : n.sig === 3 ? 3 : 1) : 1);
const sigScore = (nodes: WaveNode[], expect: number[][]) => {
  let s = 0;
  nodes.forEach((n, k) => { const r = role(n); if (r === 1) return; s += expect[k]?.includes(r) ? 0.4 : -0.4; });
  return s;
};

interface Cand { len: number; node: WaveNode }

/**
 * Tiên nghiệm theo tần suất mô hình trong lý thuyết Elliott (Frost & Prechter): zigzag và xung lực phổ biến; flat chạy,
 * tam giác chạy / mở rộng hiếm. Cộng vào điểm cấu trúc (log-odds thô) để mô hình hiếm phải có bằng chứng mạnh hơn.
 */
export const PATTERN_PRIOR: Partial<Record<PatternTag, number>> = { IM: 0.3, LD: -0.3, ED: -0.2, ZZ: 0.2, FL: 0.1, "EX-FL": 0, RFL: -1.4, TR: 0, RTR: -1.0, ETR: -1.0, D3: -0.2 };
/** Điểm cấu trúc chuẩn hoá theo số chặng (cấu trúc 5 chặng không bị thiệt so với 3 chặng) + chữ ký sóng con + tiên nghiệm. */
const structScore = (len: number, fitScore: number, sig: number, tag: PatternTag) => len * (0.45 + 0.55 * fitScore) + sig + (PATTERN_PRIOR[tag] ?? 0);
const partialScore = (len: number, sig: number, tag: PatternTag) => len * 0.35 + 0.6 * sig + (PATTERN_PRIOR[tag] ?? 0);
/** Chặng không thuộc cấu trúc nào ("mồ côi"): phạt mỗi chặng; chặng cuối đang chạy phạt nhẹ hơn. */
export const ORPHAN_COST = -0.6, ORPHAN_EDGE_COST = -0.25;

function makeNode(level: number, kind: NodeKind, pattern: PatternTag | null, children: WaveNode[], complete: boolean, score: number, fit: PatternFit | null): WaveNode {
  const start = children[0].start, end = children[children.length - 1].end;
  return { level, kind, pattern, complete, provisional: children.some((c) => c.provisional), dir: end.price >= start.price ? 1 : -1,
    start, end, children, childLabels: [], sig: kind === "motive" ? 5 : kind === "corrective" ? 3 : 1, score, fit };
}

/** Ứng viên cấu trúc bắt đầu tại nút j (trên chuỗi nút bậc dưới). */
export function candidatesAt(c: ElliottCandle[], nodes: WaveNode[], j: number, level: number): Cand[] {
  const out: Cand[] = [];
  const m = nodes.length;
  const pts = (len: number) => [nodes[j].start, ...nodes.slice(j, j + len).map((n) => n.end)];
  // 5 chặng: xung lực / nêm / tam giác
  if (j + 5 <= m) {
    const p = pts(5), seg = nodes.slice(j, j + 5);
    if (extremesOk(c, p)) {
      const pp = p.map(PT);
      for (const f of classifyMotive(pp, "unknown")) if (f.valid) {
        const exp = f.tag === "IM" ? [[5], [3, 1], [5], [3, 1], [5]] : [[5, 3], [3], [5, 3], [3], [5, 3]];
        out.push({ len: 5, node: makeNode(level, "motive", f.tag, seg, true, structScore(5, f.score, sigScore(seg, exp), f.tag), f) });
      }
      for (const f of classifyTriangle(pp)) if (f.valid)
        out.push({ len: 5, node: makeNode(level, "corrective", f.tag, seg, true, structScore(5, f.score, sigScore(seg, [[3], [3], [3], [3], [3]]), f.tag), f) });
    }
  }
  // 3 chặng: zigzag / flat / W-X-Y
  if (j + 3 <= m) {
    const p = pts(3), seg = nodes.slice(j, j + 3);
    if (extremesOk(c, p)) {
      const [o, A, B, C] = p.map(PT);
      for (const f of classifyThreeLeg(o, A, B, C, { aWaves: role(seg[0]) === 1 ? null : role(seg[0]), cWaves: role(seg[2]) === 1 ? null : role(seg[2]) })) if (f.valid) {
        const exp = f.tag === "ZZ" ? [[5], [3], [5]] : f.tag === "D3" ? [[3], [3, 5], [3]] : [[3], [3], [5]];
        out.push({ len: 3, node: makeNode(level, "corrective", f.tag, seg, true, structScore(3, f.score, sigScore(seg, exp), f.tag), f) });
      }
    }
  }
  // Dở dang ở mép phải
  const rest = m - j;
  if (rest >= 1 && rest <= 4) {
    const p = pts(rest), seg = nodes.slice(j);
    if (extremesOk(c, p)) {
      const L = (a: TreePivot, b: TreePivot) => Math.abs(b.price - a.price);
      const s = Math.sign(p[1].price - p[0].price);
      const w2ok = rest < 2 || L(p[1], p[2]) < L(p[0], p[1]);
      const w3ok = rest < 3 || s * (p[3].price - p[1].price) > 0 || !p[3].confirmed;
      const w4ok = rest < 4 || s * (p[4].price - p[1].price) > 0;
      if (w2ok && w3ok && w4ok && rest >= 2)
        out.push({ len: rest, node: makeNode(level, "motive", "IM", seg, false, partialScore(rest, sigScore(seg, [[5], [3, 1], [5], [3, 1]]), "IM"), null) });
      if (rest <= 2 && w2ok && rest === 2)
        out.push({ len: rest, node: makeNode(level, "corrective", "ZZ", seg, false, partialScore(rest, sigScore(seg, [[5, 3], [3]]), "ZZ"), null) });
      // A-B của flat mở rộng đang chạy: B vượt điểm đầu A nhưng ≤ 138,2% A (quy ước phác đồ: B ≈ 127,2 / 138,2%).
      if (rest === 2) {
        const bR = L(p[1], p[2]) / L(p[0], p[1]);
        if (bR > 1 && bR <= 1.382 + 0.05) out.push({ len: 2, node: makeNode(level, "corrective", "EX-FL", seg, false, partialScore(2, sigScore(seg, [[3], [3]]), "EX-FL"), null) });
      }
      if (rest >= 3) {
        const legs = seg.map((n) => L(n.start, n.end));
        const shrinking = legs.slice(1).every((x, k) => k === 0 || x < legs[k]);
        if (shrinking) out.push({ len: rest, node: makeNode(level, "corrective", "TR", seg, false, partialScore(rest, sigScore(seg, [[3], [3], [3], [3]]), "TR") - 0.3, null) });
      }
    }
  }
  return out;
}

interface Path { score: number; nodes: WaveNode[] }

/** Quy hoạch động phân đoạn (giữ K = 2 lời giải tốt nhất cho mỗi điểm cắt); chặng mồ côi bị phạt (ORPHAN_COST). */
export function parseLevel(c: ElliottCandle[], nodes: WaveNode[], level: number, K = 2): Path[] {
  const m = nodes.length;
  const best: Path[][] = Array.from({ length: m + 1 }, () => []);
  best[0] = [{ score: 0, nodes: [] }];
  const push = (e: number, p: Path) => {
    const list = best[e];
    list.push(p);
    list.sort((a, b) => b.score - a.score);
    if (list.length > K) list.length = K;
  };
  for (let j = 0; j < m; j++) {
    if (!best[j].length) continue;
    const cands = candidatesAt(c, nodes, j, level);
    for (const prev of best[j]) {
      const orphan: WaveNode = { ...nodes[j], level, kind: "orphan", pattern: null, children: [nodes[j]], complete: true, childLabels: [], sig: 1, score: 0, fit: null };
      push(j + 1, { score: prev.score + (j === m - 1 ? ORPHAN_EDGE_COST : ORPHAN_COST), nodes: [...prev.nodes, orphan] });
      for (const cd of cands) push(j + cd.len, { score: prev.score + cd.node.score, nodes: [...prev.nodes, cd.node] });
    }
  }
  return best[m];
}

function assignLabels(n: WaveNode) {
  if (n.kind !== "motive" && n.kind !== "corrective") return;
  n.childLabels = n.children.map((_, k) => waveLabel(n.level, k, n.pattern));
}

/** Dựng cây sóng cho chuỗi nến (cửa sổ ≤ 500 nến cuối). */
export function buildWaveTree(candles: ElliottCandle[], opts: { basePct?: number; maxLevels?: number } = {}): WaveTree | null {
  // Cửa sổ NEO theo bội số 25 nến (dài 500–525): điểm bắt đầu zigzag chỉ đổi mỗi 25 phiên — pivot đã xác nhận không bị tính lại
  // mỗi ngày chỉ vì cửa sổ trượt (đo EP1: cửa sổ trượt từng nến làm ~2% pivot cũ đổi).
  const start = Math.floor(Math.max(0, candles.length - 500) / WINDOW_ANCHOR) * WINDOW_ANCHOR;
  const c = candles.slice(start);
  if (c.length < 60) return null;
  // Ngưỡng nền LƯỢNG TỬ HOÁ theo bước 0,2% (chống "vẽ lại" do ATR% dao động nhẹ từng ngày làm đổi pivot đã xác nhận).
  const basePct = opts.basePct ?? Math.min(0.08, Math.max(0.008, Math.round(medianAtrPct(c) / BASE_PCT_STEP) * BASE_PCT_STEP));
  const zz = zigzag(c, { pct: basePct });
  const pivots: TreePivot[] = zz.map((p) => ({ i: p.i, price: p.price, time: String(p.time), type: p.type, confirmed: p.confirmed }));
  if (pivots.length < 3) return null;
  ROLE_H = new Set(pivots.filter((p) => p.type === "H").map((p) => p.i));
  ROLE_L = new Set(pivots.filter((p) => p.type === "L").map((p) => p.i));
  // Bậc 0: chặng nền + chữ ký sóng con
  const legs: WaveNode[] = [];
  for (let k = 1; k < pivots.length; k++) {
    const a = pivots[k - 1], b = pivots[k];
    const n = innerPivots(c, PT(a), PT(b), basePct * 0.45).length - 1;
    legs.push({ level: 0, kind: "leg", pattern: null, complete: b.confirmed, provisional: !b.confirmed, dir: b.price >= a.price ? 1 : -1,
      start: a, end: b, children: [], childLabels: [], sig: n, score: 0, fit: null });
  }
  const levels: WaveNode[][] = [legs];
  const alternates: { level: number; node: WaveNode }[] = [];
  const maxLevels = opts.maxLevels ?? 5;
  let cur = legs;
  for (let lv = 1; lv <= maxLevels && cur.length >= 3; lv++) {
    const paths = parseLevel(c, cur, lv);
    if (!paths.length) break;
    const top = paths[0].nodes;
    if (!top.some((n) => n.kind === "motive" || n.kind === "corrective")) break;
    top.forEach(assignLabels);
    levels.push(top);
    const alt = paths[1]?.nodes[paths[1].nodes.length - 1];
    const last = top[top.length - 1];
    if (alt && (alt.kind !== last.kind || alt.pattern !== last.pattern || alt.start.i !== last.start.i)) { assignLabels(alt); alternates.push({ level: lv, node: alt }); }
    if (top.length === cur.length) break; // không ghép thêm được
    cur = top;
  }
  // Vị trí hiện tại: nút cuối của mỗi bậc, từ cao xuống thấp
  const position = levels.slice(1).map((l) => l[l.length - 1]).reverse();
  // Nhãn kép: bậc cao nhất có phương án khác loại (đẩy vs điều chỉnh) ở cấu trúc cuối
  let dualLabel: string | null = null;
  for (const a of [...alternates].sort((x, y) => y.level - x.level)) {
    const main = levels[a.level][levels[a.level].length - 1];
    if (main.kind !== "orphan" && a.node.kind !== "orphan" && main.kind !== a.node.kind) {
      const nm = waveLabel(a.level + 1, 0, main.kind === "motive" ? "IM" : "ZZ"), na = waveLabel(a.level + 1, 0, a.node.kind === "motive" ? "IM" : "ZZ");
      dualLabel = main.kind === "motive" ? `${nm}/${na}` : `${na}/${nm}`;
      break;
    }
  }
  return { version: WAVE_TREE_VERSION, basePct, pivots, levels, position, alternates, dualLabel, asOf: String(c[c.length - 1].time), barCount: c.length };
}

/** Có "vị trí hiện tại" (ít nhất một bậc ≥ 1 mà nút cuối là cấu trúc, không mồ côi). */
export const treeCovers = (t: WaveTree | null) => !!t && t.position.some((n) => (n.kind === "motive" || n.kind === "corrective") && n.children.length >= 2);

const PATTERN_VI: Record<string, string> = { IM: "xung lực", LD: "nêm mở đầu", ED: "nêm kết thúc", ZZ: "zigzag", DZ: "zigzag kép", FL: "flat",
  "EX-FL": "flat mở rộng", RFL: "flat chạy", TR: "tam giác", RTR: "tam giác chạy", ETR: "tam giác mở rộng", D3: "W-X-Y", T3: "W-X-Y-X-Z" };

/** Mô tả vị trí: "Bậc 3: (3) của xung lực (đang chạy) → bậc 2: sóng v … ". */
export function describePosition(t: WaveTree | null): string {
  if (!t || !treeCovers(t)) return "Chưa dựng được cấu trúc sóng.";
  const parts: string[] = [];
  for (const n of t.position) {
    if (n.kind === "orphan") continue;
    const lastLabel = n.childLabels[n.childLabels.length - 1];
    const what = `${PATTERN_VI[n.pattern ?? ""] ?? n.pattern ?? "cấu trúc"} ${n.dir > 0 ? "tăng" : "giảm"}`;
    parts.push(`${lastLabel || "?"} của ${what}${n.complete ? " (đã đủ sóng)" : " (đang chạy)"}`);
  }
  return parts.join(" → ");
}
