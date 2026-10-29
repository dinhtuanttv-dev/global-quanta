// N3 (29/10/2026) — NẾN NGÀY thời gian thực cho chart mô phỏng Elite 10: nến HÔM NAY dựng từ luồng giá SSI (/api/market/stream:
// mở cửa / cao / thấp / giá khớp / tổng KL / tổng giá trị), VN-Index hôm nay từ chính luồng đó (điểm + giá trị GD toàn sàn).
// Nến chính thức của các phiên trước giữ nguyên; nến hôm nay gắn `partial` ("đang hình thành") tới khi Gateway có nến đóng cửa.
import type { DailyBar } from "./timingSpace";

export interface LiveBar extends DailyBar { open?: number; high?: number; low?: number; partial?: boolean }
export interface QuoteLike { price: number | null; open: number | null; high: number | null; low: number | null; totalVolume: number | null; totalValue: number | null; time?: string | null }
export interface IndexLike { value: number; totalValue: number | null }

/** Nến ngày hôm nay từ bản tin giá (null nếu chưa có giá khớp / mở cửa). */
export function liveBarFromQuote(q: QuoteLike | null, today: string): LiveBar | null {
  if (!q || !(Number(q.price) > 0) || !(Number(q.open) > 0)) return null;
  const close = Number(q.price), open = Number(q.open);
  const high = Math.max(Number(q.high) || close, open, close), low = Math.min(Number(q.low) || close, open, close);
  return { date: today, open, high, low, close, volume: Number(q.totalVolume) || 0, value: Number(q.totalValue) || null, partial: true };
}

/** Thay / nối nến hôm nay vào chuỗi nến ngày (tăng dần). Không có nến trực tiếp -> giữ nguyên. */
export function mergeLiveBar<T extends DailyBar>(bars: T[], live: LiveBar | null): (T | LiveBar)[] {
  if (!live) return bars;
  const last = bars[bars.length - 1];
  if (last && last.date > live.date) return bars;
  return last?.date === live.date ? [...bars.slice(0, -1), live] : [...bars, live];
}

/** VN-Index hôm nay (điểm + giá trị GD toàn sàn) vào chuỗi nến chỉ số. */
export function mergeLiveIndex(bars: DailyBar[], idx: IndexLike | null, today: string): DailyBar[] {
  if (!idx || !(idx.value > 0)) return bars;
  return mergeLiveBar(bars, { date: today, close: idx.value, volume: 0, value: idx.totalValue ?? null, partial: true });
}

export interface CarCandle { offset: number; o: number; h: number; l: number; c: number; partial: boolean }
/**
 * Nến ngày của kỳ hiện tại quy về thang lợi suất vượt VN-Index tích luỹ (exp(CAR) − 1, neo 0 tại `from`), để vẽ trên mặt kỳ tới của
 * chart 3D: mỗi mức giá P của phiên k -> ln(P / P_đầu) − ln(I_k / I_đầu) (cùng điểm VN-Index của phiên cho cả 4 mức — quy đổi gần đúng,
 * VN-Index trong phiên không lấy theo từng mức giá). Chỉ trước sự kiện.
 */
export function candlesInCar(from: number, bars: LiveBar[], indexBars: DailyBar[], lastOff: number): CarCandle[] {
  if (lastOff > 0 || !bars.length) return [];
  const idx = new Map(indexBars.filter((b) => (b.close ?? 0) > 0).map((b) => [b.date, b.close!]));
  const last = bars.length - 1, at = (k: number) => bars[last - (lastOff - k)];
  const a = at(from), ia = a ? idx.get(a.date) : undefined;
  if (!a?.close || !ia) return [];
  const out: CarCandle[] = [];
  for (let k = from; k <= lastOff; k++) {
    const b = at(k), ib = b ? idx.get(b.date) : undefined;
    if (!b?.close || !ib) continue;
    const f = (p: number) => Math.expm1(Math.log(p / a.close!) - Math.log(ib / ia));
    out.push({ offset: k, o: f(b.open ?? b.close), h: f(b.high ?? b.close), l: f(b.low ?? b.close), c: f(b.close), partial: Boolean(b.partial) });
  }
  return out;
}
