// Alert Dispatch Service — Mục 10 & 14.8. Chỉ bắn alert khi Circuit Breaker
// cho phép (2 lần xác nhận liên tiếp + ngoài cooldown window).
import { checkAlertCircuitBreaker } from "../utils/cache.js";

export async function dispatchAlertIfAllowed(symbol, scanResult) {
  const cooldownMinutes = Number(process.env.ALERT_COOLDOWN_MINUTES || 15);
  const breaker = checkAlertCircuitBreaker(symbol, cooldownMinutes);

  if (!breaker.allowed) {
    return { sent: false, reason: breaker.reason };
  }

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return { sent: false, reason: "telegram_not_configured" };
  }

  const text = formatAlertText(symbol, scanResult);
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
    });
    return { sent: res.ok, reason: res.ok ? "delivered" : "telegram_error" };
  } catch (err) {
    return { sent: false, reason: "network_error", detail: err.message };
  }
}

function formatAlertText(symbol, scanResult) {
  const v = scanResult.consensus_verdict;
  return (
    `[AI Chart Vision] ${symbol}\n` +
    `Bias: ${v.final_bias} (${v.confidence_tier})\n` +
    `${scanResult.actionable_insight}\n` +
    `Đây là hỗ trợ ra quyết định, không phải khuyến nghị đầu tư đảm bảo lợi nhuận.`
  );
}
