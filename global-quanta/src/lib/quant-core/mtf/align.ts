// @gq/quant-core · MTF — ghép khung không nhìn trước + ma trận đồng thuận R1–R7 + hai kịch bản.
// Khung lớn chỉ dùng nến ĐÃ ĐÓNG: nến H1 trong ngày X chỉ thấy nến ngày < X; nến ngày trong tuần W chỉ thấy tuần < W.
import type { Bar } from "../math";
import { PATTERN_NAME, patternStatusAt } from "./patterns";
import type { Pattern, Signal, Stage, TfAnalysis, Zone } from "./types";

export const dayKey = (date: string) => date.slice(0, 10);

/** Khoá tuần ISO "YYYY-Www" của một ngày. */
export function weekKey(date: string): string {
  const d = new Date(`${dayKey(date)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // T2 = 0
  d.setUTCDate(d.getUTCDate() - dow + 3); // Thứ Năm cùng tuần
  const y = d.getUTCFullYear();
  const wk = 1 + Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}

/** Gộp nến ngày thành nến tuần; ngày của nến tuần = phiên cuối tuần. */
export function toWeekly(daily: Bar[]): Bar[] {
  const out: Bar[] = [];
  let key = "";
  for (const b of daily) {
    const k = weekKey(b.date);
    const cur = out[out.length - 1];
    if (k !== key || !cur) { out.push({ ...b }); key = k; continue; }
    cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low);
    cur.close = b.close; cur.volume += b.volume; cur.date = b.date;
  }
  return out;
}

/** Với mỗi nến khung nhỏ: chỉ số nến khung lớn ĐÃ ĐÓNG gần nhất (−1 nếu chưa có). */
export function closedHtfIndex(ltf: Bar[], htf: Bar[], htfIsWeekly: boolean): number[] {
  const key = htfIsWeekly ? (d: string) => weekKey(d) : dayKey;
  const hk = htf.map((b) => key(b.date));
  const out = new Array<number>(ltf.length).fill(-1);
  let j = -1;
  for (let i = 0; i < ltf.length; i++) {
    const k = key(ltf[i].date);
    while (j + 1 < htf.length && hk[j + 1] < k) j++;
    out[i] = j;
  }
  return out;
}

export type Verdict = "MUA" | "CHỜ MUA" | "ĐỨNG NGOÀI" | "GIẢM TỶ TRỌNG" | "BÁN";

export interface AlignResult {
  verdict: Verdict;
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
  cell: string;             // "D:UP × H1:A"
  sizeMult: number;         // hệ số tỷ trọng (R7 hạ một nửa khi khung tuần ngược chiều)
  text: string;
  rules: string[];          // các quy tắc đã áp dụng (giải thích)
}

export const stageBias = (s: Stage | null | undefined): -1 | 0 | 1 =>
  s === "UP" || s === "B" ? 1 : s === "DOWN" || s === "D" || s === "Bp" || s === "C" ? -1 : 0;

const BUY_CODES = new Set<Signal["code"]>(["M1", "M2", "M3", "G3"]);

/**
 * Ma trận đồng thuận. trend = khung xu hướng (Ngày), entry = khung vào lệnh (H1), week = khung tuần (lọc R7).
 * entryBuyRecent: khung vào lệnh vừa có tín hiệu mua Granville trong vài nến gần nhất.
 */
export function alignMatrix(trend: Stage, entry: Stage | null, week: Stage | null, entryBuyRecent: boolean): AlignResult {
  const rules: string[] = [];
  const cell = `Ngày:${trend}${entry ? ` × H1:${entry}` : ""}`;
  let verdict: Verdict = "ĐỨNG NGOÀI";
  let rule: AlignResult["rule"] = "R6";
  let text = "";
  const e = entry ?? trend;
  const eBull = e === "UP" || e === "A";
  const eBear = e === "C" || e === "D" || e === "DOWN" || e === "Bp";
  switch (trend) {
    case "UP":
      rule = "R1";
      if (e === "UP" && entryBuyRecent) { verdict = "MUA"; text = "Khung ngày tăng, khung vào lệnh tăng và vừa có tín hiệu mua — thuận cả hai khung."; }
      else if (e === "B") { verdict = "CHỜ MUA"; text = "Khung ngày tăng nhưng khung vào lệnh đang quá mua — không mua đuổi, chờ hồi về hỗ trợ."; }
      else if (eBear) { verdict = "CHỜ MUA"; text = "Khung ngày tăng, khung vào lệnh đang điều chỉnh — chờ khung nhỏ quay lại tích lũy / tăng rồi mới mua."; }
      else { verdict = "CHỜ MUA"; text = "Khung ngày tăng — chờ tín hiệu mua (hồi chạm MA / phá nền) ở khung vào lệnh."; }
      rules.push("R1: chỉ mở mua ở khung nhỏ khi khung ngày đang tăng chuẩn.");
      break;
    case "A":
      rule = "R6";
      if (e === "UP" && entryBuyRecent) { verdict = "MUA"; text = "Khung ngày đang tích lũy đáy; khung vào lệnh đã tăng — chỉ mua thăm dò (nửa tỷ trọng)."; }
      else { verdict = "CHỜ MUA"; text = "Khung ngày đang tích lũy đáy — chờ phá nền / viền cổ để xác nhận."; }
      rules.push("R6: tích lũy / đi ngang — chỉ giao dịch khi phá vỡ, tỷ trọng nhỏ.");
      break;
    case "B":
      rule = "R3";
      verdict = eBear ? "GIẢM TỶ TRỌNG" : "ĐỨNG NGOÀI";
      text = eBear ? "Khung ngày quá mua và khung nhỏ đã suy yếu — chốt lời dần." : "Khung ngày quá mua — không mở mua mới, nâng cắt lỗ.";
      rules.push("R3: khung ngày quá mua — không mua đuổi, chốt một phần ở kháng cự.");
      break;
    case "C":
      rule = "R4"; verdict = "GIẢM TỶ TRỌNG";
      text = "Khung ngày suy yếu tại đỉnh — hạ tỷ trọng, không mở mua mới dù khung nhỏ hồi.";
      rules.push("R4: khung ngày ở giai đoạn C — cấm mua mới ở khung nhỏ.");
      break;
    case "D":
    case "DOWN":
      rule = "R2";
      verdict = eBull ? "ĐỨNG NGOÀI" : "BÁN";
      text = eBull ? "Khung ngày giảm — nhịp tăng ở khung nhỏ chỉ là hồi kỹ thuật, đứng ngoài." : "Khung ngày giảm và khung nhỏ cùng chiều — bán / không nắm giữ.";
      rules.push("R2: khung ngày giảm — không mua, nhịp hồi khung nhỏ là cơ hội thoát hàng.");
      break;
    case "Bp":
      rule = "R5";
      verdict = eBear ? "BÁN" : "GIẢM TỶ TRỌNG";
      text = "Khung ngày hồi lên MA trong xu hướng giảm — vùng MA là điểm bán, không phải điểm mua.";
      rules.push("R5: B′ — hồi lên MA trong xu hướng giảm là điểm bán.");
      break;
    default:
      rule = "R6";
      verdict = e === "UP" && entryBuyRecent ? "CHỜ MUA" : "ĐỨNG NGOÀI";
      text = "Khung ngày đi ngang — chỉ mua gần biên dưới vùng hoặc khi phá vỡ lên.";
      rules.push("R6: đi ngang — giao dịch ở biên vùng / chờ phá vỡ.");
  }
  let sizeMult = trend === "A" ? 0.5 : 1;
  const wb = stageBias(week), tb = stageBias(trend);
  if (week && wb !== 0 && tb !== 0 && wb !== tb) {
    sizeMult *= 0.5;
    rules.push("R7: khung tuần ngược chiều khung ngày — giảm một nửa tỷ trọng.");
    if (verdict === "MUA") text += " Khung tuần ngược chiều: chỉ dùng nửa tỷ trọng.";
  }
  return { verdict, rule, cell, sizeMult, text, rules };
}

export interface Scenario {
  side: "L" | "S";
  title: string;
  trigger: number; entry: number; stop: number; targets: number[];
  rr: number | null;
  targetBasis: "zones" | "R-multiple";   // mục tiêu từ vùng giá / mẫu hình, hay đo theo 2R khi không còn vùng
  text: string;
}

const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : x.toFixed(2).replace(".", ","));

/** Hai kịch bản có điều kiện kích hoạt (theo bộ ảnh): tăng khi vượt kháng cự gần nhất, giảm khi thủng hỗ trợ gần nhất. */
export function scenarios(a: TfAnalysis, extraZones: Zone[] = []): Scenario[] {
  const t = a.bars.length - 1;
  if (t < 1) return [];
  const c = a.bars[t].close, atr = Math.max(a.atr[t], 1e-9);
  const zones = [...a.zones, ...extraZones].filter((z) => z.strength >= 0.25);
  const above = zones.filter((z) => z.lo > c).sort((x, y) => x.mid - y.mid);
  const below = zones.filter((z) => z.hi < c).sort((x, y) => y.mid - x.mid);
  const pats = a.patterns.filter((p) => { const s = patternStatusAt(p, t); return s === "forming" || (s === "confirmed" && t - (p.breakIndex as number) <= 20); });
  const bull = pats.filter((p) => p.dir === 1).pop();
  const bear = pats.filter((p) => p.dir === -1).pop();
  const out: Scenario[] = [];

  const trigL = above[0] ? above[0].hi : c + atr;
  const stopL = below[0] ? Math.min(below[0].lo - 0.5 * atr, trigL - atr) : trigL - 2 * atr;
  const tgL = above.slice(1, 3).map((z) => z.mid);
  if (bull) tgL.push(bull.target);
  const targetsL = [...new Set(tgL.filter((x) => x > trigL).map((x) => +x.toFixed(4)))].sort((x, y) => x - y).slice(0, 3);
  const basisL: Scenario["targetBasis"] = targetsL.length ? "zones" : "R-multiple";
  if (!targetsL.length) targetsL.push(trigL + 2 * (trigL - stopL));
  out.push({
    side: "L", title: "Kịch bản tăng", trigger: trigL, entry: trigL, stop: stopL, targets: targetsL,
    rr: trigL > stopL ? (targetsL[0] - trigL) / (trigL - stopL) : null, targetBasis: basisL,
    text: `Nếu giá ĐÓNG CỬA trên ${fmt(trigL)}${bull ? ` (xác nhận ${PATTERN_NAME[bull.type]})` : ""}: mục tiêu ${targetsL.map(fmt).join(" → ")}${basisL === "R-multiple" ? " (đo theo 2R — phía trên không còn vùng cản đã biết)" : ""}; cắt lỗ dưới ${fmt(stopL)}. Chốt một nửa ở mục tiêu đầu.`,
  });

  const trigS = below[0] ? below[0].lo : c - atr;
  const stopS = above[0] ? Math.max(above[0].hi + 0.5 * atr, trigS + atr) : trigS + 2 * atr;
  const tgS = below.slice(1, 3).map((z) => z.mid);
  if (bear) tgS.push(bear.target);
  const targetsS = [...new Set(tgS.filter((x) => x < trigS && x > 0).map((x) => +x.toFixed(4)))].sort((x, y) => y - x).slice(0, 3);
  const basisS: Scenario["targetBasis"] = targetsS.length ? "zones" : "R-multiple";
  if (!targetsS.length) targetsS.push(Math.max(0, trigS - 2 * (stopS - trigS)));
  out.push({
    side: "S", title: "Kịch bản giảm", trigger: trigS, entry: trigS, stop: stopS, targets: targetsS,
    rr: stopS > trigS ? (trigS - targetsS[0]) / (stopS - trigS) : null, targetBasis: basisS,
    text: `Nếu giá ĐÓNG CỬA dưới ${fmt(trigS)}${bear ? ` (xác nhận ${PATTERN_NAME[bear.type]})` : ""}: rủi ro về ${targetsS.map(fmt).join(" → ")}${basisS === "R-multiple" ? " (đo theo 2R — bên dưới không còn hỗ trợ đã biết)" : ""} — thoát hàng / không bắt đáy.`,
  });
  return out;
}

export const recentBuy = (signals: Signal[], t: number, within = 5) =>
  signals.some((s) => BUY_CODES.has(s.code) && s.confirmedIndex <= t && t - s.confirmedIndex < within);

export type { Pattern };
