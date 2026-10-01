// Kho dữ liệu Supabase Postgres qua PostgREST (không cần thêm thư viện).
// Schema: supabase/migrations/20261001000000_market_data.sql. Dùng
// SUPABASE_SECRET_KEY (chỉ ở server) nên bỏ qua RLS.
//
// Quy tắc "SSI không bị nguồn dự phòng ghi đè" được trigger trong DB đảm bảo,
// nên phía này luôn upsert kiểu merge-duplicates.

import { isSsiSource } from "./memoryStore.js";

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

  async function upsert(table, rows, conflict) {
    for (let i = 0; i < rows.length; i += 500) {
      await request(`${table}?on_conflict=${conflict}`, {
        method: "POST",
        body: rows.slice(i, i + 500),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    }
  }

  const enc = encodeURIComponent;

  return {
    kind: "supabase",

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
      const rows = await selectAll(`market_ohlcv_daily?select=symbol,trading_date,close,source&trading_date=gte.${since}&source=not.like.SSI*`);
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
