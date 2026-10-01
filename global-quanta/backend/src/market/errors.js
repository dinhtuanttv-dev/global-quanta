// Phân loại lỗi để quyết định có chuyển sang nguồn dự phòng hay không.
//
// - "transient": lỗi mạng, timeout, 5xx, 429, lỗi xác thực, thiếu cấu hình
//   -> nguồn này đang không dùng được, thử nguồn kế tiếp.
// - "client": tham số sai -> KHÔNG fallback (che giấu bug), trả lỗi luôn.
// - "unsupported": provider không hỗ trợ dataset/mã này -> thử nguồn kế tiếp
//   nhưng không tính là sự cố của provider.

export class MarketDataError extends Error {
  constructor(message, { kind = "transient", statusCode, provider, cause } = {}) {
    super(message);
    this.name = "MarketDataError";
    this.kind = kind;
    this.statusCode = statusCode;
    this.provider = provider;
    if (cause) this.cause = cause;
  }
}

export class UnsupportedError extends MarketDataError {
  constructor(message, provider) {
    super(message, { kind: "unsupported", statusCode: 501, provider });
    this.name = "UnsupportedError";
  }
}

export class ValidationError extends MarketDataError {
  constructor(message) {
    super(message, { kind: "client", statusCode: 400 });
    this.name = "ValidationError";
  }
}

export function classifyError(error) {
  if (error instanceof MarketDataError) return error.kind;
  const name = error?.name || "";
  if (name === "ValidationError") return "client";
  if (name === "RateLimitError" || name === "AuthenticationError" || name === "WebSocketError") return "transient";
  if (name === "TimeoutError" || name === "AbortError") return "transient";
  const status = Number(error?.statusCode ?? error?.status);
  if (status === 400 || status === 422) return "client";
  if (status === 404) return "unsupported";
  return "transient";
}

/** Lý do fallback gắn vào provenance để UI hiển thị. */
export function fallbackReason(error) {
  const status = Number(error?.statusCode ?? error?.status);
  const name = error?.name || "";
  if (name === "RateLimitError" || status === 429) return "QUOTA";
  if (name === "AuthenticationError" || status === 401 || status === 403) return "AUTH";
  if (status === 503) return "NOT_CONFIGURED";
  if (error?.kind === "unsupported" || status === 404 || status === 501) return "UNSUPPORTED";
  if (error?.code === "CIRCUIT_OPEN") return "CIRCUIT_OPEN";
  if (error?.code === "STALE") return "STALE";
  return "NETWORK";
}
