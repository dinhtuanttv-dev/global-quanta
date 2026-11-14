// Bộ lập lịch đơn giản theo giờ Việt Nam, chạy trong cùng tiến trình Ingestor.
// Mỗi job chạy tối đa 1 lần/ngày; nếu tiến trình khởi động lại sau giờ hẹn thì
// chạy bù trong ngày. Các job chạy tuần tự để không dồn tải lên SSI.
// Tự phục hồi (2026-10-20): job LỖI (VD kho dữ liệu tạm khoá / mạng) được thử lại sau RETRY_MS, tối đa RETRY_MAX lần
// mỗi ngày — trước đây job lỗi phải đợi tới hôm sau hoặc tới khi khởi động lại tiến trình.
// Thời hạn (14/11/2026): các job chạy TUẦN TỰ trên một hàng đợi, nên một job treo (lời gọi mạng không bao giờ trả) chặn MỌI job sau nó
// tới khi khởi động lại. Sự cố 13/11/2026: sau lần khởi động lại 12:18, cả chuỗi cuối ngày (đồng bộ ngày, Siêu Quét, chiến lược…) không
// chạy, bảng Elite kẹt ở phiên 12/11. Nay mỗi job có thời hạn (mặc định 90 phút, `timeoutMs` riêng cho job dài): quá hạn = lỗi
// (được thử lại như lỗi thường) và hàng đợi đi tiếp. Trạng thái tách "đang chờ" (queued) và "đang chạy" (running) để thấy job nào treo.

import { isTradingDay, vnDate, vnParts } from "./calendar.js";
import { withDbTag } from "./store/egressMeter.js";

const DEFAULT_SCHEDULE = [
  { name: "syncSecurities", at: "08:15", tradingDayOnly: true },
  { name: "syncPriceLimits", at: "08:45", tradingDayOnly: true },
  { name: "syncEod", at: "15:20", tradingDayOnly: true },
  { name: "reconcile", at: "15:50", tradingDayOnly: true },
  { name: "backfill", at: "02:00", tradingDayOnly: false },
];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const RETRY_MS = 30 * 60_000;
const DEFAULT_TIMEOUT_MS = Number(process.env.MARKET_JOB_TIMEOUT_MS) > 0 ? Number(process.env.MARKET_JOB_TIMEOUT_MS) : 90 * 60_000;
const SLOW_LOG_MS = 120_000;
const RETRY_MAX = 3;

export function createScheduler(jobs, { now = Date.now, tickMs = 30_000, extraSchedule = [], retryMs = RETRY_MS, retryMax = RETRY_MAX, timeoutMs = DEFAULT_TIMEOUT_MS, log = console } = {}) {
  const schedule = [...DEFAULT_SCHEDULE, ...extraSchedule].map((job) => ({
    ...job,
    at: process.env[`MARKET_JOB_${job.name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_AT`] || job.at,
  }));
  const lastRunDate = new Map();
  const retries = new Map(); // name -> { date, attempts, at }
  const history = new Map();
  let queue = Promise.resolve();
  let timer;

  function run(name, trigger = "schedule") {
    if (typeof jobs[name] !== "function") {
      const error = new Error(`Không có job ${name}.`);
      error.statusCode = 404;
      throw error;
    }
    const queuedAt = new Date(now()).toISOString();
    history.set(name, { ...(history.get(name) || {}), running: false, queued: true, queuedAt, trigger });
    const limit = schedule.find((j) => j.name === name)?.timeoutMs ?? timeoutMs;
    const job = queue.then(async () => {
      const started = new Date(now()).toISOString(), t0 = now();
      history.set(name, { ...(history.get(name) || {}), running: true, queued: false, queuedAt, startedAt: started, trigger });
      let timer = null;
      try {
        const work = withDbTag(`job:${name}`, () => jobs[name]()); // D0: đo egress theo job
        const expire = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`quá thời hạn ${Math.round(limit / 60_000)} phút — bỏ qua để hàng đợi chạy tiếp`)), limit); timer.unref?.(); });
        const result = await Promise.race([work, expire]);
        history.set(name, { running: false, queued: false, queuedAt, startedAt: started, finishedAt: new Date(now()).toISOString(), trigger, ok: true, result });
        if (now() - t0 >= SLOW_LOG_MS) log.info?.(`[market] Job ${name} xong sau ${Math.round((now() - t0) / 1000)} giây.`);
        return result;
      } catch (error) {
        history.set(name, { running: false, queued: false, queuedAt, startedAt: started, finishedAt: new Date(now()).toISOString(), trigger, ok: false, error: error.message });
        if (trigger !== "manual") {
          const date = vnDate(new Date(now()));
          const r = retries.get(name);
          const attempts = r?.date === date ? r.attempts : 0;
          if (attempts < retryMax) retries.set(name, { date, attempts: attempts + 1, at: now() + retryMs });
        }
        log.warn?.(`[market] Job ${name} lỗi: ${error.message}`);
        throw error;
      } finally { if (timer) clearTimeout(timer); }
    });
    queue = job.catch(() => {});
    return job;
  }

  function tick() {
    const date = new Date(now());
    const today = vnDate(date);
    const { minutes, weekday } = vnParts(date);
    for (const job of schedule) {
      const r = retries.get(job.name);
      if (r && r.date === today && r.at && now() >= r.at && !history.get(job.name)?.running && !history.get(job.name)?.queued) {
        r.at = null; // một lần thử lại cho mỗi lần lỗi
        run(job.name, "retry").catch(() => {});
        continue;
      }
      if (lastRunDate.get(job.name) === today) continue;
      if (job.tradingDayOnly && !isTradingDay(date)) continue;
      if (job.weekdays && !job.weekdays.includes(weekday)) continue;
      if (minutes < toMinutes(job.at)) continue;
      lastRunDate.set(job.name, today);
      run(job.name).catch(() => {});
    }
  }

  return {
    start({ runOnStart = [] } = {}) {
      for (const name of runOnStart) run(name, "startup").catch(() => {});
      timer = setInterval(tick, tickMs);
      timer.unref?.();
      tick();
    },
    stop() {
      clearInterval(timer);
    },
    run: (name) => run(name, "manual"),
    tick,
    status() {
      return schedule.map((job) => ({ ...job, lastRunDate: lastRunDate.get(job.name) ?? null, last: history.get(job.name) ?? null, retry: retries.get(job.name) ?? null }));
    },
  };
}
