// Chi phí tác động thị trường ước tính theo luật căn bậc hai (square-root impact; Almgren và cộng sự 2005, Tóth và cộng sự 2011):
//   chi phí ≈ Y · σ_ngày · √(Q / ADV)
// σ_ngày = độ lệch chuẩn lợi suất ngày 60 phiên, ADV = GTGD TB 60 phiên, Q = giá trị lệnh (đồng). Y = 1 (cận thận trọng của dải
// 0,5–1 trong tài liệu), CHƯA hiệu chỉnh cho HOSE/HNX. Chỉ để HIỂN THỊ — không đổi điểm hay thứ hạng Top 20.
// Luật chỉ đúng khi lệnh nhỏ so với thanh khoản: Q / ADV > 10% -> gắn cờ kém tin cậy.

export const IMPACT_Y = 1;
export const IMPACT_MAX_PARTICIPATION = 0.1;
export const IMPACT_ORDER_SIZES = [1e9, 5e9, 10e9] as const;

export interface ImpactEstimate { orderValue: number; participation: number; costPct: number; unreliable: boolean }

/** Một lệnh; thiếu σ hoặc ADV (hoặc không hợp lệ) -> null (không đoán). */
export function sqrtImpact(sigmaDaily: number | null | undefined, adv: number | null | undefined, orderValue: number, y = IMPACT_Y): ImpactEstimate | null {
  if (!(sigmaDaily != null && Number.isFinite(sigmaDaily) && sigmaDaily > 0 && adv != null && Number.isFinite(adv) && adv > 0 && orderValue > 0)) return null;
  const participation = orderValue / adv;
  return { orderValue, participation, costPct: y * sigmaDaily * Math.sqrt(participation) * 100, unreliable: participation > IMPACT_MAX_PARTICIPATION };
}

/** σ ngày từ yếu tố lowVol60 (giá trị thô = −σ). */
export function sigmaFromLowVol(raw: number | null | undefined): number | null {
  return raw != null && Number.isFinite(raw) && raw < 0 ? -raw : null;
}
