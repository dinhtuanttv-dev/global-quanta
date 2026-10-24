"use client";
// A5 (R-07) — tuổi của bản quét bộ lọc: dữ liệu cũ hơn phiên đã đóng gần nhất -> nhãn CŨ (kèm số phiên chậm), không trình bày như kết quả mới.
// Không có lịch nghỉ lễ ở đây: ngày nghỉ có thể làm nhãn báo cũ nhầm -> câu chữ ghi rõ "(nếu không phải ngày nghỉ)".
import { vnParts } from "../../../lib/ta-command-center/dataStatus";

/** Phiên đã đóng gần nhất (thứ Hai–Sáu, sau 15:00 giờ VN), không tính ngày nghỉ lễ. */
export function lastClosedSession(now = Date.now()): string {
  const vn = vnParts(now);
  const d = new Date(`${vn.day}T00:00:00Z`);
  const afterClose = vn.minutes >= 15 * 60;
  if (!(vn.dow >= 1 && vn.dow <= 5 && afterClose)) d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Số phiên (thứ Hai–Sáu) từ `asOf` tới `expected`. */
export function sessionsBehind(asOf: string, expected: string): number {
  let n = 0;
  const d = new Date(`${asOf.slice(0, 10)}T00:00:00Z`);
  while (d.toISOString().slice(0, 10) < expected) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++; }
  return n;
}

export default function ScanAge({ dataAsOf, generatedAt, now = Date.now() }: { dataAsOf?: string | null; generatedAt?: string | null; now?: number }) {
  if (!dataAsOf) return <span className="text-amber-300" data-testid="scan-age" data-state="unknown">· chưa rõ phiên dữ liệu</span>;
  const behind = sessionsBehind(dataAsOf, lastClosedSession(now));
  const hours = generatedAt && Number.isFinite(Date.parse(generatedAt)) ? Math.max(0, Math.round((now - Date.parse(generatedAt)) / 3_600_000)) : null;
  if (behind > 0) {
    return <span className="text-amber-300 font-semibold" data-testid="scan-age" data-state="stale" title="Bản quét chưa cập nhật phiên mới nhất — kết quả có thể đã thay đổi">
      · CŨ {behind} phiên (nếu không phải ngày nghỉ){hours != null ? ` · quét ${hours} giờ trước` : ""}</span>;
  }
  return <span className="text-slate-500" data-testid="scan-age" data-state="fresh">{hours != null ? `· quét ${hours < 1 ? "< 1" : hours} giờ trước` : ""}</span>;
}
