// Route điều phối pipeline — HỖ TRỢ 2 CHẾ ĐỘ, chọn qua `mode` trong body:
//
//   mode: "structured" (mặc định, khuyến nghị) — oscillators + pattern
//     backtest tính THẬT trực tiếp từ dữ liệu số, không qua ảnh. Nhanh,
//     rẻ, mọi con số AI trích dẫn đều truy vết được về nguồn thật.
//
//   mode: "vision" — GIỮ LẠI theo yêu cầu: Vision Capture (Playwright chụp
//     ảnh biểu đồ) + AI Vision (Claude/Gemini đọc ảnh) như kiến trúc gốc.
//     Chậm hơn, tốn chi phí AI hơn (ảnh), và độ chính xác phụ thuộc khả
//     năng đọc ảnh của model — nhưng vẫn hữu ích cho người dùng muốn xem
//     AI diễn giải trực quan nhiều khung thời gian cùng lúc.
//     YÊU CẦU: `npm install playwright && npx playwright install chromium`
//     (chỉ cần cài nếu thực sự dùng chế độ này).
//
// Cả 2 chế độ dùng CHUNG: fetchHistoricalCandles (dữ liệu thật, có retry),
// cache, và risk filter (regime thật từ ADX/ATR) — chỉ khác nhau ở bước
// phân tích + tổng hợp.

import { Router } from "express";
import { computeOscillators } from "../services/technicalOscillators.js";
import { backtestPatterns } from "../services/patternBacktest.js";
import { computeBayesianConfidence } from "../services/bayesianScoring.js";
import { applyRiskFilters } from "../services/riskFilter.js";
import { synthesizeSnapshot } from "../services/synthesizeSnapshot.js";
import { synthesizeVisionSnapshot } from "../services/synthesizeVisionSnapshot.js";
import { captureCharts } from "../services/visionCapture.js";
import { extractQuantFeatures } from "../services/featureExtraction.js";
import { analyzeChartsWithAI } from "../services/aiVisionService.js";
import { fetchHistoricalCandles, HistoricalDataConfigError } from "../services/historicalDataProvider.js";
import { validateScanOutput } from "../schema/scanOutputSchema.js";
import { dispatchAlertIfAllowed } from "../services/alertDispatch.js";
import { shouldSkipDueToCache, getCachedScanResult, setCachedScanResult } from "../utils/cache.js";

const router = Router();
const VALID_MODES = ["structured", "vision"];

router.post("/scan", async (req, res) => {
  try {
    const { symbol, timeframes, mode: rawMode, ai_model } = req.body || {};
    const mode = VALID_MODES.includes(rawMode) ? rawMode : "structured";

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "Thiếu symbol hoặc symbol không hợp lệ." });
    }
    if (!Array.isArray(timeframes) || timeframes.length === 0) {
      return res.status(400).json({ error: "Cần chọn ít nhất một khung thời gian." });
    }
    const timeframe = timeframes[0];

    // --- Dùng chung: dữ liệu lịch sử thật (có retry) ---
    let historicalData;
    try {
      historicalData = await fetchHistoricalCandles(symbol, { timeframe });
    } catch (err) {
      if (err instanceof HistoricalDataConfigError) {
        return res.status(503).json({ error: "Chưa cấu hình/nối được nguồn dữ liệu lịch sử thật.", detail: err.message });
      }
      throw err;
    }
    const { candles, isMock, source } = historicalData;

    // --- Dùng chung: cache check (khóa cache riêng theo mode, vì kết quả
    // 2 chế độ khác cấu trúc, không nên trả nhầm cache của mode khác) ---
    const lastCandle = candles[candles.length - 1];
    const cacheKeySymbol = `${symbol}:${mode}`;
    const representativeData = `${symbol}:${lastCandle?.time}:${lastCandle?.close}`;
    if (shouldSkipDueToCache(cacheKeySymbol, timeframe, representativeData)) {
      const cached = getCachedScanResult(cacheKeySymbol, timeframe);
      if (cached) return res.json({ ...cached, served_from_cache: true });
    }

    let partialResult;
    if (mode === "vision") {
      partialResult = await runVisionMode({ symbol, timeframes, timeframe, candles, isMock, source, ai_model });
    } else {
      partialResult = await runStructuredMode({ symbol, timeframe, candles, isMock, source });
    }

    if (partialResult.error) {
      return res.status(partialResult.status || 500).json({ error: partialResult.error, detail: partialResult.detail });
    }

    const validation = validateScanOutput(partialResult.data);
    if (!validation.valid) {
      console.error("Schema validation failed:", validation.errors);
      return res.status(500).json({ error: "Output không khớp schema.", details: validation.errors });
    }

    setCachedScanResult(cacheKeySymbol, timeframe, validation.data);
    dispatchAlertIfAllowed(symbol, validation.data).catch(() => {});

    return res.json({ ...validation.data, served_from_cache: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Lỗi pipeline.", detail: err.message });
  }
});

// ============================== CHẾ ĐỘ STRUCTURED ==============================
async function runStructuredMode({ symbol, timeframe, candles, isMock, source }) {
  const oscillators = computeOscillators(candles);
  const patternStats = backtestPatterns(candles, { maxLookaheadBars: 60, reversalPct: 5 });

  const oscDirection =
    oscillators.macd && oscillators.rsi != null
      ? oscillators.macd.histogram > 0 && oscillators.rsi > 50
        ? "bullish"
        : oscillators.macd.histogram < 0 && oscillators.rsi < 50
        ? "bearish"
        : "neutral"
      : "neutral";

  const bestPattern = [...patternStats]
    .filter((p) => !p.lowSampleWarning && p.successRatePct != null)
    .sort((a, b) => b.successRatePct - a.successRatePct)[0];
  const patternDirection = bestPattern ? (bestPattern.successRatePct >= 50 ? "bullish" : "bearish") : "neutral";

  const macroAligned = oscDirection === "bullish" || (oscDirection === "neutral" && patternDirection === "bullish");
  const ensembleAgreement =
    oscDirection === "neutral" || patternDirection === "neutral" ? 0.5 : oscDirection === patternDirection ? 0.85 : 0.2;

  const bayesian = computeBayesianConfidence({ macroAligned, ensembleAgreement });
  const riskFinal = applyRiskFilters({ confidenceTier: bayesian.confidence_tier, dataCompleteness: "FULL", historicalBars: candles });

  const snapshot = {
    ticker: symbol,
    timeframe,
    lastClose: candles[candles.length - 1].close,
    lastDate: candles[candles.length - 1].time,
    technical_layer: oscillators,
    pattern_layer: patternStats,
  };

  let synthesisResult;
  try {
    synthesisResult = await synthesizeSnapshot(snapshot);
  } catch (err) {
    return { error: "Lỗi khi tổng hợp AI.", detail: err.message, status: 502 };
  }
  const { synthesis, modelsUsed, synthesisDisagreement } = synthesisResult;

  return {
    data: {
      mode: "structured",
      scan_timestamp: new Date().toISOString(),
      target: symbol,
      timeframe,
      is_historical_data_mock: isMock,
      historical_data_source: source,
      technical_layer: oscillators,
      pattern_layer: patternStats,
      consensus_verdict: buildConsensusVerdict({ macroAligned, ensembleAgreement, bayesian, synthesis, synthesisDisagreement }),
      risk_management: riskFinal,
      ai_synthesis: buildAiSynthesis(synthesis, modelsUsed),
      actionable_insight: synthesis.conditional_conclusion,
    },
  };
}

// ============================== CHẾ ĐỘ VISION (giữ lại) ==============================
async function runVisionMode({ symbol, timeframes, timeframe, candles, isMock, source, ai_model }) {
  let images;
  try {
    images = await withRetry(() => captureCharts(symbol, timeframes));
  } catch (err) {
    return {
      error: "Lỗi chụp ảnh biểu đồ (Vision Capture).",
      detail:
        err.message?.includes("playwright") || err.message?.includes("Executable doesn't exist")
          ? "Chưa cài Playwright. Chạy: npm install playwright && npx playwright install chromium"
          : err.message,
      status: 500,
    };
  }
  const dataCompleteness = images.every((i) => i) ? "FULL" : "DEGRADED_MODE";

  const quant = await extractQuantFeatures(symbol);

  let vision;
  try {
    vision = await withRetry(() => analyzeChartsWithAI({ images, timeframes, symbol, model: ai_model }));
  } catch (err) {
    return { error: "Lỗi khi AI đọc ảnh biểu đồ (AI Vision).", detail: err.message, status: 502 };
  }

  const macroAligned = (vision.macro_layer?.weekly?.structural_bias ?? "").toLowerCase().includes("bullish");
  const ensembleAgreement = vision.ensemble_agreement ?? 0.5;
  const ensembleAgreementIsReal = vision.ensemble_agreement !== null && vision.ensemble_agreement !== undefined;

  const bayesian = computeBayesianConfidence({ macroAligned, ensembleAgreement });
  const riskFinal = applyRiskFilters({ confidenceTier: bayesian.confidence_tier, dataCompleteness, historicalBars: candles });

  const snapshot = {
    ticker: symbol,
    macro_layer: vision.macro_layer,
    tactical_layer: vision.tactical_layer,
    // ĐÃ SỬA: gắn rõ "source": "MOCK" — featureExtraction.js chưa nối API
    // sàn thật (đã ghi nhận từ đầu dự án). Nếu không gắn cờ này, AI Synthesis
    // không có cách nào biết đây là dữ liệu giả để cảnh báo đúng theo yêu
    // cầu trong system prompt của nó ("neu quant_layer danh dau la MOCK").
    quant_layer: {
      order_flow_bias: quant.order_flow_bias,
      liquidity_pools: quant.liquidity_pools,
      correlation_flag: quant.correlation_flag,
      source: "MOCK — chưa nối API sàn thật (Binance/SSI/DNSE), không dùng để ra quyết định thật",
    },
  };

  let synthesisResult;
  try {
    synthesisResult = await synthesizeVisionSnapshot(snapshot);
  } catch (err) {
    return { error: "Lỗi khi tổng hợp AI.", detail: err.message, status: 502 };
  }
  const { synthesis, modelsUsed, synthesisDisagreement } = synthesisResult;

  return {
    data: {
      mode: "vision",
      scan_timestamp: new Date().toISOString(),
      target: symbol,
      timeframe,
      is_historical_data_mock: isMock,
      historical_data_source: source,
      data_completeness_flag: dataCompleteness,
      macro_layer: vision.macro_layer,
      tactical_layer: vision.tactical_layer,
      quant_layer: snapshot.quant_layer,
      consensus_verdict: {
        ...buildConsensusVerdict({ macroAligned, ensembleAgreement, bayesian, synthesis, synthesisDisagreement }),
        ensemble_agreement_is_real: ensembleAgreementIsReal,
        invalidation_level: synthesis.invalidation_level ?? vision.macro_layer?.monthly?.key_monthly_level?.support ?? null,
      },
      risk_management: riskFinal,
      ai_synthesis: buildAiSynthesis(synthesis, modelsUsed),
      actionable_insight: synthesis.conditional_conclusion,
    },
  };
}

function buildConsensusVerdict({ macroAligned, ensembleAgreement, bayesian, synthesis, synthesisDisagreement }) {
  return {
    macro_aligned: macroAligned,
    final_bias:
      synthesis.direction === "bullish" ? "Long-only bias" : synthesis.direction === "bearish" ? "Short/Avoid bias" : "Neutral / chờ xác nhận thêm",
    confidence_score_bayesian: bayesian.confidence_score_bayesian,
    confidence_tier: bayesian.confidence_tier,
    prior_source: bayesian.prior_source,
    ensemble_agreement: ensembleAgreement,
    ensemble_agreement_is_real: true,
    synthesis_disagreement: synthesisDisagreement,
    invalidation_level: synthesis.invalidation_level ?? null,
  };
}

function buildAiSynthesis(synthesis, modelsUsed) {
  return {
    models_used: modelsUsed,
    main_thesis: synthesis.main_thesis,
    supporting_evidence_fields: synthesis.supporting_evidence_fields,
    conflicting_factors: synthesis.conflicting_factors,
    conditional_conclusion: synthesis.conditional_conclusion,
    checklist: synthesis.checklist,
  };
}

async function withRetry(fn, retries = 2, delayMs = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

export default router;
