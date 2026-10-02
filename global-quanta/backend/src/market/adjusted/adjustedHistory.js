// Lịch sử giá DANH NGHĨA dài hạn (mặc định 5 năm) từ SSI DailyStockPrice, có kho bền vững — nguồn giá chính cho
// Timing Engine cổ tức ở Project A (Project A tự điều chỉnh bằng sự kiện quyền VCI: cổ tức tiền mặt sau thuế, thưởng CP).
//
// VÌ SAO KHÔNG TRẢ "GIÁ ĐIỀU CHỈNH" CỦA SSI (đã đối chiếu từng bản ghi gốc, 02/10/2026):
//   - ClosePriceAdjusted (và DailyOhlc suy từ nó) chỉ áp hệ số của ĐỢT GẦN NHẤT cho toàn bộ lịch sử, không cộng dồn:
//     VNM từ 10/2021 đến 25/06/2026 có Adj/Close = 0,96830 ở mọi ngày (chỉ trừ đợt 1.850đ ngày 26/06/2026).
//   - RefPrice chỉ phản ánh điều chỉnh của Sở tới khoảng cuối 2024; từ 2025 RefPrice = giá đóng cửa hôm trước kể cả
//     ngày GDKHQ (VNM 26/06/2026: 58.300 thay vì 56.450).
//   - ClosePrice (giá khớp danh nghĩa) đúng ở mọi giai đoạn -> đây là dữ liệu trả về.
// Kèm `referenceAdjustments`: các ngày RefPrice lệch cơ sở quá 1 bước giá (gợi ý sự kiện quyền — đáng tin tới ~2024)
// để Project A đối chiếu chéo với sự kiện VCI.
//
// Kho market_adjusted_series lưu giá danh nghĩa (không đổi theo thời gian) -> chỉ NỐI THÊM ngày mới (vài lượt gọi);
// lần đầu tải đủ (SSI giới hạn 30 ngày/lượt ≈ 61 lượt cho 5 năm, giới hạn 40 mã/giờ, vượt -> 503).
// Chỉ số (VNINDEX…) dùng chuỗi ngày sẵn có của Gateway.

import { MarketDataError, ValidationError } from "../errors.js";
import { canonicalSymbol, isIndexSymbol, isValidSymbol } from "../normalizer.js";
import { lastCompletedSessionDate, vnDate } from "../calendar.js";
import { addDays } from "../util.js";

export const ADJUSTED_TABLE = "market_adjusted_series";
const RECHECK_MS = 2 * 60 * 60_000;
const TAIL_DAYS = 7;

/** Bước giá HOSE theo vùng giá (HNX/UPCoM: 100đ). */
export const hoseTick = (price) => (price < 10_000 ? 10 : price < 50_000 ? 50 : 100);

const round4 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
const toTuple = (r) => [r.date, r.close, r.ref ?? null, r.avg ?? null, r.volume ?? null];
const fromTuple = ([date, close, ref, avg, volume]) => ({ date, close, ref, avg, volume });

/**
 * Gợi ý sự kiện quyền từ giá tham chiếu (hàm thuần) + chuỗi điều chỉnh lùi theo các gợi ý đó (chỉ để tham khảo/đối chiếu).
 * @param {{date, close, ref, avg, volume}[]} rows tăng dần theo ngày
 */
export function buildAdjustedFromNominal(rows) {
  const r = rows.filter((x) => x.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  // Nhận cơ sở tham chiếu theo đa số ngày: Ref_t khớp Close_{t−1} (HOSE) hay Average_{t−1} (HNX/UPCoM).
  let votesClose = 0, votesAvg = 0;
  for (let i = 1; i < r.length; i++) {
    const ref = r[i].ref;
    if (!(ref > 0)) continue;
    if (Math.abs(ref - r[i - 1].close) <= hoseTick(ref)) votesClose++;
    else if (r[i - 1].avg > 0 && Math.abs(ref - r[i - 1].avg) <= 100) votesAvg++;
  }
  const base = votesAvg > votesClose ? "avg" : "close";
  const factors = new Array(r.length).fill(1);
  const events = [];
  const anomalies = [];
  for (let i = 1; i < r.length; i++) {
    const ref = r[i].ref;
    const expected = base === "avg" ? (r[i - 1].avg > 0 ? r[i - 1].avg : r[i - 1].ref ?? r[i - 1].close) : r[i - 1].close;
    if (!(ref > 0) || !(expected > 0)) continue;
    const tol = (base === "avg" ? 100 : hoseTick(expected)) + 1e-6;
    if (Math.abs(ref - expected) <= tol) continue;
    const f = ref / expected;
    // Tham chiếu CAO hơn cơ sở hoặc giảm > 60% gần như chắc chắn là lỗi dữ liệu, không phải sự kiện quyền.
    if (f > 1 || f < 0.4) { anomalies.push({ date: r[i].date, ref, expected, factor: round4(f) }); continue; }
    factors[i] = f;
    events.push({ date: r[i].date, factor: round4(f), ref, expected });
  }
  const adj = new Array(r.length);
  let k = 1;
  for (let i = r.length - 1; i >= 0; i--) {
    adj[i] = r[i].close * k;
    k *= factors[i];
  }
  return {
    base,
    bars: r.map((x, i) => ({ date: x.date, close: x.close, adjClose: round4(adj[i]), volume: x.volume ?? null })),
    events,
    anomalies,
  };
}

export function createAdjustedHistory({ service, store, now = Date.now, fullRefetchPerHour = 40 } = {}) {
  const fullStamps = [];
  const inflight = new Map();

  function takeFullBudget() {
    const t = now();
    while (fullStamps.length && t - fullStamps[0] > 60 * 60_000) fullStamps.shift();
    if (fullStamps.length >= fullRefetchPerHour) {
      throw new MarketDataError(`Đang nạp lịch sử giá (đã dùng ${fullRefetchPerHour} lượt tải đầy đủ trong giờ) — thử lại sau.`, { kind: "transient", statusCode: 503 });
    }
    fullStamps.push(t);
  }

  async function fetchNominal(symbol, from, to) {
    const r = await service.router.run("ohlcvDaily", "getDailyStockPriceNominal", [symbol, from, to]);
    return { rows: r.data, source: r.source };
  }

  function result(symbol, rows, wantedFrom, extra) {
    const built = buildAdjustedFromNominal(rows);
    return {
      symbol, nominal: true, base: built.base,
      bars: rows.filter((b) => b.date >= wantedFrom).map((b) => ({ date: b.date, close: b.close, ref: b.ref ?? null, volume: b.volume ?? null })),
      events: built.events.filter((e) => e.date >= wantedFrom), anomalies: built.anomalies,
      ...extra,
    };
  }

  async function load(symbol, years) {
    const t = now();
    const expectedLast = lastCompletedSessionDate(new Date(t));
    const wantedFrom = addDays(vnDate(new Date(t)), -Math.round(years * 365.25));

    if (isIndexSymbol(symbol)) {
      const r = await service.getOhlcv({ symbol, from: wantedFrom, to: expectedLast });
      const bars = r.bars.filter((b) => !b.partial).map((b) => ({ date: b.date, close: b.close, ref: null, volume: b.volume ?? null }));
      return { symbol, nominal: true, index: true, base: null, bars, events: [], anomalies: [], refresh: "INDEX", source: r.provenance?.source ?? null };
    }

    const [row] = await store.selectRows(ADJUSTED_TABLE, { eq: { symbol }, limit: 1 });
    const stored = row ? (row.bars ?? []).map(fromTuple) : [];
    const coversStart = row && String(row.from_date).slice(0, 10) <= addDays(wantedFrom, 10);
    const fresh = row && row.checked_at && t - Date.parse(row.checked_at) < RECHECK_MS;
    const upToDate = row && String(row.to_date).slice(0, 10) >= expectedLast;

    if (row && coversStart && (fresh || upToDate)) {
      if (!fresh) await store.upsertRows(ADJUSTED_TABLE, [{ ...row, checked_at: new Date(t).toISOString() }], "symbol");
      return result(symbol, stored, wantedFrom, { refresh: "CACHE", source: row.source });
    }

    let rows, source, refresh;
    if (row && coversStart && stored.length) {
      // Giá danh nghĩa không đổi theo thời gian -> chỉ tải đuôi (gối vài ngày để nhận bản sửa nếu SSI có).
      const tail = await fetchNominal(symbol, addDays(stored.at(-1).date, -TAIL_DAYS), expectedLast);
      const merged = new Map(stored.map((b) => [b.date, b]));
      for (const b of tail.rows) merged.set(b.date, b);
      rows = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
      source = tail.source;
      refresh = "APPEND";
    } else {
      takeFullBudget();
      const full = await fetchNominal(symbol, wantedFrom, expectedLast);
      if (!full.rows.length) throw new MarketDataError(`SSI không trả giá cho ${symbol}.`, { kind: "transient", statusCode: 502 });
      rows = full.rows;
      source = full.source;
      refresh = "FULL";
    }
    const keep = rows.filter((b) => b.date >= addDays(wantedFrom, -10));
    await store.upsertRows(ADJUSTED_TABLE, [{
      symbol, from_date: keep[0].date, to_date: keep.at(-1).date, source, bars: keep.map(toTuple),
      checked_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
    }], "symbol");
    return result(symbol, keep, wantedFrom, { refresh, source });
  }

  return {
    /** @returns {{ symbol, nominal, index?, base, bars: {date, close, ref, volume}[], events, anomalies, refresh, source }} */
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
