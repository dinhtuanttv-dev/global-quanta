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
