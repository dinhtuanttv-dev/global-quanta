// Sự kiện quyền trực tiếp từ VNDirect finfo (công khai) — nguồn DỰ PHÒNG cho corporateActions.js khi Project A
// /api/cotuc/events không có mã (10/2026: Project A chỉ trả danh sách dự phòng 17 mã vì Neon khoá) hoặc lỗi hẳn.
// Cùng dữ liệu gốc Project A dùng (eventSource VNDIRECT). Đối chiếu ngày 22/10/2026:
//   FPT KINDDIV 21/09/2026 ratio 10 ("Tỷ lệ 100:10"), DIVIDEND 28/05/2026 dividend 1000 ("1000 đ/cp"),
//   HPG STOCKDIV 25/05/2026 ratio 10, VCB STOCKDIV 12/03/2025 ratio 49.5.
// effectiveDate = ngày GDKHQ; ratio = % (100:x); dividend = đồng / cổ phiếu. Quyền mua có giá (RIGHT) không điều chỉnh
// (giống normalizeCorporateEvent).

const BASE = "https://api-finfo.vndirect.com.vn/v4/events";
const TYPES = "DIVIDEND,STOCKDIV,KINDDIV";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36", Accept: "application/json" };

/** Một bản ghi VNDirect -> { exDate, type, cash, ratio, label } (cùng dạng normalizeCorporateEvent) hoặc null. */
export function normalizeVndEvent(e) {
  const exDate = String(e?.effectiveDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate)) return null;
  if (e.type === "DIVIDEND") {
    const cash = Number(e.dividend);
    return cash > 0 && cash < 100_000 ? { exDate, type: "CASH", cash, ratio: 0, label: `Cổ tức ${cash.toLocaleString("vi-VN")}đ` } : null;
  }
  if (e.type === "STOCKDIV" || e.type === "KINDDIV") {
    const ratio = Number(e.ratio) / 100;
    if (!(ratio > 0 && ratio < 5)) return null;
    const type = e.type === "KINDDIV" ? "BONUS_ISSUE" : "STOCK_DIVIDEND";
    return { exDate, type, cash: 0, ratio, label: `${type === "BONUS_ISSUE" ? "Thưởng" : "Cổ tức"} CP ${Math.round(ratio * 1000) / 10}%` };
  }
  return null;
}

/**
 * Sự kiện quyền cho nhiều mã (gộp 40 mã / lượt gọi, có phân trang). Lỗi mạng -> ném lỗi (người gọi quyết định dự phòng).
 * @returns {Promise<Map<string, {exDate, type, cash, ratio, label}[]>>} mọi mã yêu cầu đều có mặt (mảng rỗng = không có sự kiện)
 */
export async function fetchVndEvents(symbols, { fetchImpl = globalThis.fetch, from = "2015-01-01", chunk = 40, pageSize = 2000, timeoutMs = 20_000 } = {}) {
  const out = new Map(symbols.map((s) => [s, []]));
  const seen = new Set();
  for (let i = 0; i < symbols.length; i += chunk) {
    const codes = symbols.slice(i, i + chunk);
    for (let page = 1; page <= 20; page++) {
      const url = `${BASE}?q=code:${codes.join(",")}~type:${TYPES}~locale:VN~effectiveDate:gte:${from}&size=${pageSize}&page=${page}&sort=effectiveDate:asc`;
      const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`VNDirect events HTTP ${res.status}`);
      const body = await res.json();
      const rows = Array.isArray(body?.data) ? body.data : [];
      for (const r of rows) {
        const code = String(r.code ?? "").toUpperCase();
        if (!out.has(code)) continue;
        const key = `${code}|${r.type}|${r.effectiveDate}|${r.ratio}|${r.dividend}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ev = normalizeVndEvent(r);
        if (ev) out.get(code).push(ev);
      }
      const total = Number(body?.totalElements ?? rows.length);
      if (rows.length < pageSize || page * pageSize >= total) break;
    }
  }
  return out;
}
