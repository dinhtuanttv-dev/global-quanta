// patternBacktest.js — Với mỗi lần mẫu hình xuất hiện trong lịch sử: theo
// dõi nến sau ngày xác nhận đột phá, xem đạt mục tiêu giá trước hay bị vô
// hiệu hóa trước, tổng hợp thành tỷ lệ thành công thực sự theo từng loại
// mẫu hình. Toàn bộ tính toán bằng thuật toán xác định — không gọi AI ở
// bước này (nguyên tắc cốt lõi của đề xuất: tách phát hiện mẫu ra khỏi AI).

import { computeZigZagPivots } from "./zigzagPivots.js";
import { detectPatterns } from "./classicPatternDetector.js";

export const MIN_SAMPLE_SIZE = 5; // dưới ngưỡng này, % thành công không còn ý nghĩa thống kê

/**
 * @param {Array<{time, open, high, low, close}>} candles - dữ liệu lịch sử đầy đủ
 * @param {object} options
 * @param {number} options.maxLookaheadBars - số nến tối đa để chờ kết quả trước khi tính "timeout"
 * @param {number} options.reversalPct - ngưỡng ZigZag (truyền xuống computeZigZagPivots)
 */
export function backtestPatterns(candles, options = {}) {
  const { maxLookaheadBars = 60, reversalPct = 5 } = options;

  const pivots = computeZigZagPivots(candles, reversalPct);
  const occurrences = detectPatterns(candles, pivots);

  const outcomes = occurrences.map((pattern) => evaluateOutcome(candles, pattern, maxLookaheadBars));

  return aggregateByPatternType(outcomes);
}

/**
 * Đi từng nến sau confirmationIndex, kiểm tra đạt target trước hay vô hiệu
 * hóa trước. Nếu hết maxLookaheadBars mà chưa rõ kết quả -> "timeout"
 * (không tính vào tử số/mẫu số thành công, ghi chú riêng để minh bạch).
 */
function evaluateOutcome(candles, pattern, maxLookaheadBars) {
  const { confirmationIndex, targetPrice, invalidationLevel, direction } = pattern;
  const entryPrice = candles[confirmationIndex].close;

  for (let i = confirmationIndex + 1; i < candles.length && i <= confirmationIndex + maxLookaheadBars; i++) {
    const bar = candles[i];

    if (direction === "bullish") {
      if (bar.high >= targetPrice) {
        return finalize(pattern, "success", i, confirmationIndex, entryPrice, targetPrice);
      }
      if (bar.low <= invalidationLevel) {
        return finalize(pattern, "failure", i, confirmationIndex, entryPrice, invalidationLevel);
      }
    } else {
      if (bar.low <= targetPrice) {
        return finalize(pattern, "success", i, confirmationIndex, entryPrice, targetPrice);
      }
      if (bar.high >= invalidationLevel) {
        return finalize(pattern, "failure", i, confirmationIndex, entryPrice, invalidationLevel);
      }
    }
  }

  return finalize(pattern, "timeout", confirmationIndex + maxLookaheadBars, confirmationIndex, entryPrice, null);
}

function finalize(pattern, result, outcomeIndex, confirmationIndex, entryPrice, exitPrice) {
  const barsToOutcome = outcomeIndex - confirmationIndex;
  const returnPct =
    exitPrice != null
      ? pattern.direction === "bullish"
        ? ((exitPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - exitPrice) / entryPrice) * 100
      : null;

  return { patternType: pattern.type, result, barsToOutcome, returnPct };
}

/**
 * Gộp theo loại mẫu hình -> sampleSize, successRatePct, avgBarsToOutcome,
 * avgReturnPct. Timeout được loại khỏi mẫu số thành công/thất bại (không
 * đủ dữ liệu để kết luận) nhưng vẫn được đếm và báo cáo minh bạch.
 */
function aggregateByPatternType(outcomes) {
  const grouped = {};

  for (const o of outcomes) {
    if (!grouped[o.patternType]) {
      grouped[o.patternType] = { success: 0, failure: 0, timeout: 0, barsList: [], returnList: [] };
    }
    grouped[o.patternType][o.result] += 1;
    if (o.result !== "timeout") {
      grouped[o.patternType].barsList.push(o.barsToOutcome);
      grouped[o.patternType].returnList.push(o.returnPct);
    }
  }

  return Object.entries(grouped).map(([patternType, stats]) => {
    const concludedSampleSize = stats.success + stats.failure;
    const successRatePct = concludedSampleSize > 0 ? round1((stats.success / concludedSampleSize) * 100) : null;

    return {
      patternType,
      sampleSize: concludedSampleSize,
      timeoutCount: stats.timeout,
      successRatePct,
      avgBarsToOutcome: average(stats.barsList),
      avgReturnPct: average(stats.returnList),
      lowSampleWarning: concludedSampleSize < MIN_SAMPLE_SIZE,
    };
  });
}

function average(arr) {
  if (!arr || arr.length === 0) return null;
  return round1(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Sinh dữ liệu nến lịch sử GIẢ LẬP chỉ để demo pipeline khi chưa nối API
 * dữ liệu lịch sử thật. KHÔNG dùng số liệu này để ra quyết định thật.
 * Production: thay bằng dữ liệu lịch sử thật (Binance klines, SSI, DNSE...).
 */
export function generateMockHistoricalCandles(numBars = 500, startPrice = 1200) {
  const candles = [];
  let price = startPrice;
  const start = Date.now() - numBars * 24 * 60 * 60 * 1000;

  for (let i = 0; i < numBars; i++) {
    const changePct = (Math.random() - 0.48) * 3; // random walk có thiên hướng tăng nhẹ
    const open = price;
    price = price * (1 + changePct / 100);
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    candles.push({ time: start + i * 24 * 60 * 60 * 1000, open, high, low, close });
  }
  return candles;
}
