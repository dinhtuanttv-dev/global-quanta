// A3 (D-01/D-02/D-03/D-08) — trạng thái dữ liệu của chart, hàm thuần (có test):
//   - "Đang giao dịch" CHỈ khi Gateway báo nến hôm nay đang hình thành (partialToday), dữ liệu không cũ và lần lấy gần đây;
//     thiếu / sai thời điểm -> "không rõ", không bao giờ gắn "đang giao dịch". Thời điểm dữ liệu là `asOf` của Gateway — giờ trình duyệt
//     nhận được (receivedAt) KHÔNG làm dữ liệu "trẻ" hơn.
//   - Nến cuối đang hình thành (phiên đang chạy / tuần, tháng chưa kết thúc) -> vẽ rỗng + chỉ báo trên nến đó là TẠM TÍNH.
import type { SeriesProvenance } from "../../hooks/useTaSeries";
import type { Timeframe } from "./TimeframeController";

export type FreshState = "live" | "closed" | "stale" | "unknown";
export interface Freshness { state: FreshState; label: string; detail: string }

const DAY_RE = /^\d{4}-\d{2}-\d{2}/;
const MAX_LIVE_AGE_MIN = 15;

/** Giờ Việt Nam (UTC+7) của một thời điểm: ngày (YYYY-MM-DD), thứ (0 = CN), phút trong ngày. */
export function vnParts(ms: number) {
  const d = new Date(ms + 7 * 3600_000);
  return { day: d.toISOString().slice(0, 10), dow: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function seriesFreshness(p: SeriesProvenance | null, lastBarDate: string | null, now = Date.now()): Freshness {
  const asOf = p?.asOf && DAY_RE.test(p.asOf) ? p.asOf.slice(0, 10) : null;
  if (!p || !asOf) return { state: "unknown", label: "Không rõ thời điểm", detail: "Gateway không gửi thời điểm dữ liệu hợp lệ — không coi là dữ liệu mới." };
  const src = p.source ?? "không rõ nguồn";
  const fb = p.fallbackReason ? ` · nguồn dự phòng (${p.fallbackReason})` : "";
  const ageDays = Math.max(0, Math.round((Date.parse(vnParts(now).day) - Date.parse(asOf)) / 86_400_000));
  if (p.isStale) return { state: "stale", label: `Dữ liệu cũ · tới ${asOf}`, detail: `${src} · tới phiên ${asOf} (cách ${ageDays} ngày) — Gateway báo dữ liệu chưa được cập nhật${fb}.` };
  const fetched = p.fetchedAt ? Date.parse(p.fetchedAt) : NaN;
  const ageMin = Number.isFinite(fetched) ? Math.max(0, Math.round((now - fetched) / 60_000)) : null;
  if (p.partialToday) {
    if (ageMin == null || ageMin > MAX_LIVE_AGE_MIN) return { state: "stale", label: `Chưa cập nhật ${ageMin ?? "?"} phút`, detail: `${src} · nến ${asOf} đang hình thành nhưng lần lấy gần nhất cách ${ageMin ?? "?"} phút${fb}.` };
    return { state: "live", label: "Đang giao dịch", detail: `${src} · nến ${asOf} đang hình thành · lấy ${ageMin} phút trước${fb}.` };
  }
  const last = lastBarDate && DAY_RE.test(lastBarDate) ? lastBarDate.slice(0, 10) : asOf;
  return { state: "closed", label: `Tới phiên ${last}`, detail: `${src} · dữ liệu tới phiên đã đóng ${last}${fb}.` };
}

/** Nến cuối của khung đang xem có đang hình thành không. */
export function lastBarForming(tf: Timeframe, lastDailyDate: string | null, partialToday: boolean, intradayLive: boolean, now = Date.now()): boolean {
  if (tf === "1m" || tf === "5m" || tf === "15m" || tf === "1H") return intradayLive;
  if (tf === "D") return partialToday;
  if (!lastDailyDate) return false;
  if (partialToday) return true;
  const vn = vnParts(now);
  const afterClose = vn.minutes >= 15 * 60;
  if (tf === "W") {
    // Cùng tuần (thứ Hai đầu tuần) và tuần chưa hết (trước 15:00 thứ Sáu).
    const monday = (day: string) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    if (monday(lastDailyDate.slice(0, 10)) !== monday(vn.day)) return false;
    return vn.dow >= 1 && (vn.dow < 5 || (vn.dow === 5 && !afterClose));
  }
  // M: cùng tháng và chưa qua 15:00 của ngày làm việc cuối tháng.
  if (lastDailyDate.slice(0, 7) !== vn.day.slice(0, 7)) return false;
  const d = new Date(`${vn.day}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  while (lastDay.getUTCDay() === 0 || lastDay.getUTCDay() === 6) lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  const lastWork = lastDay.toISOString().slice(0, 10);
  return vn.day < lastWork || (vn.day === lastWork && !afterClose);
}
