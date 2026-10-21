// @gq/quant-core · MTF — mẫu hình đảo chiều trên sóng trung: 2 đáy (W), 2 đỉnh (M), vai-đầu-vai ngược (IHS), vai-đầu-vai (HS).
// Mẫu TỒN TẠI từ nến xác nhận điểm cuối (confirmedIndex) ở trạng thái "đang hình thành"; "đã xác nhận" khi ĐÓNG CỬA
// phá viền cổ (breakIndex); "thất bại" khi đóng cửa vượt cực trị của mẫu trước đó (failIndex). Không nhìn trước.
import type { Bar } from "../math";
import type { Pattern, PatternStatus, Swing } from "./types";

export interface PatternParams {
  eqAtr: number;          // hai đáy/đỉnh "bằng nhau" trong ±eqAtr·ATR
  shoulderAtr: number;    // hai vai lệch nhau ≤ shoulderAtr·ATR
  neckMinAtr: number;     // độ cao tối thiểu từ viền cổ (ATR)
  neckMaxSlopeAtr: number;// viền cổ IHS/HS: chênh lệch hai điểm cổ ≤ x·ATR
  waitMult: number;       // chờ phá cổ tối đa = waitMult × độ rộng mẫu
}
export const PATTERN_PARAMS: PatternParams = { eqAtr: 1.0, shoulderAtr: 1.5, neckMinAtr: 1.5, neckMaxSlopeAtr: 1.5, waitMult: 1.5 };

const neckAt = (nk: Pattern["neck"], j: number) =>
  nk.i1 === nk.i0 ? nk.p0 : nk.p0 + ((nk.p1 - nk.p0) * (j - nk.i0)) / (nk.i1 - nk.i0);

/** Theo dõi từ nến xác nhận đến khi phá cổ / thất bại / hết thời gian chờ. */
function resolve(bars: Bar[], p: Pattern, extreme: number, width: number, pp: PatternParams): void {
  const last = Math.min(bars.length - 1, p.confirmedIndex + Math.max(10, Math.round(width * pp.waitMult)));
  for (let j = p.confirmedIndex; j <= last; j++) {
    const c = bars[j].close;
    const nk = neckAt(p.neck, j);
    if (p.dir === 1 ? c > nk : c < nk) { p.breakIndex = j; return; }
    if (p.dir === 1 ? c < extreme : c > extreme) { p.failIndex = j; return; }
  }
  if (last < bars.length - 1) p.failIndex = last + 1; // hết hạn chờ
}

export function detectPatterns(bars: Bar[], atr: number[], mid: Swing[], pp: PatternParams = PATTERN_PARAMS): Pattern[] {
  const out: Pattern[] = [];
  for (let k = 2; k < mid.length; k++) {
    const s2 = mid[k], s1 = mid[k - 1], s0 = mid[k - 2];
    const a = Math.max(atr[s2.index], 1e-9);
    const conf = s2.confirmedIndex;
    // ---- W / M: đáy–đỉnh–đáy hoặc đỉnh–đáy–đỉnh, có bối cảnh xu hướng trước đó
    if (s0.kind === s2.kind && Math.abs(s2.price - s0.price) <= pp.eqAtr * a) {
      const prev = k >= 3 ? mid[k - 3] : null;
      const dir: 1 | -1 = s0.kind === "L" ? 1 : -1;
      const ext = dir === 1 ? Math.min(s0.price, s2.price) : Math.max(s0.price, s2.price);
      const height = Math.abs(s1.price - ext);
      const ctx = prev ? (dir === 1 ? prev.price > s1.price : prev.price < s1.price) : false;
      if (height >= pp.neckMinAtr * a && ctx) {
        const p: Pattern = {
          type: dir === 1 ? "W" : "M", dir,
          points: [
            { index: s0.index, price: s0.price, label: dir === 1 ? "Đáy 1" : "Đỉnh 1" },
            { index: s1.index, price: s1.price, label: "Cổ" },
            { index: s2.index, price: s2.price, label: dir === 1 ? "Đáy 2" : "Đỉnh 2" },
          ],
          neck: { i0: s1.index, p0: s1.price, i1: s1.index, p1: s1.price },
          start: prev ? prev.index : s0.index, confirmedIndex: conf, breakIndex: null, failIndex: null,
          height, target: s1.price + dir * height,
        };
        resolve(bars, p, ext, s2.index - s0.index, pp);
        out.push(p);
      }
    }
    // ---- IHS / HS: vai–cổ–đầu–cổ–vai
    if (k >= 4) {
      const L1 = mid[k - 4], N1 = mid[k - 3], Hd = mid[k - 2], N2 = mid[k - 1], L3 = s2;
      if (L1.kind === L3.kind && Hd.kind === L1.kind) {
        const dir: 1 | -1 = L1.kind === "L" ? 1 : -1;
        const headBeyond = dir === 1 ? Hd.price < L1.price && Hd.price < L3.price : Hd.price > L1.price && Hd.price > L3.price;
        const shouldersEq = Math.abs(L1.price - L3.price) <= pp.shoulderAtr * a;
        const neckFlat = Math.abs(N1.price - N2.price) <= pp.neckMaxSlopeAtr * a;
        const neck = { i0: N1.index, p0: N1.price, i1: N2.index, p1: N2.price };
        const height = Math.abs(neckAt(neck, Hd.index) - Hd.price);
        if (headBeyond && shouldersEq && neckFlat && height >= pp.neckMinAtr * a) {
          const nkEnd = neckAt(neck, L3.index);
          const p: Pattern = {
            type: dir === 1 ? "IHS" : "HS", dir,
            points: [
              { index: L1.index, price: L1.price, label: "Vai trái" },
              { index: N1.index, price: N1.price, label: "Cổ" },
              { index: Hd.index, price: Hd.price, label: "Đầu" },
              { index: N2.index, price: N2.price, label: "Cổ" },
              { index: L3.index, price: L3.price, label: "Vai phải" },
            ],
            neck, start: L1.index, confirmedIndex: conf, breakIndex: null, failIndex: null,
            height, target: nkEnd + dir * height,
          };
          resolve(bars, p, Hd.price, L3.index - L1.index, pp);
          out.push(p);
        }
      }
    }
  }
  return out;
}

/** Trạng thái mẫu tại nến t (null = chưa tồn tại). */
export function patternStatusAt(p: Pattern, t: number): PatternStatus | null {
  if (p.confirmedIndex > t) return null;
  if (p.breakIndex != null && p.breakIndex <= t) return "confirmed";
  if (p.failIndex != null && p.failIndex <= t) return "failed";
  return "forming";
}

export const PATTERN_NAME: Record<Pattern["type"], string> = {
  W: "Hai đáy (W)", M: "Hai đỉnh (M)", IHS: "Vai–đầu–vai ngược", HS: "Vai–đầu–vai",
};
export { neckAt };
