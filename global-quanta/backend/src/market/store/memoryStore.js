// Kho dữ liệu in-memory (mặc định, không cần cấu hình). Mất dữ liệu khi khởi
// động lại — production nên dùng MARKET_STORE=supabase.
//
// Quy tắc tự lành (giống trigger trong migration Supabase): bản ghi từ SSI
// không bao giờ bị bản ghi từ nguồn dự phòng ghi đè; ngược lại bản ghi dự
// phòng luôn bị bản ghi SSI thay thế khi Reconciler lấy lại dữ liệu.

export const isSsiSource = (source) => String(source || "").startsWith("SSI");

export function shouldReplace(existingSource, incomingSource) {
  if (!existingSource) return true;
  return isSsiSource(incomingSource) || !isSsiSource(existingSource);
}

/** Bộ lọc kiểu PostgREST tối giản: eq / gte / lte / in, order "col.asc,col2.desc", limit. */
export function selectMemory(rows, { eq = {}, gte = {}, lte = {}, in: inList = {}, order, limit } = {}) {
  let out = rows.filter((r) =>
    Object.entries(eq).every(([k, v]) => r[k] === v)
    && Object.entries(gte).every(([k, v]) => r[k] >= v)
    && Object.entries(lte).every(([k, v]) => r[k] <= v)
    && Object.entries(inList).every(([k, v]) => v.includes(r[k])));
  if (order) {
    const specs = order.split(",").map((s) => { const [col, dir = "asc"] = s.split("."); return { col, sign: dir === "desc" ? -1 : 1 }; });
    out = out.sort((a, b) => {
      for (const { col, sign } of specs) {
        if (a[col] < b[col]) return -sign;
        if (a[col] > b[col]) return sign;
      }
      return 0;
    });
  }
  return limit ? out.slice(0, limit) : out;
}

export function createMemoryStore() {
  const bars = new Map(); // symbol -> Map(date -> bar+source)
  let securities = { rows: [], source: null, updatedAt: null };
  const components = new Map();
  const limits = new Map();
  const events = [];
  const daily = new Map(); // date -> Map(symbol -> row)
  const kv = new Map();
  const fundamentals = new Map();
  const tickFlow = new Map(); // `${symbol}|${date}` -> Map(minute -> row)
  const tables = new Map(); // bảng nghiên cứu: tên -> Map(khoá chính -> dòng snake_case)

  return {
    kind: "memory",

    // ---------- Dữ liệu ngày toàn thị trường (Siêu Quét) ----------
    async upsertMarketDaily(rows) {
      for (const row of rows) {
        if (!daily.has(row.date)) daily.set(row.date, new Map());
        daily.get(row.date).set(row.symbol, { ...row });
      }
      return rows.length;
    },
    async getMarketDailyDates() {
      return [...daily.keys()].filter((d) => daily.get(d).size > 0).sort();
    },
    async getMarketDailyByDate(date) {
      return [...(daily.get(date)?.values() ?? [])];
    },
    async getMarketDailyRange({ from, to, symbols }) {
      const wanted = symbols ? new Set(symbols) : null;
      const out = [];
      for (const [date, rows] of daily) {
        if (date < from || date > to) continue;
        for (const row of rows.values()) if (!wanted || wanted.has(row.symbol)) out.push(row);
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
    async applyAdjustment(symbol, upToDate, factor) {
      let n = 0;
      for (const [date, rows] of daily) {
        if (date > upToDate) continue;
        const row = rows.get(symbol);
        if (row) { row.closeAdj *= factor; n++; }
      }
      return n;
    },

    // ---------- Khoá-giá trị (kết quả quét, universe, bảng ngành) ----------
    async getKv(key) {
      return kv.get(key) ?? null;
    },
    async setKv(key, value) {
      kv.set(key, { value, updatedAt: new Date().toISOString() });
    },

    // ---------- BCTC lưu đệm ----------
    async getFundamentals(tickers) {
      const out = new Map();
      for (const t of tickers) if (fundamentals.has(t)) out.set(t, fundamentals.get(t));
      return out;
    },
    async upsertFundamentals(entries) {
      for (const e of entries) fundamentals.set(e.ticker, { ...e, fetchedAt: e.fetchedAt ?? new Date().toISOString() });
    },

    // ---------- Dòng lệnh Lee–Ready theo phút (IFE) ----------
    async upsertTickFlow(rows) {
      for (const r of rows) {
        const key = `${r.symbol}|${r.date}`;
        if (!tickFlow.has(key)) tickFlow.set(key, new Map());
        tickFlow.get(key).set(r.minute, { minute: r.minute, buy: r.buy, sell: r.sell, unknown: r.unknown, prints: r.prints, sizes: { ...r.sizes } });
      }
      return rows.length;
    },
    async getTickFlowRange({ symbol, from, to }) {
      const out = [];
      for (const [key, minutes] of tickFlow) {
        const [sym, date] = key.split("|");
        if (sym !== symbol || date < from || date > to) continue;
        out.push(...[...minutes.values()].map((m) => ({ symbol, date, ...m })));
      }
      return out.sort((a, b) => a.date.localeCompare(b.date) || a.minute - b.minute);
    },

    // ---------- Bảng nghiên cứu (cùng tên cột snake_case với Supabase) ----------
    async upsertRows(table, rows, conflict) {
      if (!tables.has(table)) tables.set(table, new Map());
      const t = tables.get(table);
      const cols = conflict.split(",");
      for (const r of rows) {
        const key = cols.map((c) => r[c]).join("|");
        t.set(key, { ...(t.get(key) ?? {}), ...structuredClone(r) });
      }
      return rows.length;
    },
    async selectRows(table, query = {}) {
      return selectMemory([...(tables.get(table)?.values() ?? [])], query).map((r) => structuredClone(r));
    },
    async deleteRows(table, query = {}) {
      const t = tables.get(table);
      if (!t) return 0;
      const doomed = new Set(selectMemory([...t.values()], query));
      for (const [k, v] of t) if (doomed.has(v)) t.delete(k);
      return doomed.size;
    },
    async rpc() {
      return null; // view/hàm SQL chỉ có trên Supabase
    },

    async upsertBars(symbol, list, source) {
      if (!bars.has(symbol)) bars.set(symbol, new Map());
      const series = bars.get(symbol);
      let written = 0;
      for (const bar of list) {
        const existing = series.get(bar.date);
        if (!shouldReplace(existing?.source, source)) continue;
        series.set(bar.date, { ...bar, source });
        written++;
      }
      return written;
    },

    async getBars(symbol, from, to) {
      const series = bars.get(symbol);
      if (!series) return [];
      return [...series.values()]
        .filter((b) => b.date >= from && b.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async listNonSsiBars(since) {
      const out = [];
      for (const [symbol, series] of bars) {
        for (const bar of series.values()) if (bar.date >= since && !isSsiSource(bar.source)) out.push({ symbol, date: bar.date, close: bar.close, source: bar.source });
      }
      return out;
    },

    async coverage(symbol) {
      const series = bars.get(symbol);
      if (!series?.size) return null;
      const dates = [...series.keys()].sort();
      return { first: dates[0], last: dates.at(-1), count: dates.length };
    },

    async setSecurities(rows, source) {
      securities = { rows, source, updatedAt: new Date().toISOString() };
    },
    async getSecurities() {
      return securities.rows.length ? securities : null;
    },

    async setIndexComponents(code, symbols, source) {
      components.set(code, { symbols, source, updatedAt: new Date().toISOString() });
    },
    async getIndexComponents(code) {
      return components.get(code) ?? null;
    },

    async setPriceLimits(date, rows, source) {
      limits.set(date, { rows, source, updatedAt: new Date().toISOString() });
    },
    async getPriceLimits(date) {
      return limits.get(date) ?? null;
    },

    async recordSourceEvent(event) {
      events.push({ ...event, createdAt: new Date().toISOString() });
      if (events.length > 500) events.shift();
    },
    async getSourceEvents(limit = 50) {
      return events.slice(-limit).reverse();
    },
  };
}
