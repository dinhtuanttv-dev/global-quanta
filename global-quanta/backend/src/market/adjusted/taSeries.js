// Chuỗi OHLCV cho TA VN-Index (TA_VNINDEX_UPGRADE_SPEC §1.4): giá ĐIỀU CHỈNH CỘNG DỒN theo sự kiện quyền.
//
//   1. OHLC của SSI DailyOhlc: mỗi nến đã bị SSI nhân MỘT hệ số chung (hệ số đợt quyền gần nhất tại thời điểm tải).
//   2. Giá đóng cửa DANH NGHĨA (adjustedHistory, SSI DailyStockPrice) -> k = danh nghĩa / SSI theo từng ngày
//      -> khôi phục O/H/L/C danh nghĩa của từng nến.
//   3. Điều chỉnh lùi cộng dồn theo sự kiện quyền (corporateActions.js).
// Chỉ số: điểm chỉ số (không có sự kiện quyền), kèm số nến còn "dẹt".
// Dự phòng: thiếu giá danh nghĩa hoặc sự kiện quyền -> trả chuỗi tốt nhất có được và GHI RÕ priceBasis + warnings.

import { isIndexSymbol, canonicalSymbol } from "../normalizer.js";
import { adjustOhlcSeries, repairUnexplainedGaps } from "./corporateActions.js";

const RANGE_YEARS = { "1y": 1, "2y": 2, "3y": 3, "5y": 5 };
const MAX_FACTOR_DEVIATION = 0.5; // |k − 1| lớn hơn -> dữ liệu lệch ngày/lỗi, không tin

/** Khôi phục OHLC danh nghĩa từ nến SSI + giá đóng cửa danh nghĩa (hàm thuần). */
export function nominalizeBars(ssiBars, nominalCloseByDate) {
  let lastK = null;
  let matched = 0;
  const bars = ssiBars.map((b) => {
    const nominalClose = nominalCloseByDate.get(b.date);
    let k = null;
    if (nominalClose > 0 && b.close > 0) {
      const cand = nominalClose / b.close;
      if (Math.abs(cand - 1) <= MAX_FACTOR_DEVIATION) { k = cand; matched++; }
    }
    if (k === null) k = b.partial ? 1 : lastK ?? 1; // nến hôm nay (stream) đã là giá danh nghĩa
    lastK = b.partial ? lastK : k;
    if (k === 1) return b;
    const r = (v) => Math.round(v * k);
    return { ...b, open: r(b.open), high: r(b.high), low: r(b.low), close: nominalClose ?? r(b.close) };
  });
  return { bars, matched };
}

export function createTaSeries({ service, nominalHistory, corporateActions }) {
  return {
    async get({ symbol: raw, range = "5y", limit = 750 }) {
      const symbol = canonicalSymbol(raw);
      const years = RANGE_YEARS[range] ?? 5;
      const lim = Math.min(Math.max(Number(limit) || 750, 50), 2500);
      const ssi = await service.getOhlcv({ symbol, range: `${years}y`, limit: lim });
      const warnings = [];
      const base = { symbol, ticker: symbol, resolution: "1D", provenance: ssi.provenance };

      if (isIndexSymbol(symbol)) {
        if (ssi.flatBars) warnings.push(`${ssi.flatBars} nến chỉ có giá đóng cửa (O=H=L=C) — chưa có nguồn tham chiếu O/H/L cho các ngày này.`);
        return { ...base, priceBasis: "INDEX_POINTS", bars: ssi.bars, corporateActions: [], quality: { flatBars: ssi.flatBars ?? 0 }, warnings };
      }

      // 1–2. Giá danh nghĩa
      let nominal = null;
      try {
        const h = await nominalHistory.get(symbol, { years: 5 });
        nominal = nominalizeBars(ssi.bars, new Map(h.bars.map((b) => [b.date, b.close])));
      } catch (error) {
        warnings.push(`Chưa có giá danh nghĩa (${error.message}) — dùng chuỗi SSI (chỉ điều chỉnh đợt quyền gần nhất).`);
      }
      if (!nominal) {
        return { ...base, priceBasis: "SSI_LATEST_EVENT_ADJUSTED", bars: ssi.bars, corporateActions: [], quality: { nominalCoverage: 0 }, warnings };
      }
      const nominalCoverage = Math.round((nominal.matched / Math.max(1, ssi.bars.filter((b) => !b.partial).length)) * 1000) / 1000;
      if (nominalCoverage < 0.95) warnings.push(`Giá danh nghĩa chỉ khớp ${Math.round(nominalCoverage * 100)}% số phiên.`);

      // 3. Sự kiện quyền
      let ca = null;
      try {
        ca = await corporateActions.get(symbol);
      } catch (error) {
        warnings.push(`Chưa tải được sự kiện quyền (${error.message}) — trả giá danh nghĩa, CHƯA điều chỉnh.`);
      }
      if (!ca) {
        return { ...base, priceBasis: "NOMINAL_UNADJUSTED", bars: nominal.bars, corporateActions: [], quality: { nominalCoverage }, warnings };
      }
      if (!ca.covered) warnings.push(`${symbol} không có trong nguồn sự kiện quyền — giả định không có sự kiện.`);
      const adj = adjustOhlcSeries(nominal.bars, ca.events);
      // Sự kiện thiếu trong nguồn / hệ số SSI lệch > 50% không khôi phục được -> khoảng cách qua đêm > 20%.
      const fix = repairUnexplainedGaps(adj.bars);
      if (fix.repaired.length) warnings.push(`Tự điều chỉnh ${fix.repaired.length} khoảng cách giá > 20% chưa có sự kiện quyền (${fix.repaired.map((x) => x.date).join(", ")}).`);
      return {
        ...base,
        priceBasis: "ADJUSTED_CUMULATIVE",
        bars: fix.bars,
        gapRepairs: fix.repaired,
        corporateActions: adj.applied,
        quality: { nominalCoverage, eventsSkipped: adj.skipped.filter((x) => x.reason !== "OUT_OF_RANGE").length, eventsSource: ca.source, eventsGeneratedAt: ca.generatedAt },
        warnings,
      };
    },
  };
}
