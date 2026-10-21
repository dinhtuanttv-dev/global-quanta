// @gq/quant-core · MTF — 8 tín hiệu Granville (M1–M4 mua, B1–B4 bán) quanh MA chân trên, mua 3 bước (G3),
// và bảng kiểm "lợi thế kỹ thuật" 7 điểm. Tín hiệu xác nhận khi ĐÓNG CỬA nến (confirmedIndex = index).
import type { Bar } from "../math";
import type { Indicators } from "./core";
import type { CheckItem, Signal, TfParams, Zone } from "./types";

const DEBOUNCE = 5;
const G3_WINDOW = 30;

export const SIGNAL_TEXT: Record<Signal["code"], string> = {
  M1: "Mua 1 – giá vượt lên MA vừa ngừng giảm",
  M2: "Mua 2 – thủng MA ngắn rồi quay lại trên MA đang lên",
  M3: "Mua 3 – hồi về chạm MA đang lên, không thủng",
  M4: "Mua 4 – lệch quá xa dưới MA (quá bán), bật hồi",
  B1: "Bán 1 – giá thủng MA vừa ngừng tăng",
  B2: "Bán 2 – vượt MA ngắn rồi quay lại dưới MA đang xuống",
  B3: "Bán 3 – hồi lên chạm MA đang xuống, không vượt",
  B4: "Bán 4 – lệch quá xa trên MA (quá mua), suy yếu",
  G3: "Mua 3 bước – MA hội tụ → phân kỳ → nhịp hồi đầu tiên",
  L: "Kịch bản tăng", S: "Kịch bản giảm", "KT+": "Đủ lợi thế kỹ thuật mua", "KT-": "Đủ lợi thế kỹ thuật bán",
};

export function granville(bars: Bar[], ind: Indicators, p: TfParams): Signal[] {
  const out: Signal[] = [];
  const last: Partial<Record<Signal["code"], number>> = {};
  let lastWar = -Infinity;
  let lastG3 = -Infinity;
  // M4/B4: một tín hiệu cho mỗi đợt lệch xa MA (đợt kết thúc khi độ lệch về dưới một nửa ngưỡng).
  let armM4 = true, armB4 = true;
  const push = (i: number, code: Signal["code"], side: Signal["side"], price: number) => {
    if ((last[code] ?? -Infinity) > i - DEBOUNCE) return;
    last[code] = i;
    out.push({ index: i, confirmedIndex: i, code, side, price, note: SIGNAL_TEXT[code] });
  };
  for (let i = 1; i < bars.length; i++) {
    const ma = ind.maSlow[i], maP = ind.maSlow[i - 1], sl = ind.slope[i], a = Math.max(ind.atr[i], 1e-9);
    if (!Number.isFinite(ma) || !Number.isFinite(maP) || !Number.isFinite(sl)) continue;
    const b = bars[i], c = b.close, cp = bars[i - 1].close;
    const bull = c > b.open, bear = c < b.open;
    const tch = p.touchAtr * a;
    const crossUp = cp <= maP && c > ma, crossDn = cp >= maP && c < ma;
    // Độ dốc 10 nến trước: phân biệt "vừa ngừng giảm" (M1) với "đang lên" (M2).
    const slPrev = i >= 10 && Number.isFinite(ind.slope[i - 10]) ? ind.slope[i - 10] : sl;
    if (Math.abs(ind.spread[i]) <= p.warAtr) lastWar = i;

    if (crossUp && sl >= -0.02 && slPrev <= 0) push(i, "M1", "MUA", c);
    else if (crossUp && sl > 0 && slPrev > 0) push(i, "M2", "MUA", c);
    if (!crossUp && sl > 0 && c > ma && b.low <= ma + tch && bull) {
      push(i, "M3", "MUA", c);
      // G3: sau hội tụ (≤ G3_WINDOW nến), MA chân dưới đã tách lên trên -> nhịp hồi chạm MA đầu tiên.
      if (i - lastWar <= G3_WINDOW && ind.spread[i] > p.warAtr && lastG3 < lastWar) { lastG3 = i; push(i, "G3", "MUA", c); }
    }
    if (ind.dev[i] > -p.overAtr / 2) armM4 = true;
    if (ind.dev[i] < p.overAtr / 2) armB4 = true;
    if (armM4 && ind.dev[i] <= -p.overAtr && bull && sl < 0) { armM4 = false; push(i, "M4", "MUA", c); }

    if (crossDn && sl <= 0.02 && slPrev >= 0) push(i, "B1", "BÁN", c);
    else if (crossDn && sl < 0 && slPrev < 0) push(i, "B2", "BÁN", c);
    if (!crossDn && sl < 0 && c < ma && b.high >= ma - tch && bear) push(i, "B3", "BÁN", c);
    if (armB4 && ind.dev[i] >= p.overAtr && bear && sl > 0) { armB4 = false; push(i, "B4", "BÁN", c); }
  }
  return out;
}

const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)).replace(".", ",");

/** Bảng kiểm 7 điểm tại nến t (hai chiều). */
export function checklists(bars: Bar[], ind: Indicators, dow: number[], zones: Zone[], t: number, p: TfParams):
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
    { key: "notOver", ok: Number.isFinite(dv) && dv < p.overAtr, text: "Chưa quá mua (giá chưa lệch xa MA chân trên)" },
    { key: "volume", ok: upV > dnV, text: "Khối lượng phiên tăng lớn hơn phiên giảm (10 nến)" },
    { key: "rr", ok: rrBuy != null && rrBuy >= 2, text: rrBuy != null ? `Lợi nhuận/rủi ro đến kháng cự gần nhất = ${fmt(rrBuy)} (cần ≥ 2)` : "Chưa đo được lợi nhuận/rủi ro" },
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
