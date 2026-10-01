// Lớp tương thích cho route cũ GET /api/ssi/stream/market: giữ nguyên định
// dạng sự kiện cũ (quote = payload SSI gốc, status = { connected }) nhưng dùng
// chung StreamHub mới (chia shard ≤50 mã/kết nối, tự nối lại, watchdog).
// Client mới nên dùng GET /api/market/stream.

import { getMarketRuntime } from "../market/runtime.js";

const subscriptions = new Map();

export async function subscribeMarketStream(response, requestedSymbols) {
  if (response.destroyed || response.writableEnded) return;
  const symbols = [...new Set(requestedSymbols.map((symbol) => symbol.toUpperCase()))];
  if (!symbols.length || symbols.length > 50 || symbols.some((symbol) => !/^[A-Z0-9.]{1,20}$/.test(symbol))) {
    const error = new Error("symbols cần gồm 1–50 mã hợp lệ, phân tách bằng dấu phẩy.");
    error.statusCode = 400;
    throw error;
  }
  const { hub, providers } = getMarketRuntime();
  if (!providers.ssiFcV2.isConfigured()) {
    const error = new Error("SSI FC Data credentials are not configured on the backend.");
    error.statusCode = 503;
    throw error;
  }
  const unsubscribe = hub.subscribe({
    symbols,
    raw: true,
    send: (event, data) => {
      if (!response.writableEnded) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
  });
  subscriptions.set(response, unsubscribe);
}

export function unsubscribeMarketStream(response) {
  subscriptions.get(response)?.();
  subscriptions.delete(response);
}
