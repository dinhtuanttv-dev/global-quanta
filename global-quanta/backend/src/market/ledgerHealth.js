// Sức khoẻ các sổ theo dõi thực tế (forward ledger): mỗi sổ ghi những phiên nào, thiếu phiên nào, có trễ không, job ghi sổ
// chạy được không, bao giờ có kết quả chấm đầu tiên, đã sao lưu ra ngoài Railway chưa. Chỉ đọc; không sửa sổ nào.
//   Hai kiểu sổ: "mỗi phiên" (thiếu phiên là lỗi) và "khi có tín hiệu" (phiên không có bản ghi là bình thường, chỉ xét trễ / lỗi job).
import { isTradingDay, lastCompletedSessionDate, vnDate, vnParts } from "./calendar.js";
import { loadLedgerIndex, missingSessions } from "./ledgerIndex.js";
import { LEDGER_BACKUP_STATE_KV } from "./ledgerBackup.js";

export const LEDGER_HEALTH_VERSION = "ledger-health/1";
const STRIP = 40;
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** Ngày sau `from` cộng `n` phiên: theo lịch thật nếu đủ, còn lại cộng ngày làm việc (ước tính, chưa trừ lễ). */
export function addSessions(calendar, from, n) {
  const i = calendar.indexOf(from);
  if (i >= 0 && i + n < calendar.length) return { date: calendar[i + n], estimated: false };
  let d = new Date(`${i >= 0 ? calendar[calendar.length - 1] : from}T00:00:00Z`), left = i >= 0 ? n - (calendar.length - 1 - i) : n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return { date: d.toISOString().slice(0, 10), estimated: true };
}

/**
 * Trạng thái một sổ (hàm thuần).
 * @param spec  { id, name, tab, cadence: "session" | "signal", writeAt: "HH:MM", horizon?, backup? }
 * @param dates các phiên đã có bản ghi
 * @param calendar phiên giao dịch đã đóng, cũ -> mới
 * @param job   trạng thái job ghi sổ từ bộ lập lịch (có thể null)
 */
export function summarizeLedger({ spec, dates, calendar, job = null, now = Date.now(), extra = {} }) {
  const ds = [...new Set(dates)].filter(Boolean).sort();
  const have = new Set(ds), first = ds[0] ?? null, last = ds[ds.length - 1] ?? null;
  const nowD = new Date(now), today = vnDate(nowD);
  const writtenToday = isTradingDay(nowD) && vnParts(nowD).minutes >= toMin(spec.writeAt) + 30;
  // Phiên gần nhất mà sổ lẽ ra đã ghi: phiên hôm nay nếu đã quá giờ ghi 30 phút, không thì phiên đóng trước đó.
  const closed = lastCompletedSessionDate(nowD);
  const expected = closed === today && !writtenToday ? calendar.filter((d) => d < today).pop() ?? null : closed;
  const missing = spec.cadence === "session" ? missingSessions(ds, calendar) : [];
  const late = spec.cadence === "session" && last != null && expected != null && last < expected;
  const jobFailed = job?.last && job.last.ok === false && job.lastRunDate === today;
  const status = !ds.length ? "empty" : jobFailed ? "job_error" : late ? "late" : missing.length ? "gap" : "ok";
  const window = calendar.slice(-STRIP);
  const strip = window.map((d) => ({ date: d, state: have.has(d) ? "written" : !first || d < first ? "before" : spec.cadence === "signal" ? "none" : "missing" }));
  const firstScore = spec.horizon && first ? addSessions(calendar, first, spec.horizon) : null;
  return {
    id: spec.id, name: spec.name, tab: spec.tab, what: spec.what, cadence: spec.cadence, writeAt: spec.writeAt, storage: spec.storage,
    status, firstDate: first, lastDate: last, sessions: ds.length, expected, missing, strip,
    horizon: spec.horizon ?? null, firstScore, matured: extra.matured ?? null, backup: spec.backup ? extra.backup ?? null : null,
    job: job ? { name: job.name, at: job.at, lastRunDate: job.lastRunDate ?? null, ok: job.last?.ok ?? null, finishedAt: job.last?.finishedAt ?? null, error: job.last?.error ?? null } : null,
    note: extra.note ?? null,
  };
}

/** Các sổ đang chạy trên Gateway và cách đọc ngày đã ghi của từng sổ. */
export const LEDGER_SPECS = [
  { id: "cycles", name: "Cycle Fingerprint", tab: "Phân tích ngành", what: "giá trị mô hình 20 phiên của mọi mã trong thư viện", cadence: "session", writeAt: "16:05", horizon: 21, backup: true, storage: "KV cycles:ledger:*", job: "buildCycleLibrary" },
  { id: "alpha", name: "Radar Top 20", tab: "Phân tích ngành", what: "điểm và z 18 yếu tố của mọi mã thanh khoản", cadence: "session", writeAt: "16:10", horizon: 21, backup: true, storage: "KV alpha:snap:*", job: "buildAlphaTop20" },
  { id: "structure", name: "Cấu trúc đa khung (nón dự báo)", tab: "Phân tích kỹ thuật", what: "nón 5/10/20 phiên và kết luận cấu trúc", cadence: "session", writeAt: "15:47", horizon: 20, storage: "file trên Volume", job: "scanStructure" },
  { id: "momentum", name: "Momentum M1", tab: "Phân tích kỹ thuật", what: "nhóm bật / tắt của bộ lọc momentum", cadence: "session", writeAt: "15:47", horizon: 20, storage: "file trên Volume", job: "scanStructure" },
  { id: "signals", name: "Tín hiệu bộ lọc", tab: "Tổng quan", what: "tín hiệu SEPA, CAN SLIM, Base Breakout, Hợp lưu, mô hình giá", cadence: "session", writeAt: "15:45", storage: "bảng market_signal_ledger", job: "scanStrategies" },
  { id: "preopen", name: "Trung tâm thị trường", tab: "Tổng quan", what: "3 kịch bản trước giờ mở cửa và chấm cuối phiên", cadence: "session", writeAt: "08:50", storage: "KV preopen:ledger:v1" },
  { id: "world", name: "Truyền dẫn chiến lược thế giới", tab: "Kết nối thế giới", what: "điểm ngành thuận / ngược gió ngắn hạn", cadence: "session", writeAt: "16:00", storage: "KV worldstrategy:ledger", note: "Ghi khi trang được mở trong ngày; không có job riêng." },
  { id: "matrix", name: "Trạng thái thị trường M3 / M4", tab: "Tổng quan", what: "tín hiệu kịch bản thị trường", cadence: "signal", writeAt: "16:50", storage: "bảng market_matrix_signal(_m4)", job: "matrixSnapshot" },
  { id: "elliott", name: "Kịch bản Elliott", tab: "Phân tích kỹ thuật", what: "kịch bản sóng mới và vòng đời của chúng", cadence: "signal", writeAt: "16:10", storage: "bảng market_elliott_ledger", job: "elliottLedger" },
];

/** Đọc ngày đã ghi của từng sổ từ kho; lỗi một sổ không làm hỏng cả trang. */
export function createLedgerHealth({ store, structure = null, scheduler = null, getCalendar, now = Date.now }) {
  const since = () => new Date(now() - 400 * 864e5).toISOString().slice(0, 10);
  const datesOf = (rows, key) => rows.map((r) => (typeof key === "function" ? key(r) : r[key])).filter((d) => typeof d === "string").map((d) => d.slice(0, 10));
  const readers = {
    cycles: async () => ({ dates: (await loadLedgerIndex(store, "cycles:ledger:index", "cycles:ledger:")).dates }),
    alpha: async () => {
      const idx = await loadLedgerIndex(store, "alpha:snap:index", "alpha:snap:");
      return { dates: idx.dates, matured: Object.keys(idx.doc?.scored ?? {}).length };
    },
    structure: async () => ({ dates: (await structure?.ledgerDates?.()) ?? [] }),
    momentum: async () => { const s = await structure?.momentumStats?.(); return { dates: (await structure?.momentumDates?.()) ?? [], matured: s?.scoredDays ?? null }; },
    signals: async () => ({ dates: datesOf(await store.selectRows("market_signal_ledger", { select: "signal_date", gte: { signal_date: since() } }), "signal_date") }),
    preopen: async () => ({ dates: Object.keys((await store.getKv("preopen:ledger:v1"))?.value?.days ?? {}) }),
    world: async () => ({ dates: datesOf((await store.getKv("worldstrategy:ledger"))?.value ?? [], "date") }),
    matrix: async () => {
      const a = await store.selectRows("market_matrix_signal", { select: "signal_date", gte: { signal_date: since() } }).catch(() => []);
      const b = await store.selectRows("market_matrix_signal_m4", { select: "signal_date", gte: { signal_date: since() } }).catch(() => []);
      return { dates: [...datesOf(a, "signal_date"), ...datesOf(b, "signal_date")] };
    },
    elliott: async () => ({ dates: datesOf(await store.selectRows("market_elliott_ledger", { select: "doc" }), (r) => r.doc?.loggedAt) }),
  };
  return {
    async report() {
      const calendar = await getCalendar();
      const jobs = new Map((scheduler?.status?.() ?? []).map((j) => [j.name, j]));
      const backup = (await store.getKv(LEDGER_BACKUP_STATE_KV).catch(() => null))?.value ?? null;
      const ledgers = [];
      for (const spec of LEDGER_SPECS) {
        try {
          const r = await readers[spec.id]();
          const prefix = spec.id === "cycles" ? "cycles:ledger:" : "alpha:snap:";
          const backedUp = backup?.hashes ? Object.keys(backup.hashes).filter((k) => k.startsWith(prefix) && /\d{4}-\d{2}-\d{2}$/.test(k)).length : null;
          ledgers.push(summarizeLedger({ spec, dates: r.dates, calendar, job: spec.job ? jobs.get(spec.job) ?? null : null, now: now(),
            extra: { matured: r.matured ?? null, note: spec.note, backup: spec.backup ? { backedUpSessions: backedUp, lastRun: backup?.lastRun ?? null } : null } }));
        } catch (e) {
          ledgers.push({ id: spec.id, name: spec.name, tab: spec.tab, what: spec.what, cadence: spec.cadence, status: "read_error", error: e.message, strip: [], missing: [], sessions: 0 });
        }
      }
      const count = (s) => ledgers.filter((l) => l.status === s).length;
      return {
        version: LEDGER_HEALTH_VERSION, generatedAt: new Date(now()).toISOString(), calendarThrough: calendar[calendar.length - 1] ?? null,
        summary: { total: ledgers.length, ok: count("ok"), gap: count("gap"), late: count("late"), jobError: count("job_error"), empty: count("empty"), readError: count("read_error") },
        backup: backup?.lastRun ?? null, ledgers,
      };
    },
  };
}
