// Route điều phối pipeline — tương ứng kiến trúc event-driven Mục 11:
// Vision Capture -> Feature Extraction -> AI Vision -> Bayesian Scoring
// -> Risk Filter -> AI Synthesis -> Validate -> Alert Dispatch

import { Router } from "express";
import { captureCharts } from "../services/visionCapture.js";
import { extractQuantFeatures } from "../services/featureExtraction.js";
import { analyzeChartsWithAI } from "../services/aiVisionService.js";
import { computeBayesianConfidence } from "../services/bayesianScoring.js";
import { applyRiskFilters } from "../services/riskFilter.js";
import { synthesizeConclusion } from "../services/aiSynthesis.js";
import { validateScanOutput } from "../schema/scanOutputSchema.js";
import { dispatchAlertIfAllowed } from "../services/alertDispatch.js";

const router = Router();

router.post("/scan", async (req, res) => {
  try {
    const { symbol, timeframes, ai_model } = req.body || {};

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "Thiếu symbol hoặc symbol không hợp lệ." });
    }
    if (!Array.isArray(timeframes) || timeframes.length === 0) {
      return res.status(400).json({ error: "Cần chọn ít nhất một khung thời gian." });
    }

    // 1. Vision Capture
    const images = await withRetry(() => captureCharts(symbol, timeframes));
    const dataCompleteness = images.every((i) => i) ? "FULL" : "DEGRADED_MODE";

    // 2. Feature Extraction (Quant Layer)
    const quant = await extractQuantFeatures(symbol);

    // 3. AI Vision (Vision-to-JSON)
    const vision = await withRetry(() =>
      analyzeChartsWithAI({ images, timeframes, symbol, model: ai_model })
    );

    // 4. Bayesian Scoring
    const macroAligned = vision.macro_layer.weekly.structural_bias.toLowerCase().includes("bullish");
    const ensembleAgreement = 0.85; // TODO: thay bằng độ đồng thuận thật giữa nhiều model vision
    const bayesian = computeBayesianConfidence({ macroAligned, ensembleAgreement });

    // 5. Risk Filter
    const risk = applyRiskFilters({
      confidenceTier: bayesian.confidence_tier,
      dataCompleteness,
    });

    const finalBias = macroAligned ? "Long-only bias" : "Neutral / chờ xác nhận thêm";
    const confidenceCeiling = macroAligned ? 0.85 : 0.4;

    const partialResult = {
      scan_timestamp: new Date().toISOString(),
      target: symbol,
      data_completeness_flag: dataCompleteness,
      macro_layer: vision.macro_layer,
      tactical_layer: vision.tactical_layer,
      quant_layer: {
        order_flow_bias: quant.order_flow_bias,
        liquidity_pools: quant.liquidity_pools,
        correlation_flag: quant.correlation_flag,
      },
      consensus_verdict: {
        macro_aligned: macroAligned,
        final_bias: finalBias,
        confidence_ceiling: confidenceCeiling,
        confidence_score_bayesian: bayesian.confidence_score_bayesian,
        confidence_tier: bayesian.confidence_tier,
        prior_source: bayesian.prior_source,
        ensemble_agreement: ensembleAgreement,
        synthesis_disagreement: false,
        invalidation_level: vision.macro_layer.monthly.key_monthly_level.support,
      },
      risk_management: risk,
    };

    // 6. AI Synthesis Layer (Mục 4.4)
    const synthesis = await withRetry(() => synthesizeConclusion(partialResult));
    partialResult.consensus_verdict.synthesis_disagreement = synthesis.synthesis_disagreement;
    partialResult.ai_synthesis = {
      models_used: synthesis.models_used,
      main_thesis: synthesis.main_thesis,
      supporting_evidence_fields: synthesis.supporting_evidence_fields,
      conflicting_factors: synthesis.conflicting_factors,
      conditional_conclusion: synthesis.conditional_conclusion,
      ai_synthesis_narrative: synthesis.ai_synthesis_narrative,
    };
    partialResult.actionable_insight = synthesis.conditional_conclusion;

    // 7. Validate Schema trước khi trả về (Mục 9)
    const validation = validateScanOutput(partialResult);
    if (!validation.valid) {
      console.error("Schema validation failed:", validation.errors);
      return res.status(500).json({ error: "Output không khớp schema.", details: validation.errors });
    }

    // 8. Alert Dispatch (không chặn response nếu lỗi)
    dispatchAlertIfAllowed(symbol, validation.data).catch(() => {});

    return res.json(validation.data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Lỗi pipeline.", detail: err.message });
  }
});

// Exponential Backoff & Retry đơn giản (Mục 10 — Xử lý lỗi & Fallback)
async function withRetry(fn, retries = 2, delayMs = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

export default router;
