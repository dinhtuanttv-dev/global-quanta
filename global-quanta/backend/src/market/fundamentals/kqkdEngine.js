// K1–K5 (06/11/2026) — BỘ TÍNH KQKD THEO QUÝ (KQ-v1). Hàm thuần, không I/O. Đầu vào: BCTC quý đầy đủ VNDirect (statementsVnd.js).
// Nhãn MÔ TẢ: mọi chỉ số là mô tả kế toán / sàng lọc đã công bố trong tài liệu học thuật, chưa kiểm định đặt trước làm tín hiệu giao dịch.
//
// K1 Ma trận quý & lũy kế: mỗi năm Q1–Q4 (số riêng từng quý) + lũy kế 6T/9T/cả năm + so cùng kỳ LŨY KẾ (9T/2026 so 9T/2025),
//    TTM (4 quý gần nhất); đối chiếu tổng 4 quý với BCTC năm (lệch > 2% -> cờ "điều chỉnh / kiểm toán").
// K2 Phân rã lợi nhuận: thác nước theo mẫu biểu; LN CỐT LÕI tách khỏi phần ngoài cốt lõi:
//    doanh nghiệp  = lãi gộp − bán hàng − quản lý (ngoài cốt lõi = tài chính thuần + liên doanh liên kết + khác)
//    ngân hàng     = thu nhập lãi thuần + dịch vụ thuần − chi phí hoạt động − dự phòng (ngoài: ngoại hối, chứng khoán, góp vốn, khác)
//    chứng khoán   = LNTT đã thực hiện (ngoài: LNTT chưa thực hiện — đánh giá lại tài sản tài chính)
//    bảo hiểm      = LN gộp kinh doanh bảo hiểm − bán hàng − quản lý (ngoài: hoạt động tài chính & khác)
//    Đòn bẩy hoạt động DOL = %Δ LN cốt lõi TTM / %Δ doanh thu TTM (chỉ khi |%Δ DT| ≥ 2% và cả hai kỳ dương).
// K3 Chất lượng & sức khoẻ (TTM, số dư cuối kỳ; bình quân = (đầu + cuối)/2 với đầu = cùng quý năm trước):
//    Dồn tích Sloan (1996) = (LNST − CFO)/tổng tài sản bình quân · CFO/LNST
//    Piotroski F-score (2000) 9 phép thử · Beneish M-score 8 biến (1999; ngưỡng −1,78) · Altman Z″ (1995, không có hằng số; vùng 1,1 / 2,6)
//    DuPont 3 tầng · vòng quay vốn lưu động (DSO, DIO, DPO, CCC). F/M/Z chỉ áp dụng mẫu doanh nghiệp.
//    Ngân hàng: NIM ≈ TN lãi thuần TTM / tài sản sinh lãi bình quân (cho vay + liên ngân hàng + chứng khoán + tiền gửi NHNN), CIR,
//    LDR (cho vay / tiền gửi KH), chi phí tín dụng = dự phòng TTM / cho vay bình quân. Không có nợ xấu trong nguồn -> không hiển thị.
// K4 Mùa vụ & ước tính: tỷ trọng từng quý trong năm (trung vị ≤ 10 năm đủ 4 quý dương, cần ≥ 5 năm); QoQ khử mùa vụ = (Q_t/Q_{t−1})
//    chia trung vị lịch sử của cùng cặp quý; ước tính cả năm = lũy kế / tỷ trọng lũy kế trung vị, dải = P10–P90 tỷ trọng lịch sử.
//    SUE theo bước ngẫu nhiên mùa vụ (dùng lại EQ-v1) cho LNST mẹ và LN cốt lõi.
// K5 Không gian 3D/4D: bề mặt (năm × quý × LNST, màu = biên ròng) và quỹ đạo TTM (tăng trưởng DT × biên ròng × ROE theo thời gian).
import { robustGrowth, standardizedSurprise } from "./earningsQuality.js";

export const KQ_VERSION = "KQ-v1.1 (2026-11-06)"; // v1.1: ngày công bố quý cũ (ngày nhập liệu VNDirect) ẩn; gắn kết quả kiểm định KQ-r1 (bộ tính tín hiệu không đổi so v1)
export const KQ = Object.freeze({
  auditDiffRel: 0.02, nonCoreFlag: 0.5, accrualFlag: 0.1, beneishFlag: -1.78, altmanSafe: 2.6, altmanDistress: 1.1,
  seasonYears: 10, seasonMinYears: 5, dolMinGrowth: 0.02, heatQuarters: 12, seriesQuarters: 12, trajectoryQuarters: 40, surfaceYears: 20,
});
export const TEMPLATE_LABEL = Object.freeze({ corp: "Doanh nghiệp", bank: "Ngân hàng", sec: "Chứng khoán", ins: "Bảo hiểm" });

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const abs = (x) => (fin(x) ? Math.abs(x) : null);
const add = (...xs) => (xs.every(fin) ? xs.reduce((a, b) => a + b, 0) : null);
const div = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b : null);
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, p) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const r2 = (x) => (fin(x) ? Math.round(x * 100) / 100 : null);

export const qIndex = (fiscal) => Math.ceil(Number(fiscal.slice(5, 7)) / 3);
const nOf = (fiscal) => Number(fiscal.slice(0, 4)) * 4 + qIndex(fiscal) - 1;
const yOf = (n) => Math.floor(n / 4);
const qOf = (n) => (n % 4) + 1;
const labelN = (n) => `Q${qOf(n)}/${yOf(n)}`;
const fiscalOf = (n) => { const y = yOf(n), m = qOf(n) * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; };
/** Ngày công bố hiển thị: createdDate chỉ là ngày công bố khi trễ 0–120 ngày sau kết thúc quý (trước ~2019 là ngày nhập liệu hàng loạt). */
const publishedOf = (q) => { if (!q?.created) return null; const lag = (Date.parse(q.created) - Date.parse(q.fiscal)) / 864e5; return lag >= 0 && lag <= 120 ? q.created : null; };
const isQuarterEnd = (fiscal) => /^\d{4}-(03|06|09|12)-\d{2}$/.test(String(fiscal ?? ""));

/** Chỉ số dẫn xuất của một quý theo mẫu. Chi phí lấy trị tuyệt đối (VNDirect ghi dấu không thống nhất giữa mẫu). */
export function derive(tpl, v) {
  const d = { npatParent: v.npatParent ?? v.npat ?? null, npat: v.npat ?? null, pbt: v.pbt ?? null, tax: v.tax ?? null, minority: v.minority ?? null,
    eps: v.eps ?? null, cfo: v.cfo ?? null, dep: abs(v.dep), capex: v.capex ?? null };
  if (tpl === "bank") {
    d.top = v.toi ?? null;
    d.nii = v.nii ?? add(v.intInc, -abs(v.intExp));
    d.fees = v.fees ?? null; d.opex = abs(v.ga); d.provision = abs(v.provision);
    d.ppop = v.ppop ?? add(d.top, -d.opex);
    d.core = add(d.nii, d.fees ?? 0, -(d.opex ?? NaN), -(d.provision ?? 0));
  } else if (tpl === "sec") {
    d.top = v.revenue ?? null;
    d.core = fin(v.pbtRealized) && (v.pbtRealized !== 0 || v.pbtUnrealized) ? v.pbtRealized : null;
    d.fvtplNet = add(v.fvtplGain, -abs(v.fvtplLoss));
  } else if (tpl === "ins") {
    d.top = v.netPremium ?? v.revenue ?? null;
    d.gross = v.gross ?? null;
    d.core = add(d.gross, -(abs(v.selling) ?? 0), -(abs(v.ga) ?? NaN));
  } else {
    d.top = v.revenue ?? null;
    d.gross = v.gross ?? add(v.revenue, -abs(v.cogs));
    d.sga = add(abs(v.selling) ?? 0, abs(v.ga) ?? NaN);
    d.core = add(d.gross, -(d.sga ?? NaN));
    d.finNet = add(v.finInc ?? 0, -(abs(v.finExp) ?? 0));
    d.ebit = add(d.pbt, abs(v.interest) ?? 0);
  }
  d.nonCore = fin(d.core) && fin(d.pbt) ? d.pbt - d.core : null;
  d.nonCoreShare = fin(d.nonCore) && fin(d.pbt) && d.pbt > 0 ? d.nonCore / d.pbt : null;
  d.grossMargin = div(d.gross, d.top); d.coreMargin = div(d.core, d.top); d.netMargin = div(d.npatParent, d.top);
  return d;
}

/** Bước thác nước cho một kỳ (giá trị các khoản đã cộng). sum: hàm lấy tổng chỉ tiêu gốc của kỳ. */
function bridgeSteps(tpl, s) {
  const st = []; const push = (key, label, value, kind = "delta") => { if (fin(value)) st.push({ key, label, value, kind }); };
  const pbt = s("pbt"), tax = s("tax"), mino = s("minority"), parent = s("npatParent") ?? s("npat");
  if (tpl === "bank") {
    const nii = s("nii"), fees = s("fees"), fx = s("fx"), ts = s("tradingSec"), is = s("invSec"), other = s("otherNet"), eq = s("equityInc"), toi = s("toi");
    push("nii", "Thu nhập lãi thuần", nii, "start"); push("fees", "Dịch vụ thuần", fees); push("fx", "Ngoại hối", fx); push("tradingSec", "CK kinh doanh", ts);
    push("invSec", "CK đầu tư", is); push("otherNet", "Hoạt động khác", other); push("equityInc", "Góp vốn, mua cổ phần", eq);
    const known = [nii, fees, fx, ts, is, other, eq].filter(fin).reduce((a, b) => a + b, 0);
    if (fin(toi) && Math.abs(toi - known) > Math.abs(toi) * 0.005) push("residual", "Khác (chênh lệch trình bày)", toi - known);
    push("toi", "Tổng thu nhập hoạt động", toi, "total");
    push("opex", "Chi phí hoạt động", fin(s("ga")) ? -Math.abs(s("ga")) : null);
    push("ppop", "LN trước dự phòng", s("ppop") ?? add(toi, -(abs(s("ga")) ?? NaN)), "total");
    push("provision", "Dự phòng rủi ro tín dụng", fin(s("provision")) ? -Math.abs(s("provision")) : null);
  } else if (tpl === "sec") {
    push("pbtRealized", "LNTT đã thực hiện", s("pbtRealized"), "start");
    push("pbtUnrealized", "LNTT chưa thực hiện (đánh giá lại)", s("pbtUnrealized"));
  } else {
    const rev = tpl === "ins" ? (s("netPremium") ?? s("revenue")) : s("revenue");
    const gross = s("gross") ?? (tpl === "corp" ? add(rev, -(abs(s("cogs")) ?? NaN)) : null);
    if (tpl === "corp") { push("revenue", "Doanh thu thuần", rev, "start"); push("cogs", "Giá vốn", add(gross, -rev)); push("gross", "Lãi gộp", gross, "total"); }
    else push("gross", "LN gộp kinh doanh bảo hiểm", gross, "start");
    push("selling", "Chi phí bán hàng", fin(s("selling")) ? -Math.abs(s("selling")) : null);
    push("ga", "Chi phí quản lý", fin(s("ga")) ? -Math.abs(s("ga")) : null);
    const core = add(gross, -(abs(s("selling")) ?? 0), -(abs(s("ga")) ?? NaN));
    push("core", "LN cốt lõi", core, "total");
    if (tpl === "corp") {
      const finNet = add(s("finInc") ?? 0, -(abs(s("finExp")) ?? 0)), assoc = s("associates"), other = s("otherProfit");
      push("finNet", "Tài chính thuần", finNet); push("associates", "Liên doanh, liên kết", assoc); push("otherProfit", "Lợi nhuận khác", other);
      const known = [core, finNet, assoc, other].filter(fin).reduce((a, b) => a + b, 0);
      if (fin(pbt) && fin(core) && Math.abs(pbt - known) > Math.max(1e9, Math.abs(pbt) * 0.005)) push("residual", "Khác (chênh lệch trình bày)", pbt - known);
    } else if (fin(pbt) && fin(core)) push("nonCore", "Tài chính & khác", pbt - core);
  }
  push("pbt", "LN trước thuế", pbt, "total");
  push("tax", "Thuế TNDN", fin(tax) ? -tax : null);
  push("minority", "Cổ đông thiểu số", fin(mino) ? -mino : null);
  push("npatParent", "LNST cổ đông mẹ", parent, "total");
  return st;
}

/** Nhóm chỉ tiêu hiển thị theo mẫu (khoá trong derive + nhãn + có cộng dồn được không). */
export function metricsFor(tpl) {
  const base = [{ key: "top", label: tpl === "bank" ? "Tổng thu nhập hoạt động" : tpl === "ins" ? "Doanh thu phí BH thuần" : "Doanh thu thuần" }];
  const mid = tpl === "bank" ? [{ key: "nii", label: "Thu nhập lãi thuần" }, { key: "fees", label: "Dịch vụ thuần" }, { key: "ppop", label: "LN trước dự phòng" }, { key: "provision", label: "Dự phòng" }]
    : tpl === "sec" ? [{ key: "fvtplNet", label: "Lãi FVTPL thuần" }]
      : [{ key: "gross", label: tpl === "ins" ? "LN gộp bảo hiểm" : "Lãi gộp" }];
  return [...base, ...mid, { key: "core", label: tpl === "sec" ? "LNTT đã thực hiện (cốt lõi)" : "LN cốt lõi" }, { key: "pbt", label: "LN trước thuế" },
    { key: "npatParent", label: "LNST cổ đông mẹ" }, { key: "eps", label: "EPS (đ)" }, { key: "cfo", label: "Dòng tiền HĐKD" }];
}

/** Chuẩn hoá: quý hợp lệ, công bố tới today, mỗi quý một dòng. Trả Map n -> { n, fiscal, created, v, d }. */
export function prepareQuarters(tpl, quarters, today) {
  const by = new Map();
  for (const q of quarters ?? []) {
    if (!isQuarterEnd(q.fiscal) || !q.created || (today && q.created > today)) continue;
    const n = nOf(q.fiscal);
    by.set(n, { n, fiscal: q.fiscal, created: q.created, v: q.v ?? {}, d: derive(tpl, q.v ?? {}) });
  }
  return by;
}

/** Tăng trưởng có kiểm soát (EQ-v1) + số thô khi bị giới hạn [−100%; +300%] để giao diện ghi "≥ +300% (thô …)". */
const growth = (cur, prev, typical) => { const g = robustGrowth(cur, prev, typical); const o = { value: r4(g.value), status: g.status }; if (fin(g.raw) && r4(g.raw) !== o.value) o.raw = r4(g.raw); return o; };
const typicalAbs = (by, n, key) => median(Array.from({ length: 8 }, (_, k) => abs(by.get(n - 1 - k)?.d[key])).filter(fin));

/** K1 — ma trận năm × quý cho một chỉ tiêu (mới -> cũ). */
export function quarterMatrix(by, key, annual = [], { years = KQ.surfaceYears } = {}) {
  if (!by.size) return [];
  const ns = [...by.keys()]; const lastY = yOf(Math.max(...ns)), firstY = yOf(Math.min(...ns));
  const annualOf = new Map(annual.map((a) => [a.year, a.v]));
  const val = (y, q) => by.get(y * 4 + q - 1)?.d[key];
  const cum = (y, q) => { const xs = [1, 2, 3, 4].slice(0, q).map((k) => val(y, k)); return xs.every(fin) ? xs.reduce((a, b) => a + b, 0) : null; };
  const out = [];
  for (let y = lastY; y >= Math.max(firstY, lastY - years + 1); y--) {
    const q = [1, 2, 3, 4].map((k) => (fin(val(y, k)) ? val(y, k) : null));
    if (q.every((x) => x == null)) continue;
    const created = [1, 2, 3, 4].map((k) => publishedOf(by.get(y * 4 + k - 1)));
    const typ = median(q.map(abs).filter(fin));
    const yoyQ = [1, 2, 3, 4].map((k) => (fin(val(y, k)) && fin(val(y - 1, k)) ? growth(val(y, k), val(y - 1, k), typ) : null));
    const ytd = { h1: cum(y, 2), m9: cum(y, 3), fy: cum(y, 4) };
    const yoyYtd = Object.fromEntries([["h1", 2], ["m9", 3], ["fy", 4]].map(([k, qq]) => [k, fin(cum(y, qq)) && fin(cum(y - 1, qq)) ? growth(cum(y, qq), cum(y - 1, qq), typ ? typ * qq : null) : null]));
    const annualKey = key === "top" ? (annualOf.get(y)?.toi != null ? "toi" : "revenue") : key;
    const fyAudited = fin(annualOf.get(y)?.[annualKey]) ? annualOf.get(y)[annualKey] : null;
    const auditDiff = fin(fyAudited) && fin(ytd.fy) && fyAudited !== 0 ? r4((ytd.fy - fyAudited) / Math.abs(fyAudited)) : null;
    // Lũy kế tới quý mới nhất của năm (năm chưa đủ 4 quý) — so cùng kỳ lũy kế năm trước.
    const lastQ = [4, 3, 2, 1].find((k) => fin(val(y, k))) ?? null;
    const ytdNow = lastQ ? cum(y, lastQ) : null;
    const ytdPrev = lastQ ? cum(y - 1, lastQ) : null;
    out.push({ year: y, q, created, yoyQ, ytd, yoyYtd, fyAudited, auditDiff: auditDiff != null && Math.abs(auditDiff) > KQ.auditDiffRel ? auditDiff : null,
      ytdTo: lastQ, ytdNow, ytdPrev, ytdGrowth: fin(ytdNow) && fin(ytdPrev) ? growth(ytdNow, ytdPrev, typ ? typ * lastQ : null) : null });
  }
  return out;
}

/** Tỷ lệ lũy kế (vd biên gộp YTD = Σ lãi gộp / Σ doanh thu) theo năm × quý. */
export function ratioMatrix(by, numKey, denKey, { years = KQ.surfaceYears } = {}) {
  if (!by.size) return [];
  const ns = [...by.keys()]; const lastY = yOf(Math.max(...ns)), firstY = yOf(Math.min(...ns));
  const out = [];
  for (let y = lastY; y >= Math.max(firstY, lastY - years + 1); y--) {
    const qs = [1, 2, 3, 4].map((k) => by.get(y * 4 + k - 1)?.d);
    if (qs.every((x) => !x)) continue;
    const q = qs.map((d) => r4(div(d?.[numKey], d?.[denKey])));
    const cumR = (m) => { const a = qs.slice(0, m); if (!a.every((d) => d && fin(d[numKey]) && fin(d[denKey]))) return null; return r4(div(a.reduce((s, d) => s + d[numKey], 0), a.reduce((s, d) => s + d[denKey], 0))); };
    out.push({ year: y, q, ytd: { h1: cumR(2), m9: cumR(3), fy: cumR(4) } });
  }
  return out;
}

/** Tổng 4 quý liền nhau kết thúc tại n (null nếu thiếu quý). */
function ttmOf(by, n, key, src = "d") {
  let s = 0;
  for (let k = 0; k < 4; k++) { const x = by.get(n - k)?.[src]?.[key]; if (!fin(x)) return null; s += x; }
  return s;
}
const stock = (by, n, key) => (fin(by.get(n)?.v?.[key]) ? by.get(n).v[key] : null);
const avgStock = (by, n, key) => { const a = stock(by, n, key), b = stock(by, n - 4, key); return fin(a) && fin(b) ? (a + b) / 2 : a; };

/** K3 — chất lượng & sức khoẻ tại quý n (TTM). */
export function qualityAt(tpl, by, n) {
  const T = (key, m = n) => ttmOf(by, m, key);
  const TV = (key, m = n) => ttmOf(by, m, key, "v");
  const npat = T("npatParent"), cfo = T("cfo"), top = T("top");
  const assetsAvg = avgStock(by, n, "assets"), equityAvg = avgStock(by, n, "equity");
  const out = { quarter: labelN(n), npatTtm: npat, topTtm: top, cfoTtm: cfo };
  out.accrual = r4(fin(npat) && fin(cfo) ? div(npat - cfo, assetsAvg) : null);
  out.cfoToNpat = r4(fin(npat) && npat > 0 ? div(cfo, npat) : null);
  const netMargin = div(npat, top), turnover = div(top, assetsAvg), leverage = div(assetsAvg, equityAvg);
  out.dupont = { netMargin: r4(netMargin), turnover: r4(turnover), leverage: r2(leverage), roe: r4(div(npat, equityAvg)), roa: r4(div(npat, assetsAvg)) };
  out.roe = out.dupont.roe;
  if (tpl === "corp") {
    const p = n - 4;
    // Piotroski F-score (9 phép thử, TTM so cùng kỳ năm trước).
    const roa = div(npat, stock(by, n, "assets")), roaP = div(T("npatParent", p), stock(by, p, "assets"));
    const lev = div(stock(by, n, "ltDebt"), stock(by, n, "assets")), levP = div(stock(by, p, "ltDebt"), stock(by, p, "assets"));
    const cr = div(stock(by, n, "curAssets"), stock(by, n, "curLiab")), crP = div(stock(by, p, "curAssets"), stock(by, p, "curLiab"));
    const gm = div(T("gross"), top), gmP = div(T("gross", p), T("top", p));
    const at = div(top, stock(by, n, "assets")), atP = div(T("top", p), stock(by, p, "assets"));
    const capN = stock(by, n, "capital"), capP = stock(by, p, "capital");
    const test = (id, label, ok) => ({ id, label, pass: ok === null || ok === undefined ? null : Boolean(ok) });
    const both = (a, b) => fin(a) && fin(b);
    const tests = [
      test("roa", "ROA dương", fin(roa) ? roa > 0 : null),
      test("cfo", "Dòng tiền HĐKD dương", fin(cfo) ? cfo > 0 : null),
      test("droa", "ROA tăng so cùng kỳ", both(roa, roaP) ? roa > roaP : null),
      test("accrual", "CFO lớn hơn LNST", both(cfo, npat) ? cfo > npat : null),
      test("dlev", "Nợ dài hạn / tài sản giảm", both(lev, levP) ? lev <= levP : null),
      test("dcr", "Thanh toán hiện hành tăng", both(cr, crP) ? cr > crP : null),
      test("eq", "Vốn góp không tăng (kể cả cổ tức bằng cổ phiếu, ESOP)", both(capN, capP) ? capN <= capP : null),
      test("dgm", "Biên gộp tăng", both(gm, gmP) ? gm > gmP : null),
      test("dat", "Vòng quay tài sản tăng", both(at, atP) ? at > atP : null),
    ];
    const known = tests.filter((t) => t.pass !== null);
    out.piotroski = { score: known.length >= 7 ? known.filter((t) => t.pass).length : null, of: known.length, tests };
    // Beneish M-score 8 biến (TTM; khoản phải thu khách hàng, nợ = nợ ngắn hạn + vay dài hạn).
    const recv = (m) => stock(by, m, "recvCust") ?? stock(by, m, "stRecv");
    const sga = (m) => add(TV("selling", m) == null ? 0 : Math.abs(TV("selling", m)), TV("ga", m) == null ? NaN : Math.abs(TV("ga", m)));
    const depT = (m) => ttmOf(by, m, "dep");
    const aq = (m) => { const ta = stock(by, m, "assets"); const ca = stock(by, m, "curAssets"), ppe = stock(by, m, "ppe"); return fin(ta) && fin(ca) && fin(ppe) && ta ? 1 - (ca + ppe) / ta : null; };
    const lv = (m) => { const ta = stock(by, m, "assets"); const cl = stock(by, m, "curLiab"), ld = stock(by, m, "ltDebt") ?? 0; return fin(ta) && fin(cl) && ta ? (cl + ld) / ta : null; };
    const topP = T("top", p);
    const vars = {
      DSRI: div(div(recv(n), top), div(recv(p), topP)),
      GMI: div(gmP, gm),
      AQI: div(aq(n), aq(p)),
      SGI: div(top, topP),
      DEPI: (() => { const dn = depT(n), dp = depT(p), pn = stock(by, n, "ppe"), pp = stock(by, p, "ppe"); return div(div(dp, add(dp, pp)), div(dn, add(dn, pn))); })(),
      SGAI: div(div(sga(n), top), div(sga(p), topP)),
      LVGI: div(lv(n), lv(p)),
      TATA: fin(npat) && fin(cfo) ? div(npat - cfo, stock(by, n, "assets")) : null,
    };
    const okVars = Object.values(vars).every(fin) && Object.values(vars).every((x) => Math.abs(x) < 50);
    const m = okVars ? -4.84 + 0.92 * vars.DSRI + 0.528 * vars.GMI + 0.404 * vars.AQI + 0.892 * vars.SGI + 0.115 * vars.DEPI - 0.172 * vars.SGAI + 4.679 * vars.TATA - 0.327 * vars.LVGI : null;
    out.beneish = { m: r2(m), flag: fin(m) ? m > KQ.beneishFlag : null, vars: Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, r4(x)])) };
    // Altman Z″ (không hằng số): 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4.
    const ta = stock(by, n, "assets");
    const X = { X1: div(add(stock(by, n, "curAssets"), -(stock(by, n, "curLiab") ?? NaN)), ta), X2: div(stock(by, n, "retained"), ta), X3: div(T("ebit"), ta), X4: div(stock(by, n, "equity"), stock(by, n, "liabilities")) };
    const z = Object.values(X).every(fin) ? 6.56 * X.X1 + 3.26 * X.X2 + 6.72 * X.X3 + 1.05 * X.X4 : null;
    out.altman = { z: r2(z), zone: fin(z) ? (z > KQ.altmanSafe ? "SAFE" : z < KQ.altmanDistress ? "DISTRESS" : "GREY") : null, x: Object.fromEntries(Object.entries(X).map(([k, x]) => [k, r4(x)])) };
    // Vòng quay vốn lưu động (ngày).
    const cogsT = fin(top) && fin(T("gross")) ? top - T("gross") : null;
    const dso = div(recv(n), top), dio = div(stock(by, n, "inventory"), cogsT), dpo = div(stock(by, n, "payables"), cogsT);
    out.wc = { dso: r2(fin(dso) ? dso * 365 : null), dio: r2(fin(dio) ? dio * 365 : null), dpo: r2(fin(dpo) ? dpo * 365 : null) };
    out.wc.ccc = r2(fin(out.wc.dso) && fin(out.wc.dio) && fin(out.wc.dpo) ? out.wc.dso + out.wc.dio - out.wc.dpo : null);
    const debt = add(stock(by, n, "stDebt") ?? 0, stock(by, n, "ltDebt") ?? 0);
    out.kpi = { debtToEquity: r4(div(debt, stock(by, n, "equity"))), interestCover: r2(div(T("ebit"), ttmOf(by, n, "interest", "v") == null ? null : Math.abs(ttmOf(by, n, "interest", "v")))),
      netDebtToEbitda: r2(div(add(debt, -(stock(by, n, "cash") ?? 0), -(stock(by, n, "stInvest") ?? 0)), add(T("ebit"), T("dep") ?? 0))) };
  } else if (tpl === "bank") {
    const ea = (m) => add(stock(by, m, "loans"), stock(by, m, "interbank") ?? 0, stock(by, m, "invSecBs") ?? 0, stock(by, m, "tradingSecBs") ?? 0, stock(by, m, "sbv") ?? 0);
    const eaAvg = fin(ea(n)) && fin(ea(n - 4)) ? (ea(n) + ea(n - 4)) / 2 : ea(n);
    const loansAvg = avgStock(by, n, "loans");
    out.kpi = { nim: r4(div(T("nii"), eaAvg)), cir: r4(div(T("opex"), T("top"))), ldr: r4(div(stock(by, n, "loans"), stock(by, n, "deposits"))),
      creditCost: r4(div(T("provision"), loansAvg)), niiShare: r4(div(T("nii"), T("top"))),
      loanGrowth: r4(div(stock(by, n, "loans"), stock(by, n - 4, "loans")) == null ? null : div(stock(by, n, "loans"), stock(by, n - 4, "loans")) - 1),
      depositGrowth: r4(div(stock(by, n, "deposits"), stock(by, n - 4, "deposits")) == null ? null : div(stock(by, n, "deposits"), stock(by, n - 4, "deposits")) - 1) };
  } else if (tpl === "sec") {
    const pbtT = T("pbt"), unreal = ttmOf(by, n, "pbtUnrealized", "v");
    out.kpi = { marginToEquity: r4(div(stock(by, n, "marginLoans"), stock(by, n, "equity"))), brokerageShare: r4(div(ttmOf(by, n, "brokerage", "v"), top)),
      lendingShare: r4(div(ttmOf(by, n, "lending", "v"), top)), propShare: r4(div(T("fvtplNet"), top)), unrealizedShare: r4(fin(pbtT) && pbtT > 0 ? div(unreal, pbtT) : null) };
  } else if (tpl === "ins") {
    const claims = ttmOf(by, n, "claims", "v");
    out.kpi = { lossRatio: r4(div(fin(claims) ? Math.abs(claims) : null, top)), investShare: r4(fin(T("pbt")) && T("pbt") > 0 ? div(T("nonCore"), T("pbt")) : null),
      premiumGrowth: r4(div(top, T("top", n - 4)) == null ? null : div(top, T("top", n - 4)) - 1) };
  }
  return out;
}

/** K4 — mùa vụ cho một chỉ tiêu: tỷ trọng quý, QoQ khử mùa vụ quý mới nhất, ước tính cả năm. */
export function seasonality(by, key, last) {
  const ly = yOf(last), lq = qOf(last);
  const val = (y, q) => by.get(y * 4 + q - 1)?.d[key];
  const years = [];
  for (let y = ly - 1; y >= ly - KQ.seasonYears && years.length < KQ.seasonYears; y--) {
    const q = [1, 2, 3, 4].map((k) => val(y, k));
    if (q.every((x) => fin(x) && x > 0)) years.push({ year: y, q });
  }
  if (years.length < KQ.seasonMinYears) return { available: false, years: years.length, need: KQ.seasonMinYears };
  const shares = years.map(({ q }) => { const fy = q.reduce((a, b) => a + b, 0); return q.map((x) => x / fy); });
  const shareMed = [0, 1, 2, 3].map((i) => r4(median(shares.map((s) => s[i]))));
  const cumAt = (s, q) => s.slice(0, q).reduce((a, b) => a + b, 0);
  const out = { available: true, years: years.length, from: years.at(-1).year, to: years[0].year, share: shareMed,
    shareBand: [0, 1, 2, 3].map((i) => [r4(quantile(shares.map((s) => s[i]), 0.1)), r4(quantile(shares.map((s) => s[i]), 0.9))]) };
  // QoQ khử mùa vụ: tỷ số Q_t / Q_{t−1} so với trung vị lịch sử của đúng cặp quý.
  const cur = val(ly, lq), prev = by.get(last - 1)?.d[key];
  const pairs = years.map(({ year }) => { const a = val(year, lq), b = by.get(year * 4 + lq - 2)?.d[key]; return fin(a) && fin(b) && a > 0 && b > 0 ? a / b : null; }).filter(fin);
  if (fin(cur) && fin(prev) && cur > 0 && prev > 0 && pairs.length >= KQ.seasonMinYears) {
    const expected = median(pairs);
    out.qoq = { actual: r4(cur / prev - 1), expected: r4(expected - 1), deviation: r4((cur / prev) / expected - 1), pairs: pairs.length };
  }
  // Ước tính cả năm (năm chưa đủ 4 quý).
  if (lq < 4) {
    const ytdVals = [1, 2, 3].slice(0, lq).map((k) => val(ly, k));
    const ytd = ytdVals.every(fin) ? ytdVals.reduce((a, b) => a + b, 0) : null;
    const cums = shares.map((s) => cumAt(s, lq));
    const med = median(cums), lo = quantile(cums, 0.1), hi = quantile(cums, 0.9);
    const lastFy = [1, 2, 3, 4].map((k) => val(ly - 1, k));
    const lastFyV = lastFy.every(fin) ? lastFy.reduce((a, b) => a + b, 0) : null;
    if (fin(ytd) && ytd > 0 && med > 0) {
      const est = ytd / med;
      out.nowcast = { through: lq, ytd, est, lo: ytd / hi, hi: ytd / lo, cumShare: r4(med), lastFy: lastFyV,
        growth: fin(lastFyV) && lastFyV > 0 ? r4(est / lastFyV - 1) : null, method: `Lũy kế ${lq} quý / tỷ trọng lũy kế trung vị ${years.length} năm (P10–P90)` };
    }
  }
  return out;
}

const QUAL_LABEL = { SAFE: "an toàn", GREY: "vùng xám", DISTRESS: "rủi ro" };
function flagsFor(tpl, latestD, q, matrixNpat, seasonNpat) {
  const f = [];
  if (fin(latestD?.nonCoreShare) && latestD.nonCoreShare > KQ.nonCoreFlag) f.push({ id: "NON_CORE", text: latestD.nonCoreShare > 1 ? "LN cốt lõi quý âm: LNTT đến từ hoạt động ngoài cốt lõi" : `${Math.round(latestD.nonCoreShare * 100)}% LNTT quý từ ngoài cốt lõi` });
  if (fin(q?.accrual) && q.accrual > KQ.accrualFlag) f.push({ id: "HIGH_ACCRUAL", text: `Dồn tích cao (${(q.accrual * 100).toFixed(1)}% tài sản): lợi nhuận chưa thành tiền` });
  if (fin(q?.cfoToNpat) && q.cfoToNpat < 0) f.push({ id: "NEG_CFO", text: "Dòng tiền HĐKD 4 quý âm trong khi có lãi" });
  if (q?.beneish?.flag) f.push({ id: "M_FLAG", text: `Beneish M = ${q.beneish.m} > −1,78: cần soát chất lượng số liệu (sàng lọc, không phải kết luận)` });
  if (q?.altman?.zone === "DISTRESS") f.push({ id: "Z_DISTRESS", text: `Altman Z″ = ${q.altman.z} (${QUAL_LABEL.DISTRESS})` });
  const audit = matrixNpat.find((r) => r.auditDiff != null);
  if (audit && audit.year >= (matrixNpat[0]?.year ?? 0) - 2) f.push({ id: "AUDIT_DIFF", text: `Tổng 4 quý ${audit.year} lệch BCTC năm ${(audit.auditDiff * 100).toFixed(1)}%` });
  if (seasonNpat?.qoq && Math.abs(seasonNpat.qoq.deviation) > 0.3) f.push({ id: "SEASON_DEV", text: `QoQ lệch mùa vụ ${(seasonNpat.qoq.deviation * 100).toFixed(0)}%` });
  return f;
}

/** Hạn công bố BCTC quý (ước tính theo quy định: riêng lẻ +20 ngày, hợp nhất +45 ngày sau ngày kết thúc quý; không phải ngày công ty tự công bố).
 *  current = quý vừa kết thúc còn trong hạn nộp hợp nhất (null nếu đã qua) · next = quý đang chạy. */
export function filingDeadline(today) {
  const day = 864e5, t = Date.parse(`${today}T00:00:00Z`);
  const iso = (x) => new Date(x).toISOString().slice(0, 10);
  const one = (end) => {
    const d = new Date(end), st = end + 20 * day, co = end + 45 * day;
    return { quarterLabel: `Q${Math.ceil((d.getUTCMonth() + 1) / 3)}/${d.getUTCFullYear()}`, quarterEndDate: iso(end), deadlineStandalone: iso(st), deadlineConsolidated: iso(co),
      daysUntilStandalone: Math.round((st - t) / day), daysUntilConsolidated: Math.round((co - t) / day), isEstimate: true };
  };
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3; // tháng kết thúc quý trước (0 = tháng 12 năm trước)
  const prevEnd = Date.UTC(y, qm, 0), nextEnd = Date.UTC(y, qm + 3, 0);
  return { current: prevEnd + 45 * day >= t ? one(prevEnd) : null, next: one(nextEnd) };
}

/** Chi tiết đầy đủ của một mã (ngăn chi tiết). */
export function buildTickerDetail(rec, { today, fetchedAt = null } = {}) {
  const tpl = rec?.tpl ?? "corp";
  const by = prepareQuarters(tpl, rec?.quarters, today);
  if (!by.size) return { version: KQ_VERSION, ticker: rec?.ticker ?? null, tpl, available: false };
  const last = Math.max(...by.keys());
  const metrics = metricsFor(tpl);
  const matrix = Object.fromEntries(metrics.map((m) => [m.key, quarterMatrix(by, m.key, rec.annual ?? [])]));
  const ratios = { grossMargin: tpl === "corp" || tpl === "ins" ? ratioMatrix(by, "gross", "top") : [], coreMargin: ratioMatrix(by, "core", "top"), netMargin: ratioMatrix(by, "npatParent", "top") };
  // TTM theo quý.
  const ttm = [];
  for (let n = last; n >= last - KQ.trajectoryQuarters + 1; n--) {
    if (!by.has(n)) continue;
    const top = ttmOf(by, n, "top"), npat = ttmOf(by, n, "npatParent"), core = ttmOf(by, n, "core"), cfo = ttmOf(by, n, "cfo");
    if (!fin(top) && !fin(npat)) continue;
    const topP = ttmOf(by, n - 4, "top"), npatP = ttmOf(by, n - 4, "npatParent"), coreP = ttmOf(by, n - 4, "core");
    const eqAvg = avgStock(by, n, "equity");
    ttm.push({ quarter: labelN(n), fiscal: fiscalOf(n), top, npatParent: npat, core, cfo, topYoY: r4(fin(top) && fin(topP) && topP > 0 ? top / topP - 1 : null),
      npatYoY: growth(npat, npatP, abs(npatP)), coreYoY: growth(core, coreP, abs(coreP)), netMargin: r4(div(npat, top)), roe: r4(div(npat, eqAvg)) });
  }
  ttm.reverse();
  const t0 = ttm.at(-1), tP = ttm.find((x) => x.fiscal === fiscalOf(last - 4));
  const dol = t0 && tP && fin(t0.topYoY) && Math.abs(t0.topYoY) >= KQ.dolMinGrowth && fin(t0.core) && fin(tP.core) && tP.core > 0 && t0.core > 0 ? r2((t0.core / tP.core - 1) / t0.topYoY) : null;
  // Thác nước: quý mới nhất, lũy kế năm, TTM.
  const sumOver = (ns) => (key) => { let s = 0; for (const n of ns) { const x = by.get(n)?.v?.[key]; if (!fin(x)) return key === "npatParent" ? sumOver(ns)("npat") : null; s += x; } return s; };
  const ytdNs = Array.from({ length: qOf(last) }, (_, k) => last - k);
  const ttmNs = [0, 1, 2, 3].map((k) => last - k);
  const bridge = {
    quarter: { label: labelN(last), steps: bridgeSteps(tpl, sumOver([last])) },
    ytd: { label: `Lũy kế ${qOf(last) === 4 ? "cả năm" : `${qOf(last) * 3} tháng`} ${yOf(last)}`, steps: bridgeSteps(tpl, sumOver(ytdNs)) },
    ttm: ttmNs.every((n) => by.has(n)) ? { label: `4 quý tới ${labelN(last)}`, steps: bridgeSteps(tpl, sumOver(ttmNs)) } : null,
  };
  // Chất lượng: quý mới nhất + chuỗi 12 quý.
  const series = [];
  for (let n = last - KQ.seriesQuarters + 1; n <= last; n++) if (by.has(n)) {
    const q = qualityAt(tpl, by, n);
    series.push({ quarter: q.quarter, accrual: q.accrual, cfoToNpat: q.cfoToNpat, roe: q.roe, f: q.piotroski?.score ?? null, m: q.beneish?.m ?? null, z: q.altman?.z ?? null,
      kpi: q.kpi ?? null });
  }
  const quality = qualityAt(tpl, by, last);
  const season = { top: seasonality(by, "top", last), npatParent: seasonality(by, "npatParent", last), core: seasonality(by, "core", last) };
  const byKey = (key) => new Map([...by.values()].map((q) => [`${yOf(q.n)}-${qOf(q.n)}`, q.d[key]]));
  const surprise = { sueNpat: r2(standardizedSurprise(byKey("npatParent"), fiscalOf(last))), sueCore: r2(standardizedSurprise(byKey("core"), fiscalOf(last))), sur: r2(standardizedSurprise(byKey("top"), fiscalOf(last))) };
  // K5: bề mặt 3D (năm × quý × LNST mẹ, màu = biên ròng quý) và quỹ đạo TTM.
  const surfaceRows = matrix.npatParent.slice(0, KQ.surfaceYears).reverse();
  const space = {
    surface: { years: surfaceRows.map((r) => r.year), z: surfaceRows.map((r) => r.q), color: surfaceRows.map((r) => [1, 2, 3, 4].map((k) => r4(by.get(r.year * 4 + k - 1)?.d.netMargin ?? null))) },
    trajectory: ttm.filter((x) => fin(x.topYoY) && fin(x.netMargin) && fin(x.roe)).map((x) => ({ quarter: x.quarter, x: x.topYoY, y: x.netMargin, z: x.roe, npat: x.npatParent })),
  };
  const latest = by.get(last);
  return {
    version: KQ_VERSION, label: "MÔ TẢ", available: true, ticker: rec.ticker, tpl, tplLabel: TEMPLATE_LABEL[tpl] ?? tpl, asOf: today, fetchedAt,
    latest: { fiscal: latest.fiscal, quarter: labelN(last), created: latest.created },
    metrics, matrix, ratios, ttm, dol, bridge, quality, qualitySeries: series, seasonality: season, surprise, space,
    flags: flagsFor(tpl, latest.d, quality, matrix.npatParent, season.npatParent),
    method: methodNote(tpl),
  };
}

/** Kết quả kiểm định đặt trước KQ-r1 (kq-r1-report.json) -> nhãn từng chỉ số cho giao diện. */
export function evidenceFrom(rep) {
  if (!rep?.verdict) return null;
  const o = rep.oos;
  return {
    prereg: rep.prereg, ranAt: rep.ranAt,
    sueCore: { pass: rep.verdict.H1, label: rep.verdict.H1 ? "THĂM DÒ" : "MÔ TẢ", ic: o.sueCore.ic.mean, p: o.sueCore.ic.pOneSided, spread: o.sueCore.spread.mean, cohorts: o.sueCore.cohorts,
      vsNpat: { pass: rep.verdict.H2, diff: o.h2.mean, p: o.h2.pOneSided } },
    nowcast: { pass: rep.verdict.H3, label: rep.verdict.H3 ? "THĂM DÒ" : "MÔ TẢ", ic: o.nowcast.ic.mean, p: o.nowcast.ic.pOneSided, spread: o.nowcast.spread.mean, cohorts: o.nowcast.cohorts },
    accuracy: { pass: rep.verdict.H4, medianApe: o.accuracy.medianApe, medianApeNaive: o.accuracy.medianApeNaive, coverage: o.accuracy.coverage, target: [0.7, 0.9], n: o.accuracy.n },
    note: "Ngoài mẫu 2020Q1–2026Q1, lợi suất vượt 60 phiên so bình quân đều universe, sau chi phí 1%. ĐẠT = THĂM DÒ, không phải khuyến nghị.",
  };
}

export function methodNote(tpl) {
  const core = {
    corp: "LN cốt lõi = lãi gộp − chi phí bán hàng − chi phí quản lý; phần còn lại của LNTT (tài chính thuần, liên doanh liên kết, khác) là ngoài cốt lõi.",
    bank: "LN cốt lõi = thu nhập lãi thuần + dịch vụ thuần − chi phí hoạt động − dự phòng; ngoại hối, chứng khoán, góp vốn, khác là ngoài cốt lõi. Nguồn không có nợ xấu.",
    sec: "LN cốt lõi = LNTT đã thực hiện; LNTT chưa thực hiện (đánh giá lại tài sản tài chính) là ngoài cốt lõi.",
    ins: "LN cốt lõi = LN gộp kinh doanh bảo hiểm − bán hàng − quản lý; hoạt động tài chính và khác là ngoài cốt lõi.",
  }[tpl] ?? "";
  return { core, pit: "Quý chỉ dùng khi ngày công bố (createdDate VNDirect) ≤ hôm nay. VNDirect ghi đè số khi công ty điều chỉnh: quý cũ là số đã điều chỉnh.",
    label: "MÔ TẢ — chỉ số kế toán và sàng lọc học thuật (Sloan, Piotroski, Beneish, Altman, SUE); chưa kiểm định đặt trước làm tín hiệu." };
}

/** Một dòng tóm tắt cho bảng toàn thị trường. */
export function buildSummaryRow(rec, { today, mcap = null } = {}) {
  const tpl = rec?.tpl ?? "corp";
  const by = prepareQuarters(tpl, rec?.quarters, today);
  if (!by.size) return null;
  const last = Math.max(...by.keys());
  const d = by.get(last).d;
  const typ = typicalAbs(by, last, "npatParent");
  const npatPrev = by.get(last - 4)?.d.npatParent, corePrev = by.get(last - 4)?.d.core, topPrev = by.get(last - 4)?.d.top;
  const mNpat = quarterMatrix(by, "npatParent", rec.annual ?? [], { years: 3 });
  const mTop = quarterMatrix(by, "top", rec.annual ?? [], { years: 2 });
  const q = qualityAt(tpl, by, last);
  const sN = seasonality(by, "npatParent", last), sT = seasonality(by, "top", last);
  const key = (k) => new Map([...by.values()].map((x) => [`${yOf(x.n)}-${qOf(x.n)}`, x.d[k]]));
  const heat = [];
  for (let n = last - KQ.heatQuarters + 1; n <= last; n++) {
    const a = by.get(n)?.d.npatParent, b = by.get(n - 4)?.d.npatParent;
    const g = fin(a) && fin(b) ? robustGrowth(a, b, typicalAbs(by, n, "npatParent")) : null;
    heat.push(g ? [r4(g.value), g.status] : null);
  }
  const npatTtm = ttmOf(by, last, "npatParent"), npatTtmP = ttmOf(by, last - 4, "npatParent");
  const topTtm = ttmOf(by, last, "top");
  return {
    t: rec.ticker, tpl, quarter: labelN(last), fiscal: by.get(last).fiscal, created: by.get(last).created,
    top: d.top, npat: d.npatParent, core: d.core,
    npatYoY: growth(d.npatParent, npatPrev, typ), coreYoY: growth(d.core, corePrev, abs(corePrev)), topYoY: growth(d.top, topPrev, abs(topPrev)),
    ytd: mNpat[0]?.year === yOf(last) ? { to: mNpat[0].ytdTo, now: mNpat[0].ytdNow, prev: mNpat[0].ytdPrev, growth: mNpat[0].ytdGrowth } : null,
    ytdTop: mTop[0]?.year === yOf(last) ? mTop[0].ytdGrowth : null,
    ttmGrowth: growth(npatTtm, npatTtmP, abs(npatTtmP)),
    nonCoreShare: r4(d.nonCoreShare), netMarginTtm: r4(div(npatTtm, topTtm)), roe: q.roe,
    accrual: q.accrual, cfoToNpat: q.cfoToNpat, f: q.piotroski?.score ?? null, m: q.beneish?.m ?? null, mFlag: q.beneish?.flag ?? null,
    z: q.altman?.z ?? null, zZone: q.altman?.zone ?? null, kpi: q.kpi ?? null,
    sueNpat: r2(standardizedSurprise(key("npatParent"), fiscalOf(last))), sueCore: r2(standardizedSurprise(key("core"), fiscalOf(last))),
    seasonDev: sT.qoq?.deviation ?? null, seasonDevNpat: sN.qoq?.deviation ?? null,
    nowcast: sN.nowcast ? { growth: sN.nowcast.growth, est: sN.nowcast.est, lo: sN.nowcast.lo, hi: sN.nowcast.hi, cumShare: sN.nowcast.cumShare } : null,
    heat, mcap, flags: flagsFor(tpl, d, q, mNpat, sN).map((f) => f.id),
    // BL1 (07/11/2026): số 4 quý gần nhất cho Bộ lọc cổ tức (P/E, tỷ lệ chi trả, độ phủ dòng tiền) — chỉ thêm trường, không đổi công thức KQKD.
    ttm: { npat: npatTtm, top: topTtm, eps: ttmOf(by, last, "eps", "v") ?? ttmOf(by, last, "eps"), cfo: ttmOf(by, last, "cfo"), capex: ttmOf(by, last, "capex") }, equity: stock(by, last, "equity"),
  };
}

/** Bảng toàn thị trường: dòng + số tổng hợp của quý mới nhất. */
export function buildSummary(rows, { today, fetchedAt = null, failed = [] } = {}) {
  const ok = rows.filter(Boolean);
  const latestFiscal = ok.map((r) => r.fiscal).sort().at(-1) ?? null;
  for (const r of ok) r.current = r.fiscal === latestFiscal;
  const cur = ok.filter((r) => r.current);
  const share = (pred, base) => (base.length ? r4(base.filter(pred).length / base.length) : null);
  const ytdOk = cur.filter((r) => r.ytd?.growth?.status === "NORMAL");
  const heatQuarters = [];
  if (latestFiscal) { const n = nOf(latestFiscal); for (let k = n - KQ.heatQuarters + 1; k <= n; k++) heatQuarters.push(labelN(k)); }
  return {
    version: KQ_VERSION, label: "MÔ TẢ", asOf: today, fetchedAt, source: "VNDIRECT_FINFO",
    latestQuarter: latestFiscal ? labelN(nOf(latestFiscal)) : null, latestFiscal, heatQuarters,
    counts: { tickers: ok.length, reportedLatest: cur.length, failed: failed.length,
      byTemplate: Object.fromEntries(Object.keys(TEMPLATE_LABEL).map((k) => [k, ok.filter((r) => r.tpl === k).length])),
      nonCore: cur.filter((r) => r.flags.includes("NON_CORE")).length, highAccrual: cur.filter((r) => r.flags.includes("HIGH_ACCRUAL")).length,
      mFlag: cur.filter((r) => r.mFlag).length, zDistress: cur.filter((r) => r.zZone === "DISTRESS").length },
    medianYtdGrowth: r4(median(ytdOk.map((r) => r.ytd.growth.value))), shareYtdUp: share((r) => r.ytd.growth.value > 0, ytdOk),
    shareCoreUp: share((r) => r.coreYoY.value > 0, cur.filter((r) => r.coreYoY.status === "NORMAL")),
    deadline: filingDeadline(today), failed, rows: ok, method: methodNote("corp"),
  };
}

export const _internal = { nOf, labelN, fiscalOf, ttmOf, bridgeSteps };
