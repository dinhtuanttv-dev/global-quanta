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
/**
 * MV0 (25/10/2026): mốc "đã hỏi nguồn tới ngày X" theo mã — KV chỉ ở Railway Volume. Mã niêm yết sau ngày yêu cầu (hoặc nguồn
 * không có dữ liệu sớm hơn) trước đây KHÔNG BAO GIỜ được coi là phủ đủ -> mỗi lần gọi lại tải đầy đủ, đốt ngân sách 40 lượt/giờ.
 */
export const requestedFromKv = (symbol) => `local:adjhist:requested-from:${symbol}`;
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

/** MV0b: mã mà SSI không trả được lịch sử (lỗi / rỗng) -> không thử tải đầy đủ lại trong 6 giờ (trước đây mỗi lần gọi mất 1 lượt). */
export const FULL_FAIL_COOLDOWN_MS = 6 * 60 * 60_000;

/** Nơi gọi = frame đầu tiên NGOÀI thư mục adjusted/ trong async stack của V8 (VD "cycles/cycleService.js:139"). */
export function callerFromStack(stack = new Error().stack ?? "") {
  for (const line of stack.split("\n").slice(1)) {
    const m = /(?:market|routes)[\\/]((?:[\w.-]+[\\/])*[\w.-]+\.js):(\d+)/.exec(line);
    if (m && !/^adjusted[\\/]/.test(m[1])) return `${m[1].replace(/\\/g, "/")}:${m[2]}`;
  }
  return "unknown";
}

export function createAdjustedHistory({ service, store, now = Date.now, fullRefetchPerHour = 40 } = {}) {
  const fullStamps = [];
  const inflight = new Map();
  // MV0b (25/10/2026): nhật ký lượt tải đầy đủ (ai gọi, mã, số năm, kết quả) — tìm nơi đốt ngân sách 40 lượt/giờ dùng chung.
  const fullLog = [];
  const failUntil = new Map();
  const stats = { full: 0, fullFailed: 0, budgetRejected: 0, cooldownRejected: 0, cache: 0, append: 0 };
  const note = (e) => { fullLog.push(e); if (fullLog.length > 300) fullLog.shift(); };

  function takeFullBudget(symbol, years, caller) {
    const t = now();
    while (fullStamps.length && t - fullStamps[0] > 60 * 60_000) fullStamps.shift();
    if ((failUntil.get(symbol) ?? 0) > t) {
      stats.cooldownRejected++;
      throw new MarketDataError(`SSI chưa trả được lịch sử giá ${symbol} (thử lại sau ${new Date(failUntil.get(symbol)).toISOString().slice(11, 16)} UTC).`, { kind: "transient", statusCode: 503 });
    }
    if (fullStamps.length >= fullRefetchPerHour) {
      stats.budgetRejected++;
      note({ at: new Date(t).toISOString(), symbol, years, caller, outcome: "BUDGET" });
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

  async function load(symbol, years, caller) {
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
    const askedFrom = row ? (await store.getKv(requestedFromKv(symbol)).catch(() => null))?.value ?? null : null;
    const coversStart = row && (String(row.from_date).slice(0, 10) <= addDays(wantedFrom, 10) || (askedFrom && askedFrom <= wantedFrom));
    const fresh = row && row.checked_at && t - Date.parse(row.checked_at) < RECHECK_MS;
    const upToDate = row && String(row.to_date).slice(0, 10) >= expectedLast;

    if (row && coversStart && (fresh || upToDate)) {
      if (!fresh) await store.upsertRows(ADJUSTED_TABLE, [{ ...row, checked_at: new Date(t).toISOString() }], "symbol");
      stats.cache++;
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
      stats.append++;
    } else {
      takeFullBudget(symbol, years, caller);
      let full;
      try {
        full = await fetchNominal(symbol, wantedFrom, expectedLast);
        if (!full.rows.length) throw new MarketDataError(`SSI không trả giá cho ${symbol}.`, { kind: "transient", statusCode: 502 });
      } catch (e) {
        stats.fullFailed++; failUntil.set(symbol, now() + FULL_FAIL_COOLDOWN_MS);
        note({ at: new Date(t).toISOString(), symbol, years, caller, outcome: "FAILED", error: String(e?.message ?? e).slice(0, 120) });
        throw e;
      }
      stats.full++; failUntil.delete(symbol);
      note({ at: new Date(t).toISOString(), symbol, years, caller, outcome: "FULL", bars: full.rows.length, from: full.rows[0]?.date ?? null, hadRow: Boolean(row), storedFrom: row?.from_date ?? null });
      rows = full.rows;
      source = full.source;
      refresh = "FULL";
    }
    // MV0: KHÔNG cắt lịch sử đã lưu theo yêu cầu hiện tại. Trước đây yêu cầu 5 năm (nhánh APPEND) cắt mất phần cũ mà yêu cầu 10 năm
    // vừa tải -> yêu cầu 10 năm kế tiếp lại tải đầy đủ (ping-pong), cạn 40 lượt/giờ dùng chung. Giữ tối đa 10 năm + 30 ngày.
    const floor = addDays(vnDate(new Date(t)), -Math.round(10 * 365.25) - 30);
    const keepFrom = refresh === "FULL" ? addDays(wantedFrom, -10) : [addDays(wantedFrom, -10), stored[0]?.date ?? wantedFrom].sort()[0];
    const keep = rows.filter((b) => b.date >= (keepFrom > floor ? keepFrom : floor));
    if (refresh === "FULL" && (!askedFrom || wantedFrom < askedFrom)) await store.setKv(requestedFromKv(symbol), wantedFrom).catch(() => {});
    await store.upsertRows(ADJUSTED_TABLE, [{
      symbol, from_date: keep[0].date, to_date: keep.at(-1).date, source, bars: keep.map(toTuple),
      checked_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
    }], "symbol");
    return result(symbol, keep, wantedFrom, { refresh, source });
  }

  return {
    /** @returns {{ symbol, nominal, index?, base, bars: {date, close, ref, volume}[], events, anomalies, refresh, source }} */
    /** MV0b: ngân sách tải đầy đủ còn lại + nhật ký (theo nơi gọi) — GET /api/market/ohlcv/nominal-history/status. */
    status() {
      const t = now();
      const hour = fullLog.filter((e) => t - Date.parse(e.at) < 60 * 60_000);
      const by = (k) => hour.reduce((m, e) => ({ ...m, [`${e[k]}`]: (m[`${e[k]}`] ?? 0) + 1 }), {});
      return {
        perHour: fullRefetchPerHour, usedLastHour: fullStamps.filter((s) => t - s < 60 * 60_000).length, ...stats,
        coolingDown: [...failUntil].filter(([, u]) => u > t).map(([s]) => s),
        lastHour: { byCaller: by("caller"), byOutcome: by("outcome"), byYears: by("years") },
        recent: fullLog.slice(-60).reverse(),
      };
    },
    async get(rawSymbol, { years = 5, caller = null } = {}) {
      caller ??= callerFromStack();
      const symbol = canonicalSymbol(rawSymbol);
      if (!symbol || !isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
      const y = Math.min(10, Math.max(1, Number(years) || 5));
      const key = `${symbol}:${y}`;
      if (!inflight.has(key)) inflight.set(key, load(symbol, y, caller).finally(() => inflight.delete(key)));
      return inflight.get(key);
    },
  };
}
