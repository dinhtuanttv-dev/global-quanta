// scanOutputSchema.js — Discriminated union theo `mode`: "structured"
// (technical_layer/pattern_layer thật) hoặc "vision" (macro_layer/
// tactical_layer/quant_layer từ Vision Capture + AI Vision, giữ lại theo
// yêu cầu). Cả 2 dùng chung consensus_verdict/risk_management/ai_synthesis.

import { z } from "zod";

const oscillatorsSchema = z.object({
  rsi: z.number().nullable(),
  macd: z.object({ value: z.number(), signal: z.number(), histogram: z.number(), label: z.string() }).nullable(),
  adx: z.object({ value: z.number(), signal: z.string() }).nullable(),
});

const patternStatSchema = z.object({
  patternType: z.string(),
  sampleSize: z.number(),
  timeoutCount: z.number(),
  successRatePct: z.number().nullable(),
  avgBarsToOutcome: z.number().nullable(),
  avgReturnPct: z.number().nullable(),
  lowSampleWarning: z.boolean(),
});

const checklistItemSchema = z.object({ label: z.string(), passed: z.boolean(), detail: z.string() });

const consensusVerdictSchema = z.object({
  macro_aligned: z.boolean(),
  final_bias: z.string(),
  confidence_score_bayesian: z.number(),
  confidence_tier: z.enum(["Thấp", "Trung bình", "Cao"]),
  prior_source: z.string(),
  ensemble_agreement: z.number().min(0).max(1),
  ensemble_agreement_is_real: z.boolean(),
  synthesis_disagreement: z.boolean(),
  invalidation_level: z.number().nullable(),
});

const riskManagementSchema = z.object({
  suggested_position_size_pct: z.number(),
  regime: z.string(),
});

const aiSynthesisSchema = z.object({
  models_used: z.array(z.string()),
  main_thesis: z.string(),
  supporting_evidence_fields: z.array(z.string()),
  conflicting_factors: z.array(z.string()),
  conditional_conclusion: z.string(),
  checklist: z.array(checklistItemSchema),
});

const structuredModeSchema = z.object({
  mode: z.literal("structured"),
  scan_timestamp: z.string(),
  target: z.string(),
  timeframe: z.string(),
  is_historical_data_mock: z.boolean(),
  historical_data_source: z.string(),
  technical_layer: oscillatorsSchema,
  pattern_layer: z.array(patternStatSchema),
  consensus_verdict: consensusVerdictSchema,
  risk_management: riskManagementSchema,
  ai_synthesis: aiSynthesisSchema,
  actionable_insight: z.string(),
});

// macro_layer/tactical_layer/quant_layer: giữ lỏng (z.any()) vì đây là dữ
// liệu do Vision AI tự do diễn giải từ ảnh, cấu trúc chi tiết bên trong có
// thể thay đổi theo model — điều quan trọng cần validate chặt là các field
// dùng chung (consensus_verdict/risk_management/ai_synthesis), không phải
// từng field lẻ bên trong output của Vision AI.
const visionModeSchema = z.object({
  mode: z.literal("vision"),
  scan_timestamp: z.string(),
  target: z.string(),
  timeframe: z.string(),
  is_historical_data_mock: z.boolean(),
  historical_data_source: z.string(),
  data_completeness_flag: z.enum(["FULL", "DEGRADED_MODE"]),
  macro_layer: z.any(),
  tactical_layer: z.any(),
  quant_layer: z.any(),
  consensus_verdict: consensusVerdictSchema,
  risk_management: riskManagementSchema,
  ai_synthesis: aiSynthesisSchema,
  actionable_insight: z.string(),
});

export const scanOutputSchema = z.discriminatedUnion("mode", [structuredModeSchema, visionModeSchema]);

export function validateScanOutput(data) {
  const result = scanOutputSchema.safeParse(data);
  if (!result.success) {
    return { valid: false, errors: result.error.flatten() };
  }
  return { valid: true, data: result.data };
}
