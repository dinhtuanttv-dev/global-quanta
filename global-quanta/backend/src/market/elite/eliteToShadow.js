// Elite × TO — Giai đoạn II (07/11/2026): SỔ ẢO theo ELITE-TO-prereg.md (commit 7017cb7). KHÔNG đổi danh mục Elite 10 chính thức.
//  • COMP-r1: lợi nhuận ngày của CORE (Elite chính thức), GUARD (bán ở phiên cuối còn quyền các vị thế có GDKHQ nhóm ≥ 5%, tiền mặt
//    5 phiên GDKHQ…+4), SLEEVE (CORE + tối đa 2 lệnh TO-L1 × 10%, vốn lấy theo tỷ trọng lõi), COMP (GUARD + SLEEVE); đóng góp = Δ so CORE.
//  • DIV-IC: IC Spearman ngày giữa "lợi suất nếu đang trong cửa sổ cổ tức" và vượt VN-Index 5 phiên kế tiếp (sổ riêng, KHÔNG vào E2).
//  • Đánh giá tại mốc: bootstrap khối tròn (khối 10, 2000 lần) cho ΔCOMP; t Newey–West (trễ 5) cho IC; sụt giảm lớn nhất.
// Hàm thuần ở trên (có test); dịch vụ ở dưới đọc KV quyết định Elite, kho giá Gateway và sổ TO-L1.
import fs from "node:fs";
import path from "node:path";

export const SHADOW_VERSION = "ELITE-TO-v1 (prereg 7017cb7)";
export const SHADOW_RULE = Object.freeze({ start: "2026-11-09", sleeveSlot: 0.1, sleeveMax: 2, costBuy: 0.002, costSell: 0.0025, guardSessions: 5, icH: 5, icMinSignals: 3, minDays: 60, block: 10, iters: 2000, seed: 20261107, maxDdSlack: 0.01 });

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r6 = (x) => (fin(x) ? Math.round(x * 1e6) / 1e6 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/**
 * Một ngày của COMP-r1. weights: { mã: tỷ trọng lõi } (tổng ≈ 1); ret: { mã: lợi nhuận đóng cửa→đóng cửa }; guarded: mã đang để tiền mặt
 * (GUARD); guardSell / guardBuy: mã bán ở phiên cuối còn quyền (phí tính vào ngày đầu để tiền) / mua lại (phí tính ngày cuối để tiền);
 * sleeve: [{ t, r, cost }] lệnh TO đang mở (cost = phí mua ở ngày đầu nắm, phí bán ở ngày bán).
 */
export function shadowDay({ weights, ret, guarded = [], guardSell = [], guardBuy = [], sleeve = [] }, rule = SHADOW_RULE) {
  const g = new Set(guarded); let core = 0, guard = 0;
  for (const [t, w] of Object.entries(weights)) { const r = fin(ret[t]) ? ret[t] : 0; core += w * r; if (!g.has(t)) guard += w * r; }
  for (const t of guardSell) guard -= (weights[t] ?? 0) * rule.costSell;
  for (const t of guardBuy) guard -= (weights[t] ?? 0) * rule.costBuy;
  const legs = sleeve.slice(0, rule.sleeveMax), scale = 1 - rule.sleeveSlot * legs.length;
  const legRet = legs.reduce((s, l) => s + rule.sleeveSlot * ((fin(l.r) ? l.r : 0) - (l.cost ?? 0)), 0);
  return { core: r6(core), guard: r6(guard), sleeve: r6(scale * core + legRet), comp: r6(scale * guard + legRet), k: legs.length };
}

/** Hạng trung bình (xử lý giá trị trùng). */
function ranks(a) { const idx = a.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; }
export function spearman(x, y) {
  const n = x.length; if (n < 3) return null; const rx = ranks(x), ry = ranks(y), mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}
/** Thống kê t Newey–West (Bartlett, trễ L) cho trung bình chuỗi. */
export function neweyWestT(xs, lag = 5) {
  const n = xs.length; if (n < 3) return null; const m = mean(xs), e = xs.map((x) => x - m);
  let s = e.reduce((a, x) => a + x * x, 0) / n; for (let L = 1; L <= Math.min(lag, n - 1); L++) { let c = 0; for (let i = L; i < n; i++) c += e[i] * e[i - L]; s += 2 * (1 - L / (lag + 1)) * c / n; }
  return s > 0 ? m / Math.sqrt(s / n) : null;
}
/** Bootstrap khối tròn (giữ tương quan theo thời gian) — khoảng tin cậy 95% của trung bình. */
export function blockBootCi(xs, { block = 10, iters = 2000, seed = 20261107 } = {}) {
  const n = xs.length; if (n < Math.max(2 * block, 10)) return [null, null];
  let st = seed >>> 0; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32); const out = [];
  for (let b = 0; b < iters; b++) { let s = 0, k = 0; while (k < n) { const start = Math.floor(rnd() * n); for (let j = 0; j < block && k < n; j++, k++) s += xs[(start + j) % n]; } out.push(s / n); }
  out.sort((a, c) => a - c); return [r6(out[Math.floor(iters * 0.025)]), r6(out[Math.floor(iters * 0.975)])];
}
export function maxDrawdown(rets) { let nav = 1, pk = 1, dd = 0; for (const r of rets) { nav *= 1 + r; pk = Math.max(pk, nav); dd = Math.min(dd, nav / pk - 1); } return r6(dd); }

/** Tổng hợp sổ: NAV, Δ từng lớp (CI bootstrap khối), sụt giảm, IC; kết luận theo prereg (CHƯA ĐỦ MẪU trước 60 phiên). */
export function summarizeShadow(days, ic, rule = SHADOW_RULE) {
  const col = (k) => days.map((d) => d[k]);
  const nav = (k) => col(k).reduce((p, r) => p * (1 + r), 1) - 1;
  const delta = (k) => days.map((d) => d[k] - d.core);
  const stat = (k) => { const x = delta(k); return { mean: r6(mean(x)), ci95: blockBootCi(x, rule), total: r6(nav(k) - nav("core")) }; };
  const dd = { core: maxDrawdown(col("core")), guard: maxDrawdown(col("guard")), sleeve: maxDrawdown(col("sleeve")), comp: maxDrawdown(col("comp")) };
  const comp = stat("comp");
  const enough = days.length >= rule.minDays;
  const pass = enough && comp.ci95[0] != null && comp.ci95[0] > 0 && dd.comp >= dd.core - rule.maxDdSlack;
  const icv = ic.map((x) => x.ic).filter(fin);
  const icT = neweyWestT(icv, 5);
  return {
    days: days.length, from: days[0]?.d ?? null, to: days.at(-1)?.d ?? null,
    nav: { core: r6(nav("core")), guard: r6(nav("guard")), sleeve: r6(nav("sleeve")), comp: r6(nav("comp")), vn: r6(nav("vn")) }, maxDD: dd,
    delta: { guard: stat("guard"), sleeve: stat("sleeve"), comp }, guardDays: days.filter((d) => d.guarded?.length).length, sleeveDays: days.filter((d) => d.k > 0).length,
    compVerdict: !enough ? "CHƯA ĐỦ MẪU" : pass ? "ĐẠT" : "KHÔNG ĐẠT",
    ic: { days: icv.length, mean: r6(mean(icv)), t: icT == null ? null : Math.round(icT * 100) / 100, verdict: icv.length < rule.minDays ? "CHƯA ĐỦ MẪU" : (mean(icv) > 0 && icT >= 2 ? "ĐẠT" : "KHÔNG ĐẠT") },
    label: "THĂM DÒ",
  };
}

// ---------------------------------------------------------------- dịch vụ
const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const writeJson = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); };

/**
 * @param deps.getKv(key) -> giá trị KV; deps.decisionKey(date) -> khoá quyết định Elite; deps.decisionIndexKey -> khoá danh sách ngày dựng.
 * @param deps.pricesOf(t) -> [[ngày, giáĐiềuChỉnh, …]]; deps.allFacts() -> đợt cổ tức (divRunup); deps.ledgerEntries() -> sổ TO-L1.
 */
export function createEliteToShadow({ dir, getKv, decisionKey, decisionIndexKey, pricesOf, allFacts, ledgerEntries, getUniverse, exSummary = () => null, now = Date.now, log = console, rule = SHADOW_RULE }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "elite-to-shadow.json");
  const load = () => readJson(file) ?? { version: SHADOW_VERSION, start: rule.start, days: [], ic: [] };
  let running = false;

  async function tick() {
    if (running) return { running: true };
    running = true;
    try {
      const S = load();
      const vn = pricesOf("VNINDEX") ?? []; const dates = vn.map((r) => r[0]); const vnAt = new Map(vn.map((r) => [r[0], r[1]]));
      if (!dates.length) return { error: "chưa có giá VN-Index" };
      const startI = Math.max(1, lowerBound(dates, rule.start));
      const doneDays = new Set(S.days.map((x) => x.d)), doneIc = new Set(S.ic.map((x) => x.d));
      // Quyết định Elite theo ngày dựng (dùng bản dựng gần nhất TRƯỚC phiên tính lợi nhuận).
      const idx = (await getKv(decisionIndexKey)) ?? [];
      const builds = (Array.isArray(idx) ? idx : idx?.dates ?? []).map((x) => (typeof x === "string" ? x : x?.date)).filter(Boolean).sort();
      const decCache = new Map();
      const weightsFor = async (d) => {
        const b = builds[lowerBound(builds, d) - 1]; if (!b) return null;
        if (!decCache.has(b)) { const doc = await getKv(decisionKey(b)); decCache.set(b, Object.fromEntries((doc?.portfolio ?? []).map((p) => [p.ticker, p.weight ?? 0]))); }
        return decCache.get(b);
      };
      const px = new Map(); const adjOf = (t) => { if (!px.has(t)) px.set(t, new Map((pricesOf(t) ?? []).map((r) => [r[0], r[1]]))); return px.get(t); };
      const retOn = (t, i) => { const a = adjOf(t).get(dates[i - 1]), b = adjOf(t).get(dates[i]); return a && b ? b / a - 1 : null; };
      const facts = await allFacts();
      const hi5 = facts.filter((f) => f.bucket === "≥5%");
      const entries = (await ledgerEntries()).filter((e) => e.status !== "VOID").sort((a, b) => a.entryDate.localeCompare(b.entryDate));
      let added = 0, icAdded = 0;
      for (let i = startI; i < dates.length; i++) {
        const d = dates[i]; if (doneDays.has(d)) continue;
        const w = await weightsFor(d); if (!w || !Object.keys(w).length) continue;
        const ret = {}; for (const t of Object.keys(w)) ret[t] = retOn(t, i);
        // GUARD: vị thế có GDKHQ nhóm ≥ 5% -> tiền mặt từ GDKHQ tới GDKHQ + 4 (bán ở đóng cửa phiên cuối còn quyền).
        const guarded = [], guardSell = [], guardBuy = [];
        for (const f of hi5) { if (w[f.t] == null) continue; const e = lowerBound(dates, f.ex); if (e >= dates.length || i < e || i > e + rule.guardSessions - 1) continue;
          guarded.push(f.t); if (i === e) guardSell.push(f.t); if (i === e + rule.guardSessions - 1) guardBuy.push(f.t); }
        // SLEEVE: lệnh TO-L1 đang mở ở phiên d (vào đóng cửa entryDate, bán đóng cửa phiên cuối còn quyền).
        const sleeve = [];
        for (const e of entries) { const exit = e.result?.exitDate ?? null; if (!(e.entryDate < d) || (exit && exit < d)) continue; const first = dates[i - 1] === e.entryDate;
          sleeve.push({ t: e.t, r: retOn(e.t, i), cost: (first ? rule.costBuy : 0) + (exit === d ? rule.costSell : 0) }); if (sleeve.length >= rule.sleeveMax) break; }
        const out = shadowDay({ weights: w, ret, guarded, guardSell, guardBuy, sleeve }, rule);
        S.days.push({ d, ...out, vn: r6(vnAt.get(d) / vnAt.get(dates[i - 1]) - 1), guarded, sleeveT: sleeve.map((l) => l.t), n: Object.keys(w).length }); added++;
      }
      // DIV-IC cho phiên j khi đã có giá j + 5.
      const uni = (await getUniverse())?.tickers ?? [];
      for (let j = startI; j + rule.icH < dates.length; j++) {
        const d = dates[j]; if (doneIc.has(d)) continue;
        const k = j + rule.icH, xs = [], ys = []; let nz = 0;
        for (const u of uni) {
          const a = adjOf(u.ticker).get(d), b = adjOf(u.ticker).get(dates[k]); if (!a || !b) continue;
          const f = facts.find((x) => x.t === u.ticker && x.entryDate && x.entryDate <= d && d < x.ex);
          const v = f ? f.y : 0; if (v) nz++;
          xs.push(v); ys.push(Math.log(b / a) - Math.log(vnAt.get(dates[k]) / vnAt.get(d)));
        }
        const ic = nz >= rule.icMinSignals ? spearman(xs, ys) : null;
        S.ic.push({ d, ic: ic == null ? null : r6(ic), nSig: nz, n: xs.length }); icAdded++;
      }
      S.days.sort((a, b) => a.d.localeCompare(b.d)); S.ic.sort((a, b) => a.d.localeCompare(b.d)); S.updatedAt = new Date(now()).toISOString();
      writeJson(file, S);
      return { added, icAdded, days: S.days.length };
    } finally { running = false; }
  }
  async function summary() {
    const S = load();
    return { version: SHADOW_VERSION, rule, start: S.start, updatedAt: S.updatedAt ?? null, ...summarizeShadow(S.days, S.ic, rule), ex: await exSummary(),
      curve: (() => { let c = 1, m = 1, v = 1; return S.days.map((x) => { c *= 1 + x.core; m *= 1 + x.comp; v *= 1 + x.vn; return [x.d, r6(m), r6(v), r6(c)]; }); })(),
      recent: S.days.slice(-15).reverse() };
  }
  return { tick, summary, status: () => ({ version: SHADOW_VERSION, running }) };
}
