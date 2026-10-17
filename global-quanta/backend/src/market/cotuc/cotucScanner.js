// Quét cho tab Cổ tức trên toàn danh mục Siêu Quét AI (~300 mã).
//
// Mọi phép tính nằm ở Project A (một nguồn sự thật, không sao chép thuật toán sang đây); Gateway chạy thường trực
// (Railway) nên đảm nhận việc GỌI các cron theo lô mà Vercel Hobby không tự lặp được.
//
// N1 (2026-10-17) — QUÉT THEO ĐỢT để cơ sở dữ liệu Neon của Project A được ngủ: Neon tính hạn mức theo thời gian compute
// thức và chỉ ngủ sau 5 phút không có truy vấn. Lịch cũ (3 phút/lô trong phiên, 15 phút ngoài phiên, 2 phút/lô mùa vụ
// suốt 18:00–06:30) giữ Neon thức 24/7 -> hết hạn mức gói miễn phí giữa tháng (10/2026). Lịch mới: chạy LIỀN MẠCH một
// vòng (các lô nối nhau mỗi nhịp) rồi nghỉ hẳn:
//   - timing-signals-scan?offset&limit — quyết định 3 trạng thái + theo dõi tín hiệu, có giá trong phiên.
//     Trong phiên: một vòng mỗi MARKET_COTUC_SESSION_PASS_EVERY_MS (mặc định 60 phút).
//     Ngoài phiên: một vòng tại các mốc MARKET_COTUC_OFFHOURS_SLOTS giờ VN (mặc định 08:00 bắt GDKHQ mới, 15:05 chốt giá đóng cửa).
//   - earnings-seasonality-scan?phase=collect (3 mã/lô, nối liền) trong khung MARKET_COTUC_SEASON_WINDOW (mặc định 05:00–08:45 VN,
//     trùng cụm cron đêm của Vercel 22:00–23:45 UTC để dùng chung một lần Neon thức) rồi phase=finalize — mỗi ngày một vòng.
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
    sessionPassEveryMs: num("MARKET_COTUC_SESSION_PASS_EVERY_MS", 3_600_000),
    offHoursSlots: parseSlots(env.MARKET_COTUC_OFFHOURS_SLOTS ?? "08:00,15:05"),
    seasonWindow: parseWindow(env.MARKET_COTUC_SEASON_WINDOW ?? "05:00-08:45"),
    timingLimit: num("MARKET_COTUC_TIMING_LIMIT", 25),
    seasonLimit: num("MARKET_COTUC_SEASON_LIMIT", 3),
    tickMs: num("MARKET_COTUC_TICK_MS", 30_000),
    requestTimeoutMs: num("MARKET_COTUC_TIMEOUT_MS", 290_000),
  };
}

const hm = (x) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(x).trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function parseSlots(v) { return String(v).split(",").map(hm).filter((x) => x != null).sort((a, b) => a - b); }
function parseWindow(v) { const [a, b] = String(v).split("-").map(hm); return a != null && b != null ? [a, b] : [5 * 60, 8 * 60 + 45]; }

/** Khung chạy mùa vụ KQKD (nặng: 10 năm giá + BCTC), phút giờ VN [từ, đến) — hỗ trợ khung qua nửa đêm. */
export function inSeasonalityWindow(date, window = [5 * 60, 8 * 60 + 45]) {
  const { minutes } = vnParts(date);
  const [a, b] = window;
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** Mốc ngoài phiên gần nhất đã qua (epoch ms), xét hôm nay rồi hôm qua theo giờ VN. */
export function lastSlotAt(t, slots) {
  const VN = 7 * 3_600_000;
  const dayStart = Math.floor((t + VN) / 86_400_000) * 86_400_000 - VN;
  for (const base of [dayStart, dayStart - 86_400_000]) {
    for (const m of [...slots].reverse()) { const at = base + m * 60_000; if (at <= t) return at; }
  }
  return null;
}

const MAX_RETRIES_PER_BATCH = 3;

function emptyLane() {
  return { offset: 0, total: null, batches: 0, passes: 0, lastBatchAt: null, lastPassAt: null, lastResult: null, lastError: null, failStreak: 0, skipped: [], passActive: false, passStartedAt: null };
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
        timing: { offset: state.timing.offset, passes: state.timing.passes, lastPassAt: state.timing.lastPassAt, passActive: state.timing.passActive, passStartedAt: state.timing.passStartedAt },
        seasonality: { offset: state.seasonality.offset, passes: state.seasonality.passes, lastPassAt: state.seasonality.lastPassAt, lastFinalizeAt: state.seasonality.lastFinalizeAt },
      });
    } catch { /* KV lỗi không được làm dừng vòng quét */ }
  }

  async function load() {
    if (state.loaded) return;
    state.loaded = true;
    try {
      const v = (await store?.getKv?.(COTUC_SCAN_KV))?.value;
      if (v?.timing) Object.assign(state.timing, { offset: v.timing.offset ?? 0, passes: v.timing.passes ?? 0, lastPassAt: v.timing.lastPassAt ?? null, passActive: !!v.timing.passActive, passStartedAt: v.timing.passStartedAt ?? null });
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
      if (lane.offset === 0) lane.passActive = false; // bỏ lô cuối = hết vòng
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
      if (next === 0) { lane.passes += 1; lane.lastPassAt = at; lane.passActive = false; }
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
      const tl = state.timing;
      if (!tl.passActive) {
        const started = tl.passStartedAt ? Date.parse(tl.passStartedAt) : 0;
        const due = live ? t - started >= config.sessionPassEveryMs : (lastSlotAt(t, config.offHoursSlots) ?? -Infinity) > started;
        if (due) { tl.passActive = true; tl.passStartedAt = date.toISOString(); }
      }
      // Một vòng đang chạy: lô kế tiếp ngay ở nhịp này (các lô nối liền, rồi Neon được ngủ tới vòng sau).
      if (tl.passActive) { await runTiming(); return "timing"; }
      if (!live && inSeasonalityWindow(date, config.seasonWindow)) {
        const s = state.seasonality;
        // Đang giữa vòng (offset > 0) thì đi tiếp; vòng mới chỉ bắt đầu nếu vòng trước đã xong > 18 giờ.
        const fresh = s.lastPassAt && t - Date.parse(s.lastPassAt) < 18 * 3_600_000;
        if (s.offset > 0 || !fresh) { await runSeasonality(); return "seasonality"; }
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
        intervals: {
          // Tương thích thanh trạng thái tab Cổ tức (không sửa tab đó): sessionMs = chu kỳ một vòng trong phiên,
          // offHoursMs = khoảng cách trung bình giữa các mốc ngoài phiên.
          sessionMs: config.sessionPassEveryMs, offHoursMs: Math.round(86_400_000 / Math.max(1, config.offHoursSlots.length)),
          sessionPassMs: config.sessionPassEveryMs, tickMs: config.tickMs, timingLimit: config.timingLimit, seasonLimit: config.seasonLimit,
          offHoursSlotsVn: config.offHoursSlots.map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`),
          seasonWindowVn: config.seasonWindow.map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`).join("-"),
        },
        timingPassActive: state.timing.passActive, timingPassStartedAt: state.timing.passStartedAt,
        running: state.busy,
        timing: lane(state.timing),
        seasonality: { ...lane(state.seasonality), lastFinalizeAt: state.seasonality.lastFinalizeAt ?? null },
      };
    },
  };
}
