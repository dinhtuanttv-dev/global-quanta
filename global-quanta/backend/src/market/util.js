// Tiện ích dùng chung cho tầng dữ liệu thị trường.

/** Chạy fn trên từng phần tử với số luồng song song giới hạn, giữ nguyên thứ tự. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Chia [from, to] thành các cửa sổ tối đa `maxDays` ngày. */
export function dateWindows(fromIso, toIso, maxDays) {
  const windows = [];
  let start = fromIso;
  while (start <= toIso) {
    const end = addDays(start, maxDays - 1) < toIso ? addDays(start, maxDays - 1) : toIso;
    windows.push([start, end]);
    start = addDays(end, 1);
  }
  return windows;
}

/** Cache TTL đơn giản có gộp request đang bay (single-flight). */
export class TtlCache {
  constructor({ maxEntries = 5_000, now = Date.now } = {}) {
    this.entries = new Map();
    this.inflight = new Map();
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs) {
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async wrap(key, ttlMs, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const promise = (async () => {
      try {
        const value = await loader();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  clear() {
    this.entries.clear();
  }
}

/** fetch JSON có timeout, báo lỗi kèm statusCode để errors.classifyError phân loại. */
export async function fetchJson(url, { headers = {}, timeoutMs = 10_000, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} từ ${new URL(url).host}`);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  if (!contentType.includes("json")) {
    const error = new Error(`Response từ ${new URL(url).host} không phải JSON (${contentType || "không có content-type"}).`);
    error.statusCode = 502;
    throw error;
  }
  return response.json();
}
