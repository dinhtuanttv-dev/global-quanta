// S2 + S6 (06/11/2026) — Mùa vụ KQKD toàn thị trường + sổ theo dõi tiến cho cửa sổ "THEO DÕI" / "ĐẠT".
//   S2: gom thống kê Project A (earnings-cycle-stats × 4 quý + annual-earnings-calendar) của ~284 mã MỘT LẦN MỖI TUẦN (CN 03:20,
//       tuần tự 2 luồng, ~1.420 lần gọi/tuần — không gọi lúc người dùng mở trang) -> <dir>/season-map.json.gz. Trạng thái cửa sổ theo
//       ĐÚNG quy tắc của giao diện Mùa vụ (EarningsSeasonalityTab.verdictOf): ĐẠT = cửa sổ được chọn; THEO DÕI = < 8 kỳ và (q ≤ 0,2
//       hoặc cận dưới 90% > 0); CHƯA ĐỦ MẪU = < 8 kỳ; còn lại KHÔNG CÓ LỢI THẾ. Không tính lại thống kê nào.
//   S6: mỗi ngày (20:20) ghi MỘT LẦN, TRƯỚC kỳ công bố (ngày dự kiến LC4 cách hôm nay 1–25 ngày, chưa công bố), các cửa sổ đang
//       THEO DÕI / ĐẠT của đúng loại quý kèm thống kê lúc ghi; chấm sau khi có ngày công bố thật (tin BCTC chính thức / ngày dữ liệu)
//       và đủ phiên tới điểm thoát: lợi nhuận vượt VN-Index cùng công thức Project A — exp(CAR_thoát − CAR_vào) − 1 − phí 0,45%
//       (mua 0,20% + bán 0,15% + thuế 0,10%), CAR = Σ log(giá mã) − log(VN-Index), vào tại entryTo, thoát tại exitOffset.
//       Giá: VNDirect adClose (điều chỉnh quyền) — Project A dùng tổng lợi suất SSI: chênh nhỏ, ghi trên API.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { publishDates } from "./earningsCalendar.js";

export const SM_VERSION = "SM-v1 (2026-11-06)";
export const SM_RULES = Object.freeze({ minEvents: 8, watchQ: 0.2, cost: 0.002 + 0.0015 + 0.001, recordAheadDays: [1, 25] });
/** Định nghĩa 4 cửa sổ (Project A lib/cotuc/timing-v3/seasonality/earnings-windows.ts). */
export const WINDOWS = Object.freeze({
  e1: { entryFrom: -15, entryTo: -10, exitOffset: -1 }, e2: { entryFrom: -5, entryTo: -2, exitOffset: 3 },
  e3: { entryFrom: 1, entryTo: 2, exitOffset: 7 }, e4: { entryFrom: 1, entryTo: 3, exitOffset: 20 },
});
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };
const vnToday = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);

/** Trạng thái cửa sổ — cùng quy tắc verdictOf của EarningsSeasonalityTab. */
export function windowStatus(w, selectedId) {
  if (w.id === selectedId) return "SELECTED";
  if (w.nEvents < SM_RULES.minEvents && (w.fdrQValue <= SM_RULES.watchQ || w.netExpectancyLcb > 0)) return "WATCH";
  if (w.nEvents < SM_RULES.minEvents) return "THIN";
  return "NONE";
}
/** Rút gọn thống kê một quý của Project A. */
export function compactQuarter(stats) {
  if (!stats?.windows?.length) return null;
  const ws = stats.windows.map((w) => ({ id: w.id, label: w.label, n: w.nEvents, net: r4(w.netExpectancy), lcb: r4(w.netExpectancyLcb), q: r4(w.fdrQValue), win: r4(w.winRate), status: windowStatus(w, stats.selectedWindowId) }));
  const best = [...ws].sort((a, b) => (b.net ?? -9) - (a.net ?? -9))[0];
  const rank = { SELECTED: 3, WATCH: 2, THIN: 1, NONE: 0 };
  const top = [...ws].sort((a, b) => rank[b.status] - rank[a.status] || (b.net ?? -9) - (a.net ?? -9))[0];
  return { n: Math.max(...ws.map((w) => w.n)), selected: stats.selectedWindowId ?? null, status: top.status, best: { id: best.id, net: best.net, lcb: best.lcb, q: best.q }, windows: ws };
}

/** Chấm một dòng sổ: day0 = phiên đầu tiên ≥ ngày công bố; vào entryTo, thoát exitOffset; vượt VN-Index, trừ phí. */
export function scoreEntry(e, pub, px, vn) {
  if (!pub || !px?.length) return null;
  const dates = px.map((r) => r[0]); const i0 = dates.findIndex((d) => d >= pub);
  const W = WINDOWS[e.window]; if (i0 < 0 || !W) return null;
  const a = i0 + W.entryTo, b = i0 + W.exitOffset;
  if (a < 0 || b >= px.length) return { pending: true, need: b - (px.length - 1) };
  const vnAt = (d) => vn.get(d);
  const va = vnAt(dates[a]), vb = vnAt(dates[b]);
  if (!(va > 0) || !(vb > 0)) return null;
  const car = Math.log(px[b][1] / px[a][1]) - Math.log(vb / va);
  const net = Math.exp(car) - 1 - SM_RULES.cost;
  return { pending: false, day0: dates[i0], entry: dates[a], exit: dates[b], car: r4(car), net: r4(net) };
}

export function createSeasonMap({ dir, base = (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""), fetchImpl = globalThis.fetch, now = Date.now, log = console, concurrency = 2, getCalendar = async () => null } = {}) {
  const mapFile = path.join(dir, "season-map.json.gz"), ledgerFile = path.join(dir, "season-ledger.json");
  let running = false, memo = null;
  const tickers = () => fs.readdirSync(dir).filter((f) => /^[A-Z0-9]{3,10}\.json\.gz$/.test(f)).map((f) => f.slice(0, -8)).sort();
  async function getJson(p) {
    for (let a = 0; a < 2; a++) {
      try { const r = await fetchImpl(`${base}${p}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(25_000) }); if (r.status === 404) return null; if (r.ok) return await r.json(); } catch { /* thử lại */ }
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error(`nguồn lỗi ${p}`);
  }
  /** S2: gom toàn thị trường (tuần tự 2 luồng). Mã lỗi -> giữ dòng cũ. */
  async function build() {
    if (running) return { running: true };
    running = true; const t0 = now();
    try {
      const old = readGz(mapFile)?.rows ?? {};
      const rows = {}; let failed = 0, sourceAsOf = null;
      const todo = tickers();
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (todo.length) {
          const t = todo.shift();
          try {
            const cal = await getJson(`/api/cotuc/annual-earnings-calendar?ticker=${t}`);
            const qs = {};
            for (const q of [1, 2, 3, 4]) qs[q] = compactQuarter(await getJson(`/api/cotuc/earnings-cycle-stats?ticker=${t}&quarter=${q}`));
            const months = Object.fromEntries((cal?.quarters ?? []).map((x) => [x.quarter, x.typicalAnnounceMonth]));
            if (cal?.asOf && (!sourceAsOf || cal.asOf > sourceAsOf)) sourceAsOf = cal.asOf;
            rows[t] = { months, q: qs };
          } catch { failed += 1; if (old[t]) rows[t] = { ...old[t], stale: true }; }
        }
      }));
      const doc = { version: SM_VERSION, builtAt: new Date(now()).toISOString(), sourceAsOf, source: base, failed, rows, ms: now() - t0, rules: SM_RULES };
      writeGz(mapFile, doc); memo = doc;
      log.log?.(`[season-map] ${Object.keys(rows).length} mã, lỗi ${failed}, ${((now() - t0) / 1000).toFixed(0)} s.`);
      return { tickers: Object.keys(rows).length, failed, ms: doc.ms };
    } finally { running = false; }
  }
  function map() { if (memo) return memo; memo = readGz(mapFile); return memo; }
  const readLedger = () => { try { return JSON.parse(fs.readFileSync(ledgerFile, "utf8")); } catch { return { version: SM_VERSION, startedAt: null, entries: [] }; } };
  const saveLedger = (L) => { const tmp = `${ledgerFile}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(L)); fs.renameSync(tmp, ledgerFile); };

  /** S6: ghi (một lần, trước kỳ) + chấm. Không gọi Project A. */
  async function ledgerTick() {
    const m = map(); if (!m) return { skipped: "chưa có bản đồ" };
    const today = vnToday(now()), L = readLedger();
    const have = new Set(L.entries.map((e) => `${e.t}|${e.fiscal}|${e.window}`));
    const cal = await getCalendar();
    let added = 0;
    if (cal) for (const season of [cal.current, cal.next]) {
      const qType = Number(season.quarter.label[1]);
      for (const r of season.rows) {
        if (r.status !== "UPCOMING" || !r.expected) continue;
        const ahead = Math.round((Date.parse(`${r.expected}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
        if (ahead < SM_RULES.recordAheadDays[0] || ahead > SM_RULES.recordAheadDays[1]) continue;
        const cq = m.rows?.[r.t]?.q?.[qType]; if (!cq) continue;
        for (const w of cq.windows.filter((x) => x.status === "WATCH" || x.status === "SELECTED")) {
          const key = `${r.t}|${season.quarter.fiscal}|${w.id}`; if (have.has(key)) continue;
          L.entries.push({ t: r.t, fiscal: season.quarter.fiscal, quarter: season.quarter.label, window: w.id, label: w.label, status: w.status, backtest: { n: w.n, net: w.net, lcb: w.lcb, q: w.q, win: w.win }, expected: r.expected, recordedAt: today, sourceAsOf: m.sourceAsOf });
          have.add(key); added += 1;
        }
      }
    }
    // Chấm.
    const vnRows = readGz(path.join(dir, "px", "VNINDEX.json.gz"))?.rows ?? [];
    const vn = new Map(vnRows.map((r) => [r[0], r[1]]));
    let scored = 0;
    for (const e of L.entries) {
      if (e.result && !e.result.pending) continue;
      const rec = readGz(path.join(dir, `${e.t}.json.gz`)); const disc = readGz(path.join(dir, "disclosures.json.gz"))?.byTicker?.[e.t] ?? [];
      const pub = rec ? publishDates(rec, disc).get(e.fiscal) : null;
      if (!pub) continue;
      const px = readGz(path.join(dir, "px", `${e.t}.json.gz`))?.rows ?? [];
      const s = scoreEntry(e, pub.date, px, vn);
      if (s) { e.result = { ...s, published: pub.date, source: pub.source }; if (!s.pending) scored += 1; }
    }
    if (added || scored) { L.startedAt ??= today; saveLedger(L); }
    return { added, scored, entries: L.entries.length };
  }
  function ledger() {
    const L = readLedger();
    const done = L.entries.filter((e) => e.result && !e.result.pending);
    const by = {};
    for (const e of done) { const k = e.window; (by[k] ??= { n: 0, hits: 0, net: 0, bt: 0 }); by[k].n += 1; by[k].hits += e.result.net > 0 ? 1 : 0; by[k].net += e.result.net; by[k].bt += e.backtest.net ?? 0; }
    const summary = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.n, hitRate: r4(v.hits / v.n), meanNet: r4(v.net / v.n), meanBacktestNet: r4(v.bt / v.n) }]));
    return { version: SM_VERSION, startedAt: L.startedAt, entries: L.entries.slice(-300).reverse(), total: L.entries.length, scored: done.length, summary,
      rule: `Ghi một lần trước kỳ (ngày dự kiến LC4 cách ${SM_RULES.recordAheadDays[0]}–${SM_RULES.recordAheadDays[1]} ngày, chưa công bố) các cửa sổ THEO DÕI / ĐẠT; chấm theo công thức Project A (exp(CAR) − 1 − phí 0,45%), giá VNDirect adClose, ngày công bố thật.` };
  }
  return { build, map, ledgerTick, ledger, status: () => ({ version: SM_VERSION, running, builtAt: map()?.builtAt ?? null, tickers: Object.keys(map()?.rows ?? {}).length }), hasData: () => fs.existsSync(mapFile) };
}
