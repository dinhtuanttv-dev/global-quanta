// Kho dữ liệu Supabase Postgres qua PostgREST (không cần thêm thư viện).
// Schema: supabase/migrations/20261001000000_market_data.sql. Dùng
// SUPABASE_SECRET_KEY (chỉ ở server) nên bỏ qua RLS.
//
// Quy tắc "SSI không bị nguồn dự phòng ghi đè" được trigger trong DB đảm bảo,
// nên phía này luôn upsert kiểu merge-duplicates.
//
// Hạn mức miễn phí (D0/D1, 10/2026): mọi phản hồi được đo egress (egressMeter.js); khi có `warehouse` các lượt đọc lịch sử
// đi qua kho đệm phân vùng (warehouse.js + partitionCache.js + tableCache.js): chỉ phần chưa có / vừa bị ghi mới đọc
// Supabase. Kết quả trả về GIỐNG HỆT đọc thẳng (cùng dòng thô, cùng hàm chuyển đổi, cùng thứ tự).

import { isSsiSource, selectMemory } from "./memoryStore.js";
import { sharedEgressMeter } from "./egressMeter.js";
import { createSymbolRanges, createValueCache } from "./partitionCache.js";
import { createTableCache } from "./tableCache.js";

// Khoá chính các bảng đọc theo trang: phân trang bằng Range chỉ đúng khi thứ tự là DUY NHẤT —
// sắp theo cột không duy nhất (VD chỉ trading_date) thì Postgres có thể trả trùng/thiếu dòng giữa các trang.
export const PRIMARY_KEYS = {
  market_flow_daily: ["symbol", "trading_date"],
  market_volume_profile_daily: ["symbol", "trading_date"],
  market_regime_daily: ["trading_date"],
  market_signal_ledger: ["symbol", "signal_date", "signal"],
  market_signal_outcomes: ["symbol", "signal_date", "signal", "horizon"],
  market_model_weights: ["model", "version"],
  market_tick_flow_daily: ["symbol", "trading_date"],
  market_radar_snapshots: ["user_id", "list_key", "snap_date"],
  market_adjusted_series: ["symbol"],
  market_user_watchlists: ["user_id"],
  market_user_chart_state: ["user_id", "symbol"],
};

/** Thêm các cột khoá chính còn thiếu vào cuối `order` để thứ tự luôn duy nhất. */
export function stableOrder(table, order) {
  const keys = PRIMARY_KEYS[table];
  if (!keys) return order;
  const parts = order ? order.split(",") : [];
  const used = new Set(parts.map((p) => p.split(".")[0]));
  return [...parts, ...keys.filter((k) => !used.has(k)).map((k) => `${k}.asc`)].join(",");
}

/** Bỏ dòng trùng khoá trong cùng một lệnh upsert (giữ dòng sau cùng) — Postgres từ chối ON CONFLICT trùng. */
export function dedupeByKey(rows, conflict) {
  const cols = conflict.split(",");
  const m = new Map();
  for (const r of rows) m.set(cols.map((c) => r[c]).join("|"), r);
  return m.size === rows.length ? rows : [...m.values()];
}

/** {eq, gte, lte, in, order, limit, select} -> query string PostgREST. */
export function postgrestQuery({ select, eq = {}, gte = {}, lte = {}, in: inList = {}, order, limit } = {}) {
  const enc = encodeURIComponent;
  const parts = [];
  if (select) parts.push(`select=${select}`);
  for (const [k, v] of Object.entries(eq)) parts.push(`${k}=eq.${enc(v)}`);
  for (const [k, v] of Object.entries(gte)) parts.push(`${k}=gte.${enc(v)}`);
  for (const [k, v] of Object.entries(lte)) parts.push(`${k}=lte.${enc(v)}`);
  for (const [k, v] of Object.entries(inList)) parts.push(`${k}=in.(${v.map((x) => enc(x)).join(",")})`);
  if (order) parts.push(`order=${order}`);
  if (limit) parts.push(`limit=${limit}`);
  return parts.join("&");
}

const PAGE = 1000;
const chunksOf = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const codepointCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * warehouse: kho đệm phân vùng (warehouse.js) — có thì đọc lịch sử qua đệm (D1), không có thì đọc thẳng như trước.
 * meter: đồng hồ egress (D0) — null để tắt.
 */
export function createSupabaseStore({ fetchImpl = globalThis.fetch, warehouse = null, meter = sharedEgressMeter(), log = console } = {}) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("MARKET_STORE=supabase cần SUPABASE_URL và SUPABASE_SECRET_KEY.");

  const tableOf = (path) => path.split("?")[0];
  async function request(path, { method = "GET", body, prefer, range } = {}) {
    // D0: lượt ĐỌC bị chặn khi vượt ngân sách egress ngày (lệnh ghi không bao giờ bị chặn).
    if (method === "GET") meter?.check();
    const headers = { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (prefer) headers.prefer = prefer;
    if (range) headers.range = range;
    const res = await fetchImpl(`${url}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(`Supabase ${method} ${path.split("?")[0]} lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
      error.statusCode = 502;
      throw error;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    meter?.record(Buffer.byteLength(text), { table: tableOf(path) });
    return text ? JSON.parse(text) : null;
  }

  /** Số dòng khớp bộ lọc (HEAD + Prefer: count=exact — không có thân phản hồi). */
  async function countRows(path) {
    meter?.check();
    const res = await fetchImpl(`${url}/rest/v1/${path}`, {
      method: "HEAD",
      headers: { apikey: key, authorization: `Bearer ${key}`, prefer: "count=exact" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw Object.assign(new Error(`Supabase HEAD ${tableOf(path)} lỗi HTTP ${res.status}`), { statusCode: 502 });
    meter?.record(0, { table: tableOf(path) });
    const total = /\/(\d+)$/.exec(res.headers?.get?.("content-range") ?? "")?.[1];
    if (total === undefined) throw new Error("Supabase không trả content-range khi đếm.");
    return Number(total);
  }

  async function selectAll(path) {
    const rows = [];
    for (let offset = 0; offset < 100_000; offset += PAGE) {
      const page = await request(path, { range: `${offset}-${offset + PAGE - 1}` });
      rows.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }
    return rows;
  }

  async function upsert(table, allRows, conflict) {
    const rows = dedupeByKey(allRows, conflict);
    for (let i = 0; i < rows.length; i += 500) {
      await request(`${table}?on_conflict=${conflict}`, {
        method: "POST",
        body: rows.slice(i, i + 500),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    }
  }

  const enc = encodeURIComponent;

  const dailyToRow = (r) => ({
    symbol: r.symbol, trading_date: r.date, exchange: r.exchange,
    open: r.open, high: r.high, low: r.low, close: r.close, close_adj: r.closeAdj,
    ref_price: r.refPrice, ceiling: r.ceiling, floor: r.floor,
    volume: r.volume, value: r.value, deal_volume: r.dealVolume, deal_value: r.dealValue,
    foreign_buy_vol: r.foreignBuyVol, foreign_sell_vol: r.foreignSellVol,
    foreign_buy_val: r.foreignBuyVal, foreign_sell_val: r.foreignSellVal, foreign_room: r.foreignRoom,
  });
  const n = (v) => (v === null || v === undefined ? null : Number(v));
  // Tiết kiệm băng thông Supabase (quota egress, 10/2026): luôn chọn CỘT TƯỜNG MINH, không `select=*`.
  const DAILY_COLUMNS = "symbol,trading_date,exchange,open,high,low,close,close_adj,ref_price,ceiling,floor,volume,value,deal_volume,deal_value,foreign_buy_vol,foreign_sell_vol,foreign_buy_val,foreign_sell_val,foreign_room";
  const DAILY_SET = new Set(DAILY_COLUMNS.split(","));
  const BAR_COLUMNS = "trading_date,open,high,low,close,volume,value,source";
  // Cache KV trong bộ nhớ: tài liệu KV lớn (VD sectors:rrg:history ≈ 2,2 MB) trước đây bị đọc NGUYÊN mỗi request.
  // Trong KV_FRESH_MS trả bản nhớ; quá hạn -> chỉ hỏi updated_at (~100 byte), đổi mới tải lại value.
  // D1: bản KV còn được lưu trên đĩa kho đệm -> khởi động lại chỉ hỏi updated_at, không tải lại value.
  const KV_FRESH_MS = Number(process.env.MARKET_KV_CACHE_MS) || 60_000;
  const kvCache = new Map(); // key -> { value, updatedAt, checkedAt }
  const rowToDaily = (r) => ({
    symbol: r.symbol, date: r.trading_date, exchange: r.exchange,
    open: n(r.open), high: n(r.high), low: n(r.low), close: n(r.close), closeAdj: n(r.close_adj),
    refPrice: n(r.ref_price), ceiling: n(r.ceiling), floor: n(r.floor),
    volume: n(r.volume), value: n(r.value), dealVolume: n(r.deal_volume), dealValue: n(r.deal_value),
    foreignBuyVol: n(r.foreign_buy_vol), foreignSellVol: n(r.foreign_sell_vol),
    foreignBuyVal: n(r.foreign_buy_val), foreignSellVal: n(r.foreign_sell_val), foreignRoom: n(r.foreign_room),
  });
  const rowToBar = (r) => ({
    date: r.trading_date, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume: Number(r.volume), value: r.value === null ? null : Number(r.value), source: r.source,
  });
  const fundamentalFromRow = (r) => ({ ticker: r.ticker, income: r.income, balance: r.balance, fetchedAt: r.fetched_at });

  // ---------- Kho đệm (D1) ----------
  const wh = warehouse;
  const groupBySymbol = (rows) => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r.symbol)) m.set(r.symbol, []); m.get(r.symbol).push(r); }
    return m;
  };
  const daily = wh && createSymbolRanges({
    wh, ns: "md",
    fetchRange: async (symbols, from, to) => {
      const out = [];
      for (const c of chunksOf(symbols, 100)) out.push(...await selectAll(`market_daily?select=${DAILY_COLUMNS}&symbol=in.(${c.map(enc).join(",")})&trading_date=gte.${from}&trading_date=lte.${to}&order=trading_date.asc,symbol.asc`));
      return groupBySymbol(out);
    },
    fetchDates: async (symbols, dates) => {
      const out = [];
      for (const c of chunksOf(symbols, 100)) out.push(...await selectAll(`market_daily?select=${DAILY_COLUMNS}&symbol=in.(${c.map(enc).join(",")})&trading_date=in.(${dates.join(",")})&order=trading_date.asc,symbol.asc`));
      return groupBySymbol(out);
    },
  });
  const bars = wh && createSymbolRanges({
    wh, ns: "bars", rowBytes: 140,
    fetchRange: async ([symbol], from, to) => new Map([[symbol, await selectAll(`market_ohlcv_daily?select=${BAR_COLUMNS}&symbol=eq.${enc(symbol)}&trading_date=gte.${from}&trading_date=lte.${to}&order=trading_date.asc`)]]),
    fetchDates: async ([symbol], dates) => new Map([[symbol, await selectAll(`market_ohlcv_daily?select=${BAR_COLUMNS}&symbol=eq.${enc(symbol)}&trading_date=in.(${dates.join(",")})&order=trading_date.asc`)]]),
  });
  const values = wh && createValueCache({ wh, ns: "v", groups: (k) => [k.split(":")[0]] });
  const kvDisk = wh && createValueCache({ wh, ns: "kv" });
  let tables = null; // tạo sau khi có getMarketDailyDates (kiểm lịch phiên)

  /** Ghi bảng có đánh dấu trước/sau (giao thức partitionCache). */
  async function guardedWrite(before, write, after = before) {
    before(true);
    try { return await write(); } finally { after(false); }
  }

  const api = {
    kind: "supabase",

    // ---------- Dữ liệu ngày toàn thị trường (Siêu Quét) ----------
    async upsertMarketDaily(rows) {
      const pairs = rows.map((r) => [r.symbol, r.date]);
      const dates = [...new Set(rows.map((r) => r.date))];
      const mark = (journal) => {
        if (!wh) return;
        daily.markDates(pairs, { journal });
        for (const d of dates) values.invalidate(`mdd:${d}`);
        values.invalidate("mdates:all");
      };
      await guardedWrite(mark, () => upsert("market_daily", rows.map(dailyToRow), "symbol,trading_date"));
      return rows.length;
    },
    async getMarketDailyDates() {
      const load = async () => (await selectAll("market_daily_dates?order=trading_date.asc")).map((r) => r.trading_date);
      if (!wh) return load();
      return [...await values.get("mdates:all", load)];
    },
    async getMarketDailyByDate(date) {
      const load = async () => selectAll(`market_daily?select=${DAILY_COLUMNS}&trading_date=eq.${date}&order=symbol.asc`);
      const raw = wh ? await values.get(`mdd:${date}`, load) : await load();
      return raw.map(rowToDaily);
    },
    /** `columns`: danh sách cột (chuỗi PostgREST) khi nơi gọi chỉ cần một phần — giảm payload. */
    async getMarketDailyRange({ from, to, symbols, columns = DAILY_COLUMNS }) {
      const cols = columns.split(",");
      if (wh && symbols && cols.every((c) => DAILY_SET.has(c))) {
        // Giống hệt nhánh đọc thẳng: từng nhóm 100 mã theo thứ tự nơi gọi, trong nhóm sắp (ngày, mã), nối rồi sắp ổn định theo ngày.
        const got = await daily.read(symbols, from, to);
        const out = [];
        for (const chunk of chunksOf(symbols, 100)) {
          const uniq = [...new Set(chunk)].sort(codepointCmp);
          const rows = uniq.flatMap((s) => got.get(s) ?? []);
          rows.sort((a, b) => codepointCmp(a.trading_date, b.trading_date) || codepointCmp(a.symbol, b.symbol));
          for (const r of rows) { const o = {}; for (const c of cols) if (c in r) o[c] = r[c]; out.push(rowToDaily(o)); }
        }
        return out.sort((a, b) => a.date.localeCompare(b.date));
      }
      const out = [];
      const chunks = symbols ? chunksOf(symbols, 100) : [null];
      for (const chunk of chunks) {
        const filter = chunk ? `&symbol=in.(${chunk.map(enc).join(",")})` : "";
        out.push(...(await selectAll(`market_daily?select=${columns}&trading_date=gte.${from}&trading_date=lte.${to}${filter}&order=trading_date.asc,symbol.asc`)).map(rowToDaily));
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
    async applyAdjustment(symbol, upToDate, factor) {
      const mark = (journal) => {
        if (!wh) return;
        daily.markUpToDate(symbol, upToDate, { journal });
        values.invalidateGroups(["mdd"]);
      };
      return guardedWrite(mark, () => request("rpc/market_apply_adjustment", { method: "POST", body: { p_symbol: symbol, p_upto: upToDate, p_factor: factor } }));
    },

    // ---------- Khoá-giá trị (kết quả quét, universe, bảng ngành) ----------
    async getKv(key) {
      let c = kvCache.get(key);
      if (!c && wh) {
        const disk = await kvDisk.get(key, async () => undefined, { cacheIf: () => false });
        if (disk) { c = { value: disk.value, updatedAt: disk.updatedAt, checkedAt: 0 }; kvCache.set(key, c); }
      }
      // trả BẢN SAO: nơi gọi có thể sửa object (VD nối lịch sử rồi setKv) — không được làm hỏng bản trong cache
      if (c && Date.now() - c.checkedAt < KV_FRESH_MS) return c.updatedAt == null ? null : { value: structuredClone(c.value), updatedAt: c.updatedAt };
      if (c && c.updatedAt != null) {
        const head = await request(`market_kv?select=updated_at&key=eq.${enc(key)}`);
        if (head?.[0]?.updated_at === c.updatedAt) { c.checkedAt = Date.now(); return { value: structuredClone(c.value), updatedAt: c.updatedAt }; }
      }
      const rows = await request(`market_kv?select=value,updated_at&key=eq.${enc(key)}`);
      const row = rows?.[0] ?? null;
      kvCache.set(key, { value: row?.value ?? null, updatedAt: row?.updated_at ?? null, checkedAt: Date.now() });
      if (wh) {
        kvDisk.invalidate(key);
        if (row) await kvDisk.get(key, async () => ({ value: row.value, updatedAt: row.updated_at }));
      }
      return row ? { value: structuredClone(row.value), updatedAt: row.updated_at } : null;
    },
    async setKv(key, value) {
      await upsert("market_kv", [{ key, value, updated_at: new Date().toISOString() }], "key");
      kvCache.delete(key); // lần đọc kế tiếp tải bản mới (không đoán định dạng updated_at của Postgres)
      if (wh) kvDisk.invalidate(key);
    },

    // ---------- BCTC lưu đệm ----------
    async getFundamentals(tickers) {
      const out = new Map();
      if (wh) {
        // Đệm từng mã (kể cả "không có"): chỉ mã chưa có trong đệm mới đọc Supabase.
        const got = await values.getMany(tickers.map((t) => `fund:${t}`), async (keys) => {
          const want = keys.map((k) => k.slice(5));
          const found = new Map();
          for (const chunk of chunksOf(want, 100)) for (const r of await selectAll(`market_fundamentals?ticker=in.(${chunk.map(enc).join(",")})`)) found.set(r.ticker, r);
          return new Map(want.map((t) => [`fund:${t}`, { row: found.get(t) ?? null }]));
        });
        for (const t of tickers) { const r = got.get(`fund:${t}`)?.row; if (r) out.set(r.ticker, fundamentalFromRow(structuredClone(r))); }
        return out;
      }
      for (let i = 0; i < tickers.length; i += 100) {
        const chunk = tickers.slice(i, i + 100);
        for (const r of await selectAll(`market_fundamentals?ticker=in.(${chunk.map(enc).join(",")})`)) {
          out.set(r.ticker, fundamentalFromRow(r));
        }
      }
      return out;
    },
    async upsertFundamentals(entries) {
      const mark = () => { if (wh) for (const e of entries) values.invalidate(`fund:${e.ticker}`); };
      await guardedWrite(mark, () => upsert("market_fundamentals", entries.map((e) => ({
        ticker: e.ticker, income: e.income, balance: e.balance, fetched_at: e.fetchedAt ?? new Date().toISOString(),
      })), "ticker"));
    },

    // ---------- Dòng lệnh Lee–Ready theo phút (IFE) ----------
    async upsertTickFlow(rows) {
      const now = new Date().toISOString();
      await upsert("market_tick_flow", rows.map((r) => ({
        symbol: r.symbol, trading_date: r.date, minute: r.minute,
        buy: r.buy, sell: r.sell, unknown: r.unknown, prints: r.prints, sizes: r.sizes ?? {}, updated_at: now,
      })), "symbol,trading_date,minute");
      return rows.length;
    },
    async getTickFlowRange({ symbol, from, to }) {
      const rows = await selectAll(`market_tick_flow?select=symbol,trading_date,minute,buy,sell,unknown,prints,sizes&symbol=eq.${enc(symbol)}&trading_date=gte.${from}&trading_date=lte.${to}&order=trading_date.asc,minute.asc`);
      return rows.map((r) => ({
        symbol: r.symbol, date: r.trading_date, minute: Number(r.minute),
        buy: Number(r.buy), sell: Number(r.sell), unknown: Number(r.unknown), prints: Number(r.prints), sizes: r.sizes ?? {},
      }));
    },

    // ---------- Bảng nghiên cứu (truy vấn PostgREST tổng quát) ----------
    async upsertRows(table, rows, conflict) {
      const mark = () => tables?.invalidateWrite(table, rows);
      await guardedWrite(mark, () => upsert(table, rows, conflict));
      return rows.length;
    },
    async selectRows(table, query = {}) {
      const direct = () => selectRowsDirect(table, query);
      return tables ? tables.select(table, query, direct) : direct();
    },
    async deleteRows(table, query = {}) {
      const q = postgrestQuery({ ...query, select: undefined, order: undefined, limit: undefined });
      if (!q) throw new Error("deleteRows cần điều kiện lọc.");
      const mark = () => tables?.invalidateWrite(table, null);
      await guardedWrite(mark, () => request(`${table}?${q}`, { method: "DELETE" }));
      return null;
    },
    async rpc(fn, args = {}) {
      const mark = () => tables?.invalidateRpc(fn);
      return guardedWrite(mark, () => request(`rpc/${fn}`, { method: "POST", body: args }));
    },

    async upsertBars(symbol, list, source) {
      if (!list.length) return 0;
      const mark = (journal) => { if (wh) bars.markDates(list.map((b) => [symbol, b.date]), { journal }); };
      await guardedWrite(mark, () => upsert("market_ohlcv_daily", list.map((b) => ({
        symbol, trading_date: b.date, open: b.open, high: b.high, low: b.low, close: b.close,
        volume: b.volume, value: b.value, source, ingested_at: new Date().toISOString(),
      })), "symbol,trading_date"));
      return list.length;
    },

    async getBars(symbol, from, to) {
      if (wh) return ((await bars.read([symbol], from, to)).get(symbol) ?? []).map(rowToBar);
      const rows = await selectAll(`market_ohlcv_daily?select=${BAR_COLUMNS}&symbol=eq.${enc(symbol)}&trading_date=gte.${from}&trading_date=lte.${to}&order=trading_date.asc`);
      return rows.map(rowToBar);
    },

    async listNonSsiBars(since) {
      const rows = await selectAll(`market_ohlcv_daily?select=symbol,trading_date,close,source&trading_date=gte.${since}&source=not.like.SSI*&order=symbol.asc,trading_date.asc`);
      return rows.filter((r) => !isSsiSource(r.source)).map((r) => ({ symbol: r.symbol, date: r.trading_date, close: Number(r.close), source: r.source }));
    },

    async coverage(symbol) {
      const rows = await request(`market_ohlcv_coverage?symbol=eq.${enc(symbol)}`);
      const row = rows?.[0];
      return row ? { first: row.first_date, last: row.last_date, count: Number(row.bar_count) } : null;
    },

    async setSecurities(rows, source) {
      const mark = () => { if (wh) values.invalidate("sec:all"); };
      await guardedWrite(mark, () => upsert("market_securities", rows.map((s) => ({
        symbol: s.symbol, exchange: s.exchange, name: s.name, name_en: s.nameEn, sector: s.sector,
        listed_shares: s.listedShares, source, updated_at: new Date().toISOString(),
      })), "symbol"));
    },
    async getSecurities() {
      const load = () => selectAll("market_securities?order=symbol.asc");
      const rows = wh ? await values.get("sec:all", load) : await load();
      if (!rows.length) return null;
      return {
        rows: rows.map((r) => ({ symbol: r.symbol, exchange: r.exchange, name: r.name, nameEn: r.name_en, sector: r.sector, listedShares: r.listed_shares })),
        source: rows[0].source,
        updatedAt: rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), ""),
      };
    },

    async setIndexComponents(code, symbols, source) {
      const mark = () => { if (wh) values.invalidate(`ic:${code}`); };
      await guardedWrite(mark, async () => {
        await request(`market_index_components?index_code=eq.${enc(code)}`, { method: "DELETE" });
        await upsert("market_index_components", symbols.map((symbol) => ({
          index_code: code, symbol, source, updated_at: new Date().toISOString(),
        })), "index_code,symbol");
      });
    },
    async getIndexComponents(code) {
      const load = () => selectAll(`market_index_components?index_code=eq.${enc(code)}&order=symbol.asc`);
      const rows = wh ? await values.get(`ic:${code}`, load) : await load();
      if (!rows.length) return null;
      return { symbols: rows.map((r) => r.symbol), source: rows[0].source, updatedAt: rows[0].updated_at };
    },

    async setPriceLimits(date, rows, source) {
      const mark = () => { if (wh) values.invalidate(`pl:${date}`); };
      await guardedWrite(mark, () => upsert("market_price_limits", rows.map((r) => ({
        symbol: r.symbol, trading_date: date, ref_price: r.refPrice, ceiling: r.ceiling, floor: r.floor, source,
      })), "symbol,trading_date"));
    },
    async getPriceLimits(date) {
      const load = () => selectAll(`market_price_limits?trading_date=eq.${date}`);
      const rows = wh ? await values.get(`pl:${date}`, load) : await load();
      if (!rows.length) return null;
      return {
        rows: rows.map((r) => ({ symbol: r.symbol, date, refPrice: Number(r.ref_price), ceiling: Number(r.ceiling), floor: Number(r.floor) })),
        source: rows[0].source,
      };
    },

    async recordSourceEvent(event) {
      await request("market_source_events", {
        method: "POST",
        body: [{
          provider: event.provider, dataset: event.dataset, from_state: event.from, to_state: event.to,
          reason: event.reason, detail: event.lastError ? String(event.lastError).slice(0, 500) : null,
        }],
        prefer: "return=minimal",
      });
    },
    async getSourceEvents(limit = 50) {
      return request(`market_source_events?order=created_at.desc&limit=${limit}`);
    },

    // ---------- Kho đệm: trạng thái / quản trị ----------
    warehouseInfo() {
      return wh ? { enabled: true, ...wh.info(), tables: tables?.stats() ?? null } : { enabled: false };
    },
    flushWarehouse() {
      wh?.flushAll();
    },
    /** Xoá sạch đệm (sau khi sửa dữ liệu Supabase từ NGOÀI Gateway, VD script thủ công). */
    resetWarehouse() {
      if (!wh) return;
      daily.reset(); bars.reset(); values.reset(); kvDisk.reset(); tables?.reset(); kvCache.clear();
    },
  };

  async function selectRowsDirect(table, query) {
    const { in: inList = {} } = query;
    const [inCol, inValues] = Object.entries(inList)[0] ?? [];
    // Danh sách IN dài -> chia nhỏ để URL không quá dài.
    if (inCol && inValues.length > 100) {
      const out = [];
      for (let i = 0; i < inValues.length; i += 100) {
        out.push(...(await selectRowsDirect(table, { ...query, in: { ...inList, [inCol]: inValues.slice(i, i + 100) } })));
      }
      return query.order ? selectMemory(out, { order: query.order, limit: query.limit }) : out;
    }
    // Đọc nhiều trang: thứ tự phải duy nhất (bổ sung khoá chính).
    const path = `${table}?${postgrestQuery(query.limit ? query : { ...query, order: stableOrder(table, query.order) })}`;
    return query.limit ? (await request(path)) ?? [] : selectAll(path);
  }

  if (wh) {
    tables = createTableCache({
      wh, log,
      raw: { selectAll, countRows, dailyDates: () => api.getMarketDailyDates(), postgrestQuery, stableOrder },
    });
  }
  return api;
}
