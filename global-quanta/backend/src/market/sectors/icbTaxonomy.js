// Lọc ngành (L1) — phân ngành ICB của VNDirect finfo (api-finfo.vndirect.com.vn/v4/industry_classification), 3 cấp:
//   cấp 1 (10 ngành), cấp 2 (19 ngành — TOÀN BỘ thị trường chứng khoán VN, trục chính của engine xoay vòng ngành),
//   cấp 3 (42 ngành — chi tiết: Ngân hàng, Dịch vụ tài chính/chứng khoán, Kim loại công nghiệp/thép, BĐS…).
// Mỗi ngành có `codeList` (danh sách mã) -> bảng mã -> {l1, l2, l3}. TÁCH RIÊNG với phân ngành của Siêu Quét (taxonomy.js,
// TradingView) để không ảnh hưởng tab khác.

const URL_BASE = "https://api-finfo.vndirect.com.vn/v4/industry_classification";
export const ICB_KV = "sectors:icb";
export const ICB_MAX_AGE_MS = 7 * 86_400_000;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Chuyển các bản ghi VNDirect (mọi cấp) thành { levels, symbols } — hàm thuần, test được không cần mạng. */
export function buildIcbTaxonomy(rowsByLevel) {
  const levels = { 1: [], 2: [], 3: [] }, byCode = new Map();
  for (const lv of [1, 2, 3]) {
    for (const r of rowsByLevel[lv] ?? []) {
      const code = clean(r.industryCode).padStart(4, "0");
      const item = { code, level: lv, name: clean(r.vietnameseName), en: clean(r.englishName), parent: r.higherLevelCode ? clean(r.higherLevelCode).padStart(4, "0") : null,
        symbols: String(r.codeList ?? "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9]{3,10}$/.test(x)) };
      levels[lv].push(item); byCode.set(code, item);
    }
    levels[lv].sort((a, b) => a.code.localeCompare(b.code));
  }
  const symbols = {};
  for (const lv of [1, 2, 3]) for (const it of levels[lv]) for (const s of it.symbols) (symbols[s] ??= {})[`l${lv}`] = it.code;
  // điền cấp trên còn thiếu theo quan hệ cha – con (một số mã chỉ có ở danh sách cấp thấp)
  for (const m of Object.values(symbols)) {
    if (!m.l2 && m.l3) m.l2 = byCode.get(m.l3)?.parent ?? null;
    if (!m.l1 && m.l2) m.l1 = byCode.get(m.l2)?.parent ?? null;
  }
  const strip = (it) => ({ code: it.code, level: it.level, name: it.name, en: it.en, parent: it.parent, count: it.symbols.length });
  return { levels: { 1: levels[1].map(strip), 2: levels[2].map(strip), 3: levels[3].map(strip) }, symbols };
}

export async function fetchIcbTaxonomy({ fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  const rowsByLevel = {};
  for (const lv of [1, 2, 3]) {
    const res = await fetchImpl(`${URL_BASE}?q=industryLevel:${lv}&size=500`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`VNDirect industry_classification cấp ${lv}: HTTP ${res.status}`);
    const body = await res.json();
    rowsByLevel[lv] = Array.isArray(body?.data) ? body.data : [];
    if (!rowsByLevel[lv].length) throw new Error(`VNDirect industry_classification cấp ${lv}: rỗng`);
  }
  return buildIcbTaxonomy(rowsByLevel);
}
