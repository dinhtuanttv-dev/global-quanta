// Chuỗi giá ĐÃ ĐIỀU CHỈNH dài hạn (mặc định 5 năm) lấy từ SSI, có kho bền vững — nguồn giá chính cho
// Timing Engine cổ tức (backtest chu kỳ GDKHQ, mùa vụ KQKD) ở Project A.
//
// LOẠI ĐIỀU CHỈNH (đã kiểm trên dữ liệu thật FPT 2024, VNM 2021–2026): SSI ClosePriceAdjusted (và cả DailyOhlc)
// chỉ điều chỉnh SỰ KIỆN THAY ĐỔI SỐ CỔ PHIẾU (chia tách, thưởng, cổ tức bằng cổ phiếu) — KHÔNG điều chỉnh cổ tức
// TIỀN MẶT. Phía dùng phải tự cộng cổ tức tiền mặt (số tiền thật từ sự kiện quyền) — trả kèm `adjustment: "SPLIT_ONLY"`.
//
// Vì sao cần kho riêng: SSI DailyStockPrice chỉ cho 30 ngày/lượt -> 5 năm ≈ 61 lượt gọi/mã. Gọi lại mỗi lần
// sẽ vượt hạn mức SSI. Ở đây:
//   - lần đầu: tải đủ cửa sổ (FULL), lưu market_adjusted_series (1 dòng/mã, bars jsonb);
//   - các lần sau: chỉ tải ~40 ngày gần nhất (2 lượt) và SO PHẦN TRÙNG với kho:
//       khớp (lệch tương đối ≤ 2e-4)  -> nối thêm ngày mới (APPEND);
//       lệch                          -> hệ số điều chỉnh đã đổi (vừa GDKHQ/chia tách) -> tải lại TOÀN BỘ (FULL),
//                                        để mọi giá trong chuỗi luôn cùng một gốc điều chỉnh;
//   - đã kiểm trong 2 giờ qua -> trả kho ngay (CACHE), không gọi SSI.
// Tải FULL bị giới hạn theo giờ (mặc định 40 mã/giờ); vượt -> lỗi 503 "WARMING" để phía gọi dùng nguồn dự phòng.
// Chỉ số (VNINDEX…) không có điều chỉnh: dùng chuỗi ngày sẵn có của Gateway (kho market_ohlcv_daily).

import { MarketDataError, ValidationError } from "../errors.js";
import { canonicalSymbol, isIndexSymbol, isValidSymbol } from "../normalizer.js";
import { lastCompletedSessionDate, vnDate } from "../calendar.js";
import { addDays } from "../util.js";

export const ADJUSTED_TABLE = "market_adjusted_series";
export const MATCH_TOLERANCE = 2e-4;
const RECHECK_MS = 2 * 60 * 60_000;
const OVERLAP_DAYS = 40;

const toTuple = (b) => [b.date, round(b.adjClose), b.volume ?? null];
const fromTuple = ([date, adjClose, volume]) => ({ date, adjClose, volume });
const round = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);

/**
 * So phần trùng giữa chuỗi trong kho và chuỗi mới tải: trả về lệch tương đối lớn nhất của giá điều chỉnh
 * (null khi không có ngày trùng để so).
 */
export function maxOverlapDeviation(stored, fresh) {
  const byDate = new Map(stored.map((b) => [b.date, b.adjClose]));
  let max = null;
  for (const b of fresh) {
    const old = byDate.get(b.date);
    if (!(old > 0) || !(b.adjClose > 0)) continue;
    const dev = Math.abs(b.adjClose / old - 1);
    if (max === null || dev > max) max = dev;
  }
  return max;
}

/** Chuẩn hoá giá điều chỉnh của SSI thành {date, adjClose, volume}. */
function normalize(bars) {
  return bars
    .filter((b) => b && b.date && b.close > 0)
    .map((b) => ({ date: b.date, adjClose: b.close, volume: b.volume ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function createAdjustedHistory({ service, store, now = Date.now, fullRefetchPerHour = 40 } = {}) {
  const fullStamps = [];
  const inflight = new Map();

  function takeFullBudget() {
    const t = now();
    while (fullStamps.length && t - fullStamps[0] > 60 * 60_000) fullStamps.shift();
    if (fullStamps.length >= fullRefetchPerHour) {
      throw new MarketDataError(`Đang nạp lịch sử giá điều chỉnh (đã dùng ${fullRefetchPerHour} lượt tải đầy đủ trong giờ) — thử lại sau.`, { kind: "transient", statusCode: 503 });
    }
    fullStamps.push(t);
  }

  async function fetchAdjusted(symbol, from, to) {
    const adj = await service.router.run("ohlcvDaily", "getDailyOhlcvAdjusted", [symbol, from, to]);
    return { bars: normalize(adj.data), source: adj.source };
  }

  async function load(symbol, years) {
    const t = now();
    const expectedLast = lastCompletedSessionDate(new Date(t));
    const wantedFrom = addDays(vnDate(new Date(t)), -Math.round(years * 365.25));

    if (isIndexSymbol(symbol)) {
      const r = await service.getOhlcv({ symbol, from: wantedFrom, to: expectedLast });
      const bars = r.bars.filter((b) => !b.partial).map((b) => ({ date: b.date, adjClose: b.close, volume: b.volume ?? null }));
      return { symbol, adjusted: false, bars, refresh: "INDEX", source: r.provenance?.source ?? null };
    }

    const [row] = await store.selectRows(ADJUSTED_TABLE, { eq: { symbol }, limit: 1 });
    const stored = row ? (row.bars ?? []).map(fromTuple) : [];
    const coversStart = row && String(row.from_date).slice(0, 10) <= addDays(wantedFrom, 10);
    const fresh = row && row.checked_at && t - Date.parse(row.checked_at) < RECHECK_MS;
    const upToDate = row && String(row.to_date).slice(0, 10) >= expectedLast;

    if (row && coversStart && (fresh || upToDate)) {
      if (!fresh) await store.upsertRows(ADJUSTED_TABLE, [{ ...row, checked_at: new Date(t).toISOString() }], "symbol");
      return { symbol, adjusted: true, bars: stored.filter((b) => b.date >= wantedFrom), refresh: "CACHE", source: row.source };
    }

    let refresh = "FULL";
    let bars = null, source = null, deviation = null;
    if (row && coversStart && stored.length) {
      const tail = await fetchAdjusted(symbol, addDays(stored.at(-1).date, -OVERLAP_DAYS), expectedLast);
      deviation = maxOverlapDeviation(stored, tail.bars);
      if (deviation !== null && deviation <= MATCH_TOLERANCE) {
        const merged = new Map(stored.map((b) => [b.date, b]));
        for (const b of tail.bars) merged.set(b.date, b);
        bars = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
        source = tail.source;
        refresh = "APPEND";
      }
    }
    if (!bars) {
      takeFullBudget();
      const full = await fetchAdjusted(symbol, wantedFrom, expectedLast);
      if (!full.bars.length) throw new MarketDataError(`SSI không trả giá điều chỉnh cho ${symbol}.`, { kind: "transient", statusCode: 502 });
      bars = full.bars;
      source = full.source;
    }
    const keep = bars.filter((b) => b.date >= addDays(wantedFrom, -10));
    await store.upsertRows(ADJUSTED_TABLE, [{
      symbol, from_date: keep[0].date, to_date: keep.at(-1).date, source, bars: keep.map(toTuple),
      checked_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
    }], "symbol");
    return { symbol, adjusted: true, bars: keep.filter((b) => b.date >= wantedFrom), refresh, source, basisChanged: refresh === "FULL" && Boolean(row), deviation };
  }

  return {
    /**
     * @returns {{ symbol, adjusted, bars: {date, adjClose, volume}[], refresh: "CACHE"|"APPEND"|"FULL"|"INDEX", source, basisChanged? }}
     */
    async get(rawSymbol, { years = 5 } = {}) {
      const symbol = canonicalSymbol(rawSymbol);
      if (!symbol || !isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
      const y = Math.min(10, Math.max(1, Number(years) || 5));
      const key = `${symbol}:${y}`;
      if (!inflight.has(key)) inflight.set(key, load(symbol, y).finally(() => inflight.delete(key)));
      return inflight.get(key);
    },
  };
}
