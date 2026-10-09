// Đếm sóng theo Elliott Oscillator (E2) — phương pháp cốt lõi của sách GET (T-13…T-20), chạy SONG SONG với đếm hình học
// (zigzag). Chỉ dùng dữ liệu ≤ nến cuối. Tham số cố định theo sách, không dò trên dữ liệu:
//   1. Sóng 3 = đỉnh dao động mạnh nhất trong 150 nến gần nhất VƯỢT dải bứt phá 80% (T-20). Giá sóng 3 = cực trị giá quanh đỉnh đó.
//   2. Dao động rơi dưới 50% đỉnh -> sóng 4 đang hình thành; kéo về ≥ 90% (phía đối diện ≤ 38%) -> điều kiện sóng 4 đạt (T-15/16).
//   3. Sau khi sóng 4 đạt, giá bật khỏi đáy và dao động đi lên lại -> sóng 5; đỉnh dao động mới < đỉnh sóng 3 = phân kỳ (T-19).
//   4. Sau đỉnh/đáy sóng 5: dao động đổi chiều qua 0, vượt dải phía ngược lại, hoặc giá về cực trị sóng 4 -> sau sóng 5.
//   Dao động sang phía đối diện > 38% trước khi có sóng 5 -> cách đếm không còn (sóng 3 mới ngược chiều có thể đã bắt đầu).
import { breakoutBands, elliottOscillator } from "./elliottGet.js";
import type { OhlcvBar } from "../../ta-command-center/types";

export const OSC_COUNT = { lookback: 150, retrace: 0.9, wave4Start: 0.5, maxOpposite: 0.38 } as const;

export interface OscPoint { date: string; i: number; price: number; osc: number }
export interface OscCount {
  wave: "3" | "4" | "5" | "post" | "none";
  dir: "up" | "down" | null;
  label: string;
  w3: OscPoint | null;
  w4: OscPoint | null;
  w5: OscPoint | null;
  /** Đỉnh dao động sóng 5 thấp hơn sóng 3 (chỉ khi đã có sóng 5). */
  divergence: boolean | null;
  /** Dao động hiện tại so với đỉnh sóng 3 (cùng chiều = dương). */
  oscRatio: number | null;
}

const NONE: OscCount = { wave: "none", dir: null, label: "Dao động chưa có đỉnh sóng 3 vượt dải 80%", w3: null, w4: null, w5: null, divergence: null, oscRatio: null };

export function oscillatorCount(bars: OhlcvBar[]): OscCount {
  const n = bars.length;
  if (n < 60) return NONE;
  const c = bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const osc = elliottOscillator(c, 5, 35), band = breakoutBands(osc, { pct: 0.8, lookback: 100 });
  // 1. Đỉnh dao động mạnh nhất (giá trị tuyệt đối) trong cửa sổ, phải vượt dải cùng phía.
  let k3 = -1;
  for (let i = Math.max(35, n - OSC_COUNT.lookback); i < n; i++) {
    const v = osc[i]; if (!Number.isFinite(v)) continue;
    const b = v > 0 ? band.up[i] : band.lo[i];
    if (!(b !== 0 && Math.abs(v) > Math.abs(b))) continue;
    if (k3 < 0 || Math.abs(v) > Math.abs(osc[k3])) k3 = i;
  }
  if (k3 < 0) return NONE;
  const s = osc[k3] > 0 ? 1 : -1, dir = s > 0 ? "up" : "down", dv = s > 0 ? "tăng" : "giảm";
  const pk = s * osc[k3], so = (i: number) => s * osc[i];
  const ext = (i: number) => (s > 0 ? bars[i].high : bars[i].low), opp = (i: number) => (s > 0 ? bars[i].low : bars[i].high);
  const better = (a: number, b: number) => s * a > s * b;
  // Giá sóng 3: cực trị giá từ lần dao động cắt 0 gần nhất trước đỉnh tới khi dao động rơi dưới 50% đỉnh (hoặc nến cuối).
  let z = k3; while (z > 0 && so(z - 1) > 0) z--;
  let e4 = n; for (let i = k3 + 1; i < n; i++) if (so(i) < OSC_COUNT.wave4Start * pk) { e4 = i; break; }
  let w3i = z; for (let i = z; i < Math.min(n, e4 + 1); i++) if (better(ext(i), ext(w3i))) w3i = i;
  const P = (i: number): OscPoint => ({ date: bars[i].date, i, price: i === w3i ? ext(i) : opp(i), osc: osc[i] });
  const w3: OscPoint = { date: bars[w3i].date, i: w3i, price: ext(w3i), osc: osc[k3] };
  const ratio = so(n - 1) / pk;
  const base = { dir, w3, divergence: null, oscRatio: ratio } as const;
  if (e4 >= n) return { ...base, wave: "3", label: `Theo dao động: sóng 3 ${dv} (dao động còn ${Math.round(ratio * 100)}% đỉnh)`, w4: null, w5: null };
  // 2. Sóng 4: dao động kéo về ≥ 90%; phía đối diện quá 38% -> mất cách đếm.
  let r = -1, worst = Infinity;
  for (let i = k3 + 1; i < n; i++) {
    worst = Math.min(worst, so(i));
    if (worst < -OSC_COUNT.maxOpposite * pk) return { ...NONE, label: `Dao động sang phía ngược lại > 38% sau đỉnh sóng 3 ${dv} — cách đếm không còn`, oscRatio: ratio };
    if (r < 0 && so(i) <= (1 - OSC_COUNT.retrace) * pk) r = i;
    if (r >= 0 && i > r && so(i) > so(i - 1) && so(i - 1) <= so(r)) break; // dao động bắt đầu đi lên lại
  }
  let w4i = w3i; for (let i = w3i; i < n; i++) { if (better(opp(w4i), opp(i))) w4i = i; if (r >= 0 && i > r && better(ext(i), ext(w3i))) break; }
  const w4 = P(w4i);
  if (r < 0) return { ...base, wave: "4", label: `Theo dao động: sóng 4 (điều chỉnh sau sóng 3 ${dv}) — dao động mới về ${Math.round((1 - ratio) * 100)}%, chưa đủ 90%`, w4, w5: null };
  // 3. Sóng 5: sau khi đạt điều kiện sóng 4, dao động đi lên lại và giá rời đáy sóng 4.
  let up = -1; for (let i = Math.max(r, w4i) + 1; i < n; i++) if (so(i) > so(i - 1) && better(ext(i), ext(i - 1)) && better(bars[i].close, opp(w4i))) { up = i; break; }
  if (up < 0) return { ...base, wave: "4", label: `Theo dao động: sóng 4 (sau sóng 3 ${dv}) đã kéo dao động về ≥ 90% — chờ giá bật lên (sóng 5)`, w4, w5: null };
  let w5i = up, pk5 = -Infinity;
  for (let i = up; i < n; i++) { if (better(ext(i), ext(w5i))) w5i = i; pk5 = Math.max(pk5, so(i)); }
  const divergence = pk5 < pk;
  const w5: OscPoint = { date: bars[w5i].date, i: w5i, price: ext(w5i), osc: osc[w5i] };
  // 4. Sau sóng 5: dao động vượt dải phía ngược lại, hoặc giá quay về cực trị sóng 4 (mục tiêu đầu tiên của điều chỉnh, T-19).
  let sameSide = false; for (let i = up; i <= w5i; i++) if (so(i) > 0) { sameSide = true; break; }
  for (let i = w5i + 1; i < n; i++) {
    if (so(i) > 0) sameSide = true;
    else if (sameSide && so(i) < 0)
      return { ...base, wave: "post", label: `Theo dao động: đã qua sóng 5 ${dv} — dao động đổi chiều qua 0 sau ${s > 0 ? "đỉnh" : "đáy"} sóng 5`, w4, w5, divergence };
    const b = s > 0 ? band.lo[i] : band.up[i];
    if (b !== 0 && s * osc[i] < 0 && Math.abs(osc[i]) > Math.abs(b))
      return { ...base, wave: "post", label: `Theo dao động: đã qua sóng 5 ${dv} — dao động vượt dải phía ngược lại (điều chỉnh A)`, w4, w5, divergence };
    if (!better(opp(i), w4.price))
      return { ...base, wave: "post", label: `Theo dao động: đã qua sóng 5 ${dv} — giá về lại cực trị sóng 4 (điều chỉnh)`, w4, w5, divergence };
  }
  return { ...base, wave: "5", label: `Theo dao động: sóng 5 ${dv}${divergence ? " — có phân kỳ so với sóng 3" : " — dao động chưa phân kỳ"}`, w4, w5, divergence };
}

/** So khớp đếm dao động với đếm hình học (cùng chiều + cùng sóng; A/B/C hình học ≈ "post"). */
export function oscAgreement(osc: OscCount, geo: { wave: string; dir: "up" | "down" | null } | null): "match" | "differ" | "na" {
  if (!geo || osc.wave === "none" || geo.wave === "none" || !geo.dir) return "na";
  const g = ["A", "B", "C", "post"].includes(geo.wave) ? "post" : geo.wave;
  return g === osc.wave && geo.dir === osc.dir ? "match" : "differ";
}
