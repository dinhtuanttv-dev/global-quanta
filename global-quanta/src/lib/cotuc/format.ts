// Định dạng số/ngày DÙNG CHUNG cho tab Cổ tức (một quy ước duy nhất): số thập phân dấu chấm như toàn ứng dụng,
// phần trăm lợi nhuận luôn có dấu, ngày dd/mm hoặc dd/mm/yyyy, tiền VND phân tách nghìn theo vi-VN.
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 0.1234 -> "12.3%" ; signed -> "+12.3%" / "−4.0%". */
export function fmtRatioPct(v: number | null | undefined, { digits = 1, signed = false } = {}): string {
  if (!isFiniteNum(v)) return '—';
  const s = Math.abs(v * 100).toFixed(digits);
  return signed ? `${v >= 0 ? '+' : '−'}${s}%` : `${v < 0 ? '−' : ''}${s}%`;
}

/** Đã là phần trăm (12.3) -> "12.3%". */
export const fmtPctValue = (v: number | null | undefined, digits = 1) => (isFiniteNum(v) ? `${v.toFixed(digits)}%` : '—');

export const fmtVnd = (v: number | null | undefined) => (isFiniteNum(v) ? Math.round(v).toLocaleString('vi-VN') : '—');

/** Giá cổ phiếu (đồng) -> "62.10" (nghìn đồng, như bảng giá). */
export const fmtPriceK = (v: number | null | undefined) => (isFiniteNum(v) && v > 0 ? (v / 1000).toFixed(2) : '—');

/** "2026-10-07" -> "07/10" */
export const ddmm = (iso: string | null | undefined) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
/** "2026-10-07" -> "07/10/2026" */
export const ddmmyyyy = (iso: string | null | undefined) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
/** "2026-10-07" -> "T4" */
export const weekdayVi = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
/** Offset phiên -> "T−25" / "T+3" / "T0". */
export const fmtOffset = (n: number) => (n === 0 ? 'T0' : n < 0 ? `T−${-n}` : `T+${n}`);
