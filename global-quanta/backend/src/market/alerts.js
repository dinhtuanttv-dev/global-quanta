// Cảnh báo vận hành (SSI mất kết nối, chuyển sang nguồn dự phòng, lệch giá...).
// Gửi Telegram nếu đã cấu hình TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID (dùng chung
// với alertDispatch.js), luôn ghi log. Mỗi key chỉ gửi tối đa 1 lần / 10 phút.

const lastSent = new Map();
const THROTTLE_MS = 10 * 60_000;

export async function notifyOps(key, text, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  console.warn(`[market] ${text}`);
  const prev = lastSent.get(key);
  if (prev && now - prev < THROTTLE_MS) return { sent: false, reason: "throttled" };
  lastSent.set(key, now);
  if (String(process.env.MARKET_ALERTS_ENABLED ?? "true").toLowerCase() === "false") return { sent: false, reason: "disabled" };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: "telegram_not_configured" };
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `[Global Quanta • Market Data] ${text}` }),
      signal: AbortSignal.timeout(10_000),
    });
    return { sent: res.ok, reason: res.ok ? "delivered" : "telegram_error" };
  } catch (error) {
    return { sent: false, reason: "network_error", detail: error.message };
  }
}

export function resetAlertThrottle() {
  lastSent.clear();
}
