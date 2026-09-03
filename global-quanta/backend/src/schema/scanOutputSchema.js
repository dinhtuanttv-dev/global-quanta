// Chuẩn hóa JSON Output — tương ứng Mục 9 của tài liệu kỹ thuật.
// Mọi field số phải được validate kiểu dữ liệu trước khi frontend/hệ thống
// khác sử dụng, vì LLM đôi khi trả sai kiểu (string thay vì number).
import { z } from "zod";

const timeframeBlock = z.object({
  trend: z.string(),
  support: z.number(),
  resistance: z.number(),
  signal: z.string(),
});

export const scanOutputSchema = z.object({
  scan_timestamp: z.string(),
  target: z.string(),
  data_completeness_flag: z.enum(["FULL", "DEGRADED_MODE"]),

  macro_layer: z.object({
    monthly: z.object({
      market_cycle_phase: z.string(),
      major_structure: z.string(),
      key_monthly_level: z.object({ support: z.number(), resistance: z.number() }),
      cycle_position_pct: z.number().min(0).max(1),
    }),
    weekly: z.object({
      structural_bias: z.string(),
      distribution_accumulation_zone: z.tuple([z.number(), z.number()]),
      weekly_momentum: z.string(),
      volume_profile_poc: z.number(),
    }),
  }),

  tactical_layer: z.object({
    daily: timeframeBlock,
    "4h": timeframeBlock,
    "1h": timeframeBlock,
    "15m": timeframeBlock,
  }),

  quant_layer: z.object({
    order_flow_bias: z.string(),
    liquidity_pools: z.array(z.number()),
    correlation_flag: z.string(),
  }),

  consensus_verdict: z.object({
    macro_aligned: z.boolean(),
    final_bias: z.string(),
    confidence_ceiling: z.number().min(0).max(1),
    confidence_score_bayesian: z.number().min(0).max(1),
    confidence_tier: z.enum(["Thấp", "Trung bình", "Cao"]),
    prior_source: z.enum(["market_baseline", "internal_backtest"]),
    ensemble_agreement: z.number().min(0).max(1),
    synthesis_disagreement: z.boolean(),
    invalidation_level: z.number(),
  }),

  risk_management: z.object({
    suggested_position_size_pct: z.number(),
    regime: z.string(),
  }),

  ai_synthesis: z.object({
    models_used: z.array(z.string()),
    main_thesis: z.string(),
    supporting_evidence_fields: z.array(z.string()),
    conflicting_factors: z.array(z.string()),
    conditional_conclusion: z.string(),
    ai_synthesis_narrative: z.string(),
  }),

  actionable_insight: z.string(),
});

export function validateScanOutput(payload) {
  const result = scanOutputSchema.safeParse(payload);
  if (!result.success) {
    return { valid: false, errors: result.error.flatten() };
  }
  return { valid: true, data: result.data };
}
