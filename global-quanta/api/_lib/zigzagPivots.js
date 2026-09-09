// zigzagPivots.js — Phát hiện đỉnh/đáy (pivot) bằng thuật toán ZigZag xác
// định (deterministic), KHÔNG dùng AI. Đây là nền tảng hình học cho
// classicPatternDetector.js — cùng một input luôn cho cùng một output,
// điều kiện tiên quyết để backtest đáng tin cậy (khắc phục Mục 14.4/14.1).
//
// Input: mảng nến candles = [{ time, high, low, close }, ...] theo thứ tự
// thời gian tăng dần.
// Output: mảng pivot = [{ index, time, price, type: "high" | "low" }, ...]

/**
 * @param {Array<{time:string|number, high:number, low:number, close:number}>} candles
 * @param {number} reversalPct - % đảo chiều tối thiểu để tính là 1 pivot mới (mặc định 5%)
 * @returns {Array<{index:number, time:string|number, price:number, type:"high"|"low"}>}
 */
export function computeZigZagPivots(candles, reversalPct = 5) {
  if (!Array.isArray(candles) || candles.length < 3) return [];

  const pivots = [];
  let trend = null; // "up" | "down"
  let lastExtremeIndex = 0;
  let lastExtremePrice = candles[0].close;

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (trend === null) {
      // Xác định hướng ban đầu dựa trên biến động đầu tiên vượt ngưỡng
      const upMove = ((high - lastExtremePrice) / lastExtremePrice) * 100;
      const downMove = ((lastExtremePrice - low) / lastExtremePrice) * 100;
      if (upMove >= reversalPct) {
        trend = "up";
        lastExtremeIndex = i;
        lastExtremePrice = high;
      } else if (downMove >= reversalPct) {
        trend = "down";
        lastExtremeIndex = i;
        lastExtremePrice = low;
      }
      continue;
    }

    if (trend === "up") {
      if (high > lastExtremePrice) {
        lastExtremePrice = high;
        lastExtremeIndex = i;
      } else {
        const retracePct = ((lastExtremePrice - low) / lastExtremePrice) * 100;
        if (retracePct >= reversalPct) {
          pivots.push({
            index: lastExtremeIndex,
            time: candles[lastExtremeIndex].time,
            price: lastExtremePrice,
            type: "high",
          });
          trend = "down";
          lastExtremeIndex = i;
          lastExtremePrice = low;
        }
      }
    } else {
      if (low < lastExtremePrice) {
        lastExtremePrice = low;
        lastExtremeIndex = i;
      } else {
        const bouncePct = ((high - lastExtremePrice) / lastExtremePrice) * 100;
        if (bouncePct >= reversalPct) {
          pivots.push({
            index: lastExtremeIndex,
            time: candles[lastExtremeIndex].time,
            price: lastExtremePrice,
            type: "low",
          });
          trend = "up";
          lastExtremeIndex = i;
          lastExtremePrice = high;
        }
      }
    }
  }

  // Chốt pivot cuối cùng đang hình thành (chưa xác nhận đảo chiều)
  pivots.push({
    index: lastExtremeIndex,
    time: candles[lastExtremeIndex].time,
    price: lastExtremePrice,
    type: trend === "up" ? "high" : "low",
  });

  return pivots;
}
