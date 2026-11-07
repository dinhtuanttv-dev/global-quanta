// TO-v1 (07/11/2026) — "Săn cổ tức trước GDKHQ": mua đón cổ tức tiền mặt từ lúc CÔNG BỐ tới phiên cuối còn quyền.
// Quy tắc TO-r1 (cố định, xem TO-prereg.md): lợi suất đợt chi / giá đóng cửa phiên trước công bố ≥ 5%; GTGD bình quân 20 phiên
// trước công bố ≥ 1 tỷ; vào đóng cửa phiên ĐẦU TIÊN sau ngày công bố (bỏ nếu phiên đó tăng trần); bán đóng cửa phiên cuối còn quyền
// (phiên liền trước GDKHQ); phải nắm ≥ 2 phiên (T+2). Lợi nhuận đo = vượt VN-Index, trừ phí mua 0,2% + bán 0,25% (gồm thuế).
// Hàm THUẦN (không I/O) — dịch vụ divRunupService.js cấp giá (kho px của nghiên cứu sự kiện) và sự kiện (kho Lịch sự kiện).
// Giá VNDirect theo nghìn đồng; cổ tức theo đồng/cp. Nhãn: THĂM DÒ tới khi TO-r1 đạt trên sổ theo dõi tiến (không dùng chữ "mua").

export const TO_VERSION = "TO-v1 (2026-11-07)";
export const TO_RULE = Object.freeze({ minYield: 0.05, minAdv: 1e9, costBuy: 0.002, costSell: 0.0025, minHold: 2, advWindow: 20 });
export const TO_LABEL = "THĂM DÒ";
/** Biên độ giá theo sàn (cảnh báo phiên trần). */
export const LIMIT_BAND = Object.freeze({ HOSE: 0.07, HNX: 0.1, UPCOM: 0.15 });
export const YIELD_BUCKETS = Object.freeze([["<3%", 0, 0.03], ["3–5%", 0.03, 0.05], ["≥5%", 0.05, Infinity]]);
/** Cửa sổ cũ của "Thời điểm tối ưu" (Project A timing-v3, candidate-windows.ts) — giữ nguyên để so sánh, chỉ MÔ TẢ. */
export const LEGACY_WINDOWS = Object.freeze([
  { id: "w1", label: "W1 · Gom sớm trước Mốc 1", entry: -60, exit: 0 },
  { id: "w2", label: "W2 · Trước họp ĐHĐCĐ", entry: -15, exit: 5 },
  { id: "w3", label: "W3 · Trước GDKHQ (an toàn)", entry: -15, exit: 3 },
  { id: "w4", label: "W4 · Ngay sau GDKHQ", entry: 6, exit: 10 },
  { id: "w5", label: "W5 · Sau khi CP/tiền về TK", entry: 35, exit: 50 },
]);

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const quantile = (sorted, q) => { if (!sorted.length) return null; const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); };
const dayDiff = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
export const bucketOf = (y) => (YIELD_BUCKETS.find(([, lo, hi]) => y >= lo && y < hi) ?? YIELD_BUCKETS[0])[0];
const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const upperBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; };

/** Chuỗi giá một mã từ dòng kho [[ngày, giáĐiềuChỉnh, GTGD, giáChưaĐiềuChỉnh]], chỉ giữ ngày VN-Index cũng có. */
export function stockSeries(rows, mkt) {
  const s = [...(rows ?? [])].filter((r) => fin(r[1]) && r[1] > 0 && mkt.has(r[0])).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return { dates: s.map((r) => r[0]), adj: s.map((r) => r[1]), val: s.map((r) => (fin(r[2]) ? r[2] : null)), raw: s.map((r) => (fin(r[3]) && r[3] > 0 ? r[3] : null)) };
}

/** Đợt cổ tức tiền của một mã: gộp cùng GDKHQ, ngày công bố sớm nhất; bỏ đợt trùng (±1 ngày) cổ tức cổ phiếu / thưởng. */
export function cashAnnouncements(events) {
  const other = (events ?? []).filter((e) => (e.cat === "STOCK" || e.cat === "BONUS") && e.ex).map((e) => e.ex);
  const by = new Map();
  for (const e of events ?? []) {
    if (e.cat !== "CASH" || !e.ex || !(e.cash > 0) || !e.disclosed) continue;
    if (other.some((o) => dayDiff(o, e.ex) <= 1)) continue;
    const c = by.get(e.ex);
    by.set(e.ex, { ex: e.ex, cash: (c?.cash ?? 0) + e.cash, disclosed: c?.disclosed && c.disclosed < e.disclosed ? c.disclosed : e.disclosed, check: e.check?.level ?? c?.check ?? null, title: c?.title ?? e.title ?? null });
  }
  return [...by.values()].sort((a, b) => a.ex.localeCompare(b.ex));
}

/**
 * Dữ kiện một đợt trên chuỗi giá (chỉ dùng thông tin tới thời điểm tương ứng):
 *  pre = phiên cuối ≤ ngày công bố; entry = phiên kế tiếp; exI = phiên đầu ≥ GDKHQ; lastCum = exI − 1.
 * Kết quả (outcome) chỉ có khi giá đã tới phiên cuối còn quyền.
 */
export function eventFacts(ann, s, mkt, { exch = "HOSE" } = {}) {
  const n = s.dates.length; if (!n) return null;
  const disc = ann.disclosed.slice(0, 10);
  const preI = upperBound(s.dates, disc) - 1; // phiên cuối có ngày ≤ ngày công bố (tin có thể ra sau giờ giao dịch)
  if (preI < TO_RULE.advWindow) return null;
  const entry = preI + 1;
  const exI = lowerBound(s.dates, ann.ex);
  const rawPre = s.raw[preI]; if (!rawPre) return null;
  const y = ann.cash / (rawPre * 1000);
  if (!(y > 0 && y < 0.5)) return null;
  const vals = s.val.slice(preI - TO_RULE.advWindow + 1, preI + 1).filter(fin);
  const adv = vals.length >= 10 ? mean(vals) : null;
  const band = LIMIT_BAND[exch] ?? LIMIT_BAND.HOSE;
  const entryKnown = entry < n && s.dates[entry] < ann.ex;
  const limitUp = entryKnown && s.raw[entry] && s.raw[preI] ? s.raw[entry] / s.raw[preI] - 1 >= band - 0.005 : null;
  const lastCum = exI - 1;
  const f = { ex: ann.ex, disclosed: ann.disclosed, cash: ann.cash, check: ann.check ?? null, y: r4(y), bucket: bucketOf(y), adv, exch,
    preDate: s.dates[preI], entryDate: entryKnown ? s.dates[entry] : null, limitUp,
    qualifies: y >= TO_RULE.minYield && (adv ?? 0) >= TO_RULE.minAdv && limitUp !== true, holdSessions: entryKnown && exI <= n ? lastCum - entry : null, outcome: null, path: [] };
  // Đường vượt VN-Index (log) từ đóng cửa phiên trước công bố tới từng phiên, dừng ở phiên cuối còn quyền / dữ liệu cuối.
  const mPre = mkt.get(s.dates[preI]);
  for (let i = preI + 1; i < Math.min(n, exI); i++) f.path.push(r4(Math.log(s.adj[i] / s.adj[preI]) - Math.log(mkt.get(s.dates[i]) / mPre)));
  if (entryKnown && exI < n && lastCum - entry >= TO_RULE.minHold) {
    const ls = Math.log(s.adj[lastCum] / s.adj[entry]), lb = Math.log(mkt.get(s.dates[lastCum]) / mkt.get(s.dates[entry]));
    const c = TO_RULE.costBuy + TO_RULE.costSell;
    f.outcome = { exitDate: s.dates[lastCum], excess: r4(Math.exp(ls - lb) - 1 - c), abs: r4(Math.exp(ls) - 1 - c) };
  }
  // Phần SAU (EX-r1): giữ tiếp từ phiên cuối còn quyền tới GDKHQ + 4 phiên (5 phiên), vượt VN-Index, ĐÃ GỒM cổ tức nhận sau thuế 5%.
  // Không trừ phí: bán ở phiên cuối còn quyền hay 5 phiên sau đều chịu đúng một lần phí bán — đây là phần chênh của việc giữ qua GDKHQ.
  const post = exI + 4;
  if (lastCum >= 0 && post < n && s.dates[exI] >= ann.ex && s.raw[lastCum]) {
    const ls = Math.log(s.adj[post] / s.adj[lastCum]) + Math.log(1 - 0.05 * ann.cash / (s.raw[lastCum] * 1000));
    f.postEx5 = { date: s.dates[post], excess: r4(Math.exp(ls - Math.log(mkt.get(s.dates[post]) / mkt.get(s.dates[lastCum]))) - 1) };
  } else f.postEx5 = null;
  return f;
}

// ---------------- Thống kê ----------------
function prng(seed) { let st = seed >>> 0; return () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
/** Khoảng tin cậy 95% bootstrap theo THÁNG (sự kiện cùng tháng tương quan). rows: [{ m: "YYYY-MM", x }]. */
export function clusterCi(rows, { iters = 2000, seed = 20261107 } = {}) {
  const by = new Map(); for (const r of rows) { if (!fin(r.x)) continue; if (!by.has(r.m)) by.set(r.m, []); by.get(r.m).push(r.x); }
  const cl = [...by.values()]; if (cl.length < 3) return [null, null];
  const rnd = prng(seed), out = [];
  for (let b = 0; b < iters; b++) { let s = 0, k = 0; for (let i = 0; i < cl.length; i++) { const v = cl[Math.floor(rnd() * cl.length)]; for (const x of v) { s += x; k++; } } out.push(s / k); }
  out.sort((a, b) => a - b); return [r4(out[Math.floor(iters * 0.025)]), r4(out[Math.floor(iters * 0.975)])];
}
export function blockStats(xs) {
  const v = xs.filter((r) => fin(r.x));
  return { n: v.length, mean: r4(mean(v.map((r) => r.x))), ci95: clusterCi(v), hit: v.length ? r4(v.filter((r) => r.x > 0).length / v.length) : null };
}

/**
 * Tham chiếu lịch sử (MÔ TẢ): theo nhóm lợi suất (chỉ đợt đủ thanh khoản, không trần lúc vào), đường "đã chạy" thường thấy
 * (phân vị vượt VN-Index từ trước công bố tới phiên k), mức chạy cả đợt, và ngành có kết quả âm (cảnh báo).
 */
export function referenceStudy(all) {
  const done = all.filter((f) => f.outcome && (f.adv ?? 0) >= TO_RULE.minAdv && f.limitUp !== true);
  const byBucket = Object.fromEntries(YIELD_BUCKETS.map(([b]) => [b, blockStats(done.filter((f) => f.bucket === b).map((f) => ({ m: f.ex.slice(0, 7), x: f.outcome.excess })))]));
  const rule = done.filter((f) => f.qualifies);
  const runUp = {};
  for (const [b] of YIELD_BUCKETS) {
    const fs = done.filter((f) => f.bucket === b), prof = [];
    for (let k = 1; k <= 25; k++) { const v = fs.map((f) => f.path[k - 1]).filter(fin).sort((x, y) => x - y); if (v.length < 15) break; prof.push({ k, n: v.length, p25: r4(quantile(v, 0.25)), p50: r4(quantile(v, 0.5)), p75: r4(quantile(v, 0.75)), p90: r4(quantile(v, 0.9)) }); }
    const full = fs.map((f) => f.path[f.path.length - 1]).filter(fin).sort((x, y) => x - y);
    runUp[b] = { profile: prof, fullMedian: r4(quantile(full, 0.5)), fullN: full.length };
  }
  const sectors = {};
  for (const sec of [...new Set(rule.map((f) => f.sector).filter(Boolean))]) { const st = blockStats(rule.filter((f) => f.sector === sec).map((f) => ({ m: f.ex.slice(0, 7), x: f.outcome.excess }))); if (st.n >= 8) sectors[sec] = st; }
  const byYear = Object.fromEntries([...new Set(rule.map((f) => f.ex.slice(0, 4)))].sort().map((y) => [y, blockStats(rule.filter((f) => f.ex.startsWith(y)).map((f) => ({ m: f.ex.slice(0, 7), x: f.outcome.excess })))]));
  // EX-r1 (MÔ TẢ): giữ qua GDKHQ 5 phiên theo nhóm lợi suất — cơ sở cảnh báo GDKHQ của Elite 10.
  const postEx = Object.fromEntries(YIELD_BUCKETS.map(([b]) => [b, blockStats(all.filter((f) => f.postEx5 && f.bucket === b && (f.adv ?? 0) >= TO_RULE.minAdv).map((f) => ({ m: f.ex.slice(0, 7), x: f.postEx5.excess })))]));
  return { byBucket, rule: blockStats(rule.map((f) => ({ m: f.ex.slice(0, 7), x: f.outcome.excess }))), byYear, runUp, sectors, postEx,
    weakSectors: Object.entries(sectors).filter(([, s]) => s.mean < 0).map(([k]) => k), events: done.length };
}

/** Vị trí của mức "đã chạy" hiện tại trong phân bố lịch sử cùng số phiên (0..1). */
export function runUpPercentile(profile, k, x) {
  const p = profile.find((r) => r.k === k) ?? profile.at(-1); if (!p || !fin(x)) return null;
  const pts = [[0.25, p.p25], [0.5, p.p50], [0.75, p.p75], [0.9, p.p90]];
  if (x <= p.p25) return r4(0.25 * Math.max(0, Math.min(1, 1 - (p.p25 - x) / Math.max(1e-4, p.p50 - p.p25))));
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][1]) { const [q0, v0] = pts[i - 1], [q1, v1] = pts[i]; return r4(q0 + (q1 - q0) * (x - v0) / Math.max(1e-6, v1 - v0)); }
  return 0.95;
}

/**
 * Một dòng Radar cho đợt đang diễn ra (GDKHQ chưa tới). today = ngày VN; sessionsUntil(a, b) = số phiên giao dịch từ a (không tính) tới b (tính).
 */
export function radarRow(f, ref, { t, name = null, sector = null, today, lastCumDate, sessionsUntil, lastPrice = null, lastPriceDate = null }) {
  // `today` = phiên có thể vào sớm nhất (hôm nay nếu còn trong giờ giao dịch, ngược lại phiên kế tiếp); sessionsLeft = số phiên SAU phiên đó tới phiên bán.
  const k = f.path.length; // số phiên đã có giá sau công bố
  const runUp = k ? f.path[k - 1] : null;
  const prof = ref?.runUp?.[f.bucket]?.profile ?? [];
  const pct = k ? runUpPercentile(prof, k, runUp) : null;
  const full = ref?.runUp?.[f.bucket]?.fullMedian ?? null;
  const left = lastCumDate ? sessionsUntil(today, lastCumDate) : null;
  return {
    t, name, sector, ex: f.ex, disclosed: f.disclosed, check: f.check, cash: f.cash, yieldPre: f.y, bucket: f.bucket,
    yieldNow: lastPrice ? r4(f.cash / (lastPrice * 1000)) : null, lastPrice, lastPriceDate, adv: f.adv ? Math.round(f.adv) : null, liquidityOk: (f.adv ?? 0) >= TO_RULE.minAdv,
    entryDate: f.entryDate, limitUpEntry: f.limitUp, qualifies: f.qualifies, sessionsSinceAnn: k,
    // Mức đã chạy chỉ MÔ TẢ (07/11/2026: kiểm tra 2022–26 cho thấy đợt đã chạy nhiều KHÔNG kém hơn về sau — đã bỏ cảnh báo "đã chạy xa").
    runUp, runUpPct: pct, runUpShareOfTypical: fin(full) && full > 0 && fin(runUp) ? r4(runUp / full) : null,
    buyDate: today, lastCumDate, sessionsLeft: left, t2Ok: left != null && left >= TO_RULE.minHold,
    expected: ref?.byBucket?.[f.bucket] ?? null, weakSector: !!(sector && ref?.weakSectors?.includes(sector)), label: TO_LABEL,
  };
}

// ---------------- Sổ theo dõi tiến TO-L1 + CUSUM ----------------
/** CUSUM một phía (phát hiện SUY GIẢM): z = (x − μ0)/σ0; S = min(0, S + z + k); báo động khi S < −h (Page 1954). */
export function cusumLow(xs, { mu0, sigma0, k = 0.5, h = 4 }) {
  let S = 0, alarmAt = null; const path = [];
  xs.forEach((x, i) => { S = Math.min(0, S + (x - mu0) / sigma0 + k); path.push(r4(S)); if (alarmAt == null && S < -h) alarmAt = i; });
  return { S: r4(S), alarmed: alarmAt != null, alarmAt, path, mu0, sigma0, k, h };
}

// ---------------- Mô phỏng danh mục ----------------
/**
 * trades: [{ t, entryDate, exitDate, y }] — vào/ra đóng cửa; tối đa `slots` vị thế, mỗi vị thế ≤ 1/slots giá trị danh mục; tiền nhàn rỗi 0%.
 * priceOf(t, date) -> giá điều chỉnh; dates = lịch VN-Index (tăng dần), vn = Map ngày -> điểm VN-Index.
 */
export function simulatePortfolio(trades, { dates, vn, priceOf, from, slots = 5 }) {
  const start = Math.max(0, lowerBound(dates, from));
  const byEntry = new Map(); for (const tr of [...trades].sort((a, b) => b.y - a.y)) { if (!byEntry.has(tr.entryDate)) byEntry.set(tr.entryDate, []); byEntry.get(tr.entryDate).push(tr); }
  let cash = 1; const open = []; const curve = []; let n = 0; const done = []; let inMkt = 0;
  for (let i = start; i < dates.length; i++) {
    const d = dates[i];
    for (let k = open.length - 1; k >= 0; k--) { const p = open[k]; if (d >= p.tr.exitDate) { const px = priceOf(p.tr.t, d) ?? p.last; const v = p.units * px * (1 - TO_RULE.costSell); cash += v; done.push({ t: p.tr.t, entryDate: p.tr.entryDate, exitDate: d, ret: r4(v / p.cost - 1) }); open.splice(k, 1); } }
    for (const tr of byEntry.get(d) ?? []) {
      if (open.length >= slots) break; const px = priceOf(tr.t, d); if (!px) continue;
      const nav = cash + open.reduce((a, p) => a + p.units * p.last, 0); const size = Math.min(cash, nav / slots); if (size <= 1e-9) continue;
      open.push({ tr, units: size / (1 + TO_RULE.costBuy) / px, last: px, cost: size }); cash -= size; n++;
    }
    for (const p of open) { const v = priceOf(p.tr.t, d); if (v) p.last = v; }
    const nav = cash + open.reduce((a, p) => a + p.units * p.last, 0); inMkt += 1 - cash / nav;
    curve.push([d, r4(nav), r4(vn.get(d) / vn.get(dates[start]))]);
  }
  if (!curve.length) return { from, trades: 0, curve: [] };
  let pk = 0, mdd = 0, vpk = 0, vmdd = 0;
  for (const [, v, b] of curve) { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); vpk = Math.max(vpk, b); vmdd = Math.min(vmdd, b / vpk - 1); }
  const yrs = curve.length / 250, last = curve.at(-1);
  const dr = curve.slice(1).map((c, i) => Math.log(c[1] / curve[i][1])), m = mean(dr) ?? 0, sd = Math.sqrt(mean(dr.map((x) => (x - m) ** 2)) ?? 0);
  return { from: curve[0][0], to: last[0], trades: n, closed: done.length, hit: done.length ? r4(done.filter((x) => x.ret > 0).length / done.length) : null,
    total: r4(last[1] - 1), vnTotal: r4(last[2] - 1), cagr: yrs > 0.25 ? r4(last[1] ** (1 / yrs) - 1) : null, maxDD: r4(mdd), vnMaxDD: r4(vmdd),
    sharpe: sd > 0 ? Math.round((m * 250) / (sd * Math.sqrt(250)) * 100) / 100 : null, exposure: r4(inMkt / curve.length), curve, recent: done.slice(-20) };
}

// ---------------- W1–W5 (engine cũ) viết lại trên Gateway — MÔ TẢ ----------------
/** Một đợt × 5 cửa sổ: vượt VN-Index ròng phí; knownAtEntry = ngày công bố ≤ ngày phải vào (có biết GDKHQ lúc vào không). */
export function legacyWindowTrades(ann, s, mkt) {
  const exI = lowerBound(s.dates, ann.ex); if (exI >= s.dates.length || s.dates[exI] !== ann.ex) return [];
  const out = [];
  for (const w of LEGACY_WINDOWS) {
    const i0 = exI + w.entry, i1 = exI + w.exit; if (i0 < 1 || i1 >= s.dates.length || i1 - i0 < TO_RULE.minHold) continue;
    let ls = Math.log(s.adj[i1] / s.adj[i0]);
    if (i0 < exI && i1 >= exI && s.raw[exI - 1]) ls += Math.log(1 - 0.05 * ann.cash / (s.raw[exI - 1] * 1000)); // giá điều chỉnh trừ cổ tức TRƯỚC thuế -> trừ thêm thuế 5%
    const lb = Math.log(mkt.get(s.dates[i1]) / mkt.get(s.dates[i0]));
    out.push({ w: w.id, ex: ann.ex, x: Math.exp(ls - lb) - 1 - TO_RULE.costBuy - TO_RULE.costSell, known: ann.disclosed.slice(0, 10) <= s.dates[i0] });
  }
  return out;
}
function normalCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
/** Gộp toàn danh mục + từng mã; q-value Benjamini–Hochberg trên TOÀN BỘ mã × cửa sổ (n ≥ 8), không chỉ trong một mã. */
export function legacyWindowStudy(byTicker) {
  const pooled = Object.fromEntries(LEGACY_WINDOWS.map((w) => { const xs = Object.values(byTicker).flat().filter((r) => r.w === w.id);
    return [w.id, { label: w.label, ...blockStats(xs.map((r) => ({ m: r.ex.slice(0, 7), x: r.x }))), knownAtEntry: xs.length ? r4(xs.filter((r) => r.known).length / xs.length) : null }]; }));
  const tests = [];
  const per = {};
  for (const [t, rows] of Object.entries(byTicker)) {
    per[t] = {};
    for (const w of LEGACY_WINDOWS) {
      const xs = rows.filter((r) => r.w === w.id).map((r) => r.x); if (!xs.length) continue;
      const m = mean(xs), sd = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) : 0;
      const p = xs.length >= 8 && sd > 0 ? 1 - normalCdf(m / (sd / Math.sqrt(xs.length))) : null;
      per[t][w.id] = { n: xs.length, mean: r4(m), hit: r4(xs.filter((x) => x > 0).length / xs.length), p: r4(p), q: null };
      if (p != null) tests.push({ t, w: w.id, p });
    }
  }
  tests.sort((a, b) => a.p - b.p); let prev = 1;
  for (let i = tests.length - 1; i >= 0; i--) { prev = Math.min(prev, (tests[i].p * tests.length) / (i + 1)); per[tests[i].t][tests[i].w].q = r4(prev); }
  return { pooled, byTicker: per, tests: tests.length, significant: tests.filter((x) => per[x.t][x.w].q <= 0.1).map((x) => `${x.t}:${x.w}`) };
}
