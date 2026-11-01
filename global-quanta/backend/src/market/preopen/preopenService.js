// Trung tâm thị trường: thế giới → 3 kịch bản → theo dõi trong phiên → sổ tiến. Xem PO-prereg.md.
// Mỗi ảnh chụp ghi cả số bị ẩn (vùng mở cửa, xác suất) để đánh giá lại về sau mà không dùng dữ liệu tương lai.
import { isTradingDay } from "../calendar.js";
import { alignRows, BUCKETS, buildScenarios, classOf, RULE, trackSession } from "./preopenModel.js";
import { PREOPEN_EVIDENCE } from "./preopenEvidence.js";

export const LEDGER_KEY = "preopen:ledger:v1";
export const SLOTS = [[7, 15], [8, 30], [8, 50]];
export const SCORE_AT = 15 * 60 + 5;
const KEEP_DAYS = 400;
const DOC_TTL = 5 * 60_000, HIST_TTL = 30 * 60_000;
const SHADOW = { openBand: true, dayBand: true, probabilities: true, noPanicSell: true, noChase: true };
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
export const WORLD = [
  { group: "us", symbol: "^GSPC", name: "S&P 500", closedAt: "04:00" }, { group: "us", symbol: "^IXIC", name: "Nasdaq", closedAt: "04:00" }, { group: "us", symbol: "^VIX", name: "VIX", closedAt: "04:00" },
  { group: "futures", symbol: "ES=F", name: "ES" }, { group: "futures", symbol: "NQ=F", name: "NQ" }, { group: "futures", symbol: "DX-Y.NYB", name: "DXY" },
  { group: "asia", symbol: "^N225", name: "Nikkei" }, { group: "asia", symbol: "^KS11", name: "Kospi" }, { group: "asia", symbol: "^HSI", name: "Hang Seng" },
];
const pad = (n) => String(n).padStart(2, "0");
export const vnClock = (ms) => { const d = new Date(ms + 7 * 3_600_000); return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes(), js: new Date(ms) }; };
const dayKey = (d) => String(d).slice(0, 10);
const round = (v, n = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** n) / 10 ** n);
const sma = (bars, n) => (bars.length >= n ? bars.slice(-n).reduce((a, b) => a + b.close, 0) / n : null);

/** Lấy giá hiện tại và % đổi so với phiên trước từ Yahoo. Lỗi một mã không làm hỏng cả bảng. */
export async function fetchWorld(fetchImpl = globalThis.fetch) {
  return Promise.all(WORLD.map(async (w) => {
    try {
      const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(w.symbol)}?range=5d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const x = (await r.json()).chart.result[0], closes = (x.indicators.quote[0].close ?? []).filter((v) => v != null), m = x.meta;
      const price = m.regularMarketPrice ?? closes.at(-1), at = m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null;
      const sameBar = closes.length && Math.abs(closes.at(-1) - price) / price < 1e-6;
      const prev = sameBar ? closes.at(-2) : closes.at(-1);
      return { ...w, price, at, changePct: prev > 0 ? round((price / prev - 1) * 100) : null };
    } catch { return { ...w, price: null, at: null, changePct: null }; }
  }));
}
export async function fetchEsHours(fetchImpl = globalThis.fetch) {
  const r = await fetchImpl("https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=2y&interval=60m", { headers: UA, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`ES HTTP ${r.status}`);
  const x = (await r.json()).chart.result[0], q = x.indicators.quote[0];
  return x.timestamp.map((t, i) => ({ t, close: q.close[i] })).filter((b) => b.close != null);
}

export function createPreopenService({ getVnBars, getMsGarch = async () => null, store = null, world = fetchWorld, esHours = fetchEsHours, now = Date.now, tradingDay = isTradingDay, evidence = PREOPEN_EVIDENCE, log = console } = {}) {
  let cache = null, hist = null, ledger = null, inflight = null;
  async function loadLedger() {
    if (ledger) return ledger;
    try { ledger = (await store?.getKv?.(LEDGER_KEY))?.value ?? null; } catch (e) { log.warn?.(`[preopen] đọc sổ: ${e.message}`); }
    return (ledger ??= { days: {} });
  }
  const saveLedger = async () => {
    const keys = Object.keys(ledger.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete ledger.days[k];
    try { await store?.setKv?.(LEDGER_KEY, ledger); } catch (e) { log.warn?.(`[preopen] ghi sổ: ${e.message}`); }
  };
  async function esHistory() {
    if (hist && now() - hist.at < HIST_TTL) return hist.bars;
    try { hist = { at: now(), bars: await esHours() }; } catch (e) { if (!hist) throw e; log.warn?.(`[preopen] ES: ${e.message}`); }
    return hist.bars;
  }
  function nextSession(clock) {
    if (tradingDay(clock.js) && clock.mins < 15 * 60) return clock.date;
    for (let i = 1; i < 10; i++) { const d = new Date(now() + i * 86_400_000); if (tradingDay(d)) return vnClock(d.getTime()).date; }
    return clock.date;
  }
  const phaseOf = (clock) => (!tradingDay(clock.js) ? "closed" : clock.mins < 9 * 60 ? "pre" : clock.mins < 15 * 60 ? "session" : "post");

  async function compute() {
    const clock = vnClock(now()), session = nextSession(clock);
    const [bars, es, worldRows, ms] = await Promise.all([getVnBars(), esHistory(), world(), getMsGarch().catch(() => null)]);
    const done = bars.filter((b) => b.close > 0 && dayKey(b.date) < session && !b.partial);
    const today = bars.find((b) => dayKey(b.date) === session) ?? null;
    if (done.length < 130) throw new Error("Chưa đủ phiên VN-Index.");
    const prev = done[done.length - 1], rows = alignRows(done, es);
    const esNow = worldRows.find((w) => w.symbol === "ES=F")?.price;
    // Giá ES đã chốt tại 15:00 phiên trước, không dùng nến sau mốc này.
    const refTs = Date.parse(`${dayKey(prev.date)}T08:00:00Z`) / 1000;
    let refEs = null;
    for (const b of es) { if (b.t + 3600 <= refTs) refEs = b.close; else break; }
    const esMove = esNow > 0 && refEs > 0 ? (esNow / refEs - 1) * 100 : null;
    const model = buildScenarios({ rows, es: esMove, prevClose: round(prev.close, 1), evidence });
    const phase = phaseOf(clock);
    const tracking = phase !== "pre" && today && today.open > 0 ? trackSession({ scenarios: model.scenarios, lead: model.lead, open: today.open, last: today.close, prevClose: prev.close }) : null;
    const lb = await loadLedger(), day = lb.days[session];
    return {
      version: "preopen/1", rule: RULE, asOf: new Date(now()).toISOString(), phase, session, prevDate: dayKey(prev.date), es: { movePct: round(esMove), price: esNow ?? null, refPrice: refEs, at: worldRows.find((w) => w.symbol === "ES=F")?.at ?? null },
      ...model, tracking, levels: { close: round(prev.close, 1), ma20: round(sma(done, 20), 1), ma50: round(sma(done, 50), 1), ma200: round(sma(done, 200), 1) },
      risk: ms?.available ? { label: ms.regime.label, probCalm: round(ms.regime.probCalm, 3), probVolatile: round(ms.regime.probVolatile, 3), volAnnualPct: round(ms.volAnnualPct, 1), grade: ms.grade, asOf: ms.asOf } : null,
      world: worldRows.map(({ symbol, ...w }) => w), evidence, timeline: Object.entries(day?.slots ?? {}).map(([slot, s]) => ({ slot, lead: s.lead, es: s.es })), ledger: ledgerStats(lb),
    };
  }
  function ledgerStats(lb) {
    const scored = Object.values(lb.days).filter((d) => d.score);
    const share = (f) => (scored.length ? round((scored.filter(f).length / scored.length) * 100, 1) : null);
    return { days: Object.keys(lb.days).length, scored: scored.length, openCoverage: share((d) => d.score.openIn), dayCoverage: share((d) => d.score.dayIn), leadHit: share((d) => d.score.leadHit) };
  }

  /** Ghi ảnh chụp tại mốc giờ, gồm cả số chưa được hiện. */
  async function snapshot(slot) {
    const clock = vnClock(now()), lb = await loadLedger();
    const day = (lb.days[clock.date] ??= { slots: {} });
    if (day.slots[slot]) return false;
    const [bars, es, worldRows] = await Promise.all([getVnBars(), esHistory(), world()]);
    const done = bars.filter((b) => b.close > 0 && dayKey(b.date) < clock.date && !b.partial), prev = done[done.length - 1];
    if (!prev) return false;
    const esNow = worldRows.find((w) => w.symbol === "ES=F")?.price;
    const refTs = Date.parse(`${dayKey(prev.date)}T08:00:00Z`) / 1000;
    let refEs = null;
    for (const b of es) { if (b.t + 3600 <= refTs) refEs = b.close; else break; }
    const esMove = esNow > 0 && refEs > 0 ? (esNow / refEs - 1) * 100 : null;
    const m = buildScenarios({ rows: alignRows(done, es), es: esMove, prevClose: round(prev.close, 1), evidence: SHADOW });
    day.prevClose = prev.close;
    day.slots[slot] = { at: new Date(now()).toISOString(), es: round(esMove), lead: m.lead, shadow: m.scenarios.map((s) => ({ id: s.id, open: s.open, day: s.day, probability: s.probability })), world: worldRows.map((w) => [w.name, w.changePct]) };
    await saveLedger();
    cache = null;
    return true;
  }

  /** 15:05: chấm ảnh chụp mới nhất của ngày theo vùng và lớp kết quả đã đặt trước. */
  async function score(date) {
    const lb = await loadLedger(), day = lb.days[date];
    if (!day || day.score) return false;
    const keys = Object.keys(day.slots ?? {}).sort(), last = day.slots?.[keys.at(-1)];
    if (!last) return false;
    const bar = (await getVnBars()).find((b) => dayKey(b.date) === date && !b.partial && b.open > 0);
    if (!bar) return false;
    const lead = last.shadow.find((s) => s.id === last.lead);
    day.score = {
      at: new Date(now()).toISOString(), open: bar.open, close: bar.close, gapPct: round((bar.open / day.prevClose - 1) * 100), ccPct: round((bar.close / day.prevClose - 1) * 100),
      openIn: !!lead?.open && bar.open >= lead.open.lo && bar.open <= lead.open.hi, dayIn: !!lead && bar.close >= lead.day.lo && bar.close <= lead.day.hi, outcome: classOf((bar.close / day.prevClose - 1) * 100), leadHit: last.lead === classOf((bar.close / day.prevClose - 1) * 100), slot: keys.at(-1),
    };
    await saveLedger();
    cache = null;
    return true;
  }

  async function tick() {
    const clock = vnClock(now());
    if (!tradingDay(clock.js)) return null;
    for (const [h, m] of SLOTS) {
      const at = h * 60 + m, slot = `${pad(h)}:${pad(m)}`;
      if (clock.mins >= at && clock.mins < at + 14) { await snapshot(slot).catch((e) => log.warn?.(`[preopen] ${slot}: ${e.message}`)); return slot; }
    }
    if (clock.mins >= SCORE_AT) await score(clock.date).catch((e) => log.warn?.(`[preopen] chấm: ${e.message}`));
    return null;
  }
  return {
    snapshot, score, tick, BUCKETS,
    async get() {
      if (cache && now() - cache.at < DOC_TTL) return cache.doc;
      inflight ??= compute().then((doc) => { cache = { at: now(), doc }; return doc; }).finally(() => { inflight = null; });
      return inflight;
    },
    startTimer() { const h = setInterval(() => { void tick(); }, 60_000); h.unref?.(); return h; },
  };
}
