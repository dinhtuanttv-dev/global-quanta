// Trung tâm thị trường: thế giới → 3 kịch bản → theo dõi trong phiên → sổ tiến. Xem PO-r2-prereg.md.
// Mỗi ảnh chụp ghi cả số bị ẩn (vùng mở cửa, xác suất) để đánh giá lại về sau mà không dùng dữ liệu tương lai.
import { isTradingDay } from "../calendar.js";
import { alignRows, classOf, trackSession } from "./preopenModel.js";
import { buildScenariosR2, enrich, ewmaVol, msVol, RULE_R2 } from "./preopenR2.js";
import { PREOPEN_EVIDENCE } from "./preopenEvidence.js";
import { evaluateConfirm, leadVsBaseline, ledgerRows } from "./preopenConfirm.js";

export const LEDGER_KEY = "preopen:ledger:v1";
/** preopen/3: giờ kịch bản bị vô hiệu lần đầu trong phiên (ghi phía máy chủ, không phụ thuộc người xem). Khoá riêng, không đổi định dạng sổ. */
export const TRACK_KEY = "preopen:track:v1";
const TRACK_KEEP = 120;
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

/**
 * getVnLive: VN-Index trong phiên { last, open, at } từ cùng snapshot với TopBar. Nến ngày của chỉ số không có nến tạm trong phiên
 * (marketDataService chỉ dựng nến tạm cho cổ phiếu), nên không được dựa vào nó để theo dõi trong phiên; nến ngày chỉ còn là dự phòng.
 */
export function createPreopenService({ getVnBars, getMsGarch = async () => null, getVnLive = async () => null, store = null, world = fetchWorld, esHours = fetchEsHours, now = Date.now, tradingDay = isTradingDay, evidence = PREOPEN_EVIDENCE, log = console } = {}) {
  let cache = null, hist = null, ledger = null, inflight = null, volMemo = null, track = null;
  async function loadTrack() {
    if (track) return track;
    try { track = (await store?.getKv?.(TRACK_KEY))?.value ?? null; } catch (e) { log.warn?.(`[preopen] đọc theo dõi: ${e.message}`); }
    return (track ??= { days: {} });
  }
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
    // PO-r2-F: không đạt xác nhận tiến thì dải cả phiên tự về "chưa đạt" (evidence gốc giữ nguyên trong preopenEvidence.js).
    const confirm = evaluateConfirm(lb);
    const doc = {
      version: "preopen/3", rule: RULE_R2, asOf: new Date(now()).toISOString(), phase, session, prevDate: dayKey(prev.date),
      es: { movePct: round(esUsed), livePct: round(live.move), price: live.price, refPrice: live.refEs, at: live.at, fresh: live.fresh, frozenAt: frozen?.slot ?? null },
      ...model, scenarios, tracking: null, levels, volNext: { ms: round(p.volNow.ms), ew: round(p.volNow.ew) },
      risk: ms?.available ? { label: ms.regime.label, probCalm: round(ms.regime.probCalm, 3), probVolatile: round(ms.regime.probVolatile, 3), volAnnualPct: round(ms.volAnnualPct, 1), grade: ms.grade, asOf: ms.asOf } : null,
      world: worldRows.map(({ symbol, ...w }) => ({ ...w, fresh: worldFresh(w, now()) })),
      evidence: { ...evidence, dayBand: evidence.dayBand && confirm.status !== "failed", confirm },
      timeline: slotKeys.map((slot) => ({ slot, lead: day.slots[slot].lead, es: day.slots[slot].es, at: day.slots[slot].at })), ledger: ledgerStats(lb),
    };
    return { doc, prevClose: prev.close, today };
  }
  function ledgerStats(lb) {
    const scored = Object.values(lb.days).filter((d) => d.score);
    const share = (f) => (scored.length ? round((scored.filter(f).length / scored.length) * 100, 1) : null);
    const lvb = leadVsBaseline(lb);
    return { days: Object.keys(lb.days).length, scored: scored.length, openCoverage: share((d) => d.score.openIn), dayCoverage: share((d) => d.score.dayIn), leadHit: share((d) => d.score.leadHit), lead: lvb.lead, alwaysMid: lvb.alwaysMid };
  }

  /**
   * Theo dõi trong phiên, tính lại ở mỗi lượt đọc (tài liệu chính cache 5 phút). Ưu tiên VN-Index trực tiếp; thiếu thì dùng nến ngày.
   * Lần đầu kịch bản bị vô hiệu được ghi giờ vào TRACK_KEY và giữ nguyên cả khi giá quay lại.
   */
  async function liveTracking(doc, prevClose, todayBar) {
    if (doc.phase !== "session" || !doc.lead) return null;
    let src = null;
    try {
      const v = await getVnLive();
      if (v?.last > 0 && v.at && vnClock(Date.parse(v.at)).date === doc.session) {
        // Giá mở chính thức (nến ngày, gồm ATO) ưu tiên; nến 1 phút đầu tiên bắt đầu sau ATO nên chỉ là dự phòng.
        const open = todayBar?.open > 0 ? todayBar.open : v.open > 0 ? v.open : null;
        if (open) src = { open, last: v.last, at: v.at, source: "live" };
      }
    } catch (e) { log.warn?.(`[preopen] giá trong phiên: ${e.message}`); }
    if (!src && todayBar?.open > 0 && todayBar.close > 0) src = { open: todayBar.open, last: todayBar.close, at: null, source: "daily" };
    if (!src) return null;
    const t = trackSession({ scenarios: doc.scenarios, lead: doc.lead, open: src.open, last: src.last, prevClose });
    const band = doc.scenarios.find((s) => s.id === doc.lead)?.day;
    const pctInBand = band && band.hi > band.lo ? round(((src.last - band.lo) / (band.hi - band.lo)) * 100, 1) : null;
    const tk = await loadTrack();
    let rec = tk.days[doc.session] ?? null;
    if (!rec?.invalidatedAt && t.invalidated) {
      rec = { invalidatedAt: new Date(now()).toISOString(), last: round(src.last), lead: doc.lead, source: src.source };
      tk.days[doc.session] = rec;
      const keys = Object.keys(tk.days).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - TRACK_KEEP))) delete tk.days[k];
      try { await store?.setKv?.(TRACK_KEY, tk); } catch (e) { log.warn?.(`[preopen] ghi theo dõi: ${e.message}`); }
    }
    return { ...t, at: src.at, source: src.source, pctInBand, invalidatedAt: rec?.invalidatedAt ?? null, invalidatedLast: rec?.last ?? null };
  }

  async function get() {
    if (!cache || now() - cache.at >= DOC_TTL) {
      inflight ??= compute().then((r) => { cache = { at: now(), ...r }; return r; }).finally(() => { inflight = null; });
      await inflight;
    }
    const c = cache;
    let tracking = null;
    try { tracking = await liveTracking(c.doc, c.prevClose, c.today); } catch (e) { log.warn?.(`[preopen] theo dõi: ${e.message}`); }
    return { ...c.doc, tracking, nextRefreshAt: new Date(c.at + DOC_TTL).toISOString() };
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
    // Trong phiên: đọc mỗi phút để giờ vô hiệu được ghi kể cả khi không ai mở bảng (tài liệu chính vẫn cache 5 phút).
    if (clock.mins >= 9 * 60 && clock.mins < 15 * 60) { await get().catch((e) => log.warn?.(`[preopen] theo dõi phiên: ${e.message}`)); return null; }
    if (clock.mins >= SCORE_AT) await score(clock.date).catch((e) => log.warn?.(`[preopen] chấm: ${e.message}`));
    return null;
  }
  return {
    snapshot, score, tick, get,
    /** Từng phiên đã chấm (mới nhất trước) + PO-r2-F + đường cơ sở; không có số bị ẩn. */
    async ledger({ limit = 60 } = {}) {
      const lb = await loadLedger();
      return { rule: RULE_R2, asOf: new Date(now()).toISOString(), confirm: evaluateConfirm(lb), ...leadVsBaseline(lb), rows: ledgerRows(lb, limit) };
    },
    startTimer() { const h = setInterval(() => { void tick(); }, 60_000); h.unref?.(); return h; },
  };
}
