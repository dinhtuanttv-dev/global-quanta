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

export const scanOutputSchema = z.object({
  mode: z.literal("structured"),
  scan_timestamp: z.string(),
  target: z.string(),
  timeframe: z.string(),
  is_historical_data_mock: z.boolean(),
  historical_data_source: z.string(),
  technical_layer: oscillatorsSchema,
  pattern_layer: z.array(patternStatSchema),
  consensus_verdict: z.object({
    macro_aligned: z.boolean(),
    final_bias: z.string(),
    confidence_score_bayesian: z.number(),
    confidence_tier: z.enum(["Thấp", "Trung bình", "Cao"]),
    prior_source: z.string(),
    ensemble_agreement: z.number().min(0).max(1),
    ensemble_agreement_is_real: z.boolean(),
    synthesis_disagreement: z.boolean(),
    invalidation_level: z.number().nullable(),
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
    checklist: z.array(checklistItemSchema),
  }),
  actionable_insight: z.string(),
});

export function validateScanOutput(data) {
  const result = scanOutputSchema.safeParse(data);
  if (!result.success) return { valid: false, errors: result.error.flatten() };
  return { valid: true, data: result.data };
}
