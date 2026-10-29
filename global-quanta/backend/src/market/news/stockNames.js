// EV1 (29/10/2026) — danh mục TÊN công ty cho bộ gắn mã tin tức (entityResolver). Danh mục chứng khoán SSI trên Gateway không có tên
// (name = null), nên lấy từ VNDirect /v4/stocks (mã đang niêm yết, từng sàn; phân trang tới trang rỗng — totalPages không tin được).
// Lưu khoá `local:` (chỉ Railway Volume, không tốn Supabase), làm mới sau 7 ngày; lỗi mạng -> dùng bản cũ, không có -> [] (bộ gắn mã
// vẫn chạy bằng mã + bí danh viết tay).
import { buildAliasIndex } from "./entityResolver.js";

const KV_KEY = "local:news:stock-names:v1";
const TTL_MS = 7 * 86_400_000;
const RETRY_MS = 3_600_000;
const FLOORS = ["HOSE", "HNX", "UPCOM"];
const BASE = "https://api-finfo.vndirect.com.vn/v4/stocks";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "application/json" };

export async function fetchStockNames({ fetchImpl = globalThis.fetch, pageSize = 500, maxPages = 10 } = {}) {
  const out = new Map();
  for (const floor of FLOORS) {
    for (let page = 1; page <= maxPages; page++) {
      const r = await fetchImpl(`${BASE}?q=type:STOCK~status:listed~floor:${floor}&size=${pageSize}&page=${page}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`VNDirect stocks ${floor} HTTP ${r.status}`);
      const rows = (await r.json())?.data ?? [];
      if (!rows.length) break;
      for (const s of rows) if (/^[A-Z][A-Z0-9]{2}$/.test(s.code ?? "") && s.companyName) out.set(s.code, { code: s.code, name: s.companyName, short: s.shortName ?? null });
      if (rows.length < pageSize) break;
    }
  }
  return [...out.values()];
}

/** Bộ nạp có bộ nhớ: { index(symbols), meta() }. index() trả chỉ mục bí danh (dựng lại khi danh mục tên / danh mục mã đổi). */
export function createStockNameIndex({ store, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cached = null, builtFor = null, index = null, lastError = null, inFlight = null, lastFailAt = 0;

  async function refresh() {
    const kv = cached ?? (await store?.getKv?.(KV_KEY).catch(() => null))?.value ?? null;
    cached = kv;
    if (kv?.fetchedAt && now() - Date.parse(kv.fetchedAt) < TTL_MS && kv.stocks?.length) return;
    if (now() - lastFailAt < RETRY_MS) return; // lỗi gần đây -> không gọi lại mỗi vòng quét
    try {
      const stocks = await fetchStockNames({ fetchImpl });
      if (stocks.length < 500) throw new Error(`danh mục quá ít (${stocks.length})`);
      cached = { fetchedAt: new Date(now()).toISOString(), stocks };
      lastError = null;
      await store?.setKv?.(KV_KEY, cached).catch(() => {});
    } catch (error) {
      lastError = error.message;
      lastFailAt = now();
    }
  }

  return {
    async index(symbols = []) {
      if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
      await inFlight;
      const extra = [...symbols];
      const key = `${cached?.fetchedAt ?? "none"}|${extra.length}`;
      if (!index || builtFor !== key) { index = buildAliasIndex(cached?.stocks ?? [], undefined, extra); builtFor = key; }
      return index;
    },
    meta: () => ({ source: "VNDIRECT_STOCKS", fetchedAt: cached?.fetchedAt ?? null, names: cached?.stocks?.length ?? 0, lastError }),
  };
}

const shared = new WeakMap();
/** Một bộ nạp cho mỗi store (Event Radar + tin theo mã dùng chung bộ nhớ, chỉ gọi VNDirect một lần). */
export function stockNameIndexFor(store, opts = {}) {
  const k = store ?? shared;
  if (!shared.has(k)) shared.set(k, createStockNameIndex({ store, ...opts }));
  return shared.get(k);
}
