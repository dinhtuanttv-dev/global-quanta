// D1 (2026-10-20) — các dạng đệm trên kho phân vùng (warehouse.js). Mọi dạng tuân theo cùng một giao thức để KHÔNG bao giờ
// phục vụ dữ liệu cũ:
//   - Mỗi lần ghi đánh dấu phần bị ảnh hưởng HAI lần: trước lệnh ghi (kèm nhật ký đĩa, an toàn khi tiến trình chết) và sau
//     khi lệnh ghi xong. Mỗi dấu mang số thứ tự `seq` tăng dần.
//   - Một lượt đọc ghi nhận s0 = seq lúc bắt đầu; kết quả chỉ được lưu đệm cho phần KHÔNG bị đánh dấu sau s0. Nhờ vậy lượt
//     đọc chạy song song với lệnh ghi không thể ghi đè bản mới bằng bản cũ.
let seq = 0;
const nextSeq = () => ++seq;
export const currentSeq = () => seq;

const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const prevDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

function lowerBound(arr, date) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] < date) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * Phân vùng theo MÃ với khoảng phủ liên tục [lo, hi]: "mọi dòng của mã trong [lo, hi] đã nằm trong đệm (trừ ngày bẩn)".
 * fetchRange(symbols, from, to) / fetchDates(symbols, dates) -> Map(symbol -> dòng thô Supabase).
 */
export function createSymbolRanges({ wh, ns, fetchRange, fetchDates, dateOf = (r) => r.trading_date, rowBytes = 320 }) {
  wh.register(ns, {
    encode: (p) => ({ lo: p.lo, hi: p.hi, rows: [...p.rows.values()], dirty: [...p.dirty.keys()] }),
    decode: (j) => {
      const p = { lo: j.lo, hi: j.hi, rows: new Map(), dirty: new Map(), sorted: null };
      for (const r of j.rows) p.rows.set(dateOf(r), r);
      for (const d of j.dirty ?? []) p.dirty.set(d, 0);
      return p;
    },
    size: (p) => 200 + p.rows.size * rowBytes,
    applyMarks: (p, tokens) => {
      for (const t of tokens) {
        if (t === "*") return emptyPartition();
        if (t.startsWith("<=")) markUpTo(p, t.slice(2), 0);
        else p.dirty.set(t, 0);
      }
      p.sorted = null;
      return p;
    },
  });

  function emptyPartition() {
    return { lo: null, hi: null, rows: new Map(), dirty: new Map(), sorted: null };
  }
  function markUpTo(p, upTo, s) {
    for (const d of p.rows.keys()) if (d <= upTo) p.dirty.set(d, s);
  }
  function load(symbol, create = true) {
    let p = wh.get(ns, symbol);
    if (!p && create) { p = emptyPartition(); wh.put(ns, symbol, p); }
    return p;
  }

  function merge(symbol, from, to, rows, s0, { extend }) {
    const p = load(symbol);
    const got = new Set();
    for (const r of rows) {
      const d = dateOf(r);
      got.add(d);
      if ((p.dirty.get(d) ?? -1) > s0) continue; // bị ghi sau khi lượt đọc bắt đầu -> giữ bẩn
      p.rows.set(d, r);
      p.dirty.delete(d);
    }
    // Ngày trong khoảng đã đọc mà Supabase không trả -> không có dòng (xoá bản đệm nếu có, trừ khi vừa bị ghi).
    for (const d of [...p.rows.keys()]) if (d >= from && d <= to && !got.has(d) && (p.dirty.get(d) ?? -1) <= s0) p.rows.delete(d);
    for (const [d, s] of [...p.dirty]) if (d >= from && d <= to && s <= s0 && !got.has(d)) p.dirty.delete(d);
    if (extend) {
      if (p.lo === null) { p.lo = from; p.hi = to; } else { if (from < p.lo) p.lo = from; if (to > p.hi) p.hi = to; }
    }
    p.sorted = null;
    wh.put(ns, symbol, p);
  }

  function mergeDates(symbol, dates, rows, s0) {
    const p = load(symbol);
    const want = new Set(dates);
    const byDate = new Map(rows.map((r) => [dateOf(r), r]));
    for (const d of want) {
      if ((p.dirty.get(d) ?? -1) > s0) continue;
      const r = byDate.get(d);
      if (r) p.rows.set(d, r); else p.rows.delete(d);
      p.dirty.delete(d);
    }
    p.sorted = null;
    wh.put(ns, symbol, p);
  }

  /** Map(symbol -> dòng thô trong [from, to], tăng dần theo ngày). Chỉ đọc Supabase phần còn thiếu / bẩn. */
  async function read(symbols, from, to) {
    const s0 = currentSeq();
    const uniq = [...new Set(symbols)];
    const ranges = new Map(); // "a|b" -> [symbols]
    const dirtyNeeds = new Map(); // "d1,d2" -> { dates, symbols }
    for (const s of uniq) {
      const p = load(s);
      const add = (a, b) => { if (a > b) return; const k = `${a}|${b}`; if (!ranges.has(k)) ranges.set(k, []); ranges.get(k).push(s); };
      if (p.lo === null) { add(from, to); continue; }
      if (from < p.lo) add(from, prevDay(p.lo));
      if (to > p.hi) add(nextDay(p.hi), to);
      const lo = from > p.lo ? from : p.lo, hi = to < p.hi ? to : p.hi;
      const dd = [...p.dirty.keys()].filter((d) => d >= lo && d <= hi).sort();
      if (dd.length) { const k = dd.join(","); if (!dirtyNeeds.has(k)) dirtyNeeds.set(k, { dates: dd, symbols: [] }); dirtyNeeds.get(k).symbols.push(s); }
    }
    for (const [k, syms] of ranges) {
      const [a, b] = k.split("|");
      const got = await fetchRange(syms, a, b);
      for (const s of syms) merge(s, a, b, got.get(s) ?? [], s0, { extend: true });
    }
    for (const { dates, symbols: syms } of dirtyNeeds.values()) {
      for (let i = 0; i < dates.length; i += 60) {
        const chunk = dates.slice(i, i + 60);
        const got = await fetchDates(syms, chunk);
        for (const s of syms) mergeDates(s, chunk, got.get(s) ?? [], s0);
      }
    }
    const out = new Map();
    for (const s of uniq) {
      const p = load(s);
      if (!p.sorted) p.sorted = [...p.rows.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
      const i0 = lowerBound(p.sorted, from);
      const res = [];
      for (let i = i0; i < p.sorted.length && p.sorted[i][0] <= to; i++) res.push(p.sorted[i][1]);
      out.set(s, res);
    }
    return out;
  }

  /** Đánh dấu bẩn các ngày của từng mã. pairs: [[symbol, date]]; journal = true cho dấu TRƯỚC lệnh ghi. */
  function markDates(pairs, { journal = false } = {}) {
    const s = nextSeq();
    const bySym = new Map();
    for (const [sym, d] of pairs) { if (!bySym.has(sym)) bySym.set(sym, new Set()); bySym.get(sym).add(d); }
    const entries = [];
    for (const [sym, dates] of bySym) {
      const p = load(sym, false);
      if (!p) continue; // chưa từng đệm -> không có gì để làm cũ
      for (const d of dates) { p.dirty.set(d, s); entries.push([ns, sym, d]); }
      p.sorted = null;
      wh.put(ns, sym, p);
    }
    if (journal) wh.journalAppend(entries);
  }
  /** Mọi dòng của mã có ngày ≤ upTo bị đổi (VD điều chỉnh giá theo sự kiện quyền). */
  function markUpToDate(symbol, upTo, { journal = false } = {}) {
    const s = nextSeq();
    const p = load(symbol, false);
    if (!p) return;
    markUpTo(p, upTo, s);
    p.sorted = null;
    wh.put(ns, symbol, p);
    if (journal) wh.journalAppend([[ns, symbol, `<=${upTo}`]]);
  }

  return { read, markDates, markUpToDate, reset: () => { nextSeq(); wh.dropNs(ns); } };
}

/**
 * Đệm giá trị theo khoá có phiên bản: get(key, loader) — miss -> loader(), chỉ lưu nếu khoá / nhóm không bị vô hiệu hoá
 * sau khi lượt đọc bắt đầu. `groups(key)` -> danh sách nhóm của khoá (VD ["bảng", "bảng|symbol=FPT"]): vô hiệu hoá nhóm =
 * tăng "thế hệ" của nhóm (ghi đĩa đồng bộ) -> mọi bản đệm thế hệ cũ, kể cả bản trên đĩa từ lần chạy trước, bị bỏ qua.
 */
export function createValueCache({ wh, ns, size, groups = () => [] }) {
  wh.register(ns, size ? { size: (e) => 64 + size(e.v) } : {});
  const genNs = `${ns}~gen`;
  wh.register(genNs, { size: () => 64, pinned: true });
  const invalidKey = new Map(); // key -> seq
  const invalidGroup = new Map(); // group -> seq
  const inflight = new Map();
  const genOf = (g) => wh.get(genNs, g)?.n ?? 0;
  const gensOf = (key) => groups(key).map(genOf).join(",");
  const stillValid = (key, s0, gens) =>
    (invalidKey.get(key) ?? -1) <= s0 && groups(key).every((g) => (invalidGroup.get(g) ?? -1) <= s0) && gensOf(key) === gens;

  function peek(key) {
    const hit = wh.get(ns, key);
    return hit !== undefined && hit.gen === gensOf(key) ? hit : undefined;
  }

  async function get(key, loader, { cacheIf = () => true } = {}) {
    const hit = peek(key);
    if (hit) return hit.v;
    if (inflight.has(key)) return inflight.get(key);
    const s0 = currentSeq();
    const gens = gensOf(key);
    const p = (async () => {
      const v = await loader();
      if (stillValid(key, s0, gens) && cacheIf(v)) wh.put(ns, key, { v, gen: gens });
      return v;
    })().finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
    return p;
  }

  /** Nhiều khoá: batchLoader(missingKeys) -> Map(key -> value). Trả Map(key -> value) theo thứ tự `keys`. */
  async function getMany(keys, batchLoader) {
    const out = new Map();
    const missing = [];
    for (const k of keys) { const hit = peek(k); if (hit) out.set(k, hit.v); else missing.push(k); }
    if (missing.length) {
      const s0 = currentSeq();
      const gens = new Map(missing.map((k) => [k, gensOf(k)]));
      const got = await batchLoader(missing);
      for (const k of missing) {
        const v = got.get(k);
        out.set(k, v);
        if (v !== undefined && stillValid(k, s0, gens.get(k))) wh.put(ns, k, { v, gen: gens.get(k) });
      }
    }
    return new Map(keys.map((k) => [k, out.get(k)]));
  }

  /** Gọi trước VÀ sau lệnh ghi. */
  function invalidate(key) {
    invalidKey.set(key, nextSeq());
    inflight.delete(key);
    wh.drop(ns, key);
  }
  /** Gọi trước VÀ sau lệnh ghi. */
  function invalidateGroups(list) {
    const s = nextSeq();
    const set = new Set(list);
    for (const g of set) {
      invalidGroup.set(g, s);
      wh.putSync(genNs, g, { n: genOf(g) + 1 });
    }
    for (const k of [...inflight.keys()]) if (groups(k).some((g) => set.has(g))) inflight.delete(k);
  }
  return { get, getMany, invalidate, invalidateGroups, reset: () => { nextSeq(); wh.dropNs(ns); wh.dropNs(genNs); } };
}
