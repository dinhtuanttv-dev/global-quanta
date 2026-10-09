// SEPA — quy trình lọc [s.47–48] (chuyển 1:1 từ sepa_screener/screener.py), point-in-time:
//   1. Hình mẫu xu hướng — cổng đầu tiên; 2. cơ bản, RS, mô hình giá; 3. hồ sơ cổ phiếu dẫn dắt; 4. bằng chứng cho đánh giá thủ
//   công. Đồng thời chạy CÁC BỘ LỌC TÁCH BIỆT và ghi nhận mã xuất hiện ở nhiều bộ lọc [s.52].
//   Danh sách theo dõi: THEO DÕI -> CẢNH BÁO MUA -> SẴN SÀNG MUA (+ LOẠI) [s.281–282].

import { SEPA } from "./config.js";
import { analyzeFundamentals } from "./fundamentals.js";
import { bestPattern } from "./patterns/common.js";
import { npMean, prepareSepa, pyRound, rsRatings, rsRawScore } from "./indicators.js";
import { leadershipProfile, marketHealth } from "./leadership.js";
import { scanAllBases } from "./patterns/bases.js";
import { postBreakoutMonitor } from "./patterns/monitor.js";
import { scanVcp } from "./patterns/vcp.js";
import { planTrade } from "./risk.js";
import { classifyStage, trendTemplate } from "./trend.js";

export const BUCKETS = Object.freeze(["SẴN SÀNG MUA", "CẢNH BÁO MUA", "THEO DÕI", "LOẠI"]);
export const BUCKET_ORDER = Object.freeze({ "SẴN SÀNG MUA": 0, "CẢNH BÁO MUA": 1, "THEO DÕI": 2, "LOẠI": 3 });

/**
 * Phân tích một mã tại phiên t.
 * opts: { rs, indexByDate (Map ngày -> đóng cửa chỉ số), fund (q của analyzeFundamentals | null), listingDate, equity, hardMarket, cfg }
 */
export function analyzeSymbol(sym, S, t, { rs = null, indexByDate = null, fund = null, listingDate = null, equity = 1e9, hardMarket = false, cfg = SEPA, fundCfg } = {}) {
  const tt = trendTemplate(S, t, rs, cfg.trend);
  const st = classifyStage(S, t, cfg.stage);
  const lead = leadershipProfile(S, t, indexByDate, cfg.lead);
  const fr = analyzeFundamentals(fund, fundCfg);
  const pats = [scanVcp(S, t, cfg.vcp), ...scanAllBases(S, t, { cfg, listingDate })];
  const best = bestPattern(pats);
  let plan = null;
  if (best && best.pivot) {
    const entry = best.status === "FORMING" || best.status === "NEAR_PIVOT" ? best.pivot * 1.001 : S.C[t];
    plan = planTrade(entry, best.stopRef, equity, cfg.risk, hardMarket);
  }
  // ---- điểm SEPA tổng hợp ----
  const sTrend = tt.passed ? (25 * tt.score) / 8 : (10 * tt.score) / 8;
  const sFund = (25 * fr.score) / 100;
  const sRs = 15 * ((rs || 0) / 99);
  const sPat = best ? 25 * (best.score / 100) : 0;
  const sLead = (10 * (lead.diem_dan_dat ?? 0)) / 100;
  const warns = [...st.warnings, ...fr.warnings];
  if (plan && plan.stopTooWide) warns.push("Stop cần > 10%");
  const isNew = best != null && best.name.startsWith("Nền giá đầu tiên");
  const ttOk = tt.passed || isNew || (best != null && best.name.startsWith("Tấn công"));
  // 3-C / low cheat / cốc–tay cầm hình thành TRONG nhịp điều chỉnh: MA ngắn có thể tạm vi phạm. Cho phép "nới lỏng" (tối đa
  // CẢNH BÁO MUA) nếu vẫn GĐ2/3, trên MA150/200, TT ≥ 6/8 và RS đạt.
  const relaxed = !ttOk && best != null && ["3-C", "Low cheat", "Cốc–tay cầm"].includes(best.name) && (st.stage === 2 || st.stage === 3)
    && tt.score >= 6 && Boolean(tt.criteria.TC1_gia_tren_MA150_MA200) && Boolean(tt.criteria["TC8_RS_rating_>=70"]);
  if (relaxed) warns.push("Trend Template nới lỏng cho mô hình hình thành trong nhịp điều chỉnh");
  const weakBo = best != null && best.status === "BREAKOUT" && !best.breakout.KL_pha_vo_dat;
  if (weakBo) warns.push("Phá vỡ pivot nhưng KL chưa tăng đáng kể [s.270]");
  let monitor = null;
  if (best && best.breakout?.ngay_pha_vo != null) {
    monitor = postBreakoutMonitor(S, t, best.breakout.ngay_pha_vo, best.pivot, plan ? plan.stop : null);
    warns.push(...(monitor.canh_bao ?? []));
  }
  const total = sTrend + sFund + sRs + sPat + sLead - 3 * warns.length;
  let bucket;
  if (ttOk && best && (best.status === "NEAR_PIVOT" || best.status === "BREAKOUT") && !(plan && plan.stopTooWide) && !weakBo) bucket = "SẴN SÀNG MUA";
  else if ((ttOk || relaxed) && best && ["FORMING", "SQUAT", "NEAR_PIVOT", "BREAKOUT"].includes(best.status)) bucket = "CẢNH BÁO MUA";
  else if (ttOk) bucket = "THEO DÕI";
  else bucket = "LOẠI";
  const screens = {
    loc_xu_huong: tt.passed,
    loc_co_ban: fr.passedMin && fr.score >= 50,
    loc_mo_hinh: best != null,
    loc_dan_dat: (lead.diem_dan_dat ?? 0) >= 50,
    loc_RS: (rs || 0) >= cfg.trend.prefRsRating,
  };
  return {
    ma: sym, danhSach: bucket, diemSepa: pyRound(Math.min(100, Math.max(0, total)), 1),
    soBoLocDat: Object.values(screens).filter(Boolean).length, boLoc: screens,
    trend: tt, stage: st, lead, fund: fr, patterns: pats, best, plan, warnings: warns, monitor, rs,
    components: { trend: sTrend, fund: sFund, rs: sRs, pattern: sPat, lead: sLead, penalty: -3 * warns.length },
  };
}

/**
 * RS Rating cho cả vũ trụ tại cùng một ngày (phân vị, xấp xỉ IBD). Vũ trụ < 30 mã + có chỉ số: ước lượng theo hiệu suất vượt chỉ
 * số (như bản Python). items: [{ sym, S, t }]; indexS/indexT: chuỗi chỉ số và phiên cùng ngày.
 */
export function universeRs(items, { indexS = null, indexT = null, cfg = SEPA } = {}) {
  const P = cfg.lead.rsPeriods, W = cfg.lead.rsWeights;
  if (items.length < 30 && indexS && indexT != null) {
    const ix = rsRawScore(indexS.C, indexT, P, W);
    // Khác bản Python (có chủ ý): mã chưa đủ 64 phiên có RS thô NaN -> bản Python cho điểm SEPA NaN và summary_table ném lỗi;
    // ở đây RS = null ("chưa có RS"), điểm RS = 0.
    const est = (S, t) => { const v = 50 + 150 * (rsRawScore(S.C, t, P, W) - ix); return Number.isNaN(v) ? null : Math.min(99, Math.max(1, v)); };
    return { rs: Object.fromEntries(items.map(({ sym, S, t }) => [sym, est(S, t)])), note: "Vũ trụ < 30 mã: RS ước lượng theo hiệu suất vượt chỉ số (kém tin cậy hơn)" };
  }
  return { rs: rsRatings(Object.fromEntries(items.map(({ sym, S, t }) => [sym, rsRawScore(S.C, t, P, W)]))), note: "RS Rating = phân vị trong vũ trụ (xấp xỉ IBD)" };
}

/**
 * run_screen() của bản Python trên dữ liệu đã chuẩn bị, tại ngày chung `asOf` (mặc định phiên cuối của chỉ số).
 * prices: Map sym -> bars; index: bars chỉ số; fundamentals: Map sym -> q (lõi) | (sym, date) => q; meta: Map sym -> { listingDate }.
 * eligible(sym, S, t) -> bool: cổng thanh khoản (mặc định GTGD TB 20 phiên ≥ cfg.minAvgValue theo đơn vị giá).
 */
export function runSepaScreen({ prices, index = null, fundamentals = null, meta = null, cfg = SEPA, fundCfg, equity = 1e9, eligible = null, minAvgValue = 0, priceUnit = 1, asOf = null }) {
  const items = [];
  for (const [sym, bars] of prices) {
    const S = bars.S ?? prepareSepa(bars);
    let t = S.n - 1;
    if (asOf) { while (t >= 0 && S.date[t] > asOf) t--; if (t < 0) continue; }
    items.push({ sym, S, t });
  }
  const IS = index ? (index.S ?? prepareSepa(index)) : null;
  let ti = IS ? IS.n - 1 : null;
  if (IS && asOf) { while (ti >= 0 && IS.date[ti] > asOf) ti--; }
  const indexByDate = IS ? new Map(IS.date.map((d, i) => [d, IS.C[i]])) : null;
  const liq = (S, t) => { const a = Math.max(0, t + 1 - 20), v = []; for (let i = a; i <= t; i++) v.push(S.C[i] * S.V[i]); return npMean(v) * priceUnit; };
  const universe = items.filter(({ sym, S, t }) => (eligible ? eligible(sym, S, t) : liq(S, t) >= minAvgValue));
  const { rs, note } = universeRs(items, { indexS: IS, indexT: ti, cfg });
  const mh = IS && ti + 1 > 60 ? marketHealth(IS, ti, universe) : {};
  const hard = mh.danh_gia === "THẬN TRỌNG" || mh.danh_gia === "BẤT LỢI";
  const results = {}, errors = [];
  let ttPass = 0;
  for (const { sym, S, t } of universe) {
    try {
      const fund = typeof fundamentals === "function" ? fundamentals(sym, S.date[t]) : fundamentals?.get(sym) ?? null;
      const r = analyzeSymbol(sym, S, t, { rs: rs[sym] ?? null, indexByDate, fund, listingDate: meta?.get(sym)?.listingDate ?? null, equity, hardMarket: hard, cfg, fundCfg });
      results[sym] = r;
      ttPass += r.trend.passed ? 1 : 0;
    } catch (e) { errors.push({ ticker: sym, message: e instanceof Error ? e.message : String(e) }); }
  }
  mh.ghi_chu_RS = note;
  if (universe.length) mh.ty_le_dat_trend_template = ttPass / universe.length;
  const order = Object.values(results).sort((a, b) => BUCKET_ORDER[a.danhSach] - BUCKET_ORDER[b.danhSach] || b.diemSepa - a.diemSepa);
  const points = new Map(items.map((x) => [x.sym, { S: x.S, t: x.t }]));
  return { results, order: order.map((r) => r.ma), market: mh, hardMarket: hard, rs, errors, points };
}
