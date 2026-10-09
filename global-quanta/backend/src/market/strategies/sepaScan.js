// SEPA Minervini (SP2) — chạy bộ lọc SEPA trên universe của Gateway và định dạng kết quả cho KV strategies:sepa.
//
// Dữ liệu VN (khác gói Python — có chủ ý):
//   - Giá điều chỉnh cộng dồn ~3 năm (screenerSeries, chỉ đọc kho); cổng thanh khoản chung của bộ lọc TA (giá ≥ 5.000đ, GTGD
//     TB 20 phiên ≥ 5 tỷ) thay cho LiquidityConfig của bản Python.
//   - RS Rating phân vị trên MỌI mã đã tải (cả mã kém thanh khoản, như bản Python), tại cùng ngày dữ liệu.
//   - Cơ bản: BCTC quý VCI theo ngày công bố ước tính (hết quý + 45 ngày); "EPS" = LNST cổ đông công ty mẹ (vnQuarterly).
//   - Thị trường BẤT LỢI / THẬN TRỌNG -> stop 6% (sách s.370). Kế hoạch lệnh tính với vốn tham chiếu 1 tỷ đồng; giao diện tính lại
//     theo vốn của người dùng (lưu trên máy).
// Chưa ghi sổ theo dõi (SCR_SEPA_* từ SP5); bằng chứng lịch sử OOS ở SP3.

import { BUCKETS, groupStrength, runSepaScreen, SEPA, vnQuarterly } from "./sepa/index.js";

export const SEPA_ENGINE = "sepa/SP2";
export const SEPA_EQUITY_REF = 1_000_000_000;
const EVIDENCE_PENDING = Object.freeze({
  label: "PENDING",
  reason: "Kiểm định ngoài mẫu (OOS) với tiêu chí đặt trước thực hiện ở bước SP3 — trước đó SEPA là EXPERIMENTAL, chỉ hiển thị.",
  all: { n: 0 },
});

const round = (x, nd = 4) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : x);
const shortPattern = (p) => ({ name: p.name, detected: p.detected, status: p.status, score: p.score, footprint: p.footprint || null, pivot: p.pivot, reasonsFailed: p.reasonsFailed.slice(0, 3) });

/** JSON không chứa NaN / Infinity (KV jsonb): NaN -> null, ±Infinity -> chuỗi. */
function clean(x) {
  if (typeof x === "number") return Number.isNaN(x) ? null : Number.isFinite(x) ? x : x > 0 ? "Infinity" : "-Infinity";
  if (Array.isArray(x)) return x.map(clean);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clean(v)]));
  return x;
}

/** Một dòng kết quả. LOẠI: rút gọn (chỉ tiêu chí Trend Template + lý do) để KV gọn; ngăn chi tiết của mã LOẠI tính lại khi mở. */
export function sepaRow(r, item, S, t, extra = {}) {
  const best = r.best;
  const base = {
    ticker: item.ticker, name: item.name ?? null, sector: item.sector ?? null, date: S.date[t],
    list: r.danhSach, status: best?.status ?? null, score: r.diemSepa, screensPassed: r.soBoLocDat, screens: r.boLoc,
    metrics: {
      score: r.diemSepa, close: S.C[t], rs: r.rs, trendScore: r.trend.score, stage: r.stage.stage, baseNo: r.stage.stage === 2 ? r.stage.baseCount + 1 : null,
      pattern: best?.name ?? null, footprint: best?.footprint ?? null, pivot: best?.pivot ?? null,
      stop: r.plan?.stop ?? null, stopPct: r.plan ? round(r.plan.stopPct * 100, 2) : null,
      fundScore: r.fund.score, epsGrowthQ: r.fund.metrics.EPS_gan_nhat ?? null, revGrowthQ: r.fund.metrics.DT_gan_nhat ?? null,
      code33: Boolean(r.fund.flags.MAT_MA_33), leadScore: r.lead.diem_dan_dat ?? null,
    },
    liquidity: extra.liquidity ?? null, priceBasis: extra.priceBasis ?? null,
  };
  if (r.danhSach === "LOẠI") {
    return clean({ ...base, trend: { passed: r.trend.passed, score: r.trend.score, criteria: r.trend.criteria }, stageLabel: r.stage.label, warnings: r.warnings.slice(0, 3) });
  }
  return clean({
    ...base,
    components: r.components,
    warnings: r.warnings,
    trend: { passed: r.trend.passed, score: r.trend.score, criteria: r.trend.criteria, values: r.trend.values },
    stage: r.stage,
    fundamentals: { ...r.fund, ...(extra.fundMeta ?? {}) },
    lead: r.lead,
    pattern: best,
    patterns: r.patterns.map(shortPattern),
    plan: r.plan,
    monitor: r.monitor,
    bars: S.n,
  });
}

/**
 * @param loaded   [{ item, bars, priceBasis }] mọi mã đã tải (RS phân vị trên toàn bộ)
 * @param eligible [{ item, bars, gate }] mã qua cổng giá / thanh khoản, ngày cuối = dataAsOf
 * @param indexBars VN-Index, faMap Map<ticker, fa VCI>
 */
export function scanSepa({ loaded, eligible, indexBars, faMap, dataAsOf, equity = SEPA_EQUITY_REF }) {
  const elig = new Map(eligible.map((e) => [e.item.ticker, e]));
  const byTicker = new Map(loaded.map((s) => [s.item.ticker, s]));
  const prices = new Map(loaded.filter((s) => s.bars.length >= 64).map((s) => [s.item.ticker, s.bars]));
  const fundMeta = new Map();
  const screen = runSepaScreen({
    prices, index: indexBars?.length ? indexBars : null, equity, cfg: SEPA, asOf: dataAsOf,
    eligible: (sym) => elig.has(sym),
    fundamentals: (sym, date) => {
      const q = vnQuarterly(faMap?.get(sym), date);
      fundMeta.set(sym, q ? { latestQuarter: q.latestQuarter, quarters: q.date.length, columns: Object.keys(q.cols), source: q.source } : { latestQuarter: null, quarters: 0, columns: [], source: "VCI — chưa có BCTC" });
      return q;
    },
  });
  const results = [];
  for (const sym of screen.order) {
    const r = screen.results[sym], s = byTicker.get(sym), e = elig.get(sym), { S, t } = screen.points.get(sym);
    results.push(sepaRow(r, s.item, S, t, { fundMeta: fundMeta.get(sym), liquidity: { price: e.gate.price, avgValue20: e.gate.avgValue20 }, priceBasis: s.priceBasis }));
  }
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, results.filter((x) => x.list === b).length]));
  const sectorOf = Object.fromEntries(loaded.map((s) => [s.item.ticker, s.item.sector ?? "Khác"]));
  const sectors = groupStrength(Object.fromEntries(Object.entries(screen.rs).filter(([k]) => elig.has(k))), sectorOf).map((x) => ({ ...x, mean: round(x.mean, 1) }));
  return {
    engine: SEPA_ENGINE,
    evidence: EVIDENCE_PENDING,
    sepaMarket: clean({ ...screen.market, hardMarket: screen.hardMarket }),
    lists: counts,
    sectors,
    equityRef: equity,
    risk: { ...SEPA.risk, note: "Rủi ro 5%/lệnh (người dùng chọn), trần 25%/vị thế -> rủi ro thực ≈ 1,9% vốn với stop 7,5%" },
    results,
    errors: screen.errors,
  };
}
