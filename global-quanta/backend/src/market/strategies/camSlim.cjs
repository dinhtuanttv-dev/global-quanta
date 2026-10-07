/*!
 * CAMSLIM Cup & Handle Screener
 * Standalone CommonJS/browser implementation; no runtime dependencies.
 *
 * Input bars must be oldest-first and contain finite, positive close prices
 * and finite, non-negative share volumes. The pattern uses close and volume.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CamslimScreener = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    minBars: 260,
    minPrice: 20,
    minAvgVol: 100000,
    minDollarVol: 0,
    handleMin: 5,
    handleMax: 25,
    rightMin: 3,
    rightMax: 25,
    leftMin: 20,
    leftMax: 120,
    depthMin: 0.12,
    depthMax: 0.35,
    handleFrac: 0.33,
    handleMaxPct: 0.15,
    lipMin: 0.90,
    lipMax: 1.02,
    pivotZone: 0.95,
    runUpMin: 1.30,
    volDryUp: 0.90,
    breakVolMult: 1.40,
    useTrend: true
  });

  const OPTION_KEYS = Object.keys(DEFAULTS);
  const NUMBER_OPTIONS = OPTION_KEYS.filter(function (key) { return key !== 'useTrend'; });

  function makeError(message, Type) {
    return new (Type || Error)(message);
  }

  function resolveOptions(options) {
    if (options == null) return DEFAULTS;
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw makeError('Options must be an object.', TypeError);
    }

    const unknown = Object.keys(options).filter(function (key) {
      return OPTION_KEYS.indexOf(key) === -1;
    });
    if (unknown.length) {
      throw makeError('Unknown option(s): ' + unknown.join(', '), TypeError);
    }

    const out = Object.assign({}, DEFAULTS, options);
    NUMBER_OPTIONS.forEach(function (key) {
      if (typeof out[key] !== 'number' || !Number.isFinite(out[key])) {
        throw makeError('Option "' + key + '" must be a finite number.', TypeError);
      }
    });
    if (!Number.isInteger(out.minBars) || out.minBars < 1) {
      throw makeError('Option "minBars" must be a positive integer.', RangeError);
    }
    ['handleMin', 'handleMax', 'rightMin', 'rightMax', 'leftMin', 'leftMax'].forEach(function (key) {
      if (!Number.isInteger(out[key])) {
        throw makeError('Option "' + key + '" must be an integer number of bars.', TypeError);
      }
    });
    if (typeof out.useTrend !== 'boolean') {
      throw makeError('Option "useTrend" must be a boolean.', TypeError);
    }

    [
      ['minPrice', 0], ['minAvgVol', 0], ['minDollarVol', 0],
      ['handleMin', 1], ['handleMax', 1], ['rightMin', 1], ['rightMax', 1],
      ['leftMin', 1], ['leftMax', 1], ['depthMin', 0], ['depthMax', 0],
      ['handleFrac', 0], ['handleMaxPct', 0], ['lipMin', 0], ['lipMax', 0],
      ['pivotZone', 0], ['runUpMin', 0], ['volDryUp', 0], ['breakVolMult', 0]
    ].forEach(function (item) {
      if (out[item[0]] < item[1]) {
        throw makeError('Option "' + item[0] + '" must be at least ' + item[1] + '.', RangeError);
      }
    });

    [
      ['handleMin', 'handleMax'], ['rightMin', 'rightMax'],
      ['leftMin', 'leftMax'], ['depthMin', 'depthMax'], ['lipMin', 'lipMax']
    ].forEach(function (pair) {
      if (out[pair[0]] > out[pair[1]]) {
        throw makeError('Option "' + pair[0] + '" cannot exceed "' + pair[1] + '".', RangeError);
      }
    });
    if (out.handleFrac > 1 || out.handleMaxPct > 1 || out.depthMax > 1 ||
        out.lipMax <= 0 || out.pivotZone > 1) {
      throw makeError('Fractional options must be within their valid range (0 to 1).', RangeError);
    }
    return out;
  }

  function parseDateValue(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    const isoDate = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[Tt ].*)?$/.test(text);
    const usDate = /^\d{1,2}\/\d{1,2}\/\d{4}(?:\s.*)?$/.test(text);
    const compactDate = /^\d{8}$/.test(text);
    if (!isoDate && !usDate && !compactDate) return null;
    let candidate = text;
    if (compactDate) candidate = text.slice(0, 4) + '-' + text.slice(4, 6) + '-' + text.slice(6, 8);
    const time = Date.parse(candidate);
    return Number.isFinite(time) ? time : null;
  }

  function validateBars(bars) {
    if (!Array.isArray(bars)) throw makeError('Bars must be an array.', TypeError);
    const n = bars.length;
    const date = new Array(n);
    const c = new Float64Array(n);
    const v = new Float64Array(n);
    let previousTime = null;
    let hasComparableDate = false;
    let hasUnparseableDate = false;

    for (let i = 0; i < n; i++) {
      const bar = bars[i];
      if (!bar || typeof bar !== 'object' || Array.isArray(bar)) {
        throw makeError('Bar at index ' + i + ' must be an object.', TypeError);
      }
      const close = bar.close == null || (typeof bar.close === 'string' && !bar.close.trim())
        ? NaN : Number(bar.close);
      const volume = bar.volume == null || (typeof bar.volume === 'string' && !bar.volume.trim())
        ? NaN : Number(bar.volume);
      if (typeof bar.close === 'boolean' || typeof bar.volume === 'boolean') {
        throw makeError('Bar at index ' + i + ' must use numeric close and volume values.', TypeError);
      }
      if (!Number.isFinite(close) || close <= 0) {
        throw makeError('Bar at index ' + i + ' has an invalid close; expected a finite positive number.', TypeError);
      }
      if (!Number.isFinite(volume) || volume < 0) {
        throw makeError('Bar at index ' + i + ' has an invalid volume; expected a finite non-negative number.', TypeError);
      }

      c[i] = close;
      v[i] = volume;
      date[i] = bar.date == null ? String(i) : String(bar.date);
      const time = parseDateValue(bar.date);
      if (time == null) {
        hasUnparseableDate = true;
        previousTime = null;
      } else {
        if (previousTime != null) {
          hasComparableDate = true;
          if (time <= previousTime) {
            throw makeError('Bars must be ordered oldest-first with strictly increasing dates (index ' + i + ').', RangeError);
          }
        }
        previousTime = time;
      }
    }
    return { date: date, c: c, v: v, hasComparableDate: hasComparableDate, hasUnparseableDate: hasUnparseableDate };
  }

  function extreme(a, end, n, isMax) {
    const start = end - n + 1;
    if (!Number.isInteger(end) || !Number.isInteger(n) || n < 1 ||
        start < 0 || end >= a.length) return null;
    let best = a[end], idx = end;
    for (let i = end - 1; i >= start; i--) {
      if (isMax ? a[i] > best : a[i] < best) { best = a[i]; idx = i; }
    }
    return { value: best, idx: idx };
  }

  function maAt(a, end, n) {
    const start = end - n + 1;
    if (!Number.isInteger(end) || !Number.isInteger(n) || n < 1 ||
        start < 0 || end >= a.length) return NaN;
    let sum = 0;
    for (let i = start; i <= end; i++) sum += a[i];
    return sum / n;
  }

  function maDollarAt(c, v, end, n) {
    const start = end - n + 1;
    if (start < 0 || end >= c.length) return NaN;
    let sum = 0;
    for (let i = start; i <= end; i++) sum += c[i] * v[i];
    return sum / n;
  }

  function prepare(bars) {
    return validateBars(bars);
  }

  /**
   * Evaluate a setup at index t. Insufficient history is returned as a normal
   * non-match; malformed state, index, or options are reported as exceptions.
   */
  function setupAt(S, t, options) {
    const o = resolveOptions(options);
    if (!S || !S.c || !S.v || !Array.isArray(S.date) ||
        S.c.length !== S.v.length || S.c.length !== S.date.length) {
      throw makeError('Prepared series is invalid; call prepare(bars) first.', TypeError);
    }
    if (!Number.isInteger(t) || t < 0 || t >= S.c.length) {
      throw makeError('Bar index is outside the prepared series.', RangeError);
    }
    const c = S.c, v = S.v;
    if (t + 1 < o.minBars) return { ok: false, reason: 'not enough bars' };

    const hh = extreme(c, t, o.handleMax, true);
    if (!hh) return { ok: false, reason: 'not enough bars' };
    const LH = hh.value, BLH = t - hh.idx, BLHs = Math.max(BLH, 1);
    const hl = extreme(c, t, BLHs, false);
    if (!hl) return { ok: false, reason: 'not enough bars' };
    const BH = hl.value, BBH = t - hl.idx;
    const HandleLen = BLH, DownLen = BLH - BBH;

    const cb = extreme(c, t, BLHs + o.rightMax, false);
    if (!cb) return { ok: false, reason: 'not enough bars' };
    const BC = cb.value, b = cb.idx, BBC = t - b;
    const RightLen = BBC - BLH;

    const lp = extreme(c, b, o.leftMax, true);
    if (!lp) return { ok: false, reason: 'not enough bars' };
    const LC = lp.value, p = lp.idx, LeftLen = b - p;

    const ph = extreme(c, p - 1, 30, true);
    const pl = extreme(c, p, 60, false);
    if (!ph || !pl) return { ok: false, reason: 'not enough bars' };
    const PrevHigh = ph.value, PreLow = pl.value;
    const Delta = LC / PrevHigh, RunUp = LC / PreLow;
    const Depth = (LC - BC) / LC;
    const low = extreme(c, t, t - p + 1, false);
    const trueBottom = !!low && low.value >= BC;

    const BotAvg = b + 3 <= t ? maAt(c, b + 3, 7) : NaN;
    const Rounded = Number.isFinite(BotAvg) && BotAvg <= BC + 0.25 * (LC - BC);

    let up = 0, dn = 0;
    for (let i = Math.max(b + 1, 1); i <= t - BLH; i++) {
      if (c[i] > c[i - 1]) up += v[i];
      else if (c[i] < c[i - 1]) dn += v[i];
    }
    const Alpha = dn > 0 ? up / dn : 0;
    let hv = 0;
    for (let i = t - BLHs + 1; i <= t; i++) hv += v[i];
    const vol50 = maAt(v, t, 50);
    const Beta = vol50 > 0 ? (hv / BLHs) / vol50 : Infinity;

    const ma200 = maAt(c, t, 200), ma200p = maAt(c, t - 20, 200);
    const hi250 = extreme(c, t, 250, true);
    const trendOK = !o.useTrend ||
      (Number.isFinite(ma200) && Number.isFinite(ma200p) && !!hi250 &&
       c[t] > ma200 && ma200 > ma200p && c[t] >= 0.75 * hi250.value);
    const dollar50 = maDollarAt(c, v, t, 50);
    const liquid = c[t] > o.minPrice && vol50 > o.minAvgVol &&
      Number.isFinite(dollar50) && dollar50 > o.minDollarVol;

    const checks = {
      liquid: !!liquid,
      trend: !!trendOK,
      handleLength: HandleLen >= o.handleMin && HandleLen <= o.handleMax,
      handleDown: DownLen >= 2,
      handleBelowLip: BH < LH && c[t] > BH,
      handleDepth: (LH - BH) / LH <= o.handleMaxPct,
      handleInUpperCup: BH >= LH - o.handleFrac * (LH - BC),
      nearPivot: c[t] >= o.pivotZone * LH,
      rightSide: RightLen >= o.rightMin && RightLen <= o.rightMax,
      leftSide: LeftLen >= o.leftMin && LeftLen <= o.leftMax,
      cupDepth: Depth >= o.depthMin && Depth <= o.depthMax,
      lipLevel: LH >= o.lipMin * LC && LH <= o.lipMax * LC,
      trueBottom: trueBottom,
      rounded: Rounded,
      peakIsNewHigh: LC > PrevHigh,
      priorAdvance: RunUp >= o.runUpMin,
      upDownVolume: Alpha > 1,
      handleDryUp: Beta < o.volDryUp
    };
    const ok = Object.keys(checks).every(function (key) { return checks[key]; });
    const score = Math.log(Math.max(Alpha, 0.01)) - Math.log(Math.max(Beta, 0.01)) +
      Math.log(Delta) - 5 * (1 - c[t] / LH);

    return {
      ok: ok,
      checks: checks,
      metrics: {
        close: c[t], pivot: LH, handleLow: BH, cupBottom: BC, leftPeak: LC,
        depthPct: Depth * 100, handleBars: HandleLen, rightBars: RightLen, leftBars: LeftLen,
        runUp: RunUp, delta: Delta, alpha: Alpha, beta: Beta, vol50: vol50, score: score,
        idx: { t: t, lip: hh.idx, handleLow: hl.idx, bottom: b, leftPeak: p }
      }
    };
  }

  function scanSymbol(bars, options) {
    const o = resolveOptions(options);
    const S = prepare(bars);
    if (!S.c.length) throw makeError('Cannot scan an empty bar series.', RangeError);
    const t = S.c.length - 1;
    const cur = setupAt(S, t, o);
    const prev = t > 0 ? setupAt(S, t - 1, o) : { ok: false };
    const breakout = !!prev.ok &&
      S.c[t] > prev.metrics.pivot && S.v[t] > o.breakVolMult * prev.metrics.vol50;
    const status = breakout ? 'BREAKOUT' : (cur.ok ? 'SETUP' : null);
    const detail = breakout ? prev : cur;
    return {
      status: status, date: S.date[t],
      metrics: detail.metrics || null, checks: detail.checks || null,
      reason: detail.reason || null
    };
  }

  /**
   * Scan a symbol map. Invalid symbols throw with their symbol in the error.
   * Pass onError(error, symbol) as the third argument to explicitly collect and
   * handle per-symbol failures while continuing the scan.
   */
  function scanUniverse(universe, options, onError) {
    if (!universe || typeof universe !== 'object' || Array.isArray(universe)) {
      throw makeError('Universe must be an object mapping symbols to bar arrays.', TypeError);
    }
    if (onError != null && typeof onError !== 'function') {
      throw makeError('onError must be a function when provided.', TypeError);
    }
    const out = [];
    Object.keys(universe).forEach(function (sym) {
      try {
        const result = scanSymbol(universe[sym], options);
        if (result.status) out.push(Object.assign({ symbol: sym }, result));
      } catch (error) {
        const errorType = error instanceof Error ? error.constructor : Error;
        const message = error instanceof Error ? error.message : String(error);
        const wrapped = makeError('Unable to scan "' + sym + '": ' + message, errorType);
        if (onError) onError(wrapped, sym);
        else throw wrapped;
      }
    });
    out.sort(function (a, b) {
      return (Number(b.status === 'BREAKOUT') - Number(a.status === 'BREAKOUT')) ||
        ((b.metrics ? b.metrics.score : -Infinity) - (a.metrics ? a.metrics.score : -Infinity));
    });
    return out;
  }

  function scanHistory(bars, options) {
    const o = resolveOptions(options);
    const S = prepare(bars);
    const res = [];
    let prev = { ok: false };
    for (let t = 0; t < S.c.length; t++) {
      const cur = setupAt(S, t, o);
      let status = null;
      if (prev.ok && S.c[t] > prev.metrics.pivot &&
          S.v[t] > o.breakVolMult * prev.metrics.vol50) status = 'BREAKOUT';
      else if (cur.ok) status = 'SETUP';
      if (status) res.push({ index: t, date: S.date[t], status: status });
      prev = cur;
    }
    return res;
  }

  function splitCsvRecord(record, separator, lineNumber) {
    const fields = [];
    let value = '', quoted = false;
    for (let i = 0; i < record.length; i++) {
      const ch = record[i];
      if (quoted) {
        if (ch === '"') {
          if (record[i + 1] === '"') { value += '"'; i++; }
          else quoted = false;
        } else value += ch;
      } else if (ch === '"') {
        if (value.trim() !== '') {
          throw makeError('Unexpected quote in CSV line ' + lineNumber + '.', SyntaxError);
        }
        value = '';
        quoted = true;
      } else if (ch === separator) {
        fields.push(value.trim());
        value = '';
      } else {
        value += ch;
      }
    }
    if (quoted) throw makeError('Unclosed quoted field in CSV line ' + lineNumber + '.', SyntaxError);
    fields.push(value.trim());
    return fields;
  }

  function detectSeparator(text) {
    const candidates = [',', ';', '\t'];
    let counts = [0, 0, 0], quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted) {
        if (ch === '\r' || ch === '\n') break;
        const index = candidates.indexOf(ch);
        if (index >= 0) counts[index]++;
      }
    }
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    if (counts[best] === 0) throw makeError('Could not detect a CSV separator.', SyntaxError);
    return candidates[best];
  }

  function parseCsvNumber(value, lineNumber, columnName) {
    let normalized = String(value == null ? '' : value).trim();
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    }
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
      throw makeError('Invalid ' + columnName + ' value at CSV line ' + lineNumber + '.', SyntaxError);
    }
    const result = Number(normalized);
    if (!Number.isFinite(result)) {
      throw makeError('Non-finite ' + columnName + ' value at CSV line ' + lineNumber + '.', RangeError);
    }
    return result;
  }

  function parseCSV(text) {
    if (typeof text !== 'string') throw makeError('CSV input must be a string.', TypeError);
    const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!source.trim()) return [];
    const separator = detectSeparator(source);
    const records = [];
    let record = '', quoted = false, line = 1, recordLine = 1;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (ch === '"') {
        record += ch;
        if (quoted && source[i + 1] === '"') record += source[++i];
        else quoted = !quoted;
      } else if (ch === '\n' && !quoted) {
        if (record.trim()) records.push({ text: record, line: recordLine });
        record = '';
        line++;
        recordLine = line;
      } else {
        record += ch;
        if (ch === '\n') line++;
      }
    }
    if (quoted) throw makeError('Unclosed quoted field in CSV starting at line ' + recordLine + '.', SyntaxError);
    if (record.trim()) records.push({ text: record, line: recordLine });
    if (!records.length) return [];

    const firstFields = splitCsvRecord(records[0].text, separator, records[0].line);
    const normalizeHeader = function (field) {
      return field.trim().toLowerCase().replace(/[^a-z]/g, '');
    };
    const headers = firstFields.map(normalizeHeader);
    const closeAliases = ['close', 'adjclose', 'price'];
    const volumeAliases = ['volume', 'vol'];
    const headerClose = headers.findIndex(function (h) { return closeAliases.indexOf(h) >= 0; });
    const headerVolume = headers.findIndex(function (h) { return volumeAliases.indexOf(h) >= 0; });
    const hasHeader = headerClose >= 0 && headerVolume >= 0;
    let ix;
    if (hasHeader) {
      const find = function (aliases) {
        return headers.findIndex(function (h) { return aliases.indexOf(h) >= 0; });
      };
      ix = {
        date: find(['date', 'time', 'datetime', 'ngay']),
        open: find(['open']), high: find(['high']), low: find(['low']),
        close: headerClose, volume: headerVolume
      };
    } else {
      if (firstFields.length < 6) {
        throw makeError('Headerless CSV must contain date, open, high, low, close, and volume columns.', SyntaxError);
      }
      ix = { date: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 };
    }

    const bars = [];
    const start = hasHeader ? 1 : 0;
    for (let i = start; i < records.length; i++) {
      const row = records[i];
      const fields = splitCsvRecord(row.text, separator, row.line);
      if (fields.length <= Math.max(ix.close, ix.volume)) {
        throw makeError('CSV row at line ' + row.line + ' has too few columns.', SyntaxError);
      }
      const close = parseCsvNumber(fields[ix.close], row.line, 'close');
      const volume = parseCsvNumber(fields[ix.volume], row.line, 'volume');
      if (close <= 0 || volume < 0) {
        throw makeError('CSV line ' + row.line + ' must have positive close and non-negative volume.', RangeError);
      }
      const optionalNumber = function (index, name) {
        if (index < 0 || fields[index] == null || fields[index].trim() === '') return null;
        return parseCsvNumber(fields[index], row.line, name);
      };
      bars.push({
        date: ix.date >= 0 && fields[ix.date] != null ? fields[ix.date].trim() : String(row.line),
        open: optionalNumber(ix.open, 'open'),
        high: optionalNumber(ix.high, 'high'),
        low: optionalNumber(ix.low, 'low'),
        close: close,
        volume: volume
      });
    }

    if (bars.length > 1) {
      const times = bars.map(function (bar) { return parseDateValue(bar.date); });
      const allDated = times.every(function (time) { return time != null; });
      if (allDated) {
        const ascending = times.every(function (time, i) { return i === 0 || time > times[i - 1]; });
        const descending = times.every(function (time, i) { return i === 0 || time < times[i - 1]; });
        if (descending) bars.reverse();
        else if (!ascending) throw makeError('CSV dates must be strictly ordered; mixed or duplicate dates found.', RangeError);
      }
    }
    return bars;
  }

  return Object.freeze({
    DEFAULTS: DEFAULTS,
    setupAt: setupAt,
    scanSymbol: scanSymbol,
    scanUniverse: scanUniverse,
    scanHistory: scanHistory,
    parseCSV: parseCSV,
    prepare: prepare
  });
});
