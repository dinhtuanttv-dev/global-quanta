// M0 (2026-10-22) — KHO ƯU TIÊN CỤC BỘ: Railway Volume là kho CHÍNH cho dữ liệu thị trường / nghiên cứu (dựng lại được
// từ SSI / VCI), Supabase chỉ là BẢN SAO PHỤ. Mục tiêu: tính năng chạy bình thường khi Supabase / Neon khoá hạn mức, và
// lượt ĐỌC Supabase (egress — thứ bị giới hạn ở gói miễn phí) gần như bằng 0.
//
// Chính sách theo loại dữ liệu:
//   - Dữ liệu NGƯỜI DÙNG (danh mục, trạng thái biểu đồ, radar): đi thẳng Supabase như cũ — không đổi gì.
//   - Dữ liệu ngày toàn thị trường, dòng lệnh theo phút, bảng flow/profile/regime: CHỈ cục bộ (job tự dựng lại từ SSI).
//   - KV, BCTC, nến ngày, danh mục mã, thành phần chỉ số, giá trần/sàn: đọc cục bộ; thiếu -> đọc Supabase MỘT lần nếu
//     Supabase đang khoẻ rồi lưu cục bộ (hydrate-on-read).
//   - Sổ tín hiệu / kết quả / trọng số mô hình / chuỗi giá danh nghĩa (lịch sử không dựng lại được): nhập TOÀN BẢNG một lần
//     từ Supabase khi khoẻ; dòng đã ghi cục bộ không bị bản cũ đè.
//   - Mọi lần GHI: ghi cục bộ trước (luôn thành công), rồi sao sang Supabase theo hàng đợi nền — lỗi thì mở cầu dao
//     15 phút (không gọi Supabase), không làm hỏng job.
import { noteStoreError } from "../elite/storeHealth.js";

export const USER_TABLES = new Set(["market_user_watchlists", "market_user_chart_state", "market_radar_snapshots"]);
/**
 * Bảng chỉ có ở kho cục bộ (Railway Volume) — KHÔNG sao sang Supabase:
 *   market_matrix_* (Trading Matrix); auth_* (tài khoản, phiên, khoá ký — đăng nhập trên Railway, 23/10/2026: bí mật không rời Volume);
 *   bảng người dùng (danh mục, trạng thái biểu đồ, radar) — từ khi đăng nhập chuyển sang Railway, mã người dùng là mã của Gateway
 *   (dữ liệu cũ trên Supabase được nhập một lần bằng job importSupabaseUserData khi Supabase mở lại).
 */
export const isLocalOnlyTable = (table) => String(table).startsWith("market_matrix_") || String(table).startsWith("auth_") || USER_TABLES.has(table)
  || String(table).startsWith("market_user_elliott_") // DW8/DW10: cách đếm Elliott chỉnh tay + cảnh báo (mới, không có trên Supabase)
  || String(table).startsWith("market_elliott_"); // EP2: sổ theo dõi kịch bản Elliott
export const HYDRATE_TABLES = new Set(["market_signal_ledger", "market_signal_outcomes", "market_model_weights", "market_adjusted_series"]);
const HYDRATED_KV = (table) => `__local:hydrated:${table}`;

export function createLocalFirstStore({ local, inner, log = console, now = Date.now, breakerMs = 15 * 60_000, maxQueue = 500, replicateTicks = false }) {
  const st = { openUntil: 0, lastError: null, replicated: 0, replicateFailed: 0, dropped: 0, hydratedReads: 0, skippedWhileOpen: 0 };
  let queue = Promise.resolve();
  let pending = 0;
  const kvMiss = new Map(); // khoá KV không có ở cả hai nơi -> không hỏi lại Supabase trong 10 phút

  const usable = () => now() >= st.openUntil;
  const trip = (e) => {
    st.openUntil = now() + breakerMs; st.lastError = String(e?.message ?? e).slice(0, 200);
    try { noteStoreError?.(e); } catch { /* bỏ qua */ }
  };
  /** Đọc Supabase có bảo vệ: cầu dao mở -> undefined; lỗi -> mở cầu dao, undefined. */
  async function tryInner(fn) {
    if (!usable()) { st.skippedWhileOpen++; return undefined; }
    try { return await fn(); } catch (e) { trip(e); return undefined; }
  }
  /** Ghi sao sang Supabase theo hàng đợi nền (giữ thứ tự), không chặn nơi gọi. */
  function replicate(fn) {
    if (!usable()) { st.skippedWhileOpen++; return; }
    if (pending >= maxQueue) { st.dropped++; return; }
    pending++;
    queue = queue.then(async () => {
      if (!usable()) { st.skippedWhileOpen++; return; }
      try { await fn(); st.replicated++; } catch (e) { st.replicateFailed++; trip(e); }
    }).finally(() => { pending--; });
  }

  async function hydrateTable(table) {
    if (!HYDRATE_TABLES.has(table) || local.hasKv(HYDRATED_KV(table))) return;
    const rows = await tryInner(() => inner.selectRows(table, {}));
    if (rows === undefined) return; // Supabase không dùng được -> lần sau thử lại
    const existing = new Set((await local.selectRows(table, {})).map((r) => JSON.stringify(keyOf(table, r))));
    const fresh = rows.filter((r) => !existing.has(JSON.stringify(keyOf(table, r))));
    if (fresh.length) await local.upsertRows(table, fresh, null);
    await local.setKv(HYDRATED_KV(table), { rows: rows.length, imported: fresh.length, at: new Date(now()).toISOString() });
    st.hydratedReads++;
  }
  const PK = { market_signal_ledger: ["symbol", "signal_date", "signal"], market_signal_outcomes: ["symbol", "signal_date", "signal", "horizon"], market_model_weights: ["model", "version"], market_adjusted_series: ["symbol"] };
  const keyOf = (table, r) => (PK[table] ?? Object.keys(r)).map((c) => r[c]);

  const api = {
    ...inner,
    kind: inner.kind,
    localFirst: true,

    // ---------- dữ liệu ngày toàn thị trường: CHỈ cục bộ (backfill từ SSI khi thiếu) ----------
    async upsertMarketDaily(rows) { const n = await local.upsertMarketDaily(rows); replicate(() => inner.upsertMarketDaily(rows)); return n; },
    getMarketDailyDates: () => local.getMarketDailyDates(),
    getMarketDailyByDate: (d) => local.getMarketDailyByDate(d),
    getMarketDailyRange: (q) => local.getMarketDailyRange(q),
    async applyAdjustment(symbol, upTo, factor) { const n = await local.applyAdjustment(symbol, upTo, factor); replicate(() => inner.applyAdjustment(symbol, upTo, factor)); return n; },

    // ---------- KV ----------
    async getKv(key) {
      const v = await local.getKv(key);
      if (v) return v;
      if (now() - (kvMiss.get(key) ?? -Infinity) < 10 * 60_000) return null;
      const r = await tryInner(() => inner.getKv(key));
      if (r?.value !== undefined && r?.value !== null) { await local.setKv(key, r.value, r.updatedAt ?? undefined); st.hydratedReads++; return structuredClone(r); }
      if (r !== undefined) kvMiss.set(key, now()); // Supabase trả lời "không có" (không phải lỗi)
      return null;
    },
    async setKv(key, value) { kvMiss.delete(key); await local.setKv(key, value); replicate(() => inner.setKv(key, value)); },

    // ---------- BCTC ----------
    async getFundamentals(tickers) {
      const out = await local.getFundamentals(tickers);
      const missing = tickers.filter((t) => !out.has(t));
      if (missing.length) {
        const got = await tryInner(() => inner.getFundamentals(missing));
        if (got?.size) { await local.upsertFundamentals([...got.values()]); for (const [t, v] of got) out.set(t, v); st.hydratedReads++; }
      }
      return out;
    },
    async upsertFundamentals(entries) { await local.upsertFundamentals(entries); replicate(() => inner.upsertFundamentals(entries)); },

    // ---------- dòng lệnh theo phút: cục bộ (ghi mỗi phút -> không sao sang Supabase) ----------
    async upsertTickFlow(rows) { const n = await local.upsertTickFlow(rows); if (replicateTicks) replicate(() => inner.upsertTickFlow(rows)); return n; },
    getTickFlowRange: (q) => local.getTickFlowRange(q),

    // ---------- bảng ----------
    async upsertRows(table, rows, conflict) {
      await hydrateTable(table);
      const n = await local.upsertRows(table, rows, conflict);
      if (!isLocalOnlyTable(table)) replicate(() => inner.upsertRows(table, rows, conflict));
      return n;
    },
    async selectRows(table, query = {}) {
      await hydrateTable(table);
      return local.selectRows(table, query);
    },
    async deleteRows(table, query = {}) {
      await hydrateTable(table);
      const n = await local.deleteRows(table, query);
      if (!isLocalOnlyTable(table)) replicate(() => inner.deleteRows(table, query));
      return n;
    },
    async rpc(fn, args = {}) { const r = await tryInner(() => inner.rpc(fn, args)); return r ?? null; },
    /** Đọc THẲNG Supabase (job nhập dữ liệu người dùng cũ) — lỗi được ném cho nơi gọi. */
    readInner: (table, query = {}) => inner.selectRows(table, query),

    // ---------- nến ngày ----------
    async upsertBars(symbol, list, source) { const n = await local.upsertBars(symbol, list, source); replicate(() => inner.upsertBars(symbol, list, source)); return n; },
    async getBars(symbol, from, to) {
      if (await local.coverage(symbol)) return local.getBars(symbol, from, to);
      const got = await tryInner(() => inner.getBars(symbol, "1900-01-01", "2999-12-31"));
      if (got?.length) {
        const bySrc = new Map();
        for (const b of got) { const s = b.source ?? "SSI"; if (!bySrc.has(s)) bySrc.set(s, []); bySrc.get(s).push(b); }
        for (const [s, list] of bySrc) await local.upsertBars(symbol, list, s);
        st.hydratedReads++;
      }
      return local.getBars(symbol, from, to);
    },
    listNonSsiBars: (since) => local.listNonSsiBars(since),
    async coverage(symbol) {
      const c = await local.coverage(symbol);
      if (c) return c;
      return (await tryInner(() => inner.coverage(symbol))) ?? null;
    },

    // ---------- danh mục mã / thành phần chỉ số / giá trần sàn ----------
    async setSecurities(rows, source) { await local.setSecurities(rows, source); replicate(() => inner.setSecurities(rows, source)); },
    async getSecurities() {
      const v = await local.getSecurities();
      if (v) return v;
      const r = await tryInner(() => inner.getSecurities());
      if (r?.rows?.length) { await local.setSecurities(r.rows, r.source); return r; }
      return null;
    },
    async setIndexComponents(code, symbols, source) { await local.setIndexComponents(code, symbols, source); replicate(() => inner.setIndexComponents(code, symbols, source)); },
    async getIndexComponents(code) {
      const v = await local.getIndexComponents(code);
      if (v) return v;
      const r = await tryInner(() => inner.getIndexComponents(code));
      if (r?.symbols?.length) { await local.setIndexComponents(code, r.symbols, r.source); return r; }
      return null;
    },
    async setPriceLimits(date, rows, source) { await local.setPriceLimits(date, rows, source); replicate(() => inner.setPriceLimits(date, rows, source)); },
    async getPriceLimits(date) {
      const v = await local.getPriceLimits(date);
      if (v) return v;
      const r = await tryInner(() => inner.getPriceLimits(date));
      if (r?.rows?.length) { await local.setPriceLimits(date, r.rows, r.source); return r; }
      return null;
    },
    async recordSourceEvent(event) { await local.recordSourceEvent(event); replicate(() => inner.recordSourceEvent(event)); },
    getSourceEvents: (limit) => local.getSourceEvents(limit),

    // ---------- vận hành ----------
    flushWarehouse() {
      local.flush();
      try { const r = inner.flushWarehouse?.(); r?.catch?.(() => {}); } catch { /* kho đệm Supabase lỗi không ảnh hưởng kho cục bộ */ }
    },
    localInfo() {
      return {
        local: local.info(),
        replica: { healthy: usable(), openUntil: st.openUntil ? new Date(st.openUntil).toISOString() : null, lastError: st.lastError, pending, ...st },
      };
    },
    pruneLocal: (opts) => local.prune(opts),
    /** Chờ hàng đợi sao chép xong (test / tắt máy). */
    drainReplica: () => queue,
  };
  return api;
}
