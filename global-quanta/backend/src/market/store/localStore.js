// M0 (2026-10-22) — KHO CỤC BỘ BỀN trên Railway Volume: cùng giao diện + ngữ nghĩa với memoryStore (đã có test),
// nhưng dữ liệu nằm trên đĩa theo đoạn và nạp lười vào RAM (LRU theo byte):
//   md/<ngày>                 dữ liệu ngày toàn thị trường (dạng cột: header + mảng giá trị)
//   kv/<khoá>                 tài liệu KV { value, updatedAt }
//   fund/<mã>                 BCTC lưu đệm
//   tick/<mã>/<ngày>          dòng lệnh Lee–Ready theo phút
//   tbl/<bảng>/<tháng|all>    bảng nghiên cứu (khoá chính theo PRIMARY_KEYS), chia tháng theo cột ngày
//   bars/<mã>                 nến ngày market_ohlcv_daily (+ chỉ mục nguồn không phải SSI)
//   misc/*, ic/*, pl/*        danh mục mã, thành phần chỉ số, giá trần/sàn, nhật ký nguồn
// Dùng làm kho CHÍNH (localFirstStore): Supabase chỉ còn là bản sao phụ -> lượt đọc Supabase ~ 0.
import { createSegments } from "./diskSegments.js";
import { isSsiSource, selectMemory, shouldReplace } from "./memoryStore.js";
import { PRIMARY_KEYS } from "./supabaseStore.js";

const DATE_COL = {
  market_flow_daily: "trading_date", market_volume_profile_daily: "trading_date", market_regime_daily: "trading_date",
  market_signal_ledger: "signal_date", market_signal_outcomes: "signal_date", market_tick_flow_daily: "trading_date",
};
const DAILY_FIELDS = ["symbol", "date", "exchange", "open", "high", "low", "close", "closeAdj", "refPrice", "ceiling", "floor", "volume", "value",
  "dealVolume", "dealValue", "foreignBuyVol", "foreignSellVol", "foreignBuyVal", "foreignSellVal", "foreignRoom"];

const monthsBetween = (from, to) => {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 600) break; }
  return out;
};
const project = (row, select) => {
  if (!select || select === "*") return row;
  const cols = select.split(",").map((s) => s.trim()).filter(Boolean);
  if (cols.some((c) => !/^[a-z_][a-z0-9_]*$/i.test(c))) return row; // biểu thức PostgREST phức tạp -> trả nguyên dòng
  const o = {}; for (const c of cols) if (c in row) o[c] = row[c]; return o;
};

export function createLocalStore({ dir = null, ramMb = 96, log = console, now = Date.now } = {}) {
  const seg = createSegments({ dir, ramMb, log });
  let mdDates = null; // Set các ngày có dữ liệu (đọc từ thư mục một lần, cập nhật khi ghi)

  // ---------- market_daily ----------
  const packDay = (rows) => ({ cols: DAILY_FIELDS, rows: rows.map((r) => DAILY_FIELDS.map((f) => r[f] ?? null)) });
  const unpackDay = (doc) => (doc?.rows ?? []).map((a) => { const o = {}; doc.cols.forEach((c, i) => { o[c] = a[i]; }); return o; });
  const dayMap = (date) => {
    const doc = seg.get(`md/${date}`);
    return new Map(unpackDay(doc).map((r) => [r.symbol, r]));
  };
  const putDay = (date, map) => seg.put(`md/${date}`, packDay([...map.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : 1))));
  const dates = () => { if (!mdDates) mdDates = new Set(seg.list("md")); return mdDates; };

  // ---------- bảng nghiên cứu ----------
  const pkOf = (table, conflict) => (conflict ? conflict.split(",") : PRIMARY_KEYS[table] ?? null);
  const partOf = (table, row) => { const c = DATE_COL[table]; return c && row[c] ? String(row[c]).slice(0, 7) : "all"; };
  function partsFor(table, q = {}) {
    const c = DATE_COL[table];
    const all = seg.list(`tbl/${table}`);
    if (!c) return all;
    const eq = q.eq?.[c], gte = q.gte?.[c], lte = q.lte?.[c], inL = q.in?.[c];
    if (eq) return all.filter((p) => p === String(eq).slice(0, 7));
    if (inL) { const s = new Set(inL.map((d) => String(d).slice(0, 7))); return all.filter((p) => s.has(p)); }
    return all.filter((p) => p === "all" || ((!gte || p >= String(gte).slice(0, 7)) && (!lte || p <= String(lte).slice(0, 7))));
  }
  const tableRows = (table, q) => partsFor(table, q).flatMap((p) => Object.values(seg.get(`tbl/${table}/${p}`) ?? {}));

  const api = {
    kind: "local",

    async upsertMarketDaily(rows) {
      const byDate = new Map();
      for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
      for (const [date, list] of byDate) {
        const m = dayMap(date);
        for (const r of list) m.set(r.symbol, { ...r });
        putDay(date, m);
        dates().add(date);
      }
      return rows.length;
    },
    async getMarketDailyDates() { return [...dates()].sort(); },
    async getMarketDailyByDate(date) { return dates().has(date) ? [...dayMap(date).values()] : []; },
    async getMarketDailyRange({ from, to, symbols }) {
      const wanted = symbols ? new Set(symbols) : null;
      const out = [];
      for (const d of [...dates()].sort()) {
        if (d < from || d > to) continue;
        for (const r of dayMap(d).values()) if (!wanted || wanted.has(r.symbol)) out.push(r);
      }
      return out;
    },
    async applyAdjustment(symbol, upToDate, factor) {
      let n = 0;
      for (const d of dates()) {
        if (d > upToDate) continue;
        const m = dayMap(d);
        const r = m.get(symbol);
        if (r && r.closeAdj != null) { r.closeAdj *= factor; n++; putDay(d, m); }
      }
      return n;
    },

    async getKv(key) { const v = seg.get(`kv/${key}`); return v ? structuredClone(v) : null; },
    async setKv(key, value, updatedAt = new Date(now()).toISOString()) { seg.put(`kv/${key}`, { value: structuredClone(value), updatedAt }); },
    hasKv(key) { return seg.get(`kv/${key}`) !== undefined; },

    async getFundamentals(tickers) {
      const out = new Map();
      for (const t of tickers) { const v = seg.get(`fund/${t}`); if (v) out.set(t, structuredClone(v)); }
      return out;
    },
    async upsertFundamentals(entries) {
      for (const e of entries) seg.put(`fund/${e.ticker}`, { ...structuredClone(e), fetchedAt: e.fetchedAt ?? new Date(now()).toISOString() });
    },

    async upsertTickFlow(rows) {
      const by = new Map();
      for (const r of rows) { const k = `tick/${r.symbol}/${r.date}`; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
      for (const [k, list] of by) {
        const m = seg.get(k) ?? {};
        for (const r of list) m[r.minute] = { minute: r.minute, buy: r.buy, sell: r.sell, unknown: r.unknown, prints: r.prints, sizes: { ...(r.sizes ?? {}) } };
        seg.put(k, m);
      }
      return rows.length;
    },
    async getTickFlowRange({ symbol, from, to }) {
      const out = [];
      for (const d of seg.list(`tick/${symbol}`)) {
        if (d < from || d > to) continue;
        for (const m of Object.values(seg.get(`tick/${symbol}/${d}`) ?? {})) out.push({ symbol, date: d, ...m, minute: Number(m.minute) });
      }
      return out.sort((a, b) => a.date.localeCompare(b.date) || a.minute - b.minute);
    },

    async upsertRows(table, rows, conflict) {
      const cols = pkOf(table, conflict);
      if (!cols) throw new Error(`Bảng ${table} chưa khai báo khoá chính cho kho cục bộ.`);
      const by = new Map();
      for (const r of rows) { const p = partOf(table, r); if (!by.has(p)) by.set(p, []); by.get(p).push(r); }
      for (const [p, list] of by) {
        const id = `tbl/${table}/${p}`;
        const t = seg.get(id) ?? {};
        for (const r of list) { const k = cols.map((c) => r[c]).join("|"); t[k] = { ...(t[k] ?? {}), ...structuredClone(r) }; }
        seg.put(id, t);
      }
      return rows.length;
    },
    async selectRows(table, query = {}) {
      return selectMemory(tableRows(table, query), query).map((r) => project(structuredClone(r), query.select));
    },
    async deleteRows(table, query = {}) {
      let n = 0;
      for (const p of partsFor(table, query)) {
        const id = `tbl/${table}/${p}`;
        const t = seg.get(id);
        if (!t) continue;
        const doomed = new Set(selectMemory(Object.values(t), query));
        for (const [k, v] of Object.entries(t)) if (doomed.has(v)) { delete t[k]; n++; }
        seg.put(id, t);
      }
      return n;
    },
    hasTable(table) { return seg.list(`tbl/${table}`).length > 0; },
    async rpc() { return null; },

    async upsertBars(symbol, list, source) {
      const series = seg.get(`bars/${symbol}`) ?? {};
      const nonSsi = seg.get("misc/bars-nonssi") ?? {};
      let written = 0, nonSsiChanged = false;
      for (const bar of list) {
        if (!shouldReplace(series[bar.date]?.source, source)) continue;
        series[bar.date] = { ...bar, source };
        written++;
        const set = new Set(nonSsi[symbol] ?? []);
        const had = set.has(bar.date);
        if (isSsiSource(source)) set.delete(bar.date); else set.add(bar.date);
        if (had !== set.has(bar.date)) { nonSsi[symbol] = [...set].sort(); nonSsiChanged = true; }
      }
      if (written) seg.put(`bars/${symbol}`, series);
      if (nonSsiChanged) seg.put("misc/bars-nonssi", nonSsi);
      return written;
    },
    async getBars(symbol, from, to) {
      const series = seg.get(`bars/${symbol}`);
      if (!series) return [];
      return Object.values(series).filter((b) => b.date >= from && b.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ ...b }));
    },
    async listNonSsiBars(since) {
      const idx = seg.get("misc/bars-nonssi") ?? {};
      const out = [];
      for (const [symbol, list] of Object.entries(idx)) {
        const series = seg.get(`bars/${symbol}`) ?? {};
        for (const d of list) if (d >= since && series[d] && !isSsiSource(series[d].source)) out.push({ symbol, date: d, close: series[d].close, source: series[d].source });
      }
      return out;
    },
    async coverage(symbol) {
      const series = seg.get(`bars/${symbol}`);
      const keys = series ? Object.keys(series).sort() : [];
      return keys.length ? { first: keys[0], last: keys.at(-1), count: keys.length } : null;
    },

    async setSecurities(rows, source) { seg.put("misc/securities", { rows, source, updatedAt: new Date(now()).toISOString() }); },
    async getSecurities() { const v = seg.get("misc/securities"); return v?.rows?.length ? structuredClone(v) : null; },
    async setIndexComponents(code, symbols, source) { seg.put(`ic/${code}`, { symbols, source, updatedAt: new Date(now()).toISOString() }); },
    async getIndexComponents(code) { const v = seg.get(`ic/${code}`); return v ? structuredClone(v) : null; },
    async setPriceLimits(date, rows, source) { seg.put(`pl/${date}`, { rows, source, updatedAt: new Date(now()).toISOString() }); },
    async getPriceLimits(date) { const v = seg.get(`pl/${date}`); return v ? structuredClone(v) : null; },
    async recordSourceEvent(event) {
      const list = seg.get("misc/source-events") ?? [];
      list.push({ ...event, createdAt: new Date(now()).toISOString() });
      seg.put("misc/source-events", list.slice(-500));
    },
    async getSourceEvents(limit = 50) { return (seg.get("misc/source-events") ?? []).slice(-limit).reverse(); },

    /** Dọn dòng lệnh theo phút cũ hơn `keepDays` ngày (kho Supabase cũ cũng giữ có hạn). */
    prune({ tickKeepDays = 90 } = {}) {
      const cutoff = new Date(now() - tickKeepDays * 86_400_000).toISOString().slice(0, 10);
      let removed = 0;
      for (const sym of seg.listDirs("tick")) for (const d of seg.list(`tick/${sym}`)) if (d < cutoff) { seg.remove(`tick/${sym}/${d}`); removed++; }
      return { removed, cutoff };
    },
    flush() { seg.flushAll(); },
    info() { return { ...seg.stats(), marketDailyDates: dates().size }; },
  };
  return api;
}
