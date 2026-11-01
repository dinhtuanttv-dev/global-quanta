// Bảo vệ sổ theo dõi dạng "mục lục + một bản chụp mỗi ngày" (Cycle Fingerprint, Top 20 v2).
//   Mục lục đọc không được KHÔNG có nghĩa là sổ trống: danh sách ngày luôn hợp nhất với các bản chụp thực có trên kho,
//   để lỗi đọc không tạo mục lục mới làm rơi các ngày cũ.
//   Job chạy khi dữ liệu chưa có phiên vừa đóng thì báo lỗi để bộ lập lịch thử lại, thay vì coi là xong và bỏ sót phiên.
import { lastCompletedSessionDate } from "./calendar.js";
import { notifyOps } from "./alerts.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày có bản chụp trên kho theo tiền tố khoá (ví dụ "cycles:ledger:"); kho không liệt kê được -> rỗng. */
export async function storedSnapshotDates(store, prefix) {
  const keys = (await store.listKv?.(prefix)) ?? [];
  return keys.map((k) => k.slice(prefix.length)).filter((d) => DATE.test(d));
}

/** Đọc mục lục, hợp nhất với bản chụp thực có. `doc` là mục lục đã lưu (có thể null), `healed` = phải ghi lại mục lục. */
export async function loadLedgerIndex(store, indexKey, prefix) {
  const doc = (await store.getKv(indexKey))?.value ?? null;
  const known = doc?.dates ?? [];
  const dates = [...new Set([...known, ...(await storedSnapshotDates(store, prefix))])].sort();
  return { doc, dates, healed: dates.length !== known.length };
}

/** Phiên giao dịch nằm giữa ngày đầu và ngày cuối của sổ mà không có bản chụp. */
export function missingSessions(dates, calendarDates) {
  if (dates.length < 1) return [];
  const have = new Set(dates), first = dates[0], last = dates[dates.length - 1];
  return calendarDates.filter((d) => d > first && d < last && !have.has(d));
}

/** Báo lỗi nếu dữ liệu chưa tới phiên vừa đóng, để bộ lập lịch thử lại sau. */
export function assertLatestSession(dataAsOf, job, now = Date.now()) {
  const expected = lastCompletedSessionDate(new Date(now));
  if (dataAsOf && expected && dataAsOf < expected) throw new Error(`${job}: dữ liệu mới tới ${dataAsOf}, chưa có phiên ${expected}; bản chụp phiên này chưa ghi được.`);
}

/** Cảnh báo vận hành khi sổ có phiên thiếu. */
export function alertMissingSessions(name, missing) {
  if (missing.length) void notifyOps(`ledger-gap:${name}:${missing[missing.length - 1]}`, `Sổ theo dõi ${name} thiếu ${missing.length} phiên: ${missing.join(", ")}`);
}
