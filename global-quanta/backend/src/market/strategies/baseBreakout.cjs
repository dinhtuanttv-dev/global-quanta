/*!
 * Base-Breakout Screener + Backtester
 * Upgrade of Tim_CP_mua__chuan_.afl  (tight base + momentum + money flow)
 *
 * - Pure JavaScript, zero dependencies. Browser: window.BaseBreakout. Node: require().
 * - Input bars: [{date, open, high, low, close, volume}], OLDEST FIRST.
 * - Signal is evaluated on the CLOSE of bar t using data <= t only (no look-ahead).
 *   Backtest enters at the OPEN of bar t+1.
 * - Presets: 'standard' (upgraded) and 'original' (rules of the old AFL, Buy AND Filter combined).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BaseBreakout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 0 / false disables the corresponding rule unless stated otherwise.
  const DEFAULTS = {
    minBars: 260,
    // ---- universe / liquidity
    minPrice: 1, maxPrice: 7,            // maxPrice 0 = no cap
    minAvgVol: 15000,                    // SMA(volume,20)
    minAvgValue: 100000,                 // SMA(close*volume,20)
    minVol0: 0, minVol1: 0, minVol2: 0,  // day-level volume floors (today, -1, -2)
    minValue0: 0,                        // today's close*volume floor
    // ---- trend
    fastMA: 15,                          // close > SMA(fastMA)
    useTrend: true, trendMA: 50, trendRise: 10,   // close > SMA50 and SMA50 rising vs 10 bars ago
    // ---- momentum
    macdFast: 7, macdSlow: 15, macdSig: 3,
    macdMode: 'cross',                   // 'cross' (cross up within crossWithin bars) | 'state' (MACD >= signal)
    crossWithin: 3,
    mfiPeriod: 14, mfiLookback: 1, mfiMin: 50,
    // ---- context
    rangeBars: 250, rangeMinPct: 50,     // (HH-LL)/LL*100 >= 50 over rangeBars
    posMin: 0.4,                         // close must sit in the upper 60% of that range
    noDeclineBars: 1,                    // close >= close of each of the previous N bars
    // ---- base + breakout
    baseBars: 10, baseMaxPct: 0.08,      // highest close <= (1+8%) * lowest close, bars t-10..t-1
    breakout: true,                      // close must exceed the base's highest close
    maxExtend: 0.06,                     // ...but not more than 6% above it (0 = off)
    dayGainMin: 0, dayGainMax: 0.06,     // today's % change window (dayGainMax 0 = off)
    volSurge: 1.5, volSurgeBars: 20,     // volume >= 1.5 x mean of previous 20 bars
    closePosMin: 0.5,                    // close in upper half of today's range
    // ---- risk plan
    atrPeriod: 14, atrStop: 2.5, stopBuffer: 0.01,
    maxRiskPct: 0.12,                    // skip if (entry-stop)/entry exceeds this (0 = off)
    rr: 2,                               // target = entry + rr * risk
    // ---- backtest
    trailMA: 15, trailMinHold: 3,        // exit when close < SMA(trailMA) after trailMinHold bars (0 = off)
    maxHold: 30,
    feePct: 0.0015, slipPct: 0.001,      // per side
    maxGapPct: 0.05,                     // skip entry if next open gaps > 5% above signal close
    riskPerTrade: 0.01, maxPosPct: 0.25, // position size = min(risk/stopDistance, maxPos) of equity
    oosRatio: 0.3                        // last 30% of each symbol's bars = out-of-sample
  };

  const PRESETS = {
    standard: {},
    original: {  // the old AFL, with Buy AND Filter combined (the intended reading)
      minBars: 40, minAvgVol: 0, minAvgValue: 0, minVol0: 10000, minVol1: 15000, minVol2: 10000, minValue0: 100000,
      useTrend: false, macdMode: 'state', mfiMin: 0, rangeBars: 360, rangeMinPct: 50, posMin: 0, noDeclineBars: 2,
      baseBars: 5, baseMaxPct: 0.05, breakout: false, maxExtend: 0, dayGainMin: 0, dayGainMax: 0,
      volSurge: 0, closePosMin: 0, maxRiskPct: 0
    }
  };
  Object.freeze(DEFAULTS);
  Object.keys(PRESETS).forEach(function (key) { Object.freeze(PRESETS[key]); });
  Object.freeze(PRESETS);

  const OPTION_KEYS = Object.keys(DEFAULTS).concat(['preset']);
  const INTEGER_OPTIONS = [
    'minBars', 'fastMA', 'trendMA', 'trendRise', 'macdFast', 'macdSlow',
    'macdSig', 'crossWithin', 'mfiPeriod', 'mfiLookback', 'rangeBars',
    'noDeclineBars', 'baseBars', 'volSurgeBars', 'atrPeriod', 'trailMA',
    'trailMinHold', 'maxHold'
  ];

  function resolve(options) {
    if (options == null) options = {};
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Options must be an object.');
    }
    const unknown = Object.keys(options).filter(function (key) {
      return OPTION_KEYS.indexOf(key) < 0;
    });
    if (unknown.length) throw new TypeError('Unknown option(s): ' + unknown.join(', '));
    if (options.preset != null && !Object.prototype.hasOwnProperty.call(PRESETS, options.preset)) {
      throw new RangeError('Unknown preset "' + options.preset + '".');
    }

    const o = Object.assign({}, DEFAULTS);
    if (options.preset) Object.assign(o, PRESETS[options.preset]);
    Object.keys(options).forEach(function (key) {
      if (key !== 'preset') o[key] = options[key];
    });
    INTEGER_OPTIONS.forEach(function (key) {
      if (!Number.isInteger(o[key])) throw new TypeError('Option "' + key + '" must be an integer.');
    });
    Object.keys(o).forEach(function (key) {
      if (key === 'useTrend' || key === 'breakout') {
        if (typeof o[key] !== 'boolean') throw new TypeError('Option "' + key + '" must be a boolean.');
      } else if (key === 'macdMode') {
        if (o[key] !== 'cross' && o[key] !== 'state') {
          throw new RangeError('Option "macdMode" must be "cross" or "state".');
        }
      } else if (key !== 'preset' && typeof o[key] !== 'number') {
        throw new TypeError('Option "' + key + '" must be numeric.');
      } else if (typeof o[key] === 'number' && !Number.isFinite(o[key])) {
        throw new TypeError('Option "' + key + '" must be finite.');
      }
    });
    [
      ['minBars', 1], ['fastMA', 0], ['trendMA', 1], ['trendRise', 0],
      ['macdFast', 1], ['macdSlow', 1], ['macdSig', 1], ['crossWithin', 1],
      ['mfiPeriod', 1], ['mfiLookback', 1], ['rangeBars', 1],
      ['rangeMinPct', 0], ['posMin', 0], ['noDeclineBars', 0],
      ['baseBars', 1], ['baseMaxPct', 0], ['maxExtend', 0],
      ['dayGainMax', 0], ['volSurge', 0], ['volSurgeBars', 1],
      ['closePosMin', 0], ['atrPeriod', 1], ['atrStop', 0], ['stopBuffer', 0],
      ['maxRiskPct', 0], ['rr', 0], ['trailMA', 0], ['trailMinHold', 0],
      ['maxHold', 1], ['feePct', 0], ['slipPct', 0], ['maxGapPct', 0],
      ['riskPerTrade', 0], ['maxPosPct', 0], ['oosRatio', 0],
      ['minPrice', 0], ['maxPrice', 0], ['minAvgVol', 0], ['minAvgValue', 0],
      ['minVol0', 0], ['minVol1', 0], ['minVol2', 0], ['minValue0', 0],
      ['mfiMin', 0]
    ].forEach(function (item) {
      if (o[item[0]] < item[1]) throw new RangeError('Option "' + item[0] + '" must be at least ' + item[1] + '.');
    });
    if (o.macdFast >= o.macdSlow) throw new RangeError('macdFast must be less than macdSlow.');
    if (o.posMin > 1 || o.closePosMin > 1 || o.oosRatio >= 1 ||
        o.feePct > 1 || o.slipPct > 1 || o.stopBuffer > 1 ||
        o.maxRiskPct > 1 || o.maxGapPct > 1 || o.riskPerTrade > 1 ||
        o.maxPosPct > 1 || o.mfiMin > 100) {
      throw new RangeError('A fractional option or mfiMin is outside its supported range.');
    }
    if (o.maxPrice > 0 && o.maxPrice < o.minPrice) {
      throw new RangeError('maxPrice must be zero (uncapped) or greater than or equal to minPrice.');
    }
    if (o.useTrend && o.trendRise < 1) {
      throw new RangeError('trendRise must be at least 1 when useTrend is enabled.');
    }
    return o;
  }

  function dateMillis(value) {
    if (value == null) return null;
    const text = String(value).trim();
    const isoDate = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[Tt ].*)?$/.test(text);
    const usDate = /^\d{1,2}\/\d{1,2}\/\d{4}(?:\s.*)?$/.test(text);
    const compactDate = /^\d{8}$/.test(text);
    if (!isoDate && !usDate && !compactDate) return null;
    const normalized = compactDate
      ? text.slice(0, 4) + '-' + text.slice(4, 6) + '-' + text.slice(6, 8)
      : text;
    const time = Date.parse(normalized);
    return Number.isFinite(time) ? time : null;
  }

  // ---------------------------------------------------------------- indicators
  function smaArr(a, n) {
    const out = new Float64Array(a.length).fill(NaN); let s = 0;
    for (let i = 0; i < a.length; i++) {
      s += a[i]; if (i >= n) s -= a[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }
  // AmiBroker-style EMA: seeded with the first value, alpha = 2/(n+1)
  function emaArr(a, n) {
    const out = new Float64Array(a.length), k = 2 / (n + 1);
    if (!a.length) return out;
    out[0] = a[0];
    for (let i = 1; i < a.length; i++) out[i] = out[i - 1] + k * (a[i] - out[i - 1]);
    return out;
  }
  function mfiArr(S, n) {
    const N = S.n, out = new Float64Array(N).fill(NaN), pos = new Float64Array(N), neg = new Float64Array(N);
    let prevTp = NaN;
    for (let i = 0; i < N; i++) {
      const tp = (S.H[i] + S.L[i] + S.C[i]) / 3, flow = tp * S.V[i];
      if (i > 0) { if (tp > prevTp) pos[i] = flow; else if (tp < prevTp) neg[i] = flow; }
      prevTp = tp;
    }
    let ps = 0, ns = 0;
    for (let i = 1; i < N; i++) {
      ps += pos[i]; ns += neg[i];
      if (i > n) { ps -= pos[i - n]; ns -= neg[i - n]; }
      if (i >= n) out[i] = ns === 0 ? (ps === 0 ? 50 : 100) : 100 - 100 / (1 + ps / ns);
    }
    return out;
  }
  function atrArr(S, n) {
    const out = new Float64Array(S.n); let prev = 0;
    for (let i = 0; i < S.n; i++) {
      const tr = i === 0 ? S.H[0] - S.L[0] : Math.max(S.H[i] - S.L[i], Math.abs(S.H[i] - S.C[i - 1]), Math.abs(S.L[i] - S.C[i - 1]));
      prev = i < n ? (prev * i + tr) / (i + 1) : (prev * (n - 1) + tr) / n;
      out[i] = prev;
    }
    return out;
  }

  /** Pre-compute every series once (shared by scan, backtest and charts). */
  function prepare(bars, options) {
    const o = resolve(options);
    if (!Array.isArray(bars)) throw new TypeError('Bars must be an array.');
    const n = bars.length;
    const S = { n: n, date: new Array(n), O: new Float64Array(n), H: new Float64Array(n), L: new Float64Array(n),
                C: new Float64Array(n), V: new Float64Array(n), CV: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      if (!b || typeof b !== 'object' || Array.isArray(b)) {
        throw new TypeError('Bar at index ' + i + ' must be an object.');
      }
      const fields = ['open', 'high', 'low', 'close', 'volume'];
      fields.forEach(function (field) {
        if (b[field] == null || (typeof b[field] === 'string' && !b[field].trim()) ||
            typeof b[field] === 'boolean' || !Number.isFinite(Number(b[field]))) {
          throw new TypeError('Bar at index ' + i + ' has invalid ' + field + '.');
        }
      });
      const oPrice = Number(b.open), h = Number(b.high), l = Number(b.low);
      const c = Number(b.close), v = Number(b.volume);
      if (oPrice <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0) {
        throw new RangeError('Bar at index ' + i + ' must have positive OHLC prices and non-negative volume.');
      }
      if (h < Math.max(oPrice, c, l) || l > Math.min(oPrice, c, h)) {
        throw new RangeError('Bar at index ' + i + ' has inconsistent high/low values.');
      }
      S.date[i] = b.date == null ? String(i) : String(b.date);
      S.O[i] = oPrice; S.H[i] = h; S.L[i] = l; S.C[i] = c; S.V[i] = v;
      S.CV[i] = c * v;
      if (!Number.isFinite(S.CV[i])) throw new RangeError('Dollar volume overflow at bar ' + i + '.');
      if (i > 0 && b.date != null && bars[i - 1].date != null) {
        const prior = dateMillis(bars[i - 1].date);
        const current = dateMillis(b.date);
        if (prior != null && current != null && current <= prior) {
          throw new RangeError('Bars must be ordered oldest-first with strictly increasing dates (index ' + i + ').');
        }
      }
    }
    S.maFast = o.fastMA > 0 ? smaArr(S.C, o.fastMA) : null;
    S.maTrend = o.useTrend ? smaArr(S.C, o.trendMA) : null;
    S.maTrail = o.trailMA > 0 ? smaArr(S.C, o.trailMA) : null;
    S.avgVol = smaArr(S.V, 20); S.avgVal = smaArr(S.CV, 20);
    const e1 = emaArr(S.C, o.macdFast), e2 = emaArr(S.C, o.macdSlow);
    S.macd = new Float64Array(n); for (let i = 0; i < n; i++) S.macd[i] = e1[i] - e2[i];
    S.sig = emaArr(S.macd, o.macdSig);
    S.mfi = mfiArr(S, o.mfiPeriod);
    S.atr = atrArr(S, o.atrPeriod);
    return S;
  }

  const at = function (a, i) { return i >= 0 && i < a.length ? a[i] : NaN; };

  // ---------------------------------------------------------------- signal
  function evaluateAt(S, t, options) {
    return evaluateAtResolved(S, t, resolve(options));
  }

  function evaluateAtResolved(S, t, o) {
    if (!S || !Number.isInteger(S.n) || !S.C || !S.H || !S.L || !S.V ||
        S.C.length !== S.n || S.H.length !== S.n || S.L.length !== S.n || S.V.length !== S.n) {
      throw new TypeError('Prepared series is invalid; call prepare(bars) first.');
    }
    if (!Number.isInteger(t) || t < 0 || t >= S.n) {
      throw new RangeError('Bar index is outside the prepared series.');
    }
    const C = S.C, H = S.H, L = S.L, V = S.V;
    if (t < o.minBars - 1 || t < 2) return { ok: false, reason: 'not enough bars' };
    const c = C[t], rate = c / C[t - 1] - 1;

    // base window t-baseBars .. t-1
    let HP = -Infinity, LP = Infinity, baseLow = Infinity;
    for (let i = Math.max(0, t - o.baseBars); i <= t - 1; i++) {
      if (C[i] > HP) HP = C[i]; if (C[i] < LP) LP = C[i]; if (L[i] < baseLow) baseLow = L[i];
    }
    // context range (clamped to available history, like the AFL)
    let hh = -Infinity, ll = Infinity;
    for (let i = Math.max(0, t - o.rangeBars + 1); i <= t; i++) { if (H[i] > hh) hh = H[i]; if (L[i] < ll) ll = L[i]; }
    const rangePct = (hh - ll) / ll * 100, posInRange = hh > ll ? (c - ll) / (hh - ll) : 0;

    // volume
    let vs = 0, cnt = 0;
    for (let i = Math.max(0, t - o.volSurgeBars); i <= t - 1; i++) { vs += V[i]; cnt++; }
    const volRatio = cnt && vs > 0 ? V[t] / (vs / cnt) : NaN;
    const dayRange = H[t] - L[t], closePos = dayRange > 0 ? (c - L[t]) / dayRange : NaN;

    // risk plan (reference entry = signal close)
    const stopBase = baseLow * (1 - o.stopBuffer), stopAtr = c - o.atrStop * S.atr[t];
    const stop = Math.max(stopBase, stopAtr), riskPct = (c - stop) / c, target = c + o.rr * (c - stop);
    const ext = c / HP - 1;

    // MACD
    const macdNow = S.macd[t] >= S.sig[t];
    let macdOK = macdNow;
    if (o.macdMode === 'cross') {
      macdOK = false;
      if (macdNow) for (let k = 0; k < o.crossWithin; k++) {
        const i = t - k; if (i < 1) break;
        if (S.macd[i] >= S.sig[i] && S.macd[i - 1] < S.sig[i - 1]) { macdOK = true; break; }
      }
    }
    let noDecl = true; for (let k = 1; k <= o.noDeclineBars; k++) if (!(c >= C[t - k])) noDecl = false;
    const mfi = S.mfi[t], mfiPrev = at(S.mfi, t - o.mfiLookback);

    const checks = {
      price: c >= o.minPrice && (o.maxPrice <= 0 || c <= o.maxPrice),
      liquidity: (!o.minAvgVol || S.avgVol[t] >= o.minAvgVol) && (!o.minAvgValue || S.avgVal[t] >= o.minAvgValue) &&
                 (!o.minVol0 || V[t] > o.minVol0) && (!o.minVol1 || V[t - 1] > o.minVol1) &&
                 (!o.minVol2 || V[t - 2] > o.minVol2) && (!o.minValue0 || S.CV[t] > o.minValue0),
      trend: !o.useTrend || (c > S.maTrend[t] && S.maTrend[t] > at(S.maTrend, t - o.trendRise)),
      aboveFastMA: !o.fastMA || c > S.maFast[t],
      macd: macdOK,
      moneyFlow: mfi >= mfiPrev && mfi >= o.mfiMin,
      context: rangePct >= o.rangeMinPct && posInRange >= o.posMin,
      tightBase: HP <= (1 + o.baseMaxPct) * LP,
      noDecline: noDecl,
      breakout: !o.breakout || c > HP,
      notExtended: !o.maxExtend || ext <= o.maxExtend,
      dayGain: rate >= o.dayGainMin && (!o.dayGainMax || rate <= o.dayGainMax),
      volumeSurge: !o.volSurge || volRatio >= o.volSurge,
      closeStrength: !o.closePosMin || closePos >= o.closePosMin,
      riskOK: stop < c && (!o.maxRiskPct || riskPct <= o.maxRiskPct)
    };
    let failed = [];
    for (const k in checks) if (!checks[k]) failed.push(k);

    const score = Math.log(Math.max(isFinite(volRatio) ? volRatio : 0.1, 0.1)) + (isFinite(mfi) ? (mfi - 50) / 50 : 0) +
                  (isFinite(closePos) ? closePos : 0) - 4 * riskPct - 3 * Math.max(ext, 0);
    return {
      ok: failed.length === 0, failed: failed, checks: checks,
      metrics: { close: c, rate: rate * 100, basePivot: HP, baseLow: baseLow, baseRangePct: (HP / LP - 1) * 100, rangePct: rangePct,
                 posInRange: posInRange, macd: S.macd[t], macdSignal: S.sig[t], mfi: mfi, volRatio: volRatio, closePos: closePos,
                 extendPct: ext * 100, avgVol20: S.avgVol[t], avgValue20: S.avgVal[t], atr: S.atr[t], score: score,
                 plan: { entry: c, stop: stop, target: target, riskPct: riskPct * 100, rr: o.rr }, index: t }
    };
  }

  function scanSymbol(bars, options) {
    const o = resolve(options);
    const S = prepare(bars, o);
    if (S.n < o.minBars) return { ok: false, reason: 'not enough bars', failed: [] };
    const r = evaluateAtResolved(S, S.n - 1, o);
    r.date = S.date[S.n - 1];
    return r;
  }

  /** Scan many symbols. maxFailed=0 -> only full signals; 1 -> include near-misses (1 rule failed). */
  function scanUniverse(universe, options, maxFailed, onError) {
    if (!universe || typeof universe !== 'object' || Array.isArray(universe)) {
      throw new TypeError('Universe must be an object mapping symbols to bar arrays.');
    }
    const mf = maxFailed == null ? 0 : maxFailed, out = [];
    const resolvedOptions = resolve(options);
    if (!Number.isInteger(mf) || mf < 0) throw new RangeError('maxFailed must be a non-negative integer.');
    if (onError != null && typeof onError !== 'function') throw new TypeError('onError must be a function.');
    for (const sym of Object.keys(universe)) {
      let r;
      try {
        r = scanSymbol(universe[sym], resolvedOptions);
      } catch (e) {
        const wrapped = new Error('Unable to scan "' + sym + '": ' + (e && e.message ? e.message : String(e)));
        if (onError) onError(wrapped, sym);
        else throw wrapped;
        continue;
      }
      if (r.metrics && r.failed.length <= mf) out.push(Object.assign({ symbol: sym }, r));
    }
    out.sort(function (a, b) { return a.failed.length - b.failed.length || b.metrics.score - a.metrics.score; });
    return out;
  }

  // ---------------------------------------------------------------- backtest
  function backtest(bars, options) {
    const o = resolve(options);
    const S = prepare(bars, o), n = S.n, trades = [];
    if (!n) throw new RangeError('Cannot backtest an empty bar series.');
    const cutIdx = Math.floor(n * (1 - o.oosRatio));
    let t = Math.max(o.minBars - 1, 2);
    while (t < n - 1) {
      const sig = evaluateAtResolved(S, t, o);
      if (!sig.ok) { t++; continue; }
      const open = S.O[t + 1], plan = sig.metrics.plan;
      if (!(open > plan.stop) ||
          (o.maxGapPct > 0 && Math.abs(open / S.C[t] - 1) > o.maxGapPct)) { t++; continue; }
      const entry = open * (1 + o.slipPct), stop = plan.stop;
      const riskPct = (entry - stop) / entry, target = entry + o.rr * (entry - stop);
      if (o.maxRiskPct && riskPct > o.maxRiskPct) { t++; continue; }
      // walk forward
      let exitIdx = -1, exitPx = NaN, reason = '', j = t + 1;
      for (; j < n; j++) {
        if (S.L[j] <= stop) { exitIdx = j; exitPx = Math.min(S.O[j], stop); reason = 'STOP'; break; }      // stop first when both hit
        if (S.H[j] >= target) { exitIdx = j; exitPx = Math.max(S.O[j], target); reason = 'TARGET'; break; }
        const held = j - (t + 1);
        const trail = o.trailMA > 0 && held >= o.trailMinHold && S.C[j] < S.maTrail[j];
        const time = held + 1 >= o.maxHold;
        if (trail || time) {
          if (j + 1 < n) { exitIdx = j + 1; exitPx = S.O[j + 1]; } else { exitIdx = j; exitPx = S.C[j]; }
          reason = trail ? 'TRAIL' : 'TIME'; break;
        }
      }
      let open_ = false;
      if (exitIdx < 0) { exitIdx = n - 1; exitPx = S.C[n - 1]; reason = 'OPEN'; open_ = true; }
      const fill = exitPx * (1 - o.slipPct), gross = fill / entry - 1, net = gross - 2 * o.feePct;
      const entryIdx = t + 1;
      const sample = entryIdx >= cutIdx ? 'out' : (exitIdx < cutIdx ? 'in' : 'boundary');
      trades.push({ signalIdx: t, entryIdx: entryIdx, exitIdx: exitIdx, entryDate: S.date[entryIdx], exitDate: S.date[exitIdx],
                    entry: entry, exit: fill, stop: stop, target: target, riskPct: riskPct * 100, reason: reason, open: open_,
                    netPct: net * 100, R: net / riskPct, bars: exitIdx - (t + 1) + 1,
                    sample: sample });
      t = Math.max(exitIdx, t + 1);          // flat again at the close of exitIdx
      if (open_) break;
    }
    // equity curve (closed trades), fixed-fractional sizing
    let eq = 100, peak = 100, maxDD = 0; const curve = [{ i: 0, date: S.date[0], eq: eq }];
    trades.filter(function (x) { return !x.open; }).forEach(function (x) {
      const pos = Math.min(o.riskPerTrade / (x.riskPct / 100), o.maxPosPct);
      eq *= 1 + pos * x.netPct / 100; x.equityAfter = eq;
      peak = Math.max(peak, eq); maxDD = Math.max(maxDD, (peak - eq) / peak * 100);
      curve.push({ i: x.exitIdx, date: x.exitDate, eq: eq });
    });
    return { trades: trades, equity: curve, stats: summarize(trades), totalReturnPct: eq - 100, maxDrawdownPct: maxDD };
  }

  function summarize(trades) {
    const cl = trades.filter(function (x) { return !x.open; });
    if (!cl.length) return { n: 0 };
    const w = cl.filter(function (x) { return x.netPct > 0; }), l = cl.filter(function (x) { return x.netPct <= 0; });
    const sum = function (a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); };
    const gw = sum(w, function (x) { return x.netPct; }), gl = -sum(l, function (x) { return x.netPct; });
    return { n: cl.length, winRate: w.length / cl.length * 100, avgNetPct: sum(cl, function (x) { return x.netPct; }) / cl.length,
             avgWinPct: w.length ? gw / w.length : 0, avgLossPct: l.length ? -gl / l.length : 0,
             profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0), expectancyR: sum(cl, function (x) { return x.R; }) / cl.length,
             avgBars: sum(cl, function (x) { return x.bars; }) / cl.length,
             byReason: cl.reduce(function (m, x) { m[x.reason] = (m[x.reason] || 0) + 1; return m; }, {}) };
  }

  /** Backtest many symbols; returns per-symbol results + pooled statistics (all / in-sample / out-of-sample). */
  function backtestUniverse(universe, options, onError) {
    if (!universe || typeof universe !== 'object' || Array.isArray(universe)) {
      throw new TypeError('Universe must be an object mapping symbols to bar arrays.');
    }
    if (onError != null && typeof onError !== 'function') throw new TypeError('onError must be a function.');
    const resolvedOptions = resolve(options);
    const per = {}, pooled = [];
    for (const sym of Object.keys(universe)) {
      let r;
      try {
        r = backtest(universe[sym], resolvedOptions);
      } catch (e) {
        const wrapped = new Error('Unable to backtest "' + sym + '": ' + (e && e.message ? e.message : String(e)));
        if (onError) onError(wrapped, sym);
        else throw wrapped;
        continue;
      }
      per[sym] = r; r.trades.forEach(function (x) { pooled.push(Object.assign({ symbol: sym }, x)); });
    }
    return { perSymbol: per, trades: pooled, summary: {
      all: summarize(pooled),
      inSample: summarize(pooled.filter(function (x) { return x.sample === 'in'; })),
      outOfSample: summarize(pooled.filter(function (x) { return x.sample === 'out'; })),
      boundary: summarize(pooled.filter(function (x) { return x.sample === 'boundary'; })) } };
  }

  function parseCSV(text) {
    if (typeof text !== 'string') throw new TypeError('CSV input must be a string.');
    text = text.replace(/^\uFEFF/, '');
    if (!text.trim()) return [];

    function splitRecord(record, sep, lineNumber) {
      const result = [];
      let value = '', quoted = false;
      for (let i = 0; i < record.length; i++) {
        const ch = record[i];
        if (quoted) {
          if (ch === '"' && record[i + 1] === '"') { value += '"'; i++; }
          else if (ch === '"') quoted = false;
          else value += ch;
        } else if (ch === '"') {
          if (value.trim()) throw new SyntaxError('Unexpected quote in CSV line ' + lineNumber + '.');
          value = ''; quoted = true;
        } else if (ch === sep) {
          result.push(value.trim()); value = '';
        } else value += ch;
      }
      if (quoted) throw new SyntaxError('Unclosed quoted field in CSV line ' + lineNumber + '.');
      result.push(value.trim());
      return result;
    }

    const rows = [];
    let row = '', inQuotes = false, rowLine = 1, currentLine = 1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        row += ch;
        if (inQuotes && text[i + 1] === '"') row += text[++i];
        else inQuotes = !inQuotes;
      } else if (ch === '\n' && !inQuotes) {
        if (row.trim()) rows.push({ raw: row, line: rowLine });
        row = ''; currentLine++; rowLine = currentLine;
      } else {
        row += ch;
        if (ch === '\n') currentLine++;
      }
    }
    if (row.trim()) rows.push({ raw: row, line: rowLine });
    if (!rows.length) return [];

    const firstRecord = rows[0].raw;
    const separatorCounts = [',', ';', '\t'].map(function (separator) {
      let count = 0, quoted = false;
      for (let i = 0; i < firstRecord.length; i++) {
        if (firstRecord[i] === '"') {
          if (quoted && firstRecord[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && firstRecord[i] === separator) count++;
      }
      return count;
    });
    let separator = ',';
    let bestCount = separatorCounts[0];
    if (separatorCounts[1] > bestCount) { separator = ';'; bestCount = separatorCounts[1]; }
    if (separatorCounts[2] > bestCount) { separator = '\t'; bestCount = separatorCounts[2]; }
    if (!bestCount) throw new SyntaxError('Could not detect a CSV separator.');

    const first = splitRecord(rows[0].raw, separator, rows[0].line);
    const normalized = first.map(function (value) {
      return value.toLowerCase().replace(/[^a-z]/g, '');
    });
    const find = function (aliases) {
      return normalized.findIndex(function (value) { return aliases.indexOf(value) >= 0; });
    };
    const closeIx = find(['close', 'adjclose', 'price']);
    const volIx = find(['volume', 'vol']);
    const hasHeader = closeIx >= 0 && volIx >= 0;
    let ix;
    if (hasHeader) {
      ix = {
        date: find(['date', 'time', 'datetime', 'ngay']),
        open: find(['open']), high: find(['high']), low: find(['low']),
        close: closeIx, volume: volIx
      };
      ['open', 'high', 'low', 'close', 'volume'].forEach(function (field) {
        if (ix[field] < 0) throw new SyntaxError('CSV header is missing required "' + field + '" column.');
      });
    } else {
      if (first.length < 6) throw new SyntaxError('Headerless CSV must contain date, open, high, low, close, and volume columns.');
      ix = { date: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 };
    }

    function number(value, line, field) {
      let raw = String(value == null ? '' : value).trim();
      if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) raw = raw.replace(/,/g, '');
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
        throw new SyntaxError('Invalid ' + field + ' value at CSV line ' + line + '.');
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new RangeError('Non-finite ' + field + ' value at CSV line ' + line + '.');
      return parsed;
    }

    const bars = [];
    for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
      const fields = splitRecord(rows[i].raw, separator, rows[i].line);
      if (fields.length <= Math.max(ix.open, ix.high, ix.low, ix.close, ix.volume)) {
        throw new SyntaxError('CSV row at line ' + rows[i].line + ' has too few columns.');
      }
      const bar = {
        date: ix.date >= 0 ? fields[ix.date] : String(rows[i].line),
        open: number(fields[ix.open], rows[i].line, 'open'),
        high: number(fields[ix.high], rows[i].line, 'high'),
        low: number(fields[ix.low], rows[i].line, 'low'),
        close: number(fields[ix.close], rows[i].line, 'close'),
        volume: number(fields[ix.volume], rows[i].line, 'volume')
      };
      if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.volume < 0) {
        throw new RangeError('CSV line ' + rows[i].line + ' must contain positive OHLC prices and non-negative volume.');
      }
      if (bar.high < Math.max(bar.open, bar.close, bar.low) ||
          bar.low > Math.min(bar.open, bar.close, bar.high)) {
        throw new RangeError('CSV line ' + rows[i].line + ' has inconsistent high/low values.');
      }
      bars.push(bar);
    }
    if (bars.length > 1) {
      const dates = bars.map(function (bar) { return dateMillis(bar.date); });
      if (dates.every(function (date) { return date != null; })) {
        const ascending = dates.every(function (date, i) { return i === 0 || date > dates[i - 1]; });
        const descending = dates.every(function (date, i) { return i === 0 || date < dates[i - 1]; });
        if (descending) bars.reverse();
        else if (!ascending) throw new RangeError('CSV dates must be strictly ordered; mixed or duplicate dates found.');
      }
    }
    return bars;
  }

  return { DEFAULTS: DEFAULTS, PRESETS: PRESETS, resolve: resolve, prepare: prepare, evaluateAt: evaluateAt,
           scanSymbol: scanSymbol, scanUniverse: scanUniverse, backtest: backtest, backtestUniverse: backtestUniverse,
           summarize: summarize, parseCSV: parseCSV };
});
