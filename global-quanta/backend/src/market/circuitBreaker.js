// Circuit breaker có hysteresis cho từng provider.
//
// CLOSED  --(N lỗi trong cửa sổ thời gian)-->  OPEN
// OPEN    --(hết cooldown)-->                  HALF_OPEN (cho phép thử lại)
// HALF_OPEN --(lỗi)-->                         OPEN (cooldown tăng gấp đôi, tối đa 10 phút)
// HALF_OPEN --(K lần thành công liên tiếp)-->  CLOSED
//
// Hysteresis (K > 1) tránh việc nhảy qua lại giữa SSI và nguồn dự phòng khi
// SSI chập chờn: chỉ quay về SSI khi SSI đã ổn định thật sự.

export const BreakerState = Object.freeze({ CLOSED: "CLOSED", OPEN: "OPEN", HALF_OPEN: "HALF_OPEN" });

export class CircuitBreaker {
  constructor(name, { failureThreshold = 3, windowMs = 60_000, cooldownMs = 30_000, recoverySuccesses = 3, now = Date.now, onChange } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.windowMs = windowMs;
    this.baseCooldownMs = cooldownMs;
    this.cooldownMs = cooldownMs;
    this.recoverySuccesses = recoverySuccesses;
    this.now = now;
    this.onChange = onChange;
    this.state = BreakerState.CLOSED;
    this.failures = [];
    this.successStreak = 0;
    this.openedAt = 0;
    this.lastError = null;
    this.lastSuccessAt = null;
    this.changedAt = this.now();
  }

  #transition(next, reason) {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.changedAt = this.now();
    this.onChange?.({ name: this.name, from: prev, to: next, reason, lastError: this.lastError });
  }

  /** Có được phép gửi request tới provider không. */
  canRequest() {
    if (this.state === BreakerState.OPEN && this.now() - this.openedAt >= this.cooldownMs) {
      this.successStreak = 0;
      this.#transition(BreakerState.HALF_OPEN, "cooldown_elapsed");
    }
    return this.state !== BreakerState.OPEN;
  }

  recordSuccess() {
    this.lastSuccessAt = this.now();
    if (this.state === BreakerState.HALF_OPEN) {
      this.successStreak += 1;
      if (this.successStreak >= this.recoverySuccesses) {
        this.failures = [];
        this.cooldownMs = this.baseCooldownMs;
        this.#transition(BreakerState.CLOSED, "recovered");
      }
      return;
    }
    if (this.state === BreakerState.CLOSED) this.failures = [];
  }

  recordFailure(error) {
    const at = this.now();
    this.lastError = error?.message ? String(error.message).slice(0, 300) : String(error);
    if (this.state === BreakerState.HALF_OPEN) {
      this.cooldownMs = Math.min(this.cooldownMs * 2, 10 * 60_000);
      this.openedAt = at;
      this.#transition(BreakerState.OPEN, "probe_failed");
      return;
    }
    this.failures = this.failures.filter((t) => at - t < this.windowMs);
    this.failures.push(at);
    if (this.state === BreakerState.CLOSED && this.failures.length >= this.failureThreshold) {
      this.openedAt = at;
      this.#transition(BreakerState.OPEN, "failure_threshold");
    }
  }

  /** Buộc mở (VD thiếu credentials) — không tự đóng cho tới khi reset(). */
  forceOpen(reason) {
    this.lastError = reason;
    this.openedAt = Number.POSITIVE_INFINITY;
    this.#transition(BreakerState.OPEN, reason);
  }

  snapshot() {
    return {
      name: this.name,
      state: this.state,
      changedAt: new Date(this.changedAt).toISOString(),
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt ? new Date(this.lastSuccessAt).toISOString() : null,
      recentFailures: this.failures.length,
    };
  }
}
