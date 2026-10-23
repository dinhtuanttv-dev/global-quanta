// DW4 (23/10/2026) — DANH MỤC QUY TẮC & MÔ HÌNH Elliott (theo thẻ quy tắc của bộ phác đồ tham khảo `song+ fibo` + sách GET).
// Hàm thuần trên dãy pivot xen kẽ (đỉnh/đáy) — KHÔNG thay đổi điểm số / xếp hạng kịch bản của engine (elliottGet.js);
// chỉ GẮN THẺ mô hình cho từng đoạn của cách đếm đang chọn và giải thích quy tắc nào đạt / không đạt.
//   - Quy tắc CỨNG (hard): vi phạm => mô hình bị loại.
//   - Hướng dẫn MỀM (soft): cộng điểm thứ hạng giữa các mô hình còn hợp lệ — KHÔNG phải xác suất.
// Thẻ: IM (xung lực) · LD / ED (nêm mở đầu / kết thúc) · ZZ · DZ (zigzag kép) · FL · EX-FL (flat mở rộng) · RFL (flat chạy)
//      · TR (tam giác thu hẹp) · RTR (tam giác chạy) · ETR (tam giác mở rộng) · D3 (W-X-Y) · T3 (W-X-Y-X-Z).
import { zigzag, type ElliottCandle } from "./elliottGet.js";

export interface PatternPoint { i: number; price: number; time?: string }
export type PatternTag = "IM" | "LD" | "ED" | "ZZ" | "DZ" | "FL" | "EX-FL" | "RFL" | "TR" | "RTR" | "ETR" | "D3" | "T3";
export interface RuleCheck { id: string; severity: "hard" | "soft"; pass: boolean | null; text: string }
export interface PatternFit {
  tag: PatternTag;
  name: string;
  valid: boolean;
  /** Điểm thứ hạng tương đối giữa các mô hình hợp lệ của CÙNG đoạn (tỷ lệ hướng dẫn mềm đạt) — không phải xác suất. */
  score: number;
  rules: RuleCheck[];
  /** Nhãn theo thứ tự điểm: 0-1-2-3-4-5, A-B-C, A-B-C-D-E, W-X-Y… (điểm đầu là gốc đoạn). */
  labels: string[];
}

export const PATTERN_NAME: Record<PatternTag, string> = {
  IM: "Xung lực", LD: "Nêm mở đầu (Leading Diagonal)", ED: "Nêm kết thúc (Ending Diagonal)", ZZ: "Zigzag", DZ: "Zigzag kép",
  FL: "Flat", "EX-FL": "Flat mở rộng", RFL: "Flat chạy", TR: "Tam giác thu hẹp", RTR: "Tam giác chạy", ETR: "Tam giác mở rộng",
  D3: "Điều chỉnh kép W-X-Y", T3: "Điều chỉnh ba W-X-Y-X-Z",
};

/** Tỷ lệ Fibonacci dùng trong bộ phác đồ (DW4/DW5: thêm 78,6% · 127,2% · 138,2% · 361,8% theo quy ước của các phác đồ). */
export const DW_FIB = {
  retrace: [0.236, 0.382, 0.5, 0.618, 0.786],
  zzB: { typical: [0.5, 0.618], max: 0.786 },
  flatB: { min: 0.9, expandedMax: 1.382, expandedTypical: [1.272, 1.382] },
  w3: [1.618, 2.618, 3.618],
  w4: [0.382, 0.5],
  w5Of03: [0.382, 0.618],
  c: [1, 1.618],
} as const;

const near = (v: number, xs: readonly number[], tol = 0.08) => xs.some((x) => Math.abs(v - x) <= tol * Math.max(1, x));
const fit = (tag: PatternTag, rules: RuleCheck[], labels: string[]): PatternFit => {
  const hard = rules.filter((r) => r.severity === "hard"), soft = rules.filter((r) => r.severity === "soft" && r.pass !== null);
  return { tag, name: PATTERN_NAME[tag], labels, rules, valid: hard.every((r) => r.pass !== false), score: soft.length ? soft.filter((r) => r.pass).length / soft.length : 0.5 };
};
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const len = (a: PatternPoint, b: PatternPoint) => Math.abs(b.price - a.price);
/** Hướng của chặng đầu (a -> b): +1 lên, −1 xuống. */
const dirOf = (a: PatternPoint, b: PatternPoint): 1 | -1 => (b.price >= a.price ? 1 : -1);
/** Độ dốc đường nối 2 điểm (giá / nến). */
const slope = (a: PatternPoint, b: PatternPoint) => (b.price - a.price) / Math.max(1, b.i - a.i);

/** Xếp hạng: hợp lệ trước, rồi điểm mềm, rồi thứ tự khai báo (ổn định). */
export function rankFits(fits: PatternFit[]): PatternFit[] {
  return fits.map((f, k) => ({ f, k })).sort((a, b) => Number(b.f.valid) - Number(a.f.valid) || b.f.score - a.f.score || a.k - b.k).map((x) => x.f);
}

// ───────────────────────────── Sóng đẩy: xung lực / nêm ─────────────────────────────
/**
 * 6 điểm 0..5 của một sóng đẩy. `position`: vị trí của sóng đẩy trong bậc lớn hơn — "first" (sóng 1 / A: có thể là nêm mở đầu),
 * "last" (sóng 5 / C: có thể là nêm kết thúc), "middle" (sóng 3: chỉ xung lực).
 */
export function classifyMotive(p: PatternPoint[], position: "first" | "last" | "middle" | "unknown" = "unknown"): PatternFit[] {
  if (p.length < 6) return [];
  const s = dirOf(p[0], p[1]);
  const w = [len(p[0], p[1]), len(p[1], p[2]), len(p[2], p[3]), len(p[3], p[4]), len(p[4], p[5])];
  const r2 = w[1] / w[0], r4 = w[3] / w[2];
  const w3Shortest = w[2] < w[0] && w[2] < w[4];
  const overlap = s * (p[4].price - p[1].price) <= 0;            // đáy (đỉnh) sóng 4 lấn vào vùng giá sóng 1
  const w3Beyond = s * (p[3].price - p[1].price) > 0;
  const w5Beyond = s * (p[5].price - p[3].price) > 0;
  const base: RuleCheck[] = [
    { id: "w2-origin", severity: "hard", pass: r2 < 1, text: `Sóng 2 không vượt gốc sóng 1 (hồi ${pct(r2)})` },
    { id: "w3-not-shortest", severity: "hard", pass: !w3Shortest, text: "Sóng 3 không phải sóng ngắn nhất trong 1-3-5" },
    { id: "w3-beyond-w1", severity: "hard", pass: w3Beyond, text: "Sóng 3 vượt điểm cuối sóng 1" },
  ];
  const out: PatternFit[] = [];
  out.push(fit("IM", [...base,
    { id: "w4-no-overlap", severity: "hard", pass: !overlap, text: "Sóng 4 không lấn vào vùng giá sóng 1" },
    { id: "w5-beyond-w3", severity: "soft", pass: w5Beyond, text: w5Beyond ? "Sóng 5 vượt đỉnh/đáy sóng 3" : "Sóng 5 hụt (truncation)" },
    { id: "w3-ext", severity: "soft", pass: near(w[2] / w[0], DW_FIB.w3, 0.12), text: `Sóng 3 ≈ 161,8 / 261,8 / 361,8% sóng 1 (thực tế ${pct(w[2] / w[0])})` },
    { id: "w4-depth", severity: "soft", pass: near(r4, DW_FIB.w4, 0.12) || r4 < 0.5, text: `Sóng 4 hồi 38,2–50% sóng 3 (thực tế ${pct(r4)})` },
  ], ["0", "1", "2", "3", "4", "5"]));
  // Nêm: sóng 4 lấn sóng 1 (đặc trưng), hai đường 1-3 và 2-4 hội tụ (thu hẹp) hoặc phân kỳ (mở rộng).
  const s13 = slope(p[1], p[3]), s24 = slope(p[2], p[4]);
  const contracting = w[2] < w[0] && w[4] < w[2] && w[3] < w[1] && s * (s13 - s24) < 0;
  const expanding = w[2] > w[0] && w[4] > w[2] && w[3] > w[1] && s * (s13 - s24) > 0;
  const wedge: RuleCheck[] = [...base,
    { id: "diag-overlap", severity: "hard", pass: overlap, text: "Sóng 4 lấn vào vùng giá sóng 1 (đặc trưng của nêm)" },
    { id: "diag-wedge", severity: "hard", pass: contracting || expanding, text: contracting ? "Nêm thu hẹp: 1 > 3 > 5, 2 > 4, hai đường hội tụ" : expanding ? "Nêm mở rộng: 1 < 3 < 5, 2 < 4, hai đường phân kỳ" : "Hai đường 1-3 và 2-4 không tạo hình nêm" },
    { id: "diag-w5", severity: "soft", pass: w5Beyond, text: w5Beyond ? "Sóng 5 vượt sóng 3" : "Sóng 5 không vượt sóng 3 (nêm hụt)" },
    { id: "diag-deep", severity: "soft", pass: r2 >= 0.5 && r4 >= 0.5, text: "Sóng 2 và 4 hồi sâu (≥ 50%) — điển hình của nêm" },
  ];
  if (position !== "middle") {
    if (position !== "last") out.push(fit("LD", [...wedge, { id: "ld-pos", severity: "soft", pass: position === "first" ? true : null, text: "Nêm mở đầu ở sóng 1 / sóng A" }], ["0", "1", "2", "3", "4", "5"]));
    if (position !== "first") out.push(fit("ED", [...wedge, { id: "ed-pos", severity: "soft", pass: position === "last" ? true : null, text: "Nêm kết thúc ở sóng 5 / sóng C" }], ["0", "1", "2", "3", "4", "5"]));
  }
  return rankFits(out);
}

// ───────────────────────────── Điều chỉnh ─────────────────────────────
/**
 * Điều chỉnh 3 chặng: start -> A -> B -> C (C có thể chưa xác nhận: null). `aWaves`, `cWaves` = số sóng con (zigzag mịn) nếu biết.
 * Zigzag 5-3-5 · Flat 3-3-5 (B ≥ 90%) · Flat mở rộng (B > 100%, C vượt cuối A) · Flat chạy (B > 100%, C không tới cuối A)
 * · W-X-Y: hai chặng W, Y là điều chỉnh 3 sóng (zigzag mịn đếm 3), X là sóng nối.
 */
export function classifyThreeLeg(start: PatternPoint, A: PatternPoint, B: PatternPoint, C: PatternPoint | null, sub: { aWaves?: number | null; cWaves?: number | null } = {}): PatternFit[] {
  const s = dirOf(start, A), lenA = len(start, A);
  if (!(lenA > 0)) return [];
  const bR = (s * (A.price - B.price)) / lenA;                    // B hồi bao nhiêu % của A
  const cBeyond = C ? s * (C.price - A.price) > 0 : null;         // C vượt điểm cuối A
  const cR = C ? len(B, C) / lenA : null;
  const L = ["0", "A", "B", "C"];
  const known = (n: number | null | undefined) => (n === 3 || n === 5 ? n : null);
  const aw = known(sub.aWaves), cw = known(sub.cWaves);
  const out: PatternFit[] = [];
  out.push(fit("ZZ", [
    { id: "zz-b", severity: "hard", pass: bR < 1, text: `B không vượt điểm đầu A (B hồi ${pct(bR)})` },
    { id: "zz-c", severity: "hard", pass: cBeyond, text: C ? (cBeyond ? "C vượt điểm cuối A" : "C chưa vượt điểm cuối A") : "C chưa hình thành" },
    { id: "zz-b-depth", severity: "soft", pass: bR <= DW_FIB.zzB.max, text: `B hồi 50–61,8% (≤ 78,6%) của A` },
    { id: "zz-c-ratio", severity: "soft", pass: cR == null ? null : near(cR, DW_FIB.c, 0.12), text: cR == null ? "C = 100 / 161,8% A (chờ C)" : `C ≈ 100 / 161,8% A (thực tế ${pct(cR)})` },
    { id: "zz-a5", severity: "soft", pass: aw == null ? null : aw === 5, text: "A có 5 sóng con (5-3-5)" },
  ], L));
  out.push(fit("FL", [
    { id: "fl-b", severity: "hard", pass: bR >= DW_FIB.flatB.min && bR <= 1.05, text: `B hồi 90–105% của A (thực tế ${pct(bR)})` },
    { id: "fl-c", severity: "soft", pass: cR == null ? null : cR >= 0.9 && cR <= 1.2, text: cR == null ? "C ≈ A (chờ C)" : `C ≈ A, kết thúc gần cuối A (thực tế ${pct(cR)})` },
    { id: "fl-a3", severity: "soft", pass: aw == null ? null : aw === 3, text: "A có 3 sóng con (3-3-5)" },
  ], L));
  out.push(fit("EX-FL", [
    { id: "exfl-b", severity: "hard", pass: bR > 1, text: `B vượt điểm đầu A (B = ${pct(bR)} của A)` },
    { id: "exfl-c", severity: "hard", pass: C ? cBeyond : null, text: C ? (cBeyond ? "C vượt điểm cuối A" : "C chưa vượt cuối A") : "C chưa hình thành" },
    { id: "exfl-b-ratio", severity: "soft", pass: bR <= DW_FIB.flatB.expandedMax + 0.05, text: `B ≈ 127,2 / 138,2% của A` },
    { id: "exfl-c-ratio", severity: "soft", pass: cR == null ? null : near(cR, [1.618], 0.15), text: cR == null ? "C ≈ 161,8% A (chờ C)" : `C ≈ 161,8% A (thực tế ${pct(cR)})` },
    { id: "exfl-a3", severity: "soft", pass: aw == null ? null : aw === 3, text: "A có 3 sóng con" },
  ], L));
  out.push(fit("RFL", [
    { id: "rfl-b", severity: "hard", pass: bR > 1, text: `B vượt điểm đầu A (B = ${pct(bR)} của A)` },
    { id: "rfl-c", severity: "hard", pass: C ? cBeyond === false : null, text: C ? (cBeyond ? "C vượt cuối A (không phải flat chạy)" : "C không tới cuối A — xu hướng lớn mạnh") : "C chưa hình thành" },
    { id: "rfl-a3", severity: "soft", pass: aw == null ? null : aw === 3, text: "A có 3 sóng con" },
  ], L));
  out.push(fit("D3", [
    { id: "d3-w3", severity: "hard", pass: aw === 3, text: aw == null ? "W: chưa đếm được sóng con" : `W là điều chỉnh 3 sóng (đếm được ${aw})` },
    { id: "d3-y3", severity: "hard", pass: cw === 3, text: cw == null ? "Y: chưa đếm được sóng con" : `Y là điều chỉnh 3 sóng (đếm được ${cw})` },
    { id: "d3-x", severity: "hard", pass: bR < 1, text: `X không vượt điểm đầu W (X hồi ${pct(bR)})` },
    { id: "d3-y-ratio", severity: "soft", pass: cR == null ? null : near(cR, [1, 0.618, 1.618], 0.12), text: cR == null ? "Y ≈ W (chờ Y)" : `Y ≈ 61,8 / 100 / 161,8% W (thực tế ${pct(cR)})` },
  ], ["0", "W", "X", "Y"]));
  return rankFits(out);
}

/** Zigzag kép / W-X-Y ở CÙNG bậc: 7 chặng start,a,b,W,x,a,b,Y — hai zigzag nối bằng X. */
export function classifySevenLeg(p: PatternPoint[]): PatternFit[] {
  if (p.length < 8) return [];
  const first = rankFits(classifyThreeLeg(p[0], p[1], p[2], p[3]))[0];
  const second = rankFits(classifyThreeLeg(p[4], p[5], p[6], p[7]))[0];
  const s = dirOf(p[0], p[1]);
  const xR = len(p[3], p[4]) / len(p[0], p[3]);
  const progress = s * (p[7].price - p[3].price) > 0;
  const zz = (f?: PatternFit) => !!f && f.valid && f.tag === "ZZ";
  return rankFits([
    fit("DZ", [
      { id: "dz-w", severity: "hard", pass: zz(first), text: "W là zigzag" },
      { id: "dz-y", severity: "hard", pass: zz(second), text: "Y là zigzag" },
      { id: "dz-x", severity: "hard", pass: xR < 1, text: `X không vượt điểm đầu W (X hồi ${pct(xR)})` },
      { id: "dz-progress", severity: "soft", pass: progress, text: "Y đi xa hơn W (zigzag kép đẩy giá thêm)" },
    ], ["0", "a", "b", "W", "X", "a", "b", "Y"]),
    fit("D3", [
      { id: "d3-w", severity: "hard", pass: !!first?.valid, text: `W là điều chỉnh hợp lệ (${first?.tag ?? "—"})` },
      { id: "d3-y", severity: "hard", pass: !!second?.valid, text: `Y là điều chỉnh hợp lệ (${second?.tag ?? "—"})` },
      { id: "d3-x", severity: "hard", pass: xR < 1, text: `X không vượt điểm đầu W (X hồi ${pct(xR)})` },
      { id: "d3-mix", severity: "soft", pass: !!first && !!second && first.tag !== second.tag, text: "W và Y khác dạng (vd. zigzag + flat) — điển hình của W-X-Y" },
    ], ["0", "a", "b", "W", "X", "a", "b", "Y"]),
  ]);
}

/**
 * Tam giác 5 chặng: start(= điểm bắt đầu A) + A,B,C,D,E (6 điểm). Theo thẻ quy tắc:
 *   thu hẹp — mỗi sóng không vượt điểm đầu sóng trước (trừ B); hai đường A-C và B-D hội tụ; E nằm trong D;
 *   chạy — như thu hẹp nhưng B vượt điểm đầu A; mở rộng — mỗi sóng vượt điểm đầu sóng trước, hai đường phân kỳ.
 */
export function classifyTriangle(p: PatternPoint[]): PatternFit[] {
  if (p.length < 6) return [];
  const [o, a, b, c, d, e] = p;
  const L = [len(o, a), len(a, b), len(b, c), len(c, d), len(d, e)];
  const beyondPrevStart = (k: number) => L[k] > L[k - 1];          // chặng k vượt điểm đầu chặng k−1
  const sAC = slope(a, c), sBD = slope(b, d);
  const s = dirOf(o, a);
  // a, c, e cùng phía (cực trị của A, C, E); hội tụ: hai biên tiến lại gần nhau.
  const gapStart = Math.abs(a.price - b.price), gapEnd = Math.abs((a.price + sAC * (e.i - a.i)) - (b.price + sBD * (e.i - b.i)));
  const converge = gapEnd < gapStart, diverge = gapEnd > gapStart;
  const labels = ["0", "A", "B", "C", "D", "E"];
  const noneBeyond = [2, 3, 4].every((k) => !beyondPrevStart(k));
  const eInsideD = L[4] < L[3];
  return rankFits([
    fit("TR", [
      { id: "tr-b", severity: "hard", pass: !beyondPrevStart(1), text: "B không vượt điểm đầu A" },
      { id: "tr-nobeyond", severity: "hard", pass: noneBeyond, text: "C, D, E không vượt điểm đầu sóng trước" },
      { id: "tr-converge", severity: "hard", pass: converge, text: "Hai đường A-C và B-D hội tụ" },
      { id: "tr-e", severity: "soft", pass: eInsideD, text: "E nằm trong D" },
      { id: "tr-shrink", severity: "soft", pass: L[2] < L[1] && L[3] < L[2], text: "Các sóng co dần" },
    ], labels),
    fit("RTR", [
      { id: "rtr-b", severity: "hard", pass: beyondPrevStart(1), text: "B vượt điểm đầu A (tam giác chạy)" },
      { id: "rtr-nobeyond", severity: "hard", pass: noneBeyond, text: "C, D, E không vượt điểm đầu sóng trước" },
      { id: "rtr-converge", severity: "hard", pass: converge, text: "Hai đường A-C và B-D hội tụ" },
      { id: "rtr-e", severity: "soft", pass: eInsideD, text: "E nằm trong D" },
    ], labels),
    fit("ETR", [
      { id: "etr-grow", severity: "hard", pass: [2, 3, 4].every(beyondPrevStart), text: "Mỗi sóng C, D, E vượt điểm đầu sóng trước" },
      { id: "etr-diverge", severity: "hard", pass: diverge, text: "Hai đường A-C và B-D phân kỳ" },
      { id: "etr-dir", severity: "soft", pass: s * (e.price - c.price) > 0 === s * (a.price - o.price) > 0, text: "E cùng hướng A" },
    ], labels),
  ]);
}

// ───────────────────────────── Luân phiên ─────────────────────────────
export type AlternationTag = "Sharp" | "Sideways";
/** Sóng 2 / 4: "Sharp" (zigzag, hồi sâu ≥ 50%) hay "Sideways" (flat / tam giác / kép, hồi nông). */
export function alternationTag(fit0: PatternFit | null, retrace: number): AlternationTag {
  if (fit0?.valid && (fit0.tag === "ZZ" || fit0.tag === "DZ")) return "Sharp";
  if (fit0?.valid && ["FL", "EX-FL", "RFL", "TR", "RTR", "ETR", "D3", "T3"].includes(fit0.tag)) return "Sideways";
  return retrace >= 0.5 ? "Sharp" : "Sideways";
}

// ───────────────────────────── Sóng con (zigzag mịn) ─────────────────────────────
/** Pivot bên trong đoạn [a, b] bằng zigzag mịn (ngưỡng = pct): điểm đầu a, các pivot đã xác nhận ở giữa, điểm cuối b. */
export function innerPivots(candles: ElliottCandle[], a: PatternPoint, b: PatternPoint, pct: number): PatternPoint[] {
  const seg = candles.slice(a.i, b.i + 1);
  if (seg.length < 5) return [a, b];
  const inner = zigzag(seg, { pct }).filter((p) => p.i > 0 && p.i < seg.length - 1 && p.confirmed)
    .map((p) => ({ i: p.i + a.i, price: p.price, time: String(p.time) }));
  // giữ xen kẽ hợp lệ: bỏ pivot trùng hướng với điểm liền trước
  const out: PatternPoint[] = [a];
  for (const p of [...inner, b]) {
    const prev = out[out.length - 1], prev2 = out[out.length - 2];
    if (prev2 && Math.sign(prev.price - prev2.price) === Math.sign(p.price - prev.price)) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Thang ngưỡng zigzag mịn thử lần lượt: ngưỡng gốc, mịn hơn (sóng điều chỉnh nhanh), rồi thô hơn (đoạn nhiều nhiễu). */
export const SEGMENT_PCT_LADDER = [1, 0.6, 0.35, 1.6, 2.5] as const;

/**
 * Phân loại một đoạn điều chỉnh [a, b] theo cấu trúc bên trong (zigzag mịn): 3 chặng -> ZZ/FL/EX-FL/RFL/D3,
 * 5 chặng -> tam giác (hoặc 3 chặng ở bậc thô hơn), 7 chặng -> DZ / D3. Ngưỡng đầu tiên trong SEGMENT_PCT_LADDER cho ra
 * 3 / 5 / 7 chặng được dùng (đo DW4 lần 1: ngưỡng cố định chỉ phân loại được ~17% sóng 2/4). Rỗng nếu không ngưỡng nào khớp.
 */
export function classifyCorrectionSegment(candles: ElliottCandle[], a: PatternPoint, b: PatternPoint, pct: number): { fits: PatternFit[]; points: PatternPoint[]; pct: number | null } {
  for (const m of SEGMENT_PCT_LADDER) {
    const q = pct * m;
    const pts = innerPivots(candles, a, b, q);
    const legs = pts.length - 1;
    const subCount = (x: PatternPoint, y: PatternPoint) => { const n = innerPivots(candles, x, y, q * 0.5).length - 1; return n >= 3 ? (n >= 5 ? 5 : 3) : null; };
    if (legs === 3) return { fits: classifyThreeLeg(pts[0], pts[1], pts[2], pts[3], { aWaves: subCount(pts[0], pts[1]), cWaves: subCount(pts[2], pts[3]) }), points: pts, pct: q };
    if (legs === 5) return { fits: classifyTriangle(pts), points: pts, pct: q };
    if (legs === 7) return { fits: classifySevenLeg(pts), points: pts, pct: q };
  }
  return { fits: [], points: [a, b], pct: null };
}

/**
 * Kiểm định DW4 (đăng ký trước 23/10/2026, 60 mã Siêu Quét, 1.076 cấu trúc, không nhìn trước, mỗi cấu trúc đếm một lần):
 *   H1 "tam giác ở sóng 4 -> sóng 5 vượt sóng 3 trong 40 phiên": lần đo 2 cho +17 điểm % (CI 95% +5,9…+28,9) NHƯNG là giả —
 *   các ca "tam giác chạy" có giá trong sóng 4 đã vượt đỉnh sóng 3 (cách đếm không nhất quán). Chỉ giữ cách đếm nhất quán:
 *   còn 3 ca, 0 vượt -> KHÔNG ĐẠT (thiếu mẫu). H2 luân phiên: 60,1% cấu trúc đạt (mô tả).
 *   Phát hiện phụ: ~11% cách đếm sóng 5 của engine có đỉnh/đáy không phải cực trị -> quy tắc cứng "pivot-extreme" gắn cờ.
 */
export const DW4_VALIDATION = {
  summary: "Kiểm định DW4 (60 mã, 1.076 cấu trúc): tam giác sóng 4 → sóng 5 vượt sóng 3 KHÔNG ĐẠT khi chỉ giữ cách đếm nhất quán (còn 3 ca). Luân phiên đạt ở 60% cấu trúc. Thẻ mô hình chỉ để mô tả.",
  structures: 1076, h1: { pass: false, consistentTriangles: 3 }, alternationRate: 0.601, inconsistentShare: 0.11,
} as const;
