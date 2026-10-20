// D1 (2026-10-20) — đệm cho selectRows() (bảng nghiên cứu / người dùng / chuỗi điều chỉnh) trên kho phân vùng.
//
// Hai cơ chế, chọn theo HÌNH DẠNG truy vấn:
//   1. Bảng theo ngày (market_flow_daily, market_volume_profile_daily) + truy vấn chỉ lọc trading_date (eq / in / gte / lte):
//      phân vùng THEO NGÀY chứa đủ cột (select=*), tải một lần, ngày mới chỉ tải ngày mới. Truy vấn theo khoảng có thêm
//      KIỂM ĐẾM (HEAD count=exact, ~0 byte) so với tổng số dòng các phân vùng — lệch là đọc thẳng Supabase (không đoán).
//   2. Mọi truy vấn khác trên bảng chỉ Gateway ghi: đệm NGUYÊN KẾT QUẢ theo đúng truy vấn; mỗi lần ghi bảng (upsertRows /
//      deleteRows / rpc) vô hiệu hoá theo nhóm (cả bảng, hoặc chỉ symbol / user_id bị ghi).
// Bảng không có trong danh sách -> luôn đọc thẳng như cũ.
import { createValueCache, currentSeq } from "./partitionCache.js";

export const DATE_TABLES = new Set(["market_flow_daily", "market_volume_profile_daily"]);
// bảng -> cột phân nhóm vô hiệu hoá (null = cả bảng)
export const CACHED_TABLES = {
  market_flow_daily: "symbol",
  market_volume_profile_daily: "symbol",
  market_regime_daily: null,
  market_signal_ledger: "symbol",
  market_signal_outcomes: "symbol",
  market_model_weights: null,
  market_tick_flow_daily: "symbol",
  market_adjusted_series: "symbol",
  market_radar_snapshots: "user_id",
  market_user_watchlists: "user_id",
  market_user_chart_state: "user_id",
  market_research_dataset_mv: null,
  market_signal_performance_mv: null,
};
// Ghi bảng A làm đổi bảng B (khoá ngoại on delete cascade).
const DEPENDENTS = { market_signal_ledger: ["market_signal_outcomes"] };
// Hàm RPC -> bảng bị đổi (không biết -> mọi bảng).
const RPC_TABLES = {
  market_rollup_tick_flow: ["market_tick_flow_daily"],
  market_prune_tick_flow: [],
  market_refresh_research: ["market_research_dataset_mv", "market_signal_performance_mv"],
};
const SELECT_ALL_CAP = 100_000; // selectAll dừng ở 100 trang × 1000 dòng — giữ đúng hành vi đó khi giả lập

const PLAIN_SELECT = /^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$/;
const PLAIN_ORDER = /^[a-z_][a-z0-9_]*(\.(asc|desc))?(,[a-z_][a-z0-9_]*(\.(asc|desc))?)*$/;

const isNum = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
function cmpScalar(a, b) {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
function cmpFilter(rowValue, v) {
  // so sánh như Postgres theo kiểu cột: cột số so số, còn lại so chuỗi (ngày ISO so chuỗi đúng thứ tự)
  if (typeof rowValue === "number" && isNum(v)) return rowValue - Number(v);
  return cmpScalar(String(rowValue), String(v));
}

/** Giả lập PostgREST trên các dòng đủ cột: lọc eq/gte/lte/in, sắp (asc nulls last, desc nulls first), chọn cột, limit. */
export function emulateSelect(rows, { select, eq = {}, gte = {}, lte = {}, in: inList = {}, order, limit } = {}) {
  let out = rows.filter((r) =>
    Object.entries(eq).every(([k, v]) => r[k] !== null && r[k] !== undefined && cmpFilter(r[k], v) === 0)
    && Object.entries(gte).every(([k, v]) => r[k] !== null && r[k] !== undefined && cmpFilter(r[k], v) >= 0)
    && Object.entries(lte).every(([k, v]) => r[k] !== null && r[k] !== undefined && cmpFilter(r[k], v) <= 0)
    && Object.entries(inList).every(([k, vs]) => r[k] !== null && r[k] !== undefined && vs.some((v) => cmpFilter(r[k], v) === 0)));
  if (order) {
    const specs = order.split(",").map((s) => { const [col, dir = "asc"] = s.split("."); return { col, desc: dir === "desc" }; });
    out = out.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => {
      for (const { col, desc } of specs) {
        const x = a[col], y = b[col];
        const xn = x === null || x === undefined, yn = y === null || y === undefined;
        if (xn || yn) { if (xn && yn) continue; return (xn ? 1 : -1) * (desc ? -1 : 1); }
        const c = cmpScalar(x, y);
        if (c) return desc ? -c : c;
      }
      return ia - ib;
    }).map(([r]) => r);
  }
  if (limit) out = out.slice(0, limit);
  else if (out.length > SELECT_ALL_CAP) out = out.slice(0, SELECT_ALL_CAP);
  if (select) {
    const cols = select.split(",");
    out = out.map((r) => { const o = {}; for (const c of cols) if (c in r) o[c] = r[c]; return o; });
  }
  return out;
}

/** Truy vấn chỉ lọc theo trading_date (dùng được phân vùng theo ngày)? */
export function dateOnlyShape(query) {
  const { select, eq = {}, gte = {}, lte = {}, in: inList = {}, order, limit, ...rest } = query;
  if (Object.keys(rest).length || limit) return null;
  if (select && !PLAIN_SELECT.test(select)) return null;
  if (order && !PLAIN_ORDER.test(order)) return null;
  const cols = new Set([...Object.keys(eq), ...Object.keys(gte), ...Object.keys(lte), ...Object.keys(inList)]);
  if (cols.size !== 1 || !cols.has("trading_date")) return null;
  if (eq.trading_date !== undefined) return { kind: "dates", dates: [String(eq.trading_date)], range: false };
  // IN > 100 giá trị: nhánh đọc thẳng chia nhóm rồi nối (thứ tự đặc thù) -> để đệm nguyên kết quả xử lý.
  if (inList.trading_date) return inList.trading_date.length > 100 ? null : { kind: "dates", dates: [...new Set(inList.trading_date.map(String))], range: false };
  return { kind: "range", from: gte.trading_date !== undefined ? String(gte.trading_date) : null, to: lte.trading_date !== undefined ? String(lte.trading_date) : null, range: true };
}

/**
 * raw: { selectAll(path), selectOnce(path), countRows(path) -> number, dailyDates() -> [dates], postgrestQuery, stableOrder }
 */
export function createTableCache({ wh, raw, log = console }) {
  const enc = encodeURIComponent;
  const stats = { partitionHits: 0, queryHits: 0, guardMismatch: 0 };
  const groupKey = (table, col, v) => (col && v !== undefined && v !== null ? `${table}|${col}=${v}` : `${table}|*`);
  // khoá truy vấn -> nhóm: bảng (luôn) + nhóm con nếu lọc eq trên cột phân nhóm
  const queries = createValueCache({
    wh, ns: "q", size: (rows) => JSON.stringify(rows).length,
    groups: (key) => {
      const { table, query } = JSON.parse(key);
      const col = CACHED_TABLES[table];
      const v = col ? query.eq?.[col] : undefined;
      return [`${table}|#`, groupKey(table, col, v)];
    },
  });
  const partitions = new Map(); // table -> valueCache theo ngày
  // Ngày có dòng nhưng không nằm trong lịch phiên market_daily (VD tiến trình ghi trước khi đồng bộ ngày) — lưu bền.
  for (const t of DATE_TABLES) wh.register(`dpx-${t}`, { size: () => 4096, pinned: true });
  const extraDates = (table) => wh.get(`dpx-${table}`, "dates")?.list ?? [];
  function addExtraDates(table, dates) {
    const cur = new Set(extraDates(table));
    const add = dates.filter((d) => !cur.has(d));
    if (add.length) wh.putSync(`dpx-${table}`, "dates", { list: [...cur, ...add].sort() });
  }
  function datePart(table) {
    if (!partitions.has(table)) partitions.set(table, createValueCache({ wh, ns: `dp-${table}`, size: (rows) => JSON.stringify(rows).length, groups: () => [`${table}|#`] }));
    return partitions.get(table);
  }

  async function loadDates(table, dates) {
    return datePart(table).getMany(dates, async (missing) => {
      const got = new Map(missing.map((d) => [d, []]));
      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        const rows = await raw.selectAll(`${table}?trading_date=in.(${chunk.map(enc).join(",")})&order=trading_date.asc,symbol.asc`);
        for (const r of rows) got.get(String(r.trading_date))?.push(r);
      }
      return got;
    });
  }

  async function select(table, query, direct) {
    if (!(table in CACHED_TABLES)) return direct();
    const shape = DATE_TABLES.has(table) ? dateOnlyShape(query) : null;
    if (shape) {
      let dates = shape.dates;
      if (shape.kind === "range") {
        const all = [...new Set([...(await raw.dailyDates()), ...extraDates(table)])].sort();
        dates = all.filter((d) => (shape.from === null || d >= shape.from) && (shape.to === null || d <= shape.to));
      }
      const s0 = currentSeq();
      const parts = await loadDates(table, dates);
      const rows = dates.flatMap((d) => parts.get(d) ?? []);
      if (shape.range) {
        // Kiểm đếm: dòng nằm ngoài lịch phiên market_daily (hoặc ghi từ nơi khác) -> không giả lập.
        const filter = raw.postgrestQuery({ gte: query.gte, lte: query.lte });
        const n = await raw.countRows(`${table}?${filter}`);
        if (n !== rows.length) {
          stats.guardMismatch += 1;
          const out = await direct();
          // Lệch vì có ngày ngoài lịch phiên -> ghi nhớ ngày đó (lần sau phân vùng đủ); lệch vì lý do khác -> làm mới phân vùng.
          const known = new Set(dates);
          const extra = [...new Set(out.map((r) => r.trading_date).filter((d) => d !== undefined && !known.has(String(d))))].map(String);
          if (extra.length && currentSeq() === s0) addExtraDates(table, extra);
          else if (currentSeq() === s0) { log.warn?.(`[warehouse] ${table} lệch số dòng (${n} ≠ ${rows.length}) cho ${filter} — làm mới phân vùng.`); datePart(table).reset(); }
          return out;
        }
      }
      stats.partitionHits += 1;
      const order = raw.stableOrder(table, query.order);
      // Phân vùng đã theo (trading_date, symbol) tăng dần; thứ tự khác -> sắp lại như Postgres.
      const sorted = order === "trading_date.asc,symbol.asc" ? emulateSelect(rows, { select: query.select }) : emulateSelect(rows, { select: query.select, order });
      return structuredClone(sorted); // nơi gọi có thể sửa dòng -> không làm hỏng phân vùng
    }
    const key = JSON.stringify({ table, query });
    let fromDirect = false;
    const rows = await queries.get(key, async () => { fromDirect = true; return direct(); }, { cacheIf: (r) => Array.isArray(r) && r.length < SELECT_ALL_CAP });
    if (!fromDirect) stats.queryHits += 1;
    return structuredClone(rows); // nơi gọi có thể sửa dòng -> không làm hỏng bản đệm
  }

  /** Gọi TRƯỚC và SAU mỗi lệnh ghi bảng. rows = dòng được ghi (null = không rõ -> cả bảng). */
  function invalidateWrite(table, rows) {
    const tables = [table, ...(DEPENDENTS[table] ?? [])].filter((t) => t in CACHED_TABLES);
    for (const t of tables) {
      const col = CACHED_TABLES[t];
      const groups = new Set([`${t}|*`]);
      if (!rows || !col || t !== table) groups.add(`${t}|#`);
      else for (const r of rows) groups.add(groupKey(t, col, r[col]));
      queries.invalidateGroups([...groups]);
      if (DATE_TABLES.has(t)) {
        if (!rows || t !== table) datePart(t).invalidateGroups([`${t}|#`]);
        else {
          const ds = [...new Set(rows.map((r) => r.trading_date).filter(Boolean).map(String))];
          for (const d of ds) datePart(t).invalidate(d);
          addExtraDates(t, ds); // ngày vừa ghi luôn là ứng viên của truy vấn khoảng
        }
      }
    }
  }
  function invalidateRpc(fn) {
    const tables = RPC_TABLES[fn] ?? Object.keys(CACHED_TABLES);
    for (const t of tables) invalidateWrite(t, null);
  }

  function reset() {
    queries.reset();
    for (const t of DATE_TABLES) { datePart(t).reset(); wh.dropNs(`dpx-${t}`); }
  }

  return { select, invalidateWrite, invalidateRpc, reset, stats: () => ({ ...stats }) };
}
