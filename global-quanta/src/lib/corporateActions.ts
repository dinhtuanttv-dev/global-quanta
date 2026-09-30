import {
  DilutionEvent,
  DilutionImpactResult,
  DividendDriftResult,
  DividendEvent,
} from "../types/financialEngineering";

/**
 * A.6 - Corporate Action Intelligence (Phase 1, tich hop tu goi ban giao Chat Xuc Tac 2.0)
 * Chua noi API du lieu that - cac ham duoi day san sang nhan input khi
 * backend cung cap chuoi gia + lich su su kien co tuc/pha loang.
 */

interface PricePoint {
  date: string; // ISO
  close: number;
}

// ── Post-ex-dividend price drift ─────────────────────────────────────────────
/**
 * Tinh drift trung binh (%) cua gia trong N phien sau ngay GDKHQ, da dieu
 * chinh cho gia tri co tuc de so sanh cong bang qua nhieu su kien/ma.
 * priceSeriesByEvent: voi moi event, mang gia dong cua 5 phien sau exDate
 * (index 0 = gia dong cua ngay GDKHQ).
 */
export function computeDividendDrift(
  events: DividendEvent[],
  priceSeriesByEvent: PricePoint[][],
  windowDays = 5
): DividendDriftResult {
  if (events.length === 0 || events.length !== priceSeriesByEvent.length) {
    return {
      ticker: events[0]?.ticker ?? "",
      sampleSize: 0,
      avgDriftPct: 0,
      stdDevPct: 0,
      confidence: "low",
    };
  }

  const drifts: number[] = [];

  events.forEach((event, idx) => {
    const series = priceSeriesByEvent[idx];
    if (!series || series.length < windowDays) return;

    const priceAtExDate = series[0].close;
    const priceAtWindowEnd = series[windowDays - 1].close;

    // Gia ky vong "khong co drift" = gia truoc GDKHQ tru co tuc (baseline ly thuyet)
    const theoreticalExPrice = event.priceBeforeExDate - event.dividendPerShare;
    const actualReturn = (priceAtWindowEnd - priceAtExDate) / priceAtExDate;
    const theoreticalGap =
      (priceAtExDate - theoreticalExPrice) / theoreticalExPrice;

    drifts.push(actualReturn - theoreticalGap);
  });

  const n = drifts.length;
  if (n === 0) {
    return {
      ticker: events[0].ticker,
      sampleSize: 0,
      avgDriftPct: 0,
      stdDevPct: 0,
      confidence: "low",
    };
  }

  const avg = drifts.reduce((s, d) => s + d, 0) / n;
  const variance = drifts.reduce((s, d) => s + (d - avg) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const confidence: DividendDriftResult["confidence"] =
    n >= 20 ? "high" : n >= 8 ? "medium" : "low";

  return {
    ticker: events[0].ticker,
    sampleSize: n,
    avgDriftPct: avg,
    stdDevPct: stdDev,
    confidence,
  };
}

// ── Dilution impact ───────────────────────────────────────────────────────
const DILUTION_SEVERITY_MULTIPLIER: Record<DilutionEvent["issueType"], number> = {
  // ESOP thuong duoc thi truong "tha thu" nhieu hon phat hanh rieng le gia thap
  esop: 0.6,
  rights_issue: 0.8,
  private_placement: 1.0,
  convertible_bond: 0.7, // pha loang tiem nang, chua chac chan xay ra
};

export function computeDilutionImpact(event: DilutionEvent): DilutionImpactResult {
  const totalAfter = event.sharesOutstandingBefore + event.newSharesIssued;
  const dilutionPct =
    totalAfter === 0 ? 0 : event.newSharesIssued / totalAfter;

  const severity = DILUTION_SEVERITY_MULTIPLIER[event.issueType];
  // Quy doi tuyen tinh don gian: pha loang 10% * severity ~ tru 10 diem compositeScore
  const compositeScoreAdjustment = -(dilutionPct * 100 * severity);

  return { dilutionPct, compositeScoreAdjustment };
}
