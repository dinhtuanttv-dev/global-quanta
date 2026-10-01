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

export function createMemoryStore() {
  const bars = new Map(); // symbol -> Map(date -> bar+source)
  let securities = { rows: [], source: null, updatedAt: null };
  const components = new Map();
  const limits = new Map();
  const events = [];

  return {
    kind: "memory",

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
