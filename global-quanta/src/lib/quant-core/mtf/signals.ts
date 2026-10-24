// @gq/quant-core · MTF — 8 tín hiệu Granville (M1–M4 mua, B1–B4 bán) quanh MA chân trên, điểm vào cốt lõi L / S, mua 3 bước (G3),
// R:R tại giá hiện tại và bảng kiểm "lợi thế kỹ thuật" 7 điểm. Tín hiệu xác nhận khi ĐÓNG CỬA nến (confirmedIndex = index).
import type { Bar } from "../math";
import type { Indicators } from "./core";
import type { CheckItem, RrNow, Signal, Swing, TfParams, Zone } from "./types";

const G3_WINDOW = 30;

export const SIGNAL_TEXT: Record<Signal["code"], string> = {
  M1: "Granville 1 – MA chân trên quay lên, giá cắt lên MA",
  M2: "Granville 2 – thủng nhẹ MA chân trên rồi bật lại",
  M3: "Granville 3 – chạm gần MA chân trên không thủng, quay đầu tăng",
  M4: "Granville 4 – quá bán, cách xa MA chân trên — hồi kỹ thuật (ngược xu hướng)",
  B1: "Granville 1 bán – MA chân trên quay xuống, giá cắt xuống MA",
  B2: "Granville 2 bán – vượt nhẹ MA chân trên rồi thất bại",
  B3: "Granville 3 bán – hồi lên gần MA chân trên rồi quay xuống",
  B4: "Granville 4 bán – quá mua, cách xa MA chân trên — dễ điều chỉnh",
  G3: "Mua 3 bước – MA hội tụ → phân kỳ → nhịp hồi đầu tiên",
  L: "L – khung nhỏ phá đỉnh gần nhất sau đáy cao hơn, cùng chiều MA chân trên (điểm vào cốt lõi)",
  S: "S – khung nhỏ thủng đáy gần nhất sau đỉnh thấp hơn, cùng chiều MA chân trên (điểm vào cốt lõi)",
  "KT+": "Đủ lợi thế kỹ thuật mua", "KT-": "Đủ lợi thế kỹ thuật bán",
};

/**
 * Granville 1–4 mua / bán quanh MA chân trên + điểm vào cốt lõi L / S — port của §3c bản Python gốc (cùng điều kiện, cùng giãn
 * cách `cooldown` nến cho mỗi mã tín hiệu). Nến tăng mạnh = đóng cửa > mở cửa VÀ > đỉnh nến trước (ngược lại cho nến giảm).
 * L / S dùng sóng NHỎ đã xác nhận tới nến đó. Thêm G3 (mua 3 bước, từ bộ ảnh). Tín hiệu xác nhận khi ĐÓNG CỬA nến.
 */
export function granville(bars: Bar[], ind: Indicators, small: Swing[], p: TfParams): Signal[] {
  const out: Signal[] = [];
  const last: Partial<Record<Signal["code"], number>> = {};
  const add = (i: number, code: Signal["code"], side: Signal["side"], price: number) => {
    if (i - (last[code] ?? -1e9) < p.cooldown) return;
    last[code] = i;
    out.push({ index: i, confirmedIndex: i, code, side, price, note: SIGNAL_TEXT[code] });
  };
  const sw = [...small].sort((a, b) => a.confirmedIndex - b.confirmedIndex);
  let k = 0;
  let lastH: Swing | null = null, prevH: Swing | null = null, lastL: Swing | null = null, prevL: Swing | null = null;
  let lastWar = -Infinity, lastG3 = -Infinity;
  const win = 3 * p.slopeLen;
  for (let i = 1; i < bars.length; i++) {
    while (k < sw.length && sw[k].confirmedIndex <= i) {
      const s = sw[k++];
      if (s.kind === "H") { prevH = lastH; lastH = s; } else { prevL = lastL; lastL = s; }
    }
    const ma = ind.maSlow[i], maP = ind.maSlow[i - 1], sl = ind.slope[i], a = ind.atr[i];
    if (![ma, maP, sl, a, ind.atr[i - 1]].every(Number.isFinite)) continue;
    const b = bars[i], pb = bars[i - 1], C = b.close, Cp = pb.close;
    if (Math.abs(ind.spread[i]) <= p.warAtr) lastWar = i;
    const crossUp = Cp <= maP && C > ma, crossDn = Cp >= maP && C < ma;
    let mn = Infinity, mx = -Infinity;
    for (let j = Math.max(0, i - win); j < i; j++) if (Number.isFinite(ind.slope[j])) { mn = Math.min(mn, ind.slope[j]); mx = Math.max(mx, ind.slope[j]); }
    const turnUp = sl > 0 && mn <= 0, turnDn = sl < 0 && mx >= 0;
    const bullBar = C > b.open && C > pb.high, bearBar = C < b.open && C < pb.low;
    const t = p.touchAtr * a;

    if (crossUp && turnUp) add(i, "M1", "MUA", b.low);
    else if (sl > 0 && b.low < ma && C > ma && bullBar && Cp > maP - a) add(i, "M2", "MUA", b.low);
    else if (sl > 0 && b.low >= ma && b.low - ma <= t && bullBar) {
      add(i, "M3", "MUA", b.low);
      // G3: sau hội tụ (≤ G3_WINDOW nến), MA chân dưới đã tách lên trên -> nhịp hồi chạm MA đầu tiên.
      if (i - lastWar <= G3_WINDOW && ind.spread[i] > p.warAtr && lastG3 < lastWar) { lastG3 = i; add(i, "G3", "MUA", b.low); }
    }
    if (sl < 0 && ind.dev[i] < -p.overAtr && bullBar) add(i, "M4", "MUA", b.low);

    if (crossDn && turnDn) add(i, "B1", "BÁN", b.high);
    else if (sl < 0 && b.high > ma && C < ma && bearBar && Cp < maP + a) add(i, "B2", "BÁN", b.high);
    else if (sl < 0 && b.high <= ma && ma - b.high <= t && bearBar) add(i, "B3", "BÁN", b.high);
    if (sl > 0 && ind.dev[i] > p.overAtr && bearBar) add(i, "B4", "BÁN", b.high);

    // ĐIỂM VÀO CỐT LÕI (tác giả): khung nhỏ thiết lập xu hướng theo hướng MA chân trên ("điểm cắt giá thấp ở mức 4 giờ").
    if (sl > 0 && C > ma && lastL && prevL && lastH && lastL.price > prevL.price && Cp <= lastH.price && lastH.price < C && lastH.index < lastL.index)
      add(i, "L", "MUA", b.low);
    if (sl < 0 && C < ma && lastH && prevH && lastL && lastH.price < prevH.price && Cp >= lastL.price && lastL.price > C && lastL.index < lastH.index)
      add(i, "S", "BÁN", b.high);
  }
  return out;
}

/** R:R "nếu mua ở giá hiện tại" như bản Python: chỉ khi giá trên MA chân trên. */
export function rrNowAt(bars: Bar[], ind: Indicators, small: Swing[], large: Swing[], t: number): RrNow | null {
  const c = bars[t]?.close, ma = ind.maSlow[t], a = ind.atr[t];
  if (!(c > 0) || !Number.isFinite(ma) || !Number.isFinite(a) || c <= ma) return null;
  const lows = small.filter((s) => s.kind === "L" && s.confirmedIndex <= t);
  if (!lows.length) return null;
  const stop = lows[lows.length - 1].price - 0.2 * a;
  if (!(c > stop)) return null;
  const above = large.filter((s) => s.kind === "H" && s.confirmedIndex <= t && s.price > c).map((s) => s.price);
  const target = above.length ? Math.min(...above) : c + 3 * (c - stop);
  const rr = (target - c) / (c - stop);
  return { entry: c, stop, target, targetBasis: above.length ? "swing4h" : "3R", rr, ok: rr >= 1 };
}

const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)).replace(".", ",");

/** Bảng kiểm 7 điểm tại nến t (hai chiều). */
export function checklists(bars: Bar[], ind: Indicators, dow: number[], zones: Zone[], t: number, p: TfParams, rrNow: RrNow | null = null):
  { buy: CheckItem[]; sell: CheckItem[]; rrBuy: number | null; rrSell: number | null } {
  const c = bars[t].close, a = Math.max(ind.atr[t], 1e-9);
  const ma = ind.maSlow[t], sl = ind.slope[t], sp = ind.spread[t], dv = ind.dev[t];
  let warRecent = false;
  for (let j = Math.max(0, t - G3_WINDOW); j < t; j++) if (Math.abs(ind.spread[j]) <= p.warAtr) { warRecent = true; break; }
  const spPrev = t >= 3 ? ind.spread[t - 3] : NaN;
  let upV = 0, dnV = 0;
  for (let j = Math.max(1, t - 9); j <= t; j++) (bars[j].close >= bars[j - 1].close ? (upV += bars[j].volume) : (dnV += bars[j].volume));
  const sup = zones.filter((z) => z.role === "support" && z.strength >= 0.3).sort((x, y) => y.mid - x.mid)[0];
  const res = zones.filter((z) => z.role === "resistance" && z.strength >= 0.3).sort((x, y) => x.mid - y.mid)[0];
  const stopB = sup ? sup.lo - 0.5 * a : c - 2 * a;
  const rrBuy = res && c > stopB ? (res.lo - c) / (c - stopB) : null;
  const stopS = res ? res.hi + 0.5 * a : c + 2 * a;
  const rrSell = sup && stopS > c ? (c - sup.hi) / (stopS - c) : null;
  const buy: CheckItem[] = [
    { key: "dow", ok: dow[t] === 1, text: "Dow tăng: đỉnh – đáy sau cao hơn" },
    { key: "ma", ok: c > ma && sl > 0, text: "Giá trên MA chân trên, MA dốc lên" },
    { key: "diverge", ok: warRecent && sp > p.warAtr && sp > spPrev, text: "MA vừa hội tụ rồi phân kỳ lên (điểm vào hợp lệ)" },
    { key: "support", ok: !!sup && c - sup.hi <= 1.5 * a, text: sup ? `Gần hỗ trợ mạnh ${fmt(sup.mid)} (≤ 1,5 ATR)` : "Chưa có hỗ trợ mạnh bên dưới" },
    { key: "notOver", ok: Number.isFinite(dv) && dv < p.overAtr, text: "Chưa quá đà (giá chưa lệch xa MA chân trên — không mua đuổi)" },
    { key: "volume", ok: upV > dnV, text: "Khối lượng phiên tăng lớn hơn phiên giảm (10 nến)" },
    { key: "rr", ok: !!rrNow?.ok, text: rrNow ? `Mua ở giá hiện tại: R:R = 1:${fmt(rrNow.rr)} (${rrNow.ok ? "giao dịch ổn, phần thưởng > rủi ro" : "giao dịch NG, phần thưởng không lớn hơn rủi ro"})` : "Chưa đo được R:R (giá dưới MA chân trên hoặc chưa có đáy sóng nhỏ)" },
  ];
  const sell: CheckItem[] = [
    { key: "dow", ok: dow[t] === -1, text: "Dow giảm: đỉnh – đáy sau thấp hơn" },
    { key: "ma", ok: c < ma && sl < 0, text: "Giá dưới MA chân trên, MA dốc xuống" },
    { key: "diverge", ok: warRecent && sp < -p.warAtr && sp < spPrev, text: "MA vừa hội tụ rồi phân kỳ xuống" },
    { key: "resistance", ok: !!res && res.lo - c <= 1.5 * a, text: res ? `Gần kháng cự mạnh ${fmt(res.mid)} (≤ 1,5 ATR)` : "Chưa có kháng cự mạnh bên trên" },
    { key: "notOver", ok: Number.isFinite(dv) && dv > -p.overAtr, text: "Chưa quá bán (giá chưa lệch xa dưới MA chân trên)" },
    { key: "volume", ok: dnV > upV, text: "Khối lượng phiên giảm lớn hơn phiên tăng (10 nến)" },
    { key: "rr", ok: rrSell != null && rrSell >= 2, text: rrSell != null ? `Dư địa giảm/rủi ro đến hỗ trợ gần nhất = ${fmt(rrSell)} (cần ≥ 2)` : "Chưa đo được dư địa giảm" },
  ];
  return { buy, sell, rrBuy, rrSell };
}
