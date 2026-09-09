// classicPatternDetector.js — Phát hiện mẫu hình TA cổ điển bằng thuật toán
// hình học xác định (khớp quy tắc trên chuỗi pivot), KHÔNG dùng AI vision.
// Mỗi mẫu hình trả về kèm mục tiêu giá đo được (measured move) và mức vô
// hiệu hóa, để patternBacktest.js kiểm chứng lại trên dữ liệu lịch sử thật.
//
// Giới hạn đã biết: đây là bản rule-based đơn giản hóa theo tiêu chuẩn TA
// phổ thông (dung sai % cấu hình được), không phải bộ nhận dạng hình ảnh —
// đây chính là điểm khác biệt cốt lõi so với cách tiếp cận "chụp ảnh cho AI
// đoán" mà đề xuất đã chỉ ra là không đáng tin cậy cho việc backtest.

const DEFAULT_OPTIONS = {
  peakTolerancePct: 3, // 2 đỉnh/đáy được coi là "ngang nhau" nếu lệch dưới ngưỡng này
  minDepthPct: 2, // độ sâu tối thiểu của đáy/đỉnh giữa 2 đỉnh/đáy để tính là mẫu hợp lệ
};

/**
 * Gộp cả 3 loại mẫu hình cổ điển thành một danh sách thống nhất.
 * @param {Array} candles
 * @param {Array} pivots - output của computeZigZagPivots()
 * @param {Partial<typeof DEFAULT_OPTIONS>} options
 */
export function detectPatterns(candles, pivots, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return [
    ...detectDoubleTopsAndBottoms(candles, pivots, opts),
    ...detectHeadAndShoulders(candles, pivots, opts),
    ...detectTriangles(candles, pivots, opts),
  ].sort((a, b) => a.confirmationIndex - b.confirmationIndex);
}

// ---------------------------------------------------------------------------
// 1. Double Top / Double Bottom
// ---------------------------------------------------------------------------
function detectDoubleTopsAndBottoms(candles, pivots, opts) {
  const results = [];

  for (let i = 0; i < pivots.length - 2; i++) {
    const p1 = pivots[i];
    const trough = pivots[i + 1];
    const p2 = pivots[i + 2];

    if (p1.type !== p2.type || p1.type === trough.type) continue; // cần dạng cao-thấp-cao hoặc thấp-cao-thấp

    const priceDiffPct = (Math.abs(p1.price - p2.price) / p1.price) * 100;
    if (priceDiffPct > opts.peakTolerancePct) continue;

    const depthPct =
      p1.type === "high"
        ? ((p1.price - trough.price) / p1.price) * 100
        : ((trough.price - p1.price) / p1.price) * 100;
    if (depthPct < opts.minDepthPct) continue;

    const confirmationIndex = findBreakoutIndex(candles, trough.index, trough.price, p1.type === "high" ? "down" : "up");
    if (confirmationIndex === -1) continue;

    const height = Math.abs(p1.price - trough.price);
    const targetPrice = p1.type === "high" ? trough.price - height : trough.price + height;

    results.push({
      type: p1.type === "high" ? "Double Top" : "Double Bottom",
      direction: p1.type === "high" ? "bearish" : "bullish",
      startIndex: p1.index,
      endIndex: p2.index,
      confirmationIndex,
      necklineLevel: trough.price,
      targetPrice,
      invalidationLevel: p1.type === "high" ? Math.max(p1.price, p2.price) : Math.min(p1.price, p2.price),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. Head & Shoulders (thường + ngược)
// ---------------------------------------------------------------------------
function detectHeadAndShoulders(candles, pivots, opts) {
  const results = [];

  for (let i = 0; i < pivots.length - 4; i++) {
    const [shoulder1, trough1, head, trough2, shoulder2] = pivots.slice(i, i + 5);

    const expectedType = shoulder1.type; // "high" (thường) hoặc "low" (ngược)
    if (
      shoulder1.type !== expectedType ||
      head.type !== expectedType ||
      shoulder2.type !== expectedType ||
      trough1.type === expectedType ||
      trough2.type === expectedType
    )
      continue;

    const shoulderDiffPct = (Math.abs(shoulder1.price - shoulder2.price) / shoulder1.price) * 100;
    if (shoulderDiffPct > opts.peakTolerancePct * 1.5) continue;

    const headHigherThanShoulders =
      expectedType === "high"
        ? head.price > shoulder1.price && head.price > shoulder2.price
        : head.price < shoulder1.price && head.price < shoulder2.price;
    if (!headHigherThanShoulders) continue;

    // Neckline: nối 2 đáy/đỉnh giữa (trough1, trough2) — dùng giá trị trung bình để đơn giản hóa
    const necklineLevel = (trough1.price + trough2.price) / 2;

    const confirmationIndex = findBreakoutIndex(
      candles,
      shoulder2.index,
      necklineLevel,
      expectedType === "high" ? "down" : "up"
    );
    if (confirmationIndex === -1) continue;

    const height = Math.abs(head.price - necklineLevel);
    const targetPrice = expectedType === "high" ? necklineLevel - height : necklineLevel + height;

    results.push({
      type: expectedType === "high" ? "Head & Shoulders" : "Inverse Head & Shoulders",
      direction: expectedType === "high" ? "bearish" : "bullish",
      startIndex: shoulder1.index,
      endIndex: shoulder2.index,
      confirmationIndex,
      necklineLevel,
      targetPrice,
      invalidationLevel: head.price,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Tam giác (tăng dần / giảm dần / cân)
// ---------------------------------------------------------------------------
function detectTriangles(candles, pivots, opts, windowSize = 4) {
  const results = [];

  for (let i = 0; i + windowSize <= pivots.length; i++) {
    const window = pivots.slice(i, i + windowSize);
    const highs = window.filter((p) => p.type === "high");
    const lows = window.filter((p) => p.type === "low");
    if (highs.length < 2 || lows.length < 2) continue;

    const highSlope = linearSlope(highs);
    const lowSlope = linearSlope(lows);

    const flat = (slope) => Math.abs(slope) < 0.0005; // gần như đi ngang

    let triangleType = null;
    if (flat(highSlope) && lowSlope > 0) triangleType = "Ascending Triangle";
    else if (highSlope < 0 && flat(lowSlope)) triangleType = "Descending Triangle";
    else if (highSlope < 0 && lowSlope > 0) triangleType = "Symmetrical Triangle";
    if (!triangleType) continue;

    const lastPivot = window[window.length - 1];
    const resistanceAtEnd = projectLine(highs, lastPivot.index);
    const supportAtEnd = projectLine(lows, lastPivot.index);

    const breakoutDirection = triangleType === "Descending Triangle" ? "down" : "up";
    const breakoutLevel = breakoutDirection === "up" ? resistanceAtEnd : supportAtEnd;

    const confirmationIndex = findBreakoutIndex(candles, lastPivot.index, breakoutLevel, breakoutDirection);
    if (confirmationIndex === -1) continue;

    const height = Math.abs(resistanceAtEnd - supportAtEnd);
    const targetPrice = breakoutDirection === "up" ? breakoutLevel + height : breakoutLevel - height;

    results.push({
      type: triangleType,
      direction: breakoutDirection === "up" ? "bullish" : "bearish",
      startIndex: window[0].index,
      endIndex: lastPivot.index,
      confirmationIndex,
      necklineLevel: breakoutLevel,
      targetPrice,
      invalidationLevel: breakoutDirection === "up" ? supportAtEnd : resistanceAtEnd,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Hàm hỗ trợ dùng chung
// ---------------------------------------------------------------------------

/** Hồi quy tuyến tính đơn giản (index -> price) trên tập pivot cùng loại. */
function linearSlope(points) {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.index, 0);
  const sumY = points.reduce((s, p) => s + p.price, 0);
  const sumXY = points.reduce((s, p) => s + p.index * p.price, 0);
  const sumXX = points.reduce((s, p) => s + p.index * p.index, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Chiếu đường xu hướng (fit từ các pivot) tới một index cụ thể để lấy giá dự kiến. */
function projectLine(points, atIndex) {
  const slope = linearSlope(points);
  const last = points[points.length - 1];
  return last.price + slope * (atIndex - last.index);
}

/**
 * Tìm nến đầu tiên đóng cửa vượt qua breakoutLevel theo hướng chỉ định,
 * tính từ afterIndex. Đây là "ngày xác nhận đột phá" dùng cho backtest.
 */
function findBreakoutIndex(candles, afterIndex, breakoutLevel, direction) {
  for (let i = afterIndex + 1; i < candles.length; i++) {
    const close = candles[i].close;
    if (direction === "down" && close < breakoutLevel) return i;
    if (direction === "up" && close > breakoutLevel) return i;
  }
  return -1; // chưa xác nhận trong dữ liệu hiện có
}
