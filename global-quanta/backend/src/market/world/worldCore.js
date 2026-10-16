// Lõi Kết nối thế giới (chạy trong worker thread, hoặc trực tiếp trong test) — engine world của gói macro-center 1.2.
// KHÔNG trộn thật/mô phỏng:
//   - "real": có dữ liệu ngày thật (thị trường + ngành, >= MIN_DAYS phiên). Ma trận/kịch bản cần thêm >= 60 tháng chung của
//     yếu tố thế giới và ngành — thiếu thì API trả 422 đúng nghĩa (không lấp bằng số mô phỏng).
//   - "synthetic": chưa có dữ liệu ngày thật -> bộ mô phỏng của gói + WORLD_SYNTHETIC_NOTICE trên mọi phản hồi.
import {
  createWorldApi, makeSyntheticWorld, InMemoryVintageStore, WORLD_CATALOG, WORLD_SYNTHETIC_NOTICE, validateWorldEvent,
  VN_SECTORS, WORLD_MARKETS, WORLD_FACTOR_IDS,
} from "../macro/vendor/macroEngine.mjs";

export const MIN_DAYS = 300;
export const MIN_MONTHS = 60;
const STALE_GRACE_MONTHS = 3;
const META = new Map(WORLD_CATALOG.map((m) => [m.id, m]));
const monthsBetween = (a, b) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

/** Độ phủ tháng của các chuỗi world (yếu tố + ngành); chuỗi ngừng cập nhật bị loại khỏi engine. */
export function worldCoverage(observations, todayIso) {
  const nowPeriod = todayIso.slice(0, 7);
  const by = new Map();
  for (const o of observations) {
    const s = by.get(o.seriesId) ?? { periods: new Set(), sources: new Set() };
    s.periods.add(o.period);
    if (o.source) s.sources.add(o.source);
    by.set(o.seriesId, s);
  }
  const row = (id, role) => {
    const s = by.get(id);
    const periods = s ? [...s.periods].sort() : [];
    const last = periods.at(-1) ?? null;
    const stale = last != null && monthsBetween(last, nowPeriod) > (META.get(id)?.pubLagMonths ?? 0) + 1 + STALE_GRACE_MONTHS;
    return { id, nameVi: META.get(id)?.nameVi ?? id, role, n: periods.length, first: periods[0] ?? null, last, stale, sources: s ? [...s.sources] : [], usable: periods.length >= MIN_MONTHS && !stale };
  };
  return [...WORLD_FACTOR_IDS.map((id) => row(id, "factor")), ...VN_SECTORS.map((s) => row(s.id, "sector"))];
}

/** Kiểm tra sự kiện bằng validator của gói; bản ghi lỗi không vào hệ thống (ghi lý do). */
export function screenEvents(events) {
  const accepted = [];
  const rejected = [];
  for (const e of events ?? []) {
    const errors = validateWorldEvent(e);
    if (errors.length) rejected.push({ id: e?.id ?? "?", errors });
    else accepted.push(e);
  }
  return { accepted, rejected };
}

function dailyOk(daily) {
  if (!daily?.tradingDays?.length || daily.tradingDays.length < MIN_DAYS) return false;
  const n = daily.tradingDays.length;
  return WORLD_MARKETS.every((m) => daily.markets?.[m.id]?.length === n) && VN_SECTORS.every((s) => daily.sectors?.[s.id]?.length === n);
}

export function createWorldCore({ today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) } = {}) {
  let state = null;

  function build(payload) {
    const daily = payload?.daily ?? null;
    if (!dailyOk(daily)) {
      const syn = makeSyntheticWorld();
      const api = createWorldApi({ world: syn.data, store: syn.store, catalog: syn.catalog, today, notice: WORLD_SYNTHETIC_NOTICE });
      state = { mode: "synthetic", api, coverage: [], events: { accepted: syn.data.events.length, rejected: [] }, meta: payload?.meta ?? null };
      return;
    }
    const observations = payload.observations ?? [];
    const coverage = worldCoverage(observations, today());
    const stale = new Set(coverage.filter((c) => c.stale).map((c) => c.id));
    const store = new InMemoryVintageStore();
    const fresh = observations.filter((o) => !stale.has(o.seriesId));
    if (fresh.length) store.upsert(fresh.map(({ seriesId, period, value, asOf }) => ({ seriesId, period, value, asOf })));
    const ev = screenEvents(payload.events);
    const world = {
      tradingDays: daily.tradingDays, markets: daily.markets, sectors: daily.sectors, events: ev.accepted,
      plantedEventEffects: {}, exposures: [], stockBetas: {},
    };
    const api = createWorldApi({ world, store, catalog: WORLD_CATALOG, today });
    state = { mode: "real", api, coverage, events: { accepted: ev.accepted.length, rejected: ev.rejected }, meta: payload.meta ?? null };
  }
  build(null);

  return {
    setData(payload) {
      build(payload);
      return this.source();
    },
    source() {
      return {
        mode: state.mode,
        notice: state.mode === "synthetic" ? WORLD_SYNTHETIC_NOTICE : null,
        minMonths: MIN_MONTHS,
        coverage: state.coverage,
        events: state.events,
        meta: state.meta,
      };
    },
    async handle(req) {
      const r = await state.api.handle(req);
      // Hồ sơ cổ phiếu cần phơi nhiễm doanh thu từ BCTC (chưa có nguồn có sourceRef) -> nói rõ thay vì "không có cổ phiếu".
      if (state.mode === "real" && r.status === 404 && /^\/api\/world\/stock\//.test(req.path)) {
        return { status: 422, body: { error: "Chưa có dữ liệu phơi nhiễm (doanh thu theo vùng, tỷ trọng chi phí hàng hoá, ngoại tệ) có nguồn BCTC cho mã này — hồ sơ cổ phiếu chưa khả dụng." } };
      }
      return r;
    },
  };
}
