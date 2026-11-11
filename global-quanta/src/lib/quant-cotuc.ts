// ============================================================
// QUANT-COTUC DATA & LOGIC (v2 - da va 2 lo hong: #2 timezone, format ngay)
// Pure TypeScript - khong phu thuoc React, de unit test doc lap
// ============================================================

/** BL0 (07/11/2026): xu hướng giá THẬT theo MA50 / MA200 (Gateway scanner, priceTrendOf) — thay "technicalTrend" viết tay. */
export type PriceTrend = "UP" | "RECOVERING" | "WEAKENING" | "DOWN";
export const PRICE_TREND_LABEL: Record<PriceTrend, string> = { UP: "Tăng (giá > MA50 > MA200)", RECOVERING: "Hồi phục (giá > MA50, MA50 ≤ MA200)", WEAKENING: "Suy yếu (giá < MA50, MA50 ≥ MA200)", DOWN: "Giảm (giá < MA50 < MA200)" };
export type TradePhase =
  | "PRE_AGM" | "PREPARATION" | "ACCUMULATION"
  | "RUN_UP" | "DISCOUNT" | "EXPIRED";

export interface DividendStock {
  ticker: string; name: string; sector: string; price: number;
  pe: number; roe: number; dividendYield: number; payoutRatio: number;
  debtEquity: number; growth: number;
  fscore: number; pros: string[]; cons: string[];
  rsi: number; exDividendDate: string; paymentDate: string;
  dividendAmount: number; agmDate: string;
  /** Điểm xúc tác do AI phân tích tin (useAiAnalysis); null = chưa có — KHÔNG còn giá trị mặc định. */
  catalystScore: number | null;
  /** Xu hướng giá thật (MA50 / MA200); null = chưa đủ 200 phiên / chưa có dữ liệu. */
  priceTrend?: PriceTrend | null;
  /** BL1: tỷ lệ chi trả / tăng trưởng LNST là số thật (DS-v1, KQKD 4 quý). */
  payoutReal?: boolean; growthReal?: boolean;
  /** BL2: độ bền cổ tức / Lintner / rủi ro / bẫy lợi suất (DS-v2 Gateway). Kiểu chi tiết: DqView (lib/cotuc/dsStocks). */
  dq?: import("./cotuc/dsStocks").DqView | null;
  /** BL3: điểm nhân tố FM-v1 (thay Dividend Quality Score của Project A). */
  fm?: import("./cotuc/dsStocks").FmView | null;
  /** LNST công ty mẹ quý gần nhất so với cùng kỳ (tỷ lệ, KQKD Gateway) — cột "LNST YoY" của Bộ lọc. */
  npatYoY?: number | null;
  /** P2 (FN-v1): trạng thái từng trường số — giá trị số của trường KHÔNG "OK" là 0 chỉ để tương thích, không được hiển thị / lọc như số thật. */
  fields?: Partial<Record<FieldKey, FieldStatus>>;
  /** EPS-v2 (P1): chú thích nguồn + điều chỉnh hồi tố IAS 33 cho ô P/E. */
  epsNote?: string | null;
  /** Mã ngoài 17 mã theo dõi gốc (Universe). BL0: 17 mã gốc cũng KHÔNG còn số liệu viết tay — mọi trường số là 0 tới khi có dữ liệu thật. */
  isUniverseOnly?: boolean;
  /** P/E, ROE, Nợ/VCSH là số THẬT (VNDirect, /api/cotuc/fundamentals) — false/undefined = chưa có (đang là 0 hoặc số mẫu). */
  fundamentalsReal?: boolean;
  /** Cổ tức 12 tháng gần nhất có đợt chi lớn bất thường (≥ 2× mức thường lệ) — tỷ suất không lặp lại hằng năm. */
  specialDividend?: boolean;
  /** F3: cảnh báo tỷ suất 12 tháng bất thường (chỉ cảnh báo, không đổi số). */
  yieldAnomaly?: { reasons: string[]; fiscalYears: number[]; payments: number } | null;
}

// ============================================================
// 17 MÃ THEO DÕI GỐC — BL0 (07/11/2026): chỉ còn mã / tên / ngành. Mọi số liệu (giá, P/E, ROE, cổ tức, ngày GDKHQ / ĐHCĐ, F-Score…)
// đến từ dữ liệu thật (fundamentals, quality-score, sự kiện, giá trực tiếp); chưa có thì là 0 / rỗng và giao diện ghi "chưa có".
// Đã gỡ toàn bộ trường viết tay: ưu/nhược điểm, nội dung ĐHCĐ, cổ đông nội bộ, xúc tác vĩ mô, chỉ báo thế giới, xu hướng kỹ thuật,
// sở hữu tổ chức, quy mô vốn hoá, biên gộp, EPS, cảm xúc tin, sóng ngành.
// ============================================================
const core = (ticker: string, name: string, sector: string): DividendStock => ({
  ticker, name, sector, price: 0, pe: 0, roe: 0, dividendYield: 0, payoutRatio: 0, debtEquity: 0, growth: 0, fscore: 0,
  pros: [], cons: [], rsi: 0, exDividendDate: "", paymentDate: "", dividendAmount: 0, agmDate: "", catalystScore: null, priceTrend: null,
});
export const DIVIDEND_STOCKS: DividendStock[] = [
  core("BMP", "Nhựa Bình Minh", "Vật liệu XD"),
  core("FPT", "FPT Corporation", "Công nghệ TT"),
  core("VNM", "Vinamilk", "Thực phẩm"),
  core("DPM", "Phân bón Phú Mỹ", "Hóa chất"),
  core("DCM", "Phân bón Cà Mau", "Hóa chất"),
  core("REE", "Cơ Điện Lạnh REE", "Năng lượng"),
  core("ACB", "Ngân hàng Á Châu", "Ngân hàng"),
  core("GAS", "PetroVietnam Gas", "Dầu khí"),
  core("DHG", "Dược Hậu Giang", "Dược phẩm"),
  core("SAB", "Sabeco", "Thực phẩm"),
  core("GMD", "Gemadept", "Vận tải biển"),
  core("MWG", "Thế Giới Di Động", "Bán lẻ"),
  core("VCI", "Chứng khoán Vietcap", "Chứng khoán"),
  core("TCB", "Techcombank", "Ngân hàng"),
  core("HPG", "Hòa Phát Group", "Thép"),
  core("NLG", "Nam Long Group", "Bất động sản"),
  core("VCB", "Vietcombank", "Ngân hàng"),
];

// ============================================================
// PURE FUNCTIONS (v2 - da va lo hong #2)
// ============================================================

/**
 * VA LO HONG #2: Truoc day dung `new Date()` (local timezone cua may
 * nguoi dung) va `split("/")` khong validate -> user o mui gio khac VN
 * tinh sai so ngay, format ngay sai se tra ve Invalid Date am tham.
 * Ban va: dung UTC nhat quan (khong phu thuoc timezone trinh duyet) +
 * validate chat che truoc khi tao Date, tra ve null RO RANG khi invalid
 * thay vi de NaN am tham lan trong logic sau.
 */
export function getDaysUntil(dateStr: string, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;

  const [ddStr, mmStr, yyyyStr] = parts;
  const dd = Number(ddStr), mm = Number(mmStr), yyyy = Number(yyyyStr);

  // Validate chat: khong chi check isNaN ma con check khoang gia tri hop ly
  if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yyyy)) return null;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 2000 || yyyy > 2100) return null;

  // Dung Date.UTC() thay vi `new Date(y,m,d)` de KHONG phu thuoc timezone
  // trinh duyet cua nguoi dung - moi nguoi tren the gioi tinh ra CUNG 1 ket qua.
  const targetUTC = Date.UTC(yyyy, mm - 1, dd);
  const target = new Date(targetUTC);

  // Kiem tra ngay co that su hop le khong (vd 31/02 se bi JS "lam tron"
  // thanh 02/03 - phai bat truong hop nay ro rang thay vi tra ve sai lech)
  if (target.getUTCDate() !== dd || target.getUTCMonth() !== mm - 1 || target.getUTCFullYear() !== yyyy) {
    return null; // Ngay khong ton tai that (vd 31/02/2026)
  }

  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((targetUTC - nowUTC) / 86400000);
}

export function getTradePhase(s: DividendStock): {
  status: TradePhase; label: string; color: string; icon: string; action: string; desc: string; safety: string;
} {
  const agmDays = getDaysUntil(s.agmDate);
  if (agmDays !== null && agmDays >= 0 && agmDays <= 14)
    return { status:"PRE_AGM", label:"Trước ĐHCĐ", color:"bg-purple-950 text-purple-300 border-purple-800", icon:"📋", action:"Theo dõi ĐHCĐ", desc:"Họp ĐHCĐ sắp diễn ra — thường biến động ±5–10%.", safety:"Theo dõi sát (6/10)" };
  const gdkhqDays = getDaysUntil(s.exDividendDate);
  if (gdkhqDays === null || gdkhqDays < 0)
    return { status:"EXPIRED", label:"Đã chốt quyền", color:"bg-slate-800 text-slate-500 border-slate-700", icon:"✔", action:"Đã an bài", desc:"Cổ phiếu đã qua GDKHQ. Chờ đợt tiếp theo.", safety:"Không áp dụng" };
  if (gdkhqDays > 35)
    return { status:"PREPARATION", label:"Tích lũy sớm", color:"bg-blue-950 text-blue-400 border-blue-800", icon:"⏳", action:"Mua gom dần", desc:"Thị trường chưa chú ý nhiều. Tích lũy giá tốt.", safety:"An toàn (9/10)" };
  // BL0: xu hướng giá THẬT (MA50 / MA200) + RSI thật; thiếu một trong hai -> không gán "tăng nóng / chiết khấu".
  if (s.rsi > 0 && s.rsi >= 60 && s.priceTrend === "UP")
    return { status:"RUN_UP", label:"Tăng nóng", color:"bg-rose-950 text-rose-400 border-rose-800", icon:"🔥", action:"Tránh mua đuổi", desc:"Tăng nóng trước chốt quyền — rủi ro Sell on News.", safety:"Rủi ro cao (3/10)" };
  if (s.rsi > 0 && s.rsi <= 42 && s.priceTrend === "DOWN")
    return { status:"DISCOUNT", label:"Chiết khấu sâu", color:"bg-emerald-950 text-emerald-400 border-emerald-800", icon:"🎁", action:"Gom mua đậm", desc:"RSI quá bán sát ngày chia — cơ hội giá hời.", safety:"Cơ hội (8/10)" };
  return { status:"ACCUMULATION", label:"Tích Lũy", color:"bg-amber-950 text-amber-400 border-amber-800", icon:"💎", action:"Mua tích lũy", desc:"Nền giá ổn định RSI 43–59. Biên an toàn đủ giải ngân.", safety:"Khuyến nghị (7/10)" };
}

/** Điểm xúc tác: CHỈ khi có điểm AI (catalystScore) — điều chỉnh theo xu hướng giá thật, RSI thật, lịch GDKHQ / ĐHCĐ. null = chưa có. */
export function calcCatalystScore(s: DividendStock): number | null {
  if (s.catalystScore == null) return null;
  let sc = s.catalystScore;
  if (s.priceTrend === "UP") sc += 1.5;
  if (s.rsi >= 45 && s.rsi <= 62) sc += 1;
  const days = getDaysUntil(s.exDividendDate);
  if (days !== null && days >= 15 && days <= 35) sc += 2;
  else if (days !== null && days > 0 && days < 15) sc -= 1;
  const agmDays = getDaysUntil(s.agmDate);
  if (agmDays !== null && agmDays >= 0 && agmDays <= 14) sc += 1.5;
  return Math.min(10, Math.max(1, parseFloat(sc.toFixed(1))));
}

/** Cảnh báo rủi ro — BL0: chỉ xét trường đã có số THẬT (P/E, Nợ/VCSH: fundamentalsReal; chi trả, tăng trưởng: KQKD 4 quý thật — DS-v1; RSI > 0). */
export function riskDataReady(s: DividendStock): boolean { return s.fundamentalsReal === true || s.payoutReal === true || s.growthReal === true; }
export function detectRiskFlags(s: DividendStock): string[] {
  const flags: string[] = [];
  const fund = s.fundamentalsReal === true, qs = s.payoutReal === true || s.growthReal === true;
  if (fund && fieldStatus(s, "de") === "OK" && s.debtEquity > 0.8 && !isFinancialSector(s.sector)) flags.push("Đòn bẩy nợ cao (>0.8x)");
  const pay = fieldValue(s, "payout"), gr = fieldValue(s, "growth");
  if (qs && pay !== null && gr !== null && pay > 85 && gr < 5) flags.push("Cổ tức quá cao so tăng trưởng");
  if (qs && gr !== null && gr < 0) flags.push("Tăng trưởng lợi nhuận âm");
  if (fund && fieldStatus(s, "pe") === "OK" && s.pe > 18) flags.push("P/E cao hơn trung bình (>18x)");
  if (s.rsi > 70) flags.push("RSI quá mua (>70)");
  return flags;
}

export interface DividendFilter {
  minYield: number; minRoe: number; maxPe: number; maxDebt: number; minFscore: number;
  trend: "All" | PriceTrend; phase: "All" | TradePhase;
  upcomingGDKHQ: boolean; upcomingAGM: boolean; hideRiskFlags: boolean; searchQ: string;
  // Theo yeu cau: mac dinh AN ma chi co dot GDKHQ CU (>60 ngay, chua co
  // lich moi duoc VCI cong bo) - tranh bang chinh bi "chiem cho" boi cac
  // ma khong con thoi su. Van co the TAT filter nay de xem lai TOAN BO
  // watchlist khi can (khong mat thong tin, chi an mac dinh).
  hideStaleEvents: boolean;
  /** BL2: ẩn mã bị gắn cờ "bẫy lợi suất" (lợi suất ≥ 8% kèm giá sụp / chi trả vượt lợi nhuận / dòng tiền yếu / LNST giảm mạnh). */
  hideTraps?: boolean;
  /** BL4: ngũ phân vị FM-v1 tối thiểu (0 = tắt; 4 = Q4–Q5). Mã chưa có điểm -> thiếu dữ liệu. */
  minQuintile?: number;
  /** P2: hiện cả mã THIẾU số liệu cho tiêu chí đang bật (logic ba giá trị: "chưa biết" — có đánh dấu, không tính là đạt). */
  showUnknown?: boolean;
}

/** Ngưỡng "sắp tới" dùng chung cho thẻ KPI, nút lọc nhanh và lịch: 30 ngày. */
export const UPCOMING_WINDOW_DAYS = 30;
/** Thanh trượt P/E: tại mức này coi như KHÔNG giới hạn (P/E thật có mã > 25, VD VIC ~81). */
export const PE_NO_LIMIT = 60;
/** Nợ/VCSH: tại mức này coi như KHÔNG giới hạn. */
export const DEBT_NO_LIMIT = 99;
/** Ngành tài chính: Nợ/VCSH cao là bản chất ngành (VCB ~9,7) — không áp bộ lọc Nợ/VCSH. */
export const isFinancialSector = (sector: string) => /ng[âa]n h[àa]ng|ch[ứu]ng kho[áa]n|b[ảa]o hi[ểe]m|t[àa]i ch[íi]nh/i.test(sector);

export const DEFAULT_FILTER: DividendFilter = {
  minYield:0, minRoe:0, maxPe:PE_NO_LIMIT, maxDebt:DEBT_NO_LIMIT, minFscore:0,
  trend:"All", phase:"All", upcomingGDKHQ:false, upcomingAGM:false,
  hideRiskFlags:false, searchQ:"", hideStaleEvents:true, hideTraps:false, minQuintile:0, showUnknown:false,
};

/**
 * P2 (FN-v1, 11/11/2026) — trường số có trạng thái thay cho "điền 0":
 *  OK = số thật · MISSING = chưa có số · NA = không áp dụng (vd F-Score / Nợ/VCSH cho ngân hàng, chứng khoán, bảo hiểm)
 *  LOSS = P/E của mã đang lỗ (EPS ≤ 0) — là số thật, không phải thiếu.
 */
export type FieldKey = "yield" | "pe" | "roe" | "de" | "fscore" | "payout" | "growth";
export type FieldStatus = "OK" | "MISSING" | "NA" | "LOSS";
export const FIELD_LABEL: Record<FieldKey, string> = { yield: "Lợi suất (thiếu giá)", pe: "P/E", roe: "ROE", de: "Nợ/VCSH", fscore: "F-Score", payout: "Tỷ lệ chi trả", growth: "Tăng trưởng LNST" };

/** Trạng thái một trường. Dòng chưa có `fields` (nguồn cũ) -> suy theo cờ cũ (fundamentalsReal / payoutReal / growthReal; F-Score 0 = chưa có). */
export function fieldStatus(s: DividendStock, k: FieldKey): FieldStatus {
  const st = s.fields?.[k]; if (st) return st;
  const real = s.fundamentalsReal === true;
  switch (k) {
    case "yield": return s.price > 0 || s.dividendYield > 0 ? "OK" : "MISSING";
    case "pe": return real && s.pe > 0 ? "OK" : "MISSING";
    case "roe": return real ? "OK" : "MISSING";
    case "de": return isFinancialSector(s.sector) ? "NA" : real ? "OK" : "MISSING";
    case "fscore": return s.fscore > 0 ? "OK" : "MISSING";
    case "payout": return s.payoutReal ? "OK" : "MISSING";
    case "growth": return s.growthReal ? "OK" : "MISSING";
  }
}
/** Giá trị số của trường nếu là số thật (OK), ngược lại null. */
export function fieldValue(s: DividendStock, k: FieldKey): number | null {
  if (fieldStatus(s, k) !== "OK") return null;
  const m: Record<FieldKey, number> = { yield: s.dividendYield, pe: s.pe, roe: s.roe, de: s.debtEquity, fscore: s.fscore, payout: s.payoutRatio, growth: s.growth };
  return m[k];
}

/** Logic ba giá trị (Kleene): T đạt · F không đạt · U chưa biết (kèm trường + lý do). */
export type Tri = { v: "T" } | { v: "F" } | { v: "U"; field: FieldKey; why: "MISSING" | "NA" };
const TRI_T: Tri = { v: "T" }, TRI_F: Tri = { v: "F" };
/** So một trường với ngưỡng: số thật -> T/F; lỗ (P/E) -> F (không thể đạt "P/E ≤ X"); thiếu / không áp dụng -> U. */
export function triCheck(s: DividendStock, k: FieldKey, ok: (v: number) => boolean): Tri {
  const st = fieldStatus(s, k);
  if (st === "LOSS") return TRI_F;
  if (st !== "OK") return { v: "U", field: k, why: st === "NA" ? "NA" : "MISSING" };
  return ok(fieldValue(s, k) as number) ? TRI_T : TRI_F;
}

export type FilterVerdict = "PASS" | "FAIL" | "MISSING_DATA" | "STALE";
export type UnknownField = { field: FieldKey; why: "MISSING" | "NA" };

/**
 * Kết quả lọc MỘT mã — P2: hợp các tiêu chí theo logic ba giá trị: có tiêu chí KHÔNG ĐẠT -> FAIL; còn lại có tiêu chí CHƯA BIẾT
 * (thiếu số / không áp dụng) -> MISSING_DATA (không bao giờ coi là đạt, đếm riêng theo trường); tất cả đạt -> PASS.
 *  - Nợ/VCSH với ngành tài chính: KHÔNG ÁP DỤNG -> bỏ qua tiêu chí (như trước; đòn bẩy cao là bản chất ngành).
 *  - STALE: đợt GDKHQ gần nhất đã qua > 60 ngày, chưa có lịch mới (ẩn mặc định, bật lại được).
 */
export function filterDetail(s: DividendStock, filter: DividendFilter): { verdict: FilterVerdict; unknown: UnknownField[] } {
  const q = filter.searchQ.toLowerCase();
  const fail = { verdict: "FAIL" as FilterVerdict, unknown: [] as UnknownField[] };
  if (q && !s.ticker.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return fail;
  const tris: Tri[] = [];
  if (filter.minYield > 0) tris.push(triCheck(s, "yield", (v) => v >= filter.minYield));
  if (filter.minRoe > 0) tris.push(triCheck(s, "roe", (v) => v >= filter.minRoe));
  if (filter.maxPe < PE_NO_LIMIT) tris.push(triCheck(s, "pe", (v) => v > 0 && v <= filter.maxPe));
  if (filter.maxDebt < DEBT_NO_LIMIT && fieldStatus(s, "de") !== "NA") tris.push(triCheck(s, "de", (v) => v <= filter.maxDebt));
  if (filter.minFscore > 0) tris.push(triCheck(s, "fscore", (v) => v >= filter.minFscore));
  if (tris.some((x) => x.v === "F")) return fail;
  const other: boolean[] = [];
  if ((filter.minQuintile ?? 0) > 0 && s.fm) other.push(s.fm.quintile >= (filter.minQuintile ?? 0));
  if (filter.trend !== "All" && s.priceTrend) other.push(s.priceTrend === filter.trend);
  if (filter.phase !== "All") other.push(getTradePhase(s).status === filter.phase);
  const gdkhqDays = getDaysUntil(s.exDividendDate);
  if (filter.upcomingGDKHQ) other.push(gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= UPCOMING_WINDOW_DAYS);
  const agmDays = getDaysUntil(s.agmDate);
  if (filter.upcomingAGM) other.push(agmDays !== null && agmDays >= 0 && agmDays <= UPCOMING_WINDOW_DAYS);
  if (filter.hideRiskFlags) other.push(detectRiskFlags(s).length <= 2);
  if (filter.hideTraps) other.push(!s.dq?.trap?.length);
  if (other.includes(false)) return fail;
  const unknown: UnknownField[] = [];
  for (const x of tris) if (x.v === "U") unknown.push({ field: x.field, why: x.why });
  const extraMissing = ((filter.minQuintile ?? 0) > 0 && !s.fm) || (filter.trend !== "All" && !s.priceTrend); // chưa đủ 4/6 nhóm FM / chưa đủ 200 phiên
  if (unknown.length || extraMissing) return { verdict: "MISSING_DATA", unknown };
  // Mặc định ẩn mã chỉ có đợt GDKHQ đã qua > 60 ngày (chưa có lịch mới) — xét SAU cùng để đếm đúng số mã bị ẩn vì lý do này.
  if (filter.hideStaleEvents && gdkhqDays !== null && gdkhqDays < -60) return { verdict: "STALE", unknown: [] };
  return { verdict: "PASS", unknown: [] };
}
export const filterVerdict = (s: DividendStock, filter: DividendFilter): FilterVerdict => filterDetail(s, filter).verdict;

export interface FilterStats { pass: number; fail: number; missingData: number; stale: number; missingBy: Partial<Record<FieldKey, number>>; naBy: Partial<Record<FieldKey, number>>; otherMissing: number }
/** Đếm số mã bị ẩn theo từng lý do (để giao diện ghi rõ thay vì ẩn lặng lẽ); P2: thiếu số liệu tách theo trường + "không áp dụng". */
export function explainFilter(stocks: DividendStock[], filter: DividendFilter): FilterStats {
  const out: FilterStats = { pass: 0, fail: 0, missingData: 0, stale: 0, missingBy: {}, naBy: {}, otherMissing: 0 };
  for (const s of stocks) {
    const d = filterDetail(s, filter), v = d.verdict;
    if (v === "PASS") out.pass++; else if (v === "FAIL") out.fail++; else if (v === "STALE") out.stale++;
    else {
      out.missingData++;
      if (!d.unknown.length) out.otherMissing++;
      for (const u of d.unknown) { const m = u.why === "NA" ? out.naBy : out.missingBy; m[u.field] = (m[u.field] ?? 0) + 1; }
    }
  }
  return out;
}
/** Câu giải thích "thiếu số liệu" theo trường, vd "ROE 3 · F-Score không áp dụng 26 · khác 2". */
export function missingSummary(st: FilterStats): string {
  const parts: string[] = [];
  for (const [k, n] of Object.entries(st.missingBy)) parts.push(`${FIELD_LABEL[k as FieldKey]} ${n}`);
  for (const [k, n] of Object.entries(st.naBy)) parts.push(`${FIELD_LABEL[k as FieldKey]} không áp dụng ${n}`);
  if (st.otherMissing) parts.push(`hạng NT / xu hướng chưa đủ dữ liệu ${st.otherMissing}`);
  return parts.join(" · ");
}

/** BL4: điều kiện đang bật và số mã mà RIÊNG điều kiện đó đang loại (đặt về mặc định, giữ các điều kiện khác) — đếm ngay khi chỉnh. */
export type FilterKey = Exclude<keyof DividendFilter, "searchQ">;
export function activeFilterKeys(filter: DividendFilter): FilterKey[] {
  return (Object.keys(DEFAULT_FILTER) as (keyof DividendFilter)[])
    .filter((k): k is FilterKey => k !== "searchQ" && filter[k] !== undefined && filter[k] !== DEFAULT_FILTER[k]);
}
export const countPass = (stocks: DividendStock[], filter: DividendFilter): number =>
  stocks.reduce((n, s) => n + (filterVerdict(s, filter) === "PASS" ? 1 : 0), 0);
export function marginalCounts(stocks: DividendStock[], filter: DividendFilter): Partial<Record<FilterKey, number>> {
  const base = countPass(stocks, filter);
  const out: Partial<Record<FilterKey, number>> = {};
  for (const k of activeFilterKeys(filter)) out[k] = countPass(stocks, { ...filter, [k]: DEFAULT_FILTER[k] } as DividendFilter) - base;
  return out;
}

const SORT_FIELD: Record<string, FieldKey> = { dividendYield: "yield", pe: "pe", roe: "roe", debtEquity: "de", fscore: "fscore", payoutRatio: "payout", growth: "growth" };
export function filterAndSortStocks(
  stocks: DividendStock[], filter: DividendFilter,
  sortField: keyof DividendStock | "score" | "catalyst",
  sortAsc: boolean,
  realRsMap?: Record<string, number | null>
): DividendStock[] {
  return stocks
    .filter((s) => { const v = filterVerdict(s, filter); return v === "PASS" || (filter.showUnknown === true && v === "MISSING_DATA"); })
    .sort((a, b) => {
      // P2: trường chưa có số thật (thiếu / không áp dụng / lỗ) luôn xếp CUỐI, bất kể chiều sắp xếp.
      const fk = SORT_FIELD[sortField as string];
      if (fk) {
        const xa = fieldValue(a, fk), xb = fieldValue(b, fk);
        if (xa === null || xb === null) return xa === null && xb === null ? 0 : xa === null ? 1 : -1;
        return sortAsc ? xa - xb : xb - xa;
      }
      let va: number, vb: number;
      if (sortField === "score") { va = a.fm?.pct ?? -1; vb = b.fm?.pct ?? -1; } // BL3: thứ hạng FM-v1
      else if (sortField === "catalyst") { va = calcCatalystScore(a) ?? -1; vb = calcCatalystScore(b) ?? -1; }
      else {
        const rawA = a[sortField as keyof DividendStock];
        const rawB = b[sortField as keyof DividendStock];
        va = typeof rawA === "number" ? rawA : 0;
        vb = typeof rawB === "number" ? rawB : 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
}

export function fmtVND(v: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);
}
export const fmtPct = (v: number): string => v.toFixed(1) + "%";

// ============================================================================
// TIMING ENGINE v3 (Giai doan 1 - tich hop tu goi cotuc-timing-engine.zip,
// file goc: core/quant-cotuc.ts) - CAC HAM MOI, KHONG TRUNG TEN VOI PHAN
// TREN (da xac nhan qua ra soat: getDaysUntil/getTradePhase/calcDividendScore/
// calcRealDividendQualityScore/calcCatalystScore/detectRiskFlags/calcDCF/
// filterAndSortStocks/fmtVND/fmtPct O TREN GIU NGUYEN 100%, KHONG DUNG DEN).
//
// Khac voi "getDaysUntil" o tren (dung Date.UTC, KHONG dung timezone VN),
// cac ham duoi day dung "toDayNumber"/"Clock" voi Asia/Ho_Chi_Minh (sua loi
// E7 trong docs-v3-design.md) - CHUNG SONG SONG, KHONG thay the lan nhau (2
// muc dich khac nhau: getDaysUntil cho UI hien tai (17 ma mau + Universe),
// cac ham moi cho Timing Engine v3 rieng).
// ============================================================================
import type {
  CycleStatsV3,
  BacktestWindow,
  EarningsSignal,
  AnnounceMethod,
  DataStatus,
  Sourced,
  ISODate as ISODateT,
} from "./cotuc/timing-types";

// Re-export de dung tien: import { DataStatus, Sourced } from './quant-cotuc'
// van chay duoc; nguon dinh nghia that nam o src/lib/cotuc/timing-types.ts.
export type { DataStatus, Sourced };
export type ISODate = ISODateT;

// ---------------------------------------------------------------------------
// 6.1. Ngay, lich, dong ho
// ---------------------------------------------------------------------------

export interface Clock {
  today(): ISODate;
}

export const systemClock: Clock = {
  today: () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()),
};

export interface HolidayCalendar {
  isTradingDay(dayNumber: number): boolean;
}

/** Lich chi loai thu Bay/Chu Nhat - dung khi chua nap lich nghi le that. KHONG dung cho san xuat. */
export const WEEKEND_ONLY_CALENDAR: HolidayCalendar = {
  isTradingDay(dayNumber) {
    const dow = new Date(dayNumber * 86_400_000).getUTCDay(); // 0=CN,6=T7
    return dow !== 0 && dow !== 6;
  },
};

/** Lich tu danh sach ngay nghi tuong minh (YYYY-MM-DD), cong voi loai thu Bay/Chu Nhat. */
export function makeHolidayCalendar(holidays: readonly ISODate[]): HolidayCalendar {
  const set = new Set<number>();
  for (const h of holidays) {
    const d = toDayNumber(h);
    if (d !== null) set.add(d);
  }
  return {
    isTradingDay(dayNumber) {
      return WEEKEND_ONLY_CALENDAR.isTradingDay(dayNumber) && !set.has(dayNumber);
    },
  };
}

const MAX_SPAN_CALENDAR_DAYS = 400;

/** Parse nghiem ngat 'YYYY-MM-DD'; null neu sai dinh dang hoac ngay khong ton tai (31/02, 29/02 nam khong nhuan). */
export function toDayNumber(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t / 86_400_000;
}

export function dayNumberToIso(dayNumber: number): ISODate {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

/**
 * So ngay giao dich tu `from` den `to`. Duong: `to` sau `from`. 0: cung ngay.
 * null: ngay sai dinh dang, hoac khoang cach lich vuot qua MAX_SPAN_CALENDAR_DAYS (du lieu kha nghi).
 */
export function tradingDaysBetween(from: string, to: string | null | undefined, cal: HolidayCalendar): number | null {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  if (a === null || b === null) return null;
  if (Math.abs(b - a) > MAX_SPAN_CALENDAR_DAYS) return null;
  if (a === b) return 0;
  const step = b > a ? 1 : -1;
  let n = 0;
  for (let d = a + step; step > 0 ? d <= b : d >= b; d += step) {
    if (cal.isTradingDay(d)) n += step;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 6.2. Cau hinh
// ---------------------------------------------------------------------------

export interface EngineConfig {
  conflictWindowTd: number;
  minEventsForHigh: number;
  minEventsForMedium: number;
  staleAfterHours: number;
  horizonTd: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  conflictWindowTd: 3,
  minEventsForHigh: 12,
  minEventsForMedium: 8,
  staleAfterHours: 36,
  horizonTd: 30,
};

export interface Deps {
  clock: Clock;
  cal: HolidayCalendar;
  cfg: EngineConfig;
}

export function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return { clock: systemClock, cal: WEEKEND_ONLY_CALENDAR, cfg: DEFAULT_CONFIG, ...overrides };
}

const downgrade = (c: Confidence): Confidence => (c === "HIGH" ? "MEDIUM" : "LOW");

// ---------------------------------------------------------------------------
// 4.4. Kieu dau ra
// ---------------------------------------------------------------------------

export type TimingAction = "NO_DATE" | "POST_EX" | "NO_SIGNAL" | "TOO_EARLY" | "IN_WINDOW" | "WINDOW_PASSED";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type EarningsStance = "AVOID" | "REDUCE_SIZE" | "NEUTRAL" | "FAVORABLE" | "UNKNOWN";
export type ConflictKind = "NONE" | "NEAR_EX" | "INSIDE_HOLD";

export interface EarningsImpact {
  expectedAnnounce: ISODate | null;
  announceMethod: AnnounceMethod | null;
  tdToEarnings: number | null;
  conflict: ConflictKind;
  scoreDelta: number | null;
  stance: EarningsStance;
  reasons: string[];
}

export interface Explanation {
  factor: string;
  detail: string;
  effect: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
}

export interface TimingRecommendation {
  action: TimingAction;
  tdToEx: number | null;
  tdToAgm: number | null;
  tdToPayment: number | null;
  window: Pick<BacktestWindow, "id" | "label" | "entryFrom" | "entryTo" | "exitOffset" | "holdsThroughEx"> | null;
  expectedNetReturn: number | null;
  nEvents: number | null;
  confidence: Confidence | null;
  dateStatus: DataStatus | null;
  earningsImpact: EarningsImpact;
  explanations: Explanation[];
  disclaimer: "NOT_INVESTMENT_ADVICE";
}

// ---------------------------------------------------------------------------
// 7.5. resolveEarningsImpact
// ---------------------------------------------------------------------------

export interface EarningsImpactInput {
  earnings: EarningsSignal | null;
  tdToEx: number | null;
  window: { entryTo: number; exitOffset: number } | null;
  today: ISODate;
}

const UNKNOWN_IMPACT: EarningsImpact = {
  expectedAnnounce: null,
  announceMethod: null,
  tdToEarnings: null,
  conflict: "NONE",
  scoreDelta: null,
  stance: "UNKNOWN",
  reasons: [],
};

export function resolveEarningsImpact(input: EarningsImpactInput, deps: Deps): EarningsImpact {
  const { cal, cfg } = deps;
  const { earnings, tdToEx, window, today } = input;
  if (!earnings) return UNKNOWN_IMPACT;

  const ann = earnings.expectedAnnounce;
  const tdToEarn = tradingDaysBetween(today, ann.date, cal);
  if (tdToEarn === null || tdToEarn < 0) {
    return { ...UNKNOWN_IMPACT, expectedAnnounce: ann.date, announceMethod: ann.method };
  }

  const width = cfg.conflictWindowTd + Math.round((ann.lagStdDays ?? 0) / 2);
  const reasons: string[] = [];
  let conflict: ConflictKind = "NONE";

  if (tdToEx !== null) {
    const gap = Math.abs(tdToEx - tdToEarn); // quy uoc v3 (chot loi E2 cua v2)
    if (gap <= width) {
      conflict = "NEAR_EX";
      reasons.push(`KQKD dự kiến cách GDKHQ ${gap} ngày giao dịch (ngưỡng ${width})`);
    } else if (window && window.exitOffset >= window.entryTo) {
      const earnOffset = tdToEarn - tdToEx;
      if (earnOffset >= window.entryTo && earnOffset <= window.exitOffset) {
        conflict = "INSIDE_HOLD";
        reasons.push("KQKD dự kiến rơi vào thời gian nắm giữ");
      }
    }
  }

  let scoreDelta: number | null = null;
  if (earnings.sue !== null && earnings.quality === "OK") {
    scoreDelta = Math.max(-2, Math.min(2, earnings.sue / 2));
  }

  let stance: EarningsStance = "NEUTRAL";
  if (conflict === "NEAR_EX") stance = "AVOID";
  else if (conflict === "INSIDE_HOLD") stance = "REDUCE_SIZE";
  else if (scoreDelta !== null && scoreDelta >= 1 && tdToEarn <= 7) stance = "FAVORABLE";
  else if (scoreDelta === null) stance = "UNKNOWN";

  if (ann.method === "DEADLINE_ONLY") reasons.push("Ngày công bố chỉ ước theo hạn pháp lý");

  return {
    expectedAnnounce: ann.date,
    announceMethod: ann.method,
    tdToEarnings: tdToEarn,
    conflict,
    scoreDelta,
    stance,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// 6.3. optimizeDividendTiming
// ---------------------------------------------------------------------------

export interface TimingInput {
  exDate: Sourced<ISODate> | null;
  agmDate: Sourced<ISODate> | null;
  paymentDate: Sourced<ISODate> | null;
  cycle: CycleStatsV3 | null;
  earnings: EarningsSignal | null;
}

/** Cua so da chot: khop selectedWindowId VA co co selected (da qua cong thong ke muc 5.6). */
export function selectedWindow(stats: CycleStatsV3 | null): BacktestWindow | null {
  if (!stats || stats.selectedWindowId === null) return null;
  const w = stats.windows.find((x) => x.id === stats.selectedWindowId);
  return w && w.selected ? w : null;
}

export function optimizeDividendTiming(input: TimingInput, deps: Deps): TimingRecommendation {
  const { clock, cal, cfg } = deps;
  const today = clock.today();
  const explanations: Explanation[] = [];

  const tdToEx = tradingDaysBetween(today, input.exDate?.value, cal);
  const tdToAgm = tradingDaysBetween(today, input.agmDate?.value, cal);
  const tdToPayment = tradingDaysBetween(today, input.paymentDate?.value, cal);
  const k = tdToEx === null ? null : -tdToEx; // quy uoc dau 2.2: k<0 truoc GDKHQ

  const win = selectedWindow(input.cycle);
  const earningsImpact = resolveEarningsImpact(
    { earnings: input.earnings, tdToEx, window: win, today },
    deps,
  );

  const base = {
    tdToEx,
    tdToAgm,
    tdToPayment,
    earningsImpact,
    explanations,
    disclaimer: "NOT_INVESTMENT_ADVICE" as const,
    dateStatus: input.exDate?.status ?? null,
  };
  const empty = { window: null, expectedNetReturn: null, nEvents: null, confidence: null };

  if (tdToEx === null) return { action: "NO_DATE", ...empty, ...base };
  // Cửa sổ SAU GDKHQ (W4 +3..+6, W5 +20..+35): đợt vừa qua vẫn còn hiệu lực tới điểm thoát — không coi là POST_EX.
  // GIỐNG Project A lib/cotuc/timing-v3/decision/optimize-dividend-timing.ts (sửa một nơi phải sửa cả hai).
  const postExWindowLive = win !== null && win.entryFrom > 0 && k! <= win.exitOffset;
  if (tdToEx < 0 && !postExWindowLive) return { action: "POST_EX", ...empty, ...base };
  if (!win) {
    explanations.push({ factor: "Backtest", detail: "Không có cửa sổ vượt cổng thống kê (mục 5.6)", effect: "NEUTRAL" });
    return { action: "NO_SIGNAL", ...empty, ...base };
  }

  let action: TimingAction;
  if (k! < win.entryFrom) action = "TOO_EARLY";
  else if (k! <= win.entryTo) action = "IN_WINDOW";
  else action = "WINDOW_PASSED";

  let confidence: Confidence =
    win.nEvents >= cfg.minEventsForHigh && (win.oosMeanNet ?? -1) > 0
      ? "HIGH"
      : win.nEvents >= cfg.minEventsForMedium
        ? "MEDIUM"
        : "LOW";
  explanations.push({
    factor: "Backtest",
    detail: `${win.nEvents} sự kiện, kỳ vọng ròng cận dưới ${(win.netExpectancyLcb * 100).toFixed(2)}%, q=${win.fdrQValue.toFixed(2)}`,
    effect: "POSITIVE",
  });

  if (input.exDate?.status !== "CONFIRMED") {
    confidence = downgrade(confidence);
    explanations.push({
      factor: "Ngày GDKHQ",
      detail: `Trạng thái ${input.exDate?.status ?? "UNKNOWN"}, có thể thay đổi`,
      effect: "NEGATIVE",
    });
  }
  if (earningsImpact.conflict !== "NONE") {
    confidence = downgrade(confidence);
    explanations.push({ factor: "Xung đột KQKD", detail: earningsImpact.reasons.join("; "), effect: "NEGATIVE" });
  }

  return {
    action,
    window: {
      id: win.id,
      label: win.label,
      entryFrom: win.entryFrom,
      entryTo: win.entryTo,
      exitOffset: win.exitOffset,
      holdsThroughEx: win.holdsThroughEx,
    },
    expectedNetReturn: win.netExpectancyLcb,
    nEvents: win.nEvents,
    confidence,
    ...base,
  };
}

// ---------------------------------------------------------------------------
// 8. Chu ky co tuc va du bao dot tiep theo
// ---------------------------------------------------------------------------

export interface DividendFrequency {
  medianMonths: number;
  cv: number;
  n: number;
  regularity: "REGULAR" | "IRREGULAR";
  confidence: number;
  nextExpected: ISODate | null;
}

export function estimateDividendFrequency(exDates: ISODate[]): DividendFrequency | null {
  const days = exDates
    .map(toDayNumber)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  if (days.length < 3) return null;

  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  const cv = mean > 0 ? sd / mean : Infinity;

  const confidence = Math.max(0, Math.min(1, 1 - cv)) * Math.min(1, gaps.length / 6);
  const last = days[days.length - 1];
  const nextExpected = dayNumberToIso(last + Math.round(median));

  return {
    medianMonths: median / 30.44,
    cv,
    n: gaps.length,
    regularity: cv <= 0.25 ? "REGULAR" : "IRREGULAR",
    confidence,
    nextExpected,
  };
}

// (9. Phát hiện sự kiện sắp tới: đã chuyển sang Lịch sự kiện trên Gateway — LSK1, 07/11/2026)

