// Quản lý trạng thái & cache (Mục 10) + Circuit Breaker cho alert (Mục 14.8)
// Bản in-memory đơn giản cho MVP — khi triển khai production nên thay bằng
// Redis để chia sẻ trạng thái giữa nhiều instance.

const lastScanHash = new Map(); // key: `${symbol}:${timeframe}` -> hash string
const alertCooldown = new Map(); // key: symbol -> { lastAlertAt, confirmCount }

/**
 * pHash giả lập — trong production nên thay bằng thuật toán perceptual hash
 * thật (vd. thư viện `sharp` + DCT) tính trên ảnh đã crop.
 * Ở đây dùng hash đơn giản trên chuỗi đại diện dữ liệu ảnh/nến để minh họa
 * cơ chế "chỉ gọi AI khi có thay đổi đáng kể".
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

export function shouldSkipDueToCache(symbol, timeframe, representativeData) {
  const key = `${symbol}:${timeframe}`;
  const newHash = simpleHash(representativeData);
  const prevHash = lastScanHash.get(key);
  lastScanHash.set(key, newHash);
  return prevHash === newHash;
}

// --- Cache kết quả scan đầy đủ, dùng cùng key với shouldSkipDueToCache ---
// Khi shouldSkipDueToCache trả true (dữ liệu chưa đổi), scan.js trả thẳng
// kết quả cache thay vì gọi lại AI Vision + backtest + AI Synthesis — tiết
// kiệm chi phí API và tăng tốc phản hồi đáng kể (Giai đoạn 1, mục 4).
const lastScanResult = new Map(); // key: `${symbol}:${timeframe}` -> { result, cachedAt }
const SCAN_RESULT_TTL_MS = 10 * 60_000; // 10 phút — tránh phục vụ kết quả quá cũ dù hash trùng (vd. lỗi tính hash)

export function getCachedScanResult(symbol, timeframe) {
  const key = `${symbol}:${timeframe}`;
  const entry = lastScanResult.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > SCAN_RESULT_TTL_MS) return null;
  return entry.result;
}

export function setCachedScanResult(symbol, timeframe, result) {
  lastScanResult.set(`${symbol}:${timeframe}`, { result, cachedAt: Date.now() });
}

/**
 * Circuit Breaker chống whipsaw (Mục 14.8): yêu cầu 2 lần xác nhận liên
 * tiếp + cooldown window trước khi cho phép bắn alert thật.
 */
export function checkAlertCircuitBreaker(symbol, cooldownMinutes = 15) {
  const now = Date.now();
  const state = alertCooldown.get(symbol) || { lastAlertAt: 0, confirmCount: 0 };

  const withinCooldown = now - state.lastAlertAt < cooldownMinutes * 60 * 1000;
  if (withinCooldown) {
    return { allowed: false, reason: "cooldown_active", confirmCount: state.confirmCount };
  }

  state.confirmCount += 1;
  alertCooldown.set(symbol, state);

  if (state.confirmCount >= 2) {
    state.confirmCount = 0;
    state.lastAlertAt = now;
    alertCooldown.set(symbol, state);
    return { allowed: true, reason: "confirmed", confirmCount: 2 };
  }

  return { allowed: false, reason: "awaiting_second_confirmation", confirmCount: state.confirmCount };
}
