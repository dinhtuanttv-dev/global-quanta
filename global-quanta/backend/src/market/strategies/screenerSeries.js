// Chuỗi giá cho bộ lọc kỹ thuật lúc QUÉT — KHÔNG gọi SSI (Screener Engine v2 / S1).
//
// Cùng cơ sở giá với /api/market/ta-series (ADJUSTED_CUMULATIVE) nhưng chỉ đọc kho:
//   1. Lịch sử: market_ohlcv_daily (SSI DailyOhlc, mỗi nến đã bị nhân hệ số đợt quyền gần nhất)
//      -> khôi phục OHLC danh nghĩa bằng giá đóng cửa danh nghĩa market_adjusted_series (nominalizeBars).
//   2. Phiên gần đây: market_daily (đồng bộ cả universe lúc 15:20, giá DANH NGHĨA) ghi đè cùng ngày —
//      kho nến (1) chỉ được nối đuôi khi có người xem mã, nên phần cuối thường thiếu.
//   3. Điều chỉnh lùi cộng dồn theo sự kiện quyền (Project A) — adjustOhlcSeries.
// Lịch sử còn thiếu được job backfillScreenerHistory nạp từ SSI ban đêm.

import { ADJUSTED_TABLE } from "../adjusted/adjustedHistory.js";
import { adjustOhlcSeries, repairUnexplainedGaps } from "../adjusted/corporateActions.js";
import { nominalizeBars } from "../adjusted/taSeries.js";
import { addDays } from "../util.js";

const MIN_NOMINAL_COVERAGE = 0.9;

export function createScreenerSeries({ store, corporateActions, historyDays = 1096 }) {
  return {
    /**
     * Tải một lần phần market_daily cho cả danh sách mã, trả hàm loadSeries(symbol).
     * @param symbols  mã universe
     * @param asOf     ngày cuối (YYYY-MM-DD) — mặc định ngày gần nhất có trong market_daily
     */
    async prepare(symbols, { asOf } = {}) {
      const dates = await store.getMarketDailyDates();
      const to = asOf ?? dates.at(-1);
      if (!to) throw Object.assign(new Error("Chưa có dữ liệu thị trường ngày (market_daily)."), { statusCode: 503 });
      const from = addDays(to, -historyDays);
      const recentFrom = dates.find((d) => d >= from) ?? to;
      const daily = new Map();
      for (const row of await store.getMarketDailyRange({ from: recentFrom, to, symbols })) {
        if (!(row.close > 0)) continue;
        if (!daily.has(row.symbol)) daily.set(row.symbol, []);
        daily.get(row.symbol).push({
          date: row.date, open: row.open || row.close, high: row.high || row.close, low: row.low || row.close, close: row.close,
          volume: row.volume ?? 0, value: row.value ?? null,
          foreignNet: Number.isFinite(row.foreignBuyVal) && Number.isFinite(row.foreignSellVal) ? row.foreignBuyVal - row.foreignSellVal : null,
        });
      }

      const loadSeries = async function loadSeries(symbol) {
        const [history, adjRows, ca] = await Promise.all([
          store.getBars(symbol, from, to),
          store.selectRows(ADJUSTED_TABLE, { eq: { symbol }, limit: 1 }),
          corporateActions.get(symbol).catch(() => null),
        ]);
        const nominalByDate = new Map((adjRows?.[0]?.bars ?? []).map(([d, c]) => [d, c]));
        const nominal = nominalizeBars(history.map(({ source, ...b }) => b), nominalByDate);
        const coverage = history.length ? nominal.matched / history.length : 1;

        const byDate = new Map(nominal.bars.map((b) => [b.date, b]));
        for (const b of daily.get(symbol) ?? []) byDate.set(b.date, b); // danh nghĩa của sàn thắng
        const bars = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

        const warnings = [];
        // Sự kiện quyền thiếu / hệ số không khôi phục được -> khoảng cách qua đêm > 20%: điều chỉnh lùi theo khoảng cách.
        const finish = (list, priceBasis, extra = {}) => {
          const fix = repairUnexplainedGaps(list);
          if (fix.repaired.length) warnings.push(`Tự điều chỉnh ${fix.repaired.length} khoảng cách giá > 20% chưa có sự kiện quyền (${fix.repaired.map((x) => x.date).join(", ")}).`);
          return { bars: fix.bars, priceBasis, gapRepairs: fix.repaired, warnings, ...extra };
        };
        if (coverage < MIN_NOMINAL_COVERAGE) {
          warnings.push(`Giá danh nghĩa chỉ khớp ${Math.round(coverage * 100)}% số phiên lịch sử.`);
          // Không khôi phục được danh nghĩa -> điều chỉnh thêm theo sự kiện sẽ nhân đôi hệ số đợt quyền gần nhất.
          return finish(bars, "SSI_LATEST_EVENT_ADJUSTED");
        }
        if (!ca) { warnings.push("Chưa tải được sự kiện quyền."); return finish(bars, "NOMINAL_UNADJUSTED"); }
        const adj = adjustOhlcSeries(bars, ca.events);
        return finish(adj.bars, "ADJUSTED_CUMULATIVE", { events: adj.applied.length });
      };
      // VN-Index (điểm chỉ số) cho yếu tố M — kho nến được job nghiên cứu / biểu đồ cập nhật hằng ngày.
      loadSeries.index = (code = "VNINDEX") => store.getBars(code, from, to);
      return loadSeries;
    },
  };
}
