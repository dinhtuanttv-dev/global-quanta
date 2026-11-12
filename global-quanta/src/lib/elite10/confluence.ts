// HL-v1 (12/11/2026) — HỢP LƯU ĐA YẾU TỐ theo quy tắc của chủ dự án, tính trên bảng tín hiệu E1 (không thêm nguồn dữ liệu):
//   Tầng 1 (ưu tiên đầu tiên): Sức mạnh dẫn dắt LS-v1 + các mô hình TA VN-Index.
//   Tầng 2: RRG ngành — Cải thiện / Dẫn dắt = ỦNG HỘ; Suy yếu / Tụt hậu = PHẢN ĐỐI.
//   Tầng 3: tích điểm các yếu tố của các tab còn lại (+1 ủng hộ / −1 phản đối).
//   Xếp hạng theo đúng thứ tự ưu tiên: đạt tầng 1 -> điểm tầng 1 -> tầng 2 -> tầng 3.
// Đây là QUY TẮC LỌC / XẾP HẠNG (nhãn THĂM DÒ): không thay Điểm Elite, không đổi Danh mục Elite 10. Hàm thuần — kiểm thử được.

export const HL_VERSION = "HL-v1 (12/11/2026)";
/** Kết quả kiểm tra lịch sử KHÁM PHÁ của cấu trúc này (vũ trụ đúng thời điểm 07/2020–09/2026, 20 phiên, 20 pha lấy mẫu). */
export const HL_EVIDENCE_VI = "Quy tắc do chủ dự án đặt — nhãn THĂM DÒ, chưa qua kiểm định đăng ký trước. Kiểm tra lịch sử khám phá (vũ trụ đúng thời điểm 07/2020–09/2026, mô hình TA đại diện bằng Trend Template): nhóm đạt tầng 1 + RRG ủng hộ vượt trung bình +0,39% / 20 phiên (t 0,59) — chưa có ý nghĩa thống kê; riêng ngành Dẫn dắt +1,04%, ngành Cải thiện −0,45%. Mô tả, không phải khuyến nghị.";

export type Values = Record<string, number | null | undefined>;
export interface HlRowIn { ticker: string; values: Values }
export interface HlModel { id: string; label: string; ok: boolean | null }
export interface HlFactor { id: string; tab: string; label: string; pts: -1 | 0 | 1 }
export type HlClass = "STRONG" | "CONFLUENCE" | "T1_SECTOR_AGAINST" | "T1_SECTOR_NA" | "NOT_T1";
export interface HlResult {
  ticker: string;
  lsPct: number | null; lsPts: number;
  taModels: HlModel[]; taCount: number; taKnown: number; taPts: number;
  t1: number; pass1: boolean;
  rrg: number | null; t2: -1 | 0 | 1;
  factors: HlFactor[]; t3: number;
  cls: HlClass; rank: number;
}
export const HL_CLASS_VI: Record<HlClass, string> = {
  STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Dẫn dắt · ngành phản đối", T1_SECTOR_NA: "Dẫn dắt · chưa có RRG ngành", NOT_T1: "Chưa đạt tầng 1",
};
export const HL_RULES = Object.freeze({ lsLeaderPct: 80, taMin: 2, strongT3: 2 });

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
/** Phân vị hạng giữa (0–100) của từng mã cho một tín hiệu. */
export function midPercentiles(rows: HlRowIn[], sig: string): Map<string, number> {
  const list = rows.map((r) => [r.ticker, r.values[sig]] as const).filter((x): x is readonly [string, number] => num(x[1]));
  const sorted = list.map((x) => x[1]).sort((a, b) => a - b), out = new Map<string, number>();
  for (const [t, v] of list) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let eq = lo; while (eq < sorted.length && sorted[eq] === v) eq++;
    out.set(t, ((lo + (eq - lo) / 2) / sorted.length) * 100);
  }
  return out;
}

/** Bảy mô hình TA của tab TA VN-Index (thang mã hoá đúng signalRegistry.js). null = chưa có dữ liệu cho mã. */
const TA_MODELS: { id: string; sig: string; label: string; ok: (v: number) => boolean }[] = [
  { id: "sepa", sig: "sepa_state", label: "SEPA gần pivot / phá vỡ", ok: (v) => v >= 1 },
  { id: "bb", sig: "base_breakout", label: "Base Breakout ≥ hạng B", ok: (v) => v >= 2 },
  { id: "conv", sig: "convergence", label: "Hợp lưu v2 mua ≥ hạng B", ok: (v) => v >= 2 },
  { id: "pring", sig: "pattern_state", label: "Mô hình giá Pring tăng", ok: (v) => v >= 0.5 },
  { id: "tt", sig: "structure_score", label: "Trend Template ≥ 6/7", ok: (v) => v >= 6 },
  { id: "stage", sig: "structure_stage", label: "Giai đoạn 2 Minervini", ok: (v) => v === 2 },
  { id: "dow", sig: "structure_verdict", label: "Dow khung Ngày tăng", ok: (v) => v === 2 },
];
/** Nhãn điều kiện tầng 1 theo mã tín hiệu và nhãn phiếu tầng 3 — dùng cho thẻ "Vì sao" của Bảng quyết định (dữ liệu do Gateway xuất). */
export const HL_TA_LABELS: Record<string, string> = Object.fromEntries(TA_MODELS.map((m) => [m.sig, m.label]));
export const HL_VOTE_LABELS: Record<string, { tab: string; label: string }> = {
  stealth20: { tab: "Tổng quan", label: "Stealth 20" }, stealth5: { tab: "Tổng quan", label: "Stealth 5" }, net_intent: { tab: "Tổng quan", label: "Ý đồ dòng tiền IFE" },
  foreign_net_buy: { tab: "Tổng quan", label: "Khối ngoại mua ròng" }, fa_score: { tab: "Tổng quan", label: "Điểm cơ bản" }, ws_sector_alpha: { tab: "Kết nối thế giới", label: "α ngành thế giới" },
  top20_alpha: { tab: "Phân tích ngành", label: "Alpha M1 Top 20" }, catalyst_impact: { tab: "Phân tích vĩ mô", label: "Chất xúc tác" }, cotuc_decision: { tab: "Phân tích cơ bản", label: "Cổ tức" },
};
const lsPoints = (pct: number | null) => (pct == null ? 0 : pct >= 80 ? 5 : pct >= 60 ? 3 : pct >= 40 ? 1 : 0);
const sign = (v: number | null | undefined, up: (x: number) => boolean, down: (x: number) => boolean): -1 | 0 | 1 | null => (num(v) ? (up(v) ? 1 : down(v) ? -1 : 0) : null);

/** Điểm HL-v1 cho mọi mã của bảng tín hiệu. */
export function hlScores(rows: HlRowIn[]): Map<string, HlResult> {
  const lsP = midPercentiles(rows, "ls_v1"), topP = midPercentiles(rows, "top20_alpha");
  const list: HlResult[] = rows.map((r) => {
    const v = r.values;
    const lsPct = lsP.get(r.ticker) ?? null, lsPts = lsPoints(lsPct);
    const taModels = TA_MODELS.map((m) => ({ id: m.id, label: m.label, ok: num(v[m.sig]) ? m.ok(v[m.sig] as number) : null }));
    const taCount = taModels.filter((m) => m.ok === true).length, taKnown = taModels.filter((m) => m.ok !== null).length;
    const taPts = Math.min(5, taCount);
    const pass1 = lsPct != null && lsPct >= HL_RULES.lsLeaderPct && taCount >= HL_RULES.taMin;
    const rrg = num(v.rrg_quadrant) ? (v.rrg_quadrant as number) : null;
    const t2: -1 | 0 | 1 = rrg == null ? 0 : rrg >= 1 ? 1 : rrg <= -1 ? -1 : 0;
    const f: [string, string, string, -1 | 0 | 1 | null][] = [
      ["stealth20", "Tổng quan", "Stealth 20 (≥ +1 / ≤ −1,5)", sign(v.stealth20, (x) => x >= 1, (x) => x <= -1.5)],
      ["stealth5", "Tổng quan", "Stealth 5 (≥ +1,5)", sign(v.stealth5, (x) => x >= 1.5, () => false)],
      ["net_intent", "Tổng quan", "Ý đồ dòng tiền IFE (≥ +0,5 / ≤ −0,5)", sign(v.net_intent, (x) => x >= 0.5, (x) => x <= -0.5)],
      ["foreign_net_buy", "Tổng quan", "Khối ngoại mua ròng", sign(v.foreign_net_buy, (x) => x === 1, () => false)],
      ["fa_score", "Tổng quan", "Điểm cơ bản (≥ 60 / ≤ 30)", sign(v.fa_score, (x) => x >= 60, (x) => x <= 30)],
      ["ws_sector_alpha", "Kết nối thế giới", "α ngành thế giới (> 0 / < 0)", sign(v.ws_sector_alpha, (x) => x > 0, (x) => x < 0)],
      ["top20_alpha", "Phân tích ngành", "Alpha M1 Top 20 (top 30% / đáy 30%)", topP.has(r.ticker) ? ((topP.get(r.ticker) as number) >= 70 ? 1 : (topP.get(r.ticker) as number) <= 30 ? -1 : 0) : null],
      ["catalyst_impact", "Phân tích vĩ mô", "Chất xúc tác (hưởng lợi / bất lợi)", sign(v.catalyst_impact, (x) => x >= 1, (x) => x <= -1)],
      ["cotuc_decision", "Phân tích cơ bản", "Cổ tức (thuận lợi / tránh)", sign(v.cotuc_decision, (x) => x === 1, (x) => x === -1)],
    ];
    const factors: HlFactor[] = f.filter((x) => x[3] !== null).map(([id, tab, label, pts]) => ({ id, tab, label, pts: pts as -1 | 0 | 1 }));
    const t3 = factors.reduce((a, x) => a + x.pts, 0);
    const cls: HlClass = !pass1 ? "NOT_T1" : t2 > 0 ? (t3 >= HL_RULES.strongT3 ? "STRONG" : "CONFLUENCE") : t2 < 0 ? "T1_SECTOR_AGAINST" : "T1_SECTOR_NA";
    return { ticker: r.ticker, lsPct, lsPts, taModels, taCount, taKnown, taPts, t1: lsPts + taPts, pass1, rrg, t2, factors, t3, cls, rank: 0 };
  });
  list.sort(hlCompare).forEach((x, i) => { x.rank = i + 1; });
  return new Map(list.map((x) => [x.ticker, x]));
}

/** Thứ tự ưu tiên: đạt tầng 1 -> điểm tầng 1 -> tầng 2 -> tầng 3 -> phân vị LS-v1 -> mã. */
export function hlCompare(a: HlResult, b: HlResult): number {
  return Number(b.pass1) - Number(a.pass1) || b.t1 - a.t1 || b.t2 - a.t2 || b.t3 - a.t3 || (b.lsPct ?? -1) - (a.lsPct ?? -1) || a.ticker.localeCompare(b.ticker);
}
export const hlSelected = (r: HlResult | undefined) => Boolean(r && (r.cls === "STRONG" || r.cls === "CONFLUENCE"));
