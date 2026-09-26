/**
 * Observability tối giản (mục 12.3–12.4 tài liệu v3): log có cấu trúc (asOf, version, độ trễ,
 * tuổi dữ liệu, tỷ lệ lỗi schema) + bộ đếm trong bộ nhớ cho tần suất lỗi/độ mới dữ liệu, và một
 * hàm chặn dữ liệu MOCK lọt vào production. KHÔNG phụ thuộc dịch vụ ngoài (Sentry, Datadog...) —
 * transport mặc định là console; dự án tự thay bằng transport thật qua setObservabilityTransport.
 */

export type ObservabilityLevel = 'info' | 'warn' | 'error';

export interface ObservabilityEvent {
  name: string;
  level: ObservabilityLevel;
  /** Dữ liệu có cấu trúc đi kèm — ví dụ { ticker, kind, latencyMs, asOf, version }. */
  fields?: Record<string, unknown>;
  /** Mặc định là thời điểm gọi hàm; truyền vào khi cần tái lập cho test. */
  ts?: string;
}

export type ObservabilityTransport = (event: Required<ObservabilityEvent>) => void;

const consoleTransport: ObservabilityTransport = (event) => {
  const line = `[cotuc:${event.level}] ${event.name}`;
  const payload = { ts: event.ts, ...event.fields };
  if (event.level === 'error') console.error(line, payload);
  else if (event.level === 'warn') console.warn(line, payload);
  else console.info(line, payload);
};

let transport: ObservabilityTransport = consoleTransport;

/** Thay transport mặc định (console) bằng dịch vụ thật (Sentry, Datadog, log tập trung...). */
export function setObservabilityTransport(t: ObservabilityTransport | null): void {
  transport = t ?? consoleTransport;
}

/** Chỉ dùng trong test để khôi phục transport mặc định giữa các test. */
export function resetObservabilityTransport(): void {
  transport = consoleTransport;
}

export function logObservabilityEvent(event: ObservabilityEvent): void {
  const full: Required<ObservabilityEvent> = { fields: {}, ts: new Date().toISOString(), ...event };
  try {
    transport(full);
  } catch {
    // Transport lỗi không được làm hỏng luồng chính — observability là phụ trợ, không phải nghiệp vụ.
  }
  incrementCounter(`event.${event.name}.${event.level}`);
}

// ---------------------------------------------------------------------------
// Bộ đếm trong bộ nhớ (cho dashboard nội bộ đơn giản hoặc để test hành vi log)
// ---------------------------------------------------------------------------

const counters = new Map<string, number>();

export function incrementCounter(key: string, by = 1): void {
  counters.set(key, (counters.get(key) ?? 0) + by);
}

/** Bản sao snapshot — sửa đối tượng trả về không ảnh hưởng bộ đếm thật. */
export function getCounterSnapshot(): Readonly<Record<string, number>> {
  return Object.fromEntries(counters);
}

/** Chỉ dùng trong test để bắt đầu lại từ số 0 giữa các test. */
export function resetCounters(): void {
  counters.clear();
}

// ---------------------------------------------------------------------------
// Trợ giúp theo mục 12.3: độ trễ, tuổi dữ liệu, tỷ lệ lỗi schema
// ---------------------------------------------------------------------------

/** Ghi log một lần gọi fetch: thành công/thất bại, độ trễ, và (nếu có) version/asOf trả về. */
export function logFetchOutcome(params: {
  source: string; // ví dụ 'cycle-stats', 'cycle-paths', 'timing-signals'
  ticker?: string;
  latencyMs: number;
  ok: boolean;
  errorKind?: string;
  version?: string;
  asOf?: string;
}): void {
  const { source, ticker, latencyMs, ok, errorKind, version, asOf } = params;
  logObservabilityEvent({
    name: `fetch.${source}`,
    level: ok ? 'info' : 'warn',
    fields: { ticker, latencyMs, ok, errorKind, version, asOf },
  });
}

/** Cảnh báo khi dữ liệu vượt ngưỡng tuổi (mục 12.3: "nguồn ngừng cập nhật"). */
export function reportFreshness(source: string, ticker: string | undefined, isStale: boolean, asOf: string): void {
  if (!isStale) return;
  logObservabilityEvent({ name: `stale.${source}`, level: 'warn', fields: { ticker, asOf } });
}

/**
 * Tỷ lệ tín hiệu `selected` bất thường (mục 12.3): gọi sau khi Screener nhận một loạt
 * TimingSignal, để phát hiện pipeline hỏng (ví dụ toàn bộ vũ trụ đột ngột NO_SIGNAL).
 * `expectedRange` mặc định [0.05, 0.9] — rất thấp hoặc rất cao đều đáng ngờ hơn là "thị trường
 * hôm nay không có cơ hội nào", vốn hiếm khi đúng cho một vũ trụ hàng chục/hàng trăm mã.
 */
export function reportSelectedRateAnomaly(
  totalSignals: number,
  selectedCount: number,
  expectedRange: readonly [number, number] = [0.05, 0.9],
): void {
  if (totalSignals === 0) return;
  const rate = selectedCount / totalSignals;
  if (rate < expectedRange[0] || rate > expectedRange[1]) {
    logObservabilityEvent({
      name: 'timing_signals.selected_rate_anomaly',
      level: 'warn',
      fields: { totalSignals, selectedCount, rate },
    });
  }
}

// ---------------------------------------------------------------------------
// Chặn dữ liệu MOCK lọt vào production (mục 12.4)
// ---------------------------------------------------------------------------

export class MockDataInProductionError extends Error {
  constructor(context: string) {
    super(`Dữ liệu MOCK không được phép xuất hiện ở production: ${context}`);
    this.name = 'MockDataInProductionError';
  }
}

/**
 * Gọi tại nơi dữ liệu giả lập (mock/demo) có thể lọt vào — ví dụ trước khi render dữ liệu có
 * `source === 'MOCK'` hay tương đương. Ném lỗi khi `env === 'production'`; ở môi trường khác chỉ
 * ghi log cảnh báo. `env` truyền vào tường minh (không tự đọc `process.env`/`import.meta.env`)
 * để hàm này thuần và test được trên mọi runtime.
 */
export function assertNoMockInProduction(context: string, isMock: boolean, env: string | undefined): void {
  if (!isMock) return;
  if (env === 'production') throw new MockDataInProductionError(context);
  logObservabilityEvent({ name: 'mock_data_used', level: 'warn', fields: { context, env: env ?? 'unknown' } });
}
