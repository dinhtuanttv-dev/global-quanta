// Kiểu dữ liệu và hàm thuần cho Giám sát thị trường & Tin thế giới (Gateway /api/world/monitor, /api/world/news).
export type MonitorGroup = "index" | "macro" | "commodity";
export interface MonitorItem {
  id: string; symbol: string; nameVi: string; group: MonitorGroup; unit: string; sourceVi: string; available: boolean;
  value?: number; date?: string; time?: string; prevClose?: number | null; change?: number | null; changeIn?: "pct" | "bps";
  z?: number | null; unusual?: boolean; rangePct?: number | null; moveRank?: number | null; ageDays?: number; stale?: boolean; spark?: [string, number][];
}
export interface MonitorDoc {
  generatedAt: string; items: MonitorItem[];
  summary: { total: number; available: number; stale: number; abnormal: { id: string; nameVi: string; z: number }[]; indexUp: number; indexTotal: number; vixRangePct: number | null };
  method: { window: number; abnormalZ: number; rangeWindow: number; staleDays: number; noteVi: string };
}
export type Verification = "official" | "corroborated" | "single";
export interface NewsItem {
  url: string; title: string; source: string; sourceLabel: string; authority: "official" | "press"; publishedAt: string; firstSeenAt: string;
  topics: string[]; verification: Verification; corroborating: { source: string; sourceLabel: string; url: string }[];
}
export interface NewsSource { id: string; label: string; authority: string; ok: boolean; items: number; newestAt: string | null; checkedAt: string; error?: string; lastOkAt?: string | null }
export interface NewsDoc {
  refreshedAt: string | null; items: NewsItem[]; total: number; topics: Record<string, string>; sources: NewsSource[];
  counts: Record<Verification, number>; noteVi: string;
}

const TZ = "Asia/Ho_Chi_Minh";
/** Giờ Việt Nam, ví dụ "31/10 09:14". Ngày sai thì ghi "—", không đoán. */
export function fmtVnTime(iso: string | null | undefined): string {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const p = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, ...o }).format(d);
  return `${p({ day: "2-digit" })}/${p({ month: "2-digit" })} ${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d)}`;
}
/** "5 phút trước"; thời điểm tương lai (lệch đồng hồ) coi là vừa xong. */
export function fmtAgo(iso: string | null | undefined, nowMs: number): string {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "—";
  const m = Math.max(0, Math.floor((nowMs - ms) / 60_000));
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}
const num = (v: number, d: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtSigned = (v: number | null | undefined, d = 2): string => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), d)}`);
export const fmtChange = (i: Pick<MonitorItem, "change" | "changeIn">): string => (i.change == null ? "—" : i.changeIn === "bps" ? `${fmtSigned(i.change, 1)} điểm cơ bản` : `${fmtSigned(i.change, 2)}%`);
export const fmtValue = (v: number | null | undefined): string => (v == null ? "—" : num(v, v >= 1000 ? 0 : 2));

/** Trục z của bản đồ: cắt ở ±limit để điểm cực trị không ép cả bản đồ; giá trị thật vẫn hiện trong chi tiết. */
export const clampZ = (z: number, limit = 4): number => Math.max(-limit, Math.min(limit, z));

/** Nguồn đang hoạt động trên tổng số; nguồn lỗi được liệt kê để người xem thấy thiếu gì. */
export function sourceHealth(sources: NewsSource[]): { ok: number; total: number; failed: NewsSource[] } {
  const failed = sources.filter((s) => !s.ok);
  return { ok: sources.length - failed.length, total: sources.length, failed };
}
export const VERIFICATION_VI: Record<Verification, { label: string; title: string }> = {
  official: { label: "NGUỒN CHÍNH THỨC", title: "Cơ quan phát hành công bố trực tiếp trên trang của mình." },
  corroborated: { label: "NHIỀU NGUỒN", title: "Từ 2 nhà xuất bản độc lập trở lên cùng đưa tin trong vòng 48 giờ." },
  single: { label: "MỘT NGUỒN", title: "Mới một nguồn báo chí đưa tin, chưa thấy nguồn độc lập nào xác nhận." },
};
