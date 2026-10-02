// Kho dữ liệu Supabase Postgres qua PostgREST (không cần thêm thư viện).
// Schema: supabase/migrations/20261001000000_market_data.sql. Dùng
// SUPABASE_SECRET_KEY (chỉ ở server) nên bỏ qua RLS.
//
// Quy tắc "SSI không bị nguồn dự phòng ghi đè" được trigger trong DB đảm bảo,
// nên phía này luôn upsert kiểu merge-duplicates.

import { isSsiSource, selectMemory } from "./memoryStore.js";

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

export function createSupabaseStore({ fetchImpl = globalThis.fetch } = {}) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("MARKET_STORE=supabase cần SUPABASE_URL và SUPABASE_SECRET_KEY.");

  async function request(path, { method = "GET", body, prefer, range } = {}) {
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
    return text ? JSON.parse(text) : null;
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
  const rowToDaily = (r) => ({
    symbol: r.symbol, date: r.trading_date, exchange: r.exchange,
    open: n(r.open), high: n(r.high), low: n(r.low), close: n(r.close), closeAdj: n(r.close_adj),
    refPrice: n(r.ref_price), ceiling: n(r.ceiling), floor: n(r.floor),
    volume: n(r.volume), value: n(r.value), dealVolume: n(r.deal_volume), dealValue: n(r.deal_value),
    foreignBuyVol: n(r.foreign_buy_vol), foreignSellVol: n(r.foreign_sell_vol),
    foreignBuyVal: n(r.foreign_buy_val), foreignSellVal: n(r.foreign_sell_val), foreignRoom: n(r.foreign_room),
  });

  return {
    kind: "supabase",

    // ---------- Dữ liệu ngày toàn thị trường (Siêu Quét) ----------
    async upsertMarketDaily(rows) {
      await upsert("market_daily", rows.map(dailyToRow), "symbol,trading_date");
      return rows.length;
    },
    async getMarketDailyDates() {
      const rows = await selectAll("market_daily_dates?order=trading_date.asc");
      return rows.map((r) => r.trading_date);
    },
    async getMarketDailyByDate(date) {
      return (await selectAll(`market_daily?trading_date=eq.${date}&order=symbol.asc`)).map(rowToDaily);
    },
    async getMarketDailyRange({ from, to, symbols }) {
      const out = [];
      const chunks = symbols ? Array.from({ length: Math.ceil(symbols.length / 100) }, (_, i) => symbols.slice(i * 100, i * 100 + 100)) : [null];
      for (const chunk of chunks) {
        const filter = chunk ? `&symbol=in.(${chunk.map(enc).join(",")})` : "";
        out.push(...(await selectAll(`market_daily?trading_date=gte.${from}&trading_date=lte.${to}${filter}&order=trading_date.asc,symbol.asc`)).map(rowToDaily));
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
    async applyAdjustment(symbol, upToDate, factor) {
      return request("rpc/market_apply_adjustment", { method: "POST", body: { p_symbol: symbol, p_upto: upToDate, p_factor: factor } });
    },

    // ---------- Khoá-giá trị (kết quả quét, universe, bảng ngành) ----------
    async getKv(key) {
      const rows = await request(`market_kv?key=eq.${enc(key)}`);
      return rows?.[0] ? { value: rows[0].value, updatedAt: rows[0].updated_at } : null;
    },
    async setKv(key, value) {
      await upsert("market_kv", [{ key, value, updated_at: new Date().toISOString() }], "key");
    },

    // ---------- BCTC lưu đệm ----------
    async getFundamentals(tickers) {
      const out = new Map();
      for (let i = 0; i < tickers.length; i += 100) {
        const chunk = tickers.slice(i, i + 100);
        for (const r of await selectAll(`market_fundamentals?ticker=in.(${chunk.map(enc).join(",")})`)) {
          out.set(r.ticker, { ticker: r.ticker, income: r.income, balance: r.balance, fetchedAt: r.fetched_at });
        }
      }
      return out;
    },
    async upsertFundamentals(entries) {
      await upsert("market_fundamentals", entries.map((e) => ({
        ticker: e.ticker, income: e.income, balance: e.balance, fetched_at: e.fetchedAt ?? new Date().toISOString(),
      })), "ticker");
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
      await upsert(table, rows, conflict);
      return rows.length;
    },
    async selectRows(table, query = {}) {
      const { in: inList = {} } = query;
      const [inCol, inValues] = Object.entries(inList)[0] ?? [];
      // Danh sách IN dài -> chia nhỏ để URL không quá dài.
      if (inCol && inValues.length > 100) {
        const out = [];
        for (let i = 0; i < inValues.length; i += 100) {
          out.push(...(await this.selectRows(table, { ...query, in: { ...inList, [inCol]: inValues.slice(i, i + 100) } })));
        }
        return query.order ? selectMemory(out, { order: query.order, limit: query.limit }) : out;
      }
      // Đọc nhiều trang: thứ tự phải duy nhất (bổ sung khoá chính).
      const path = `${table}?${postgrestQuery(query.limit ? query : { ...query, order: stableOrder(table, query.order) })}`;
      return query.limit ? (await request(path)) ?? [] : selectAll(path);
    },
    async deleteRows(table, query = {}) {
      const q = postgrestQuery({ ...query, select: undefined, order: undefined, limit: undefined });
      if (!q) throw new Error("deleteRows cần điều kiện lọc.");
      await request(`${table}?${q}`, { method: "DELETE" });
      return null;
    },
    async rpc(fn, args = {}) {
      return request(`rpc/${fn}`, { method: "POST", body: args });
    },

    async upsertBars(symbol, list, source) {
      if (!list.length) return 0;
      await upsert("market_ohlcv_daily", list.map((b) => ({
        symbol, trading_date: b.date, open: b.open, high: b.high, low: b.low, close: b.close,
        volume: b.volume, value: b.value, source, ingested_at: new Date().toISOString(),
      })), "symbol,trading_date");
      return list.length;
    },

    async getBars(symbol, from, to) {
      const rows = await selectAll(`market_ohlcv_daily?symbol=eq.${enc(symbol)}&trading_date=gte.${from}&trading_date=lte.${to}&order=trading_date.asc`);
      return rows.map((r) => ({
        date: r.trading_date, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
        volume: Number(r.volume), value: r.value === null ? null : Number(r.value), source: r.source,
      }));
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
      await upsert("market_securities", rows.map((s) => ({
        symbol: s.symbol, exchange: s.exchange, name: s.name, name_en: s.nameEn, sector: s.sector,
        listed_shares: s.listedShares, source, updated_at: new Date().toISOString(),
      })), "symbol");
    },
    async getSecurities() {
      const rows = await selectAll("market_securities?order=symbol.asc");
      if (!rows.length) return null;
      return {
        rows: rows.map((r) => ({ symbol: r.symbol, exchange: r.exchange, name: r.name, nameEn: r.name_en, sector: r.sector, listedShares: r.listed_shares })),
        source: rows[0].source,
        updatedAt: rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), ""),
      };
    },

    async setIndexComponents(code, symbols, source) {
      await request(`market_index_components?index_code=eq.${enc(code)}`, { method: "DELETE" });
      await upsert("market_index_components", symbols.map((symbol) => ({
        index_code: code, symbol, source, updated_at: new Date().toISOString(),
      })), "index_code,symbol");
    },
    async getIndexComponents(code) {
      const rows = await selectAll(`market_index_components?index_code=eq.${enc(code)}&order=symbol.asc`);
      if (!rows.length) return null;
      return { symbols: rows.map((r) => r.symbol), source: rows[0].source, updatedAt: rows[0].updated_at };
    },

    async setPriceLimits(date, rows, source) {
      await upsert("market_price_limits", rows.map((r) => ({
        symbol: r.symbol, trading_date: date, ref_price: r.refPrice, ceiling: r.ceiling, floor: r.floor, source,
      })), "symbol,trading_date");
    },
    async getPriceLimits(date) {
      const rows = await selectAll(`market_price_limits?trading_date=eq.${date}`);
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
  };
}
