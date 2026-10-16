/**
 * world-evidence.ts — evidence tiers for every link in the world → Vietnam chain.
 *   A: significant after multiple-testing correction AND stable over time AND passes out-of-sample
 *   B: significant after multiple-testing correction
 *   C: hypothesis (mechanism, graph or AI-extracted) or not significant
 */
import type { EvidenceTier } from './world-types';

export interface EvidenceInput {
  q: number;
  alpha?: number;
  stable?: boolean | null;
  oosPass?: boolean | null;
  isHypothesis?: boolean;
}

export function assignTier(i: EvidenceInput): { tier: EvidenceTier; reasonVi: string } {
  const alpha = i.alpha ?? 0.05;
  if (i.isHypothesis) return { tier: 'C', reasonVi: 'Là giả thuyết (cơ chế kinh tế, đồ thị hoặc tin do AI trích); chưa được số liệu xác nhận.' };
  if (!(i.q < alpha)) return { tier: 'C', reasonVi: 'Chưa vượt hiệu chỉnh kiểm định bội; chưa đủ bằng chứng.' };
  if (i.stable === true && i.oosPass === true) return { tier: 'A', reasonVi: 'Vượt hiệu chỉnh kiểm định bội, ổn định theo thời gian và vượt kiểm định ngoài mẫu.' };
  const gaps: string[] = [];
  if (i.stable !== true) gaps.push(i.stable === false ? 'không ổn định theo thời gian' : 'chưa kiểm tra độ ổn định');
  if (i.oosPass !== true) gaps.push(i.oosPass === false ? 'chưa vượt kiểm định ngoài mẫu' : 'chưa kiểm tra ngoài mẫu');
  return { tier: 'B', reasonVi: `Có ý nghĩa thống kê sau hiệu chỉnh nhưng ${gaps.join(' và ')}.` };
}

/** A stock's tier never exceeds its sector's; it keeps the sector tier only when its own estimate is significant. */
export function stockTier(sector: EvidenceTier, ownSignificant: boolean): EvidenceTier {
  if (sector === 'C') return 'C';
  if (sector === 'A') return ownSignificant ? 'A' : 'B';
  return ownSignificant ? 'B' : 'C';
}

export function summarizeTiers(tiers: EvidenceTier[]): Record<EvidenceTier, number> {
  const out: Record<EvidenceTier, number> = { A: 0, B: 0, C: 0 };
  for (const t of tiers) out[t]++;
  return out;
}
