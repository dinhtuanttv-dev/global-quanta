// M0 (2026-10-22) — tự dựng lại dữ liệu cục bộ từ nguồn GỐC (SSI / VCI / TradingView) khi Railway Volume còn thiếu,
// không cần Supabase / Neon. Chạy NỀN (job dài 20–40 phút, vượt thời gian chờ HTTP) theo thứ tự phụ thuộc:
//   1. backfillMarketDaily   ~260 phiên dữ liệu ngày toàn thị trường (SSI DailyStockPrice theo ngày)
//   2. buildUniverse         nếu chưa có / quá 8 ngày (cần 1)
//   3. refreshFundamentals   BCTC quý từ VCI cho mã còn thiếu (cần 2)
//   4. scanUniverse          kết quả Siêu Quét (cần 1–3)
//   5. backfillScreenerHistory + scanStrategies + researchFlow  (bộ lọc, nghiên cứu — bước nào lỗi thì ghi lại, không dừng chuỗi)
// Tiến độ lưu KV cục bộ "ops:localBootstrap" (đọc qua GET /api/health/db-budget).
export const BOOTSTRAP_KV = "ops:localBootstrap";

export function needsBootstrap({ marketDates, hasScan, minDates = 230 }) {
  return marketDates < minDates || !hasScan;
}

export function createLocalBootstrap({ jobs, store, now = Date.now, log = console }) {
  let running = null;
  let state = { status: "idle" };
  const save = async () => { try { await store.setKv(BOOTSTRAP_KV, state); } catch { /* bỏ qua */ } };

  async function step(name, fn, { required = false } = {}) {
    const t0 = now();
    state.steps.push({ name, status: "running", startedAt: new Date(t0).toISOString() });
    const rec = state.steps[state.steps.length - 1];
    await save();
    try {
      const result = await fn();
      Object.assign(rec, { status: "ok", ms: now() - t0, result: JSON.parse(JSON.stringify(result ?? null, (k, v) => (Array.isArray(v) && v.length > 20 ? `${v.length} mục` : v))) });
    } catch (e) {
      Object.assign(rec, { status: "error", ms: now() - t0, error: String(e?.message ?? e).slice(0, 300) });
      log.warn?.(`[local-bootstrap] ${name}: ${rec.error}`);
      if (required) throw e;
    } finally { await save(); }
  }

  async function runAll(reason) {
    state = { status: "running", reason, startedAt: new Date(now()).toISOString(), steps: [] };
    try {
      // Dữ liệu ngày: chạy tới khi đủ (mỗi lượt tối đa 400 phiên).
      await step("backfillMarketDaily", () => jobs.backfillMarketDaily({ maxDays: 400 }), { required: true });
      const uni = (await store.getKv("scanner:universe"))?.value;
      const stale = !uni?.builtAt || now() - Date.parse(uni.builtAt) > 8 * 86_400_000;
      if (stale) await step("buildUniverse", () => jobs.buildUniverse(), { required: true });
      await step("refreshFundamentals", () => jobs.refreshFundamentals({ maxAgeDays: 30, limit: 600 }));
      await step("scanUniverse", () => jobs.scanUniverse(), { required: true });
      if (jobs.backfillScreenerHistory) await step("backfillScreenerHistory", () => jobs.backfillScreenerHistory({ maxSymbols: 400 }));
      if (jobs.scanStrategies) await step("scanStrategies", () => jobs.scanStrategies());
      if (jobs.researchFlow) await step("researchFlow", () => jobs.researchFlow());
      state.status = "done";
    } catch (e) {
      state.status = "error"; state.error = String(e?.message ?? e).slice(0, 300);
    }
    state.finishedAt = new Date(now()).toISOString();
    await save();
    return state;
  }

  return {
    /** Khởi động nền (trả ngay). `wait` = chờ xong (test). */
    async run({ wait = false, reason = "manual" } = {}) {
      if (running) return { running: true, startedAt: state.startedAt };
      running = runAll(reason).finally(() => { running = null; });
      if (wait) return running;
      running.catch(() => {});
      return { started: true, reason };
    },
    /** Gọi lúc khởi động: tự chạy nếu kho cục bộ thiếu dữ liệu. */
    async autoStart() {
      const dates = (await store.getMarketDailyDates()).length;
      const hasScan = Boolean((await store.getKv("scanner:latest"))?.value?.items?.length);
      if (!needsBootstrap({ marketDates: dates, hasScan })) return { skipped: true, dates, hasScan };
      return this.run({ reason: `auto: ${dates} phiên, quét ${hasScan ? "có" : "chưa có"}` });
    },
    status: () => state,
  };
}
