// F5 (06/11/2026) — dịch vụ Chất lượng KQKD: đọc BCTC quý VNDirect đã lưu (KV alpha:vnd, job alpha làm mới) -> buildEarningsQuality.
// Không gọi nguồn ngoài; đệm theo lần làm mới dữ liệu (fetchedAt) và ngày; nguồn tạm lỗi -> trả bản gần nhất kèm stale.
import { ALPHA_KV } from "../alpha/alphaService.js";
import { buildEarningsQuality } from "./earningsQuality.js";

const vnToday = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);

export function createEarningsQualityService({ store, now = Date.now }) {
  let memo = null; // { key, doc }
  async function quality() {
    let vnd = null;
    try { vnd = (await store.getKv(ALPHA_KV.vnd))?.value ?? null; } catch (e) {
      if (memo) return { ...memo.doc, stale: true, staleReason: String(e?.message ?? e) };
      throw e;
    }
    if (!vnd?.fund) return memo?.doc ?? null;
    const today = vnToday(now());
    const key = `${vnd.fetchedAt ?? ""}|${today}`;
    if (memo?.key === key) return memo.doc;
    const doc = { ...buildEarningsQuality(vnd.fund, { today, fetchedAt: vnd.fetchedAt ?? null }), source: vnd.source ?? "VNDIRECT_FINFO" };
    memo = { key, doc };
    return doc;
  }
  return { quality };
}
