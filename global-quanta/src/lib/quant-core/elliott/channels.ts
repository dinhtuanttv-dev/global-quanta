// DW5 (23/10/2026) — kênh Elliott & điểm kích hoạt theo quy ước của bộ phác đồ tham khảo (song+ fibo):
//   Base Channel   — đường 0–2, song song qua đỉnh/đáy 1; giá ĐÓNG CỬA vượt đường song song => kích hoạt sóng 3 (vòng tròn).
//   Final Channel  — đường 2–4, song song qua 3; sau cực trị sóng 5, đóng cửa thủng đường 2–4 => sóng 5 có thể đã xong.
//   Corrective Ch. — nối điểm bắt đầu điều chỉnh (5) với B, song song qua A; đóng cửa vượt đường 5–B => điều chỉnh có thể đã xong.
// Hàm thuần trên chỉ số nến của CỬA SỔ engine (ElliottState.barCount). Điểm kích hoạt là nến đầu tiên thoả điều kiện —
// chỉ dùng dữ liệu tới chính nến đó (không vẽ lại khi có nến mới).
import type { ElliottState } from "./index";

export interface ChannelPoint { i: number; price: number }
export interface ElliottChannelLine { a: ChannelPoint; slope: number }
export type ChannelKind = "base" | "final" | "corrective";
export interface ElliottChannelGeom {
  kind: ChannelKind;
  label: string;
  /** Đường nối hai điểm cùng loại (0–2 · 2–4 · 5–B) và đường song song (qua 1 · 3 · A). */
  main: ElliottChannelLine;
  parallel: ElliottChannelLine;
  /** Khoảng chỉ số nến vẽ kênh. */
  from: number;
  to: number;
  trigger: { i: number; price: number; note: string } | null;
}

export const CHANNEL_LABEL: Record<ChannelKind, string> = { base: "Base Channel", final: "Final Channel", corrective: "Corrective Channel" };

export const lineAt = (l: ElliottChannelLine, i: number) => l.a.price + l.slope * (i - l.a.i);
const through = (a: ChannelPoint, b: ChannelPoint): ElliottChannelLine => ({ a, slope: (b.price - a.price) / Math.max(1, b.i - a.i) });

/** Nến đầu tiên trong (from, to] có giá đóng cửa vượt `line` theo hướng `dir` (+1: lên trên đường, −1: xuống dưới). */
function firstClose(closes: number[], line: ElliottChannelLine, from: number, to: number, dir: 1 | -1): number | null {
  for (let i = from + 1; i <= to && i < closes.length; i++) if (dir * (closes[i] - lineAt(line, i)) > 0) return i;
  return null;
}

/**
 * Kênh của cách đếm `st`. `closes` = giá đóng cửa của cửa sổ engine (cùng chỉ số với pivot). Trả các kênh còn ý nghĩa với
 * trạng thái hiện tại: base (sóng 1–3), final (sóng 3–5 và ngay sau sóng 5), corrective (đang điều chỉnh A-B-C sau sóng 5).
 */
export function elliottChannels(st: ElliottState | null, closes: number[]): ElliottChannelGeom[] {
  if (!st || !st.dir || closes.length !== st.barCount) return [];
  const s: 1 | -1 = st.dir === "up" ? 1 : -1;
  const L = st.barCount - 1;
  const out: ElliottChannelGeom[] = [];
  const sc = st.scenario;
  const pts: ChannelPoint[] = sc ? sc.points.map((p) => ({ i: p.i, price: p.price }))
    : st.wave === "3" ? st.pivots.slice(-4).map((p) => ({ i: p.i, price: p.price })) : [];
  if (pts.length >= 3) {
    const main = through(pts[0], pts[2]);
    const parallel = { a: pts[1], slope: main.slope };
    const to = pts[3] && pts.length >= 5 ? pts[3].i : L;
    const t = firstClose(closes, parallel, pts[2].i, to, s);
    out.push({ kind: "base", label: CHANNEL_LABEL.base, main, parallel, from: pts[0].i, to,
      trigger: t == null ? null : { i: t, price: closes[t], note: "Đóng cửa vượt Base Channel — xác nhận sóng 3" } });
  }
  if (sc && pts.length >= 5) {
    const main = through(pts[2], pts[4]);
    const parallel = { a: pts[3], slope: main.slope };
    const ext = pts[5]?.i ?? L;
    const t = firstClose(closes, main, Math.max(ext, pts[4].i), L, (-s) as 1 | -1);
    out.push({ kind: "final", label: CHANNEL_LABEL.final, main, parallel, from: pts[2].i, to: t ?? L,
      trigger: t == null ? null : { i: t, price: closes[t], note: "Đóng cửa thủng đường 2–4 sau sóng 5 — sóng 5 có thể đã xong" } });
  }
  const p5 = sc?.points[5];
  if (sc && p5?.confirmed && ["B", "C", "post"].includes(st.wave)) {
    const after = st.pivots.filter((x) => x.i > p5.i && x.ci != null);
    const [A, B, C] = after;
    if (A && B) {
      const main = through({ i: p5.i, price: p5.price }, { i: B.i, price: B.price });
      const parallel = { a: { i: A.i, price: A.price }, slope: main.slope };
      const t = firstClose(closes, main, C ? C.i : B.i, L, s);
      out.push({ kind: "corrective", label: CHANNEL_LABEL.corrective, main, parallel, from: p5.i, to: t ?? L,
        trigger: t == null ? null : { i: t, price: closes[t], note: "Đóng cửa vượt kênh điều chỉnh — điều chỉnh có thể đã xong" } });
    }
  }
  return out;
}
