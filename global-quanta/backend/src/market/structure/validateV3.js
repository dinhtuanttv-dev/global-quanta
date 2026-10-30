// MTF v3 · S7 — kiểm định đặt trước MTF-v3-prereg.md (H1–H6) trên dữ liệu VNDirect 2013 → 2026 kể cả mã đã huỷ niêm yết.
// Chạy MỘT lần bằng scripts/mtf3-validate.mjs. Không gọi mạng, không ghi DB. Mọi sự kiện tại phiên t chỉ dùng dữ liệu ≤ t (engine
// mtf3 có test tiền tố). Vào giá mở cửa t+1, ra đóng cửa t+h; lợi suất vượt trội = mã − TB tập đủ điều kiện cùng ngày vào / ra.
import * as Q from "../vendor/quantCore.mjs";
import { bhQ } from "../strategies/pring/validate.js";
import { rng } from "./ml.js";

export const P3 = Object.freeze({
  prereg: "structure/MTF-v3-prereg.md", eventFrom: "2013-01-01", oosFrom: "2021-01-01", feePct: 0.6,
  minAdv: 10e9, advWin: 20, minPriceK: 5, minHistory: 260, dedup: 20, boot: 2000, seed: 7, placebo: 200, q: 0.1, minOosN: 60,
  h: { H1: 40, H2: 20, H3: 20, H4: 20, H5: 20, H6: 20 }, ewWindow: 1250, ewSwingLookback: 5,
});

/** Chuẩn hoá một mã từ tệp mtf3-fetch: nến (giá điều chỉnh), cờ đủ điều kiện từng phiên, chỉ số theo ngày. */
export function prepare3(doc) {
  const raw = doc.bars;
  const bars = raw.map(([date, o, h, l, c, , v]) => ({ date, open: o, high: h, low: l, close: c, volume: v }));
  const n = bars.length, elig = new Uint8Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += raw[i][7]; if (i >= P3.advWin) s -= raw[i - P3.advWin][7];
    const nominal = raw[i][5] ?? raw[i][4];
    elig[i] = i >= P3.minHistory - 1 && i + 1 >= P3.advWin && s / P3.advWin >= P3.minAdv && nominal >= P3.minPriceK ? 1 : 0;
  }
  return { ticker: doc.ticker, status: doc.status, bars, elig, idx: new Map(bars.map((b, i) => [b.date, i])) };
}

/** TB lợi suất (%) của tập đủ điều kiện tại `date` cho cửa sổ vào mở cửa phiên sau → đóng cửa sau h phiên. Đệm theo (date, h). */
export function benchmark3(universe) {
  const cache = new Map();
  return (date, h) => {
    const key = `${date}|${h}`;
    if (cache.has(key)) return cache.get(key);
    let sum = 0, n = 0;
    for (const u of universe) {
      const i = u.idx.get(date);
      if (i == null || !u.elig[i] || i + h >= u.bars.length) continue;
      const e = u.bars[i + 1].open, x = u.bars[i + h].close;
      if (e > 0 && x > 0) { sum += (x / e - 1) * 100; n++; }
    }
    const v = n >= 20 ? sum / n : null;
    cache.set(key, v);
    return v;
  };
}

const retPct = (u, t, h) => (t + h < u.bars.length && u.bars[t + 1].open > 0 ? (u.bars[t + h].close / u.bars[t + 1].open - 1) * 100 : null);

/** Sự kiện H1–H6 + ứng viên thô H5 của một mã (đã chống lặp 20 phiên mỗi giả thuyết). */
export function events3(u, opts = {}) {
  const a = Q.analyzeMtf3(u.bars), D = a.D, R = D.r, n = u.bars.length, out = [];
  const last = { H1: -1e9, H2: -1e9, H3: -1e9, H4: -1e9, H5: -1e9, H6: -1e9 };
  const push = (k, t, extra = {}) => { if (t - last[k] < P3.dedup) return; last[k] = t; out.push({ k, t, date: u.bars[t].date, ...extra }); };
  const wOf = (t) => { const wi = a.ribbon.wIdx[t] ?? -1; return wi >= 0 ? { s: a.W.dow.state[wi], c: a.W.r.bars[wi].close, e21: a.W.r.ema21[wi], e50: a.W.r.ema50[wi] } : null; };
  for (let t = 1; t < n - 1; t++) {
    if (u.bars[t].date < P3.eventFrom || !u.elig[t]) continue;
    const w = wOf(t), wNotDown = !!w && w.s !== "DOWN" && w.s !== "BROKEN_UP";
    // H1 — chuyển sang giai đoạn 2, tuần đóng cửa trên EMA21w
    if (D.stage.stage[t] === "S2" && D.stage.stage[t - 1] !== "S2" && w && w.c > w.e21) push("H1", t);
    // H2 — Tuần UP + Ngày CHoCH↑ tại t + chạm dải EMA21–50 trong 10 phiên trước; cổng xét sau
    let h2raw = false;
    if (D.dow.event[t] === "CHOCH_UP" && w && w.s === "UP" && w.c > w.e50 && w.e21 > w.e50) {
      for (let j = Math.max(0, t - 10); j <= t && !h2raw; j++) { const top = Math.max(R.ema21[j], R.ema50[j]); if (Number.isFinite(top) && u.bars[j].low <= top + 0.25 * R.atr[j]) h2raw = true; }
    }
    // H3 — phá vỡ nền trong S2 (tiền lọc: KL ≥ 1,4 × TB50 và đóng cửa tăng)
    let h3raw = false, base = null;
    if (D.stage.stage[t] === "S2" && u.bars[t].close > u.bars[t - 1].close) {
      let s50 = 0; for (let j = Math.max(0, t - 50); j < t; j++) s50 += u.bars[j].volume;
      const va = s50 / Math.min(50, t);
      if (va > 0 && u.bars[t].volume >= 1.4 * va) {
        base = Q.base3At(D, t);
        h3raw = !!base && base.valid && (base.baseCount ?? 1) <= 3 && base.breakout?.index === t && (base.vcp || base.depth <= 0.15);
      }
    }
    // H4 — nén → mở rộng tăng, Tuần không giảm
    const h4raw = R.expand[t] === 1 && wNotDown;
    if (h2raw || h3raw || h4raw) {
      const g = Q.decision3At(a, t).gates, hit = (k) => g.find((x) => x.key === k)?.hit;
      const anyGate = g.some((x) => x.hit);
      if (h2raw && !anyGate) push("H2", t);
      if (h3raw && !hit("over") && !hit("htfResistance")) push("H3", t);
      if (h4raw) push("H4", t);
      push("H5", t, { forbidden: anyGate });
    }
  }
  // H6 — Elliott Pro: chỉ tại phiên vừa xác nhận đáy sóng nhỏ (≤ 5 phiên) — Sửa đổi 3
  if (opts.elliott !== false) {
    const lows = D.minor.filter((s) => s.kind === "L");
    let lastCheck = -1e9;
    for (const L of lows) {
      const t = L.confirmedIndex;
      if (t >= n - 1 || u.bars[t].date < P3.eventFrom || !u.elig[t] || t - lastCheck < P3.ewSwingLookback) continue;
      lastCheck = t;
      const w = wOf(t);
      if (!w || w.s === "DOWN" || w.s === "BROKEN_UP") continue;
      const from = Math.max(0, t + 1 - P3.ewWindow), win = u.bars.slice(from, t + 1);
      const candles = win.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
      let sc = null;
      try { const scs = Q.scenariosFromTree(Q.buildWaveTree(candles), candles); sc = scs.find((x) => x.role === "primary") ?? scs[0] ?? null; } catch { sc = null; }
      if (!sc || sc.template !== "wave3" || sc.dir < 0) continue;
      const an = sc.anchors, e = an[an.length - 1], s0 = an[an.length - 3], s1 = an[an.length - 2];
      if (!e || !s0 || !s1 || String(e.time).slice(0, 10) !== u.bars[L.index].date) continue;
      const leg = Math.abs(s1.price - s0.price), retrace = leg > 0 ? Math.abs(s1.price - e.price) / leg : null;
      const i = L.index, lo = Math.min(R.ema50[i], R.ema100[i]) - 0.5 * R.atr[i], hi = Math.max(R.ema50[i], R.ema100[i]) + 0.5 * R.atr[i];
      if (retrace != null && retrace >= 0.382 && retrace <= 0.786 && e.price >= lo && e.price <= hi) push("H6", t);
    }
  }
  return { events: out, stage: D.stage.stage, wState: a.ribbon.wIdx.map((wi) => (wi >= 0 ? a.W.dow.state[wi] : null)) };
}

/** KTC bootstrap cụm theo tuần ISO của sự kiện; p một phía (H0: TB ≤ 0 cho mua; H5: hiệu ≥ 0). */
export function clusterBoot(rows, side = 1, seed = P3.seed) {
  if (!rows.length) return { n: 0, mean: null, ci: null, p: null };
  const byWeek = new Map();
  for (const r of rows) { const k = weekKey(r.date); if (!byWeek.has(k)) byWeek.set(k, []); byWeek.get(k).push(r.x); }
  const groups = [...byWeek.values()], mean = rows.reduce((s, r) => s + r.x, 0) / rows.length, R = rng(seed), means = [];
  for (let b = 0; b < P3.boot; b++) {
    let s = 0, c = 0;
    for (let g = 0; g < groups.length; g++) { const G = groups[Math.floor(R() * groups.length)]; for (const x of G) { s += x; c++; } }
    means.push(c ? s / c : 0);
  }
  means.sort((x, y) => x - y);
  const ci = [means[Math.floor(0.025 * P3.boot)], means[Math.floor(0.975 * P3.boot)]];
  const p = side > 0 ? means.filter((m) => m <= 0).length / P3.boot : means.filter((m) => m >= 0).length / P3.boot;
  return { n: rows.length, mean: r3(mean), ci: ci.map(r3), p: r3(p), hit: r3((rows.filter((r) => r.x > 0).length / rows.length) * 100) };
}
function weekKey(date) {
  const d = new Date(`${date}T00:00:00Z`), dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear(); return `${y}-W${1 + Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 / 7)}`;
}
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

export function runValidationV3(docs, { elliott = true, log = () => {} } = {}) {
  const t0 = Date.now();
  const universe = docs.map(prepare3);
  const bench = benchmark3(universe);
  const ev = { H1: [], H2: [], H3: [], H4: [], H5: [], H6: [] }, stageRows = [], wRows = [];
  let k = 0;
  for (const u of universe) {
    const { events, stage, wState } = events3(u, { elliott });
    for (const e of events) {
      const h = P3.h[e.k], r = retPct(u, e.t, h), b = bench(e.date, h);
      if (r == null || b == null) continue;
      const fee = e.k === "H5" ? 0 : P3.feePct;
      ev[e.k].push({ sym: u.ticker, date: e.date, t: e.t, x: r - b - fee, forbidden: e.forbidden });
    }
    // mô tả: lợi suất vượt trội 20 phiên theo giai đoạn ngày / trạng thái Dow tuần — mẫu mỗi 5 phiên đủ điều kiện
    for (let t = 0; t < u.bars.length - 21; t += 5) {
      if (!u.elig[t] || u.bars[t].date < P3.eventFrom) continue;
      const r = retPct(u, t, 20), b = bench(u.bars[t].date, 20);
      if (r == null || b == null) continue;
      stageRows.push({ g: stage[t], date: u.bars[t].date, x: r - b });
      if (wState[t]) wRows.push({ g: wState[t], date: u.bars[t].date, x: r - b });
    }
    if (++k % 50 === 0) log(`${k}/${universe.length} mã · ${Math.round((Date.now() - t0) / 1000)} giây`);
  }
  const split = (rows) => ({ IS: rows.filter((r) => r.date < P3.oosFrom), OOS: rows.filter((r) => r.date >= P3.oosFrom) });
  const stats = {};
  for (const key of ["H1", "H2", "H3", "H4", "H6"]) { const s = split(ev[key]); stats[key] = { IS: clusterBoot(s.IS, 1), OOS: clusterBoot(s.OOS, 1) }; }
  // H5: hiệu (bị cấm − được phép), KTC bootstrap cụm tuần trên hiệu của trung bình nhóm
  const diffStats = (rows) => {
    const f = rows.filter((r) => r.forbidden), a = rows.filter((r) => !r.forbidden);
    if (f.length < 2 || a.length < 2) return { n: rows.length, nF: f.length, nA: a.length, mean: null, ci: null, p: null };
    const m = (xs) => xs.reduce((s, r) => s + r.x, 0) / xs.length, R = rng(P3.seed), d = [];
    for (let b = 0; b < P3.boot; b++) { const sf = Array.from({ length: f.length }, () => f[Math.floor(R() * f.length)]), sa = Array.from({ length: a.length }, () => a[Math.floor(R() * a.length)]); d.push(m(sf) - m(sa)); }
    d.sort((x, y) => x - y);
    return { n: rows.length, nF: f.length, nA: a.length, mean: r3(m(f) - m(a)), ci: [r3(d[Math.floor(0.025 * P3.boot)]), r3(d[Math.floor(0.975 * P3.boot)])], p: r3(d.filter((x) => x >= 0).length / P3.boot) };
  };
  const s5 = split(ev.H5);
  stats.H5 = { IS: diffStats(s5.IS), OOS: diffStats(s5.OOS) };
  const keys = ["H1", "H2", "H3", "H4", "H5", "H6"], qs = bhQ(keys.map((x) => stats[x].OOS.p));
  const verdicts = {};
  keys.forEach((x, i) => {
    const S = stats[x], q = qs[i];
    const pass = x === "H5"
      ? S.OOS.mean != null && S.OOS.mean < 0 && S.OOS.ci?.[1] < 0 && S.IS.mean != null && S.IS.mean < 0 && q != null && q <= P3.q && S.OOS.nF >= P3.minOosN && S.OOS.nA >= P3.minOosN
      : S.OOS.n >= P3.minOosN && S.OOS.mean > 0 && S.OOS.ci?.[0] > 0 && S.IS.mean > 0 && q != null && q <= P3.q;
    verdicts[x] = pass ? "PASS" : "FAIL";
    S.q = q;
  });
  // placebo cùng mã, ngày ngẫu nhiên đủ điều kiện cùng tháng (H1–H4, H6, OOS)
  const placebo = {};
  const byTicker = new Map(universe.map((u) => [u.ticker, u])), monthCand = new Map();
  for (const x of ["H1", "H2", "H3", "H4", "H6"]) {
    const rows = split(ev[x]).OOS;
    if (!rows.length) { placebo[x] = null; continue; }
    const R = rng(P3.seed + 1), real = rows.reduce((s, r) => s + r.x, 0) / rows.length, sims = [];
    const candOf = (r) => {
      const key = `${r.sym}|${r.date.slice(0, 7)}`;
      if (!monthCand.has(key)) {
        const u = byTicker.get(r.sym), month = r.date.slice(0, 7), list = [];
        for (let i = 0; i < u.bars.length; i++) if (u.elig[i] && u.bars[i].date.slice(0, 7) === month) list.push(i);
        monthCand.set(key, list);
      }
      return monthCand.get(key);
    };
    for (let b = 0; b < P3.placebo; b++) {
      let s = 0, c = 0;
      for (const r of rows) {
        const u = byTicker.get(r.sym), cand = candOf(r);
        if (!cand.length) continue;
        const t = cand[Math.floor(R() * cand.length)], h = P3.h[x], ret = retPct(u, t, h), bb = bench(u.bars[t].date, h);
        if (ret == null || bb == null) continue;
        s += ret - bb - P3.feePct; c++;
      }
      if (c) sims.push(s / c);
    }
    placebo[x] = { real: r3(real), p: r3(sims.filter((m) => m >= real).length / Math.max(1, sims.length)), simMean: r3(sims.reduce((s, m) => s + m, 0) / Math.max(1, sims.length)) };
  }
  const table = (rows) => {
    const out = {};
    for (const g of [...new Set(rows.map((r) => r.g))].sort()) { const s = split(rows.filter((r) => r.g === g)); out[g] = { IS: clusterBoot(s.IS, 1), OOS: clusterBoot(s.OOS, 1) }; }
    return out;
  };
  const halves = {};
  for (const x of keys) {
    const rows = split(ev[x]).OOS;
    const a1 = rows.filter((r) => r.date < "2024-01-01"), a2 = rows.filter((r) => r.date >= "2024-01-01");
    halves[x] = x === "H5" ? { first: diffStats(a1).mean, second: diffStats(a2).mean } : { first: clusterBoot(a1, 1).mean, second: clusterBoot(a2, 1).mean };
  }
  return {
    prereg: P3.prereg, engine: Q.MTF3_VERSION, generatedAt: new Date().toISOString(), ms: Date.now() - t0,
    universe: { symbols: universe.length, delisted: universe.filter((u) => u.status === "delisted").length },
    params: P3, verdicts, stats, placebo, halves, stageTable: table(stageRows), weekDowTable: table(wRows),
    counts: Object.fromEntries(keys.map((x) => [x, ev[x].length])),
  };
}
