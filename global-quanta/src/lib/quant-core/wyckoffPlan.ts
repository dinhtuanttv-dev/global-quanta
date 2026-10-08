// @gq/quant-core · Wyckoff W3 — dòng thời gian Phase A–E và kế hoạch 3 lần (tài liệu "VSA theo Wyckoff", tr.54–58).
// Chỉ HIỂN THỊ / MINH HOẠ: sau 3 đợt kiểm định (PR #48, W1, W2) chưa phép đo nào từ tài liệu có lợi thế ngoài mẫu trên dữ liệu VN,
// điểm vào POE của v3 ngoài mẫu PF 0,46 -> kế hoạch là ví dụ theo sách, không phải khuyến nghị.
// Phía bán: thị trường VN không bán khống -> "3 bước giảm tỷ trọng / thoát vị thế".
import { atrSeries, type Bar } from "./math";
import type { WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";

export type PhaseLetter = "A" | "B" | "C" | "D" | "E";
export interface PhaseSegment { phase: PhaseLetter; startDate: string; endDate: string; startIndex: number; endIndex: number; current: boolean }

export const PHASE_VI: Record<PhaseLetter, string> = {
  A: "Phase A — dừng xu hướng cũ (PS/SC/AR/ST)",
  B: "Phase B — xây dựng nguyên nhân",
  C: "Phase C — kiểm tra (Spring / UT)",
  D: "Phase D — xu hướng trong range (SOS / SOW, LPS / LPSY)",
  E: "Phase E — rời range, xu hướng mới",
};

export const WYCKOFF_PLAN = {
  /** Tỷ trọng mỗi lần (tr.54–58: khoảng 30% mỗi lần, chỉ mua thêm khi lần trước đang lãi). */
  sizes: [0.3, 0.3, 0.4] as number[],
  /** Giới hạn khối lượng mỗi lệnh theo KL TB20 (tr.58: 10–20%); mức giữa dùng làm mặc định. */
  liquidityPct: 0.15,
  liquidityBand: [0.1, 0.15, 0.2] as number[],
  stopATR: 0.5,
};

export interface Tranche {
  n: 1 | 2 | 3;
  sizePct: number;
  label: string;
  /** Mức tham chiếu (giá vào / giá thoát) và cắt lỗ; null khi chưa xác định được. */
  price: number | null;
  stop: number | null;
  status: "done" | "pending" | "na";
  date: string | null;
  note: string;
}
export interface TrancheTitle { side: "buy" | "sell"; title: string }
export interface TradePlan3 extends TrancheTitle {
  tranches: Tranche[];
  /** Khối lượng tối đa mỗi lệnh = 15% KL TB20 (cổ phiếu) và giá trị tương ứng (đồng). */
  maxShares: number | null;
  maxValue: number | null;
  /** Giới hạn theo dải 10 / 15 / 20% KL TB20: số cổ phiếu (bội số 100) và giá trị (đồng). */
  liquidity: { pct: number; shares: number; value: number }[];
  note: string;
}

export const WYCKOFF_PLAN_NOTE =
  "Ví dụ minh hoạ theo tài liệu (3 lần, chỉ mua thêm khi lần trước đang lãi, không bình quân giá xuống) — KHÔNG phải khuyến nghị. " +
  "Điểm vào chưa có lợi thế đã kiểm định trên dữ liệu VN (POE v3 ngoài mẫu PF 0,46). Khối lượng mỗi lệnh 10–20% KL TB20 (mặc định 15%).";

const idx = (bars: Bar[], d: string | null | undefined) => (d ? bars.findIndex((b) => b.date === d) : -1);
const lastOf = (w: WyckoffResult, names: string[]) => [...w.events].filter((e) => names.includes(e.event) && e.confirmedIndex != null).sort((a, b) => a.index - b.index).pop() ?? null;
const firstOf = (w: WyckoffResult, names: string[]) => [...w.events].filter((e) => names.includes(e.event)).sort((a, b) => a.index - b.index)[0] ?? null;

/** Dòng thời gian Phase A–E của cấu trúc ĐANG HOẠT ĐỘNG, suy từ các sự kiện đã xác nhận (ranh giới = ngày xảy ra sự kiện). */
export function phaseSegments(bars: Bar[], w: WyckoffResult): PhaseSegment[] {
  if ((w.status ?? "active") !== "active" || w.phase === "undetermined") return [];
  // Chưa có range (VD v3 vừa thấy SC ở Phase A) -> neo từ sự kiện đầu tiên.
  const firstEv = w.events.length ? Math.min(...w.events.map((e) => e.index)) : -1;
  const start = w.rangeStartDate ? idx(bars, w.rangeStartDate) : firstEv;
  if (start < 0) return [];
  const last = bars.length - 1;
  const endR = w.rangeEndDate ? idx(bars, w.rangeEndDate) : last;
  const long = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
  const climax = firstOf(w, long ? ["PS", "SC"] : ["PSY", "BC"]);
  const aEnd = lastOf(w, ["ST", "AR"]);
  const cEv = lastOf(w, long ? ["Spring"] : ["UT", "UTAD"]);
  const dEv = lastOf(w, long ? ["SOS"] : ["SOW"]);
  const marks: { phase: PhaseLetter; at: number }[] = [];
  const aStart = climax ? Math.min(climax.index, start) : null;
  if (aStart != null) marks.push({ phase: "A", at: aStart });
  const bStart = aEnd && aEnd.index > (aStart ?? -1) ? aEnd.index : aStart != null ? Math.min(last, aStart + 5) : start;
  marks.push({ phase: "B", at: bStart });
  if (cEv && cEv.index > bStart) marks.push({ phase: "C", at: cEv.index });
  if (dEv && dEv.index > (marks[marks.length - 1].at)) marks.push({ phase: "D", at: dEv.index });
  // Phase E: giá rời range theo hướng cấu trúc SAU Phase D (mốc cuối phải là D), hoặc v3 đã ghi nhận Phase E.
  const close = bars[last].close;
  const beyond = w.rangeHigh != null && w.rangeLow != null && (long ? close > w.rangeHigh : close < w.rangeLow);
  const lastMark = () => marks[marks.length - 1];
  if (w.wyckoffPhase === "E" || (lastMark().phase === "D" && beyond && endR >= 0 && endR < last)) {
    const eAt = Math.max(lastMark().at + 1, endR >= 0 ? endR : last);
    if (eAt <= last) marks.push({ phase: "E", at: eAt });
  }
  // Engine có Phase A–E riêng (v3) -> dòng thời gian không được đi trước engine: bỏ mốc sau pha của engine; thiếu thì thêm.
  const ORDER = "ABCDE";
  if (w.wyckoffPhase) {
    const k = ORDER.indexOf(w.wyckoffPhase);
    while (marks.length > 1 && ORDER.indexOf(lastMark().phase) > k) marks.pop();
    if (ORDER.indexOf(lastMark().phase) < k) {
      const after = w.events.filter((e) => e.confirmedIndex != null && e.index > lastMark().at).map((e) => e.index);
      const at = after.length ? Math.max(...after) : lastMark().at + 1;
      if (at <= last) marks.push({ phase: w.wyckoffPhase, at });
    }
  }
  // Mốc phải tăng thực sự (hai mốc trùng nến -> giữ mốc sau).
  for (let i = marks.length - 1; i > 0; i--) if (marks[i].at <= marks[i - 1].at) marks.splice(i - 1, 1);
  const segs: PhaseSegment[] = marks.map((m, i) => {
    const e = i + 1 < marks.length ? Math.max(m.at, marks[i + 1].at - 1) : last;
    return { phase: m.phase, startIndex: m.at, endIndex: e, startDate: bars[m.at].date, endDate: bars[e].date, current: i === marks.length - 1 };
  });
  return segs;
}

/** Kế hoạch 3 lần theo tài liệu: mua (tích luỹ) hoặc giảm tỷ trọng (phân phối). null khi không có cấu trúc đang hoạt động. */
export function tradePlan3(bars: Bar[], w: WyckoffResult): TradePlan3 | null {
  if ((w.status ?? "active") !== "active" || w.phase === "undetermined" || w.rangeHigh == null || w.rangeLow == null || !bars.length) return null;
  const long = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
  const last = bars.length - 1;
  const atr = atrSeries(bars, 14);
  const a = atr[last] || 0;
  const H = w.rangeHigh, L = w.rangeLow;
  const ev = w.evidence ?? null;
  const tranches: Tranche[] = [];
  const S = WYCKOFF_PLAN.sizes;
  // Tuần tự (tr.54–58: chỉ mua thêm khi lần trước đã khớp và đang lãi): lần n+1 chỉ tính sự kiện xảy ra SAU lần n.
  const fmtP = (v: number) => Math.round(v).toLocaleString("vi-VN");
  if (long) {
    const sp = ev?.springs.filter((x) => x.side === "spring").pop() ?? null;
    const spring = lastOf(w, ["Spring"]);
    const a1 = sp?.actionable ? (sp.kind === 3 ? sp.confirmedIndex : sp.test!.index) : -1;
    const s1Stop = (sp?.price ?? spring?.price ?? L) - WYCKOFF_PLAN.stopATR * a;
    tranches.push({ n: 1, sizePct: S[0], label: "Lần 1 — Spring #3, hoặc Test của Spring #1/#2", price: a1 >= 0 ? bars[a1].close : null, stop: s1Stop,
      status: sp ? (a1 >= 0 ? "done" : "pending") : "na", date: a1 >= 0 ? bars[a1].date : null,
      note: sp ? (a1 >= 0 ? `Spring #${sp.kind}${sp.test ? `, Test ${sp.test.date}` : ""}` : `Spring #${sp.kind} — chờ Test KL thấp`) : "chưa có Spring trong cấu trúc" });
    const sos = [...w.events].filter((e) => e.event === "SOS" && e.confirmedIndex != null && e.index > a1).sort((x, y) => x.index - y.index).pop() ?? null;
    let a2 = -1, a2Name = "";
    if (a1 >= 0 && sos) {
      const lps = [...w.events].filter((e) => e.event === "LPS" && e.index > sos.index).sort((x, y) => x.index - y.index)[0];
      const buec = ev?.breaks.find((x) => x.kind === "JAC" && !x.failed && x.backup && x.backup.index > Math.max(a1, sos.index))?.backup ?? null;
      const cand = [lps ? { i: lps.index, n: "LPS" } : null, buec ? { i: buec.index, n: "BUEC" } : null].filter(Boolean) as { i: number; n: string }[];
      const first = cand.sort((x, y) => x.i - y.i)[0];
      if (first) { a2 = first.i; a2Name = first.n; }
    }
    tranches.push({ n: 2, sizePct: S[1], label: "Lần 2 — LPS / BUEC sau SOS (JAC)", price: a2 >= 0 ? bars[a2].close : null,
      stop: a2 >= 0 ? bars[a2].low - WYCKOFF_PLAN.stopATR * a : null, status: a1 < 0 ? "pending" : a2 >= 0 ? "done" : "pending", date: a2 >= 0 ? bars[a2].date : null,
      note: a1 < 0 ? "chờ lần 1" : a2 >= 0 ? `${a2Name} ${bars[a2].date}; dời cắt lỗ lần 1 về hoà vốn` : sos ? "chờ nhịp lùi KL thấp về kháng cự cũ (LPS / BUEC)" : "chờ SOS" });
    // Đỉnh cần vượt = đỉnh cao nhất từ SOS tới nhịp lùi lần 2 (đỉnh BU); chưa có lần 2: đỉnh cao nhất kể từ SOS.
    let lvl = H;
    if (sos) for (let j = sos.index; j <= (a2 >= 0 ? a2 : last); j++) lvl = Math.max(lvl, bars[j].high);
    let a3 = -1;
    if (a2 >= 0) for (let j = a2 + 1; j <= last; j++) if (bars[j].close > lvl) { a3 = j; break; }
    tranches.push({ n: 3, sizePct: S[2], label: "Lần 3 — vượt đỉnh SOS / BU", price: lvl,
      stop: a2 >= 0 ? bars[a2].low - WYCKOFF_PLAN.stopATR * a : null, status: a3 >= 0 ? "done" : "pending", date: a3 >= 0 ? bars[a3].date : null,
      note: a2 < 0 ? "chờ lần 2" : a3 >= 0 ? "đã vượt — dời cắt lỗ dưới LPS" : `chờ đóng cửa trên ${fmtP(lvl)}` });
  } else {
    const ut = ev?.springs.filter((x) => x.side === "ut").pop() ?? null;
    const a1 = ut?.actionable ? (ut.kind === 3 ? ut.confirmedIndex : ut.test!.index) : -1;
    tranches.push({ n: 1, sizePct: S[0], label: "Bước 1 — UT #3, hoặc Test của UT", price: a1 >= 0 ? bars[a1].close : null,
      stop: ut ? ut.price + WYCKOFF_PLAN.stopATR * a : null, status: ut ? (a1 >= 0 ? "done" : "pending") : "na", date: a1 >= 0 ? bars[a1].date : null,
      note: ut ? `UT #${ut.kind}${a1 >= 0 ? "" : " — chờ Test"}` : "chưa có UT trong cấu trúc" });
    // VN không bán khống: giảm tỷ trọng không cần chờ bước trước; bước 2 vẫn phải sau SOW (và sau bước 1 nếu đã có).
    const sow = [...w.events].filter((e) => e.event === "SOW" && e.confirmedIndex != null && e.index > a1).sort((x, y) => x.index - y.index).pop() ?? null;
    const lpsy = sow ? [...w.events].filter((e) => e.event === "LPSY" && e.index > sow.index).sort((x, y) => x.index - y.index)[0] ?? null : null;
    tranches.push({ n: 2, sizePct: S[1], label: "Bước 2 — LPSY sau SOW", price: lpsy ? bars[lpsy.index].close : null, stop: lpsy ? bars[lpsy.index].high + WYCKOFF_PLAN.stopATR * a : null,
      status: lpsy ? "done" : "pending", date: lpsy?.date ?? null, note: lpsy ? `LPSY ${lpsy.date}` : sow ? "chờ nhịp hồi KL thấp (LPSY)" : "chờ SOW" });
    // Bước 3 = lần ĐẦU đóng cửa dưới hỗ trợ range (thường chính là SOW) — giảm tỷ trọng không bắt buộc theo thứ tự bước.
    const lvl = L;
    let a3 = -1;
    for (let j = Math.max(a1, idx(bars, w.rangeStartDate)) + 1; j <= last; j++) if (bars[j].close < lvl) { a3 = j; break; }
    tranches.push({ n: 3, sizePct: S[2], label: "Bước 3 — đóng cửa thủng hỗ trợ range", price: a3 >= 0 ? bars[a3].close : lvl, stop: null, status: a3 >= 0 ? "done" : "pending",
      date: a3 >= 0 ? bars[a3].date : null, note: a3 >= 0 ? "đã thủng — thoát phần còn lại (các bước giảm tỷ trọng không bắt buộc theo thứ tự)" : `chờ đóng cửa dưới ${fmtP(lvl)}` });
  }
  let v = 0, c = 0;
  for (let j = Math.max(0, last - 19); j <= last; j++) { v += bars[j].volume; c++; }
  const adv = c ? v / c : 0;
  const lots = (pct: number) => Math.floor((adv * pct) / 100) * 100;
  const maxShares = adv > 0 ? lots(WYCKOFF_PLAN.liquidityPct) : null;
  const liquidity = adv > 0 ? WYCKOFF_PLAN.liquidityBand.map((pct) => ({ pct, shares: lots(pct), value: lots(pct) * bars[last].close })) : [];
  return {
    side: long ? "buy" : "sell", title: long ? "Kế hoạch 3 lần mua (theo tài liệu)" : "3 bước giảm tỷ trọng (VN không bán khống)",
    tranches, maxShares, maxValue: maxShares != null ? maxShares * bars[last].close : null, liquidity, note: WYCKOFF_PLAN_NOTE,
  };
}
