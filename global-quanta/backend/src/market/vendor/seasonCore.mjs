// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: quant-macro-scanner lib/jobs/season-core.ts (commit c33fa9b). Tạo lại: node scripts/bundle-gateway-jobs.mjs <ra> lib/jobs/season-core.ts
import { createRequire as __qmsCreateRequire } from "node:module"; const require = __qmsCreateRequire(import.meta.url);

// lib/market-data/ssi-gateway-adapter.ts
var MARKET_GATEWAY_URL = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
async function fetchSsiNominalHistory(ticker, years = 5, { timeoutMs = 45e3, fetchImpl = fetch } = {}) {
  const url = `${MARKET_GATEWAY_URL}/api/market/ohlcv/nominal-history?ticker=${encodeURIComponent(ticker)}&years=${years}`;
  try {
    const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { success: false, data: null, referenceAdjustments: [], error: `Gateway HTTP ${res.status}: ${body?.error ?? "kh\xF4ng r\xF5"}` };
    const data = (Array.isArray(body?.bars) ? body.bars : []).filter((b) => typeof b?.date === "string" && typeof b?.close === "number" && b.close > 0).map((b) => ({ date: b.date, close: b.close, ref: b.ref ?? null, volume: b.volume ?? null }));
    const referenceAdjustments = (Array.isArray(body?.referenceAdjustments) ? body.referenceAdjustments : []).filter((e) => typeof e?.date === "string" && typeof e?.factor === "number").map((e) => ({ date: e.date, factor: e.factor }));
    return {
      success: data.length > 0,
      data,
      referenceAdjustments,
      source: body?.provenance?.source ?? null,
      refresh: body?.provenance?.refresh ?? null,
      error: data.length ? void 0 : "Gateway tr\u1EA3 chu\u1ED7i r\u1ED7ng"
    };
  } catch (e) {
    return { success: false, data: null, referenceAdjustments: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// lib/market-data/yahoo-finance-adapter.ts
var YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
function toYahooSymbol(ticker) {
  const normalized = ticker.trim().toUpperCase();
  if (normalized === "VNINDEX" || normalized === "VN-INDEX") return "^VNINDEX.VN";
  if (ticker.startsWith("^") || ticker.includes(".")) return ticker;
  return `${ticker}.VN`;
}
async function fetchOhlcvHistory(ticker, range = "3mo") {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      return { success: false, data: null, error: `Yahoo Finance tra ve HTTP ${res.status} cho ma ${symbol}` };
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !Array.isArray(result.timestamp)) {
      const errMsg = json?.chart?.error?.description ?? "Khong nhan duoc du lieu hop le tu Yahoo Finance";
      return { success: false, data: null, error: `${errMsg} (ma: ${symbol})` };
    }
    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    const adjcloseArr = result.indicators?.adjclose?.[0]?.adjclose;
    if (!quote) {
      return { success: false, data: null, error: "Thieu truong indicators.quote trong response Yahoo" };
    }
    const bars = timestamps.map((t, i) => ({
      date: new Date(t * 1e3).toISOString().slice(0, 10),
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i],
      adjClose: adjcloseArr?.[i] ?? quote.close?.[i]
      // fallback ve close neu Yahoo thieu adjclose
    })).filter((bar) => bar.close !== null && bar.close !== void 0 && !Number.isNaN(bar.close));
    return { success: true, data: bars };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      data: null,
      error: isTimeout ? "Yahoo Finance khong phan hoi trong 10s (timeout)" : err instanceof Error ? err.message : String(err)
    };
  }
}

// lib/market-data/vndirect-adapter.ts
var VND_BASE_URL = "https://dchart-api.vndirect.com.vn/dchart/history";
async function fetchIndexOhlcvHistory(symbol, days = 90) {
  try {
    const to = Math.floor(Date.now() / 1e3);
    const from = to - days * 24 * 60 * 60;
    const url = `${VND_BASE_URL}?resource=stock&symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      return { success: false, data: null, error: `VNDirect dchart tra ve HTTP ${res.status} cho ma ${symbol}` };
    }
    const json = await res.json();
    if (json?.s !== "ok" || !Array.isArray(json?.t) || json.t.length === 0) {
      return { success: false, data: null, error: `VNDirect dchart khong co du lieu hop le cho ma ${symbol}` };
    }
    const bars = json.t.map((ts, i) => ({
      date: new Date(ts * 1e3).toISOString().slice(0, 10),
      open: json.o[i],
      high: json.h[i],
      low: json.l[i],
      close: json.c[i],
      volume: json.v[i]
    }));
    return { success: true, data: bars };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      data: null,
      error: isTimeout ? "VNDirect dchart khong phan hoi trong 10s (timeout)" : err instanceof Error ? err.message : String(err)
    };
  }
}

// lib/cotuc/vndirect-finfo-adapter.ts
var BASE = "https://api-finfo.vndirect.com.vn/v4";
var UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
var ITEM_REVENUE = 21001;
var ITEM_NPAT_PARENT = 23e3;
async function getJson(url, fetchImpl, timeoutMs = 15e3) {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`VNDirect HTTP ${res.status}`);
  return res.json();
}
function parseVndEvents(rows) {
  const day = (s) => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  const cash = /* @__PURE__ */ new Map();
  const shares = /* @__PURE__ */ new Map();
  const meetings = /* @__PURE__ */ new Set();
  for (const e of rows) {
    if (e.locale && e.locale !== "VN") continue;
    const d = day(e.effectiveDate);
    if (!d) continue;
    if (e.type === "DIVIDEND" && typeof e.dividend === "number" && e.dividend > 0) {
      const k = `${d}`;
      const prev = cash.get(k);
      cash.set(k, { exDate: d, valuePerShare: (prev?.valuePerShare ?? 0) + e.dividend, note: e.note ?? null });
    } else if ((e.type === "STOCKDIV" || e.type === "KINDDIV") && typeof e.ratio === "number" && e.ratio > 0) {
      const k = `${d}:${e.type}`;
      shares.set(k, { exDate: d, ratio: e.ratio / 100, kind: e.type, note: e.note ?? null });
    } else if (e.type === "MEETING") {
      meetings.add(d);
    }
  }
  const byDate = (a, b) => a.exDate.localeCompare(b.exDate);
  return { cash: [...cash.values()].sort(byDate), shares: [...shares.values()].sort(byDate), meetings: [...meetings].sort() };
}
async function fetchVndCorporateActions(ticker, { fetchImpl = fetch } = {}) {
  try {
    const url = `${BASE}/events?q=code:${encodeURIComponent(ticker)}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING&sort=effectiveDate:desc&size=500`;
    const json = await getJson(url, fetchImpl);
    return { ok: true, ...parseVndEvents(json.data ?? []) };
  } catch (e) {
    return { ok: false, cash: [], shares: [], meetings: [], error: e instanceof Error ? e.message : String(e) };
  }
}
function parseVndStatements(rows) {
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.reportType && r.reportType !== "QUARTER") continue;
    const fd = r.fiscalDate?.slice(0, 10);
    if (!fd || !/^\d{4}-\d{2}-\d{2}$/.test(fd)) continue;
    const month = Number(fd.slice(5, 7));
    if (![3, 6, 9, 12].includes(month)) continue;
    const q = by.get(fd) ?? { year: Number(fd.slice(0, 4)), quarter: month / 3, fiscalDate: fd, announceDate: null, revenue: null, netProfit: null };
    const created = r.createdDate?.slice(0, 10) ?? null;
    const lag = created ? (Date.parse(created) - Date.parse(fd)) / 864e5 : NaN;
    if (created && lag >= 1 && lag <= 120 && (!q.announceDate || created < q.announceDate)) q.announceDate = created;
    if (r.itemCode === ITEM_REVENUE && typeof r.numericValue === "number") q.revenue = r.numericValue;
    if (r.itemCode === ITEM_NPAT_PARENT && typeof r.numericValue === "number") q.netProfit = r.numericValue;
    by.set(fd, q);
  }
  return [...by.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
}
async function fetchVndQuarterlyFinancials(ticker, { fetchImpl = fetch } = {}) {
  try {
    const url = `${BASE}/financial_statements?q=code:${encodeURIComponent(ticker)}~reportType:QUARTER~itemCode:${ITEM_REVENUE},${ITEM_NPAT_PARENT}&size=200&sort=fiscalDate:desc`;
    const json = await getJson(url, fetchImpl);
    const quarters = parseVndStatements(json.data ?? []);
    return { available: quarters.length > 0, quarters, error: quarters.length ? void 0 : "VNDirect kh\xF4ng c\xF3 BCTC qu\xFD" };
  } catch (e) {
    return { available: false, quarters: [], error: e instanceof Error ? e.message : String(e) };
  }
}
function vndEventsToVciShape(rows) {
  const day = (s) => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const e of rows) {
    if (e.locale && e.locale !== "VN") continue;
    const eff = day(e.effectiveDate);
    if (!eff) continue;
    const key = `${e.type}:${eff}:${e.dividend ?? ""}:${e.ratio ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = { publicDate: day(e.disclosureDate), recordDate: null, listingDate: null, source: "VNDIRECT" };
    if (e.type === "DIVIDEND" && typeof e.dividend === "number" && e.dividend > 0) {
      out.push({
        ...base,
        eventCode: "DIV",
        exrightDate: eff,
        issueDate: null,
        payoutDate: day(e.actualDate),
        eventTitleVi: e.note || `C\u1ED5 t\u1EE9c b\u1EB1ng ti\u1EC1n ${e.dividend.toLocaleString("vi-VN")} \u0111/cp`,
        valuePerShare: e.dividend,
        exerciseRatio: null
      });
    } else if ((e.type === "STOCKDIV" || e.type === "KINDDIV") && typeof e.ratio === "number" && e.ratio > 0) {
      const title = e.type === "STOCKDIV" ? "C\u1ED5 t\u1EE9c b\u1EB1ng c\u1ED5 phi\u1EBFu" : "C\u1ED5 phi\u1EBFu th\u01B0\u1EDFng";
      out.push({
        ...base,
        eventCode: "ISS",
        exrightDate: eff,
        issueDate: null,
        payoutDate: null,
        eventTitleVi: `${title}${e.note ? ` \u2014 ${e.note}` : ""}`,
        valuePerShare: null,
        exerciseRatio: e.ratio / 100
      });
    } else if (e.type === "MEETING") {
      out.push({
        ...base,
        eventCode: "AGME",
        exrightDate: null,
        issueDate: eff,
        payoutDate: null,
        eventTitleVi: e.note || e.typeDesc || "H\u1ECDp \u0110H\u0110C\u0110",
        valuePerShare: null,
        exerciseRatio: null
      });
    }
  }
  return out;
}
async function fetchVndEventsVciShape(ticker, from, to, { fetchImpl = fetch } = {}) {
  try {
    const q = `code:${encodeURIComponent(ticker)}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING~effectiveDate:gte:${from}~effectiveDate:lte:${to}`;
    const json = await getJson(`${BASE}/events?q=${q}&sort=effectiveDate:desc&size=300`, fetchImpl);
    return { ok: true, events: vndEventsToVciShape(json.data ?? []) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// lib/cotuc/vci-events-adapter.ts
var IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";
function toDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function sortEventsByRelevance(events) {
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.exerciseDate !== null && e.exerciseDate >= todayStr).sort((a, b) => a.exerciseDate.localeCompare(b.exerciseDate));
  const past = events.filter((e) => e.exerciseDate !== null && e.exerciseDate < todayStr).sort((a, b) => b.exerciseDate.localeCompare(a.exerciseDate));
  const noDate = events.filter((e) => e.exerciseDate === null);
  return [...upcoming, ...past, ...noDate];
}
function toResult(ticker, rawEvents, source) {
  const events = rawEvents.map((e) => ({
    eventCode: e.eventCode ?? "",
    publicDate: toDateOnly(e.publicDate),
    exerciseDate: toDateOnly(e.exrightDate ?? e.issueDate ?? null),
    eventTitle: e.eventTitleVi ?? e.eventTitleEn ?? null,
    ratio: e.exerciseRatio !== void 0 && e.exerciseRatio !== null ? String(e.exerciseRatio) : null,
    settlementDate: toDateOnly(e.payoutDate ?? e.listingDate ?? null)
  }));
  return {
    ticker,
    available: true,
    source,
    exDividendEvents: sortEventsByRelevance(events.filter((e) => e.eventCode === "DIV")),
    agmEvents: sortEventsByRelevance(events.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode))),
    rawEvents
  };
}
async function fetchDividendEvents(ticker, monthsBack = 60, monthsForward = 6) {
  const now = /* @__PURE__ */ new Date();
  const fromD = new Date(now);
  fromD.setMonth(fromD.getMonth() - monthsBack);
  const toD = new Date(now);
  toD.setMonth(toD.getMonth() + monthsForward);
  const vnd = await fetchVndEventsVciShape(ticker, fromD.toISOString().slice(0, 10), toD.toISOString().slice(0, 10));
  if (vnd.ok) return toResult(ticker, vnd.events, "VNDIRECT");
  const vci = await fetchDividendEventsVci(ticker, monthsBack, monthsForward);
  return vci.available ? vci : { ...vci, error: `VNDirect: ${vnd.error}; ${vci.error ?? ""}` };
}
async function fetchDividendEventsVci(ticker, monthsBack, monthsForward) {
  try {
    const now = /* @__PURE__ */ new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - monthsBack);
    const to = new Date(now);
    to.setMonth(to.getMonth() + monthsForward);
    const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "");
    const toStr = to.toISOString().slice(0, 10).replace(/-/g, "");
    const url = `${IQ_BASE_URL}/v1/events?ticker=${ticker}&fromDate=${fromStr}&toDate=${toStr}&eventCode=DIV,ISS,AGME,AGMR,EGME&page=0&size=100`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store"
    });
    if (!res.ok) {
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: `VCI HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Kh\xF4ng r\xF5 nguy\xEAn nh\xE2n";
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: `VCI b\xE1o l\u1ED7i: ${String(reason).slice(0, 150)}` };
    }
    const rawEvents = json?.data?.content ?? (Array.isArray(json?.data) ? json.data : []);
    return toResult(ticker, rawEvents, "VCI");
  } catch (err) {
    return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// lib/cotuc/dividend-lifecycle.ts
function classifyIssEvent(eventTitleVi) {
  const t = eventTitleVi.toLowerCase();
  if (t.includes("c\u1ED5 t\u1EE9c b\u1EB1ng c\u1ED5 phi\u1EBFu")) return "STOCK_DIVIDEND";
  if (t.includes("cbcnv")) return "ESOP";
  if (t.includes("c\u1ED5 phi\u1EBFu th\u01B0\u1EDFng")) return "BONUS_ISSUE";
  return "BONUS_ISSUE";
}
function buildLifecycleEvents(ticker, rawEvents) {
  const agmEvents = rawEvents.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode));
  function findNearestAgmBefore(publicDate) {
    if (!publicDate) return null;
    const targetTime = new Date(publicDate).getTime();
    const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1e3;
    let best = null;
    for (const agm of agmEvents) {
      const agmDateStr = agm.issueDate ?? agm.exrightDate ?? null;
      if (!agmDateStr) continue;
      const agmTime = new Date(agmDateStr).getTime();
      const diff = targetTime - agmTime;
      if (diff >= 0 && diff <= SIX_MONTHS_MS) {
        if (!best || diff < best.diff) best = { date: agmDateStr, diff };
      }
    }
    return best?.date ?? null;
  }
  const divAndIssEvents = rawEvents.filter((e) => e.eventCode === "DIV" || e.eventCode === "ISS");
  return divAndIssEvents.map((e) => {
    const eventType = e.eventCode === "DIV" ? "CASH" : classifyIssEvent(e.eventTitleVi ?? "");
    const publicDate = e.publicDate ?? null;
    const settlementDate = e.payoutDate ?? e.listingDate ?? null;
    return {
      ticker,
      eventType,
      eventTitleVi: e.eventTitleVi ?? "",
      publicDate,
      agmDate: findNearestAgmBefore(publicDate),
      exrightDate: e.exrightDate ?? null,
      recordDate: e.recordDate ?? null,
      settlementDate,
      valuePerShare: eventType === "CASH" ? e.valuePerShare ?? null : null,
      exerciseRatio: eventType !== "CASH" ? e.exerciseRatio ?? null : null
    };
  });
}

// lib/cotuc/timing-v3/date-utils.ts
function toDayNumber(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t / 864e5;
}
function dayNumberToIso(dayNumber) {
  return new Date(dayNumber * 864e5).toISOString().slice(0, 10);
}
function makeTradingCalendarFromPrices(priceDates) {
  const set = /* @__PURE__ */ new Set();
  for (const d of priceDates) {
    const n = toDayNumber(d);
    if (n !== null) set.add(n);
  }
  return {
    isTradingDay(dayNumber) {
      return set.has(dayNumber);
    }
  };
}

// lib/cotuc/timing-v3/seasonality/beta-binomial.ts
var LANCZOS_G = 7;
var LANCZOS_COEFFICIENTS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9984369578019572e-21,
  15056327351493116e-23
];
function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const xx = x - 1;
  let a = LANCZOS_COEFFICIENTS[0];
  const t = xx + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_COEFFICIENTS[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}
function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}
var MAX_CF_ITER = 200;
var CF_EPS = 1e-14;
var TINY = 1e-300;
function betaContinuedFraction(x, a, b) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_CF_ITER; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < CF_EPS) break;
  }
  return h;
}
function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) throw new Error("regularizedIncompleteBeta: a v\xE0 b ph\u1EA3i d\u01B0\u01A1ng");
  const logFront = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b);
  const front = Math.exp(logFront);
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaContinuedFraction(x, a, b) / a;
  }
  return 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}
function invertRegularizedIncompleteBeta(p, a, b, tolerance = 1e-10) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < tolerance) return mid;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function betaBinomialPosterior(wins, losses, alpha0 = 1, beta0 = 1, level = 0.9) {
  if (wins < 0 || losses < 0) throw new Error("betaBinomialPosterior: wins/losses kh\xF4ng \u0111\u01B0\u1EE3c \xE2m");
  if (alpha0 <= 0 || beta0 <= 0) throw new Error("betaBinomialPosterior: alpha0/beta0 ph\u1EA3i d\u01B0\u01A1ng");
  const alpha = alpha0 + wins;
  const beta = beta0 + losses;
  const mean = alpha / (alpha + beta);
  const lo = invertRegularizedIncompleteBeta((1 - level) / 2, alpha, beta);
  const hi = invertRegularizedIncompleteBeta((1 + level) / 2, alpha, beta);
  return { alpha, beta, mean, ci: [lo, hi], level };
}
function estimatePriorFromRates(rates, priorStrength = 10) {
  const clean = rates.filter((r) => Number.isFinite(r) && r >= 0 && r <= 1);
  if (clean.length === 0) return { alpha0: 1, beta0: 1 };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (clean.length === 1) return { alpha0: mean * priorStrength, beta0: (1 - mean) * priorStrength };
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length - 1);
  const impliedStrength = variance > 1e-9 ? Math.max(0, mean * (1 - mean) / variance - 1) : priorStrength;
  const strength = Math.min(priorStrength, Math.max(2, impliedStrength));
  return { alpha0: Math.max(mean * strength, 1e-6), beta0: Math.max((1 - mean) * strength, 1e-6) };
}

// lib/cotuc/timing-v3/decision/build-decision.ts
function averageTradedValue(bars, n = 20) {
  const rows = bars.filter((b) => b.close > 0 && typeof b.volume === "number" && b.volume >= 0).slice(-n);
  if (rows.length < Math.min(n, 10)) return null;
  return rows.reduce((a, b) => a + b.close * b.volume, 0) / rows.length;
}

// lib/cotuc/price-adjustment.ts
var CASH_DIVIDEND_TAX_RATE = 0.05;

// lib/cotuc/timing-v3/total-return.ts
function buildTotalReturnSeries(nominal, cash, shares = [], taxRate = CASH_DIVIDEND_TAX_RATE) {
  const bars = [...nominal].filter((p) => p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const applied = [];
  const skipped = [];
  if (!bars.length) return { bars: [], applied, skipped };
  const first = bars[0].date, last = bars[bars.length - 1].date;
  const prevClose = (exDate) => {
    let p = null;
    for (const b of bars) {
      if (b.date < exDate) p = b.close;
      else break;
    }
    return p;
  };
  const factorAt = /* @__PURE__ */ new Map();
  const push = (exDate, f) => factorAt.set(exDate, (factorAt.get(exDate) ?? 1) * f);
  for (const c of cash) {
    if (!(c.valuePerShare > 0)) continue;
    if (c.exDate <= first || c.exDate > last) {
      skipped.push({ exDate: c.exDate, reason: "ngo\xE0i ph\u1EA1m vi gi\xE1" });
      continue;
    }
    const p = prevClose(c.exDate);
    if (!p) {
      skipped.push({ exDate: c.exDate, reason: "kh\xF4ng c\xF3 gi\xE1 phi\xEAn tr\u01B0\u1EDBc GDKHQ" });
      continue;
    }
    const y = c.valuePerShare * (1 - taxRate) / p;
    if (!(y > 0) || y >= 0.5) {
      skipped.push({ exDate: c.exDate, reason: `t\u1EF7 su\u1EA5t b\u1EA5t th\u01B0\u1EDDng ${(y * 100).toFixed(1)}%` });
      continue;
    }
    push(c.exDate, 1 - y);
    applied.push({ exDate: c.exDate, kind: "CASH", factor: 1 - y, detail: `${c.valuePerShare}\u0111/CP, sau thu\u1EBF ${(y * 100).toFixed(2)}% gi\xE1` });
  }
  for (const s of shares) {
    if (!(s.ratio > 0) || s.ratio >= 10) {
      skipped.push({ exDate: s.exDate, reason: `t\u1EF7 l\u1EC7 kh\xF4ng h\u1EE3p l\u1EC7 ${s.ratio}` });
      continue;
    }
    if (s.exDate <= first || s.exDate > last) {
      skipped.push({ exDate: s.exDate, reason: "ngo\xE0i ph\u1EA1m vi gi\xE1" });
      continue;
    }
    push(s.exDate, 1 / (1 + s.ratio));
    applied.push({ exDate: s.exDate, kind: "SHARES", factor: 1 / (1 + s.ratio), detail: `t\u1EF7 l\u1EC7 ${(s.ratio * 100).toFixed(1)}%` });
  }
  const out = new Array(bars.length);
  let k = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    out[i] = { date: bars[i].date, adjClose: bars[i].close * k };
    k *= factorAt.get(bars[i].date) ?? 1;
  }
  return { bars: out, applied: applied.sort((a, b) => a.exDate.localeCompare(b.exDate)), skipped };
}
function crossCheckWithReference(applied, refAdjustments, taxRate = CASH_DIVIDEND_TAX_RATE, until = "2024-12-31") {
  const refBy = new Map(refAdjustments.map((r) => [r.date, r.factor]));
  let matched = 0;
  const mismatched = [];
  const byDate = /* @__PURE__ */ new Map();
  for (const a of applied) {
    if (a.exDate > until) continue;
    const pre = a.kind === "CASH" ? 1 - (1 - a.factor) / (1 - taxRate) : a.factor;
    byDate.set(a.exDate, (byDate.get(a.exDate) ?? 1) * pre);
  }
  for (const [exDate, vci] of byDate) {
    const ref = refBy.get(exDate) ?? null;
    if (ref !== null && Math.abs(ref - vci) <= 4e-3) matched++;
    else mismatched.push({ exDate, vci: Math.round(vci * 1e4) / 1e4, ref });
  }
  return { matched, mismatched };
}

// lib/cotuc/timing-v3/price-source.ts
async function loadCorporateActions(ticker) {
  const vnd = await fetchVndCorporateActions(ticker);
  if (vnd.ok && (vnd.cash.length || vnd.shares.length)) {
    return { ok: true, source: "VNDIRECT", cash: vnd.cash.map(({ exDate, valuePerShare }) => ({ exDate, valuePerShare })), shares: vnd.shares.map(({ exDate, ratio }) => ({ exDate, ratio })) };
  }
  const ev = await fetchDividendEvents(ticker, 66, 0);
  if (!ev.available) return { ok: false, cash: [], shares: [], error: `VNDirect: ${vnd.error ?? "kh\xF4ng c\xF3 s\u1EF1 ki\u1EC7n"}; VCI: ${ev.error ?? "kh\xF4ng tr\u1EA3 s\u1EF1 ki\u1EC7n"}` };
  const life = buildLifecycleEvents(ticker, ev.rawEvents ?? []);
  const day = (s) => s ? s.slice(0, 10) : null;
  const cash = life.filter((e) => e.eventType === "CASH" && e.valuePerShare && day(e.exrightDate)).map((e) => ({ exDate: day(e.exrightDate), valuePerShare: e.valuePerShare }));
  const shares = life.filter((e) => (e.eventType === "STOCK_DIVIDEND" || e.eventType === "BONUS_ISSUE") && e.exerciseRatio && day(e.exrightDate)).map((e) => ({ exDate: day(e.exrightDate), ratio: e.exerciseRatio }));
  return { ok: true, source: "VCI", cash, shares };
}
async function loadStockPrices(ticker, years = 5) {
  const notes = [];
  const [ssi, ca] = await Promise.all([fetchSsiNominalHistory(ticker, years), loadCorporateActions(ticker)]);
  if (ssi.success && ssi.data && ssi.data.length >= 60 && ca.ok) {
    const tr = buildTotalReturnSeries(ssi.data, ca.cash, ca.shares);
    const cc = crossCheckWithReference(tr.applied, ssi.referenceAdjustments);
    notes.push(`Gi\xE1 SSI + ${tr.applied.length} s\u1EF1 ki\u1EC7n quy\u1EC1n ${ca.source} (c\u1ED5 t\u1EE9c ti\u1EC1n m\u1EB7t sau thu\u1EBF 5%)${tr.skipped.length ? `, b\u1ECF qua ${tr.skipped.length} \u0111\u1EE3t ngo\xE0i ph\u1EA1m vi/b\u1EA5t th\u01B0\u1EDDng` : ""}.`);
    if (cc.matched + cc.mismatched.length) {
      notes.push(`\u0110\u1ED1i chi\u1EBFu gi\xE1 tham chi\u1EBFu c\u1EE7a S\u1EDF (t\u1EDBi 2024): kh\u1EDBp ${cc.matched}${cc.mismatched.length ? `, l\u1EC7ch ${cc.mismatched.map((m) => `${m.exDate} (VCI ${m.vci} / S\u1EDF ${m.ref ?? "kh\xF4ng th\u1EA5y"})`).join("; ")}` : ""}.`);
    }
    return { ok: true, prices: tr.bars, source: "SSI_TOTAL_RETURN", notes, avgValue20: averageTradedValue(ssi.data), cashExDates: ca.cash.map((c) => c.exDate) };
  }
  notes.push(!ssi.success ? `SSI l\u1ED7i (${ssi.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}) \u2014 d\xF9ng d\u1EF1 ph\xF2ng Yahoo (c\u1ED5 t\u1EE9c tr\u1EEB TR\u01AF\u1EDAC thu\u1EBF).` : `Thi\u1EBFu s\u1EF1 ki\u1EC7n quy\u1EC1n (${ca.error}) \u2014 kh\xF4ng d\xF9ng gi\xE1 SSI ch\u01B0a \u0111i\u1EC1u ch\u1EC9nh; d\xF9ng d\u1EF1 ph\xF2ng Yahoo (c\u1ED5 t\u1EE9c tr\u1EEB TR\u01AF\u1EDAC thu\u1EBF).`);
  const y = await fetchOhlcvHistory(ticker, `${years}y`);
  if (y.success && y.data && y.data.length >= 60) {
    const avgValue20 = ssi.success && ssi.data ? averageTradedValue(ssi.data) : null;
    return { ok: true, prices: y.data.map((b) => ({ date: b.date, adjClose: b.adjClose })), source: "YAHOO_FALLBACK", notes, avgValue20, cashExDates: ca.ok ? ca.cash.map((c) => c.exDate) : [] };
  }
  return { ok: false, prices: [], source: null, notes, error: `SSI: ${ssi.error ?? "-"}; VCI: ${ca.error ?? "-"}; Yahoo: ${y.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}` };
}
async function loadBenchmarkPrices(years = 5) {
  const notes = [];
  const ssi = await fetchSsiNominalHistory("VNINDEX", years, { timeoutMs: 6e4 });
  if (ssi.success && ssi.data && ssi.data.length >= 60) {
    return { ok: true, prices: ssi.data.map((b) => ({ date: b.date, adjClose: b.close })), source: "SSI", notes };
  }
  notes.push(`SSI VN-Index l\u1ED7i (${ssi.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}) \u2014 d\xF9ng d\u1EF1 ph\xF2ng VNDirect.`);
  const v = await fetchIndexOhlcvHistory("VNINDEX", Math.round(years * 365));
  if (v.success && v.data && v.data.length >= 60) {
    return { ok: true, prices: v.data.map((b) => ({ date: b.date, adjClose: b.close })), source: "VNDIRECT_FALLBACK", notes };
  }
  return { ok: false, prices: [], source: null, notes, error: `SSI: ${ssi.error ?? "-"}; VNDirect: ${v.error ?? "thi\u1EBFu d\u1EEF li\u1EC7u"}` };
}

// lib/cotuc/timing-v3/compute-cycle-paths.ts
function indexByDate(prices) {
  const m = /* @__PURE__ */ new Map();
  for (const p of prices) m.set(p.date, p.adjClose);
  return m;
}
function addTradingDays(dateIso, n, cal) {
  const start = toDayNumber(dateIso);
  if (start === null) throw new Error(`ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7: ${dateIso}`);
  if (n === 0) return dateIso;
  const step = n > 0 ? 1 : -1;
  let d = start;
  let count = 0;
  const maxIterations = Math.abs(n) * 3 + 30;
  let safetyCounter = 0;
  while (count !== Math.abs(n)) {
    d += step;
    if (cal.isTradingDay(d)) count++;
    safetyCounter++;
    if (safetyCounter > maxIterations) {
      throw new Error(
        `addTradingDays: vuot qua ${maxIterations} lan lap khi dich ${n} ngay GD tu ${dateIso} - ngay dich co the nam ngoai pham vi du lieu gia da tai (qua gan bien du lieu lich su/tuong lai).`
      );
    }
  }
  return dayNumberToIso(d);
}
function marketAdjustedLogReturn(pCur, pPrev, bCur, bPrev) {
  if (pCur <= 0 || pPrev <= 0 || bCur <= 0 || bPrev <= 0) return null;
  return Math.log(pCur / pPrev) - Math.log(bCur / bPrev);
}
function buildOneCarPath(exDate, offsets, stockByDate, benchByDate, cal) {
  const priceAt = (date) => {
    const s = stockByDate.get(date);
    const b = benchByDate.get(date);
    if (s === void 0 || b === void 0) return null;
    return { s, b };
  };
  const baseDate = addTradingDays(exDate, offsets[0], cal);
  const base = priceAt(baseDate);
  const out = new Array(offsets.length).fill(null);
  if (!base) return out;
  out[0] = 0;
  let cum = 0;
  let prev = base;
  for (let i = 1; i < offsets.length; i++) {
    const date = addTradingDays(exDate, offsets[i], cal);
    const cur = priceAt(date);
    if (!cur) {
      out[i] = null;
      continue;
    }
    const r = marketAdjustedLogReturn(cur.s, prev.s, cur.b, prev.b);
    if (r === null) {
      out[i] = null;
      continue;
    }
    cum += r;
    out[i] = cum;
    prev = cur;
  }
  return out;
}
function computeCyclePaths(input) {
  const { ticker, stockPrices, benchmarkPrices, events, offsets, cal, currentExDate, version, asOf } = input;
  if (offsets.length < 2) throw new Error("offsets c\u1EA7n \xEDt nh\u1EA5t 2 ph\u1EA7n t\u1EED");
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] <= offsets[i - 1]) throw new Error("offsets ph\u1EA3i t\u0103ng ng\u1EB7t");
  }
  const stockByDate = indexByDate(stockPrices);
  const benchByDate = indexByDate(benchmarkPrices);
  const eventPaths = [];
  const skippedEvents = [];
  const seen = /* @__PURE__ */ new Set();
  for (const ev of events) {
    if (toDayNumber(ev.exDate) === null) {
      skippedEvents.push({ exDate: ev.exDate, reason: "exDate kh\xF4ng h\u1EE3p l\u1EC7" });
      continue;
    }
    if (seen.has(ev.exDate)) {
      skippedEvents.push({ exDate: ev.exDate, reason: "exDate tr\xF9ng v\u1EDBi m\u1ED9t \u0111\u1EE3t \u0111\xE3 c\xF3" });
      continue;
    }
    seen.add(ev.exDate);
    let car;
    try {
      car = buildOneCarPath(ev.exDate, offsets, stockByDate, benchByDate, cal);
    } catch (err) {
      skippedEvents.push({ exDate: ev.exDate, reason: `loi khi tinh CAR path: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    if (car[0] !== 0) {
      skippedEvents.push({ exDate: ev.exDate, reason: `thi\u1EBFu gi\xE1 t\u1EA1i offset ${offsets[0]} (\u0111i\u1EC3m rebase)` });
      continue;
    }
    eventPaths.push({ exDate: ev.exDate, car });
  }
  eventPaths.sort((a, b) => a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0);
  let currentPath = null;
  if (currentExDate && toDayNumber(currentExDate) !== null) {
    const path = buildOneCarPath(currentExDate, offsets, stockByDate, benchByDate, cal);
    currentPath = path[0] === 0 ? path : null;
  }
  return { ticker, version, asOf, offsets, eventPaths, currentPath, skippedEvents };
}
function toCyclePathsV3(out) {
  const { skippedEvents: _skipped, ...rest } = out;
  void _skipped;
  return rest;
}

// lib/cotuc/cafef-earnings-disclosure-scraper.ts
var CAFEF_BASE = "https://cafef.vn/du-lieu/tin-doanh-nghiep";
var QUARTERLY_TITLE_RE = /bao cao tai chinh quy\s*(\d)\s*\/?\s*(\d{4})/i;
function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function parseCafefDate(dd, mm, yyyy) {
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  if (!d || !m || !y) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
async function fetchEarningsDisclosureHistory(ticker) {
  try {
    const url = `${CAFEF_BASE}/${encodeURIComponent(ticker)}/event.chn`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store"
    });
    if (!res.ok) {
      return { ticker, success: false, records: [], error: `CafeF tra ve HTTP ${res.status}` };
    }
    const html = await res.text();
    const lineRe = /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/g;
    const records = [];
    let match;
    while ((match = lineRe.exec(html)) !== null) {
      const [, dd, mm, yyyy, rawTitle] = match;
      const title = stripDiacritics(rawTitle);
      const m2 = QUARTERLY_TITLE_RE.exec(stripDiacritics(rawTitle));
      if (!m2) continue;
      const quarter = Number(m2[1]);
      const year = Number(m2[2]);
      if (quarter < 1 || quarter > 4) continue;
      const announceDate = parseCafefDate(dd, mm, yyyy);
      if (!announceDate) continue;
      records.push({
        year,
        quarter,
        isParentOnly: title.includes("cong ty me"),
        announceDate
      });
    }
    if (records.length === 0) {
      return { ticker, success: false, records: [], error: "Khong tim thay dong 'bao cao tai chinh quy' nao tren trang CafeF" };
    }
    return { ticker, success: true, records };
  } catch (err) {
    return { ticker, success: false, records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// lib/cotuc/timing-v3/compute-cycle-stats.ts
var DEFAULT_COSTS = {
  buyCostPct: 2e-3,
  sellCostPct: 15e-4,
  sellTaxPct: 1e-3,
  dividendTaxPct: 0.05
};
var DEFAULT_GATING = {
  minEvents: 8,
  maxFdrQValue: 0.1,
  minOosMeanNetIfAvailable: 0,
  minYearsForOos: 3,
  confidenceLevel: 0.9
};
var DEFAULT_BOOTSTRAP = { iterations: 2e3, seed: 20260924 };
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function netReturnOfEvent(s, costs) {
  const gross = Math.exp(s.carAtExit - s.carAtEntry) - 1;
  const divNet = s.netDividendYield * (1 - costs.dividendTaxPct);
  const cost = costs.buyCostPct + costs.sellCostPct + costs.sellTaxPct;
  return gross + divNet - cost;
}
function shrinkMean(sampleMean, n, priorMean, withinVar, betweenVar) {
  if (n <= 0) return { shrunkMean: priorMean, weight: 0 };
  if (betweenVar <= 0) return { shrunkMean: priorMean, weight: 0 };
  const kappa = withinVar / betweenVar;
  const weight = n / (n + kappa);
  return { shrunkMean: weight * sampleMean + (1 - weight) * priorMean, weight };
}
function sampleVariance(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}
function bootstrapLowerBoundOf(values, estimator, confidenceLevel, cfg) {
  if (values.length === 0) return Number.NaN;
  if (values.length === 1) return estimator(values);
  const rand = mulberry32(cfg.seed);
  const n = values.length;
  const stats = new Array(cfg.iterations);
  const sample = new Array(n);
  for (let b = 0; b < cfg.iterations; b++) {
    for (let i = 0; i < n; i++) sample[i] = values[Math.floor(rand() * n)];
    stats[b] = estimator(sample);
  }
  stats.sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;
  return stats[Math.max(0, Math.min(stats.length - 1, Math.floor(alpha * stats.length)))];
}
function walkForward(samples, costs, minYears) {
  const years = Array.from(new Set(samples.map((s) => s.year))).sort((a, b) => a - b);
  if (years.length < minYears) return { oosHitRate: null, oosMeanNet: null, yearsUsed: years.length };
  const oosNets = [];
  for (let i = 1; i < years.length; i++) {
    const y = years[i];
    const oosThisYear = samples.filter((s) => s.year === y);
    for (const s of oosThisYear) oosNets.push(netReturnOfEvent(s, costs));
  }
  if (oosNets.length === 0) return { oosHitRate: null, oosMeanNet: null, yearsUsed: years.length };
  const hit = oosNets.filter((n) => n > 0).length / oosNets.length;
  const mean = oosNets.reduce((a, b) => a + b, 0) / oosNets.length;
  return { oosHitRate: hit, oosMeanNet: mean, yearsUsed: years.length };
}
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
function oneSidedPValue(mean, sd, n) {
  if (n === 0 || sd === 0) return mean > 0 ? 0 : 1;
  const z = mean / (sd / Math.sqrt(n));
  return 1 - normalCdf(z);
}
function benjaminiHochberg(pValues) {
  const m = pValues.length;
  if (m === 0) return [];
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  const q = new Array(m);
  let prevQ = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = indexed[rank - 1];
    const raw = p * m / rank;
    prevQ = Math.min(prevQ, Math.max(raw, 0));
    q[i] = prevQ;
  }
  return q;
}
function computeWindowStat(candidate, opts = {}) {
  const costs = opts.costs ?? DEFAULT_COSTS;
  const gating = opts.gating ?? DEFAULT_GATING;
  const bootstrap = opts.bootstrap ?? DEFAULT_BOOTSTRAP;
  const priorMean = opts.priorMean ?? 0;
  const liquidityOk = opts.liquidityOk ?? true;
  const nets = candidate.samples.map((s) => netReturnOfEvent(s, costs));
  const n = nets.length;
  const meanCarRaw = candidate.samples.length ? candidate.samples.reduce((a, s) => a + (s.carAtExit - s.carAtEntry), 0) / candidate.samples.length : 0;
  const withinVar = sampleVariance(nets);
  const betweenVar = opts.betweenVar ?? Math.max(withinVar / 8, 1e-6);
  const { shrunkMean: netExpectancy } = shrinkMean(
    n ? nets.reduce((a, b) => a + b, 0) / n : 0,
    n,
    priorMean,
    withinVar,
    betweenVar
  );
  const { shrunkMean: meanCarShrunk } = shrinkMean(
    meanCarRaw,
    n,
    priorMean,
    sampleVariance(candidate.samples.map((s) => s.carAtExit - s.carAtEntry)),
    betweenVar
  );
  const shrunkOf = (xs) => shrinkMean(xs.reduce((a, b) => a + b, 0) / xs.length, xs.length, priorMean, sampleVariance(xs), betweenVar).shrunkMean;
  const netExpectancyLcb = n > 0 ? bootstrapLowerBoundOf(nets, shrunkOf, gating.confidenceLevel, bootstrap) : Number.NaN;
  const wins = nets.filter((x) => x > 0).length;
  const winRate = n > 0 ? wins / n : 0;
  const sd = Math.sqrt(withinVar);
  const pValue = oneSidedPValue(n ? nets.reduce((a, b) => a + b, 0) / n : 0, sd, n);
  const wf = walkForward(candidate.samples, costs, gating.minYearsForOos);
  const nEff = n > 0 ? n * (withinVar > 0 ? Math.min(1, betweenVar / (betweenVar + withinVar / n)) : 1) : 0;
  const passesGates = n >= gating.minEvents && Number.isFinite(netExpectancyLcb) && netExpectancyLcb > 0 && liquidityOk && (wf.oosMeanNet === null || wf.oosMeanNet > gating.minOosMeanNetIfAvailable);
  const window = {
    id: candidate.id,
    label: candidate.label,
    entryFrom: candidate.entryFrom,
    entryTo: candidate.entryTo,
    exitOffset: candidate.exitOffset,
    holdsThroughEx: candidate.holdsThroughEx,
    nEvents: n,
    nEff,
    meanCarRaw,
    meanCarShrunk,
    netExpectancy,
    netExpectancyLcb: Number.isFinite(netExpectancyLcb) ? netExpectancyLcb : 0,
    winRate,
    wins,
    losses: n - wins,
    oosHitRate: wf.oosHitRate,
    oosMeanNet: wf.oosMeanNet,
    fdrQValue: pValue,
    // tạm thời; computeFdrAcrossWindows sẽ ghi đè bằng q thật
    selected: passesGates
    // tạm thời; sẽ AND thêm điều kiện FDR
  };
  return { window, pValue };
}
function computeFdrAcrossWindows(stats, gating = DEFAULT_GATING) {
  const qValues = benjaminiHochberg(stats.map((s) => s.pValue));
  return stats.map((s, i) => ({
    ...s.window,
    fdrQValue: qValues[i],
    selected: s.window.selected && qValues[i] <= gating.maxFdrQValue
  }));
}

// lib/cotuc/timing-v3/seasonality/compute-earnings-cycle-stats.ts
function computeIndustryQuarterPrior(samplesPerTicker, costs = DEFAULT_COSTS) {
  const means = [];
  const winRates = [];
  for (const samples of samplesPerTicker) {
    if (samples.length === 0) continue;
    const nets = samples.map((s) => netReturnOfEvent(s, costs));
    means.push(nets.reduce((a, b) => a + b, 0) / nets.length);
    winRates.push(nets.filter((x) => x > 0).length / nets.length);
  }
  if (means.length === 0) {
    return { priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nTickersUsed: 0 };
  }
  const priorMean = means.reduce((a, b) => a + b, 0) / means.length;
  const betweenVarRaw = means.length >= 2 ? sampleVariance(means) : Math.max(priorMean ** 2, 1e-4);
  const { alpha0, beta0 } = estimatePriorFromRates(winRates);
  return {
    priorMean,
    betweenVar: Math.max(betweenVarRaw, 1e-6),
    winRatePriorAlpha0: alpha0,
    winRatePriorBeta0: beta0,
    nTickersUsed: means.length
  };
}
function computeQuarterRaw(quarter, candidates, prior, opts, priorByWindow) {
  const costs = opts.costs ?? DEFAULT_COSTS;
  const computed = candidates.map((c) => {
    const pr = priorByWindow?.[c.id] ?? prior;
    return computeWindowStat(c, {
      costs,
      gating: opts.gating,
      bootstrap: opts.bootstrap,
      priorMean: pr.priorMean,
      betweenVar: pr.betweenVar
    });
  });
  const netsByWindowId = new Map(candidates.map((c) => [c.id, c.samples.map((s) => netReturnOfEvent(s, costs))]));
  return { quarter, computed, netsByWindowId, prior, priorByWindow };
}
function computeFullYearEarningsCycleStats(ticker, byQuarter, opts) {
  const gating = opts.gating ?? DEFAULT_GATING;
  const quarters = [1, 2, 3, 4];
  const perQuarter = quarters.map((q) => computeQuarterRaw(q, byQuarter[q].candidates, byQuarter[q].prior, opts, byQuarter[q].priorByWindow));
  const allComputed = perQuarter.flatMap((p) => p.computed);
  const allWindows = computeFdrAcrossWindows(allComputed, gating);
  const result = {};
  let cursor = 0;
  for (const p of perQuarter) {
    const windows = allWindows.slice(cursor, cursor + p.computed.length);
    cursor += p.computed.length;
    const eligible = windows.filter((w) => w.selected);
    const best = eligible.reduce(
      (acc, w) => acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc,
      null
    );
    let reactionProbability = null;
    if (best) {
      const nets = p.netsByWindowId.get(best.id) ?? [];
      const wins = nets.filter((x) => x > 0).length;
      const losses = nets.length - wins;
      const pr = p.priorByWindow?.[best.id] ?? p.prior;
      reactionProbability = betaBinomialPosterior(wins, losses, pr.winRatePriorAlpha0, pr.winRatePriorBeta0, gating.confidenceLevel);
    }
    result[p.quarter] = {
      ticker,
      version: opts.version,
      asOf: opts.asOf,
      eventType: "EARNINGS",
      quarter: p.quarter,
      windows,
      selectedWindowId: best?.id ?? null,
      adjustedPriceBasis: "ADJ_CLOSE",
      benchmark: opts.benchmark ?? "VNINDEX",
      reactionProbability
    };
  }
  return result;
}

// lib/cotuc/timing-v3/seasonality/announce-date-model.ts
var WEAK_ANNOUNCE_PRIOR = { mu0: 30, kappa0: 1, a0: 1.5, b0: 1.5 * 15 * 15 };
function announcePredictive(offsetsDays, prior = WEAK_ANNOUNCE_PRIOR) {
  const xs = offsetsDays.filter((v) => Number.isFinite(v));
  const n = xs.length;
  const kappaN = prior.kappa0 + n;
  const aN = prior.a0 + n / 2;
  if (n === 0) {
    const scale2 = Math.sqrt(prior.b0 * (prior.kappa0 + 1) / (prior.a0 * prior.kappa0));
    return { mu: prior.mu0, scale: scale2, dof: 2 * prior.a0, n: 0 };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const ss = xs.reduce((a, b) => a + (b - mean) ** 2, 0);
  const muN = (prior.kappa0 * prior.mu0 + n * mean) / kappaN;
  const bN = prior.b0 + 0.5 * ss + prior.kappa0 * n * (mean - prior.mu0) ** 2 / (2 * kappaN);
  const scale = Math.sqrt(bN * (kappaN + 1) / (aN * kappaN));
  return { mu: muN, scale, dof: 2 * aN, n };
}
function announceQuantile(m, p) {
  if (p <= 0 || p >= 1) throw new Error("announceQuantile: p ph\u1EA3i trong (0,1)");
  if (p === 0.5) return m.mu;
  const upper = p > 0.5;
  const tail = upper ? 1 - p : p;
  const x = invertRegularizedIncompleteBeta(2 * tail, m.dof / 2, 0.5);
  const absT = x <= 0 ? Infinity : Math.sqrt(m.dof * (1 - x) / x);
  return m.mu + (upper ? 1 : -1) * absT * m.scale;
}
function announceCredibleInterval(m, level = 0.9) {
  return [announceQuantile(m, (1 - level) / 2), announceQuantile(m, (1 + level) / 2)];
}

// lib/cotuc/timing-v3/seasonality/compute-annual-earnings-calendar.ts
var FISCAL_QUARTER_END = {
  1: { month: 3, day: 31 },
  2: { month: 6, day: 30 },
  3: { month: 9, day: 30 },
  4: { month: 12, day: 31 }
};
function parseIsoUtc(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}
function daysAfterFiscalQuarterEnd(announceIso, quarter) {
  const parsed = parseIsoUtc(announceIso);
  if (!parsed) return null;
  const { month, day } = FISCAL_QUARTER_END[quarter];
  const fiscalYear = quarter === 4 && parsed.m <= 3 ? parsed.y - 1 : parsed.y;
  const endTs = Date.UTC(fiscalYear, month - 1, day);
  const announceTs = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
  return (announceTs - endTs) / 864e5;
}
function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function typicalMonthFromOffset(quarter, medianOffsetDays) {
  const { month, day } = FISCAL_QUARTER_END[quarter];
  const REFERENCE_YEAR = 2001;
  const endTs = Date.UTC(REFERENCE_YEAR, month - 1, day);
  const resultTs = endTs + medianOffsetDays * 864e5;
  return new Date(resultTs).getUTCMonth() + 1;
}
function computeAnnualEarningsCalendar(input) {
  const minEvents = input.minEventsForConfirmed ?? 3;
  const quarters = [1, 2, 3, 4].map((quarter) => {
    const dates = input.historicalAnnounceDatesByQuarter[quarter] ?? [];
    const offsets = dates.map((d) => daysAfterFiscalQuarterEnd(d, quarter)).filter((v) => v !== null);
    const stats = input.earningsCycleStatsByQuarter[quarter];
    const reactionProbability = stats?.reactionProbability ?? null;
    const predictive = announcePredictive(offsets, input.announcePriorByQuarter?.[quarter]);
    const announceModel = {
      mu: predictive.mu,
      scale: predictive.scale,
      dof: predictive.dof,
      n: predictive.n,
      ci90: announceCredibleInterval(predictive, 0.9)
    };
    if (offsets.length === 0) {
      return {
        quarter,
        typicalAnnounceMonth: typicalMonthFromOffset(quarter, 30),
        // ước lượng thô: ~1 tháng sau kỳ báo cáo
        announceMonthStd: 0,
        reactionProbability,
        nEvents: 0,
        dataStatus: "ESTIMATED",
        announceModel
      };
    }
    const medianOffsetDays = median(offsets);
    const stdDays = offsets.length >= 2 ? Math.sqrt(sampleVariance(offsets)) : 0;
    return {
      quarter,
      typicalAnnounceMonth: typicalMonthFromOffset(quarter, medianOffsetDays),
      announceMonthStd: stdDays / 30.44,
      reactionProbability,
      nEvents: offsets.length,
      dataStatus: offsets.length >= minEvents ? "CONFIRMED" : "ESTIMATED",
      announceModel
    };
  });
  return { ticker: input.ticker, version: input.version, asOf: input.asOf, quarters };
}

// lib/cotuc/timing-v3/seasonality/earnings-windows.ts
var EARNINGS_CANDIDATE_WINDOWS = [
  { id: "e1", label: "E1 \xB7 Ch\u1EA1y tr\u01B0\u1EDBc c\xF4ng b\u1ED1", entryFrom: -15, entryTo: -10, exitOffset: -1, holdsThroughEx: false },
  { id: "e2", label: "E2 \xB7 N\u1EAFm qua c\xF4ng b\u1ED1", entryFrom: -5, entryTo: -2, exitOffset: 3, holdsThroughEx: true },
  { id: "e3", label: "E3 \xB7 Ng\u1EAFn sau c\xF4ng b\u1ED1", entryFrom: 1, entryTo: 2, exitOffset: 7, holdsThroughEx: false },
  { id: "e4", label: "E4 \xB7 Tr\xF4i gi\xE1 sau c\xF4ng b\u1ED1 (PEAD)", entryFrom: 1, entryTo: 3, exitOffset: 20, holdsThroughEx: false }
];
function buildEarningsOffsets() {
  const set = /* @__PURE__ */ new Set([0]);
  for (const w of EARNINGS_CANDIDATE_WINDOWS) {
    set.add(w.entryFrom);
    set.add(w.entryTo);
    set.add(w.exitOffset);
  }
  return [...set].sort((a, b) => a - b);
}

// lib/cotuc/timing-v3/seasonality/seasonality-io.ts
var SEASONALITY_VERSION = "v3-seasonality-1";
var QUARTERS = [1, 2, 3, 4];
var MIN_PEERS_FOR_INDUSTRY_PRIOR = 3;
function pickAnnounceDates(records) {
  const best = /* @__PURE__ */ new Map();
  for (const r of records) {
    if (!(r.quarter >= 1 && r.quarter <= 4) || !/^\d{4}-\d{2}-\d{2}$/.test(r.announceDate)) continue;
    const key = `${r.year}-${r.quarter}`;
    const cur = best.get(key);
    if (!cur || cur.isParentOnly && !r.isParentOnly) best.set(key, r);
  }
  const out = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of best.values()) out[String(r.quarter)].push(r.announceDate);
  for (const q of Object.keys(out)) out[q] = [...new Set(out[q])].sort();
  return out;
}
function buildSeasonalitySamples(ticker, stock, bench, announce, asOf) {
  const offsets = buildEarningsOffsets();
  const offsetIndex = new Map(offsets.map((o, i) => [o, i]));
  const stockDates = new Set(stock.map((p) => p.date));
  const cal = makeTradingCalendarFromPrices(bench.map((p) => p.date).filter((d) => stockDates.has(d)));
  const samples = {};
  const paths = {};
  let skipped = 0;
  const sessions = bench.map((p) => p.date).filter((d) => stockDates.has(d)).sort();
  const toSession = (d) => {
    let lo = 0, hi = sessions.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (sessions[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return sessions[lo] ?? null;
  };
  for (const q of QUARTERS) {
    const dates = [...new Set((announce[String(q)] ?? []).map(toSession).filter((d) => d !== null))];
    samples[String(q)] = Object.fromEntries(EARNINGS_CANDIDATE_WINDOWS.map((w) => [w.id, []]));
    if (!dates.length) continue;
    const out = computeCyclePaths({
      ticker,
      stockPrices: stock,
      benchmarkPrices: bench,
      events: dates.map((exDate) => ({ exDate })),
      offsets,
      cal,
      currentExDate: null,
      version: SEASONALITY_VERSION,
      asOf
    });
    skipped += out.skippedEvents.length;
    paths[String(q)] = toCyclePathsV3(out);
    for (const w of EARNINGS_CANDIDATE_WINDOWS) {
      const ei = offsetIndex.get(w.entryTo), xi = offsetIndex.get(w.exitOffset);
      for (const ep of out.eventPaths) {
        const a = ep.car[ei], b = ep.car[xi];
        if (a === null || b === null) continue;
        samples[String(q)][w.id].push({ exDate: ep.exDate, carAtEntry: a, carAtExit: b, netDividendYield: 0, year: Number(ep.exDate.slice(0, 4)) });
      }
    }
  }
  return { samples, paths, skipped };
}
async function fetchAnnounceDates(ticker) {
  const vnd = await fetchVndQuarterlyFinancials(ticker);
  const fromVnd = vnd.quarters.filter((q) => q.announceDate).map((q) => ({ year: q.year, quarter: q.quarter, isParentOnly: false, announceDate: q.announceDate }));
  if (vnd.available && fromVnd.length) return { ok: true, announce: pickAnnounceDates(fromVnd), source: "VNDIRECT" };
  const r = await fetchEarningsDisclosureHistory(ticker);
  if (!r.success) return { ok: false, announce: { 1: [], 2: [], 3: [], 4: [] }, error: `VNDirect: ${vnd.error ?? "kh\xF4ng c\xF3 ng\xE0y"}; CafeF: ${r.error ?? "l\u1ED7i"}` };
  return { ok: true, announce: pickAnnounceDates(r.records), source: "CAFEF" };
}
function buildPriors(target, all) {
  const others = all.filter((c) => c.ticker !== target.ticker);
  const sameSector = target.sector ? others.filter((c) => c.sector === target.sector) : [];
  const out = {};
  for (const q of QUARTERS) {
    const withData = (list) => list.filter((c) => EARNINGS_CANDIDATE_WINDOWS.some((w) => (c.samples[String(q)]?.[w.id] ?? []).length > 0));
    const industry = withData(sameSector);
    const peers = industry.length >= MIN_PEERS_FOR_INDUSTRY_PRIOR ? industry : withData(others);
    const scope = industry.length >= MIN_PEERS_FOR_INDUSTRY_PRIOR ? "INDUSTRY" : peers.length ? "UNIVERSE" : "NONE";
    const priorByWindow = Object.fromEntries(EARNINGS_CANDIDATE_WINDOWS.map((w) => [w.id, computeIndustryQuarterPrior(peers.map((c) => c.samples[String(q)]?.[w.id] ?? []))]));
    out[q] = { prior: priorByWindow[EARNINGS_CANDIDATE_WINDOWS[0].id], priorByWindow, scope };
  }
  return out;
}
function finalizeTicker(target, all, asOf) {
  const priors = buildPriors(target, all);
  const byQuarter = {};
  for (const q of QUARTERS) {
    byQuarter[q] = {
      candidates: EARNINGS_CANDIDATE_WINDOWS.map((w) => ({ ...w, samples: target.samples[String(q)]?.[w.id] ?? [] })),
      prior: priors[q].prior,
      priorByWindow: priors[q].priorByWindow
    };
  }
  const stats = computeFullYearEarningsCycleStats(target.ticker, byQuarter, { version: SEASONALITY_VERSION, asOf, benchmark: "VNINDEX" });
  const historical = Object.fromEntries(QUARTERS.map((q) => [q, target.announce[String(q)] ?? []]));
  const calendar = computeAnnualEarningsCalendar({
    ticker: target.ticker,
    version: SEASONALITY_VERSION,
    asOf,
    historicalAnnounceDatesByQuarter: historical,
    earningsCycleStatsByQuarter: stats
  });
  return { stats, calendar, priorScope: Object.fromEntries(QUARTERS.map((q) => [q, priors[q].scope])) };
}
export {
  QUARTERS,
  SEASONALITY_VERSION,
  buildSeasonalitySamples,
  fetchAnnounceDates,
  finalizeTicker,
  loadBenchmarkPrices,
  loadStockPrices
};
