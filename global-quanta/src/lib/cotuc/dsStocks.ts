// BL1 (07/11/2026) — DS-v1 (Gateway /api/corp-events/screener) -> DividendStock cho bảng Bộ lọc hiện có.
// Một nguồn thật duy nhất: giá / xu hướng / RSI (bản quét), cổ tức (sự kiện VNDirect), P/E, ROE, nợ, chi trả, F-Score (KQKD 4 quý).
// Thiếu số -> 0 kèm cờ (fundamentalsReal / payoutReal…) để giao diện ghi "chưa có"; không có giá trị mặc định.
import { DIVIDEND_STOCKS, type DividendStock, type PriceTrend } from "../quant-cotuc";

export interface DsRow {
  t: string; name: string; sector: string | null; sectorGroup: string | null; price: number | null; changePct: number | null; liquidity20: number | null; mcap: number | null;
  trend: PriceTrend | null; ma50: number | null; ma200: number | null; rsi14: number | null; rsRating: number | null; yieldGross: number | null; yieldNet: number | null;
  div: { ttmCash: number; payments12m: number; stockPct12m: number; lastEx: string | null; lastCash: number | null; nextEx: string | null; nextCash: number | null; nextPay: string | null; nextRecord: string | null; agmNext: string | null; lastFy: number | null; lastFyCash: number | null; streak: number; cagr3: number | null; cuts5: number; years5: number; history: [number, number][] } | null;
  fund: { quarter: string; tpl: string; pe: number | null; pb: number | null; roe: number | null; de: number | null; interestCover: number | null; netDebtEbitda: number | null; netMargin: number | null; growthTtm: number | null; npatYoY: number | null; epsTtm: number | null; payout: number | null; fcfCover: number | null; cfoToNpat: number | null; accrual: number | null; f: number | null; m: number | null; mFlag: boolean | null; z: number | null; zZone: string | null; flags: string[];
    epsSource?: string | null; epsAdj?: EpsAdj | null; epsFlags?: string[] } | null;
  ex: { n: number; dropMedian: number | null; fillWithin20: number | null; fillDaysMedian: number | null } | null;
  dq?: DqView | null;
  fm?: FmView | null;
}
/** BL2 — DQ-v1: lợi suất chuẩn hoá, độ bền cổ tức, Lintner, rủi ro giá (MÔ TẢ). */
export interface DqView {
  version: string;
  yield: { fy: number | null; fyYear: number | null; median3: number | null; ttm: number | null; catchUp: boolean; company: number | null };
  company: { years: number; payout5: number | null; fcfCover5: number | null; streak: number; cuts10: number; divCv5: number | null; lossYears10: number; lastYear: number | null; lastD: number | null; lastE: number | null };
  lintner: { ok: boolean; n: number; from?: number; to?: number; speed?: number | null; targetPayout?: number | null; r2?: number | null; reason: string | null };
  lintnerNextD: number | null; lintnerNextYield: number | null;
  checks: { id: string; label: string; pass: boolean | null }[]; checksPassed: number; checksKnown: number;
  risk: { vol1y: number | null; mdd1y: number | null; ret1y: number | null; beta: number | null; sessions: number } | null;
  trap: string[] | null;
}
/** BL3 — FM-v1: điểm nhân tố (z theo nhóm ngành), thứ hạng, ngũ phân vị. label theo kiểm định đặt trước BL-r1. */
export interface FmView { version: string; label: string; score: number; groups: Record<"Y" | "D" | "G" | "Q" | "V" | "R", number | null>; rank: number; of: number; quintile: number; pct: number }
export interface EpsAdj { factor: number; epsQ: number | null; actions: { ex: string; cat: string; ratio: number; factor: number; kind: string }[] }

const EPS_SRC: Record<string, string> = { VND_EPS_TR: "EPS 4 quý VNDirect", NPAT_SHARES: "LNST công ty mẹ 4 quý ÷ số cổ phiếu", SUM_Q: "tổng EPS 4 quý trên BCTC" };
const ACT: Record<string, string> = { STOCK: "cổ tức CP", BONUS: "thưởng CP", RIGHTS: "quyền mua (phần thưởng ẩn)" };
/** EPS-v2 (P1): chú thích nguồn EPS + điều chỉnh hồi tố IAS 33 (thưởng / cổ tức CP / quyền mua có GDKHQ sau quý BCTC) + ghi chú quỹ KTPL. */
export function epsNote(f: DsRow["fund"]): string | null {
  if (!f?.epsSource) return null;
  const lines = [`EPS 12 tháng: ${EPS_SRC[f.epsSource] ?? f.epsSource} (quý ${f.quarter}).`];
  const a = f.epsAdj;
  if (a && a.factor !== 1) {
    lines.push(`Điều chỉnh hồi tố IAS 33 ÷ ${a.factor.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}${a.epsQ != null ? ` (EPS theo số CP cuối quý ${a.epsQ.toLocaleString("vi-VN")} đ)` : ""}:`);
    for (const x of a.actions) lines.push(`• ${ACT[x.kind] ?? x.kind} ${x.ratio.toLocaleString("vi-VN")}% — GDKHQ ${vn(x.ex)}`);
  }
  if (f.epsFlags?.includes("SHARES_ANOMALY")) lines.push("⚠ Số cổ phiếu hiện hành của nguồn dữ liệu bất thường — đã dùng số CP cuối quý.");
  else if (f.epsFlags?.includes("SHARES_GAP")) lines.push("Số CP hiện hành của nguồn đã gồm đợt phát hành chưa vào mẫu số (ESOP / riêng lẻ / quyền mua chưa phát hành).");
  lines.push("EPS chưa trừ quỹ khen thưởng phúc lợi — EPS trên BCTC có thể thấp hơn vài %.");
  return lines.join("\n");
}

export interface DsDoc { version: string; today: string; asOf: Record<string, string | null>; count: number; coverage: Record<string, number>; rows: DsRow[] }

const CORE = new Set(DIVIDEND_STOCKS.map((s) => s.ticker));
const vn = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const pct = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 1000) / 10 : null);

/** Một dòng DS-v1 -> DividendStock. livePrice: giá khớp trực tiếp (ưu tiên); lợi suất tính lại theo giá đó. */
export function dsToStock(r: DsRow, livePrice?: number | null): DividendStock & { ds: DsRow; payoutReal: boolean; growthReal: boolean } {
  const price = livePrice && livePrice > 0 ? livePrice : r.price ?? 0;
  const ttm = r.div?.ttmCash ?? 0;
  const yieldPct = price > 0 ? Math.round((ttm / price) * 1000) / 10 : 0;
  const f = r.fund;
  const upcoming = r.div?.nextEx ?? null;
  return {
    ticker: r.t, name: r.name || r.t, sector: r.sector ?? "Khác", price,
    pe: price > 0 && f?.epsTtm && f.epsTtm > 0 ? Math.round((price / f.epsTtm) * 10) / 10 : 0,
    roe: pct(f?.roe) ?? 0, dividendYield: yieldPct, payoutRatio: pct(f?.payout) ?? 0, debtEquity: f?.de ?? 0, growth: pct(f?.growthTtm) ?? 0,
    fscore: f?.f ?? 0, pros: [], cons: [], rsi: r.rsi14 ?? 0,
    exDividendDate: vn(upcoming ?? r.div?.lastEx), paymentDate: vn(upcoming ? r.div?.nextPay : null), dividendAmount: (upcoming ? r.div?.nextCash : r.div?.lastCash) ?? 0,
    agmDate: vn(r.div?.agmNext), catalystScore: null, priceTrend: r.trend,
    fundamentalsReal: f != null && (f.roe != null || f.epsTtm != null), isUniverseOnly: !CORE.has(r.t),
    payoutReal: f?.payout != null, growthReal: f?.growthTtm != null, ds: r, dq: r.dq ?? null, fm: r.fm ?? null, npatYoY: f?.npatYoY ?? null, epsNote: epsNote(f),
  };
}
