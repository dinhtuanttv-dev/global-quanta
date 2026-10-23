// DW10 — gợi ý mốc cảnh báo từ cách đếm đang vẽ (tự động hoặc chỉnh tay). Hàm thuần; máy chủ chỉ so giá với điều kiện.
import type { ElliottState } from "./index";
import { elliottChannels, lineAt } from "./channels";
import { userInvalidation, type UserCountPoint } from "./userCount";

export type AlertCondition =
  | { type: "level"; price: number; side: "above" | "below" }
  | { type: "zone"; low: number; high: number }
  | { type: "line"; a: { date: string; price: number }; b: { date: string; price: number }; side: "above" | "below" };
export interface AlertSuggestion { key: string; kind: "invalidation" | "target" | "channel"; label: string; condition: AlertCondition }

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

/** Mốc vô hiệu · vùng đích (cửa sổ sóng 5 / vùng (2)/(B) 50–61,8% / vùng sóng 4) · đường kênh (chỉ khung ngày). */
export function suggestAlerts(st: ElliottState | null, opts: { mine?: UserCountPoint[] | null; dailyBars?: { date: string; close: number }[] | null } = {}): AlertSuggestion[] {
  const out: AlertSuggestion[] = [];
  if (opts.mine?.length) {
    const inv = userInvalidation(opts.mine);
    if (inv) out.push({ key: "mine-inv", kind: "invalidation", label: `Vô hiệu (cách đếm của tôi): ${inv.reason}`, condition: { type: "level", price: inv.price, side: inv.side } });
    return out;
  }
  if (!st || !st.dir) return out;
  const s = st.dir === "up" ? 1 : -1;
  if (st.invalidation) out.push({ key: "inv", kind: "invalidation", label: `Vô hiệu ${fmt(st.invalidation.price)} — ${st.invalidation.reason}`, condition: { type: "level", price: st.invalidation.price, side: st.invalidation.side } });
  const sc = st.scenario;
  if (sc && st.wave === "5") {
    const w = sc.targets.wave5.window03;
    out.push({ key: "w5-window", kind: "target", label: `Vào cửa sổ sóng 5 ${fmt(Math.min(w.low, w.high))}–${fmt(Math.max(w.low, w.high))}`, condition: { type: "zone", low: Math.min(w.low, w.high), high: Math.max(w.low, w.high) } });
  } else if (sc && sc.points[5]?.confirmed) {
    const len = sc.points[5].price - sc.points[0].price;
    const a = sc.points[5].price - 0.5 * len, b = sc.points[5].price - 0.618 * len;
    out.push({ key: "b-zone", kind: "target", label: `Vào vùng (2)/(B) 50–61,8% ${fmt(Math.min(a, b))}–${fmt(Math.max(a, b))}`, condition: { type: "zone", low: Math.min(a, b), high: Math.max(a, b) } });
  } else if (!sc && st.wave === "3") {
    const z = st.levels.filter((l) => l.label.startsWith("Vùng sóng 4"));
    if (z.length >= 2) out.push({ key: "w4-zone", kind: "target", label: `Vào vùng sóng 4 tương lai ${fmt(Math.min(z[0].price, z[1].price))}–${fmt(Math.max(z[0].price, z[1].price))}`, condition: { type: "zone", low: Math.min(z[0].price, z[1].price), high: Math.max(z[0].price, z[1].price) } });
  }
  // Đường kênh: khung ngày, kết quả khớp nến cuối — Final Channel (2–4) nếu có, ngược lại Base Channel (đường song song qua 1).
  const bars = opts.dailyBars;
  if (bars && bars.length >= st.barCount && bars[bars.length - 1].date === st.asOf) {
    const off = bars.length - st.barCount;
    const chs = elliottChannels(st, bars.slice(off).map((b) => b.close));
    const fin = chs.find((c) => c.kind === "final" && !c.trigger), base = chs.find((c) => c.kind === "base" && !c.trigger);
    const pick = fin ? { ch: fin, line: fin.main, side: (s > 0 ? "below" : "above") as "above" | "below", text: "Thủng đường 2–4 (Final Channel)" }
      : base ? { ch: base, line: base.parallel, side: (s > 0 ? "above" : "below") as "above" | "below", text: "Vượt Base Channel (kích hoạt sóng 3)" } : null;
    if (pick) {
      const i0 = pick.ch.from, i1 = st.barCount - 1;
      const a = { date: bars[off + i0].date, price: lineAt(pick.line, i0) }, b = { date: bars[off + i1].date, price: lineAt(pick.line, i1) };
      if (a.date < b.date) out.push({ key: `ch-${pick.ch.kind}`, kind: "channel", label: pick.text, condition: { type: "line", a, b, side: pick.side } });
    }
  }
  return out;
}
