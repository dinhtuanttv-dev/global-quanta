// TO-v1 (07/11/2026) — dịch vụ "Săn cổ tức trước GDKHQ" trên Gateway (thay engine W1–W5 của Project A ở tab Thời điểm tối ưu).
//  • build(): tham chiếu lịch sử theo nhóm lợi suất + đường "đã chạy" thường thấy, mô phỏng danh mục lịch sử, W1–W5 (MÔ TẢ) — job 20:25.
//  • tick(): sổ theo dõi tiến TO-L1 (ghi lệnh đủ điều kiện từ 09/11/2026, chấm sau phiên cuối còn quyền, 2 lần xem, CUSUM) — sau build.
//  • radar(): đợt cổ tức tiền đang diễn ra (GDKHQ chưa tới) — tính lại khi kho sự kiện đổi (4 lần/ngày) hoặc khi build mới.
// Giá: kho px của nghiên cứu sự kiện (VNDirect, cập nhật 19:45). Sự kiện: kho Lịch sự kiện (VNDirect + đối chiếu CafeF).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  blockStats, cashAnnouncements, clusterCi, cusumLow, eventFacts, legacyWindowStudy, legacyWindowTrades, radarRow, referenceStudy,
  simulatePortfolio, stockSeries, TO_LABEL, TO_RULE, TO_VERSION,
} from "./divRunup.js";

/** Số tham chiếu cố định của TO-r1 (TO-prereg.md). */
export const TO_R1 = Object.freeze({ start: "2026-11-09", mu0: 0.0176, sigma0: 0.0573, looks: [30, 60], ciLevel: 0.975, cusumK: 0.5, cusumH: 4, histFrom: "2022-03-01" });
const vnToday = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const writeJson = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); };
const r4 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const addDaysIso = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Cận dưới khoảng tin cậy mức `level` (bootstrap theo tháng) — lần xem của TO-r1 dùng 97,5%. */
function lowerAt(rows, level) {
  const by = new Map(); for (const r of rows) { if (!by.has(r.m)) by.set(r.m, []); by.get(r.m).push(r.x); }
  const cl = [...by.values()]; if (cl.length < 3) return null;
  let st = 20261107 >>> 0; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32); const out = [];
  for (let b = 0; b < 2000; b++) { let s = 0, k = 0; for (let i = 0; i < cl.length; i++) { const v = cl[Math.floor(rnd() * cl.length)]; for (const x of v) { s += x; k++; } } out.push(s / k); }
  out.sort((a, b) => a - b); return r4(out[Math.floor(2000 * (1 - level) / 2)]);
}

export function createDivRunup({ dir, pricesOf, getUniverse, eventsOf, eventsVersion = () => null, isTradingDay = () => true, now = Date.now, log = console } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const docFile = path.join(dir, "to-doc.json.gz"), ledgerFile = path.join(dir, "to-ledger.json");
  let memo = null, running = false, radarMemo = null;

  const market = () => { const rows = pricesOf("VNINDEX") ?? []; return { dates: rows.map((r) => r[0]), map: new Map(rows.map((r) => [r[0], r[1]])) }; };
  async function universe() { const u = await getUniverse(); return (u?.tickers ?? u ?? []).filter((x) => x?.ticker); }
  function factsOf(u, mkt) {
    const rows = pricesOf(u.ticker); if (!rows?.length) return { s: null, facts: [], anns: [] };
    const s = stockSeries(rows, mkt.map); const anns = cashAnnouncements(eventsOf(u.ticker) ?? []);
    const facts = anns.map((a) => { const f = eventFacts(a, s, mkt.map, { exch: u.exchange }); return f ? { ...f, t: u.ticker, sector: u.sectorGroup ?? null } : null; }).filter(Boolean);
    return { s, facts, anns };
  }

  async function build() {
    if (running) return { running: true };
    running = true; const t0 = now();
    try {
      const mkt = market(); if (!mkt.dates.length) return { error: "chưa có giá VN-Index" };
      const uni = await universe(); const all = [], legacy = {}, adj = new Map();
      for (const u of uni) {
        const { s, facts, anns } = factsOf(u, mkt); if (!s) continue;
        all.push(...facts.map(({ path: _p, ...f }) => ({ ...f, path: _p })));
        legacy[u.ticker] = anns.flatMap((a) => legacyWindowTrades(a, s, mkt.map));
        if (facts.some((f) => f.qualifies && f.outcome)) adj.set(u.ticker, new Map(s.dates.map((d, i) => [d, s.adj[i]])));
      }
      const ref = referenceStudy(all);
      const rule = all.filter((f) => f.qualifies && f.outcome && f.entryDate >= TO_R1.histFrom);
      const sim = simulatePortfolio(rule.map((f) => ({ t: f.t, entryDate: f.entryDate, exitDate: f.outcome.exitDate, y: f.y })),
        { dates: mkt.dates, vn: mkt.map, priceOf: (t, d) => adj.get(t)?.get(d) ?? null, from: TO_R1.histFrom });
      const lw = legacyWindowStudy(legacy);
      const doc = { version: TO_VERSION, builtAt: new Date(now()).toISOString(), asOf: mkt.dates.at(-1), rule: TO_RULE, r1: TO_R1, reference: { ...ref, runUp: ref.runUp },
        history: { ...sim, recent: sim.recent }, legacy: lw, events: all.length, ms: now() - t0 };
      writeGz(docFile, doc); memo = doc; radarMemo = null;
      log.log?.(`[to] ${all.length} đợt, ${rule.length} lệnh TO-r1 lịch sử, ${(doc.ms / 1000).toFixed(1)} s.`);
      return { events: all.length, rule: rule.length, ms: doc.ms };
    } finally { running = false; }
  }
  const doc = () => memo ?? (memo = readGz(docFile));

  // ---------------- Sổ TO-L1 ----------------
  const ledger = () => readJson(ledgerFile) ?? { version: TO_VERSION, registered: "2026-11-07", start: TO_R1.start, entries: [], looks: [] };
  async function tick() {
    const mkt = market(); if (!mkt.dates.length) return { error: "chưa có giá VN-Index" };
    const L = ledger(); const byId = new Map(L.entries.map((e) => [e.id, e])); let added = 0, scored = 0, voided = 0;
    const uni = await universe(); const seen = new Set();
    for (const u of uni) {
      const { facts } = factsOf(u, mkt);
      for (const f of facts) {
        const id = `${u.ticker}|${f.disclosed.slice(0, 10)}|${f.cash}`; seen.add(id);
        if (!f.entryDate || f.entryDate < TO_R1.start) continue;
        let e = byId.get(id);
        if (!e && f.qualifies) { e = { id, t: u.ticker, sector: u.sectorGroup ?? null, disclosed: f.disclosed.slice(0, 10), cash: f.cash, y: f.y, adv: f.adv ? Math.round(f.adv) : null, entryDate: f.entryDate, ex: f.ex, recordedAt: new Date(now()).toISOString(), result: null, status: "OPEN" }; L.entries.push(e); byId.set(id, e); added++; }
        if (e && e.status === "OPEN") { e.ex = f.ex; if (f.outcome) { e.result = { exitDate: f.outcome.exitDate, excess: f.outcome.excess, abs: f.outcome.abs, scoredAt: new Date(now()).toISOString() }; e.status = "DONE"; scored++; } }
      }
    }
    const today = vnToday(now());
    for (const e of L.entries) if (e.status === "OPEN" && !seen.has(e.id) && addDaysIso(e.ex, 30) < today) { e.status = "VOID"; voided++; }
    // Lần xem cố định (ghi một lần, không sửa)
    const done = L.entries.filter((e) => e.status === "DONE").sort((a, b) => a.result.exitDate.localeCompare(b.result.exitDate));
    for (const n of TO_R1.looks) {
      if (done.length >= n && !L.looks.some((l) => l.n === n)) {
        const rows = done.slice(0, n).map((e) => ({ m: e.ex.slice(0, 7), x: e.result.excess }));
        const low = lowerAt(rows, TO_R1.ciLevel); const st = blockStats(rows);
        L.looks.push({ n, at: new Date(now()).toISOString(), mean: st.mean, lower975: low, pass: low != null && low > 0 });
      }
    }
    writeJson(ledgerFile, L);
    return { added, scored, voided, open: L.entries.filter((e) => e.status === "OPEN").length, done: done.length };
  }
  function ledgerSummary() {
    const L = ledger(); const done = L.entries.filter((e) => e.status === "DONE").sort((a, b) => a.result.exitDate.localeCompare(b.result.exitDate));
    const xs = done.map((e) => e.result.excess);
    const cus = cusumLow(xs, { mu0: TO_R1.mu0, sigma0: TO_R1.sigma0, k: TO_R1.cusumK, h: TO_R1.cusumH });
    const quarters = {}; done.forEach((e, i) => { const d = e.result.exitDate; const q = `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`; quarters[q] = { n: i + 1, S: cus.path[i] }; });
    const passed = L.looks.find((l) => l.pass);
    return { version: L.version, registered: L.registered, start: L.start, looks: L.looks, label: passed ? "ĐẠT TO-r1" : TO_LABEL, nextLook: TO_R1.looks.find((n) => !L.looks.some((l) => l.n === n)) ?? null,
      counts: { open: L.entries.filter((e) => e.status === "OPEN").length, done: done.length, void: L.entries.filter((e) => e.status === "VOID").length },
      stats: blockStats(done.map((e) => ({ m: e.ex.slice(0, 7), x: e.result.excess }))), cusum: { S: cus.S, alarmed: cus.alarmed, h: TO_R1.cusumH, k: TO_R1.cusumK, mu0: TO_R1.mu0, sigma0: TO_R1.sigma0, quarters },
      entries: [...L.entries].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 60) };
  }
  function forwardSim() {
    const L = ledger(); const mkt = market(); const tr = L.entries.filter((e) => e.status !== "VOID");
    if (!tr.length || !mkt.dates.length) return { from: TO_R1.start, trades: 0, curve: [] };
    const adj = new Map(); for (const t of new Set(tr.map((e) => e.t))) { const s = stockSeries(pricesOf(t) ?? [], mkt.map); adj.set(t, new Map(s.dates.map((d, i) => [d, s.adj[i]]))); }
    const lastCum = (e) => e.result?.exitDate ?? "9999-12-31";
    return simulatePortfolio(tr.map((e) => ({ t: e.t, entryDate: e.entryDate, exitDate: lastCum(e), y: e.y })), { dates: mkt.dates, vn: mkt.map, priceOf: (t, d) => adj.get(t)?.get(d) ?? null, from: TO_R1.start });
  }

  // ---------------- Radar ----------------
  const prevSession = (d) => { let x = addDaysIso(d, -1); for (let g = 0; g < 15 && !isTradingDay(x); g++) x = addDaysIso(x, -1); return x; };
  const sessionsUntil = (a, b) => { let n = 0; for (let x = addDaysIso(a, 1), g = 0; x <= b && g < 400; x = addDaysIso(x, 1), g++) if (isTradingDay(x)) n++; return n; };
  /** Phiên vào sớm nhất: hôm nay nếu là phiên và trước 15:00 (giờ VN), ngược lại phiên kế tiếp. */
  const buySession = (ms) => { const d = vnToday(ms), h = new Date(ms + 7 * 3_600_000).getUTCHours(); if (isTradingDay(d) && h < 15) return d; let x = addDaysIso(d, 1); for (let g = 0; g < 15 && !isTradingDay(x); g++) x = addDaysIso(x, 1); return x; };
  async function radar() {
    const d = doc(); const today = vnToday(now()); const buyDay = buySession(now()); const key = `${today}|${buyDay}|${d?.builtAt ?? ""}|${eventsVersion() ?? ""}`;
    if (radarMemo?.key === key) return radarMemo.value;
    const mkt = market(); const uni = await universe(); const rows = [];
    for (const u of uni) {
      const anns = cashAnnouncements(eventsOf(u.ticker) ?? []).filter((a) => a.ex > today && a.disclosed.slice(0, 10) <= today);
      if (!anns.length) continue;
      const pr = pricesOf(u.ticker); if (!pr?.length) continue;
      const s = stockSeries(pr, mkt.map);
      for (const a of anns) {
        const f = eventFacts(a, s, mkt.map, { exch: u.exchange }); if (!f) continue;
        const lastCumDate = prevSession(a.ex);
        rows.push(radarRow(f, d?.reference, { t: u.ticker, name: u.name ?? null, sector: u.sectorGroup ?? null, today: buyDay, lastCumDate, sessionsUntil, lastPrice: s.raw.at(-1), lastPriceDate: s.dates.at(-1) }));
      }
    }
    rows.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || (b.yieldPre ?? 0) - (a.yieldPre ?? 0));
    const value = { asOf: today, priceAsOf: mkt.dates.at(-1) ?? null, rows };
    radarMemo = { key, value }; return value;
  }

  async function overview() {
    const d = doc();
    return { version: TO_VERSION, label: ledgerSummary().label, rule: TO_RULE, r1: TO_R1, builtAt: d?.builtAt ?? null,
      reference: d ? { byBucket: d.reference.byBucket, rule: d.reference.rule, byYear: d.reference.byYear, runUp: d.reference.runUp, weakSectors: d.reference.weakSectors, sectors: d.reference.sectors } : null,
      radar: await radar(), ledger: ledgerSummary() };
  }
  function sim() { const d = doc(); return { history: d?.history ?? null, forward: forwardSim() }; }
  function legacy(t = null) { const lw = doc()?.legacy; if (!lw) return null; return t ? { pooled: lw.pooled, ticker: t, windows: lw.byTicker[t] ?? null, significant: lw.significant, tests: lw.tests } : { pooled: lw.pooled, significant: lw.significant, tests: lw.tests }; }
  return { build, tick, radar, overview, sim, legacy, doc, ledger: ledgerSummary, hasData: () => fs.existsSync(docFile), status: () => ({ version: TO_VERSION, running, builtAt: doc()?.builtAt ?? null }), _clusterCi: clusterCi };
}
