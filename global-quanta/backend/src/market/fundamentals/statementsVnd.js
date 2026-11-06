// K0 (06/11/2026) — KHO BCTC QUÝ ĐẦY ĐỦ từ VNDirect finfo (công khai, miễn phí) cho tab PHÂN TÍCH CƠ BẢN › KQKD theo quý.
//   Ba báo cáo (cân đối kế toán / kết quả kinh doanh / lưu chuyển tiền tệ) theo 4 mẫu biểu của VNDirect:
//     doanh nghiệp (modelType 1/2/3, TT200) · ngân hàng (101/102/103, TT49) · chứng khoán (89/90/91) · bảo hiểm (411/412/413).
//   Số quý là số RIÊNG từng quý (đã đối chiếu: tổng 4 quý CFO FPT 2025 = 10.135 tỷ ≈ số năm 10.136 tỷ), không phải lũy kế.
//   Point-in-time: mỗi quý giữ ngày tạo sớm nhất (createdDate ≈ ngày công bố); VNDirect ghi đè khi công ty điều chỉnh số liệu,
//   nên quý cũ là SỐ ĐÃ ĐIỀU CHỈNH — ghi rõ trong method của API, không coi là số gốc lúc công bố.
//   Kèm số NĂM (ANNUAL) của vài chỉ tiêu để đối chiếu Q1+Q2+Q3+Q4 với BCTC năm (chênh lệch kiểm toán).
const BASE = "https://api-finfo.vndirect.com.vn/v4";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "application/json" };

/** modelType -> [mẫu, báo cáo]. */
export const MODEL = Object.freeze({
  1: ["corp", "bs"], 2: ["corp", "is"], 3: ["corp", "cf"],
  101: ["bank", "bs"], 102: ["bank", "is"], 103: ["bank", "cf"],
  89: ["sec", "bs"], 90: ["sec", "is"], 91: ["sec", "cf"],
  411: ["ins", "bs"], 412: ["ins", "is"], 413: ["ins", "cf"],
});

const COMMON = {
  is: { 21001: "revenue", 23100: "gross", 22110: "selling", 22200: "ga", 21500: "finInc", 22500: "finExp", 23300: "associates", 23110: "opProfit",
    21900: "otherInc", 22900: "otherExp", 23900: "otherProfit", 23800: "pbt", 22070: "tax", 23003: "npat", 23500: "minority", 23000: "npatParent", 23001: "eps" },
  bs: { 12700: "assets", 13000: "liabilities", 14000: "equity", 14110: "capital", 14200: "retained", 14240: "nci" },
  cf: { 32000: "cfo", 33000: "cfi", 34000: "cff", 22230: "dep", 32100: "capex" },
};
/** Mã chỉ tiêu theo mẫu -> tên chuẩn (cộng thêm COMMON). Mã lấy từ financial_models của VNDirect (dò 06/11/2026). */
export const ITEMS = Object.freeze({
  corp: {
    is: { 21000: "revenueGross", 21090: "deductions", 22100: "cogs", 22510: "interest" },
    bs: { 11000: "curAssets", 11100: "cash", 11200: "stInvest", 11300: "stRecv", 11310: "recvCust", 11400: "inventory", 12200: "ppe",
      13100: "curLiab", 13110: "stDebt", 13120: "payables", 13300: "ltLiab", 13340: "ltDebt" },
    cf: {},
  },
  bank: {
    is: { 421100: "intInc", 422100: "intExp", 421900: "nii", 423200: "fees", 423300: "fx", 423400: "tradingSec", 423500: "invSec",
      421600: "otherNet", 421700: "equityInc", 421701: "toi", 88888: "ppop", 422900: "provision" },
    bs: { 411200: "sbv", 411400: "interbank", 411500: "tradingSecBs", 412000: "loans", 412300: "invSecBs", 413300: "deposits", 413600: "papers" },
    cf: {},
  },
  sec: {
    is: { 700039: "fvtplGain", 700046: "fvtplLoss", 700043: "htm", 700044: "lending", 412522: "afs", 621110: "brokerage", 700056: "brokerageCost",
      622100: "opCost", 22509: "interest", 700072: "pbtRealized", 700073: "pbtUnrealized" },
    bs: { 700001: "marginLoans" },
    cf: {},
  },
  ins: {
    is: { 21400: "premiumGross", 21440: "netPremium", 22195: "claims", 22160: "directCost", 22175: "finProfit" },
    bs: {},
    cf: {},
  },
});
/** Chỉ tiêu năm để đối chiếu với tổng 4 quý. */
export const ANNUAL_ITEMS = Object.freeze({ 21001: "revenue", 23000: "npatParent", 23800: "pbt", 32000: "cfo", 421701: "toi" });

/** Bảng tra (mẫu, báo cáo, mã) -> tên chuẩn. */
function mapFor(tpl, part) { return { ...COMMON[part], ...(ITEMS[tpl]?.[part] ?? {}) }; }
const ALL_CODES = [...new Set(Object.keys(MODEL).flatMap((m) => { const [tpl, part] = MODEL[m]; return Object.keys(mapFor(tpl, part)); }))].sort();

async function getPage(url, fetchImpl) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json();
    } catch { /* thử lại */ }
    await new Promise((res) => setTimeout(res, 1500 * (a + 1)));
  }
  return null;
}
/** Mọi trang (size 10.000) của một truy vấn; null nếu trang đầu lỗi. */
async function getAll(query, fetchImpl, maxPages = 4) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const j = await getPage(`${BASE}/financial_statements?q=${query}&size=10000&page=${page}&sort=fiscalDate:desc`, fetchImpl);
    if (!j) return page === 1 ? null : out;
    out.push(...(j.data ?? []));
    if (!j.totalPages || page >= j.totalPages) break;
  }
  return out;
}

/**
 * Gom dòng VNDirect thành { tpl, quarters: [{ fiscal, created, v: { tên: số } }] } (cũ -> mới).
 * Mẫu = mẫu chiếm đa số dòng (một mã chỉ thuộc một mẫu; dòng mẫu khác — nếu có — bỏ qua).
 */
export function groupFull(rows) {
  const count = {};
  for (const r of rows ?? []) { const m = MODEL[r.modelType]; if (m) count[m[0]] = (count[m[0]] ?? 0) + 1; }
  const tpl = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (!tpl) return { tpl: null, quarters: [] };
  const maps = { is: mapFor(tpl, "is"), bs: mapFor(tpl, "bs"), cf: mapFor(tpl, "cf") };
  const byQ = new Map();
  for (const r of rows) {
    const m = MODEL[r.modelType];
    if (!m || m[0] !== tpl || !r.fiscalDate) continue;
    const key = maps[m[1]][r.itemCode];
    if (!key || typeof r.numericValue !== "number" || !Number.isFinite(r.numericValue)) continue;
    const q = byQ.get(r.fiscalDate) ?? { fiscal: r.fiscalDate, created: null, v: {} };
    q.v[key] = r.numericValue;
    const c = r.createdDate?.slice(0, 10) ?? null;
    if (c && m[1] === "is" && (!q.created || c < q.created)) q.created = c; // ngày công bố theo báo cáo KQKD
    byQ.set(r.fiscalDate, q);
  }
  return { tpl, quarters: [...byQ.values()].sort((a, b) => a.fiscal.localeCompare(b.fiscal)) };
}

export function groupAnnual(rows, tpl) {
  const byY = new Map();
  for (const r of rows ?? []) {
    const m = MODEL[r.modelType]; const key = ANNUAL_ITEMS[r.itemCode];
    if (!m || (tpl && m[0] !== tpl) || !key || !r.fiscalDate || typeof r.numericValue !== "number") continue;
    if (key === "cfo" && m[1] !== "cf") continue;
    if (key !== "cfo" && m[1] !== "is") continue;
    const y = r.fiscalDate.slice(0, 4);
    const a = byY.get(y) ?? { year: Number(y), v: {} };
    a.v[key] = r.numericValue;
    byY.set(y, a);
  }
  return [...byY.values()].sort((a, b) => a.year - b.year);
}

/** BCTC đầy đủ của một mã (null nếu nguồn lỗi). */
export async function fetchTickerStatements(ticker, { fetchImpl = globalThis.fetch } = {}) {
  const t = String(ticker).toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(t)) return null;
  const rows = await getAll(`code:${t}~reportType:QUARTER~itemCode:${ALL_CODES.join(",")}`, fetchImpl);
  if (!rows) return null;
  const { tpl, quarters } = groupFull(rows);
  const annualRows = await getAll(`code:${t}~reportType:ANNUAL~itemCode:${Object.keys(ANNUAL_ITEMS).join(",")}`, fetchImpl, 1);
  return { ticker: t, tpl, quarters, annual: groupAnnual(annualRows ?? [], tpl) };
}

export const _internal = { ALL_CODES, mapFor };
