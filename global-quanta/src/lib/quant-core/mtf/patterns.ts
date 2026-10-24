// @gq/quant-core · MTF — mẫu hình đảo chiều trên sóng trung: 2 đáy (W), 2 đỉnh (M), vai-đầu-vai ngược (IHS), vai-đầu-vai (HS).
// v2 = bản port của detect_patterns() trong tài liệu gốc (mtf_market_structure.py): sai số 0,8 ATR, viền cổ ≥ 1,5 ATR, viền cổ
// quá dốc -> viền cổ ngang tại cổ gần nhất, mẫu đáy phải bắt đầu DƯỚI MA chân trên (mẫu đỉnh: TRÊN), phá cổ trong 60 nến.
// Mẫu TỒN TẠI từ nến xác nhận điểm cuối (confirmedIndex) — "đang hình thành"; "đã phá cổ" khi ĐÓNG CỬA vượt viền cổ;
// "hết hạn" khi quá thời gian chờ. Thêm (P2): vị trí của mẫu trên cẳng sóng (context) và "thành công" (followIndex). Không nhìn trước.
import type { Bar } from "../math";
import type { Pattern, PatternContext, PatternStatus, Swing, TfParams } from "./types";

const neckAt = (nk: Pattern["neck"], j: number) =>
  nk.i1 === nk.i0 ? nk.p0 : nk.p0 + ((nk.p1 - nk.p0) * (j - nk.i0)) / (nk.i1 - nk.i0);

export interface PatternInputs { maSlow: number[]; slope: number[]; maFast: number }

type P = Pick<TfParams, "patternTol" | "neckMinAtr" | "neckMaxSlopeAtr" | "breakBars">;

/** Vị trí của mẫu: mẫu đáy trong xu hướng tăng = tái tích lũy; mẫu đỉnh khi Dow tăng còn nguyên trên MA đang lên = ngược xu hướng. */
function contextOf(dir: 1 | -1, lowIdx: number, ready: number, bars: Bar[], x: PatternInputs, dow: number[]): PatternContext {
  if (dir === 1) return x.slope[lowIdx] > 0 ? "reaccum" : "reversal";
  return x.slope[ready] > 0 && bars[ready].close > x.maSlow[ready] && dow[ready] === 1 ? "countertrend" : "reversal";
}

export function detectPatterns(bars: Bar[], atr: number[], mid: Swing[], x: PatternInputs, dow: number[], p: P): Pattern[] {
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const found: Pattern[] = [];
  for (let j = 0; j < mid.length; j++) {
    const last = mid[j];
    const dir: 1 | -1 = last.kind === "L" ? 1 : -1;
    const seq = mid.slice(Math.max(0, j - 4), j + 1);
    const a = Math.max(atr[last.index], 1e-9);
    const tol = p.patternTol * a;
    let pat: Pattern | null = null;
    // Vai–đầu–vai (Sanzon): vai1 – cổ1 – ĐẦU – cổ2 – vai2 (sóng xen kẽ đỉnh / đáy)
    if (seq.length === 5 && seq[0].kind === last.kind && seq[2].kind === last.kind) {
      const [s1, n1, hd, n2, s2] = seq;
      if (dir * (s1.price - hd.price) > tol * 0.5 && dir * (s2.price - hd.price) > tol * 0.5) {
        const steep = Math.abs(n2.price - n1.price) > p.neckMaxSlopeAtr * a;
        const neck = steep ? { i0: n2.index, p0: n2.price, i1: n2.index, p1: n2.price } : { i0: n1.index, p0: n1.price, i1: n2.index, p1: n2.price };
        pat = {
          type: dir === 1 ? "IHS" : "HS", dir, context: "reversal",
          points: [
            { index: s1.index, price: s1.price, label: "Vai trái" }, { index: n1.index, price: n1.price, label: "Cổ" },
            { index: hd.index, price: hd.price, label: "Đầu" }, { index: n2.index, price: n2.price, label: "Cổ" },
            { index: s2.index, price: s2.price, label: "Vai phải" },
          ],
          neck, start: s1.index, confirmedIndex: s2.confirmedIndex, breakIndex: null, failIndex: null, followIndex: null, height: 0, target: 0,
        };
      }
    }
    // Hai đáy W / hai đỉnh M: đáy1 – cổ – đáy2 (đáy 2 không thấp hơn đáy 1 quá sai số, lệch nhau ≤ 3 lần sai số)
    if (!pat && seq.length >= 3) {
      const [b1, nk, b2] = seq.slice(-3);
      if (b1.kind === last.kind && dir * (b2.price - b1.price) >= -tol && Math.abs(b2.price - b1.price) <= 3 * tol) {
        pat = {
          type: dir === 1 ? "W" : "M", dir, context: "reversal",
          points: [
            { index: b1.index, price: b1.price, label: dir === 1 ? "Đáy 1" : "Đỉnh 1" }, { index: nk.index, price: nk.price, label: "Cổ" },
            { index: b2.index, price: b2.price, label: dir === 1 ? "Đáy 2" : "Đỉnh 2" },
          ],
          neck: { i0: nk.index, p0: nk.price, i1: nk.index, p1: nk.price },
          start: b1.index, confirmedIndex: b2.confirmedIndex, breakIndex: null, failIndex: null, followIndex: null, height: 0, target: 0,
        };
      }
    }
    if (!pat) continue;
    // Độ sâu: viền cổ phải cách cực trị xa nhất ≥ neckMinAtr·ATR
    const extremes = pat.points.filter((q) => q.label !== "Cổ");
    const ext = extremes.reduce((m, q) => (dir === 1 ? (q.price < m.price ? q : m) : (q.price > m.price ? q : m)));
    const lastPt = pat.points[pat.points.length - 1];
    if (dir * (neckAt(pat.neck, lastPt.index) - ext.price) < p.neckMinAtr * a) continue;
    // Bối cảnh (như hình): mẫu ĐÁY xuất hiện sau nhịp giảm (điểm đầu dưới MA chân trên), mẫu ĐỈNH sau nhịp tăng (điểm đầu trên MA)
    const first = pat.points[0], m4 = x.maSlow[first.index];
    if (!Number.isFinite(m4) || dir * (m4 - first.price) <= 0) continue;
    pat.height = Math.abs(neckAt(pat.neck, ext.index) - ext.price);
    pat.target = neckAt(pat.neck, lastPt.index) + dir * pat.height;
    pat.context = contextOf(dir, ext.index, Math.min(n - 1, pat.confirmedIndex), bars, x, dow);
    // Nến phá viền cổ (đóng cửa vượt lên / thủng xuống) trong breakBars nến; quá hạn -> hết hạn
    const ready = pat.confirmedIndex;
    for (let i = ready; i < Math.min(n, ready + p.breakBars); i++) if (dir * (close[i] - neckAt(pat.neck, i)) > 0) { pat.breakIndex = i; break; }
    if (pat.breakIndex == null && ready + p.breakBars <= n - 1) pat.failIndex = ready + p.breakBars;
    // "Thành công" (tài liệu): sau phá cổ, giá sang hẳn phía bên kia MA chân trên VÀ MA chân trên đổi hướng theo, trong 3·MA nhanh nến
    if (pat.breakIndex != null) {
      for (let i = pat.breakIndex; i < Math.min(n, pat.breakIndex + 3 * x.maFast); i++) {
        if (Number.isFinite(x.maSlow[i]) && dir * (close[i] - x.maSlow[i]) > 0 && dir * x.slope[i] > 0) { pat.followIndex = i; break; }
      }
    }
    found.push(pat);
  }
  // Bỏ trùng (như bản gốc): cùng chiều + cùng nến phá (hoặc cùng nến xác nhận nếu chưa phá) -> giữ mẫu đầu, vai–đầu–vai thay hai đáy/đỉnh.
  const uniq = new Map<string, Pattern>();
  for (const pt of found) {
    const key = `${pt.dir}|${pt.breakIndex ?? `x${pt.confirmedIndex}`}`;
    const cur = uniq.get(key);
    if (!cur || ((pt.type === "IHS" || pt.type === "HS") && (cur.type === "W" || cur.type === "M"))) uniq.set(key, pt);
  }
  return [...uniq.values()].sort((a, b) => a.confirmedIndex - b.confirmedIndex);
}

/** Trạng thái mẫu tại nến t (null = chưa tồn tại). "failed" = hết hạn chờ phá cổ. */
export function patternStatusAt(p: Pattern, t: number): PatternStatus | null {
  if (p.confirmedIndex > t) return null;
  if (p.breakIndex != null && p.breakIndex <= t) return "confirmed";
  if (p.failIndex != null && p.failIndex <= t) return "failed";
  return "forming";
}

export const PATTERN_NAME: Record<Pattern["type"], string> = {
  W: "Hai đáy (W)", M: "Hai đỉnh (M)", IHS: "Vai–đầu–vai ngược", HS: "Vai–đầu–vai (Sanzon)",
};

export const PATTERN_CONTEXT_TEXT: Record<PatternContext, { short: string; text: string }> = {
  reversal: { short: "đảo chiều", text: "Xuất hiện sau một nhịp xu hướng đã chững — đúng vị trí của mẫu đảo chiều." },
  reaccum: { short: "tái tích lũy", text: "Mẫu đáy trong xu hướng tăng (MA chân trên dốc lên) — nền tái tích lũy [B], thuận xu hướng." },
  countertrend: { short: "ngược xu hướng", text: "Mẫu đỉnh giữa xu hướng tăng còn nguyên (Dow tăng, MA dốc lên) — theo tài liệu, bán theo mẫu này lợi thế thấp." },
};
export { neckAt };
