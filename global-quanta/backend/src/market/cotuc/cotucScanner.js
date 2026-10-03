// Quét LIÊN TỤC cho tab Cổ tức trên toàn danh mục Siêu Quét AI (~300 mã).
//
// Mọi phép tính nằm ở Project A (một nguồn sự thật, không sao chép thuật toán sang đây); Gateway chạy thường trực
// (Railway) nên đảm nhận việc GỌI XOAY VÒNG các cron theo lô mà Vercel Hobby không tự lặp được:
//   - timing-signals-scan?offset&limit — quyết định 3 trạng thái + theo dõi tín hiệu, có giá trong phiên.
//     Trong phiên khớp lệnh: mỗi MARKET_COTUC_SESSION_EVERY_MS (mặc định 3 phút, 25 mã/lô -> ~36 phút một vòng 281 mã).
//     Ngoài phiên: mỗi MARKET_COTUC_OFFHOURS_EVERY_MS (mặc định 15 phút) để chốt theo giá đóng cửa và bắt thông báo GDKHQ mới.
//   - earnings-seasonality-scan?phase=collect (3 mã/lô, mỗi 2 phút) trong khung 18:00–06:30 rồi phase=finalize — mỗi đêm một vòng.
// Lỗi một lô: giữ offset để thử lại; lỗi 3 lần liên tiếp cùng lô thì bỏ qua lô đó (ghi lại) để vòng quét không kẹt.
// Trạng thái (offset, số vòng) lưu KV để khởi động lại không quét lại từ đầu.

import { expectsLiveTicks, vnDate, vnParts } from "../calendar.js";

export const COTUC_SCAN_KV = "cotuc:scan";

export function cotucScanConfig(env = process.env) {
  const num = (k, d) => (Number(env[k]) > 0 ? Number(env[k]) : d);
  const secret = env.PROJECT_A_CRON_SECRET || "";
  return {
    base: (env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""),
    secret,
    enabled: String(env.MARKET_COTUC_SCAN_ENABLED ?? "true").toLowerCase() !== "false" && secret.length > 0,
    sessionEveryMs: num("MARKET_COTUC_SESSION_EVERY_MS", 180_000),
    offHoursEveryMs: num("MARKET_COTUC_OFFHOURS_EVERY_MS", 900_000),
    seasonEveryMs: num("MARKET_COTUC_SEASON_EVERY_MS", 120_000),
    timingLimit: num("MARKET_COTUC_TIMING_LIMIT", 25),
    seasonLimit: num("MARKET_COTUC_SEASON_LIMIT", 3),
    tickMs: num("MARKET_COTUC_TICK_MS", 30_000),
    requestTimeoutMs: num("MARKET_COTUC_TIMEOUT_MS", 290_000),
  };
}

/** Khung chạy mùa vụ KQKD (nặng: 10 năm giá + BCTC): 18:00 → 06:30 giờ VN. */
export function inSeasonalityWindow(date) {
  const { minutes } = vnParts(date);
  return minutes >= 18 * 60 || minutes < 6 * 60 + 30;
}

const MAX_RETRIES_PER_BATCH = 3;

function emptyLane() {
  return { offset: 0, total: null, batches: 0, passes: 0, lastBatchAt: null, lastPassAt: null, lastResult: null, lastError: null, failStreak: 0, skipped: [] };
}

export function createCotucScanner({ store, fetchImpl = globalThis.fetch, now = Date.now, config = cotucScanConfig() } = {}) {
  const state = { timing: emptyLane(), seasonality: { ...emptyLane(), lastFinalizeAt: null }, busy: false, startedAt: null, loaded: false };
  let timer;

  async function call(path) {
    const res = await fetchImpl(`${config.base}${path}`, {
      headers: { authorization: `Bearer ${config.secret}`, accept: "application/json" },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}${body?.error ? `: ${body.error}` : ""}`);
    return body ?? {};
  }

  async function persist() {
    try {
      await store?.setKv?.(COTUC_SCAN_KV, {
        timing: { offset: state.timing.offset, passes: state.timing.passes, lastPassAt: state.timing.lastPassAt },
        seasonality: { offset: state.seasonality.offset, passes: state.seasonality.passes, lastPassAt: state.seasonality.lastPassAt, lastFinalizeAt: state.seasonality.lastFinalizeAt },
      });
    } catch { /* KV lỗi không được làm dừng vòng quét */ }
  }

  async function load() {
    if (state.loaded) return;
    state.loaded = true;
    try {
      const v = (await store?.getKv?.(COTUC_SCAN_KV))?.value;
      if (v?.timing) Object.assign(state.timing, { offset: v.timing.offset ?? 0, passes: v.timing.passes ?? 0, lastPassAt: v.timing.lastPassAt ?? null });
      if (v?.seasonality) Object.assign(state.seasonality, v.seasonality);
    } catch { /* bắt đầu lại từ 0 */ }
  }

  function onFailure(lane, error, limit) {
    lane.lastError = { at: new Date(now()).toISOString(), offset: lane.offset, message: String(error?.message ?? error).slice(0, 300) };
    lane.failStreak += 1;
    if (lane.failStreak >= MAX_RETRIES_PER_BATCH) {
      lane.skipped = [...lane.skipped, lane.offset].slice(-20);
      lane.offset = lane.total && lane.offset + limit < lane.total ? lane.offset + limit : 0;
      lane.failStreak = 0;
    }
  }

  async function runTiming() {
    const lane = state.timing;
    const at = new Date(now()).toISOString();
    lane.lastBatchAt = at;
    try {
      const r = await call(`/api/cron/timing-signals-scan?offset=${lane.offset}&limit=${config.timingLimit}`);
      lane.batches += 1;
      lane.failStreak = 0;
      lane.total = r.totalTickers ?? lane.total;
      lane.lastResult = {
        at, offset: r.offset ?? lane.offset, processed: r.processedInThisCall ?? null, decisions: r.decisionCount ?? null,
        levels: r.levels ?? null, regime: r.regime ?? null, liveQuotes: r.intraday?.quotes ?? null, issued: r.issuedCount ?? 0,
        resolved: r.resolvedCount ?? 0, errors: Array.isArray(r.errors) ? r.errors.length : 0,
      };
      const next = Number.isInteger(r.nextOffset) ? r.nextOffset : 0;
      if (next === 0) { lane.passes += 1; lane.lastPassAt = at; }
      lane.offset = next;
    } catch (e) {
      onFailure(lane, e, config.timingLimit);
    }
    await persist();
  }

  async function runSeasonality() {
    const lane = state.seasonality;
    const at = new Date(now()).toISOString();
    lane.lastBatchAt = at;
    try {
      const r = await call(`/api/cron/earnings-seasonality-scan?phase=collect&offset=${lane.offset}&limit=${config.seasonLimit}`);
      lane.batches += 1;
      lane.failStreak = 0;
      lane.total = r.totalTickers ?? lane.total;
      const collected = Array.isArray(r.collected) ? r.collected : [];
      lane.lastResult = { at, offset: lane.offset, ok: collected.filter((c) => c.ok).length, failed: collected.filter((c) => !c.ok).length };
      const next = Number.isInteger(r.nextOffset) ? r.nextOffset : 0;
      lane.offset = next;
      if (next === 0) {
        const f = await call("/api/cron/earnings-seasonality-scan?phase=finalize");
        lane.passes += 1;
        lane.lastPassAt = at;
        lane.lastFinalizeAt = new Date(now()).toISOString();
        lane.lastResult = { ...lane.lastResult, finalized: f.finalized ?? null };
      }
    } catch (e) {
      onFailure(lane, e, config.seasonLimit);
    }
    await persist();
  }

  /** Một nhịp: tối đa MỘT lô (tuần tự, không chồng request). Trả tên việc đã chạy hoặc null. */
  async function tick() {
    if (!config.enabled || state.busy) return null;
    state.busy = true;
    try {
      await load();
      const t = now();
      const date = new Date(t);
      const live = expectsLiveTicks(date);
      const timingEvery = live ? config.sessionEveryMs : config.offHoursEveryMs;
      const lastT = state.timing.lastBatchAt ? Date.parse(state.timing.lastBatchAt) : 0;
      if (t - lastT >= timingEvery) { await runTiming(); return "timing"; }
      if (!live && inSeasonalityWindow(date)) {
        const s = state.seasonality;
        // Đang giữa vòng (offset > 0) thì đi tiếp; vòng mới chỉ bắt đầu nếu vòng trước đã xong > 18 giờ.
        const fresh = s.lastPassAt && t - Date.parse(s.lastPassAt) < 18 * 3_600_000;
        const lastS = s.lastBatchAt ? Date.parse(s.lastBatchAt) : 0;
        if ((s.offset > 0 || !fresh) && t - lastS >= config.seasonEveryMs) { await runSeasonality(); return "seasonality"; }
      }
      return null;
    } finally {
      state.busy = false;
    }
  }

  return {
    start() {
      if (!config.enabled || timer) return;
      state.startedAt = new Date(now()).toISOString();
      timer = setInterval(() => { void tick(); }, config.tickMs);
      timer.unref?.();
      void tick();
    },
    stop() { clearInterval(timer); timer = undefined; },
    tick,
    status() {
      const date = new Date(now());
      const lane = (l) => ({
        offset: l.offset, total: l.total, batches: l.batches, passes: l.passes, lastBatchAt: l.lastBatchAt, lastPassAt: l.lastPassAt,
        lastResult: l.lastResult, lastError: l.lastError, skippedOffsets: l.skipped,
        progress: l.total ? Math.min(1, l.offset / l.total) : null,
      });
      return {
        enabled: config.enabled,
        reason: config.enabled ? null : config.secret ? "MARKET_COTUC_SCAN_ENABLED=false" : "Thiếu PROJECT_A_CRON_SECRET",
        startedAt: state.startedAt,
        mode: expectsLiveTicks(date) ? "SESSION" : "OFF_HOURS",
        vnDate: vnDate(date),
        intervals: { sessionMs: config.sessionEveryMs, offHoursMs: config.offHoursEveryMs, seasonalityMs: config.seasonEveryMs, timingLimit: config.timingLimit, seasonLimit: config.seasonLimit },
        running: state.busy,
        timing: lane(state.timing),
        seasonality: { ...lane(state.seasonality), lastFinalizeAt: state.seasonality.lastFinalizeAt ?? null },
      };
    },
  };
}
