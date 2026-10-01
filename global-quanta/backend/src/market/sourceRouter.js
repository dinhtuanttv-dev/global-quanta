// SourceRouter: với mỗi loại dữ liệu (dataset), thử lần lượt các provider theo
// chuỗi ưu tiên (mặc định SSI v3 -> SSI FC v2 -> nguồn cũ), có circuit breaker
// riêng cho từng cặp provider/dataset.
//
// Quy tắc:
// - Provider chưa cấu hình: bỏ qua im lặng (không tính là fallback).
// - Lỗi "client" (tham số sai): ném ngay, KHÔNG fallback để không che bug.
// - Lỗi "transient": ghi nhận vào breaker, thử provider kế tiếp.
// - Lỗi "unsupported": thử provider kế tiếp, không ghi nhận vào breaker.
// - Dữ liệu rỗng hợp lệ (mã ngừng giao dịch, ngày nghỉ) KHÔNG phải lỗi.

import { chainFor, marketConfig } from "./config.js";
import { CircuitBreaker, BreakerState } from "./circuitBreaker.js";
import { classifyError, fallbackReason, MarketDataError } from "./errors.js";

export class SourceRouter {
  /**
   * @param {Record<string, any>} providers  name -> provider
   * @param {{ onBreakerChange?: Function, onFallback?: Function, now?: () => number }} [opts]
   */
  constructor(providers, { onBreakerChange, onFallback, now = Date.now } = {}) {
    this.providers = providers;
    this.breakers = new Map();
    this.onBreakerChange = onBreakerChange;
    this.onFallback = onFallback;
    this.now = now;
  }

  breaker(provider, dataset) {
    const key = `${provider}:${dataset}`;
    if (!this.breakers.has(key)) {
      this.breakers.set(key, new CircuitBreaker(key, {
        ...marketConfig().breaker,
        now: this.now,
        onChange: (event) => this.onBreakerChange?.({ ...event, provider, dataset }),
      }));
    }
    return this.breakers.get(key);
  }

  /** Danh sách provider đã cấu hình theo đúng thứ tự ưu tiên của dataset. */
  configuredChain(dataset, { only } = {}) {
    return chainFor(dataset)
      .filter((name) => !only || only.includes(name))
      .map((name) => [name, this.providers[name]])
      .filter(([, provider]) => provider?.isConfigured?.());
  }

  /**
   * @returns {Promise<{ data: any, provider: string, source: string, fallbackReason: string|null, attempts: Array }>}
   */
  async run(dataset, method, args = [], { only } = {}) {
    const attempts = [];
    let reason = null;
    const chain = this.configuredChain(dataset, { only });
    if (!chain.length) {
      throw new MarketDataError(`Chưa cấu hình nguồn dữ liệu nào cho ${dataset}.`, { statusCode: 503 });
    }
    for (const [name, provider] of chain) {
      if (typeof provider[method] !== "function") continue;
      const breaker = this.breaker(name, dataset);
      if (!breaker.canRequest()) {
        attempts.push({ provider: name, reason: "CIRCUIT_OPEN" });
        reason ??= "CIRCUIT_OPEN";
        continue;
      }
      try {
        const data = await provider[method](...args);
        breaker.recordSuccess();
        if (reason) this.onFallback?.({ dataset, provider: name, reason, attempts });
        return { data, provider: name, source: provider.source ?? name, fallbackReason: reason, attempts };
      } catch (error) {
        const kind = classifyError(error);
        if (kind === "client") throw error;
        if (kind === "transient") breaker.recordFailure(error);
        const why = fallbackReason(error);
        attempts.push({ provider: name, reason: why, error: String(error?.message || error).slice(0, 200) });
        if (kind === "transient") reason ??= why;
      }
    }
    const error = new MarketDataError(`Không nguồn nào trả được dữ liệu ${dataset}.`, { statusCode: 502 });
    error.attempts = attempts;
    throw error;
  }

  snapshot() {
    const providers = Object.fromEntries(Object.entries(this.providers).map(([name, p]) => [name, {
      source: p.source,
      configured: Boolean(p.isConfigured?.()),
    }]));
    const breakers = [...this.breakers.values()].map((b) => b.snapshot());
    const degraded = breakers.filter((b) => b.state !== BreakerState.CLOSED).map((b) => b.name);
    return { providers, breakers, degraded };
  }
}
