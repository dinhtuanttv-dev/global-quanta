// Công thức Siêu Quét AI — CHUYỂN NGUYÊN VĂN từ Project A (quant-macro-scanner,
// commit 9306bc3), chỉ bỏ kiểu TypeScript. KHÔNG sửa logic, ngưỡng hay làm tròn:
// golden test (test/scannerParity.test.js) so kết quả với bản gốc trong
// test/fixtures/projectA/.
//   - lib/market-data/technical-indicators.ts: calculateSMA, calculateRSI,
//     calculateMACDHistogram, calculateTrueRangeSeries, calculateAtrSeries
//   - lib/sieu-quet-ai/confluence-engine.ts
//   - lib/sieu-quet-ai/scoring-engine.ts (phần Siêu Quét dùng)
//   - lib/sieu-quet-ai/market-tags.ts
//   - lib/cotuc/dividend-quality-score.ts: calculateFScoreLite

// ---------- technical-indicators.ts ----------

export function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

export function calculateTrueRangeSeries(bars) {
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
  });
}

export function calculateAtrSeries(bars, period = 14) {
  const tr = calculateTrueRangeSeries(bars);
  const atr = [];
  for (let i = 0; i < tr.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = tr.slice(start, i + 1);
    atr.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return atr;
}

export function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    avgGain += Math.max(c, 0);
    avgLoss += Math.max(-c, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    const gain = Math.max(c, 0);
    const loss = Math.max(-c, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateEMASeries(values, period) {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [values[0]];
  for (let i = 1; i < values.length; i++) ema.push(values[i] * k + ema[i - 1] * (1 - k));
  return ema;
}

export function calculateMACDHistogram(closes) {
  if (closes.length < 26) return null;
  const ema12 = calculateEMASeries(closes, 12);
  const ema26 = calculateEMASeries(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = calculateEMASeries(macdLine, 9);
  const histogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  return Math.round(histogram * 100) / 100;
}

// ---------- confluence-engine.ts ----------

export function clamp(x, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, x));
}

export function computeMaAlignmentScore(ma20, ma50, ma200) {
  const spreadUp = ma200 ? (ma20 - ma200) / ma200 : 0;
  if (ma20 > ma50 && ma50 > ma200) return clamp(50 + spreadUp * 500);
  if (ma20 < ma50 && ma50 < ma200) return clamp(50 + spreadUp * 500);
  return 50.0;
}

export function computeTrendBias(price, ma20, ma50, ma200, breadthPct, deathCrossRecent, breadthDrop5d) {
  const maGapPct = ma200 ? (Math.abs(ma50 - ma200) / ma200) * 100 : 0;
  if (price > ma20 && ma20 > ma50 && ma50 > ma200 && breadthPct > 65) {
    return { bias: "uptrend", label: "Uptrend Xác nhận" };
  }
  if (price < ma20 && ma20 < ma50 && ma50 < ma200 && breadthPct < 35) {
    return { bias: "downtrend", label: "Downtrend / Rủi ro cao" };
  }
  if ((deathCrossRecent || breadthDrop5d > 15) && price < ma50) {
    return { bias: "distribution", label: "Phân phối — Cảnh báo dòng tiền rút" };
  }
  if (maGapPct < 3 && breadthPct >= 40 && breadthPct <= 65) {
    return { bias: "defensive", label: "Phòng thủ / Đi ngang" };
  }
  return { bias: "accumulation", label: "Tích lũy Trung hạn" };
}

export function computeImpulseScore(rsi14, breadthPct, maAlignmentScore, atrPercentile) {
  const trendComponentContinuous = clamp(0.6 * breadthPct + 0.4 * maAlignmentScore);
  const score = 0.30 * clamp(rsi14) + 0.30 * clamp(breadthPct) + 0.20 * trendComponentContinuous + 0.20 * (100 - clamp(atrPercentile));
  return Math.round(clamp(score) * 10) / 10;
}

export function computeConfluence(bias, trendTag, rsRating, qualityTag, breakoutProbability) {
  let reasonCodes = [];
  let statusCode = "TRUNG_LAP";
  let statusLabel = "Trung lập";
  let boost = 0.0;

  if (bias === "uptrend") {
    if (trendTag === "Up-Trend" && rsRating >= 80) {
      statusCode = "THUAN_XU_HUONG_MANH"; statusLabel = "Thuận xu hướng mạnh"; boost = 2;
      reasonCodes = ["TREND_ALIGNED", "RS_ABOVE_80"];
    } else if (trendTag === "Up-Trend") {
      statusCode = "THUAN_XU_HUONG"; statusLabel = "Thuận xu hướng"; boost = 1;
      reasonCodes = ["TREND_ALIGNED"];
    }
  } else if (bias === "defensive") {
    if (trendTag === "Up-Trend" && rsRating >= 90) {
      statusCode = "DAN_DAT_NGUOC_DONG"; statusLabel = "Dẫn dắt ngược dòng (Leader)"; boost = 2;
      reasonCodes = ["RS_ABOVE_90", "DEFENSIVE_LEADER"];
    } else if (trendTag === "Accumulation" && qualityTag === "Low Debt") {
      statusCode = "PHONG_THU_CHUAN"; statusLabel = "Phòng thủ chuẩn"; boost = 2;
      reasonCodes = ["DEFENSIVE_MATCH", "LOW_DEBT"];
    } else if (trendTag === "Accumulation") {
      statusCode = "THUAN_PHONG_THU"; statusLabel = "Thuận phòng thủ"; boost = 1;
      reasonCodes = ["DEFENSIVE_MATCH"];
    } else if (trendTag === "Up-Trend") {
      statusCode = "TRUNG_LAP"; statusLabel = "Trung lập-mạnh"; boost = 0;
      reasonCodes = ["TREND_ALIGNED_BUT_RS_LOW"];
    } else {
      statusCode = "NGHICH_XU_HUONG"; statusLabel = "Nghịch xu hướng"; boost = -1;
      reasonCodes = ["TREND_MISALIGNED"];
    }
  } else if (bias === "distribution" || bias === "downtrend") {
    if (trendTag === "Up-Trend" && rsRating >= 90) {
      statusCode = "DAN_DAT_NGUOC_DONG"; statusLabel = "Dẫn dắt ngược dòng (Leader)"; boost = 1;
      reasonCodes = ["RS_ABOVE_90", "COUNTER_TREND_LEADER"];
    } else {
      statusCode = "NGHICH_XU_HUONG"; statusLabel = "Nghịch xu hướng"; boost = -1;
      reasonCodes = ["MARKET_WEAK"];
    }
  } else {
    if (trendTag === "Accumulation" && rsRating >= 75) {
      statusCode = "DONG_THUAN_TICH_LUY"; statusLabel = "Đồng thuận tích lũy"; boost = 2;
      reasonCodes = ["ACCUM_ALIGNED", "RS_ABOVE_75"];
    } else if (trendTag === "Accumulation" || trendTag === "Up-Trend") {
      statusCode = "THUAN_XU_HUONG"; statusLabel = "Thuận xu hướng"; boost = 1;
      reasonCodes = ["ACCUM_ALIGNED"];
    }
  }

  const breakoutBadge = boost >= 1 && breakoutProbability >= 70;
  return { statusCode, statusLabel, boost, reasonCodes, breakoutBoostBadge: breakoutBadge };
}

// ---------- scoring-engine.ts ----------

export function percentileRank(value, universeValues) {
  if (universeValues.length === 0) return 50.0;
  const below = universeValues.filter((v) => v <= value).length;
  return Math.round((below / universeValues.length) * 1000) / 10;
}

export function computeFaScore(roe, netMargin, revenueGrowth, universeRoe, universeMargin, universeGrowth) {
  return Math.round((
    0.40 * percentileRank(roe, universeRoe)
    + 0.30 * percentileRank(netMargin, universeMargin)
    + 0.30 * percentileRank(revenueGrowth, universeGrowth)
  ) * 10) / 10;
}

const TREND_TAG_SCORE = { "Up-Trend": 100, "Accumulation": 60, "Distribution": 30, "Down-Trend": 0 };

export function computeTaScore(rsRating, trendTag, liquidity, universeLiquidity, divergence) {
  let base = (
    0.40 * clamp(((rsRating - 1) / 98) * 100)
    + 0.35 * (TREND_TAG_SCORE[trendTag] ?? 50)
    + 0.25 * percentileRank(liquidity, universeLiquidity)
  );
  if (divergence === "bearish" && trendTag === "Up-Trend") base -= 15;
  else if (divergence === "bullish" && (trendTag === "Down-Trend" || trendTag === "Accumulation")) base += 15;
  return Math.round(clamp(base) * 10) / 10;
}

function timeDecay(status, daysRemaining) {
  if (status === "ongoing") return 1.0;
  if (status === "upcoming") {
    if (daysRemaining === null) return 0.5;
    return clamp(1 - daysRemaining / 30, 0, 1);
  }
  if (status === "resolved") return 0.2;
  return 0.0;
}

function normalizeSectorKey(s) {
  return s.trim().toLowerCase();
}

export function computeEventImpactScore(sector, activeEvents) {
  const sectorKey = normalizeSectorKey(sector);
  const relevant = activeEvents.filter((e) => e.verifiedStatus === "user_confirmed" && e.sectors.some((s) => normalizeSectorKey(s) === sectorKey));
  if (relevant.length === 0) return 50.0;
  const magnitudeW = { high: 1.0, medium: 0.6, low: 0.3 };
  let total = 0;
  for (const e of relevant) {
    const w = magnitudeW[e.magnitude] ?? 0.6;
    const sign = e.direction === "positive" ? 1 : -1;
    const decay = timeDecay(e.status, e.daysRemaining);
    total += sign * w * decay;
  }
  return Math.round(clamp(50 + total * 25) * 10) / 10;
}

export function computeSmartScore(faScore, taScore, eventImpactScore, boost) {
  const baseScore = 0.40 * faScore + 0.35 * taScore + 0.25 * eventImpactScore;
  const multiplier = 1 + 0.12 * boost;
  return Math.round(clamp(baseScore * multiplier) * 10) / 10;
}

export function computeRiskReward(price, supportMid, resistanceMid) {
  const downside = price - supportMid;
  const upside = resistanceMid - price;
  if (downside <= 0) return null;
  return Math.round((upside / downside) * 100) / 100;
}

export function computeRiskAdjustedMomentum(closes) {
  const window = closes.length >= 64 ? closes.slice(-64) : closes;
  const rets = [];
  for (let i = 1; i < window.length; i++) rets.push(window[i] / window[i - 1] - 1);
  if (rets.length < 2) return 0.0;
  const meanR = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - meanR) * (b - meanR), 0) / rets.length;
  const stdR = Math.sqrt(variance) || 1e-6;
  return Math.round((meanR / stdR) * Math.sqrt(252) * 100) / 100;
}

// ---------- market-tags.ts ----------

export function computeTrendTag(price, ma20, ma50) {
  if (price > ma20 && ma20 > ma50) return "Up-Trend";
  if (price < ma20 && ma20 < ma50) return "Down-Trend";
  if (ma20 > ma50) return "Accumulation";
  return "Distribution";
}

export function computeQualityTag(leverage, netMargin) {
  if (leverage < 0.5) return "Low Debt";
  if (netMargin > 0.15) return "High Margin";
  return "Core Cash Flow";
}

export function computeRsRating(currentReturn64d, universeReturns64d) {
  if (universeReturns64d.length === 0) return 50.0;
  const below = universeReturns64d.filter((v) => v <= currentReturn64d).length;
  const percentile = (below / universeReturns64d.length) * 100;
  return Math.round((1 + (percentile / 100) * 98) * 10) / 10;
}

export function computeReturnOverPeriod(closes, period = 64) {
  if (closes.length < period + 1) return 0;
  const idx = closes.length - 1 - period;
  return closes[closes.length - 1] / closes[idx] - 1;
}

// ---------- dividend-quality-score.ts: calculateFScoreLite ----------

export function calculateFScoreLite(current, yearAgo) {
  const details = {
    roaPositive: null, roaIncreasing: null, leverageDecreasing: null,
    currentRatioIncreasing: null, grossMarginIncreasing: null, assetTurnoverIncreasing: null,
  };
  const roaCurrent = current.netProfit !== null && current.totalAssets && current.totalAssets !== 0
    ? current.netProfit / current.totalAssets : null;
  if (roaCurrent !== null) details.roaPositive = roaCurrent > 0;

  if (yearAgo) {
    const roaPrev = yearAgo.netProfit !== null && yearAgo.totalAssets && yearAgo.totalAssets !== 0
      ? yearAgo.netProfit / yearAgo.totalAssets : null;
    if (roaCurrent !== null && roaPrev !== null) details.roaIncreasing = roaCurrent > roaPrev;

    const leverageCurrent = current.longTermDebt !== null && current.totalAssets && current.totalAssets !== 0
      ? current.longTermDebt / current.totalAssets : null;
    const leveragePrev = yearAgo.longTermDebt !== null && yearAgo.totalAssets && yearAgo.totalAssets !== 0
      ? yearAgo.longTermDebt / yearAgo.totalAssets : null;
    if (leverageCurrent !== null && leveragePrev !== null) details.leverageDecreasing = leverageCurrent < leveragePrev;

    const currentRatioCurrent = current.currentAssets !== null && current.currentLiabilities && current.currentLiabilities !== 0
      ? current.currentAssets / current.currentLiabilities : null;
    const currentRatioPrev = yearAgo.currentAssets !== null && yearAgo.currentLiabilities && yearAgo.currentLiabilities !== 0
      ? yearAgo.currentAssets / yearAgo.currentLiabilities : null;
    if (currentRatioCurrent !== null && currentRatioPrev !== null) details.currentRatioIncreasing = currentRatioCurrent > currentRatioPrev;

    const grossMarginCurrent = current.grossProfit !== null && current.revenue && current.revenue !== 0
      ? current.grossProfit / current.revenue : null;
    const grossMarginPrev = yearAgo.grossProfit !== null && yearAgo.revenue && yearAgo.revenue !== 0
      ? yearAgo.grossProfit / yearAgo.revenue : null;
    if (grossMarginCurrent !== null && grossMarginPrev !== null) details.grossMarginIncreasing = grossMarginCurrent > grossMarginPrev;

    const assetTurnoverCurrent = current.revenue !== null && current.totalAssets && current.totalAssets !== 0
      ? current.revenue / current.totalAssets : null;
    const assetTurnoverPrev = yearAgo.revenue !== null && yearAgo.totalAssets && yearAgo.totalAssets !== 0
      ? yearAgo.revenue / yearAgo.totalAssets : null;
    if (assetTurnoverCurrent !== null && assetTurnoverPrev !== null) details.assetTurnoverIncreasing = assetTurnoverCurrent > assetTurnoverPrev;
  }

  const score = Object.values(details).filter((v) => v === true).length;
  return { score, maxScore: 6, details };
}
