// api/scan.js — Vercel Serverless Function (Node.js), CHỈ chế độ "structured".
// Đặt cùng project với frontend (global-quanta) nên KHÔNG cần CORS — request
// từ chính trang web tới /api/scan là same-origin.
//
// Chế độ "vision" (Playwright) KHÔNG được deploy ở đây theo quyết định đã
// thống nhất — Chromium headless quá nặng/chậm cho giới hạn Serverless
// Function của Vercel. Vision mode vẫn chạy được ở backend cục bộ
// (global-quanta/backend, node src/server.js) cho mục đích nghiên cứu.

import { computeOscillators } from "./_lib/technicalOscillators.js";
import { backtestPatterns } from "./_lib/patternBacktest.js";
import { computeBayesianConfidence } from "./_lib/bayesianScoring.js";
import { applyRiskFilters } from "./_lib/riskFilter.js";
import { synthesizeSnapshot } from "./_lib/synthesizeSnapshot.js";
import { fetchHistoricalCandles, HistoricalDataConfigError } from "./_lib/historicalDataProvider.js";
import { validateScanOutput } from "./_lib/scanOutputSchema.js";
import { shouldSkipDueToCache, getCachedScanResult, setCachedScanResult } from "./_lib/cache.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chỉ hỗ trợ POST." });
  }

  try {
    const { symbol, timeframes } = req.body || {};

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "Thiếu symbol hoặc symbol không hợp lệ." });
    }
    if (!Array.isArray(timeframes) || timeframes.length === 0) {
      return res.status(400).json({ error: "Cần chọn ít nhất một khung thời gian." });
    }
    const timeframe = timeframes[0];

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

    const lastCandle = candles[candles.length - 1];
    const cacheKeySymbol = `${symbol}:structured`;
    const representativeData = `${symbol}:${lastCandle?.time}:${lastCandle?.close}`;
    if (shouldSkipDueToCache(cacheKeySymbol, timeframe, representativeData)) {
      const cached = getCachedScanResult(cacheKeySymbol, timeframe);
      if (cached) return res.status(200).json({ ...cached, served_from_cache: true });
    }

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
      lastClose: lastCandle.close,
      lastDate: lastCandle.time,
      technical_layer: oscillators,
      pattern_layer: patternStats,
    };

    let synthesisResult;
    try {
      synthesisResult = await synthesizeSnapshot(snapshot);
    } catch (err) {
      return res.status(502).json({ error: "Lỗi khi tổng hợp AI.", detail: err.message });
    }
    const { synthesis, modelsUsed, synthesisDisagreement } = synthesisResult;

    const result = {
      mode: "structured",
      scan_timestamp: new Date().toISOString(),
      target: symbol,
      timeframe,
      is_historical_data_mock: isMock,
      historical_data_source: source,
      technical_layer: oscillators,
      pattern_layer: patternStats,
      consensus_verdict: {
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
      },
      risk_management: riskFinal,
      ai_synthesis: {
        models_used: modelsUsed,
        main_thesis: synthesis.main_thesis,
        supporting_evidence_fields: synthesis.supporting_evidence_fields,
        conflicting_factors: synthesis.conflicting_factors,
        conditional_conclusion: synthesis.conditional_conclusion,
        checklist: synthesis.checklist,
      },
      actionable_insight: synthesis.conditional_conclusion,
    };

    const validation = validateScanOutput(result);
    if (!validation.valid) {
      console.error("Schema validation failed:", validation.errors);
      return res.status(500).json({ error: "Output không khớp schema.", details: validation.errors });
    }

    setCachedScanResult(cacheKeySymbol, timeframe, validation.data);

    return res.status(200).json({ ...validation.data, served_from_cache: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Lỗi pipeline.", detail: err.message });
  }
}
