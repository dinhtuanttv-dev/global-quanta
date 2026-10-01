// Lưu bền vững dòng lệnh Lee–Ready (IFE lớp 1):
//   - Recorder: mỗi phút lấy các phút đã thay đổi từ StreamHub và upsert vào store
//     (Supabase: bảng market_tick_flow). Ghi lỗi -> đánh dấu lại, lần sau ghi tiếp.
//   - Tuỳ chọn ghi nền (MARKET_TICK_RECORDER_SYMBOLS=N): trong giờ khớp lệnh liên tục,
//     tự đăng ký N mã thanh khoản cao nhất của universe để tích luỹ lịch sử tick
//     ngay cả khi không ai mở bảng. Mặc định 0 (chỉ ghi các mã đang được xem).
//   - Đọc lại: gom theo phiên, ghép phiên hôm nay (bộ nhớ ưu tiên, store bù phần trước
//     khi Gateway khởi động lại).

import { expectsLiveTicks } from "../calendar.js";
import { KV } from "./scannerJobs.js";

/** Hàng phút -> Map(date -> { date, classifiedVolume, minutes[] }). */
export function groupTickRows(rows) {
  const byDate = new Map();
  for (const r of rows) {
    let s = byDate.get(r.date);
    if (!s) byDate.set(r.date, (s = { date: r.date, classifiedVolume: 0, minutes: [] }));
    s.minutes.push({ minute: r.minute, buy: r.buy, sell: r.sell, unknown: r.unknown, prints: r.prints, sizes: r.sizes ?? {} });
    s.classifiedVolume += r.buy + r.sell + r.unknown;
  }
  for (const s of byDate.values()) s.minutes.sort((a, b) => a.minute - b.minute);
  return byDate;
}

/** Ghép phiên hôm nay: phút trong bộ nhớ (đầy đủ hơn) ghi đè phút đã lưu. */
export function mergeTickFlow(stored, live) {
  if (!stored) return live ?? null;
  if (!live || live.date !== stored.date) return stored;
  const byMinute = new Map(stored.minutes.map((m) => [m.minute, m]));
  for (const m of live.minutes) byMinute.set(m.minute, m);
  const minutes = [...byMinute.values()].sort((a, b) => a.minute - b.minute);
  return { date: live.date, classifiedVolume: minutes.reduce((s, m) => s + m.buy + m.sell + m.unknown, 0), minutes };
}

/**
 * Lịch sử tick đã lưu của một mã trong [from, to] + phiên hôm nay đã ghép với bộ nhớ.
 * @returns {Promise<{ history: Map<string, any>, today: any|null }>}
 */
export async function loadTickFlows({ store, hub, symbol, from, to, today = null }) {
  let rows = [];
  if (typeof store?.getTickFlowRange === "function") {
    try {
      rows = await store.getTickFlowRange({ symbol, from, to: today && today > to ? today : to });
    } catch (error) {
      console.warn(`[market] Đọc tick flow ${symbol} lỗi: ${error.message}`);
    }
  }
  const history = groupTickRows(rows);
  const storedToday = today ? history.get(today) ?? null : null;
  if (today) history.delete(today);
  const live = hub?.getTickFlow(symbol) ?? null;
  return { history, today: mergeTickFlow(storedToday, live && (!today || live.date === today) ? live : null) };
}

export function createTickRecorder({ hub, store, intervalMs = 60_000, now = () => new Date(), backgroundSymbols = Number(process.env.MARKET_TICK_RECORDER_SYMBOLS) || 0 }) {
  let timer = null;
  let flushing = false;
  let unsubscribe = null;
  let watched = [];
  const stats = { flushes: 0, rowsWritten: 0, errors: 0, lastError: null, lastFlushAt: null };

  async function flush() {
    if (flushing || typeof store?.upsertTickFlow !== "function") return 0;
    flushing = true;
    const rows = hub.drainTickFlow();
    try {
      if (rows.length) await store.upsertTickFlow(rows);
      stats.flushes++;
      stats.rowsWritten += rows.length;
      stats.lastFlushAt = now().toISOString();
      return rows.length;
    } catch (error) {
      hub.markTickFlowDirty(rows);
      stats.errors++;
      stats.lastError = error.message;
      console.warn(`[market] Ghi tick flow lỗi (${rows.length} phút, sẽ thử lại): ${error.message}`);
      return 0;
    } finally {
      flushing = false;
    }
  }

  /** Bật/tắt đăng ký nền theo giờ giao dịch. */
  async function reconcileBackground() {
    if (!(backgroundSymbols > 0)) return;
    const live = expectsLiveTicks(now());
    if (live && !unsubscribe) {
      const tickers = (await store.getKv(KV.universe).catch(() => null))?.value?.tickers ?? [];
      watched = [...tickers].sort((a, b) => (b.avgValue20 ?? 0) - (a.avgValue20 ?? 0)).slice(0, backgroundSymbols).map((t) => t.ticker);
      if (!watched.length) return;
      try {
        unsubscribe = hub.subscribe({ symbols: watched, send: () => {}, raw: true });
        console.log(`[market] Ghi tick nền: ${watched.length} mã.`);
      } catch (error) {
        stats.lastError = error.message;
        console.warn(`[market] Không đăng ký ghi tick nền: ${error.message}`);
      }
    } else if (!live && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      watched = [];
    }
  }

  async function tick() {
    await reconcileBackground().catch(() => {});
    await flush();
  }

  return {
    flush,
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref?.();
      void tick();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      unsubscribe?.();
      unsubscribe = null;
      await flush();
    },
    status: () => ({ ...stats, backgroundSymbols, watching: watched.length }),
  };
}
