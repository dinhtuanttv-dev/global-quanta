// Trung tâm thị trường: thế giới → 3 kịch bản → theo dõi trong phiên → sổ tiến. Xem PO-r2-prereg.md.
// Mỗi ảnh chụp ghi cả số bị ẩn (vùng mở cửa, xác suất) để đánh giá lại về sau mà không dùng dữ liệu tương lai.
import { isTradingDay } from "../calendar.js";
import { alignRows, classOf, trackSession } from "./preopenModel.js";
import { buildScenariosR2, enrich, ewmaVol, msVol, RULE_R2 } from "./preopenR2.js";
import { PREOPEN_EVIDENCE } from "./preopenEvidence.js";

export const LEDGER_KEY = "preopen:ledger:v1";
export const SLOTS = [[7, 15], [8, 30], [8, 50]];
export const SCORE_AT = 15 * 60 + 15;
const KEEP_DAYS = 400;
const DOC_TTL = 5 * 60_000, HIST_TTL = 30 * 60_000;
const ES_MAX_AGE = 2 * 3_600_000;
const SHADOW = { ...PREOPEN_EVIDENCE, openBand: true, probabilities: true };
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
export const WORLD = [
  { group: "us", symbol: "^GSPC", name: "S&P 500" }, { group: "us", symbol: "^IXIC", name: "Nasdaq" }, { group: "us", symbol: "^VIX", name: "VIX" },
  { group: "futures", symbol: "ES=F", name: "ES" }, { group: "futures", symbol: "NQ=F", name: "NQ" }, { group: "futures", symbol: "DX-Y.NYB", name: "DXY" },
  { group: "asia", symbol: "^N225", name: "Nikkei" }, { group: "asia", symbol: "^KS11", name: "Kospi" }, { group: "asia", symbol: "^HSI", name: "Hang Seng" },
];
const pad = (n) => String(n).padStart(2, "0");
export const vnClock = (ms) => { const d = new Date(ms + 7 * 3_600_000); return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes(), js: new Date(ms) }; };
const dayKey = (d) => String(d).slice(0, 10);
const round = (v, n = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** n) / 10 ** n);
const sma = (bars, n) => (bars.length >= n ? bars.slice(-n).reduce((a, b) => a + b.close, 0) / n : null);

/** ES giao dịch từ 22:00 UTC Chủ nhật đến 21:00 UTC thứ Sáu. Ngoài giờ đó giá cũ là bình thường; trong giờ mà quá 2 giờ là đóng băng. */
export function esIsFresh(atIso, nowMs) {
  if (!atIso) return false;
  const d = new Date(nowMs), day = d.getUTCDay(), h = d.getUTCHours();
  const closed = day === 6 || (day === 5 && h >= 21) || (day === 0 && h < 22) || h === 21;
  return closed || nowMs - Date.parse(atIso) <= ES_MAX_AGE;
}
/** Số của từng thị trường có thuộc nhịp hiện tại không. Châu Á chưa mở hôm nay thì đó là số phiên trước. */
export function worldFresh(row, nowMs) {
  if (!row.at) return false;
  if (row.group === "asia") return vnClock(Date.parse(row.at)).date === vnClock(nowMs).date;
  if (row.group === "us") return nowMs - Date.parse(row.at) <= 20 * 3_600_000;
  return esIsFresh(row.at, nowMs) && nowMs - Date.parse(row.at) <= 26 * 3_600_000;
}

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
  let cache = null, hist = null, ledger = null, inflight = null, volMemo = null;
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

  /** Hàng huấn luyện và σ̂ phiên kế tiếp. Mỗi phiên chỉ tính một lần vì ước lượng MS-GARCH tốn thời gian. */
  function prepared(done, es) {
    const prevDate = dayKey(done[done.length - 1].date);
    const key = `${prevDate}|${es.length}`;
    if (volMemo?.key === key) return volMemo;
    const bars = done.slice(-780), closes = bars.map((b) => b.close);
    const rows = enrich(alignRows(bars, es), bars, { msStart: Math.max(1, closes.length - 260) });
    const ew = ewmaVol([...closes, closes[closes.length - 1]]), ms = msVol(closes, closes.length);
    volMemo = { key, rows, volNow: { ew: ew[ew.length - 1], ms: ms[ms.length - 1] } };
    return volMemo;
  }
  function esMoveOf(worldRows, es, prev) {
    const row = worldRows.find((w) => w.symbol === "ES=F"), fresh = esIsFresh(row?.at, now());
    const refTs = Date.parse(`${dayKey(prev.date)}T08:00:00Z`) / 1000;
    let refEs = null;
    for (const b of es) { if (b.t + 3600 <= refTs) refEs = b.close; else break; }
    const move = fresh && row?.price > 0 && refEs > 0 ? (row.price / refEs - 1) * 100 : null;
    return { move, price: row?.price ?? null, refEs, at: row?.at ?? null, fresh };
  }

  async function compute() {
    const clock = vnClock(now()), session = nextSession(clock), phase = phaseOf(clock);
    const [bars, es, worldRows, ms] = await Promise.all([getVnBars(), esHistory(), world(), getMsGarch().catch(() => null)]);
    const done = bars.filter((b) => b.close > 0 && dayKey(b.date) < session && !b.partial);
    const today = bars.find((b) => dayKey(b.date) === session) ?? null;
    if (done.length < 130) throw new Error("Chưa đủ phiên VN-Index.");
    const prev = done[done.length - 1], live = esMoveOf(worldRows, es, prev), p = prepared(done, es);
    const lb = await loadLedger(), day = lb.days[session], slotKeys = Object.keys(day?.slots ?? {}).sort();
    // Trong phiên giữ nguyên kịch bản của ảnh chụp cuối trước 09:00, không để ES đang chạy đổi mục tiêu.
    const frozen = phase === "session" && slotKeys.length ? { slot: slotKeys[slotKeys.length - 1], es: day.slots[slotKeys[slotKeys.length - 1]].es } : null;
    const esUsed = frozen ? frozen.es : live.move;
    const levels = { close: round(prev.close, 1), ma20: round(sma(done, 20), 1), ma50: round(sma(done, 50), 1), ma200: round(sma(done, 200), 1) };
    const model = buildScenariosR2({ rows: p.rows, es: esUsed, prevClose: levels.close, levels, volNow: p.volNow, evidence });
    const scenarios = model.scenarios.map(({ shadowOpen, shadowProbability, ...s }) => s);
    const tracking = phase === "session" && model.lead && today && today.open > 0 ? trackSession({ scenarios, lead: model.lead, open: today.open, last: today.close, prevClose: prev.close }) : null;
    return {
      version: "preopen/2", rule: RULE_R2, asOf: new Date(now()).toISOString(), phase, session, prevDate: dayKey(prev.date),
      es: { movePct: round(esUsed), livePct: round(live.move), price: live.price, refPrice: live.refEs, at: live.at, fresh: live.fresh, frozenAt: frozen?.slot ?? null },
      ...model, scenarios, tracking, levels, volNext: { ms: round(p.volNow.ms), ew: round(p.volNow.ew) },
      risk: ms?.available ? { label: ms.regime.label, probCalm: round(ms.regime.probCalm, 3), probVolatile: round(ms.regime.probVolatile, 3), volAnnualPct: round(ms.volAnnualPct, 1), grade: ms.grade, asOf: ms.asOf } : null,
      world: worldRows.map(({ symbol, ...w }) => ({ ...w, fresh: worldFresh(w, now()) })), evidence,
      timeline: slotKeys.map((slot) => ({ slot, lead: day.slots[slot].lead, es: day.slots[slot].es, at: day.slots[slot].at })), ledger: ledgerStats(lb),
    };
  }
  function ledgerStats(lb) {
    const scored = Object.values(lb.days).filter((d) => d.score);
    const share = (f) => (scored.length ? round((scored.filter(f).length / scored.length) * 100, 1) : null);
    return { days: Object.keys(lb.days).length, scored: scored.length, openCoverage: share((d) => d.score.openIn), dayCoverage: share((d) => d.score.dayIn), leadHit: share((d) => d.score.leadHit) };
  }

  /** Ghi ảnh chụp tại mốc giờ, gồm cả số chưa được hiện. Thiếu ES thì ghi rõ không có kịch bản dẫn đầu. */
  async function snapshot(slot) {
    const clock = vnClock(now()), lb = await loadLedger();
    const day = (lb.days[clock.date] ??= { slots: {} });
    if (day.slots[slot]) return false;
    const [bars, es, worldRows] = await Promise.all([getVnBars(), esHistory(), world()]);
    const done = bars.filter((b) => b.close > 0 && dayKey(b.date) < clock.date && !b.partial), prev = done[done.length - 1];
    if (!prev) return false;
    const live = esMoveOf(worldRows, es, prev), p = prepared(done, es), close = round(prev.close, 1);
    const levels = { close, ma20: round(sma(done, 20), 1), ma50: round(sma(done, 50), 1), ma200: round(sma(done, 200), 1) };
    const m = buildScenariosR2({ rows: p.rows, es: live.move, prevClose: close, levels, volNow: p.volNow, evidence: SHADOW });
    day.prevClose = prev.close;
    day.slots[slot] = { at: new Date(now()).toISOString(), rule: RULE_R2, es: round(live.move), lead: m.lead, shadow: m.scenarios.map((s) => ({ id: s.id, open: s.shadowOpen, day: s.day, probability: s.shadowProbability })), world: worldRows.map((w) => [w.name, w.changePct, w.at]) };
    await saveLedger();
    cache = null;
    return true;
  }

  /** 15:15: chấm ảnh chụp mới nhất của ngày theo vùng và lớp kết quả đã đặt trước. */
  async function score(date) {
    const lb = await loadLedger(), day = lb.days[date];
    if (!day || day.score) return false;
    const keys = Object.keys(day.slots ?? {}).sort(), last = day.slots?.[keys[keys.length - 1]];
    if (!last) return false;
    const bar = (await getVnBars()).find((b) => dayKey(b.date) === date && !b.partial && b.open > 0);
    if (!bar) return false;
    const lead = last.shadow.find((s) => s.id === last.lead), cc = (bar.close / day.prevClose - 1) * 100;
    day.score = {
      at: new Date(now()).toISOString(), open: bar.open, close: bar.close, gapPct: round((bar.open / day.prevClose - 1) * 100), ccPct: round(cc),
      openIn: !!lead?.open && bar.open >= lead.open.lo && bar.open <= lead.open.hi, dayIn: !!lead && bar.close >= lead.day.lo && bar.close <= lead.day.hi, outcome: classOf(cc), leadHit: last.lead != null && last.lead === classOf(cc), slot: keys[keys.length - 1],
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
    snapshot, score, tick,
    async get() {
      if (cache && now() - cache.at < DOC_TTL) return cache.doc;
      inflight ??= compute().then((doc) => { cache = { at: now(), doc }; return doc; }).finally(() => { inflight = null; });
      return inflight;
    },
    startTimer() { const h = setInterval(() => { void tick(); }, 60_000); h.unref?.(); return h; },
  };
}
