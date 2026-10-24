// Elite 10 E1 (2026-10-17) — SỔ ĐĂNG KÝ TÍN HIỆU: chuẩn hoá đầu ra của mọi tab thành một hợp đồng chung theo mã × phiên.
//
// Mỗi tín hiệu có: id ổn định, tab nguồn, ý nghĩa, chiều (giá trị lớn = nghiêng TĂNG so với thị trường), bậc bằng chứng ban đầu
// (từ các kiểm định đặt trước đã có trong dự án) và ghi chú nguồn. Bậc chỉ là ĐIỂM XUẤT PHÁT: engine bằng chứng (E2) đo lại IC
// trên dữ liệu thật và thăng/giáng bậc theo tiêu chí đăng ký trước. Hàm ở đây là hàm THUẦN (không gọi mạng, không đọc KV) để
// kiểm thử được; việc gom nguồn nằm ở elitePanel.js.
//
// Quy ước giá trị: số thực hoặc null (không có dữ liệu cho mã đó — KHÔNG điền 0 giả). Tín hiệu trạng thái (bộ lọc) mã hoá thành
// thang thứ bậc nhỏ (VD −1…+3) và chỉ có giá trị với mã nằm trong danh sách quét của bộ lọc; mã được quét mà không đạt -> 0.

export const ELITE_PANEL_VERSION = "E1 (2026-10-17)";

/** Bậc bằng chứng: A đạt kiểm định đặt trước · B có lợi thế một phần / mẫu mỏng · C thăm dò / chưa kiểm định. */
export const SIGNAL_SPECS = [
  { id: "ws_sector_alpha", tab: "Kết nối thế giới", labelVi: "α ngắn hạn của ngành (WS-v1)", unit: "đcb/phiên", level: "sector", tier: "A",
    evidenceVi: "WS-v1 đăng ký trước: IC hạng ngành 0,0203, t 2,53, 942 phiên (phiên VN kế tiếp)." },
  { id: "stealth20", tab: "Siêu quét AI", labelVi: "Stealth 20 (dòng tiền ẩn 20 phiên, z)", unit: "z", level: "stock", tier: "A",
    evidenceVi: "Sổ cái nghiên cứu: tỷ lệ đúng 51,9% vs nền 47,7% (T+3, n≈2.200, z cụm 2,05)." },
  { id: "stealth5", tab: "Siêu quét AI", labelVi: "Stealth 5 (dòng tiền ẩn 5 phiên, z)", unit: "z", level: "stock", tier: "A",
    evidenceVi: "Sổ cái nghiên cứu: 51,8% vs 47,8% (T+3), 54,9% vs 48,4% (T+10), z cụm 2,0–2,2." },
  { id: "top20_alpha", tab: "Lọc ngành", labelVi: "Điểm alpha M1 (Top 20)", unit: "điểm", level: "stock", tier: "B",
    evidenceVi: "T3 ngoài mẫu: IC hạng 0,037 [0,0015; 0,076]; lợi nhuận Top 20 sau phí âm (FAIL tổng thể)." },
  { id: "sepa_s2", tab: "TA VN-Index", labelVi: "SEPA phá vỡ đạt chuẩn (S2)", unit: "cờ", level: "stock", tier: "B",
    evidenceVi: "SP3: OOS n 37, +3,66%/20 phiên nhưng trong mẫu âm." },
  { id: "net_intent", tab: "Siêu quét AI", labelVi: "Ý đồ dòng tiền IFE (tích luỹ − phân phối)", unit: "xác suất", level: "stock", tier: "C",
    evidenceVi: "Sổ cái: không có lợi thế (tỷ lệ đúng ≈ nền)." },
  { id: "smart_score", tab: "Siêu quét AI", labelVi: "Smart Score", unit: "0–100", level: "stock", tier: "C", evidenceVi: "Chưa có kiểm định đặt trước." },
  { id: "rs_rating", tab: "Siêu quét AI", labelVi: "Sức mạnh giá RS", unit: "0–100", level: "stock", tier: "C", evidenceVi: "Chưa có kiểm định đặt trước." },
  { id: "ta_score", tab: "Siêu quét AI", labelVi: "Điểm kỹ thuật", unit: "0–100", level: "stock", tier: "C", evidenceVi: "Chưa có kiểm định đặt trước." },
  { id: "fa_score", tab: "Siêu quét AI", labelVi: "Điểm cơ bản", unit: "0–100", level: "stock", tier: "C", evidenceVi: "Chưa có kiểm định đặt trước." },
  { id: "risk_adj_mom", tab: "Siêu quét AI", labelVi: "Động lượng điều chỉnh rủi ro", unit: "tỷ lệ", level: "stock", tier: "C", evidenceVi: "Chưa có kiểm định đặt trước." },
  { id: "foreign_net_buy", tab: "Siêu quét AI", labelVi: "Khối ngoại mua ròng", unit: "cờ", level: "stock", tier: "C", evidenceVi: "Chưa có kiểm định đặt trước." },
  { id: "mom5_atr", tab: "Siêu quét AI", labelVi: "Động lượng 5 phiên / ATR", unit: "z", level: "stock", tier: "C", evidenceVi: "Đặc trưng mô hình, chưa kiểm định riêng." },
  { id: "log_rvol", tab: "Siêu quét AI", labelVi: "Khối lượng tương đối (log)", unit: "log", level: "stock", tier: "C", evidenceVi: "Đặc trưng mô hình, chưa kiểm định riêng." },
  { id: "sepa_state", tab: "TA VN-Index", labelVi: "Trạng thái SEPA", unit: "bậc", level: "stock", tier: "C", evidenceVi: "SP3: thứ bậc danh sách không đạt." },
  { id: "pattern_state", tab: "TA VN-Index", labelVi: "Mô hình giá Pring", unit: "bậc", level: "stock", tier: "C", evidenceVi: "P3: không nhóm nào đạt (PF OOS 0,41)." },
  { id: "convergence", tab: "TA VN-Index", labelVi: "Hợp lưu v2", unit: "bậc", level: "stock", tier: "C", evidenceVi: "H1–H4: EXPERIMENTAL." },
  { id: "base_breakout", tab: "TA VN-Index", labelVi: "Base Breakout v2", unit: "bậc", level: "stock", tier: "C", evidenceVi: "Sổ theo dõi chưa đủ mẫu." },
  { id: "rrg_quadrant", tab: "Lọc ngành", labelVi: "Góc phần tư RRG của ngành", unit: "bậc", level: "sector", tier: "C", evidenceVi: "L3: không đạt." },
  { id: "catalyst_impact", tab: "Chất xúc tác", labelVi: "Tác động chất xúc tác", unit: "điểm", level: "stock", tier: "C",
    evidenceVi: "X6: mẫu sạch dưới ngưỡng đăng ký; chiều tác động chưa kiểm chứng." },
  { id: "cotuc_decision", tab: "Cổ tức", labelVi: "Quyết định Cổ tức (thuận / theo dõi / tránh)", unit: "bậc", level: "stock", tier: "C",
    evidenceVi: "Có sổ theo dõi Brier/CUSUM; chưa có kiểm định đặt trước cho xếp hạng." },
];

// T7 (2026-10-21): Cấu trúc thị trường đa khung — bậc C (chỉ đo IC, không vào điểm Elite cho tới khi engine bằng chứng thăng bậc).
SIGNAL_SPECS.push(
  { id: "structure_stage", tab: "TA VN-Index", labelVi: "Giai đoạn cấu trúc khung Ngày (MTF v2)", unit: "bậc", level: "stock", tier: "C", evidenceVi: "MTF v2 V4 không đạt (vào B tái tích lũy −1,37%/20 phiên OOS); từ 24/10/2026 thang giai đoạn v2 (B = tái tích lũy); chỉ đo IC." },
  { id: "structure_score", tab: "TA VN-Index", labelVi: "Bảng kiểm lợi thế kỹ thuật (8 mục, MTF)", unit: "0–8", level: "stock", tier: "C", evidenceVi: "T2 H3 không đạt (IC OOS −0,032); v2 mục R:R theo tài liệu (≥ 1)." },
  { id: "structure_verdict", tab: "TA VN-Index", labelVi: "Kết luận đa khung R1–R7 (v2, cổng R:R)", unit: "bậc", level: "stock", tier: "C", evidenceVi: "MTF v2 V1 không đạt (L khung 1 giờ −0,72%/10 phiên OOS), V2 cổng R:R +0,25% (KTC chứa 0)." },
);

export const SPEC_BY_ID = new Map(SIGNAL_SPECS.map((s) => [s.id, s]));

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r4 = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4);

const SEPA_STATUS = { BREAKOUT: 2, NEAR_PIVOT: 1, FORMING: 0.5, SQUAT: -0.5, FAILED: -1 };
const PATTERN_STATUS = { BREAKOUT: 1, CONFIRMED: 1, TARGET1: 0.5, PULLBACK: 0.5, FORMING: 0.25 };
const GRADE = { A: 3, B: 2, C: 1 };
const QUADRANT = { LEADING: 2, IMPROVING: 1, WEAKENING: -1, LAGGING: -2 };
const COTUC = { FAVORABLE: 1, WATCH: 0, AVOID: -1 };
// v2 (24/10/2026): B = tái tích lũy trong xu hướng tăng (trước đây "quá mua") -> xếp giữa UP và A.
const STRUCT_STAGE = { UP: 2, B: 1.5, A: 1, RANGE: 0, C: -0.5, Bp: -1, D: -1.5, DOWN: -2 };
const STRUCT_VERDICT = { "MUA": 2, "CHỜ MUA": 1, "ĐỨNG NGOÀI": 0, "GIẢM TỶ TRỌNG": -1, "BÁN": -2 };

/** Ngành ICB cụ thể nhất có trong tập `codes` cho một mã (l3 -> l2 -> l1). */
export function icbFor(symbolsMap, ticker, codes) {
  const m = symbolsMap?.[ticker];
  if (!m) return null;
  for (const k of ["l3", "l2", "l1"]) if (m[k] && codes.has(m[k])) return m[k];
  return null;
}

/**
 * Dựng các dòng của bảng tín hiệu (mã × tín hiệu) từ tài liệu các tab. Tất cả tham số đều có thể null (nguồn lỗi -> cột null +
 * ghi trong `missingSources`). Trả { rows, coverage, missingSources }.
 * @param {object} src
 * @param {{ items: any[], dataAsOf?: string } | null} src.scanner          KV scanner latest (Siêu quét)
 * @param {Map<string, any> | null} src.features                            mã -> features ngày gần nhất (market_flow_daily)
 * @param {{ top20: any[], others: any[] } | null} src.top20                KV alpha:top20
 * @param {Record<string, { results: any[] } | null>} src.strategies       KV strategies:<id>
 * @param {{ short: { rows: any[] } } | null} src.wsStrategy               /api/world-sectors/strategy
 * @param {{ sectors: any[] } | null} src.rrg                              KV sectors:rrg
 * @param {{ symbols: Record<string, {l1?: string, l2?: string, l3?: string}> } | null} src.taxonomy
 * @param {{ tickerImpacts?: Record<string, { direction: string, compositeScore: number }> } | null} src.catalyst
 * @param {{ states?: any[] } | null} src.cotuc                            Project A /api/cotuc/decision-states
 * @param {{ rows: any[] } | null} [src.structure]                          Gateway structure-summary (T4, job 15:47)
 */
export function buildSignalRows(src) {
  const missingSources = [];
  const items = src.scanner?.items ?? [];
  if (!src.scanner) missingSources.push("scanner");
  const itemBy = new Map(items.map((it) => [String(it.ticker).toUpperCase(), it]));
  const tickers = [...itemBy.keys()].sort();

  const top20 = new Map();
  if (src.top20) for (const r of [...(src.top20.top20 ?? []), ...(src.top20.others ?? [])]) top20.set(r.ticker, num(r.score));
  else missingSources.push("top20");

  const stratMap = (id, f) => {
    const doc = src.strategies?.[id];
    if (!doc) { missingSources.push(`strategies:${id}`); return null; }
    const m = new Map();
    for (const r of doc.results ?? []) m.set(String(r.ticker).toUpperCase(), f(r));
    return m;
  };
  const sepa = stratMap("sepa", (r) => SEPA_STATUS[r.status] ?? 0);
  const sepaS2 = src.strategies?.sepa ? new Map((src.strategies.sepa.results ?? []).map((r) => [String(r.ticker).toUpperCase(), r.list === "SẴN SÀNG MUA" && r.status === "BREAKOUT" ? 1 : 0])) : null;
  const patterns = stratMap("patterns", (r) => (PATTERN_STATUS[r.status] ?? 0) * (r.dir === "bear" ? -1 : 1));
  const convergence = stratMap("convergence", (r) => (GRADE[r.grade] ?? 1) * (r.side === "sell" ? -1 : 1));
  const breakout = stratMap("base-breakout", (r) => GRADE[r.grade] ?? 1);

  const symbols = src.taxonomy?.symbols ?? null;
  if (!symbols) missingSources.push("taxonomy");
  const wsRows = src.wsStrategy?.short?.rows ?? null;
  if (!wsRows) missingSources.push("worldStrategy");
  const wsAlpha = new Map((wsRows ?? []).map((r) => [r.icb, num(r.alphaBps)]));
  const rrgSectors = src.rrg?.sectors ?? null;
  if (!rrgSectors) missingSources.push("rrg");
  const rrg = new Map((rrgSectors ?? []).map((s) => [s.code, QUADRANT[s.liveQuadrant ?? s.quadrant] ?? null]));

  const impacts = src.catalyst?.tickerImpacts ?? null;
  if (!impacts) missingSources.push("catalyst");
  const cotuc = new Map();
  if (src.cotuc?.states) {
    for (const s of src.cotuc.states) if (s?.ticker) cotuc.set(String(s.ticker).toUpperCase(), COTUC[s.decision?.level] ?? null);
  } else {
    missingSources.push("cotuc");
  }
  if (!src.features) missingSources.push("researchFeatures");
  const structure = src.structure?.rows ? new Map(src.structure.rows.map((r) => [String(r.t).toUpperCase(), r])) : null;
  if (!structure) missingSources.push("structure");

  const rows = tickers.map((ticker) => {
    const it = itemBy.get(ticker) ?? {};
    const f = src.features?.get(ticker) ?? null;
    const wsIcb = symbols ? icbFor(symbols, ticker, new Set(wsAlpha.keys())) : null;
    const rrgIcb = symbols ? icbFor(symbols, ticker, new Set(rrg.keys())) : null;
    const imp = impacts?.[ticker];
    const values = {
      ws_sector_alpha: wsIcb ? wsAlpha.get(wsIcb) ?? null : null,
      stealth20: num(f?.stealth20),
      stealth5: num(f?.stealth5),
      top20_alpha: top20.get(ticker) ?? null,
      sepa_s2: sepaS2 ? sepaS2.get(ticker) ?? 0 : null,
      net_intent: num(f?.netIntent),
      smart_score: num(it.smartScore),
      rs_rating: num(it.rsRating),
      ta_score: num(it.taScore),
      fa_score: num(it.faScore),
      risk_adj_mom: num(it.riskAdjustedMomentum),
      foreign_net_buy: typeof it.foreignNetBuyFlag === "boolean" ? (it.foreignNetBuyFlag ? 1 : 0) : null,
      mom5_atr: num(f?.mom5Atr),
      log_rvol: num(f?.logRvol),
      sepa_state: sepa ? sepa.get(ticker) ?? 0 : null,
      pattern_state: patterns ? patterns.get(ticker) ?? 0 : null,
      convergence: convergence ? convergence.get(ticker) ?? 0 : null,
      base_breakout: breakout ? breakout.get(ticker) ?? 0 : null,
      rrg_quadrant: rrgIcb ? rrg.get(rrgIcb) ?? null : null,
      catalyst_impact: impacts ? (imp && imp.direction !== "none" ? (imp.direction === "harm" ? -1 : 1) * (num(imp.compositeScore) ?? 0) : 0) : null,
      cotuc_decision: cotuc.size ? cotuc.get(ticker) ?? null : null,
      structure_stage: structure ? STRUCT_STAGE[structure.get(ticker)?.st] ?? null : null,
      structure_score: structure ? num(structure.get(ticker)?.sc) : null,
      structure_verdict: structure ? STRUCT_VERDICT[structure.get(ticker)?.v] ?? null : null,
    };
    for (const k of Object.keys(values)) values[k] = r4(values[k]);
    return { ticker, icb: symbols?.[ticker] ?? null, sector: it.industry ?? it.sector ?? null, values };
  });

  const coverage = Object.fromEntries(SIGNAL_SPECS.map((s) => [s.id, rows.filter((r) => r.values[s.id] != null).length]));
  return { rows, coverage, missingSources: [...new Set(missingSources)] };
}
