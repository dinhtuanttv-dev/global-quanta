// Elliott đa khung (E3): khung TUẦN (gộp từ nến ngày, cùng cách gộp với biểu đồ W) cho bối cảnh cấu trúc lớn,
// khung NGÀY cho cấu trúc đang chạy, và quan hệ lồng ghép giữa hai khung.
// Kiểm định E4: "tuần ∩ ngày cùng sóng 3/5 tăng" KHÔNG có lợi thế ngoài mẫu (vnValidation.ts, mục E) — chỉ để đối chiếu.
import { ruleHolidaySet } from "../../cotuc/vn-trading-calendar";
import { aggregateToWeekly } from "../../ta-command-center/TimeframeController";
import type { OhlcvBar } from "../../ta-command-center/types";
import { elliottState, type ElliottPivot, type ElliottState } from "./index";
import { oscAgreement, oscillatorCount, type OscCount } from "./oscCount";

/** Số nến tuần tối thiểu: dao động 5/35 cần 35 nến + vài sóng. */
export const ELLIOTT_MIN_WEEKS = 60;
/** Ngưỡng zigzag gốc khung tuần: biên độ nến tuần ≈ √5 lần nến ngày ⇒ gấp đôi 3% của khung ngày (bậc 3–24%). */
export const ELLIOTT_WEEK_ZIGZAG = 0.06;
/** Khung tuần bỏ bậc nhỏ: dao động 3% vẫn nằm trong biên độ một nến tuần (nhiễu). Còn 6% · 12% · 24%. */
export const ELLIOTT_WEEK_DEGREES = [{ name: "intermediate", k: 1 }, { name: "major", k: 2 }, { name: "primary", k: 4 }];

export type MtfRelation = "aligned" | "pullback" | "counter" | "unclear";

export interface ElliottMtf {
  week: (ElliottState & { partial: boolean }) | null;
  day: ElliottState | null;
  relation: MtfRelation;
  /** Một câu tiếng Việt mô tả quan hệ hai khung. */
  relationText: string;
  /** Pivot tuần ghim vào nến NGÀY nơi đạt cực trị của tuần (để vẽ trên biểu đồ D không lệch nến). */
  weekPivotsOnDaily: (ElliottPivot & { dayDate: string })[];
  /** E2: đếm theo Elliott Oscillator (song song với đếm hình học) + mức khớp với đếm hình học cùng khung. */
  osc: { week: (OscCount & { agree: ReturnType<typeof oscAgreement> }) | null; day: OscCount & { agree: ReturnType<typeof oscAgreement> } };
}

const MOTIVE = new Set(["3", "5"]);

/** Tuần cuối chưa hết: sau nến ngày cuối vẫn còn ngày giao dịch (T2–T6, không phải ngày lễ theo quy tắc) trong cùng tuần. */
export function lastWeekPartial(daily: OhlcvBar[]): boolean {
  const last = daily[daily.length - 1].date, d = new Date(last + "T00:00:00Z");
  const u0 = d.getUTCDay(); if (u0 === 0 || u0 === 6) return false;
  const hol = ruleHolidaySet(d.getUTCFullYear(), d.getUTCFullYear() + 1);
  for (let u = u0 + 1; u <= 5; u++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!hol.has(d.toISOString().slice(0, 10))) return true;
  }
  return false;
}

/** Nến ngày đạt đỉnh/đáy của từng tuần: key = ngày thứ Hai của tuần. */
function weekExtremes(daily: OhlcvBar[]): Map<string, { hi: string; lo: string }> {
  const out = new Map<string, { hi: string; lo: string; h: number; l: number }>();
  for (const b of daily) {
    const dt = new Date(b.date + "T00:00:00Z"), u = dt.getUTCDay();
    dt.setUTCDate(dt.getUTCDate() + (u === 0 ? -6 : 1 - u));
    const k = dt.toISOString().slice(0, 10), w = out.get(k);
    if (!w) { out.set(k, { hi: b.date, lo: b.date, h: b.high, l: b.low }); continue; }
    if (b.high > w.h) { w.h = b.high; w.hi = b.date; }
    if (b.low < w.l) { w.l = b.low; w.lo = b.date; }
  }
  return out;
}

const dirVi = (d: "up" | "down" | null) => (d === "up" ? "tăng" : d === "down" ? "giảm" : "");
const opp = (d: "up" | "down" | null) => (d === "up" ? "down" : d === "down" ? "up" : null);

/** Hướng giá đang đi của khung: sóng 3/5 và B cùng chiều xung lực; sóng 4, A, C ngược chiều. */
export function moveOf(s: Pick<ElliottState, "wave" | "dir">): "up" | "down" | null {
  if (s.wave === "3" || s.wave === "5" || s.wave === "B") return s.dir;
  if (s.wave === "4" || s.wave === "A" || s.wave === "C") return opp(s.dir);
  return null;
}

function phrase(s: ElliottState): string {
  if (MOTIVE.has(s.wave)) return `sóng ${s.wave} ${dirVi(s.dir)}`;
  if (s.wave === "4") return `sóng 4 (điều chỉnh ${dirVi(moveOf(s))} trong xung lực ${dirVi(s.dir)})`;
  if (s.wave === "A" || s.wave === "B" || s.wave === "C") return `sóng ${s.wave} (đi ${dirVi(moveOf(s))}, điều chỉnh sau 5 sóng ${dirVi(s.dir)})`;
  return s.wave === "post" ? `đã qua ABC sau 5 sóng ${dirVi(s.dir)}` : "chưa rõ";
}

export function mtfRelation(week: ElliottState | null, day: ElliottState | null): { relation: MtfRelation; text: string } {
  if (!week || !day || week.wave === "none" || day.wave === "none" || !week.dir || !day.dir)
    return { relation: "unclear", text: "Chưa đủ cấu trúc ở một trong hai khung để đối chiếu." };
  const wm = moveOf(week), dm = moveOf(day);
  const T = `Tuần: ${phrase(week)}; ngày: ${phrase(day)}`;
  if (!wm || !dm) return { relation: "unclear", text: `${T} — chưa xác định được quan hệ.` };
  if (wm === dm) return { relation: "aligned", text: `${T} — hai khung cùng đi ${dirVi(wm)}.` };
  if (MOTIVE.has(week.wave)) return { relation: "pullback", text: `${T} — khung ngày đang điều chỉnh bên trong sóng ${week.wave} tuần.` };
  return { relation: "counter", text: `${T} — khung ngày đi ngược hướng khung tuần.` };
}

/** Trạng thái Elliott hai khung tại nến ngày cuối. Chỉ dùng dữ liệu ≤ nến cuối (tuần cuối có thể chưa hết: partial). */
export function elliottMtf(daily: OhlcvBar[]): ElliottMtf {
  const day = elliottState(daily);
  const weekly = daily.length ? aggregateToWeekly(daily) : [];
  const ws = weekly.length >= ELLIOTT_MIN_WEEKS ? elliottState(weekly, { zigzagPct: ELLIOTT_WEEK_ZIGZAG, degrees: ELLIOTT_WEEK_DEGREES }) : null;
  const week = ws ? { ...ws, label: `${ws.label} · khung tuần`, partial: lastWeekPartial(daily) } : null;
  const ext = weekExtremes(daily);
  const weekPivotsOnDaily = (week?.scenario?.points ?? []).map((p) => {
    const e = ext.get(String(p.time));
    return { ...p, dayDate: e ? (p.type === "H" ? e.hi : e.lo) : String(p.time) };
  });
  const r = mtfRelation(week, day);
  const dOsc = oscillatorCount(daily.slice(-500)), wOsc = weekly.length >= ELLIOTT_MIN_WEEKS ? oscillatorCount(weekly.slice(-500)) : null;
  const osc = { day: { ...dOsc, agree: oscAgreement(dOsc, day) }, week: wOsc ? { ...wOsc, agree: oscAgreement(wOsc, week) } : null };
  return { week, day, relation: r.relation, relationText: r.text, weekPivotsOnDaily, osc };
}
