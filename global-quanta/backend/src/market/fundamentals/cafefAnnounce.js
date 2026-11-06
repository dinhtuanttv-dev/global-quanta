// S8-1 (06/11/2026) — NGÀY CÔNG BỐ BCTC QUÝ THẬT từ lịch sử tin doanh nghiệp CafeF (mục "Tất cả", có từ ~2010).
// Mục đích: thay ngày làm mốc của Mùa vụ KQKD (ngày nhập dữ liệu VNDirect, thường trễ — S3: FPT 6/10 kỳ lệch ≥ 2 phiên) bằng ngày công bố thật,
// trong một BẢN RIÊNG (THĂM DÒ) — bảng "season" của bản chính / Timeline điểm mua không bị đụng tới.
// Hai lớp tin, ưu tiên lớp 1:
//   FILING (lớp 1): tin công bố của chính doanh nghiệp (tiêu đề "MÃ: …") về BCTC quý / kết quả kinh doanh N tháng / giải trình chênh lệch lợi nhuận.
//   PRESS  (lớp 2): bài báo về lãi / doanh thu quý — chỉ LƯU để tham khảo; KHÔNG dùng làm ngày làm mốc (thử 06/11: 3/5 khớp — báo đưa tin
//                  kết quả sơ bộ sớm hơn BCTC), kỳ không có lớp 1 giữ ngày VNDirect như bản chính.
// Loại: BCTC kiểm toán / soát xét / đính chính / hợp đồng kiểm toán / gia hạn, dự báo, kế hoạch, mục tiêu, nghị quyết.
export const CA_VERSION = "CA-v1 (2026-11-06)";

const strip = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ");
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };

export function quarterEndOf(y, q) { return `${y}-${String(q * 3).padStart(2, "0")}-${q === 1 || q === 4 ? "31" : "30"}`; }
const days = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);

/** Kỳ (quý, năm) nêu trong tiêu đề đã bỏ dấu; null nếu không có. */
export function periodOf(s) {
  let m;
  if ((m = /\bquy\s*(iv|iii|ii|i|[1-4])\b\s*(?:\/|nam|-)?\s*(\d{4})?/.exec(s))) return { q: ROMAN[m[1]] ?? Number(m[1]), y: m[2] ? Number(m[2]) : null };
  if ((m = /\b0?(3|6|9|12)\s*thang\b(?:\s*(?:dau\s*)?(?:nam\s*)?(\d{4}))?/.exec(s))) return { q: Number(m[1]) / 3, y: m[2] ? Number(m[2]) : null };
  if (/(ban nien|nua dau nam)/.test(s)) { const y = /(\d{4})/.exec(s); return { q: 2, y: y ? Number(y[1]) : null }; }
  // Cả năm ("kết quả kinh doanh năm 2023", "lãi trước thuế 2024") = kỳ quý 4 (độ trễ ≤ 75 ngày loại BCTC năm kiểm toán tháng 3).
  if ((m = /\b(?:nam\s*)?(20\d{2})\b/.exec(s)) && /(ket qua kinh doanh|loi nhuan|\blai\b|\blntt\b|\blnst\b|doanh thu)/.test(s)) return { q: 4, y: Number(m[1]) };
  return null;
}

const EXCLUDE = /(kiem toan|soat xet|dinh chinh|hop dong|gia han|cong van|lua chon|du bao|ke hoach|muc tieu|ky vong|uoc tinh|uoc dat|du kien|nghi quyet|dai hoi|dhdcd|dhcd|co tuc|chung quyen|tai lieu hop)/;
const FILING_KIND = /(bao cao tai chinh|\bbctc\b|ket qua kinh doanh|ket qua san xuat kinh doanh|giai trinh)/;
const PRESS_KIND = /(\blai\b|loi nhuan|\blntt\b|\blnst\b|doanh thu|\blo\b|thua lo|ket qua kinh doanh)/;

/**
 * Một tin -> { fiscal, tier, lag } hoặc null. date ISO (ngày đăng), title gốc.
 * Năm thiếu: lấy năm của ngày đăng (quý 4 đăng tháng 1–4 -> năm trước). Độ trễ phải trong [1, 75] ngày sau cuối quý
 * (hạn luật: 20 ngày BCTC riêng / 45 ngày hợp nhất; 75 ngày chừa doanh nghiệp nộp muộn, loại BCTC kiểm toán tháng 3).
 */
export function classify(date, title) {
  const raw = String(title).trim();
  const s = strip(raw);
  if (EXCLUDE.test(s)) return null;
  const filing = /^[A-Z0-9]{3,5}\s*:/.test(raw) && FILING_KIND.test(s);
  const press = !filing && PRESS_KIND.test(s);
  if (!filing && !press) return null;
  const p = periodOf(s); if (!p) return null;
  if (filing && /giai trinh/.test(s) && !/(loi nhuan|ket qua|bctc|bao cao tai chinh|chenh lech)/.test(s)) return null;
  const y0 = Number(date.slice(0, 4)), m0 = Number(date.slice(5, 7));
  const y = p.y ?? (p.q === 4 && m0 <= 4 ? y0 - 1 : y0);
  const fiscal = quarterEndOf(y, p.q), lag = days(date, fiscal);
  if (lag < 1 || lag > 75) return null;
  if (filing && /giai trinh/.test(s) && lag > 45) return null; // giải trình cho BCTC soát xét / kiểm toán, không phải lần công bố đầu
  return { fiscal, tier: filing ? "FILING" : "PRESS", lag };
}

/** Tin [[date, title]] -> Map(fiscal -> { date, tier, title }) — sớm nhất của lớp tốt nhất. */
export function announceFromNews(rows) {
  const best = new Map();
  for (const [date, title] of rows) {
    const c = classify(date, title); if (!c) continue;
    const cur = best.get(c.fiscal);
    const better = !cur || (c.tier === "FILING" && cur.tier === "PRESS") || (c.tier === cur.tier && date < cur.date);
    if (better) best.set(c.fiscal, { date, tier: c.tier, title });
  }
  return best;
}

/** Phân tích một trang HTML của Ajax Events_RelatedNews_New -> [[date, title]]. */
export function parsePage(html) {
  return [...String(html).matchAll(/(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/g)].map((m) => [`${m[3]}-${m[2]}-${m[1]}`, m[4].trim()]);
}
