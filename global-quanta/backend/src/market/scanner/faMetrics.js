// Siêu Quét v2 (Q2) — chỉ số BCTC đúng kỳ, thay cho cách đọc của Project A (formulas.js giữ nguyên để đối chiếu):
//   - ROE, biên lợi nhuận: 4 QUÝ GẦN NHẤT (TTM), không phải 1 quý (méo theo mùa vụ). ROE = LNST công ty mẹ TTM / VCSH bình
//     quân (đầu kỳ cùng quý năm trước, cuối kỳ quý gần nhất).
//   - Tăng trưởng doanh thu: TTM so TTM CÙNG KỲ năm trước (cần 8 quý liên tiếp); thiếu thì quý gần nhất so CÙNG QUÝ năm
//     trước. Bản cũ so quý mới nhất với quý cách 3 quý (quarters[3]) -> sai dấu (SSI −20,5% so với +10,9% thật).
//   - Quý được khớp theo (năm, quý), không theo vị trí trong mảng -> quý thiếu không làm lệch kỳ so sánh.
//   - Thiếu dữ liệu -> null (KHÔNG gán 0 rồi đưa vào xếp hạng phân vị).
//   - F-Score (Piotroski rút gọn 6 tiêu chí): KHÔNG áp dụng cho ngân hàng / chứng khoán / bảo hiểm (mẫu BCTC không có lợi nhuận
//     gộp, TSNH, nợ ngắn hạn -> trước đây ngân hàng luôn 2/6 và bị "loại"); doanh nghiệp đánh giá được < 4/6 tiêu chí -> null.
import { calculateFScoreLite } from "./formulas.js";

export const FINANCIAL_KINDS = new Set(["bank", "insurance", "securities"]);
const FINANCIAL_INDUSTRY = { "Ngân hàng": "bank", "Chứng khoán": "securities", "Bảo hiểm": "insurance" };
export const FSCORE_MIN_EVALUATED = 4;

const pidx = (q) => q.year * 4 + (q.quarter - 1);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** Loại doanh nghiệp: theo mẫu BCTC VCI (q.kind), dự phòng theo ngành (bản lưu cũ chưa có kind). */
export function companyKind(fa, industry = null) {
  const k = fa?.income?.quarters?.find((q) => q.kind)?.kind ?? fa?.balance?.quarters?.find((q) => q.kind)?.kind ?? null;
  if (k) return k;
  return FINANCIAL_INDUSTRY[industry] ?? null;
}

/** Tổng 4 quý liên tiếp kết thúc ở chỉ số kỳ `p` (null nếu thiếu quý / thiếu giá trị). */
function ttm(byP, p, field) {
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const v = byP.get(p - k)?.[field];
    if (!finite(v)) return null;
    s += v;
  }
  return s;
}

/**
 * @param {{ income?: { available, quarters }, balance?: { available, quarters } } | undefined} fa  quý mới nhất trước (VCI)
 * @param {{ industry?: string|null }} [opts]
 */
export function faMetrics(fa, { industry = null } = {}) {
  const inc = fa?.income?.available ? fa.income.quarters ?? [] : [];
  const bal = fa?.balance?.available ? fa.balance.quarters ?? [] : [];
  const kind = companyKind(fa, industry);
  const financial = FINANCIAL_KINDS.has(kind);
  const empty = { roe: null, netMargin: null, revenueGrowth: null, growthBasis: null, leverage: null, kind, financial, period: null,
    fScore: { score: null, max: 6, evaluated: 0, applicable: !financial, reason: financial ? "FINANCIAL" : "NO_DATA" } };
  if (!inc.length) return empty;

  const I = new Map(inc.map((q) => [pidx(q), q]));
  const B = new Map(bal.map((q) => [pidx(q), q]));
  const p0 = Math.max(...I.keys());
  const b0 = B.get(p0) ?? null, b4 = B.get(p0 - 4) ?? null;

  const npT = ttm(I, p0, "netProfit");
  const revT = ttm(I, p0, "revenue");
  const eq0 = finite(b0?.totalEquity) && b0.totalEquity > 0 ? b0.totalEquity : null;
  const eq4 = finite(b4?.totalEquity) && b4.totalEquity > 0 ? b4.totalEquity : null;
  const avgEq = eq0 !== null ? (eq4 !== null ? (eq0 + eq4) / 2 : eq0) : null;

  const roe = npT !== null && avgEq !== null ? npT / avgEq : null;
  const netMargin = npT !== null && revT !== null && revT > 0 ? npT / revT : null;

  let revenueGrowth = null, growthBasis = null;
  const revPrev = ttm(I, p0 - 4, "revenue");
  if (revT !== null && revT > 0 && revPrev !== null && revPrev > 0) { revenueGrowth = revT / revPrev - 1; growthBasis = "TTM_YOY"; }
  else {
    const r0 = I.get(p0)?.revenue, r4 = I.get(p0 - 4)?.revenue;
    if (finite(r0) && r0 > 0 && finite(r4) && r4 > 0) { revenueGrowth = r0 / r4 - 1; growthBasis = "QUARTER_YOY"; }
  }
  const leverage = eq0 !== null && finite(b0?.totalLiabilities) && b0.totalLiabilities >= 0 ? b0.totalLiabilities / eq0 : null;

  let fScore;
  if (financial) fScore = { score: null, max: 6, evaluated: 0, applicable: false, reason: "FINANCIAL" };
  else {
    const q0 = I.get(p0), q4 = I.get(p0 - 4);
    const pick = (q, b) => ({
      netProfit: q?.netProfit ?? null, totalAssets: b?.totalAssets ?? null, longTermDebt: b?.longTermDebt ?? null,
      currentAssets: b?.currentAssets ?? null, currentLiabilities: b?.currentLiabilities ?? null,
      revenue: q?.revenue ?? null, grossProfit: q?.grossProfit ?? null,
    });
    const r = calculateFScoreLite(pick(q0, b0), q4 && b4 ? pick(q4, b4) : null);
    const evaluated = Object.values(r.details).filter((v) => v !== null).length;
    fScore = evaluated >= FSCORE_MIN_EVALUATED
      ? { score: r.score, max: r.maxScore, evaluated, applicable: true, reason: null }
      : { score: null, max: r.maxScore, evaluated, applicable: true, reason: "INSUFFICIENT" };
  }
  const q0 = I.get(p0);
  return { roe, netMargin, revenueGrowth, growthBasis, leverage, kind, financial, period: `Q${q0.quarter}/${q0.year}`, fScore };
}
