// SEPA (Minervini) — lõi kỹ thuật point-in-time (SP1). Chuyển 1:1 từ gói Python sepa_screener; bản Python là chuẩn đối
// chiếu (test/sepaParity.test.js so khớp trên dữ liệu giả lập tại nhiều phiên t). Cơ bản / dẫn dắt / sức khỏe thị trường và
// điểm SEPA + danh sách (SẴN SÀNG MUA / CẢNH BÁO MUA / THEO DÕI / LOẠI) thuộc SP2 (dữ liệu VN).

import { SEPA } from "./config.js";
import { prepareSepa } from "./indicators.js";
import { scanAllBases } from "./patterns/bases.js";
import { postBreakoutMonitor } from "./patterns/monitor.js";
import { scanVcp } from "./patterns/vcp.js";
import { bestPattern } from "./patterns/common.js";
import { planTrade } from "./risk.js";
import { classifyStage, trendTemplate } from "./trend.js";

export { SEPA } from "./config.js";
export * from "./indicators.js";
export * from "./trend.js";
export * from "./risk.js";
export { detectVcp, scanVcp } from "./patterns/vcp.js";
export { detectCupHandle, detectFlatBase, detectPowerPlay, detectPrimaryBase, detectThreeC, scanAllBases } from "./patterns/bases.js";
export { STATUS_RANK, bestPattern, evaluateBreakout, withRecentBreakout } from "./patterns/common.js";
export * from "./fundamentals.js";
export * from "./leadership.js";
export * from "./screener.js";
export { postBreakoutMonitor } from "./patterns/monitor.js";

/**
 * Phân tích kỹ thuật SEPA tại phiên t (chỉ dữ liệu ≤ t).
 * opts: { rs (RS Rating 1–99), listingDate, equity (VND), hardMarket, cfg }.
 */
export function sepaTechnical(S, t, { rs = null, listingDate = null, equity = 1e9, hardMarket = false, cfg = SEPA } = {}) {
  const trend = trendTemplate(S, t, rs, cfg.trend);
  const stage = classifyStage(S, t, cfg.stage);
  const patterns = [scanVcp(S, t, cfg.vcp), ...scanAllBases(S, t, { cfg, listingDate })];
  const best = bestPattern(patterns);
  let plan = null, monitor = null;
  if (best && best.pivot) {
    const entry = best.status === "FORMING" || best.status === "NEAR_PIVOT" ? best.pivot * 1.001 : S.C[t];
    plan = planTrade(entry, best.stopRef, equity, cfg.risk, hardMarket);
    if (best.breakout?.ngay_pha_vo != null) monitor = postBreakoutMonitor(S, t, best.breakout.ngay_pha_vo, best.pivot, plan.stop);
  }
  return { date: S.date[t], close: S.C[t], trend, stage, patterns, best, plan, monitor };
}

/** Tiện ích: phân tích phiên cuối của một chuỗi bars. */
export const sepaTechnicalLast = (bars, opts) => { const S = prepareSepa(bars); return sepaTechnical(S, S.n - 1, opts); };
