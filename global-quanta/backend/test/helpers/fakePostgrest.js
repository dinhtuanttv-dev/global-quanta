// PostgREST giả lập (tập con dùng bởi supabaseStore) theo ngữ nghĩa Postgres: lọc eq/gte/lte/in/not.like, sắp
// asc nulls last / desc nulls first, phân trang Range, HEAD count=exact, upsert merge-duplicates, DELETE, RPC, view.
// Dùng cho kiểm tra song sinh kho đệm D1 (đọc qua đệm phải GIỐNG HỆT đọc thẳng).

const PK = {
  market_daily: ["symbol", "trading_date"],
  market_ohlcv_daily: ["symbol", "trading_date"],
  market_kv: ["key"],
  market_fundamentals: ["ticker"],
  market_securities: ["symbol"],
  market_index_components: ["index_code", "symbol"],
  market_price_limits: ["symbol", "trading_date"],
  market_flow_daily: ["symbol", "trading_date"],
  market_volume_profile_daily: ["symbol", "trading_date"],
  market_signal_ledger: ["symbol", "signal_date", "signal"],
  market_signal_outcomes: ["symbol", "signal_date", "signal", "horizon"],
  market_adjusted_series: ["symbol"],
  market_user_watchlists: ["user_id"],
  market_regime_daily: ["trading_date"],
};

const STAMPED = new Set(["market_flow_daily", "market_volume_profile_daily", "market_adjusted_series", "market_user_watchlists", "market_regime_daily"]);

function cmp(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
function coerce(rowVal, v) {
  return typeof rowVal === "number" ? Number(v) : v;
}

export function createFakePostgrest({ delay = async () => {} } = {}) {
  const tables = new Map();
  const T = (name) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); };
  const stats = { bytes: 0, requests: 0, heads: 0 };
  let clock = Date.parse("2026-10-20T00:00:00Z");

  function rowsOf(table) {
    if (table === "market_daily_dates") return [...new Set([...T("market_daily").values()].map((r) => r.trading_date))].map((d) => ({ trading_date: d }));
    if (table === "market_ohlcv_coverage") {
      const m = new Map();
      for (const r of T("market_ohlcv_daily").values()) {
        const c = m.get(r.symbol) ?? { symbol: r.symbol, first_date: r.trading_date, last_date: r.trading_date, bar_count: 0 };
        if (r.trading_date < c.first_date) c.first_date = r.trading_date;
        if (r.trading_date > c.last_date) c.last_date = r.trading_date;
        c.bar_count += 1;
        m.set(r.symbol, c);
      }
      return [...m.values()];
    }
    return [...T(table).values()];
  }

  function parse(pathAndQuery) {
    const [table, qs = ""] = pathAndQuery.split("?");
    const q = { table, filters: [], select: null, order: null, limit: null, onConflict: null };
    for (const part of qs.split("&").filter(Boolean)) {
      const i = part.indexOf("=");
      const k = part.slice(0, i), raw = part.slice(i + 1);
      if (k === "select") q.select = decodeURIComponent(raw);
      else if (k === "order") q.order = raw;
      else if (k === "limit") q.limit = Number(raw);
      else if (k === "on_conflict") q.onConflict = raw;
      else {
        const m = /^(not\.)?(eq|gte|lte|in|like)\.(.*)$/.exec(raw);
        if (!m) throw new Error(`fake: không hiểu bộ lọc ${part}`);
        let val = m[3];
        if (m[2] === "in") val = val.replace(/^\(|\)$/g, "").split(",").map(decodeURIComponent);
        else val = decodeURIComponent(val);
        q.filters.push({ col: k, op: m[2], not: !!m[1], val });
      }
    }
    return q;
  }

  function match(r, f) {
    const v = r[f.col];
    let ok;
    if (v === null || v === undefined) ok = false;
    else if (f.op === "eq") ok = cmp(v, coerce(v, f.val)) === 0;
    else if (f.op === "gte") ok = cmp(v, coerce(v, f.val)) >= 0;
    else if (f.op === "lte") ok = cmp(v, coerce(v, f.val)) <= 0;
    else if (f.op === "in") ok = f.val.some((x) => cmp(v, coerce(v, x)) === 0);
    else if (f.op === "like") ok = new RegExp(`^${f.val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(String(v));
    if (v === null || v === undefined) return false; // NOT trên NULL cũng không khớp
    return f.not ? !ok : ok;
  }

  function query(q) {
    let rows = rowsOf(q.table).filter((r) => q.filters.every((f) => match(r, f)));
    if (q.order) {
      const specs = q.order.split(",").map((s) => { const [col, dir = "asc"] = s.split("."); return { col, desc: dir === "desc" }; });
      rows.sort((a, b) => {
        for (const { col, desc } of specs) {
          const x = a[col], y = b[col];
          const xn = x === null || x === undefined, yn = y === null || y === undefined;
          if (xn || yn) { if (xn && yn) continue; return (xn ? 1 : -1) * (desc ? -1 : 1); }
          const c = cmp(x, y);
          if (c) return desc ? -c : c;
        }
        return 0;
      });
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    if (q.select && q.select !== "*") {
      const cols = q.select.split(",");
      rows = rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])));
    }
    return rows.map((r) => JSON.parse(JSON.stringify(r)));
  }

  function upsert(table, body) {
    const t = T(table);
    const pk = PK[table];
    for (const row of body) {
      const k = pk.map((c) => row[c]).join("|");
      const old = t.get(k);
      const now = new Date((clock += 1000)).toISOString().replace("Z", "+00:00");
      const next = { ...(old ?? {}), ...JSON.parse(JSON.stringify(row)) };
      if (table === "market_kv") next.updated_at = row.updated_at.replace("Z", "+00:00");
      else if (STAMPED.has(table)) next.updated_at = row.updated_at ?? now;
      if (table === "market_ohlcv_daily" && old && String(old.source).startsWith("SSI") && !String(row.source).startsWith("SSI")) continue; // trigger giữ SSI
      t.set(k, next);
    }
  }

  async function fetchImpl(url, init = {}) {
    await delay(url, init);
    const path = url.split("/rest/v1/")[1];
    const method = init.method ?? "GET";
    const headers = init.headers ?? {};
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      const args = JSON.parse(init.body ?? "{}");
      if (fn === "market_apply_adjustment") {
        let n = 0;
        for (const r of T("market_daily").values()) if (r.symbol === args.p_symbol && r.trading_date <= args.p_upto) { r.close_adj = Math.round(r.close_adj * args.p_factor * 1e6) / 1e6; n++; }
        return new Response(JSON.stringify(n), { status: 200 });
      }
      if (fn === "market_refresh_research") return new Response("null", { status: 200 });
      throw new Error(`fake: rpc ${fn}`);
    }
    const q = parse(path);
    if (method === "POST") {
      upsert(q.table, JSON.parse(init.body));
      return new Response(null, { status: 201 });
    }
    if (method === "DELETE") {
      const t = T(q.table);
      for (const [k, r] of [...t]) if (q.filters.every((f) => match(r, f))) t.delete(k);
      if (q.table === "market_signal_ledger") {
        const keys = new Set([...t.values()].map((r) => `${r.symbol}|${r.signal_date}|${r.signal}`));
        const o = T("market_signal_outcomes");
        for (const [k, r] of [...o]) if (!keys.has(`${r.symbol}|${r.signal_date}|${r.signal}`)) o.delete(k);
      }
      return new Response(null, { status: 204 });
    }
    const rows = query(q);
    if (method === "HEAD") {
      stats.heads += 1;
      return new Response(null, { status: 200, headers: { "content-range": `*/${rows.length}` } });
    }
    let out = rows;
    const range = headers.range;
    if (range) { const [a, b] = range.split("-").map(Number); out = rows.slice(a, b + 1); }
    const text = JSON.stringify(out);
    stats.bytes += text.length;
    stats.requests += 1;
    return new Response(text, { status: 200 });
  }

  return { fetchImpl, tables, T, stats, upsert };
}
