// Trading Matrix — Index Impact (spec §6.8): điểm đóng góp của từng mã vào biến động VN-Index một phiên.
//
// VN-Index = vốn hoá toàn bộ cổ phiếu HOSE / hệ số chia (không điều chỉnh free-float). Đóng góp của mã i (điểm):
//   c_i = I_{t−1} · (P_t − R̃_t) · N_i / Σ_j R̃_t,j · N_j
//   R̃ = giá tham chiếu ĐÃ điều chỉnh sự kiện quyền: (P_{t−1} − cổ tức tiền) / (1 + tỷ lệ cổ phiếu) vào ngày GDKHQ — từ 2025 SSI
//       để RefPrice = giá đóng cửa hôm trước kể cả ngày GDKHQ (xem adjusted/adjustedHistory.js).
//   N   = số cổ phiếu lưu hành VNDirect finfo (OUTSTANDING_SHARES). KHÔNG dùng SSI SecuritiesDetails.ListedShare: bản SSI trả
//         ReportDate 30/10/2023 (cũ 3 năm) -> lệch tới 35% so với biến động thật.
// Đối chiếu 20 phiên 24/09 → 21/10/2026: Σ đóng góp so với % thay đổi VN-Index thật RMSE 0,020 điểm %, R² 0,9995.
// Mỗi phiên trả kèm phần kiểm tra (dự báo vs thật) -> lệch lớn thì UI ghi rõ, không che.
// VN30 dùng free-float + giới hạn tỷ trọng (không có dữ liệu free-float có nguồn) -> KHÔNG tính tác động VN30.

const BASE = "https://api-finfo.vndirect.com.vn/v4/ratios/latest";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36", Accept: "application/json" };
export const IMPACT_TOLERANCE_PP = 0.05; // |dự báo − thật| ≤ 0,05 điểm % -> "khớp"

/** Số cổ phiếu lưu hành (VNDirect finfo), gộp 50 mã / lượt. */
export async function fetchVndShares(symbols, { fetchImpl = globalThis.fetch, chunk = 50, timeoutMs = 20_000 } = {}) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += chunk) {
    const codes = symbols.slice(i, i + chunk).join(",");
    const res = await fetchImpl(`${BASE}?filter=ratioCode:OUTSTANDING_SHARES&where=code:${codes}&order=reportDate&fields=ratioCode,value,code,reportDate&size=500`, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`VNDirect ratios HTTP ${res.status}`);
    const body = await res.json();
    for (const x of body?.data ?? []) if (x.value > 0) out.set(String(x.code).toUpperCase(), Number(x.value));
  }
  return out;
}

/**
 * @param {{ date: string, rows: {symbol, exchange, close, refPrice, value?}[], shares: Map<string, number>,
 *   eventsOf?: (symbol: string) => {exDate, cash, ratio}[] | null, indexPrev: number|null, indexClose: number|null,
 *   taxonomy?: Record<string, [string, string]> }} input
 */
export function indexImpact({ date, rows, shares, eventsOf = () => null, indexPrev, indexClose, taxonomy = {} }) {
  const hose = rows.filter((r) => r.exchange === "HOSE" && r.close > 0 && r.refPrice > 0);
  const items = [], missing = [];
  let den = 0;
  for (const r of hose) {
    const n = shares.get(r.symbol);
    if (!(n > 0)) { missing.push(r.symbol); continue; }
    let ref = r.refPrice, adjusted = null;
    const evs = (eventsOf(r.symbol) ?? []).filter((e) => e.exDate === date);
    if (evs.length) {
      const cash = evs.reduce((a, e) => a + (e.cash ?? 0), 0), ratio = evs.reduce((a, e) => a + (e.ratio ?? 0), 0);
      const want = (r.refPrice - cash) / (1 + ratio);
      // RefPrice của Sở đã điều chỉnh (trước 2025) thì không điều chỉnh lần nữa.
      if (want > 0 && Math.abs(r.refPrice - want) / r.refPrice > 0.003) { adjusted = { from: r.refPrice, to: Math.round(want), label: evs.map((e) => e.label).join(" + ") }; ref = want; }
    }
    den += ref * n;
    items.push({ symbol: r.symbol, close: r.close, ref, n, value: r.value ?? null, adjusted });
  }
  const capCoverage = { symbols: items.length, of: hose.length, missing: missing.slice(0, 20) };
  if (!den || !(indexPrev > 0)) return { date, items: [], coverage: capCoverage, check: null, sectors: [] };

  let predicted = 0;
  const out = items.map((x) => {
    const points = indexPrev * ((x.close - x.ref) * x.n) / den;
    predicted += points; // tổng trên giá trị chưa làm tròn
    const [group, industry] = taxonomy[x.symbol] ?? ["Khác", "Khác"];
    return {
      symbol: x.symbol, industry, group, close: x.close, changePct: Math.round(((x.close / x.ref) - 1) * 10_000) / 100,
      weightPct: Math.round(((x.ref * x.n) / den) * 10_000) / 100, points: Math.round(points * 100) / 100,
      value: x.value, adjusted: x.adjusted,
    };
  }).sort((a, b) => b.points - a.points);

  const actual = indexClose > 0 ? indexClose - indexPrev : null;
  const toPct = (pts) => (pts / indexPrev) * 100;
  const diffPp = actual === null ? null : toPct(predicted) - toPct(actual);
  const bySector = new Map();
  for (const x of out) {
    const s = bySector.get(x.industry) ?? { industry: x.industry, group: x.group, points: 0, up: 0, down: 0, n: 0 };
    s.points += x.points; s.n++; if (x.changePct > 0) s.up++; else if (x.changePct < 0) s.down++;
    bySector.set(x.industry, s);
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    date, items: out,
    coverage: capCoverage,
    check: {
      predictedPoints: r2(predicted), actualPoints: actual === null ? null : r2(actual),
      predictedPct: Math.round(toPct(predicted) * 1000) / 1000, actualPct: actual === null ? null : Math.round(toPct(actual) * 1000) / 1000,
      diffPp: diffPp === null ? null : Math.round(diffPp * 1000) / 1000,
      status: diffPp === null ? "NO_INDEX" : Math.abs(diffPp) <= IMPACT_TOLERANCE_PP ? "MATCH" : "DEVIATION",
    },
    sectors: [...bySector.values()].map((s) => ({ ...s, points: r2(s.points) })).sort((a, b) => b.points - a.points),
  };
}

/** Tóm tắt gọn cho snapshot tổng hợp: trụ kéo / đè chỉ số + kiểm tra. */
export function impactSummary(r, k = 5) {
  if (!r?.items?.length) return null;
  return {
    date: r.date, check: r.check,
    up: r.items.slice(0, k).filter((x) => x.points > 0).map(({ symbol, points, changePct, industry }) => ({ symbol, points, changePct, industry })),
    down: r.items.slice(-k).reverse().filter((x) => x.points < 0).map(({ symbol, points, changePct, industry }) => ({ symbol, points, changePct, industry })),
    // Độ tập trung: phần biến động do 5 mã đóng góp lớn nhất (theo trị tuyệt đối).
    top5Share: (() => {
      const abs = r.items.map((x) => Math.abs(x.points)).sort((a, b) => b - a), tot = abs.reduce((a, b) => a + b, 0);
      return tot ? Math.round((abs.slice(0, 5).reduce((a, b) => a + b, 0) / tot) * 1000) / 10 : null;
    })(),
  };
}
