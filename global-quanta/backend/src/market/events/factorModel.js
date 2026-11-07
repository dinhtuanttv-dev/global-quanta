// BL3 (07/11/2026) — FM-v1: mô hình nhân tố xếp hạng cổ phiếu cổ tức, ĐÚNG như BL-prereg.md (không sửa sau khi xem kết quả kiểm định).
// Cùng một hàm cho kiểm định walk-forward (point-in-time) và cho bản chạy thật (t = hôm nay).
//   6 nhóm: Y lợi suất · D độ bền · G tăng trưởng · Q chất lượng · V định giá · R rủi ro thấp. z theo nhóm ngành, cắt ±3, điền trung vị.
//   Điểm nhóm = trung bình biến; điểm tổng hợp = trung bình đều 6 nhóm (cần ≥ 4 nhóm có dữ liệu).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const FM_VERSION = "FM-v1 (2026-11-07)";
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sdev = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Ngày dùng được của BCTC quý: createdDate nếu trễ 0–120 ngày sau cuối quý, ngược lại cuối quý + 45 ngày. */
export function quarterAvailable(q) {
  const lag = q.created ? (Date.parse(q.created) - Date.parse(q.fiscal)) / 864e5 : null;
  return fin(lag) && lag >= 0 && lag <= 120 ? q.created.slice(0, 10) : addDays(q.fiscal, 45);
}

export const VARS = Object.freeze({
  Y: [["yield", 1]],
  D: [["payout5", -1], ["fcfCover5", 1], ["streak", 1], ["cuts10", -1]],
  G: [["divCagr3", 1], ["npatGrowth", 1]],
  Q: [["roe", 1], ["cfoToNpat", 1], ["accrual", -1]],
  V: [["earningsYield", 1], ["bookYield", 1]],
  R: [["vol1y", -1], ["mdd1y", 1]],
});
const GROUPS = Object.keys(VARS);

/**
 * Biến thô của một mã tại ngày t (point-in-time). rec: { tpl, quarters: [{ fiscal, created, v }], annual: [{ year, v }] };
 * px: [[ngày, giáĐiềuChỉnh(nghìn), giáChưaĐiềuChỉnh(nghìn)?]] tăng dần. Trả null nếu chưa có giá.
 */
export function pitFeatures(rec, px, t) {
  const rows = (px ?? []).filter((r) => r[0] <= t && r[1] > 0);
  if (rows.length < 2) return null;
  const last = rows.at(-1);
  const priceRaw = (fin(last[2]) && last[2] > 0 ? last[2] : last[1]) * 1000; // đồng
  const financial = ["bank", "sec", "ins"].includes(rec?.tpl);
  // BCTC quý đã công bố tới t
  const qs = (rec?.quarters ?? []).filter((q) => /^\d{4}-(03|06|09|12)-\d{2}$/.test(q.fiscal) && quarterAvailable(q) <= t).sort((a, b) => a.fiscal.localeCompare(b.fiscal));
  const ttm = (arr, k) => (arr.length >= 4 && arr.slice(-4).every((q) => fin(q.v?.[k])) ? arr.slice(-4).reduce((s, q) => s + q.v[k], 0) : null);
  const npat = ttm(qs, "npatParent"), eps = ttm(qs, "eps"), cfo = ttm(qs, "cfo");
  const npatPrev = ttm(qs.slice(0, -4), "npatParent");
  const eq = fin(qs.at(-1)?.v?.equity) ? qs.at(-1).v.equity : null, eq4 = fin(qs.at(-5)?.v?.equity) ? qs.at(-5).v.equity : null;
  const as = fin(qs.at(-1)?.v?.assets) ? qs.at(-1).v.assets : null, as4 = fin(qs.at(-5)?.v?.assets) ? qs.at(-5).v.assets : null;
  const shares = fin(npat) && fin(eps) && eps > 0 && npat > 0 ? npat / eps : null;
  const mcap = shares ? shares * priceRaw : null;
  // BCTC năm dùng được từ 01/04 năm sau
  const ann = (rec?.annual ?? []).filter((a) => `${a.year + 1}-04-01` <= t).sort((a, b) => a.year - b.year)
    .map((a) => ({ year: a.year, E: fin(a.v?.npatParent) ? a.v.npatParent : null, D: fin(a.v?.divPaid) ? Math.abs(a.v.divPaid) : null, cfo: fin(a.v?.cfo) ? a.v.cfo : null, capex: fin(a.v?.capex) ? -Math.abs(a.v.capex) : null }));
  const l5 = ann.slice(-5), lastA = ann.at(-1);
  const sumE = l5.reduce((s, r) => s + (fin(r.E) ? r.E : 0), 0), sumD = l5.reduce((s, r) => s + (fin(r.D) ? r.D : 0), 0);
  const payout5 = sumE > 0 && sumD >= 0 ? sumD / sumE : null;
  const fcf5 = !financial && l5.length === 5 && l5.every((r) => fin(r.cfo)) ? l5.reduce((s, r) => s + r.cfo + (fin(r.capex) ? r.capex : 0), 0) : null;
  let streak = 0; for (let i = ann.length - 1; i >= 0 && ann[i].D > 0; i--) streak += 1;
  let cuts10 = 0; for (let i = Math.max(1, ann.length - 10); i < ann.length; i++) { const a = ann[i].D, b = ann[i - 1].D; if (fin(a) && fin(b) && b > 0 && a < 0.9 * b) cuts10 += 1; }
  const d3 = ann.length >= 4 ? ann.at(-4).D : null;
  // Rủi ro: 252 phiên trước t trên giá điều chỉnh
  const w = rows.slice(-253);
  let vol = null, mdd = null;
  if (w.length >= 200) { const rets = []; for (let i = 1; i < w.length; i++) rets.push(Math.log(w[i][1] / w[i - 1][1])); vol = sdev(rets) * Math.sqrt(252); let pk = -Infinity; mdd = 0; for (const r of w) { pk = Math.max(pk, r[1]); mdd = Math.min(mdd, r[1] / pk - 1); } }
  return {
    yield: mcap && lastA && fin(lastA.D) ? lastA.D / mcap : null,
    payout5: fin(payout5) && payout5 > 0 && payout5 <= 1.5 ? payout5 : null,
    fcfCover5: fin(fcf5) && sumD > 0 ? fcf5 / sumD : null,
    streak: ann.length ? Math.min(10, streak) : null, cuts10: ann.length >= 2 ? cuts10 : null,
    divCagr3: fin(d3) && d3 > 0 && lastA?.D > 0 ? Math.pow(lastA.D / d3, 1 / 3) - 1 : null,
    npatGrowth: fin(npat) && fin(npatPrev) && npatPrev > 0 ? npat / npatPrev - 1 : null,
    roe: fin(npat) && fin(eq) ? npat / (fin(eq4) ? (eq + eq4) / 2 : eq) : null,
    cfoToNpat: !financial && fin(cfo) && fin(npat) && npat > 0 ? cfo / npat : null,
    accrual: !financial && fin(cfo) && fin(npat) && fin(as) ? (npat - cfo) / (fin(as4) ? (as + as4) / 2 : as) : null,
    earningsYield: mcap && fin(npat) ? npat / mcap : null,
    bookYield: mcap && fin(eq) ? eq / mcap : null,
    vol1y: vol, mdd1y: mdd,
    _mcap: mcap, _lastFy: lastA?.year ?? null, _lastD: lastA?.D ?? null,
  };
}

/**
 * Chấm điểm một mặt cắt. items: [{ t, sector, f: pitFeatures }]. Trả Map t -> { score, groups: {Y..R}, nGroups } (score null nếu < 4 nhóm).
 */
export function scoreCrossSection(items) {
  const bySector = new Map();
  for (const it of items) if (it.f) (bySector.get(it.sector ?? "?") ?? bySector.set(it.sector ?? "?", []).get(it.sector ?? "?")).push(it);
  const out = new Map();
  for (const members of bySector.values()) {
    const z = {};
    for (const g of GROUPS) for (const [v] of VARS[g]) {
      const xs = members.map((m) => m.f[v]).filter(fin);
      const mu = mean(xs), s = sdev(xs);
      z[v] = (x) => (fin(x) && fin(mu) && s > 0 ? Math.max(-3, Math.min(3, (x - mu) / s)) : fin(x) && xs.length === 1 ? 0 : null);
    }
    for (const m of members) {
      const groups = {};
      for (const g of GROUPS) {
        const vals = VARS[g].map(([v, sign]) => { const zz = z[v](m.f[v]); return zz == null ? null : sign * zz; });
        const known = vals.filter(fin);
        groups[g] = known.length ? mean(vals.map((x) => (fin(x) ? x : median(known)))) : null; // điền trung vị các biến có dữ liệu của nhóm
      }
      const ks = GROUPS.filter((g) => fin(groups[g]));
      out.set(m.t, { score: ks.length >= 4 ? mean(ks.map((g) => groups[g])) : null, groups, nGroups: ks.length });
    }
  }
  return out;
}

/** Xếp hạng & ngũ phân vị (1 = thấp nhất, 5 = cao nhất) theo điểm tổng hợp toàn danh mục. */
export function rankScores(scores) {
  const arr = [...scores].filter(([, s]) => fin(s.score)).sort((a, b) => b[1].score - a[1].score);
  const n = arr.length; const out = new Map();
  arr.forEach(([t, s], i) => out.set(t, { ...s, rank: i + 1, of: n, pct: n > 1 ? 1 - i / (n - 1) : 1, quintile: Math.min(5, Math.floor((1 - i / n) * 5) + 1) }));
  return out;
}

// ---- BL-L1: sổ theo dõi tiến (đăng ký trong BL-prereg.md) — ghi MỘT lần mỗi tháng, chấm sau 12 tháng, không sửa bản ghi cũ ----
export function createFmLedger({ dir, getRows, now = Date.now, log = console }) {
  const file = path.join(dir, "fm-ledger.json");
  const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { version: FM_VERSION, cohorts: [] }; } };
  const save = (L) => { const tmp = `${file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(L)); fs.renameSync(tmp, file); };
  const pxAt = (t, d, after) => { try { const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, "px", `${t}.json.gz`))).toString()).rows; const r = after ? rows.find((x) => x[0] >= d) : [...rows].reverse().find((x) => x[0] <= d); return r ? [r[0], r[1]] : null; } catch { return null; } };
  async function tick() {
    const today = new Date(now() + 7 * 3_600_000).toISOString().slice(0, 10), month = today.slice(0, 7);
    const L = read(); let added = 0, scored = 0;
    if (!L.cohorts.some((c) => c.month === month)) {
      const rows = (await getRows()).filter((r) => r.fm);
      const entries = rows.map((r) => { const p = pxAt(r.t, today, false); return { t: r.t, score: r.fm.score, quintile: r.fm.quintile, px: p?.[1] ?? null, pxDate: p?.[0] ?? null }; }).filter((e) => e.px);
      if (entries.length >= 30) { L.cohorts.push({ month, recordedAt: today, version: FM_VERSION, entries, result: null }); added = entries.length; }
    }
    for (const c of L.cohorts) {
      if (c.result) continue;
      const due = new Date(Date.parse(`${c.recordedAt}T00:00:00Z`) + 365 * 864e5).toISOString().slice(0, 10);
      if (today < due) continue;
      const rs = c.entries.map((e) => { const p = pxAt(e.t, due, true); return p && e.px > 0 ? { ...e, ret: p[1] / e.px - 1 } : null; }).filter(Boolean);
      const byQ = {}; for (const q of [1, 2, 3, 4, 5]) { const xs = rs.filter((x) => x.quintile === q).map((x) => x.ret); byQ[q] = xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1e4) / 1e4 : null; }
      c.result = { scoredAt: today, n: rs.length, byQuintile: byQ, spread: byQ[5] != null && byQ[1] != null ? Math.round((byQ[5] - byQ[1]) * 1e4) / 1e4 : null };
      scored += 1;
    }
    if (added || scored) save(L);
    if (added) log.log?.(`[fm-ledger] ghi ${added} mã cho ${month}.`);
    return { added, scored, cohorts: L.cohorts.length };
  }
  function summary() { const L = read(); return { version: L.version, cohorts: L.cohorts.map((c) => ({ month: c.month, recordedAt: c.recordedAt, n: c.entries.length, result: c.result })) }; }
  return { tick, summary };
}
