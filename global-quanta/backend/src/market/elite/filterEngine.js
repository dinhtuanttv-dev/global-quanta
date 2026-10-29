// BỘ LỌC ELITE (30/10/2026) — hàm thuần, CÙNG ngữ nghĩa với bản TypeScript ở giao diện (src/lib/elite10/filterEngine.ts; test khớp
// chung bộ dữ liệu backend/test/fixtures/elite-filter-parity.json). Dùng cho sổ theo dõi "Elite 10 · bộ lọc của tôi" chạy hằng đêm.
//
// Bộ lọc v1: { v: 1, name, conds: Cond[], mode: "all" | "k", k?, not?: Cond[], eligibleOnly? }
//   Cond = { sig, op, val, neutral? }
//     sig: id tín hiệu trong bảng E1 (stealth20, sepa_state, …) hoặc đặc biệt: "_adv" (GTGD TB20, tỷ), "_price" (giá, đồng),
//          "_buyzone" (có vùng mua ĐẠT KIỂM ĐỊNH đang mở / bắt đầu ≤ 10 phiên — Timeline tab Cổ tức).
//     op: ">=" | "<=" | "==" | "in" (val là mảng) | "p>=" (phân vị ≥ val, 0–100; neutral = xếp hạng trong cùng ngành ICB cấp 2).
//   mode "all": đạt MỌI điều kiện; "k": đạt ≥ k điều kiện. `not`: loại mã đạt BẤT KỲ điều kiện nào trong đó.
//   eligibleOnly (mặc định true): chỉ mã đủ điều kiện danh mục (GTGD TB20 ≥ 10 tỷ, giá ≥ 5.000đ, giá không neo, ≥ 60 phiên).
// Giá trị thiếu (null) KHÔNG đạt điều kiện nào (không đoán).

/** Phân vị hạng giữa (0–100) của từng mã cho một tín hiệu; `groupOf` -> xếp trong nhóm. */
export function percentiles(rows, sig, groupOf = null) {
  const groups = new Map();
  for (const r of rows) {
    const v = r.values?.[sig];
    if (v == null || !Number.isFinite(v)) continue;
    const g = groupOf ? groupOf(r) ?? "?" : "*";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([r.ticker, v]);
  }
  const out = new Map();
  for (const list of groups.values()) {
    const vals = list.map(([, v]) => v);
    for (const [t, v] of list) {
      let below = 0, equal = 0;
      for (const x of vals) { if (x < v) below++; else if (x === v) equal++; }
      out.set(t, ((below + equal / 2) / vals.length) * 100);
    }
  }
  return out;
}

const sectorOf = (r) => r.icb?.l2 ?? r.sector ?? null;

/**
 * @param filter bộ lọc v1
 * @param ctx { rows: bảng E1 [{ticker, icb, sector, values}], scores: Map ticker -> {eligible, advBn, close}, buyZone: Set<ticker> }
 * @returns { pass: string[] (theo thứ tự rows), perCond: number[] (số mã đạt từng điều kiện), hits: Map ticker -> boolean[] }
 */
export function evaluateFilter(filter, { rows, scores = new Map(), buyZone = new Set() }) {
  const conds = filter?.conds ?? [], nots = filter?.not ?? [];
  const pctCache = new Map();
  const pct = (sig, neutral) => {
    const key = `${sig}|${neutral ? 1 : 0}`;
    if (!pctCache.has(key)) pctCache.set(key, percentiles(rows, sig, neutral ? sectorOf : null));
    return pctCache.get(key);
  };
  const valueOf = (r, sig) => {
    if (sig === "_adv") return scores.get(r.ticker)?.advBn ?? null;
    if (sig === "_price") return scores.get(r.ticker)?.close ?? null;
    if (sig === "_buyzone") return buyZone.has(r.ticker) ? 1 : 0;
    const v = r.values?.[sig];
    return v == null || !Number.isFinite(v) ? null : v;
  };
  const test = (c, r) => {
    if (c.op === "p>=") { const p = pct(c.sig, c.neutral).get(r.ticker); return p != null && p >= c.val; }
    const v = valueOf(r, c.sig);
    if (v == null) return false;
    if (c.op === ">=") return v >= c.val;
    if (c.op === "<=") return v <= c.val;
    if (c.op === "==") return v === c.val;
    if (c.op === "in") return Array.isArray(c.val) && c.val.includes(v);
    return false;
  };
  const eligibleOnly = filter?.eligibleOnly !== false;
  const need = filter?.mode === "k" ? Math.max(1, Math.min(conds.length, Math.round(filter.k ?? 1))) : conds.length;
  const perCond = conds.map(() => 0);
  const hits = new Map(), pass = [];
  for (const r of rows) {
    if (eligibleOnly && !scores.get(r.ticker)?.eligible) continue;
    const h = conds.map((c) => test(c, r));
    h.forEach((ok, i) => { if (ok) perCond[i]++; });
    hits.set(r.ticker, h);
    if (h.filter(Boolean).length >= need && !nots.some((c) => test(c, r))) pass.push(r.ticker);
  }
  return { pass, perCond, hits };
}

/** Kiểm tra / làm sạch bộ lọc từ người dùng (giới hạn kích thước, chỉ phép toán hợp lệ). */
export function sanitizeFilter(raw, knownSignals) {
  const okSig = (s) => typeof s === "string" && (knownSignals.has(s) || ["_adv", "_price", "_buyzone"].includes(s));
  const okCond = (c) => c && okSig(c.sig) && [">=", "<=", "==", "in", "p>="].includes(c.op)
    && (c.op === "in" ? Array.isArray(c.val) && c.val.length <= 12 && c.val.every(Number.isFinite) : Number.isFinite(c.val));
  const clean = (list) => (Array.isArray(list) ? list.filter(okCond).slice(0, 24).map((c) => ({ sig: c.sig, op: c.op, val: c.val, ...(c.neutral ? { neutral: true } : {}) })) : []);
  const conds = clean(raw?.conds);
  return {
    v: 1, name: String(raw?.name ?? "Bộ lọc của tôi").slice(0, 60), conds, not: clean(raw?.not),
    mode: raw?.mode === "k" ? "k" : "all", ...(raw?.mode === "k" ? { k: Math.max(1, Math.min(conds.length || 1, Math.round(Number(raw.k) || 1))) } : {}),
    eligibleOnly: raw?.eligibleOnly !== false,
  };
}

/** Mã băm ổn định của bộ lọc (ghi vào sổ để biết bản ghi thuộc phiên bản bộ lọc nào). */
const stable = (x) => (Array.isArray(x) ? `[${x.map(stable).join(",")}]` : x && typeof x === "object"
  ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}` : JSON.stringify(x));
export function filterHash(f) {
  const s = stable(f);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
