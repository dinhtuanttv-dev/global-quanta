// Port từ locnganh-timing-engine (backend/decision-engine/signal-tracking-log.ts).
/**
 * backend/decision-engine/signal-tracking-log.ts — "Mô hình có còn hoạt động không?" chỉ trả
 * lời được bằng cách ghi lại MỌI tín hiệu đã phát ra và đối chiếu với kết quả thực tế sau đó.
 * Module này thuần (không I/O): nhận một TrackingStore (in-memory hoặc do tầng gọi cấp, ví dụ
 * đọc/ghi từ DB) và các hàm thao tác trên đó.
 *
 * CUSUM (Cumulative Sum Control Chart) phát hiện lợi thế suy giảm SỚM hơn nhìn "tỷ lệ đúng 30
 * ngày gần nhất" — vì CUSUM cộng dồn LỆCH so với mục tiêu, một chuỗi lệch nhỏ nhưng liên tục
 * bị phát hiện nhanh hơn một cú sốc đơn lẻ làm rớt trung bình trượt tạm thời.
 */

export interface SignalRecord {
  id: string;
  ticker: string;
  quarter?: number;
  /** Xác suất hệ thống đã báo cáo tại thời điểm phát tín hiệu (đã hiệu chỉnh nếu có calibration map). */
  predictedProbability: number;
  issuedAt: string;
  /**
   * Log-odds của TỪNG tín hiệu thành phần (cổ tức, mùa vụ KQKD, RS...) tại thời điểm phát,
   * theo ĐÚNG thứ tự cố định — cần để sau này học trọng số bằng hồi quy logistic
   * (xem learn-signal-weights.ts). Bỏ trống nếu chỉ cần theo dõi accuracy/CUSUM, không cần học
   * trọng số. Ghi rõ tên trong mỗi phần tử để phát hiện khi bộ tín hiệu thay đổi qua thời gian.
   */
  components?: { name: string; logOdds: number }[];
  /** 1 nếu đúng hướng (CAR dương từ entry-exit thực tế), 0 nếu sai, undefined nếu CHƯA có kết quả. */
  outcome?: 0 | 1;
  outcomeRecordedAt?: string;
}

export interface TrackingStore {
  records: Map<string, SignalRecord>;
  /** Trạng thái CUSUM đang chạy — giữ liên tục qua các lần cập nhật, không tính lại từ đầu mỗi lần. */
  cusum: CusumState;
}

export function createTrackingStore(): TrackingStore {
  return { records: new Map(), cusum: createCusumState() };
}

export function recordSignal(store: TrackingStore, record: Omit<SignalRecord, 'outcome' | 'outcomeRecordedAt'>): void {
  if (store.records.has(record.id)) throw new Error(`recordSignal: id đã tồn tại: ${record.id}`);
  store.records.set(record.id, { ...record });
}

export interface RecordOutcomeOptions {
  /** Mục tiêu CUSUM đang giám sát (tỷ lệ đúng kỳ vọng, ví dụ từ calibration). Mặc định 0,5 nếu không truyền. */
  cusumTarget?: number;
  cusumK?: number;
  cusumH?: number;
}

/** Ghi kết quả thực cho một tín hiệu đã phát, đồng thời cập nhật CUSUM (một lần, không cập nhật lại nếu gọi trùng). */
export function recordOutcome(store: TrackingStore, id: string, outcome: 0 | 1, recordedAt: string, options: RecordOutcomeOptions = {}): void {
  const rec = store.records.get(id);
  if (!rec) throw new Error(`recordOutcome: không tìm thấy tín hiệu id=${id}`);
  if (rec.outcome !== undefined) throw new Error(`recordOutcome: id=${id} đã có kết quả, không ghi đè`);
  rec.outcome = outcome;
  rec.outcomeRecordedAt = recordedAt;
  store.cusum = cusumUpdate(store.cusum, outcome, options.cusumTarget ?? 0.5, options.cusumK ?? 0.05, options.cusumH ?? 5);
}

function resolvedOutcomes(store: TrackingStore): SignalRecord[] {
  return [...store.records.values()].filter((r) => r.outcome !== undefined);
}

/** Tỷ lệ đúng trên N tín hiệu gần nhất ĐÃ CÓ kết quả (sắp theo issuedAt). null nếu chưa có tín hiệu nào có kết quả. */
export function rollingAccuracy(store: TrackingStore, windowSize?: number): number | null {
  const resolved = resolvedOutcomes(store).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  if (resolved.length === 0) return null;
  const slice = windowSize ? resolved.slice(-windowSize) : resolved;
  return slice.reduce((a, r) => a + (r.outcome as number), 0) / slice.length;
}

/** Brier score trên toàn bộ tín hiệu đã có kết quả — dùng để nạp vào core/probability-calibration.ts. */
export function brierScoreFromStore(store: TrackingStore): number | null {
  const resolved = resolvedOutcomes(store);
  if (resolved.length === 0) return null;
  const sum = resolved.reduce((a, r) => a + (r.predictedProbability - (r.outcome as number)) ** 2, 0);
  return sum / resolved.length;
}

export function calibrationPointsFromStore(store: TrackingStore): { predicted: number; outcome: 0 | 1 }[] {
  return resolvedOutcomes(store).map((r) => ({ predicted: r.predictedProbability, outcome: r.outcome as 0 | 1 }));
}

// ---------------------------------------------------------------------------
// CUSUM — phát hiện lợi thế suy giảm
// ---------------------------------------------------------------------------

export interface CusumState {
  /** Tổng lệch dương tích luỹ (phát hiện tỷ lệ đúng TĂNG bất thường — hiếm khi là vấn đề, nhưng theo dõi cho đối xứng). */
  posSum: number;
  /** Tổng lệch âm tích luỹ (phát hiện tỷ lệ đúng GIẢM — đây là cảnh báo quan trọng). */
  negSum: number;
  n: number;
  alarmed: boolean;
  /** 'HIGH' nếu posSum vượt ngưỡng, 'LOW' nếu negSum vượt ngưỡng (đáng lo), null nếu chưa báo động. */
  alarmDirection: 'HIGH' | 'LOW' | null;
}

export function createCusumState(): CusumState {
  return { posSum: 0, negSum: 0, n: 0, alarmed: false, alarmDirection: null };
}

/**
 * Cập nhật CUSUM hai phía chuẩn (Page, 1954): z = observed − target; S+ = max(0, S+ + z − k);
 * S− = min(0, S− + z + k). Báo động khi S+ > h (tỷ lệ đúng đang CAO hơn kỳ vọng liên tục) hoặc
 * S− < −h (tỷ lệ đúng đang THẤP hơn kỳ vọng liên tục — cảnh báo suy giảm lợi thế).
 * `k` (allowance/slack) nên đặt ~ nửa mức lệch nhỏ nhất muốn phát hiện; `h` (ngưỡng quyết định)
 * càng lớn thì càng ít báo động giả nhưng phát hiện chậm hơn — cần cân bằng theo dữ liệu thật.
 */
export function cusumUpdate(state: CusumState, observed: 0 | 1, target: number, k: number, h: number): CusumState {
  const z = observed - target;
  const posSum = Math.max(0, state.posSum + z - k);
  const negSum = Math.min(0, state.negSum + z + k);
  const n = state.n + 1;
  const alarmedHigh = posSum > h;
  const alarmedLow = -negSum > h;
  const alarmed = alarmedHigh || alarmedLow;
  return { posSum, negSum, n, alarmed, alarmDirection: alarmed ? (alarmedLow ? 'LOW' : 'HIGH') : null };
}

/** Reset CUSUM về 0 (dùng sau khi đã xử lý báo động, ví dụ đã hạ trọng số mô hình) — KHÔNG xoá lịch sử SignalRecord. */
export function resetCusum(store: TrackingStore): void {
  store.cusum = createCusumState();
}
