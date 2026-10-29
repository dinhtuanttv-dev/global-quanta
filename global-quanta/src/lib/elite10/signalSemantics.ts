// Ngữ nghĩa 24 tín hiệu của bảng E1 (30/10/2026) — giải mã đúng thang mã hoá của Gateway (backend/src/market/elite/signalRegistry.js):
// loại (số / bậc / cờ), chiều tốt, nhãn từng bậc; danh mục NÚT ĐIỀU KIỆN của Bộ lọc Elite và các bộ chọn sẵn.
import type { Cond, EliteFilter } from "./filterEngine";

export type SigKind = "numeric" | "ordinal" | "flag";
export interface SigMeta { kind: SigKind; higherBetter: boolean | null; labels?: Record<string, string> }

const L = (o: Record<number, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [String(Number(k)), v]));
export const SIG_META: Record<string, SigMeta> = {
  ws_sector_alpha: { kind: "numeric", higherBetter: true },
  stealth20: { kind: "numeric", higherBetter: true },
  stealth5: { kind: "numeric", higherBetter: true },
  top20_alpha: { kind: "numeric", higherBetter: true },
  sepa_s2: { kind: "flag", higherBetter: true, labels: L({ 1: "Đạt", 0: "Không" }) },
  net_intent: { kind: "numeric", higherBetter: true },
  smart_score: { kind: "numeric", higherBetter: true },
  rs_rating: { kind: "numeric", higherBetter: true },
  ta_score: { kind: "numeric", higherBetter: true },
  fa_score: { kind: "numeric", higherBetter: true },
  risk_adj_mom: { kind: "numeric", higherBetter: true },
  foreign_net_buy: { kind: "flag", higherBetter: true, labels: L({ 1: "Mua ròng", 0: "Không" }) },
  mom5_atr: { kind: "numeric", higherBetter: true },
  log_rvol: { kind: "numeric", higherBetter: null },
  sepa_state: { kind: "ordinal", higherBetter: true, labels: L({ 2: "Phá vỡ", 1: "Gần pivot", 0.5: "Đang hình thành", 0: "—", [-0.5]: "Co thắt", [-1]: "Thất bại" }) },
  pattern_state: { kind: "ordinal", higherBetter: true, labels: L({ 1: "Tăng: phá vỡ / xác nhận", 0.5: "Tăng: mục tiêu 1 / kéo ngược", 0.25: "Tăng: đang hình thành", 0: "—", [-0.25]: "Giảm: đang hình thành", [-0.5]: "Giảm: mục tiêu 1 / kéo ngược", [-1]: "Giảm: phá vỡ / xác nhận" }) },
  convergence: { kind: "ordinal", higherBetter: true, labels: L({ 3: "Mua hạng A", 2: "Mua hạng B", 1: "Mua hạng C", 0: "—", [-1]: "Bán hạng C", [-2]: "Bán hạng B", [-3]: "Bán hạng A" }) },
  base_breakout: { kind: "ordinal", higherBetter: true, labels: L({ 3: "Hạng A", 2: "Hạng B", 1: "Hạng C", 0: "—" }) },
  rrg_quadrant: { kind: "ordinal", higherBetter: true, labels: L({ 2: "Dẫn dắt", 1: "Cải thiện", [-1]: "Suy yếu", [-2]: "Tụt hậu" }) },
  catalyst_impact: { kind: "numeric", higherBetter: true },
  cotuc_decision: { kind: "ordinal", higherBetter: true, labels: L({ 1: "Thuận lợi", 0: "Theo dõi", [-1]: "Tránh" }) },
  structure_stage: { kind: "ordinal", higherBetter: true, labels: L({ 2: "Tăng", 1.5: "B · tái tích luỹ", 1: "A · tích luỹ", 0: "Đi ngang", [-0.5]: "C", [-1]: "B′", [-1.5]: "D · phân phối", [-2]: "Giảm" }) },
  structure_score: { kind: "numeric", higherBetter: true },
  structure_verdict: { kind: "ordinal", higherBetter: true, labels: L({ 2: "MUA", 1: "CHỜ MUA", 0: "ĐỨNG NGOÀI", [-1]: "GIẢM TỶ TRỌNG", [-2]: "BÁN" }) },
};
export const metaOf = (id: string): SigMeta => SIG_META[id] ?? { kind: "numeric", higherBetter: true };
export const labelOf = (id: string, v: number | null | undefined) => (v == null ? null : metaOf(id).labels?.[String(v)] ?? null);

/** Nút điều kiện: `sig` để lấy bậc bằng chứng; "V" = vùng mua v3 đạt kiểm định; "—" = điều kiện thanh khoản. */
export interface Chip { id: string; label: string; group: string; sig: string; cond: Cond; title?: string }
export const CHIPS: Chip[] = [
  { id: "st20", group: "Dòng tiền (Siêu quét AI)", sig: "stealth20", label: "◆ Stealth 20 ≥ +1,5", cond: { sig: "stealth20", op: ">=", val: 1.5 }, title: "Tích luỹ âm thầm 20 phiên (z ≥ 1,5)" },
  { id: "st20p", group: "Dòng tiền (Siêu quét AI)", sig: "stealth20", label: "Stealth 20 top 30%", cond: { sig: "stealth20", op: "p>=", val: 70 } },
  { id: "st5", group: "Dòng tiền (Siêu quét AI)", sig: "stealth5", label: "◆ Stealth 5 ≥ +1,5", cond: { sig: "stealth5", op: ">=", val: 1.5 } },
  { id: "st5p", group: "Dòng tiền (Siêu quét AI)", sig: "stealth5", label: "Stealth 5 top 30%", cond: { sig: "stealth5", op: "p>=", val: 70 } },
  { id: "intent", group: "Dòng tiền (Siêu quét AI)", sig: "net_intent", label: "Ý đồ IFE tích luỹ (≥ 0,5)", cond: { sig: "net_intent", op: ">=", val: 0.5 } },
  { id: "fnb", group: "Dòng tiền (Siêu quét AI)", sig: "foreign_net_buy", label: "Khối ngoại mua ròng", cond: { sig: "foreign_net_buy", op: "==", val: 1 } },
  { id: "top20", group: "Ngành", sig: "top20_alpha", label: "Alpha M1 (Top 20) top 30%", cond: { sig: "top20_alpha", op: "p>=", val: 70 } },
  { id: "wsa", group: "Ngành", sig: "ws_sector_alpha", label: "Ngành thuận gió thế giới (α > 0)", cond: { sig: "ws_sector_alpha", op: ">=", val: 0.001 } },
  { id: "rrg", group: "Ngành", sig: "rrg_quadrant", label: "RRG ngành Dẫn dắt / Cải thiện", cond: { sig: "rrg_quadrant", op: "in", val: [1, 2] } },
  { id: "sepa2", group: "Kỹ thuật (TA VN-Index)", sig: "sepa_s2", label: "SEPA phá vỡ đạt chuẩn (S2)", cond: { sig: "sepa_s2", op: "==", val: 1 } },
  { id: "sepaRdy", group: "Kỹ thuật (TA VN-Index)", sig: "sepa_state", label: "SEPA gần pivot / phá vỡ", cond: { sig: "sepa_state", op: "in", val: [1, 2] } },
  { id: "pring", group: "Kỹ thuật (TA VN-Index)", sig: "pattern_state", label: "Mô hình Pring tăng", cond: { sig: "pattern_state", op: ">=", val: 0.5 } },
  { id: "conv", group: "Kỹ thuật (TA VN-Index)", sig: "convergence", label: "Hợp lưu mua ≥ hạng B", cond: { sig: "convergence", op: ">=", val: 2 } },
  { id: "bb", group: "Kỹ thuật (TA VN-Index)", sig: "base_breakout", label: "Base Breakout ≥ hạng B", cond: { sig: "base_breakout", op: ">=", val: 2 } },
  { id: "stage", group: "Kỹ thuật (TA VN-Index)", sig: "structure_stage", label: "Cấu trúc ngày: Tăng / tái tích luỹ", cond: { sig: "structure_stage", op: "in", val: [1.5, 2] } },
  { id: "sscore", group: "Kỹ thuật (TA VN-Index)", sig: "structure_score", label: "Bảng kiểm kỹ thuật ≥ 6/8", cond: { sig: "structure_score", op: ">=", val: 6 } },
  { id: "verdict", group: "Kỹ thuật (TA VN-Index)", sig: "structure_verdict", label: "Đa khung: MUA / CHỜ MUA", cond: { sig: "structure_verdict", op: "in", val: [1, 2] } },
  { id: "smart60", group: "Điểm tổng hợp", sig: "smart_score", label: "Smart Score ≥ 60", cond: { sig: "smart_score", op: ">=", val: 60 } },
  { id: "rs80", group: "Điểm tổng hợp", sig: "rs_rating", label: "Sức mạnh giá RS ≥ 80", cond: { sig: "rs_rating", op: ">=", val: 80 } },
  { id: "fa60", group: "Điểm tổng hợp", sig: "fa_score", label: "Điểm cơ bản ≥ 60", cond: { sig: "fa_score", op: ">=", val: 60 } },
  { id: "ram", group: "Điểm tổng hợp", sig: "risk_adj_mom", label: "Động lượng điều chỉnh rủi ro top 30%", cond: { sig: "risk_adj_mom", op: "p>=", val: 70 } },
  { id: "cat", group: "Sự kiện", sig: "catalyst_impact", label: "Hưởng lợi chất xúc tác", cond: { sig: "catalyst_impact", op: ">=", val: 1 } },
  { id: "cotuc", group: "Sự kiện", sig: "cotuc_decision", label: "Cổ tức: Thuận lợi", cond: { sig: "cotuc_decision", op: "==", val: 1 } },
  { id: "buyzone", group: "Sự kiện", sig: "_buyzone", label: "⏱ Vùng mua ĐẠT trong 10 phiên", cond: { sig: "_buyzone", op: "==", val: 1 }, title: "Vùng mua cổ tức / KQKD đã qua kiểm định v3, đang mở hoặc bắt đầu ≤ 10 phiên (Timeline tab Cổ tức)" },
  { id: "adv20", group: "Thanh khoản", sig: "_adv", label: "GTGD TB20 ≥ 20 tỷ", cond: { sig: "_adv", op: ">=", val: 20 } },
  { id: "adv50", group: "Thanh khoản", sig: "_adv", label: "GTGD TB20 ≥ 50 tỷ", cond: { sig: "_adv", op: ">=", val: 50 } },
];
/** Điều kiện LOẠI TRỪ gợi ý (bấm nút lần 2 trên chip thường cũng thành loại trừ). */
export const EXCLUDE_CHIPS: Chip[] = [
  { id: "x_dist", group: "Loại trừ", sig: "stealth20", label: "Loại: Stealth 20 phân phối (≤ −1,5)", cond: { sig: "stealth20", op: "<=", val: -1.5 } },
  { id: "x_down", group: "Loại trừ", sig: "structure_stage", label: "Loại: cấu trúc D / Giảm", cond: { sig: "structure_stage", op: "<=", val: -1.5 } },
  { id: "x_lag", group: "Loại trừ", sig: "rrg_quadrant", label: "Loại: ngành Tụt hậu", cond: { sig: "rrg_quadrant", op: "==", val: -2 } },
  { id: "x_weak", group: "Loại trừ", sig: "rs_rating", label: "Loại: RS ≤ 30 (yếu)", cond: { sig: "rs_rating", op: "<=", val: 30 } },
];
export const ALL_CHIPS = [...CHIPS, ...EXCLUDE_CHIPS];
export const CHIP_BY_ID = new Map(ALL_CHIPS.map((c) => [c.id, c]));

/** Trạng thái giao diện của bộ lọc: chip -> "on" (yêu cầu) / "not" (loại trừ). */
export interface FilterUi { name: string; on: string[]; not: string[]; mode: "all" | "k"; k: number; neutral: boolean; eligibleOnly: boolean }
export const PRESETS: { id: string; label: string; title: string; ui: FilterUi }[] = [
  { id: "ab", label: "Chỉ bằng chứng A/B", title: "≥ 2 trong 5 điều kiện từ tín hiệu bậc A/B (có trọng số trong Điểm Elite)",
    ui: { name: "Chỉ bằng chứng A/B", on: ["st20p", "st5p", "top20", "sepa2", "wsa"], not: [], mode: "k", k: 2, neutral: false, eligibleOnly: true } },
  { id: "stealth", label: "Dòng tiền ẩn", title: "Stealth 20 hoặc 5 tích luỹ, loại mã đang phân phối",
    ui: { name: "Dòng tiền ẩn", on: ["st20", "st5"], not: ["x_dist"], mode: "k", k: 1, neutral: false, eligibleOnly: true } },
  { id: "breakout", label: "Breakout + dòng tiền", title: "≥ 2: SEPA gần pivot/phá vỡ, Base Breakout ≥ B, Stealth 20 top 30%; loại cấu trúc giảm",
    ui: { name: "Breakout + dòng tiền", on: ["sepaRdy", "bb", "st20p"], not: ["x_down"], mode: "k", k: 2, neutral: false, eligibleOnly: true } },
  { id: "season", label: "Vùng mua mùa vụ", title: "Có vùng mua cổ tức / KQKD ĐẠT kiểm định trong 10 phiên, loại mã đang phân phối",
    ui: { name: "Vùng mua mùa vụ", on: ["buyzone"], not: ["x_dist"], mode: "all", k: 1, neutral: false, eligibleOnly: true } },
];
export const DEFAULT_UI = PRESETS[0].ui;

/** Giao diện -> bộ lọc gửi Gateway (trung lập ngành áp cho điều kiện phân vị). */
export function uiToFilter(ui: FilterUi): EliteFilter {
  const cond = (id: string): Cond | null => { const c = CHIP_BY_ID.get(id); if (!c) return null; return c.cond.op === "p>=" && ui.neutral ? { ...c.cond, neutral: true } : { ...c.cond }; };
  const conds = ui.on.map(cond).filter((c): c is Cond => c != null);
  return { v: 1, name: ui.name, conds, not: ui.not.map(cond).filter((c): c is Cond => c != null), mode: ui.mode, ...(ui.mode === "k" ? { k: Math.max(1, Math.min(conds.length || 1, ui.k)) } : {}), eligibleOnly: ui.eligibleOnly };
}
/** Bộ lọc đã lưu -> giao diện (điều kiện không khớp chip nào bị bỏ, có báo). */
export function filterToUi(f: EliteFilter): { ui: FilterUi; dropped: number } {
  const key = (c: Cond) => `${c.sig}|${c.op}|${JSON.stringify(c.val)}`;
  const byKey = new Map(ALL_CHIPS.map((c) => [key(c.cond), c.id]));
  const on = f.conds.map((c) => byKey.get(key(c))).filter((x): x is string => Boolean(x));
  const not = (f.not ?? []).map((c) => byKey.get(key(c))).filter((x): x is string => Boolean(x));
  return {
    ui: { name: f.name ?? "Bộ lọc của tôi", on, not, mode: f.mode, k: f.k ?? 1, neutral: f.conds.some((c) => c.neutral), eligibleOnly: f.eligibleOnly !== false },
    dropped: f.conds.length + (f.not?.length ?? 0) - on.length - not.length,
  };
}
