// Nguồn THAM CHIẾU open/high/low cho chỉ số (VNINDEX, VN30, HNX…) từ VNDirect finfo (api-finfo.vndirect.com.vn,
// cùng hạ tầng tin tức đang dùng). SSI DailyIndex nhiều giai đoạn chỉ có giá đóng cửa (O=H=L=C — đối chiếu 03/10/2026:
// 166/249 nến VNINDEX bị "dẹt" tới 04/06/2026). Chỉ dùng để BỔ SUNG O/H/L khi giá đóng cửa khớp SSI; SSI vẫn là nguồn chính.

import { canonicalSymbol } from "../normalizer.js";

const BASE = "https://api-finfo.vndirect.com.vn/v4/vnmarket_prices";
// Mã chỉ số Gateway -> mã VNDirect.
const VND_CODE = { VNINDEX: "VNINDEX", VN30: "VN30", VN100: "VN100", HNXINDEX: "HNX", HNX30: "HNX30", HNXUPCOMINDEX: "UPCOM" };
const PAGE = 1000;

export function vndirectIndexCode(symbol) {
  return VND_CODE[canonicalSymbol(symbol)] ?? null;
}

export function createVndirectIndexProvider({ fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  async function page(code, from, to, pageNo) {
    const q = `code:${code}~date:gte:${from}~date:lte:${to}`;
    const url = `${BASE}?sort=date:asc&size=${PAGE}&page=${pageNo}&q=${q}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`VNDirect vnmarket_prices HTTP ${res.status}`);
    const body = await res.json();
    return { rows: Array.isArray(body?.data) ? body.data : [], totalPages: Number(body?.totalPages) || 1 };
  }

  return {
    source: "VNDIRECT_FINFO",
    isConfigured: () => typeof fetchImpl === "function",
    /** @returns {Promise<{date, open, high, low, close}[]>} tăng dần theo ngày; mã không hỗ trợ -> [] */
    async getIndexDaily(symbol, from, to) {
      const code = vndirectIndexCode(symbol);
      if (!code) return [];
      const out = [];
      for (let p = 1; p <= 20; p++) {
        const { rows, totalPages } = await page(code, from, to, p);
        for (const r of rows) {
          const bar = { date: String(r.date).slice(0, 10), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) };
          if ([bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0)) out.push(bar);
        }
        if (p >= totalPages || rows.length < PAGE) break;
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}
