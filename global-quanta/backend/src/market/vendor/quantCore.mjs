// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: src/lib/quant-core (gateway.ts). Tạo lại: npm run bundle:gateway

// src/lib/quant-core/math.ts
function trueRange(bars, i) {
  const b = bars[i];
  if (i === 0) return b.high - b.low;
  const pc = bars[i - 1].close;
  return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
}
function atrSeries(bars, period = 14) {
  const out = new Array(bars.length).fill(0);
  let sum = 0;
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRange(bars, i);
    if (i < period) {
      sum += tr;
      atr = sum / (i + 1);
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    out[i] = atr;
  }
  return out;
}
function emaSeries(values, period) {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let ema = NaN;
  for (let i = 0; i < values.length; i++) {
    ema = i === 0 ? values[0] : values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}
function trailingZ(values, i, window) {
  if (i < window) return null;
  let s = 0;
  let s2 = 0;
  for (let j = i - window; j < i; j++) {
    s += values[j];
    s2 += values[j] * values[j];
  }
  const mean = s / window;
  const variance = s2 / window - mean * mean;
  if (!(variance > 1e-12)) return null;
  return (values[i] - mean) / Math.sqrt(variance);
}
var logVolumes = (bars) => bars.map((b) => Math.log(Math.max(0, b.volume) + 1));
var spreads = (bars) => bars.map((b) => b.high - b.low);
function clv(b) {
  const r = b.high - b.low;
  return r > 0 ? (b.close - b.low) / r : 0.5;
}
function tickSize(price, isIndex = false) {
  if (isIndex) return 0.01;
  return price < 1e4 ? 10 : price < 5e4 ? 50 : 100;
}
function isLimitLocked(bars, i, limitPct) {
  if (!limitPct || i === 0) return false;
  const b = bars[i];
  const pc = bars[i - 1].close;
  if (!(pc > 0)) return false;
  const move = Math.abs(b.close / pc - 1);
  return move >= limitPct - 3e-3 && (b.close === b.high || b.close === b.low);
}

// src/lib/quant-core/structure.ts
var DEFAULT_STRUCTURE = { left: 5, right: 5, atrPeriod: 14, volWindow: 20 };
function detectPivots(bars, left = 5, right = 5) {
  const out = [];
  for (let i = left; i + right < bars.length; i++) {
    let isHigh = true;
    let isLow2 = true;
    for (let j = i - left; j < i && (isHigh || isLow2); j++) {
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow2 = false;
    }
    for (let j = i + 1; j <= i + right && (isHigh || isLow2); j++) {
      if (bars[j].high > bars[i].high) isHigh = false;
      if (bars[j].low < bars[i].low) isLow2 = false;
    }
    if (isHigh) out.push({ index: i, date: bars[i].date, kind: "high", price: bars[i].high, confirmedIndex: i + right });
    if (isLow2) out.push({ index: i, date: bars[i].date, kind: "low", price: bars[i].low, confirmedIndex: i + right });
  }
  return out.sort((a, b) => a.confirmedIndex - b.confirmedIndex || a.index - b.index);
}
function computeStructure(bars, params = {}) {
  const p = { ...DEFAULT_STRUCTURE, ...params };
  const atr = atrSeries(bars, p.atrPeriod);
  const lv = logVolumes(bars);
  const pivots2 = detectPivots(bars, p.left, p.right);
  const events = [];
  let next = 0;
  let activeHigh = null;
  let activeLow = null;
  let trend = null;
  for (let i = 0; i < bars.length; i++) {
    while (next < pivots2.length && pivots2[next].confirmedIndex === i) {
      const pv = pivots2[next++];
      if (pv.kind === "high") activeHigh = pv;
      else activeLow = pv;
    }
    const b = bars[i];
    const breaks = [];
    if (activeHigh && b.close > activeHigh.price) breaks.push({ dir: "bullish", pv: activeHigh });
    if (activeLow && b.close < activeLow.price) breaks.push({ dir: "bearish", pv: activeLow });
    for (const { dir, pv } of breaks) {
      let legStart = pv.index;
      for (let j = pv.index; j <= i; j++) {
        if (dir === "bullish" ? bars[j].low < bars[legStart].low : bars[j].high > bars[legStart].high) legStart = j;
      }
      const a = atr[i] > 0 ? atr[i] : 1;
      const body = Math.abs(b.close - b.open) / a;
      let run = 0;
      for (let j = i; j >= Math.max(0, i - 2); j--) {
        const up = bars[j].close > bars[j].open;
        if (dir === "bullish" !== up) break;
        run += (bars[j].high - bars[j].low) / a;
      }
      const displacementATR = Math.round(Math.max(body, run / 1.5) * 100) / 100;
      events.push({
        kind: trend !== null && trend !== dir ? "CHoCH" : "BOS",
        dir,
        index: i,
        date: b.date,
        level: pv.price,
        pivotIndex: pv.index,
        legStartIndex: legStart,
        displacementATR,
        displaced: body >= 1 || run >= 1.5,
        volZ: trailingZ(lv, i, p.volWindow),
        confirmedIndex: i
      });
      trend = dir;
      if (dir === "bullish") activeHigh = null;
      else activeLow = null;
    }
  }
  return { pivots: pivots2, events, trend, atr };
}

// src/lib/quant-core/zones.ts
var OB_EXPIRY_BARS = 120;
function detectOrderBlocks(bars, events, atr) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const ev of events) {
    let j = -1;
    for (let k = ev.legStartIndex; k >= Math.max(0, ev.legStartIndex - 5); k--) {
      const down = bars[k].close < bars[k].open;
      if (ev.dir === "bullish" ? down : !down && bars[k].close !== bars[k].open) {
        j = k;
        break;
      }
    }
    if (j < 0) j = ev.legStartIndex;
    if (seen.has(j)) continue;
    seen.add(j);
    const c = bars[j];
    const a = atr[ev.index] > 0 ? atr[ev.index] : 1;
    let top = Math.max(c.open, c.close);
    let bottom = Math.min(c.open, c.close);
    if (top - bottom < 0.1 * a) {
      top = c.high;
      bottom = c.low;
    }
    const zone = {
      dir: ev.dir,
      index: j,
      date: c.date,
      top,
      bottom,
      createdByIndex: ev.index,
      confirmedIndex: ev.index,
      kind: ev.kind,
      status: "ACTIVE",
      statusIndex: null,
      statusDate: null,
      tests: 0,
      quality: Math.round(Math.min(1, 0.4 * Math.min(1, ev.displacementATR / 2) + 0.3 * Math.min(1, Math.max(0, ev.volZ ?? 0) / 2) + 0.3) * 100) / 100
    };
    const mid = (top + bottom) / 2;
    let inside = false;
    for (let k = ev.index + 1; k < bars.length; k++) {
      const b = bars[k];
      const touching = b.low <= top && b.high >= bottom;
      if (touching && !inside) zone.tests++;
      inside = touching;
      const brokeThrough = ev.dir === "bullish" ? b.close < bottom : b.close > top;
      if (brokeThrough) {
        zone.status = "BREAKER";
        zone.statusIndex = k;
        break;
      }
      const meanThreshold = ev.dir === "bullish" ? b.low <= mid : b.high >= mid;
      if (meanThreshold && zone.status === "ACTIVE") {
        zone.status = "MITIGATED";
        zone.statusIndex = k;
        continue;
      }
      if (zone.status === "ACTIVE" && k - ev.index > OB_EXPIRY_BARS) {
        zone.status = "EXPIRED";
        zone.statusIndex = k;
        break;
      }
    }
    zone.statusDate = zone.statusIndex !== null ? bars[zone.statusIndex].date : null;
    out.push(zone);
  }
  return out.sort((a, b) => a.confirmedIndex - b.confirmedIndex);
}
function detectFVG(bars, atr, params = {}) {
  const p = { minATR: 0.25, minTicks: 2, limitPct: 0.07, isIndex: false, ...params };
  const out = [];
  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    const a = atr[i] > 0 ? atr[i] : 0;
    const minGap = Math.max(p.minATR * a, p.minTicks * tickSize(c3.close, p.isIndex));
    let dir = null;
    let top = 0;
    let bottom = 0;
    if (c3.low > c1.high && c3.low - c1.high >= minGap) {
      dir = "bullish";
      top = c3.low;
      bottom = c1.high;
    } else if (c3.high < c1.low && c1.low - c3.high >= minGap) {
      dir = "bearish";
      top = c1.low;
      bottom = c3.high;
    }
    if (!dir) continue;
    if (!p.isIndex && [i - 2, i - 1, i].some((k) => isLimitLocked(bars, k, p.limitPct))) continue;
    const zone = {
      dir,
      index: i - 1,
      startDate: c1.date,
      endDate: c3.date,
      top,
      bottom,
      sizeATR: a > 0 ? Math.round((top - bottom) / a * 100) / 100 : 0,
      confirmedIndex: i,
      state: "OPEN",
      filledPct: 0,
      stateIndex: null,
      stateDate: null
    };
    const h = top - bottom;
    for (let k = i + 1; k < bars.length; k++) {
      const b = bars[k];
      if (dir === "bullish" ? b.close < bottom : b.close > top) {
        zone.state = "INVERTED";
        zone.filledPct = 1;
        zone.stateIndex = k;
        break;
      }
      const pen = dir === "bullish" ? (top - b.low) / h : (b.high - bottom) / h;
      if (pen > zone.filledPct) {
        zone.filledPct = Math.min(1, Math.max(0, pen));
        const st = zone.filledPct >= 1 ? "FILLED" : zone.filledPct >= 0.5 ? "CE" : zone.filledPct > 0 ? "PARTIAL" : "OPEN";
        if (st !== zone.state) {
          zone.state = st;
          zone.stateIndex = k;
        }
        if (st === "FILLED") break;
      }
    }
    zone.filledPct = Math.round(zone.filledPct * 100) / 100;
    zone.stateDate = zone.stateIndex !== null ? bars[zone.stateIndex].date : null;
    out.push(zone);
  }
  return out;
}
function computeDealingRange(bars, pivots2) {
  const last = bars.length - 1;
  const confirmed = pivots2.filter((p) => p.confirmedIndex <= last);
  const hi = [...confirmed].reverse().find((p) => p.kind === "high");
  const lo = [...confirmed].reverse().find((p) => p.kind === "low");
  if (!hi || !lo || hi.price <= lo.price) return null;
  const r = hi.price - lo.price;
  const legDir = hi.index > lo.index ? "bullish" : "bearish";
  const eq = (hi.price + lo.price) / 2;
  const band = 0.05 * r;
  const ote = legDir === "bullish" ? { oteLow: hi.price - 0.786 * r, oteHigh: hi.price - 0.618 * r, ote705: hi.price - 0.705 * r } : { oteLow: lo.price + 0.618 * r, oteHigh: lo.price + 0.786 * r, ote705: lo.price + 0.705 * r };
  const c = bars[last].close;
  return {
    high: hi.price,
    low: lo.price,
    highIndex: hi.index,
    lowIndex: lo.index,
    highDate: hi.date,
    lowDate: lo.date,
    legDir,
    eq,
    eqLow: eq - band,
    eqHigh: eq + band,
    ...ote,
    zone: c > eq + band ? "premium" : c < eq - band ? "discount" : "equilibrium"
  };
}

// src/lib/quant-core/vsa.ts
var VSA_DIRECTION = {
  "Selling Climax": "bullish",
  "Stopping Volume": "bullish",
  Shakeout: "bullish",
  "No Supply": "bullish",
  "Buying Climax": "bearish",
  Upthrust: "bearish",
  "No Demand": "bearish",
  Absorption: null
};
var W = 30;
var SWING_LOOKBACK = 10;
function detectVsa(bars) {
  const lv = logVolumes(bars);
  const sp = spreads(bars);
  const ema = emaSeries(bars.map((b) => b.close), 20);
  const atr = atrSeries(bars, 14);
  const out = [];
  for (let i = W; i < bars.length; i++) {
    const zV = trailingZ(lv, i, W);
    const zS = trailingZ(sp, i, W);
    if (zV === null || zS === null) continue;
    const b = bars[i];
    const prev = bars[i - 1];
    const c = clv(b);
    const slope = i >= 6 ? ema[i - 1] / ema[i - 6] - 1 : 0;
    const up = slope > 0;
    const down = slope < 0;
    const isUpBar = b.close > prev.close;
    const isDownBar = b.close < prev.close;
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (let j = Math.max(0, i - SWING_LOOKBACK); j < i; j++) {
      swingHigh = Math.max(swingHigh, bars[j].high);
      swingLow = Math.min(swingLow, bars[j].low);
    }
    const lowEffort = b.volume < Math.min(bars[i - 1].volume, bars[i - 2].volume);
    let type = null;
    if (down && zV >= 2 && zS >= 1.5 && c >= 0.4) type = "Selling Climax";
    else if (up && zV >= 2 && zS >= 1.5 && c <= 0.6) type = "Buying Climax";
    else if (down && zV >= 1.5 && c >= 0.6 && zS >= 0) type = "Stopping Volume";
    else if (b.high > swingHigh && b.close < swingHigh && c <= 0.35 && zV >= 1) type = "Upthrust";
    else if (b.low < swingLow && b.close > swingLow && c >= 0.65 && zV >= 1) type = "Shakeout";
    else if (isDownBar && zS <= -0.5 && lowEffort && up) type = "No Supply";
    else if (isUpBar && zS <= -0.5 && lowEffort && down) type = "No Demand";
    else if (zV >= 1.5 && Math.abs(b.close - prev.close) <= 0.3 * (atr[i] || Infinity)) type = "Absorption";
    if (!type) continue;
    let v20 = 0;
    let s20 = 0;
    for (let j = i - 20; j < i; j++) {
      v20 += bars[j].volume;
      s20 += sp[j];
    }
    out.push({
      type,
      dir: VSA_DIRECTION[type],
      index: i,
      date: b.date,
      zV: Math.round(zV * 100) / 100,
      zS: Math.round(zS * 100) / 100,
      clv: Math.round(c * 100) / 100,
      volumeRatio: v20 > 0 ? Math.round(b.volume / (v20 / 20) * 100) / 100 : 0,
      spreadRatio: s20 > 0 ? Math.round(sp[i] / (s20 / 20) * 100) / 100 : 0,
      confirmedIndex: i
    });
  }
  return out;
}

// src/lib/quant-core/volumeProfile.ts
function profileBinSize(low, high, isIndex, maxBins) {
  const tick = tickSize((low + high) / 2, isIndex);
  const n = Math.max(1, (high - low) / tick);
  return n <= maxBins ? tick : Math.ceil(n / maxBins) * tick;
}
function buildVolumeProfile(bars, opts = {}) {
  const method = opts.method ?? "uniform";
  const src = bars.filter((b) => !b.auction && b.volume > 0 && b.high >= b.low);
  if (!src.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of src) {
    lo = Math.min(lo, b.low);
    hi = Math.max(hi, b.high);
  }
  const binSize = profileBinSize(lo, hi, Boolean(opts.isIndex), opts.maxBins ?? 120);
  const start = Math.floor(lo / binSize) * binSize;
  const count = Math.max(1, Math.floor((hi - start) / binSize) + 1);
  const vol = new Array(count).fill(0);
  const binOf = (p) => Math.min(count - 1, Math.max(0, Math.floor((p - start) / binSize + 1e-9)));
  for (const b of src) {
    const i0 = binOf(b.low);
    const i1 = binOf(b.high);
    if (i0 === i1) {
      vol[i0] += b.volume;
      continue;
    }
    if (method === "uniform") {
      const span = b.high - b.low;
      for (let i = i0; i <= i1; i++) {
        const a = Math.max(b.low, start + i * binSize);
        const z = Math.min(b.high, start + (i + 1) * binSize);
        if (z > a) vol[i] += b.volume * (z - a) / span;
      }
    } else {
      const tp = (b.high + b.low + b.close) / 3;
      const half = Math.max(tp - b.low, b.high - tp, binSize / 2);
      let wsum = 0;
      const w = [];
      for (let i = i0; i <= i1; i++) {
        const mid2 = start + (i + 0.5) * binSize;
        const x = Math.max(0, 1 - Math.abs(mid2 - tp) / half);
        w.push(x);
        wsum += x;
      }
      w.forEach((x, k) => {
        vol[i0 + k] += wsum > 0 ? b.volume * x / wsum : b.volume / w.length;
      });
    }
  }
  const total = vol.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  let pv = 0;
  for (const b of src) pv += (b.high + b.low + b.close) / 3 * b.volume;
  const vwap = pv / src.reduce((s, b) => s + b.volume, 0);
  let poc = 0;
  for (let i = 1; i < count; i++) {
    const better = vol[i] > vol[poc] + 1e-9;
    const tie = Math.abs(vol[i] - vol[poc]) <= 1e-9 && Math.abs(start + (i + 0.5) * binSize - vwap) < Math.abs(start + (poc + 0.5) * binSize - vwap);
    if (better || tie) poc = i;
  }
  const [vaLo, vaHi] = valueArea(vol, poc, opts.valueAreaPct ?? 0.7);
  const { hvn, lvn } = nodes(vol, poc);
  const mid = (i) => start + (i + 0.5) * binSize;
  return {
    bins: vol.map((v, i) => ({ low: start + i * binSize, high: start + (i + 1) * binSize, volume: v })),
    binSize,
    totalVolume: total,
    maxVolume: vol[poc],
    poc: mid(poc),
    pocIndex: poc,
    vah: start + (vaHi + 1) * binSize,
    val: start + vaLo * binSize,
    hvn: hvn.map(mid),
    lvn: lvn.map(mid),
    method,
    fromDate: src[0].date,
    toDate: src[src.length - 1].date
  };
}
function valueArea(vol, poc, pct2 = 0.7) {
  const total = vol.reduce((s, v) => s + v, 0);
  let lo = poc;
  let hi = poc;
  let acc = vol[poc];
  while (acc < pct2 * total && (lo > 0 || hi < vol.length - 1)) {
    const up = (hi + 1 < vol.length ? vol[hi + 1] : 0) + (hi + 2 < vol.length ? vol[hi + 2] : 0);
    const dn = (lo - 1 >= 0 ? vol[lo - 1] : 0) + (lo - 2 >= 0 ? vol[lo - 2] : 0);
    const canUp = hi < vol.length - 1;
    const canDn = lo > 0;
    const takeUp = canUp && (!canDn || up >= dn);
    const takeDn = canDn && (!canUp || dn >= up);
    if (takeUp) {
      const n = Math.min(2, vol.length - 1 - hi);
      for (let k = 1; k <= n; k++) acc += vol[hi + k];
      hi += n;
    }
    if (takeDn) {
      const n = Math.min(2, lo);
      for (let k = 1; k <= n; k++) acc += vol[lo - k];
      lo -= n;
    }
  }
  return [lo, hi];
}
function nodes(vol, poc, sigma = 2) {
  const r = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)));
  const sm = vol.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= vol.length) continue;
      s += vol[j] * kernel[k + r];
      w += kernel[k + r];
    }
    return w ? s / w : 0;
  });
  const ref = sm[poc] || Math.max(...sm);
  const hvn = [];
  const lvn = [];
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] && sm[i] >= 0.15 * ref) hvn.push(i);
    if (sm[i] <= sm[i - 1] && sm[i] < sm[i + 1] && sm[i] <= 0.35 * ref) lvn.push(i);
  }
  return { hvn, lvn };
}

// src/lib/quant-core/vwap.ts
function anchoredVwap(bars, anchorIndex) {
  const out = [];
  if (anchorIndex < 0 || anchorIndex >= bars.length) return out;
  let pv = 0;
  let pv2 = 0;
  let v = 0;
  for (let i = anchorIndex; i < bars.length; i++) {
    const b = bars[i];
    const tp = (b.high + b.low + b.close) / 3;
    const w = Math.max(0, b.volume);
    pv += tp * w;
    pv2 += tp * tp * w;
    v += w;
    if (!(v > 0)) continue;
    const vwap = pv / v;
    out.push({ date: b.date, vwap, sigma: Math.sqrt(Math.max(0, pv2 / v - vwap * vwap)) });
  }
  return out;
}

// src/lib/quant-core/wyckoffEvidence.ts
var WYCKOFF_EVIDENCE = {
  avgWindow: 20,
  /** Spring/UT: KL ≥ x × TB20 hoặc thủng ≥ y ATR -> #1 (cao trào cung / cầu quá lớn). */
  climaxVol: 2,
  deepATR: 1.2,
  /** Spring #3: KL < x × TB20 và thủng ≤ y ATR. */
  quietVol: 1,
  shallowATR: 0.5,
  /** Test của Spring: nhịp lùi về trong N nến sau xác nhận (≥ 2 nến sau), đáy không thủng đáy Spring, về gần vùng Spring, KL < TB20 và < x × KL Spring. */
  testBars: 10,
  testVolVsSpring: 0.7,
  testNearATR: 1,
  /** Đỉnh/đáy dao động: fractal k nến mỗi bên (xác nhận sau k nến). */
  pivotK: 3,
  /** JAC: nến vượt Creek với biên độ ≥ x × TB20 biên độ và KL ≥ y × TB20. */
  jacSpread: 1.2,
  jacVol: 1.5,
  /** BUEC: trong N nến sau JAC, lùi về ≤ Creek + x ATR, KL < TB20, đóng cửa vẫn ≥ Creek − x ATR. */
  buecBars: 15,
  buecATR: 0.5
};
var WYCKOFF_EVIDENCE_NOTE = "Ch\u1EC9 hi\u1EC3n th\u1ECB, ch\u01B0a t\xEDnh v\xE0o pha. Ki\u1EC3m \u0111\u1ECBnh 225 m\xE3 (10/2024\u201310/2026): ch\u01B0a b\u1EB1ng ch\u1EE9ng n\xE0o \u0111\u1EA1t ti\xEAu ch\xED \u0111\u1EB7t tr\u01B0\u1EDBc; '\u0111\u1EB7c \u0111i\u1EC3m range' trong m\u1EABu c\xF2n cho k\u1EBFt qu\u1EA3 NG\u01AF\u1EE2C s\xE1ch (nghi\xEAng t\xEDch lu\u1EF9 k\xE9m h\u01A1n nghi\xEAng ph\xE2n ph\u1ED1i). Ng\u01B0\u1EE1ng l\xE0 gi\xE1 tr\u1ECB kh\u1EDFi \u0111i\u1EC3m, ch\u01B0a hi\u1EC7u ch\u1EC9nh cho VN.";
var LINE_POINTS = 4;
var avgBefore = (xs, i, w) => {
  let s = 0, c = 0;
  for (let j = Math.max(0, i - w); j < i; j++) {
    s += xs[j];
    c++;
  }
  return c ? s / c : 0;
};
function classifySpringBar(bars, k, ci, level, side, atr, forcedKind) {
  const E = WYCKOFF_EVIDENCE;
  const A = atr ?? atrSeries(bars, 14);
  const vols = bars.map((b) => b.volume);
  const av = avgBefore(vols, k, E.avgWindow) || 1;
  const a = A[k] || 1;
  const extreme = side === "spring" ? bars[k].low : bars[k].high;
  const depthATR = Math.abs(level - extreme) / a;
  const volRatio = bars[k].volume / av;
  const kind = forcedKind ?? (volRatio >= E.climaxVol || depthATR >= E.deepATR ? 1 : volRatio < E.quietVol && depthATR <= E.shallowATR ? 3 : 2);
  let test = null;
  if (kind !== 3) {
    for (let j = ci + 1; j <= Math.min(bars.length - 1, ci + E.testBars); j++) {
      const b = bars[j];
      const broke = side === "spring" ? b.close < extreme : b.close > extreme;
      if (broke) break;
      const retracing = j >= ci + 2 && (side === "spring" ? b.low < bars[j - 1].low : b.high > bars[j - 1].high);
      if (!retracing) continue;
      const near = side === "spring" ? b.low <= level + E.testNearATR * (A[j] || a) : b.high >= level - E.testNearATR * (A[j] || a);
      const holds = side === "spring" ? b.low >= extreme : b.high <= extreme;
      if (near && holds && b.volume < avgBefore(vols, j, E.avgWindow) && b.volume < E.testVolVsSpring * bars[k].volume) {
        test = { index: j, date: b.date, price: side === "spring" ? b.low : b.high };
        break;
      }
    }
  }
  const name = side === "spring" ? "Spring" : "UT";
  const actionable = kind === 3 || test != null;
  const note = kind === 1 ? `${name} #1: KL ${volRatio.toFixed(1)}\xD7 TB20, ${side === "spring" ? "th\u1EE7ng" : "v\u01B0\u1EE3t"} ${depthATR.toFixed(1)} ATR \u2014 ${side === "spring" ? "cung" : "c\u1EA7u"} c\xF2n l\u1EDBn, KH\xD4NG ${side === "spring" ? "mua" : "b\xE1n"} ngay; ${test ? `\u0111\xE3 c\xF3 Test ${test.date}` : "ch\u1EDD Test KL th\u1EA5p"}.` : kind === 2 ? `${name} #2: KL ${volRatio.toFixed(1)}\xD7 TB20 \u2014 c\u1EA7n Test KL th\u1EA5p${test ? `: \u0111\xE3 c\xF3 ${test.date}` : " (ch\u01B0a c\xF3)"}.` : `${name} #3: ${side === "spring" ? "th\u1EE7ng" : "v\u01B0\u1EE3t"} n\xF4ng ${depthATR.toFixed(1)} ATR, KL ${volRatio.toFixed(1)}\xD7 TB20 \u2014 ${side === "spring" ? "cung \u0111\xE3 c\u1EA1n" : "c\u1EA7u \u0111\xE3 c\u1EA1n"}.`;
  return { side, kind, index: k, date: bars[k].date, price: extreme, confirmedIndex: ci, volRatio, depthATR, test, actionable, knownIndex: test ? test.index : ci, note };
}
function nextBarConfirmation(bars, k, dir, event) {
  const E = WYCKOFF_EVIDENCE;
  const base = { event, dir, index: k, date: bars[k].date };
  const j = k + 1;
  if (j >= bars.length) return { ...base, verdict: "pending", at: null, reason: "Ch\u01B0a c\xF3 n\u1EBFn k\u1EBF ti\u1EBFp." };
  const b = bars[j], p = bars[k];
  const spreads2 = bars.map((x) => x.high - x.low);
  const vols = bars.map((x) => x.volume);
  const avS = avgBefore(spreads2, j, E.avgWindow) || 1;
  const avV = avgBefore(vols, j, E.avgWindow) || 1;
  const spread = b.high - b.low;
  const pos = spread > 0 ? (b.close - b.low) / spread : 0.5;
  const wide = spread >= 1.2 * avS, narrow = spread <= 0.8 * avS;
  const hiVol = b.volume >= 1.2 * avV, loVol = b.volume < avV;
  const midK = (p.high + p.low) / 2;
  const at = { index: j, date: b.date };
  const up = dir === 1;
  const fav = up ? pos : 1 - pos;
  const followed = up ? b.close >= p.close : b.close <= p.close;
  const against = up ? b.close < midK : b.close > midK;
  if (wide && hiVol && against && fav < 0.4) return { ...base, verdict: "rejected", at, reason: up ? "N\u1EBFn sau gi\u1EA3m bi\xEAn r\u1ED9ng, KL l\u1EDBn, \u0111\xF3ng d\u01B0\u1EDBi gi\u1EEFa n\u1EBFn SOS \u2014 cung xu\u1EA5t hi\u1EC7n." : "N\u1EBFn sau t\u0103ng bi\xEAn r\u1ED9ng, KL l\u1EDBn, \u0111\xF3ng tr\xEAn gi\u1EEFa n\u1EBFn SOW \u2014 c\u1EA7u xu\u1EA5t hi\u1EC7n." };
  if (hiVol && narrow && fav < 0.5) return { ...base, verdict: "rejected", at, reason: "KL l\u1EDBn nh\u01B0ng bi\xEAn h\u1EB9p, \u0111\xF3ng c\u1EEDa ng\u01B0\u1EE3c h\u01B0\u1EDBng \u2014 n\u1ED7 l\u1EF1c kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3." };
  if (followed && fav >= 0.5) return { ...base, verdict: "confirmed", at, reason: up ? "N\u1EBFn sau t\u0103ng ti\u1EBFp, \u0111\xF3ng c\u1EEDa n\u1EEDa tr\xEAn." : "N\u1EBFn sau gi\u1EA3m ti\u1EBFp, \u0111\xF3ng c\u1EEDa n\u1EEDa d\u01B0\u1EDBi." };
  if (narrow && loVol && !against) return { ...base, verdict: "confirmed", at, reason: up ? "N\u1EBFn sau bi\xEAn h\u1EB9p, KL th\u1EA5p, gi\u1EEF tr\xEAn gi\u1EEFa n\u1EBFn SOS \u2014 kh\xF4ng c\xF3 cung (No Supply)." : "N\u1EBFn sau bi\xEAn h\u1EB9p, KL th\u1EA5p, gi\u1EEF d\u01B0\u1EDBi gi\u1EEFa n\u1EBFn SOW \u2014 kh\xF4ng c\xF3 c\u1EA7u (No Demand)." };
  return { ...base, verdict: "unclear", at, reason: "N\u1EBFn sau kh\xF4ng r\xF5 r\xE0ng \u2014 ch\u1EDD th\xEAm." };
}
function pivots(bars, from, to, side, k = WYCKOFF_EVIDENCE.pivotK) {
  const out = [];
  for (let p = Math.max(from, k); p <= Math.min(to, bars.length - 1 - k); p++) {
    const v = side === "high" ? bars[p].high : bars[p].low;
    let ok = true;
    for (let d = 1; d <= k && ok; d++) {
      const l = side === "high" ? bars[p - d].high : bars[p - d].low;
      const r = side === "high" ? bars[p + d].high : bars[p + d].low;
      ok = side === "high" ? v >= l && v > r : v <= l && v < r;
    }
    if (ok) out.push({ index: p, ci: p + k, price: v });
  }
  return out;
}
function levelAt(pts, x, dir) {
  const known = pts.filter((p) => p.ci < x);
  if (known.length < 2 || x <= known[known.length - 1].index) return null;
  const a = known[known.length - 2].price, b = known[known.length - 1].price;
  return dir === 1 ? Math.max(a, b) : Math.min(a, b);
}
var BREAK_HORIZON = 40;
function lineBreak(bars, range, pts, dir, atr) {
  const E = WYCKOFF_EVIDENCE;
  const spreads2 = bars.map((x) => x.high - x.low);
  const vols = bars.map((x) => x.volume);
  const n = bars.length;
  const mid = (range.high + range.low) / 2;
  let weak = null;
  for (let x = range.start + 2 * E.pivotK + 1; x < Math.min(n, range.end + BREAK_HORIZON + 1); x++) {
    const L = levelAt(pts, x, dir);
    if (L == null) continue;
    const crossed = dir === 1 ? bars[x].close > L && bars[x - 1].close <= L : bars[x].close < L && bars[x - 1].close >= L;
    if (!crossed) continue;
    const volRatio = bars[x].volume / (avgBefore(vols, x, E.avgWindow) || 1);
    const spreadRatio = spreads2[x] / (avgBefore(spreads2, x, E.avgWindow) || 1);
    const strong = volRatio >= E.jacVol && spreadRatio >= E.jacSpread;
    if (!strong) {
      if (!weak) weak = {
        kind: dir === 1 ? "creek-weak" : "ice-weak",
        level: L,
        index: x,
        date: bars[x].date,
        price: bars[x].close,
        volRatio,
        spreadRatio,
        backup: null,
        failed: null,
        knownIndex: x,
        note: `${dir === 1 ? "V\u01B0\u1EE3t Creek" : "Th\u1EE7ng ICE"} nh\u01B0ng thi\u1EBFu bi\xEAn \u0111\u1ED9/KL (${spreadRatio.toFixed(1)}\xD7 / ${volRatio.toFixed(1)}\xD7 TB20) \u2014 theo t\xE0i li\u1EC7u KH\xD4NG ph\u1EA3i ${dir === 1 ? "JAC" : "SOW"}.`
      };
      continue;
    }
    let backup = null, failed = null;
    for (let j = x + 1; j <= Math.min(n - 1, x + E.buecBars); j++) {
      const b = bars[j], a = atr[j] || 1;
      if (dir === 1 ? b.close < mid : b.close > mid) {
        failed = { index: j, date: b.date, price: b.close };
        break;
      }
      const touch = dir === 1 ? b.low <= L + E.buecATR * a && b.close >= L - E.buecATR * a : b.high >= L - E.buecATR * a && b.close <= L + E.buecATR * a;
      if (touch && b.volume < (avgBefore(vols, j, E.avgWindow) || Infinity)) {
        backup = { index: j, date: b.date, price: dir === 1 ? b.low : b.high };
        break;
      }
    }
    const note = `${dir === 1 ? "JAC \u2014 v\u01B0\u1EE3t Creek" : "Ph\xE1 ICE"} (${Math.round(L).toLocaleString("vi-VN")}) v\u1EDBi bi\xEAn \u0111\u1ED9 ${spreadRatio.toFixed(1)}\xD7 v\xE0 KL ${volRatio.toFixed(1)}\xD7 TB20` + (backup ? `; ${dir === 1 ? "BUEC" : "h\u1ED3i v\u1EC1 ICE"} KL th\u1EA5p ${backup.date}` : "") + (failed ? `; th\u1EA5t b\u1EA1i \u2014 \u0111\xF3ng c\u1EEDa ${dir === 1 ? "d\u01B0\u1EDBi" : "tr\xEAn"} gi\u1EEFa range ${failed.date}` : "") + ".";
    return { kind: dir === 1 ? "JAC" : "ICE-break", level: L, index: x, date: bars[x].date, price: bars[x].close, volRatio, spreadRatio, backup, failed, knownIndex: x, note };
  }
  return weak;
}
function rangeLean(bars, range) {
  const len = range.end - range.start + 1;
  if (len < 20) return null;
  const seg = bars.slice(range.start, range.end + 1);
  const half = Math.floor(len / 2);
  const f = [];
  let li = 0, hi = 0;
  seg.forEach((b, i) => {
    if (b.low < seg[li].low) li = i;
    if (b.high > seg[hi].high) hi = i;
  });
  const lp = li / (len - 1), hp = hi / (len - 1);
  f.push({
    key: "extremes",
    label: "V\u1ECB tr\xED \u0111\xE1y / \u0111\u1EC9nh th\u1EA5p nh\u1EA5t \u2013 cao nh\u1EA5t trong range",
    value: `\u0111\xE1y \u1EDF ${Math.round(lp * 100)}%, \u0111\u1EC9nh \u1EDF ${Math.round(hp * 100)}% th\u1EDDi gian`,
    vote: lp <= 0.5 && hp > 0.5 ? 1 : hp <= 0.5 && lp > 0.5 ? -1 : 0
  });
  const lows = pivots(bars, range.start + half, range.end, "low", 2).filter((p) => p.ci <= range.end);
  const highs = pivots(bars, range.start + half, range.end, "high", 2).filter((p) => p.ci <= range.end);
  const slope = (ps) => ps.length >= 2 ? Math.sign(ps[ps.length - 1].price - ps[0].price) : 0;
  const sl = slope(lows), sh = slope(highs);
  f.push({
    key: "swings",
    label: "\u0110\xE1y / \u0111\u1EC9nh dao \u0111\u1ED9ng \u1EDF n\u1EEDa sau",
    value: `\u0111\xE1y ${sl > 0 ? "n\xE2ng d\u1EA7n" : sl < 0 ? "h\u1EA1 d\u1EA7n" : "\u2014"}, \u0111\u1EC9nh ${sh > 0 ? "n\xE2ng d\u1EA7n" : sh < 0 ? "h\u1EA1 d\u1EA7n" : "\u2014"}`,
    vote: sl > 0 && sh >= 0 ? 1 : sh < 0 && sl <= 0 ? -1 : 0
  });
  let dv = 0, uv = 0, dn = 0, un = 0;
  for (const b of seg.slice(half)) {
    if (b.close < b.open) {
      dv += b.volume;
      dn++;
    } else if (b.close > b.open) {
      uv += b.volume;
      un++;
    }
  }
  const ratio = dn && un && uv > 0 ? dv / dn / (uv / un) : null;
  f.push({
    key: "supply",
    label: "KL TB n\u1EBFn gi\u1EA3m \xF7 n\u1EBFn t\u0103ng \u1EDF n\u1EEDa sau",
    value: ratio == null ? "\u2014" : `${ratio.toFixed(2)}\xD7`,
    vote: ratio == null ? 0 : ratio < 0.85 ? 1 : ratio > 1.15 ? -1 : 0
  });
  const avgSpread = (xs) => xs.reduce((s, b) => s + (b.high - b.low), 0) / Math.max(1, xs.length);
  const vr = avgSpread(seg.slice(half)) / (avgSpread(seg.slice(0, half)) || 1);
  f.push({ key: "volatility", label: "Bi\xEAn \u0111\u1ED9 TB n\u1EEDa sau \xF7 n\u1EEDa \u0111\u1EA7u", value: `${vr.toFixed(2)}\xD7`, vote: vr < 0.85 ? 1 : vr > 1.15 ? -1 : 0 });
  const score = f.reduce((s, x) => s + x.vote, 0);
  return { score, label: score >= 2 ? "t\xEDch lu\u1EF9" : score <= -2 ? "ph\xE2n ph\u1ED1i" : "ch\u01B0a r\xF5", features: f };
}
var V3_KIND = { SPRING_3: 3, UT_3: 3, SPRING_2: 2, UT_2: 2, SHAKEOUT: 1, UTAD: 1 };
function wyckoffEvidence(bars, range, events) {
  const atr = atrSeries(bars, 14);
  const springs = [];
  const confirmations = [];
  for (const e of events) {
    if ((e.event === "Spring" || e.event === "UT" || e.event === "UTAD") && e.confirmedIndex != null) {
      const forced = e.label ? V3_KIND[e.label] : void 0;
      springs.push(classifySpringBar(bars, e.index, e.confirmedIndex, e.event === "Spring" ? range.low : range.high, e.event === "Spring" ? "spring" : "ut", atr, forced));
    }
    if (e.event === "SOS" || e.event === "SOW") {
      const k = Math.max(e.index, e.confirmedIndex ?? e.index);
      confirmations.push(nextBarConfirmation(bars, k, e.event === "SOS" ? 1 : -1, e.event));
    }
  }
  const mid = (range.high + range.low) / 2;
  const hp = pivots(bars, range.start, range.end, "high").filter((p) => p.price >= mid);
  const lp = pivots(bars, range.start, range.end, "low").filter((p) => p.price <= mid);
  const breaks = [];
  const up = hp.length >= 2 ? lineBreak(bars, range, hp, 1, atr) : null;
  const dn = lp.length >= 2 ? lineBreak(bars, range, lp, -1, atr) : null;
  const toLine = (ps, br) => {
    const used = (br ? ps.filter((p) => p.ci < br.index) : ps).slice(-LINE_POINTS);
    if (used.length < 2) return null;
    const points = used.map((p) => ({ index: p.index, date: bars[p.index].date, price: p.price }));
    if (br) points.push({ index: br.index, date: br.date, price: br.level });
    return { points };
  };
  if (up) breaks.push(up);
  if (dn) breaks.push(dn);
  breaks.sort((a, b) => a.index - b.index);
  return {
    springs,
    confirmations,
    creek: toLine(hp, up),
    ice: toLine(lp, dn),
    breaks,
    lean: rangeLean(bars, range),
    note: WYCKOFF_EVIDENCE_NOTE
  };
}

// src/lib/ta-command-center/detectors/wyckoffDetector.ts
var RANGE_LOOKBACK = 50;
var RANGE_MAX_WIDTH = 0.15;
var RANGE_MIN_BARS = 30;
var WYCKOFF_PHASE_LABEL = {
  accumulation: "Accumulation",
  spring: "Spring (Phase C)",
  test: "Test (Phase C)",
  markup: "Markup",
  distribution: "Distribution",
  decline: "Markdown",
  undetermined: "Ch\u01B0a x\xE1c \u0111\u1ECBnh"
};
function averageVolume(bars, n) {
  const recent = bars.slice(-n);
  return recent.length === 0 ? 0 : recent.reduce((sum, b) => sum + b.volume, 0) / recent.length;
}
function findTradingRange(bars) {
  if (bars.length < RANGE_MIN_BARS) return null;
  const windowSize = Math.min(RANGE_LOOKBACK, Math.floor(bars.length / 3));
  const searchStart = Math.floor(bars.length * 0.4);
  const scan = (from) => {
    let best = null;
    for (let s = from; s < bars.length - windowSize; s += 5) {
      const window = bars.slice(s, s + windowSize);
      const high = Math.max(...window.map((x) => x.high));
      const low = Math.min(...window.map((x) => x.low));
      const width = (high - low) / low;
      if (width > RANGE_MAX_WIDTH) continue;
      if (!best || s + windowSize > best.endIdx) {
        best = { high, low, startIdx: s, endIdx: s + windowSize - 1, width };
      }
    }
    return best;
  };
  const recent = scan(searchStart);
  if (recent) return { high: recent.high, low: recent.low, startIdx: recent.startIdx, endIdx: recent.endIdx };
  const fallback = scan(0);
  return fallback ? { high: fallback.high, low: fallback.low, startIdx: fallback.startIdx, endIdx: fallback.endIdx } : null;
}
function isSpike(volume, avg) {
  return volume > avg * 2;
}
function isLow(volume, avg) {
  return volume < avg * 0.6;
}
function classifyWyckoffPhase(bars) {
  const base = {
    phase: "undetermined",
    confidenceScore: 0,
    rangeHigh: null,
    rangeLow: null,
    rangeStartDate: null,
    rangeEndDate: null,
    events: [],
    springDate: null,
    testDate: null,
    markupDate: null,
    declineDate: null,
    dataQuality: "ESTIMATED"
  };
  if (bars.length < RANGE_MIN_BARS) return base;
  const avgVol20 = averageVolume(bars, 20);
  const range = findTradingRange(bars);
  if (!range) return base;
  base.rangeHigh = range.high;
  base.rangeLow = range.low;
  base.rangeStartDate = bars[range.startIdx].date;
  base.rangeEndDate = bars[range.endIdx].date;
  const rangeBars = bars.slice(range.startIdx, range.endIdx + 1);
  const events = [];
  let idxPS = -1, idxSC = -1, idxSpring = -1, idxST = -1, idxSOS = -1, idxLPS = -1;
  const lowPoint = Math.min(...rangeBars.slice(0, 10).map((b) => b.low));
  for (let i = 0; i < rangeBars.length; i++) {
    const b = rangeBars[i];
    if (idxPS === -1 && b.volume > avgVol20 * 1.5 && b.close > b.open) {
      idxPS = i;
      events.push({ event: "PS", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.6 });
    }
    if (idxSC === -1 && isSpike(b.volume, avgVol20) && b.close < b.open * 0.97) {
      idxSC = i;
      events.push({ event: "SC", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.9 });
    }
    if (idxSC >= 0 && idxSpring === -1 && b.low < lowPoint * 1.01 && b.low > lowPoint * 0.98 && isLow(b.volume, avgVol20)) {
      idxSpring = i;
      events.push({ event: "Spring", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.8 });
      base.springDate = b.date;
    }
    if (idxSC >= 0 && idxST === -1 && Math.abs(b.low - lowPoint) / lowPoint <= 0.03 && i > idxSC + 2) {
      idxST = i;
      events.push({ event: "ST", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.7 });
      base.testDate = b.date;
    }
    if (i >= (idxSpring >= 0 ? idxSpring + 1 : 0) && idxSOS === -1 && b.close > range.high * 0.98 && b.volume > avgVol20 * 1.3) {
      idxSOS = i;
      events.push({ event: "SOS", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.85 });
      base.markupDate = b.date;
    }
    if (idxSOS >= 0 && idxLPS === -1 && b.low > range.low * 1.02 && b.close < b.open && b.volume < avgVol20) {
      idxLPS = i;
      events.push({ event: "LPS", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.75 });
    }
  }
  let idxPSY = -1, idxBC = -1, idxUT = -1, idxSOW = -1, idxLPSY = -1;
  const highPoint = Math.max(...rangeBars.slice(0, 10).map((b) => b.high));
  for (let i = 0; i < rangeBars.length; i++) {
    const b = rangeBars[i];
    if (idxPSY === -1 && b.volume > avgVol20 * 1.5 && b.close < b.open) {
      idxPSY = i;
      events.push({ event: "PSY", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.6 });
    }
    if (idxBC === -1 && isSpike(b.volume, avgVol20) && b.close > b.open * 1.03) {
      idxBC = i;
      events.push({ event: "BC", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.9 });
    }
    if (idxBC >= 0 && idxUT === -1 && b.high > highPoint * 0.99 && b.high < highPoint * 1.02 && !isLow(b.volume, avgVol20)) {
      idxUT = i;
      events.push({ event: "UT", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.8 });
    }
    if (i >= (idxUT >= 0 ? idxUT + 1 : 0) && idxSOW === -1 && b.close < range.low * 1.02 && b.volume > avgVol20 * 1.3) {
      idxSOW = i;
      events.push({ event: "SOW", date: b.date, index: range.startIdx + i, price: b.low, volume: b.volume, strength: 0.85 });
      base.declineDate = b.date;
    }
    if (idxSOW >= 0 && idxLPSY === -1 && b.high < range.high * 0.98 && b.close > b.open && b.volume < avgVol20) {
      idxLPSY = i;
      events.push({ event: "LPSY", date: b.date, index: range.startIdx + i, price: b.high, volume: b.volume, strength: 0.75 });
    }
  }
  const accumScore = [idxPS, idxSC, idxSpring, idxST, idxSOS, idxLPS].filter((x) => x >= 0).length;
  const distScore = [idxPSY, idxBC, idxUT, idxSOW, idxLPSY].filter((x) => x >= 0).length;
  const accumConfidence = Math.round(accumScore / 6 * 100);
  const distConfidence = Math.round(distScore / 5 * 100);
  if (idxSOS !== -1 && idxLPS !== -1) {
    base.phase = "markup";
    base.confidenceScore = accumConfidence;
    base.phaseA = "PS/SC/AR";
    base.phaseB = "Spring/ST";
    base.phaseD = "SOS/LPS";
  } else if (idxSOW !== -1 && idxLPSY !== -1) {
    base.phase = "decline";
    base.confidenceScore = distConfidence;
    base.phaseA = "PSY/BC/AR";
    base.phaseB = "UT";
    base.phaseD = "SOW/LPSY";
  } else if (idxSOS !== -1) {
    base.phase = "markup";
    base.confidenceScore = accumConfidence;
    base.phaseA = "Accumulation";
    base.phaseD = "SOS breakout";
  } else if (idxSOW !== -1) {
    base.phase = "decline";
    base.confidenceScore = distConfidence;
    base.phaseA = "Distribution";
    base.phaseD = "SOW breakdown";
  } else if (idxSpring !== -1 && idxST !== -1) {
    base.phase = "test";
    base.confidenceScore = accumConfidence;
    base.phaseA = "Accumulation";
    base.phaseC = "Spring/ST completed";
  } else if (idxSpring !== -1) {
    base.phase = "spring";
    base.confidenceScore = accumConfidence;
    base.phaseC = "Spring detected";
  } else if (distScore > accumScore && distScore >= 2) {
    base.phase = "distribution";
    base.confidenceScore = distConfidence;
    base.phaseA = "PSY/BC detected";
  } else if (idxSC !== -1) {
    base.phase = "accumulation";
    base.confidenceScore = accumConfidence;
    base.phaseA = "PS/SC completed";
    base.phaseB = "AR in progress";
  } else {
    base.phase = "undetermined";
    base.confidenceScore = 0;
  }
  base.events = events;
  return base;
}

// src/lib/quant-core/wyckoff.ts
var WYCKOFF_STALE = { minBars: 20, rangeFactor: 1, awayHeights: 1 };
var WYCKOFF_RANGE = { maxWidthATR: 8, minBars: 30, maxBars: 80, recentBars: 120 };
function findTradingRange2(bars) {
  const n = bars.length;
  if (n < WYCKOFF_RANGE.minBars + 20) return null;
  for (let len = WYCKOFF_RANGE.maxBars; len >= WYCKOFF_RANGE.minBars; len -= 5) {
    for (let end = n - 1; end >= Math.max(WYCKOFF_RANGE.minBars, n - 1 - WYCKOFF_RANGE.recentBars); end--) {
      const start = end - len + 1;
      if (start < 20) continue;
      let hh = -Infinity;
      let ll = Infinity;
      const trs = [];
      for (let k = start; k <= end; k++) {
        hh = Math.max(hh, bars[k].high);
        ll = Math.min(ll, bars[k].low);
        trs.push(Math.max(bars[k].high - bars[k].low, Math.abs(bars[k].high - bars[k - 1].close), Math.abs(bars[k].low - bars[k - 1].close)));
      }
      const unit = [...trs].sort((x, y) => x - y)[Math.floor(trs.length / 2)];
      if (!(unit > 0) || (hh - ll) / unit > WYCKOFF_RANGE.maxWidthATR) continue;
      let displaced = false;
      for (let k = start; k <= end && !displaced; k++) if (Math.abs(bars[k].close - bars[k - 1].close) > 3 * unit) displaced = true;
      if (displaced) continue;
      let s = start;
      while (s - 1 >= 20 && bars[s - 1].high <= hh + 0.5 * unit && bars[s - 1].low >= ll - 0.5 * unit) s--;
      return { start: s, end, high: hh, low: ll };
    }
  }
  return null;
}
var avgVolBefore = (bars, i, w = 20) => {
  let s = 0;
  let c = 0;
  for (let j = Math.max(0, i - w); j < i; j++) {
    s += bars[j].volume;
    c++;
  }
  return c ? s / c : 0;
};
function classifyWyckoffV2(bars) {
  const base = { ...classifyWyckoffPhase([]), engine: "v2", asOf: bars.length ? bars[bars.length - 1].date : null };
  if (bars.length < WYCKOFF_RANGE.minBars + 20) return { ...base, status: "insufficient", statusReason: `C\u1EA7n \u2265 ${WYCKOFF_RANGE.minBars + 20} n\u1EBFn, c\xF3 ${bars.length}.` };
  const atr = atrSeries(bars, 14);
  const range = findTradingRange2(bars);
  if (!range) return { ...base, status: "insufficient", statusReason: "Kh\xF4ng t\xECm th\u1EA5y trading range (bi\xEAn \u2264 8\xD7 ATR, 30\u201380 n\u1EBFn, trong 120 n\u1EBFn g\u1EA7n nh\u1EA5t)." };
  const n = bars.length;
  const res = {
    ...base,
    rangeHigh: range.high,
    rangeLow: range.low,
    rangeStartDate: bars[range.start].date,
    rangeEndDate: bars[range.end].date
  };
  const ref = bars[Math.max(0, range.start - 20)].close;
  const priorDown = bars[range.start].close < ref * 0.97;
  const priorUp = bars[range.start].close > ref * 1.03;
  const events = [];
  const push = (event, k, price, strength) => {
    events.push({ event, date: bars[k].date, index: k, price, volume: bars[k].volume, strength });
    return k;
  };
  const replace = (event, prev, k, price, strength) => {
    const at = prev >= 0 ? events.findIndex((e) => e.event === event && e.index === prev) : -1;
    if (at >= 0) events.splice(at, 1);
    return push(event, k, price, strength);
  };
  const a = (k) => atr[k] || 1;
  const backInsideAt = (k, side) => {
    for (let j = k; j <= Math.min(n - 1, k + 3); j++) {
      if (side === "low" ? bars[j].close > range.low : bars[j].close < range.high) return j;
    }
    return -1;
  };
  const closesBackInside = (k, side) => backInsideAt(k, side) >= 0;
  let ps = -1, sc = -1, st = -1, spring = -1, sos = -1, lps = -1;
  for (let k = Math.max(1, range.start - 10); k < n; k++) {
    const b = bars[k];
    const av = avgVolBefore(bars, k);
    if (priorDown && ps < 0 && k <= range.start + 5 && b.volume > 1.5 * av && b.close > b.open) ps = push("PS", k, b.low, 0.6);
    if (priorDown && sc < 0 && k <= range.start + 10 && b.volume > 2 * av && b.close < bars[k - 1].close - a(k)) sc = push("SC", k, b.low, 0.9);
    if (sc >= 0 && st < 0 && k > sc + 2 && k <= range.end && Math.abs(b.low - bars[sc].low) <= a(k) && b.volume < bars[sc].volume) st = push("ST", k, b.low, 0.7);
    if (k > spring + 3 && k >= range.start + 5 && b.low < range.low && b.low >= range.low - 1.5 * a(k) && closesBackInside(k, "low")) spring = replace("Spring", spring, k, b.low, 0.8);
    if (k > sos + 5 && k > range.start + 5 && b.close > range.high + 0.25 * a(k) && bars[k - 1].close <= range.high + 0.25 * a(k) && b.volume >= 1.3 * av) sos = replace("SOS", sos, k, b.high, 0.85);
    if (sos >= 0 && lps < sos && k > sos && b.low >= range.high - 0.5 * a(k) && b.close < b.open && b.volume < av) lps = lps >= 0 ? replace("LPS", lps, k, b.low, 0.75) : push("LPS", k, b.low, 0.75);
  }
  let psy = -1, bc = -1, ut = -1, sow = -1, lpsy = -1;
  for (let k = Math.max(1, range.start - 10); k < n; k++) {
    const b = bars[k];
    const av = avgVolBefore(bars, k);
    if (priorUp && psy < 0 && k <= range.start + 5 && b.volume > 1.5 * av && b.close < b.open) psy = push("PSY", k, b.high, 0.6);
    if (priorUp && bc < 0 && k <= range.start + 10 && b.volume > 2 * av && b.close > bars[k - 1].close + a(k)) bc = push("BC", k, b.high, 0.9);
    if (k > ut + 3 && k >= range.start + 5 && b.high > range.high && b.high <= range.high + 1.5 * a(k) && closesBackInside(k, "high")) ut = replace("UT", ut, k, b.high, 0.8);
    if (k > sow + 5 && k > range.start + 5 && b.close < range.low - 0.25 * a(k) && b.volume >= 1.3 * av && bars[k - 1].close >= range.low - 0.25 * a(k)) sow = replace("SOW", sow, k, b.low, 0.85);
    if (sow >= 0 && lpsy < sow && k > sow && b.high <= range.low + 0.5 * a(k) && b.close > b.open && b.volume < av) lpsy = lpsy >= 0 ? replace("LPSY", lpsy, k, b.high, 0.75) : push("LPSY", k, b.high, 0.75);
  }
  const acc = [ps, sc, st, spring, sos, lps].filter((x) => x >= 0).length;
  const dis = [psy, bc, ut, sow, lpsy].filter((x) => x >= 0).length;
  const accPct = Math.round(acc / 6 * 100);
  const disPct = Math.round(dis / 5 * 100);
  res.springDate = spring >= 0 ? bars[spring].date : null;
  res.testDate = st >= 0 ? bars[st].date : null;
  res.markupDate = sos >= 0 ? bars[sos].date : null;
  res.declineDate = sow >= 0 ? bars[sow].date : null;
  const decisive = [
    { k: sos, phase: "markup" },
    { k: sow, phase: "decline" },
    { k: spring, phase: "spring" },
    { k: ut, phase: "distribution" }
  ].filter((x) => x.k >= 0).sort((x, y) => y.k - x.k)[0];
  if (decisive?.phase === "markup") {
    res.phase = "markup";
    res.confidenceScore = accPct;
    res.phaseD = lps > sos ? "SOS/LPS" : "SOS breakout";
  } else if (decisive?.phase === "decline") {
    res.phase = "decline";
    res.confidenceScore = disPct;
    res.phaseD = lpsy > sow ? "SOW/LPSY" : "SOW breakdown";
  } else if (decisive?.phase === "spring") {
    res.phase = st > spring ? "test" : "spring";
    res.confidenceScore = accPct;
    res.phaseC = sow >= 0 && sow < spring ? "Spring sau SOW (ph\xE1 v\u1EE1 th\u1EA5t b\u1EA1i)" : "Spring";
  } else if (decisive?.phase === "distribution") {
    res.phase = "distribution";
    res.confidenceScore = disPct;
    res.phaseC = sos >= 0 && sos < ut ? "UT sau SOS (ph\xE1 v\u1EE1 th\u1EA5t b\u1EA1i)" : "UT";
  } else if (dis > acc && dis >= 2) {
    res.phase = "distribution";
    res.confidenceScore = disPct;
  } else if (acc >= 2 || sc >= 0) {
    res.phase = "accumulation";
    res.confidenceScore = accPct;
  } else if (priorDown) {
    res.phase = "accumulation";
    res.confidenceScore = accPct;
    res.phaseB = "Trading range sau xu h\u01B0\u1EDBng gi\u1EA3m \u2014 ch\u01B0a c\xF3 Spring/SOS";
  } else if (priorUp) {
    res.phase = "distribution";
    res.confidenceScore = disPct;
    res.phaseB = "Trading range sau xu h\u01B0\u1EDBng t\u0103ng \u2014 ch\u01B0a c\xF3 UT/SOW";
  } else {
    res.phase = "undetermined";
    res.confidenceScore = 0;
  }
  const last = bars[n - 1].close;
  res.phaseE = last > range.high ? "Gi\xE1 hi\u1EC7n TR\xCAN range" : last < range.low ? "Gi\xE1 hi\u1EC7n D\u01AF\u1EDAI range \u2014 ch\u01B0a c\xF3 SOW \u0111\u1EE7 effort x\xE1c nh\u1EADn" : "Gi\xE1 hi\u1EC7n TRONG range";
  if (last < range.low && sow >= 0 && sow === Math.max(sos, sow, spring, ut)) res.phaseE = "Gi\xE1 hi\u1EC7n D\u01AF\u1EDAI range (sau SOW)";
  for (const e of events) {
    const ci = e.event === "Spring" ? backInsideAt(e.index, "low") : e.event === "UT" ? backInsideAt(e.index, "high") : e.index;
    e.confirmedIndex = ci >= 0 ? ci : null;
    e.confirmedDate = ci >= 0 ? bars[ci].date : null;
  }
  res.events = events.sort((x, y) => x.index - y.index);
  res.evidence = wyckoffEvidence(bars, range, res.events);
  for (const sp of res.evidence.springs) {
    const e = res.events.find((x) => x.index === sp.index && (x.event === "Spring" || x.event === "UT"));
    if (e) e.label = `${e.event}#${sp.kind}`;
  }
  const lastIdx = n - 1;
  const rangeLen = range.end - range.start + 1;
  const limit = Math.max(WYCKOFF_STALE.minBars, Math.round(WYCKOFF_STALE.rangeFactor * rangeLen));
  const height = Math.max(1e-9, range.high - range.low);
  const springCi = spring >= 0 ? backInsideAt(spring, "low") : -1;
  const utCi = ut >= 0 ? backInsideAt(ut, "high") : -1;
  let springBroken = null;
  let utBroken = null;
  if (spring >= 0) {
    for (let j = Math.max(spring + 1, springCi); j <= lastIdx; j++) if (bars[j].close < bars[spring].low) {
      springBroken = j;
      break;
    }
  }
  if (ut >= 0) {
    for (let j = Math.max(ut + 1, utCi); j <= lastIdx; j++) if (bars[j].close > bars[ut].high) {
      utBroken = j;
      break;
    }
  }
  const decisiveIdx = decisive ? decisive.phase === "spring" ? Math.max(decisive.k, springCi) : decisive.phase === "distribution" ? Math.max(decisive.k, utCi) : decisive.k : null;
  const anchor = decisiveIdx ?? range.end;
  const age = lastIdx - anchor;
  const bullish = res.phase === "spring" || res.phase === "test" || res.phase === "markup" || res.phase === "accumulation";
  const bearish = res.phase === "distribution" || res.phase === "decline";
  const awayBelow = last < range.low - WYCKOFF_STALE.awayHeights * height;
  const awayAbove = last > range.high + WYCKOFF_STALE.awayHeights * height;
  const fmt2 = (v) => Math.round(v).toLocaleString("vi-VN");
  let staleReason = null;
  if (res.phase !== "undetermined") {
    if ((res.phase === "spring" || res.phase === "test") && springBroken != null) {
      staleReason = `Spring ${bars[spring].date} \u0111\xE3 b\u1ECB ph\xE1: \u0111\xF3ng c\u1EEDa d\u01B0\u1EDBi \u0111\xE1y Spring (${fmt2(bars[spring].low)}) ng\xE0y ${bars[springBroken].date}.`;
    } else if (res.phase === "distribution" && decisive?.phase === "distribution" && utBroken != null) {
      staleReason = `UT ${bars[ut].date} \u0111\xE3 b\u1ECB ph\xE1: \u0111\xF3ng c\u1EEDa tr\xEAn \u0111\u1EC9nh UT (${fmt2(bars[ut].high)}) ng\xE0y ${bars[utBroken].date}.`;
    } else if (age > limit) {
      staleReason = `S\u1EF1 ki\u1EC7n quy\u1EBFt \u0111\u1ECBnh cu\u1ED1i c\xE1ch \u0111\xE2y ${age} n\u1EBFn, qu\xE1 th\u1EDDi h\u1EA1n hi\u1EC7u l\u1EF1c ${limit} n\u1EBFn (= max(20, \u0111\u1ED9 d\xE0i range ${rangeLen} n\u1EBFn)).`;
    } else if (bullish && awayBelow || bearish && awayAbove) {
      staleReason = `Gi\xE1 hi\u1EC7n \u0111\xE3 r\u1EDDi ${awayBelow ? "xu\u1ED1ng d\u01B0\u1EDBi" : "l\xEAn tr\xEAn"} range qu\xE1 1 l\u1EA7n \u0111\u1ED9 r\u1ED9ng range, ng\u01B0\u1EE3c chi\u1EC1u pha ${WYCKOFF_PHASE_LABEL[res.phase]}.`;
    }
  }
  res.checks = [
    { label: "C\xF3 xu h\u01B0\u1EDBng tr\u01B0\u1EDBc range (gi\u1EA3m \u2192 t\xEDch lu\u1EF9 / t\u0103ng \u2192 ph\xE2n ph\u1ED1i)", ok: priorDown || priorUp },
    { label: "Climax (SC/BC) v\u1EDBi KL \u2265 2\xD7 TB20", ok: sc >= 0 || bc >= 0 },
    { label: "Spring/UT: th\u1EE7ng bi\xEAn \u2264 1,5 ATR r\u1ED3i \u0111\xF3ng c\u1EEDa tr\u1EDF l\u1EA1i trong range", ok: spring >= 0 || ut >= 0 },
    { label: "SOS/SOW: \u0111\xF3ng c\u1EEDa v\u01B0\u1EE3t bi\xEAn \xB1 0,25 ATR v\u1EDBi KL \u2265 1,3\xD7 TB20", ok: sos >= 0 || sow >= 0 },
    { label: `S\u1EF1 ki\u1EC7n quy\u1EBFt \u0111\u1ECBnh c\xF2n hi\u1EC7u l\u1EF1c (\u2264 ${limit} n\u1EBFn, ch\u01B0a b\u1ECB ph\xE1)`, ok: res.phase === "undetermined" ? null : staleReason == null }
  ];
  res.caveats = [
    "Engine v2 t\xECm range theo \u0111\u1ED9 n\xE9n (bi\xEAn \u2264 8\xD7 ATR), kh\xF4ng theo chu\u1ED7i SC \u2192 AR \u2192 ST c\u1EE7a Phase A.",
    "Spring/UT ch\u1EC9 nh\u1EADn ra khi gi\xE1 th\u1EE7ng bi\xEAn c\u1EE7a range \u0111\xE3 ch\u1ECDn \u2014 range c\xF3 th\u1EC3 kh\xE1c range ng\u01B0\u1EDDi ph\xE2n t\xEDch v\u1EBD tay."
  ];
  if (staleReason) {
    res.historical = {
      phase: res.phase,
      wyckoffPhase: null,
      kind: bullish ? "accumulation" : "distribution",
      status: "stale",
      rangeHigh: range.high,
      rangeLow: range.low,
      startDate: bars[range.start].date,
      endDate: bars[range.end].date,
      reason: staleReason
    };
    res.phase = "undetermined";
    res.status = "historical";
    res.statusReason = staleReason;
  } else {
    res.status = res.phase === "undetermined" ? "insufficient" : "active";
    res.statusReason = res.phase === "undetermined" ? "C\xF3 trading range nh\u01B0ng ch\u01B0a \u0111\u1EE7 s\u1EF1 ki\u1EC7n / b\u1ED1i c\u1EA3nh \u0111\u1EC3 x\xE1c \u0111\u1ECBnh pha." : `S\u1EF1 ki\u1EC7n quy\u1EBFt \u0111\u1ECBnh c\xE1ch \u0111\xE2y ${age} n\u1EBFn (hi\u1EC7u l\u1EF1c \u2264 ${limit}).`;
  }
  return res;
}

// src/lib/quant-core/wyckoffV3/wyckoffGet.js
var DEFAULTS = {
  atrN: 14,
  volBase: 50,
  // bối cảnh xu hướng trước đó
  trendLookback: 30,
  trendMinATR: 4,
  trendMinER: 0.25,
  // Phase A
  scVol: 2,
  scChainVol: 2,
  scSpread: 1.3,
  scLowLookback: 20,
  // SC: KLGD đột biến + biên rộng, hoặc chuỗi nến KLGD lớn thân hẹp
  psVol: 1.3,
  psLookback: 25,
  // PS: vài nến KLGD > trung bình
  arMinBars: 2,
  arMaxBars: 10,
  arPullbackFrac: 0.3,
  arMinRiseATR: 1.5,
  // AR: nhịp tăng 2–3 ngày
  stMaxBars: 60,
  stZoneFrac: 0.15,
  stBreakFrac: 0.1,
  stVolRatio: 0.8,
  // Phase B/C
  minBarsB: 12,
  // thủng đáy trước ngưỡng này = SOW trong B, sau ngưỡng = Spring/Shakeout (Phase C)
  falseBreakBars: 3,
  // số nến tối đa để coi là "quay lại ngay"
  breachMaxBars: 4,
  // số nến đóng dưới hỗ trợ tối đa vẫn coi là Spring/Shakeout
  lowVol: 0.8,
  highVol: 1.5,
  // KLGD thấp / lớn hơn trung bình (so với trung bình volBase nến)
  testMaxBars: 25,
  testZoneFrac: 0.25,
  testRallyFrac: 0.35,
  // Test chỉ tính sau khi giá đã hồi ≥ testRallyFrac × độ rộng TR
  // Phase D/E
  sosSpread: 1.3,
  sosVol: 1.2,
  sosHold: 3,
  sosFailFrac: 0.5,
  lpsMaxRetraceFrac: 0.5,
  buaMinBars: 3,
  buaMaxRangeATR: 3,
  // Quản lý lệnh: tài liệu dùng "5–10 pip" (forex). Với cổ phiếu dùng ATR/%.
  stop: { mode: "atr", value: 0.25 },
  // 'atr' | 'pct' | 'abs'
  poeSizes: [50, 30, 20],
  // % vị thế chuẩn cho POE#1, #2, #3 (tài liệu)
  // vùng đi ngang tổng quát (tái tích lũy / tái phân phối, không có SC/BC rõ)
  rangeMinBars: 25,
  rangeER: 0.3,
  rangeMaxATR: 12,
  allowNoVolume: false,
  // [GQ] hết hiệu lực: không có sự kiện xác nhận mới trong staleFactor × độ dài cấu trúc (tối thiểu staleMinBars nến),
  // hoặc giá đóng cửa cách biên TR quá awayHeights × độ rộng TR mà không có SOS/SOW xác nhận.
  staleFactor: 1,
  staleMinBars: 20,
  awayHeights: 1
};
var R = (x, d = 2) => x == null || !isFinite(x) ? x : +x.toFixed(d);
var merge = (a, b) => {
  const o = { ...a };
  for (const k in b) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
  return o;
};
var mirrorCandles = (c) => c.map((x) => ({ ...x, open: -x.open, close: -x.close, high: -x.low, low: -x.high }));
function atrSeries2(c, n = 14) {
  const out = new Array(c.length).fill(NaN);
  let sum = 0, prev = NaN;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].high - c[i].low : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i < n) {
      sum += tr;
      if (i === n - 1) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = (prev * (n - 1) + tr) / n;
      out[i] = prev;
    }
  }
  return out;
}
var hasVolume = (c) => c.length > 0 && c.every((x) => Number.isFinite(x.volume));
function barMetrics(c, o = DEFAULTS) {
  const n = c.length, atr = atrSeries2(c, o.atrN), hv = hasVolume(c);
  const volRel = new Array(n).fill(1), spreadRel = new Array(n).fill(1), clv2 = new Array(n).fill(0), body = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (hv) {
      const a = Math.max(0, i - o.volBase), cnt = i - a;
      if (cnt >= 5) {
        let t = 0;
        for (let j = a; j < i; j++) t += c[j].volume;
        volRel[i] = c[i].volume / (t / cnt || 1);
      }
    }
    const rng = c[i].high - c[i].low, ref = i > 0 && isFinite(atr[i - 1]) ? atr[i - 1] : atr[i];
    spreadRel[i] = ref > 0 ? rng / ref : 1;
    clv2[i] = rng > 0 ? (2 * c[i].close - c[i].high - c[i].low) / rng : 0;
    body[i] = rng > 0 ? Math.abs(c[i].close - c[i].open) / rng : 0;
  }
  return { atr, volRel, spreadRel, clv: clv2, body, hasVolume: hv };
}
var er = (c, i, L) => {
  let path = 0;
  for (let k = i - L + 1; k <= i; k++) path += Math.abs(c[k].close - c[k - 1].close);
  return path > 0 ? Math.abs(c[i].close - c[i - L].close) / path : 0;
};
function priorTrend(c, m, i, o = DEFAULTS) {
  const L = o.trendLookback;
  if (i < L) return { dir: 0 };
  const net = (c[i].close - c[i - L].close) / (m.atr[i] || 1), e = er(c, i, L);
  return { dir: e >= o.trendMinER && net <= -o.trendMinATR ? -1 : e >= o.trendMinER && net >= o.trendMinATR ? 1 : 0, netATR: net, er: e };
}
var stopBuf = (m, o, i, price) => o.stop.mode === "atr" ? o.stop.value * (m.atr[Math.min(i, m.atr.length - 1)] || 0) : o.stop.mode === "pct" ? o.stop.value * Math.abs(price) : o.stop.value;
function isClimax(c, m, i, o = DEFAULTS) {
  if (i < Math.max(o.trendLookback, o.scLowLookback) || i < 3) return false;
  if (priorTrend(c, m, i, o).dir !== -1) return false;
  for (let j = i - o.scLowLookback; j < i; j++) if (c[j].low < c[i].low) return false;
  const chain = (m.volRel[i] + m.volRel[i - 1] + m.volRel[i - 2]) / 3 >= o.scChainVol;
  return m.volRel[i] >= o.scVol && m.spreadRel[i] >= o.scSpread || chain;
}
function findPS(c, m, iSC, o) {
  const out = [];
  for (let k = Math.max(2, iSC - o.psLookback); k < iSC - 2; k++)
    if (m.volRel[k] >= o.psVol && c[k].low <= Math.min(c[k - 1].low, c[k - 2].low, c[k + 1].low, c[k + 2].low)) out.push(k);
  return out.slice(-2);
}
function trendlineBreak(c, iSC, iAR, resPrice) {
  const sw = [];
  for (let k = Math.max(2, iSC - 40); k < iSC - 2; k++)
    if (c[k].high >= Math.max(c[k - 1].high, c[k - 2].high, c[k + 1].high, c[k + 2].high)) sw.push(k);
  if (sw.length < 2) return false;
  const a = sw[sw.length - 2], b = sw[sw.length - 1];
  if (c[b].high >= c[a].high) return false;
  const slope = (c[b].high - c[a].high) / (b - a);
  return resPrice > c[b].high + slope * (iAR - b);
}
function buildPhaseA(c, m, iSC0, o, endI) {
  let iSC = iSC0, sup = c[iSC].low, j = iSC + 1, hi = -Infinity, iAR = -1, arEnd = iSC, broke = false;
  while (j <= endI && j <= iSC + o.arMaxBars) {
    if (c[j].low < sup) {
      iSC = j;
      sup = c[j].low;
      hi = -Infinity;
      iAR = -1;
      arEnd = j;
      j++;
      continue;
    }
    if (c[j].high > hi) {
      hi = c[j].high;
      iAR = j;
    }
    arEnd = j;
    if (j - iSC >= o.arMinBars && c[j].close < hi - o.arPullbackFrac * (hi - sup)) {
      broke = true;
      break;
    }
    j++;
  }
  if (iAR < 0) return { provisional: true, iSC, sup };
  const arProvisional = !broke && j > endI;
  const h = hi - sup;
  if (!arProvisional && h < o.arMinRiseATR * (m.atr[iSC] || 1)) return { demoted: arEnd };
  const st = { iSC, sup, iAR, res: hi, h, arEnd, arProvisional, ciA: arProvisional ? null : arEnd };
  if (arProvisional) return st;
  let iST = -1, ciST = null, rallied = false;
  for (let k = arEnd + 1; k <= Math.min(endI, arEnd + o.stMaxBars); k++) {
    if (c[k].close > hi) {
      rallied = true;
      break;
    }
    if (c[k].low <= sup + o.stZoneFrac * h) {
      if (c[k].close < sup - o.stBreakFrac * h) {
        if (k + 1 > endI) break;
        if (c[k + 1].close < sup) return { demoted: k };
        continue;
      }
      iST = k;
      let q = k + 1;
      for (; q <= Math.min(endI, k + 3) && c[q].low <= sup + o.stZoneFrac * h; q++) if (c[q].low < c[iST].low) iST = q;
      ciST = q <= endI && q <= k + 3 ? q : q === k + 4 ? k + 3 : null;
      break;
    }
  }
  st.iST = iST;
  st.ciST = ciST;
  st.iStart = iST >= 0 ? iST : arEnd;
  st.aComplete = ciST != null || iST < 0 && (rallied || arEnd + o.stMaxBars <= endI);
  return st;
}
function breachBelow(c, m, i0, sup, o, endI) {
  let n = 0, iLow = i0, low = Infinity, vsum = 0, last = i0 - 1;
  for (let j = i0; ; j++) {
    if (j > endI) return { complete: false, n, iLow, low, last, volMean: n ? vsum / n : 1 };
    if (j - i0 >= o.breachMaxBars) return { complete: true, recovered: false, n, iLow, low, last, at: j - 1, volMean: vsum / n };
    if (c[j].low < low) {
      low = c[j].low;
      iLow = j;
    }
    if (c[j].close < sup) {
      n++;
      last = j;
      vsum += m.volRel[j];
    } else return { complete: true, recovered: true, n, iRec: j, iLow, low, last, volMean: n ? vsum / n : 1 };
  }
}
function breachAbove(c, i0, res, o, endI) {
  let n = 0, iHigh = i0, high = -Infinity;
  for (let j = i0; ; j++) {
    if (j > endI) return { complete: false, n, iHigh, high };
    if (c[j].high > high) {
      high = c[j].high;
      iHigh = j;
    }
    if (c[j].close > res) {
      n++;
      if (n > o.falseBreakBars) return { complete: true, returned: false, n, iHigh, high, at: j };
    } else return { complete: true, returned: true, n, iRet: j, iHigh, high };
  }
}
function classifySpring(ep, o = DEFAULTS) {
  if (ep.n >= 3 || ep.volMean >= o.highVol) return "SHAKEOUT";
  if (ep.volMean < o.lowVol && ep.n <= 2) return "SPRING_3";
  return "SPRING_2";
}
function supplyReading(v, o = DEFAULTS) {
  if (v < o.lowVol) return "KLGD th\u1EA5p: cung \u0111\xE3 c\u1EA1n, kh\xF4ng c\xF2n c\u1EA3n tr\u1EDF nh\u1ECBp t\u0103ng";
  if (v >= o.highVol) return "KLGD l\u1EDBn: c\u1EA3nh b\xE1o nh\u1ECBp gi\u1EA3m m\u1EDBi, c\u1EA7n th\u1EADn tr\u1ECDng";
  return "KLGD trung b\xECnh: c\xF3 th\u1EC3 c\xF2n nhi\u1EC1u l\u1EA7n ki\u1EC3m \u0111\u1ECBnh cung n\u1EEFa";
}
function runB2E(c, m, tr, o, endI) {
  const sup = tr.sup, res = tr.res, h = res - sup, zone = sup + o.testZoneFrac * h, mid = sup + 0.5 * h;
  const ev = [], poes = [];
  const add = (type, i2, price, x = {}) => {
    const e = { type, i: i2, ci: i2, time: c[i2].time, price, volRel: R(m.volRel[i2]), spreadRel: R(m.spreadRel[i2]), ...x };
    ev.push(e);
    return e;
  };
  const buf = (i2, p) => stopBuf(m, o, i2, p);
  const poe = (n, i2, entry, stop, note) => poes.push({ poe: n, i: i2, time: c[i2].time, entry, stop, sizePct: o.poeSizes[n - 1], note });
  const fin = (x) => ({ events: ev, poes, ...x });
  let i = tr.iStart + 1, phase = "B", spring = null, springType = null, test = null, testRev = -1, springHigh = -Infinity;
  let sos = -1, sosWeak = false, status = "active", endIndex = endI, noSpringPath = false;
  while (i <= endI) {
    const b = c[i];
    if (b.close < sup) {
      const ep = breachBelow(c, m, i, sup, o, endI);
      if (!ep.complete) {
        add("SPRING_PENDING", ep.iLow, ep.low, { ci: null, closesBelow: ep.n, note: "\u0111ang d\u01B0\u1EDBi h\u1ED7 tr\u1EE3, ch\u01B0a r\xF5 l\xE0 Spring hay ph\xE1 v\u1EE1" });
        phase = i - tr.iStart >= o.minBarsB ? "C" : "B";
        i = endI + 1;
        break;
      }
      if (!ep.recovered) {
        add("BREAKDOWN", ep.iLow, ep.low, { ci: ep.at, closesBelow: ep.n, note: "kh\xF4ng quay l\u1EA1i TR \u2192 kh\xF4ng ph\u1EA3i Spring; c\u1EA5u tr\xFAc t\xEDch l\u0169y b\u1ECB ph\xE1 v\u1EE1" });
        return fin({ phase, status: "broken-down", endIndex: ep.at });
      }
      if (i - tr.iStart < o.minBarsB) {
        add("SOW_B", ep.iLow, ep.low, { ci: ep.iRec, closesBelow: ep.n, volMean: R(ep.volMean) });
        i = ep.iRec + 1;
        continue;
      }
      spring = ep;
      break;
    }
    if (b.high > res) {
      const ep = breachAbove(c, i, res, o, endI);
      if (!ep.complete) {
        i = endI + 1;
        break;
      }
      if (ep.returned) {
        add("UTA", ep.iHigh, ep.high, { ci: ep.iRet, closesAbove: ep.n });
        i = ep.iRet + 1;
        continue;
      }
      noSpringPath = true;
      sos = -2;
      break;
    }
    if (i + 2 <= endI && b.close >= sup && b.low <= zone && b.low <= Math.min(c[i - 1].low, c[i - 2].low, c[i + 1].low, c[i + 2].low))
      add("ST", i, b.low, { ci: i + 2, inPhase: "B", volVsSC: tr.scVol ? R(m.volRel[i] / tr.scVol) : null });
    i++;
  }
  let jStart = i;
  if (spring) {
    springType = classifySpring(spring, o);
    phase = "C";
    add(springType, spring.iLow, spring.low, { ci: spring.iRec, closesBelow: spring.n, volMean: R(spring.volMean), supply: supplyReading(spring.volMean, o), recoveredAt: spring.iRec });
    const stopSpring = spring.low - buf(spring.iRec, spring.low);
    if (springType === "SPRING_3" && spring.iRec === spring.last + 1) poe(1, spring.iRec, c[spring.iRec].close, stopSpring, "POE#1: n\u1EBFn x\xE1c nh\u1EADn \u0111\xF3ng l\u1EA1i trong TR (Spring #3)");
    springHigh = c[spring.iRec].high;
    let cand = -1;
    const tEnd = Math.min(endI, spring.iRec + o.testMaxBars);
    let k = spring.iRec + 1;
    for (; k <= tEnd; k++) {
      const bk = c[k];
      if (bk.close < sup && bk.low < spring.low) {
        add("SPRING_FAIL", k, bk.low, { note: "th\u1EE7ng \u0111\xE1y Spring \u2192 Spring th\u1EA5t b\u1EA1i (SOW)" });
        return fin({ phase, status: "failed", endIndex: k, spring, springType });
      }
      if (bk.close > res) break;
      if (cand < 0) {
        springHigh = Math.max(springHigh, bk.high);
        if (springHigh >= sup + o.testRallyFrac * h && bk.low <= zone && bk.low >= spring.low) cand = k;
      } else {
        if (bk.low < c[cand].low && bk.low >= spring.low) cand = k;
        if (bk.close > c[cand].high) {
          test = cand;
          testRev = k;
          break;
        }
      }
    }
    if (test != null && test >= 0) {
      add("TEST", test, c[test].low, { ci: testRev, higherLow: c[test].low > spring.low, volVsSpring: R(m.volRel[test] / Math.max(1e-9, spring.volMean)), lowVolume: m.volRel[test] < 1 });
      if (springType !== "SPRING_3") poe(1, testRev, c[testRev].close, stopSpring, `POE#1: \u0111\xE1y sau cao h\u01A1n x\xE1c nh\u1EADn nh\u1ECBp test (${springType === "SHAKEOUT" ? "Shakeout" : "Spring #2"})`);
      jStart = testRev + 1;
    } else jStart = spring.iRec + 1;
    for (let q = Math.max(k, spring.iRec + 1); q <= endI; q++) {
      if (c[q].close > res) break;
      if (c[q].close < spring.low) {
        add("SPRING_FAIL", q, c[q].low, { note: "\u0111\xF3ng c\u1EEDa d\u01B0\u1EDBi \u0111\xE1y Spring \u2192 Spring th\u1EA5t b\u1EA1i" });
        return fin({ phase, status: "failed", endIndex: q, spring, springType });
      }
    }
    const lowRef = test != null && test >= 0 ? c[test].low : spring.low;
    for (let q = jStart; q <= endI; q++) if (c[q].close > springHigh) {
      poe(2, q, c[q].close, lowRef - buf(q, lowRef), "POE#2: breakout v\u01B0\u1EE3t \u0111\u1EC9nh nh\u1ECBp h\u1ED3i sau Spring");
      break;
    }
  }
  const strong = (j) => c[j].close > res && m.spreadRel[j] >= o.sosSpread && m.volRel[j] >= o.sosVol;
  let sosCi = null;
  if (sos === -2) {
    for (let j = i; j <= endI; j++) if (c[j].close > res) {
      sos = j;
      sosWeak = !strong(j);
      let q = j;
      for (; q <= Math.min(endI, j + o.falseBreakBars) && c[q].close > res; q++) if (strong(q)) {
        sos = q;
        sosWeak = false;
        break;
      }
      sosCi = !sosWeak ? sos : q <= endI ? Math.min(q, j + o.falseBreakBars) : null;
      break;
    }
  } else if (spring || phase === "B") {
    sos = -1;
    for (let j = jStart; j <= endI; j++) if (strong(j)) {
      sos = j;
      sosCi = j;
      break;
    }
  }
  let buaInfo = null, e5 = -1;
  if (sos >= 0) {
    add("SOS", sos, c[sos].close, { ci: sosCi, weak: sosWeak, noSpring: noSpringPath, holdUntil: sos + o.sosHold, note: "v\u01B0\u1EE3t kh\xE1ng c\u1EF1, bi\xEAn r\u1ED9ng, KLGD t\u0103ng" });
    phase = "D";
    for (let k = sos + 1; k <= Math.min(endI, sos + o.sosHold); k++) if (c[k].close < sup + o.sosFailFrac * h) {
      add("SOS_FAIL", k, c[k].close, { note: "SOS th\u1EA5t b\u1EA1i: quay s\xE2u v\xE0o TR \u2192 Spring/SOS kh\xF4ng th\xE0nh (SOW), h\u01B0\u1EDBng t\xEDch l\u0169y b\u1ECB v\xF4 hi\u1EC7u" });
      return fin({ phase, status: "failed", endIndex: k, spring, springType, sos });
    }
    let iPeak = sos, peak = c[sos].high;
    for (let k = sos + 1; k <= endI; k++) {
      if (c[k].close < sup + o.sosFailFrac * h) {
        add("STRUCTURE_FAIL", k, c[k].close, { note: "\u0111\xF3ng c\u1EEDa s\xE2u v\xE0o TR (d\u01B0\u1EDBi gi\u1EEFa TR) sau SOS \u2192 ph\xE1 v\u1EE1 th\u1EA5t b\u1EA1i, c\u1EA5u tr\xFAc t\xEDch l\u0169y b\u1ECB v\xF4 hi\u1EC7u" });
        return fin({ phase, status: "failed", endIndex: k, spring, springType, sos });
      }
      if (c[k].close > peak) {
        if (k - iPeak >= 2) {
          const w = buaStats(c, m, iPeak + 1, k - 1, peak, res, o);
          buaInfo = { ...w, i0: iPeak + 1, i1: k - 1 };
          add("BUA", w.iLow, w.low, { ci: k, buaType: w.type, bars: w.n, high: peak, volMean: R(w.volMean), expectedDuration: w.duration, rangeATR: R(w.rangeATR) });
          const refLow = test != null && test >= 0 ? c[test].low : spring ? spring.low : sup;
          if (w.low > refLow && m.volRel[w.iLow] < 1 && peak - w.low <= o.lpsMaxRetraceFrac * (peak - sup)) add("LPS", w.iLow, w.low, { ci: k, note: "\u0111\xE1y sau cao h\u01A1n, KLGD th\u1EA5p" });
          add("E_BREAKOUT", k, c[k].close, { note: "ph\xE1 kh\u1ECFi BUA \u2192 xu h\u01B0\u1EDBng t\u0103ng \u0111\u01B0\u1EE3c x\xE1c nh\u1EADn (Phase E)" });
          poe(3, k, c[k].close, w.low - buf(k, w.low), "POE#3: breakout kh\u1ECFi BUA; d\u1EDDi to\xE0n b\u1ED9 SL l\xEAn \u0111\xE1y BUA");
          e5 = k;
          phase = "E";
          break;
        }
        peak = c[k].high;
        iPeak = k;
      } else if (c[k].high > peak) {
        peak = c[k].high;
        iPeak = k;
      }
    }
    if (e5 < 0 && endI - iPeak >= 1) {
      const w = buaStats(c, m, iPeak + 1, endI, peak, res, o);
      buaInfo = { ...w, i0: iPeak + 1, i1: endI, forming: true };
      add("BUA_FORMING", w.iLow, w.low, { ci: null, buaType: w.type, bars: w.n, high: peak, volMean: R(w.volMean), expectedDuration: w.duration, note: "BUA \u0111ang h\xECnh th\xE0nh; POE#3 khi gi\xE1 ph\xE1 l\xEAn kh\u1ECFi \u0111\u1EC9nh BUA" });
    }
  }
  const out = { phase, status: e5 >= 0 ? "completed" : status, endIndex: e5 >= 0 ? e5 : endI, spring, springType, test, sos: sos >= 0 ? sos : null, bua: buaInfo, e5, noSpringPath };
  ev.sort((a, b) => a.i - b.i);
  return fin(out);
}
function buaStats(c, m, i0, i1, peak, res, o) {
  let lo = Infinity, iLow = i0, vs = 0;
  for (let k = i0; k <= i1; k++) {
    if (c[k].low < lo) {
      lo = c[k].low;
      iLow = k;
    }
    vs += m.volRel[k];
  }
  const n = i1 - i0 + 1, atr = m.atr[i1] || 1, volMean = vs / n, range = peak - lo;
  const type = lo < res ? "deep-into-TR" : n >= o.buaMinBars && range <= o.buaMaxRangeATR * atr ? "mini-TR" : "shallow-pullback";
  return { n, low: lo, iLow, volMean, type, rangeATR: range / atr, duration: volMean < 1 ? "ng\u1EAFn (KLGD th\u1EA5p)" : volMean >= o.highVol ? "d\xE0i (KLGD l\u1EDBn)" : "trung b\xECnh" };
}
function classifyVariant(c, m, tr, run, o) {
  const h = tr.res - tr.sup, a = tr.iStart, b = run.spring ? run.spring.iLow : run.sos != null ? run.sos : c.length - 1;
  if (run.spring) return { variant: "conventional", note: "C\xF3 Spring/Shakeout (m\xF4 h\xECnh ti\xEAu chu\u1EA9n)" };
  const sowCount = run.events.filter((e) => e.type === "SOW_B").length;
  if (sowCount >= 2) return { variant: "continuous-weakness", note: "Nhi\u1EC1u SOW li\xEAn ti\u1EBFp, h\u1ED7 tr\u1EE3 b\u1ECB \u0111\u1EA9y th\u1EA5p d\u1EA7n" };
  if (b - a < 9) return { variant: "unspecified", note: "Phase B qu\xE1 ng\u1EAFn \u0111\u1EC3 ph\xE2n lo\u1EA1i" };
  const third = Math.floor((b - a) / 3), lowOf = (x, y) => Math.min(...c.slice(x, y + 1).map((z) => z.low));
  const l1 = lowOf(a, a + third), l3 = lowOf(b - third, b), rise = (l3 - l1) / h;
  if (rise >= 0.35) return { variant: "extra-strength", note: "\u0110\xE1y n\xE2ng cao m\u1EA1nh, kh\xF4ng c\u1EA7n Spring" };
  if (rise >= 0.15) return { variant: "absorption-at-higher-level", note: "H\u1EA5p th\u1EE5 cung \u1EDF v\xF9ng gi\xE1 cao h\u01A1n, kh\xF4ng c\xF3 SOW/Spring" };
  return { variant: "unspecified", note: "" };
}
function scanSC(c, m, o, endI) {
  const out = [];
  let i = Math.max(o.trendLookback, o.scLowLookback);
  while (i <= endI) {
    if (!isClimax(c, m, i, o)) {
      i++;
      continue;
    }
    const st = buildPhaseA(c, m, i, o, endI);
    if (st.demoted) {
      i = st.demoted + 1;
      continue;
    }
    if (st.provisional) {
      out.push({ st, run: { events: [], poes: [], phase: "A", status: "active", endIndex: endI }, provisional: true });
      break;
    }
    if (st.arProvisional || !st.aComplete) {
      out.push({ st, run: { events: [], poes: [], phase: "A", status: "active", endIndex: endI } });
      break;
    }
    st.scVol = m.volRel[st.iSC];
    const run = runB2E(c, m, st, o, endI);
    out.push({ st, run });
    if (run.status === "active") break;
    i = run.endIndex + 1;
  }
  return out;
}
var DIST_NAMES = {
  PS: "PSY",
  SC: "BC",
  AR: "AR",
  ST: "ST",
  UTA: "SOW_B",
  SOW_B: "UT",
  SPRING_3: "UT_3",
  SPRING_2: "UT_2",
  SHAKEOUT: "UTAD",
  SPRING_PENDING: "UT_PENDING",
  SPRING_FAIL: "UT_FAIL",
  BREAKDOWN: "BREAKOUT_UP",
  TEST: "TEST",
  SOS: "SOW",
  SOS_FAIL: "SOW_FAIL",
  LPS: "LPSY",
  BUA: "BUA",
  BUA_FORMING: "BUA_FORMING",
  E_BREAKOUT: "E_BREAKDOWN",
  STRUCTURE_FAIL: "STRUCTURE_FAIL"
};
function assemble(kind, long, c, m, o, st, run, extra = {}) {
  const sgn = long ? 1 : -1, name = (t) => long ? t : DIST_NAMES[t] || t;
  const A = [];
  if (st.iSC != null && !extra.generic) {
    findPS(c, m, st.iSC, o).forEach((k) => A.push({ type: "PS", i: k, ci: st.ciST ?? null, price: c[k].low, volRel: R(m.volRel[k]) }));
    A.push({ type: "SC", i: st.iSC, ci: st.ciST ?? null, price: st.sup, volRel: R(m.volRel[st.iSC]), spreadRel: R(m.spreadRel[st.iSC]) });
    if (st.iAR != null) A.push({ type: "AR", i: st.iAR, ci: st.ciST ?? null, price: st.res, provisional: !!st.arProvisional });
    if (st.iST >= 0) A.push({ type: "ST", i: st.iST, ci: st.ciST, price: c[st.iST].low, volRel: R(m.volRel[st.iST]), volVsSC: R(m.volRel[st.iST] / (m.volRel[st.iSC] || 1)), lowerVolume: m.volRel[st.iST] < m.volRel[st.iSC] * o.stVolRatio, inPhase: "A" });
  }
  const mirrorNote = (n) => long || !n ? n : n.replace(/tích lũy/g, "ph\xE2n ph\u1ED1i").replace(/Spring/g, "Upthrust").replace(/SOS/g, "SOW").replace(/hỗ trợ/g, "kh\xE1ng c\u1EF1").replace(/dưới/g, "\xA7TREN\xA7").replace(/trên/g, "d\u01B0\u1EDBi").replace(/§TREN§/g, "tr\xEAn").replace(/đáy/g, "\u0111\u1EC9nh").replace(/tăng/g, "gi\u1EA3m");
  const events = [...A, ...run.events].sort((a, b) => a.i - b.i).map((e) => ({ ...e, time: c[e.i].time, type: name(e.type), price: sgn * e.price, ...e.note ? { note: mirrorNote(e.note) } : {} }));
  const poes = run.poes.map((p) => ({
    ...p,
    side: long ? "long" : "short",
    entry: sgn * p.entry,
    stop: sgn * p.stop,
    note: long ? p.note : p.note.replace("\u0111\xE1y sau cao h\u01A1n", "\u0111\u1EC9nh sau th\u1EA5p h\u01A1n").replace("Spring", "Upthrust")
  }));
  const support = long ? st.sup : -st.res, resistance = long ? st.res : -st.sup;
  const vr = classifyVariant(c, m, st, run, o);
  const checklist = !extra.generic && st.iSC != null ? {
    climaxVolumeSpike: m.volRel[st.iSC] >= o.scVol,
    secondaryTestLowerVolume: st.iST >= 0 ? m.volRel[st.iST] < m.volRel[st.iSC] * o.stVolRatio : null,
    phaseATrendlineBreak: st.iAR != null ? trendlineBreak(c, st.iSC, st.iAR, st.res) : null,
    springLowVolume: run.spring ? run.spring.volMean < o.lowVol : null,
    sosWithVolume: run.sos != null ? m.volRel[run.sos] >= o.sosVol : null,
    shortTermReversalWarning: null
  } : null;
  const done = checklist ? Object.values(checklist).filter((v) => v === true).length : 0, avail = checklist ? Object.values(checklist).filter((v) => v !== null).length : 0;
  const phaseName = { A: "A", B: "B", C: "C", D: "D", E: "E" }[run.phase] || run.phase;
  return {
    key: `${st.iSC ?? st.iStart}|${long ? "L" : "S"}`,
    kind,
    direction: long ? "long" : "short",
    support,
    resistance,
    height: resistance - support,
    startI: st.iSC ?? st.iStart,
    endI: run.endIndex,
    phase: phaseName,
    status: run.status,
    variant: vr.variant,
    variantNote: vr.note,
    events,
    poes,
    checklist,
    checklistScore: avail ? done / avail : null,
    bua: run.bua,
    spring: run.spring ? { type: name(run.springType), low: sgn * (long ? run.spring.low : run.spring.low) } : null,
    ...extra
  };
}
function scanRanges(c, m, mc, mm, o, endI, claimed) {
  const out = [];
  let a = o.trendLookback;
  const W2 = o.rangeMinBars;
  while (a + W2 - 1 <= endI) {
    const b = a + W2 - 1;
    if (claimed(a, b)) {
      a += 5;
      continue;
    }
    let hi = -Infinity, lo = Infinity;
    for (let k = a; k <= b; k++) {
      hi = Math.max(hi, c[k].high);
      lo = Math.min(lo, c[k].low);
    }
    if (er(c, b, W2 - 1) > o.rangeER || hi - lo > o.rangeMaxATR * (m.atr[b] || 1)) {
      a++;
      continue;
    }
    const pt = priorTrend(c, m, a, o);
    if (pt.dir === 0) {
      a++;
      continue;
    }
    const tr = { sup: lo, res: hi, iStart: b, iSC: null };
    const runL = runB2E(c, m, tr, o, endI);
    const runS = runB2E(mc, mm, { sup: -hi, res: -lo, iStart: b }, o, endI);
    const score = (r) => r.events.reduce((s, e) => s + ({ SPRING_3: 3, SPRING_2: 3, SHAKEOUT: 3, TEST: 2, SOS: 3, LPS: 1, BUA: 1, E_BREAKOUT: 3 }[e.type] || 0), 0);
    const sL = score(runL), sS = score(runS);
    const long = sL >= sS, run = long ? runL : runS, best = Math.max(sL, sS);
    if (best >= 5 || run.status === "active") {
      const kind = best < 5 ? "range-undetermined" : long ? pt.dir > 0 ? "re-accumulation" : "accumulation" : pt.dir < 0 ? "re-distribution" : "distribution";
      const st = long ? tr : { sup: -hi, res: -lo, iStart: b };
      const s = assemble(kind, long, long ? c : mc, long ? m : mm, o, st, run, { generic: true, priorTrend: pt.dir, evidence: { long: sL, short: sS } });
      s.support = lo;
      s.resistance = hi;
      s.height = hi - lo;
      s.startI = a;
      if (!long) s.events.forEach((e) => {
        e.time = c[e.i].time;
      });
      out.push(s);
    }
    a = Math.max(run.endIndex + 1, b + 1);
    if (run.status === "active") break;
  }
  return out;
}
function freshness(s, c, o = DEFAULTS) {
  const endI = c.length - 1;
  const confirmed = s.events.filter((e) => e.ci != null && e.ci <= endI);
  const lastCi = confirmed.length ? Math.max(...confirmed.map((e) => e.ci)) : s.startI;
  const span = Math.max(1, lastCi - s.startI);
  const limit = Math.max(o.staleMinBars, Math.round(o.staleFactor * span));
  const since = endI - lastCi;
  const close = c[endI].close, h = Math.max(1e-9, s.resistance - s.support);
  const away = close > s.resistance + o.awayHeights * h ? "above" : close < s.support - o.awayHeights * h ? "below" : null;
  const reasons = [];
  if (since > limit) reasons.push(`${since} n\u1EBFn kh\xF4ng c\xF3 s\u1EF1 ki\u1EC7n x\xE1c nh\u1EADn m\u1EDBi (ng\u01B0\u1EE1ng ${limit} = \u0111\u1ED9 d\xE0i c\u1EA5u tr\xFAc)`);
  if (away && !["D", "E"].includes(s.phase)) reasons.push(`gi\xE1 \u0111\xE3 r\u1EDDi ${away === "above" ? "l\xEAn tr\xEAn" : "xu\u1ED1ng d\u01B0\u1EDBi"} TR qu\xE1 1 l\u1EA7n \u0111\u1ED9 r\u1ED9ng TR`);
  return { lastConfirmedIndex: lastCi, barsSinceLastEvent: since, limit, away, stale: reasons.length > 0, reasons };
}
function analyzeWyckoff(candles, userOpts = {}) {
  const o = merge(DEFAULTS, userOpts), n = candles.length;
  if (!hasVolume(candles) && !o.allowNoVolume) return { error: "Thi\u1EBFu tr\u01B0\u1EDDng volume: Wyckoff d\u1EF1a tr\xEAn kh\u1ED1i l\u01B0\u1EE3ng. \u0110\u1EB7t allowNoVolume:true \u0111\u1EC3 ch\u1EA1y v\u1EDBi kh\u1ED1i l\u01B0\u1EE3ng trung t\xEDnh (\u0111\u1ED9 tin c\u1EADy th\u1EA5p)." };
  const c = candles.map((x) => ({ ...x, volume: Number.isFinite(x.volume) ? x.volume : 1 })), endI = n - 1;
  if (n < o.trendLookback + 20) return { error: "Kh\xF4ng \u0111\u1EE7 d\u1EEF li\u1EC7u", structures: [] };
  const m = barMetrics(c, o), mc = mirrorCandles(c), mm = barMetrics(mc, o);
  const structures = [];
  scanSC(c, m, o, endI).forEach(({ st, run }) => structures.push(assemble("accumulation", true, c, m, o, st, run)));
  scanSC(mc, mm, o, endI).forEach(({ st, run }) => {
    const s = assemble("distribution", false, mc, mm, o, st, run);
    s.events.forEach((e) => {
      e.time = c[e.i].time;
    });
    structures.push(s);
  });
  const claimed = (a, b) => structures.some((s) => s.startI <= b && s.endI >= a);
  scanRanges(c, m, mc, mm, o, endI, claimed).forEach((s) => structures.push(s));
  structures.sort((a, b) => a.startI - b.startI);
  structures.forEach((s) => {
    s.freshness = freshness(s, c, o);
    if (s.status === "active" && s.freshness.stale) s.status = "stale";
  });
  const rank = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  const active = structures.filter((s) => s.status === "active").sort((x, y) => y.freshness.lastConfirmedIndex - x.freshness.lastConfirmedIndex || (rank[y.phase] || 0) - (rank[x.phase] || 0));
  const current = active[0] || null;
  const signals = structures.flatMap((s) => s.poes.map((p) => ({ ...p, structure: s.key, kind: s.kind }))).sort((a, b) => a.i - b.i);
  const alerts = [];
  structures.forEach((s) => s.events.forEach((e) => {
    if (["SOS_FAIL", "SOW_FAIL", "UT_FAIL", "SPRING_FAIL", "BREAKDOWN", "BREAKOUT_UP", "STRUCTURE_FAIL"].includes(e.type)) alerts.push({ i: e.i, time: e.time, type: e.type, structure: s.key, note: e.note });
  }));
  return {
    options: o,
    metrics: m,
    structures,
    active,
    current,
    signals,
    alerts,
    plan: current ? planForPhase(current.phase, current.direction) : null
  };
}
function planForPhase(phase, direction = "long") {
  const L = direction === "long";
  const P = {
    A: { action: "\u0110\u1EE9ng ngo\xE0i", detail: "Wyckoffian kh\xF4ng giao d\u1ECBch \u1EDF Phase A (ch\u1EDD ST x\xE1c nh\u1EADn bi\xEAn TR)." },
    B: { action: L ? "Mua k\xEAnh d\u01B0\u1EDBi, b\xE1n k\xEAnh tr\xEAn" : "B\xE1n k\xEAnh tr\xEAn, mua k\xEAnh d\u01B0\u1EDBi", detail: "Nhi\u1EC1u false break hai ph\xEDa (UTA/SOW trong B). R\u1EE7i ro cao; m\u1EE5c ti\xEAu ch\xEDnh l\xE0 quan s\xE1t c\u1EA1n cung/c\u1EA7u." },
    C: { action: L ? "Mua b\xECnh qu\xE2n xu\u1ED1ng" : "B\xE1n b\xECnh qu\xE2n l\xEAn", detail: L ? "Spring/Shakeout r\u1ED3i Test. POE#1 sau khi test th\xE0nh c\xF4ng (50% v\u1ECB th\u1EBF chu\u1EA9n)." : "Upthrust/UTAD r\u1ED3i Test. T\xECm \u0111i\u1EC3m b\xE1n sau x\xE1c nh\u1EADn." },
    D: { action: L ? "Mua b\xECnh qu\xE2n l\xEAn" : "B\xE1n b\xECnh qu\xE2n xu\u1ED1ng", detail: L ? "POE#2 (breakout, 30%), LPS, POE#3 (breakout kh\u1ECFi BUA, 20%); d\u1EDDi SL l\xEAn \u0111\xE1y BUA." : "LPSY l\xE0 \u0111i\u1EC3m v\xE0o b\xE1n t\u1ED1t; ch\u1EC9 b\xE1n th\xEAm n\u1EBFu c\xE1c v\u1ECB th\u1EBF \u0111\u1EA7u \u0111\xE3 c\xF3 l\xE3i." },
    E: { action: L ? "\u0110i theo xu h\u01B0\u1EDBng t\u0103ng" : "\u0110i theo xu h\u01B0\u1EDBng gi\u1EA3m", detail: "Theo d\xF5i h\xE0nh vi kh\u1ED1i l\u01B0\u1EE3ng (volumeBehavior): t\u0103ng s\u1ED1c = c\u1EA3nh b\xE1o \u0111\u1EA3o chi\u1EC1u ng\u1EAFn h\u1EA1n; t\u0103ng r\u1ED3i gi\u1EA3m = nh\u1ECBp s\u1EAFp k\u1EBFt th\xFAc." }
  };
  return { phase, direction, ...P[phase] || { action: "Ch\u01B0a x\xE1c \u0111\u1ECBnh", detail: "" } };
}
function timeframeAdvice(tf) {
  const t = String(tf).toUpperCase();
  if (["M", "1M", "MN", "W", "1W"].includes(t)) return { role: "d\xE0i h\u1EA1n", tradeable: true, note: "TR/Phase tr\xEAn Monthly\u2013Weekly th\u1EC3 hi\u1EC7n xu h\u01B0\u1EDBng d\xE0i h\u1EA1n." };
  if (["D", "1D", "H4", "4H"].includes(t)) return { role: "trung h\u1EA1n", tradeable: true, note: "TR/Phase tr\xEAn Daily\u2013H4 th\u1EC3 hi\u1EC7n xu h\u01B0\u1EDBng trung h\u1EA1n." };
  return { role: "khung nh\u1ECF", tradeable: false, note: "Kh\xF4ng th\u1EC3 hi\u1EC7n xu h\u01B0\u1EDBng: tr\xE1nh giao d\u1ECBch; ch\u1EC9 d\xF9ng TR khung nh\u1ECF \u0111\u1EC3 tinh ch\u1EC9nh POE, v\xE0 ch\u1EC9 khi \u0111\xE3 x\xE1c \u0111\u1ECBnh \u0111\xFAng s\u1EF1 ki\u1EC7n \u1EDF khung l\u1EDBn." };
}

// src/lib/quant-core/wyckoffV3/index.ts
var CANON = {
  PS: "PS",
  SC: "SC",
  AR: "AR",
  ST: "ST",
  SPRING_3: "Spring",
  SPRING_2: "Spring",
  SHAKEOUT: "Spring",
  TEST: "Test",
  SOS: "SOS",
  LPS: "LPS",
  PSY: "PSY",
  BC: "BC",
  UT_3: "UT",
  UT_2: "UT",
  UTAD: "UTAD",
  SOW: "SOW",
  LPSY: "LPSY",
  BUA: "BUA",
  BUA_FORMING: "BUA",
  E_BREAKOUT: "E",
  E_BREAKDOWN: "E",
  SOW_B: "SOW_B",
  UTA: "UTA",
  UT: "UT",
  SPRING_FAIL: "FAIL",
  UT_FAIL: "FAIL",
  SOS_FAIL: "FAIL",
  SOW_FAIL: "FAIL",
  STRUCTURE_FAIL: "FAIL",
  BREAKDOWN: "FAIL",
  BREAKOUT_UP: "FAIL",
  SPRING_PENDING: "PENDING",
  UT_PENDING: "PENDING"
};
function uiPhaseOf(s) {
  if (s.kind === "range-undetermined") return "undetermined";
  const long = s.direction === "long";
  const hasTest = s.events.some((e) => e.type === "TEST");
  switch (s.phase) {
    case "A":
    case "B":
      return long ? "accumulation" : "distribution";
    case "C":
      return long ? hasTest ? "test" : "spring" : "distribution";
    case "D":
    case "E":
      return long ? "markup" : "decline";
    default:
      return "undetermined";
  }
}
var CHECK_LABEL = {
  climaxVolumeSpike: "Climax (SC/BC) c\xF3 KL \u0111\u1ED9t bi\u1EBFn \u2265 2\xD7 TB50",
  secondaryTestLowerVolume: "ST c\xF3 KL th\u1EA5p h\u01A1n climax",
  phaseATrendlineBreak: "AR ph\xE1 trendline c\u1EE7a xu h\u01B0\u1EDBng tr\u01B0\u1EDBc",
  springLowVolume: "Spring/UT v\u1EDBi KL th\u1EA5p (cung/c\u1EA7u c\u1EA1n)",
  sosWithVolume: "SOS/SOW c\xF3 KL \u2265 1,2\xD7 TB50"
};
var KIND_VI = {
  accumulation: "t\xEDch lu\u1EF9",
  "re-accumulation": "t\xE1i t\xEDch lu\u1EF9",
  distribution: "ph\xE2n ph\u1ED1i",
  "re-distribution": "t\xE1i ph\xE2n ph\u1ED1i",
  "range-undetermined": "v\xF9ng \u0111i ngang ch\u01B0a r\xF5 h\u01B0\u1EDBng"
};
function classifyWyckoffV3(bars, opts = {}) {
  const asOf = bars.length ? bars[bars.length - 1].date : null;
  const base = { ...classifyWyckoffPhase([]), engine: "v3", asOf, events: [] };
  const tf = opts.timeframe ?? "D";
  const advice = timeframeAdvice(tf);
  const caveats = [
    "Tham s\u1ED1 l\xE0 gi\xE1 tr\u1ECB kh\u1EDFi \u0111i\u1EC3m theo t\xE0i li\u1EC7u Wyckoff, ch\u01B0a hi\u1EC7u ch\u1EC9nh cho th\u1ECB tr\u01B0\u1EDDng VN.",
    "V\xF9ng \u0111i ngang kh\xF4ng c\xF3 SC/BC r\xF5 (t\xE1i t\xEDch lu\u1EF9 / t\xE1i ph\xE2n ph\u1ED1i): h\u01B0\u1EDBng \u0111\u01B0\u1EE3c ch\u1ECDn theo s\u1ED1 b\u1EB1ng ch\u1EE9ng t\u1EDBi hi\u1EC7n t\u1EA1i v\xE0 C\xD3 TH\u1EC2 \u0110\u1ED4I khi c\xF3 n\u1EBFn m\u1EDBi."
  ];
  if (!advice.tradeable) caveats.unshift(`Khung ${tf}: ${advice.note}`);
  if (opts.isIndex) caveats.push("VN-Index l\xE0 ch\u1EC9 s\u1ED1, kh\xF4ng giao d\u1ECBch tr\u1EF1c ti\u1EBFp; kh\u1ED1i l\u01B0\u1EE3ng l\xE0 KL to\xE0n th\u1ECB tr\u01B0\u1EDDng (kh\xF4ng ph\u1EA3i d\xF2ng ti\u1EC1n v\xE0o m\u1ED9t t\xE0i s\u1EA3n).");
  if (!bars.length || !bars.every((b) => Number.isFinite(b.volume) && b.volume >= 0)) {
    return { ...base, status: "insufficient", statusReason: "Thi\u1EBFu kh\u1ED1i l\u01B0\u1EE3ng \u2014 Wyckoff c\u1EA7n kh\u1ED1i l\u01B0\u1EE3ng.", caveats };
  }
  if (bars.every((b) => b.volume === 0)) return { ...base, status: "insufficient", statusReason: "Kh\u1ED1i l\u01B0\u1EE3ng to\xE0n b\u1EB1ng 0 \u2014 kh\xF4ng ph\xE2n t\xEDch \u0111\u01B0\u1EE3c.", caveats };
  const candles = bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const res = analyzeWyckoff(candles);
  if (res.error) return { ...base, status: "insufficient", statusReason: res.error, caveats };
  const date = (i) => bars[Math.min(Math.max(0, i), bars.length - 1)].date;
  const mapEvents = (s) => s.events.map((e) => ({
    event: CANON[e.type] ?? "PENDING",
    label: e.type,
    date: date(e.i),
    index: e.i,
    price: e.price,
    volume: bars[e.i]?.volume ?? 0,
    strength: e.ci == null ? 0.5 : 0.8,
    confirmedIndex: e.ci,
    confirmedDate: e.ci == null ? null : date(e.ci)
  }));
  const evidenceOf = (s, ev) => wyckoffEvidence(bars, { start: s.startI, end: s.endI, high: s.resistance, low: s.support }, ev);
  const current = res.current;
  const structures = res.structures.map((s) => ({
    kind: s.kind,
    direction: s.direction,
    wyckoffPhase: s.phase,
    status: s.status,
    current: s === current,
    rangeHigh: s.resistance,
    rangeLow: s.support,
    startDate: date(s.startI),
    endDate: date(s.endI)
  }));
  if (!current) {
    const lastEnded = [...res.structures].filter((s) => s.status !== "active").sort((a, b) => b.endI - a.endI)[0] ?? null;
    if (lastEnded && lastEnded.status === "completed" && !lastEnded.freshness.stale) {
      const last = bars[bars.length - 1].close;
      const mid = (lastEnded.support + lastEnded.resistance) / 2;
      const holding = lastEnded.direction === "long" ? last >= mid : last <= mid;
      if (holding) {
        const plan2 = planForPhase("E", lastEnded.direction);
        return {
          ...base,
          structures,
          caveats,
          status: "active",
          phase: lastEnded.direction === "long" ? "markup" : "decline",
          statusReason: `Phase E: xu h\u01B0\u1EDBng ${lastEnded.direction === "long" ? "t\u0103ng" : "gi\u1EA3m"} sau c\u1EA5u tr\xFAc ${KIND_VI[lastEnded.kind] ?? lastEnded.kind} \u0111\xE3 ho\xE0n t\u1EA5t (ph\xE1 kh\u1ECFi BUA ${date(lastEnded.endI)}).`,
          wyckoffPhase: "E",
          kind: lastEnded.kind,
          rangeHigh: lastEnded.resistance,
          rangeLow: lastEnded.support,
          rangeStartDate: date(lastEnded.startI),
          rangeEndDate: date(lastEnded.endI),
          events: mapEvents(lastEnded),
          evidence: evidenceOf(lastEnded, mapEvents(lastEnded)),
          checks: [
            { label: `C\xF2n hi\u1EC7u l\u1EF1c: ${lastEnded.freshness.barsSinceLastEvent} n\u1EBFn t\u1EEB s\u1EF1 ki\u1EC7n x\xE1c nh\u1EADn cu\u1ED1i (ng\u01B0\u1EE1ng ${lastEnded.freshness.limit})`, ok: true },
            { label: lastEnded.direction === "long" ? "Gi\xE1 gi\u1EEF tr\xEAn h\u1ED7 tr\u1EE3 TR" : "Gi\xE1 gi\u1EEF d\u01B0\u1EDBi kh\xE1ng c\u1EF1 TR", ok: true }
          ],
          plan: { action: plan2.action, detail: plan2.detail }
        };
      }
    }
    const out = { ...base, structures, caveats, status: lastEnded ? "historical" : "insufficient", phase: "undetermined" };
    if (lastEnded) {
      const failNote = lastEnded.events.filter((e) => /FAIL|BREAKDOWN|BREAKOUT_UP/.test(e.type)).map((e) => e.note).find(Boolean);
      const reason = lastEnded.status === "stale" ? lastEnded.freshness.reasons.join("; ") : lastEnded.status === "failed" ? `c\u1EA5u tr\xFAc th\u1EA5t b\u1EA1i (${failNote ?? "s\u1EF1 ki\u1EC7n th\u1EA5t b\u1EA1i"})` : lastEnded.status === "completed" ? lastEnded.freshness.stale ? `c\u1EA5u tr\xFAc \u0111\xE3 ho\xE0n t\u1EA5t (Phase E) t\u1EEB l\xE2u \u2014 ${lastEnded.freshness.reasons.join("; ")}` : "c\u1EA5u tr\xFAc \u0111\xE3 ho\xE0n t\u1EA5t (Phase E) nh\u01B0ng gi\xE1 \u0111\xE3 quay s\xE2u v\xE0o TR (qua gi\u1EEFa TR) \u2014 ph\xE1 v\u1EE1 th\u1EA5t b\u1EA1i" : `c\u1EA5u tr\xFAc b\u1ECB ph\xE1 v\u1EE1 (${failNote ?? "kh\xF4ng quay l\u1EA1i trading range"})`;
      out.historical = {
        phase: uiPhaseOf(lastEnded),
        wyckoffPhase: lastEnded.phase,
        kind: lastEnded.kind,
        status: lastEnded.status,
        rangeHigh: lastEnded.resistance,
        rangeLow: lastEnded.support,
        startDate: date(lastEnded.startI),
        endDate: date(lastEnded.endI),
        reason
      };
      out.statusReason = `Kh\xF4ng c\xF3 c\u1EA5u tr\xFAc Wyckoff \u0111ang ho\u1EA1t \u0111\u1ED9ng. C\u1EA5u tr\xFAc g\u1EA7n nh\u1EA5t (${KIND_VI[lastEnded.kind] ?? lastEnded.kind}, Phase ${lastEnded.phase}): ${reason}.`;
      out.rangeHigh = lastEnded.resistance;
      out.rangeLow = lastEnded.support;
      out.rangeStartDate = date(lastEnded.startI);
      out.rangeEndDate = date(lastEnded.endI);
      out.events = mapEvents(lastEnded);
      out.evidence = evidenceOf(lastEnded, out.events);
    } else out.statusReason = "Ch\u01B0a t\xECm th\u1EA5y c\u1EA5u tr\xFAc Wyckoff (climax SC/BC ho\u1EB7c trading range n\u1ED1i ti\u1EBFp m\u1ED9t xu h\u01B0\u1EDBng).";
    return out;
  }
  const phase = uiPhaseOf(current);
  const events = mapEvents(current);
  const lastConfirmed = (t) => {
    const list = events.filter((e) => e.event === t && e.confirmedIndex != null);
    return list.length ? list[list.length - 1].date : null;
  };
  const checks = Object.entries(current.checklist ?? {}).filter(([k]) => CHECK_LABEL[k]).map(([k, v]) => ({ label: CHECK_LABEL[k], ok: v }));
  checks.push({ label: `C\xF2n hi\u1EC7u l\u1EF1c: s\u1EF1 ki\u1EC7n x\xE1c nh\u1EADn cu\u1ED1i c\xE1ch ${current.freshness.barsSinceLastEvent} n\u1EBFn (ng\u01B0\u1EE1ng ${current.freshness.limit} = \u0111\u1ED9 d\xE0i c\u1EA5u tr\xFAc)`, ok: !current.freshness.stale });
  const okN = checks.filter((c) => c.ok === true).length, avail = checks.filter((c) => c.ok !== null).length;
  const provisional = events.filter((e) => e.confirmedIndex == null);
  if (provisional.length) caveats.unshift(`C\xF3 ${provisional.length} s\u1EF1 ki\u1EC7n CH\u01AFA x\xE1c nh\u1EADn (${provisional.map((e) => e.label).join(", ")}) \u2014 c\xF3 th\u1EC3 thay \u0111\u1ED5i \u1EDF n\u1EBFn sau.`);
  if (current.kind === "range-undetermined") caveats.unshift("\u0110ang trong trading range nh\u01B0ng ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng \u0111\u1EC3 bi\u1EBFt l\xE0 t\xEDch lu\u1EF9 hay ph\xE2n ph\u1ED1i.");
  const plan = planForPhase(current.phase, current.direction);
  return {
    ...base,
    phase,
    structures,
    caveats,
    checks,
    status: phase === "undetermined" ? "insufficient" : "active",
    statusReason: phase === "undetermined" ? "\u0110ang trong trading range, ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng h\u01B0\u1EDBng." : `C\u1EA5u tr\xFAc ${KIND_VI[current.kind] ?? current.kind} \u0111ang ho\u1EA1t \u0111\u1ED9ng, Phase ${current.phase}.`,
    wyckoffPhase: ["A", "B", "C", "D", "E"].includes(current.phase) ? current.phase : null,
    kind: current.kind,
    confidenceScore: avail ? Math.round(okN / avail * 100) : 0,
    rangeHigh: current.resistance,
    rangeLow: current.support,
    rangeStartDate: date(current.startI),
    rangeEndDate: date(current.endI),
    events,
    evidence: evidenceOf(current, events),
    springDate: lastConfirmed("Spring") ?? lastConfirmed("UT") ?? lastConfirmed("UTAD"),
    testDate: lastConfirmed("Test") ?? lastConfirmed("ST"),
    markupDate: lastConfirmed("SOS"),
    declineDate: lastConfirmed("SOW"),
    phaseC: current.spring ? `${current.spring.type} \xB7 ${current.variantNote || current.variant}` : current.variantNote || void 0,
    plan: { action: plan.action, detail: plan.detail }
  };
}

// src/lib/quant-core/wyckoffTests.ts
var WYCKOFF_TESTS = {
  /** Số nến trước range để tìm xu hướng trước đó (mục tiêu, đường cung/cầu). */
  priorBars: 60,
  /** Sức mạnh tương đối: số phiên so lợi suất với chỉ số. */
  rsBars: 20,
  /** Phép thử 9: lợi nhuận ước lượng ≥ x lần rủi ro. */
  minRewardRisk: 3,
  /** Mục tiêu ước lượng = biên range ± k × độ rộng range. */
  causeK: [1, 1.5, 2],
  /** Cao trào ngoài kênh: vượt đường song song ≥ x ATR. */
  outsideATR: 0.25
};
var WYCKOFF_TESTS_NOTE = "Danh s\xE1ch \u0111\u1EA1t / ch\u01B0a \u0111\u1EA1t (kh\xF4ng ph\u1EA3i x\xE1c su\u1EA5t), ch\u1EC9 hi\u1EC3n th\u1ECB \u2014 ch\u01B0a t\xEDnh v\xE0o pha. Ki\u1EC3m \u0111\u1ECBnh 225 m\xE3 (10/2024\u201310/2026): ch\u01B0a ph\xE9p \u0111o n\xE0o \u0111\u1EA1t ti\xEAu ch\xED; NG\u01AF\u1EE2C s\xE1ch: ph\xEDa b\xE1n c\xE0ng nhi\u1EC1u ph\xE9p th\u1EED \u0111\u1EA1t th\xEC 20 phi\xEAn sau gi\xE1 c\xE0ng t\u1ED1t h\u01A1n, '\u0111\xE3 ph\xE1 \u0111\u01B0\u1EDDng cung' v\xE0 'l\u1EE3i nhu\u1EADn \u2265 3\xD7 r\u1EE7i ro' k\xE9m h\u01A1n \u2014 kh\xF4ng d\xF9ng \u0111\u1EC3 ra quy\u1EBFt \u0111\u1ECBnh. M\u1EA1nh h\u01A1n VN-Index \u0111\xFAng chi\u1EC1u tr\xEAn to\xE0n k\u1EF3 nh\u01B0ng ch\u01B0a \u0111\u1EE7 \xFD ngh\u0129a ngo\xE0i m\u1EABu. M\u1EE5c ti\xEAu l\xE0 \u01B0\u1EDBc l\u01B0\u1EE3ng nguy\xEAn nh\xE2n\u2013k\u1EBFt qu\u1EA3, ch\u01B0a ki\u1EC3m \u0111\u1ECBnh.";
var fmt = (v) => Math.round(v).toLocaleString("vi-VN");
var pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
var idxOf = (bars, date) => date ? bars.findIndex((b) => b.date === date) : -1;
var lineAt = (l, x) => l.ap + (l.bp - l.ap) * (x - l.ai) / (l.bi - l.ai);
function trendChannel(bars, start, kind, atr) {
  const A = atr ?? atrSeries(bars, 14);
  const n = bars.length, last = n - 1;
  const from = Math.max(3, start - WYCKOFF_TESTS.priorBars);
  const side = kind === "down" ? "high" : "low";
  const ps = pivots(bars, from, last, side).filter((p) => p.ci <= last);
  const before = ps.filter((p) => p.index <= start);
  if (!before.length) return null;
  const p1 = before.reduce((m, p) => kind === "down" ? p.price > m.price ? p : m : p.price < m.price ? p : m);
  const after = ps.filter((p) => p.index > p1.index + 2 && (kind === "down" ? p.price < p1.price : p.price > p1.price));
  if (!after.length) return null;
  let p2 = after[0];
  for (const c of after) {
    if (c.index > start + 10) break;
    const L2 = { ai: p1.index, ap: p1.price, bi: c.index, bp: c.price };
    let ok = true;
    for (let j = p1.index + 1; j < c.index && ok; j++) ok = kind === "down" ? bars[j].high <= lineAt(L2, j) + 1e-9 : bars[j].low >= lineAt(L2, j) - 1e-9;
    if (ok) {
      p2 = c;
      break;
    }
  }
  const L = { ai: p1.index, ap: p1.price, bi: p2.index, bp: p2.price };
  let best = kind === "down" ? Infinity : -Infinity;
  for (let j = p1.index; j <= p2.index; j++) {
    const off = kind === "down" ? bars[j].low - lineAt(L, j) : bars[j].high - lineAt(L, j);
    best = kind === "down" ? Math.min(best, off) : Math.max(best, off);
  }
  const par = (x) => lineAt(L, x) + best;
  let broken = null;
  for (let j = p2.index + 1; j <= last; j++) {
    if (kind === "down" ? bars[j].close > lineAt(L, j) : bars[j].close < lineAt(L, j)) {
      broken = { index: j, date: bars[j].date, price: bars[j].close };
      break;
    }
  }
  let climaxOutside = null;
  for (let j = p2.index; j <= Math.min(last, start + 10); j++) {
    const a = A[j] || 1;
    if (kind === "down" ? bars[j].low < par(j) - WYCKOFF_TESTS.outsideATR * a : bars[j].high > par(j) + WYCKOFF_TESTS.outsideATR * a) {
      climaxOutside = { index: j, date: bars[j].date, price: kind === "down" ? bars[j].low : bars[j].high };
      break;
    }
  }
  const end = broken ? broken.index : last;
  const pt = (i, p) => ({ index: i, date: bars[i].date, price: p });
  return {
    kind,
    broken,
    climaxOutside,
    line: { a: pt(p1.index, p1.price), b: pt(end, lineAt(L, end)) },
    parallel: { a: pt(p1.index, par(p1.index)), b: pt(end, par(end)) }
  };
}
function relativeStrength(bars, benchmark, N = WYCKOFF_TESTS.rsBars) {
  if (!benchmark?.length || bars.length < 2 * N + 1) return null;
  const bm = new Map(benchmark.map((b) => [b.date, b]));
  const rows = [];
  for (const b of bars) {
    const i = bm.get(b.date);
    if (i) rows.push({ s: b, i });
  }
  if (rows.length < 2 * N + 1) return null;
  const t = rows.length - 1;
  const r = (k) => (rows[t][k].close / rows[t - N][k].close - 1) * 100;
  const minLow = (k, a, b) => {
    let m = Infinity;
    for (let j = a; j <= b; j++) m = Math.min(m, rows[j][k].low);
    return m;
  };
  const sNow = minLow("s", t - N + 1, t), sPrev = minLow("s", t - 2 * N + 1, t - N);
  const iNow = minLow("i", t - N + 1, t), iPrev = minLow("i", t - 2 * N + 1, t - N);
  const stockPct = r("s"), indexPct = r("i");
  return { bars: N, stockPct, indexPct, diffPct: stockPct - indexPct, stockHigherLow: sNow > sPrev, indexLowerLow: iNow < iPrev };
}
function wyckoffNineTests(bars, w, benchmark) {
  if (w.rangeHigh == null || w.rangeLow == null || (w.status ?? "active") !== "active" || w.phase === "undetermined") return null;
  const start = idxOf(bars, w.rangeStartDate), endR = w.rangeEndDate ? idxOf(bars, w.rangeEndDate) : bars.length - 1;
  if (start < 0 || endR < 0) return null;
  const buy = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
  const side = buy ? "buy" : "sell";
  const n = bars.length, last = n - 1;
  const atr = atrSeries(bars, 14);
  const H = w.rangeHigh, Lo = w.rangeLow, height = Math.max(1e-9, H - Lo);
  const close = bars[last].close;
  const ev = new Set(w.events.map((e) => e.event));
  const items = [];
  const add = (key, label, ok, value) => items.push({ n: items.length + 1, key, label, ok, value });
  const from = Math.max(0, start - WYCKOFF_TESTS.priorBars);
  let ext = buy ? -Infinity : Infinity;
  for (let j = from; j <= start; j++) ext = buy ? Math.max(ext, bars[j].high) : Math.min(ext, bars[j].low);
  const move = buy ? ext - Lo : H - ext;
  add(
    "objective",
    buy ? "M\u1EE5c ti\xEAu gi\u1EA3m tr\u01B0\u1EDBc \u0111\xF3 \u0111\xE3 ho\xE0n th\xE0nh (\u01B0\u1EDBc l\u01B0\u1EE3ng)" : "M\u1EE5c ti\xEAu t\u0103ng tr\u01B0\u1EDBc \u0111\xF3 \u0111\xE3 ho\xE0n th\xE0nh (\u01B0\u1EDBc l\u01B0\u1EE3ng)",
    start - from >= 20 ? move >= height : null,
    start - from >= 20 ? `xu h\u01B0\u1EDBng tr\u01B0\u1EDBc ${(move / height).toFixed(1)}\xD7 \u0111\u1ED9 r\u1ED9ng range` : "thi\u1EBFu d\u1EEF li\u1EC7u tr\u01B0\u1EDBc range"
  );
  let uv = 0, un = 0, dv = 0, dn = 0;
  for (let j = start + Math.floor((endR - start) / 2); j <= last; j++) {
    if (bars[j].close > bars[j].open) {
      uv += bars[j].volume;
      un++;
    } else if (bars[j].close < bars[j].open) {
      dv += bars[j].volume;
      dn++;
    }
  }
  const act = un && dn && dv > 0 ? uv / un / (dv / dn) : null;
  add(
    "activity",
    buy ? "KL n\u1EBFn t\u0103ng l\u1EDBn h\u01A1n KL n\u1EBFn gi\u1EA3m" : "KL n\u1EBFn gi\u1EA3m l\u1EDBn h\u01A1n KL n\u1EBFn t\u0103ng",
    act == null ? null : buy ? act > 1 : act < 1,
    act == null ? "\u2014" : `KL TB n\u1EBFn t\u0103ng \xF7 n\u1EBFn gi\u1EA3m = ${act.toFixed(2)}\xD7`
  );
  const climax = buy ? ev.has("PS") || ev.has("SC") : ev.has("PSY") || ev.has("BC");
  add(
    "climax",
    buy ? "C\xF3 h\u1ED7 tr\u1EE3 s\u01A1 b\u1ED9 (PS) / b\xE1n th\xE1o cao tr\xE0o (SC)" : "C\xF3 cung s\u01A1 b\u1ED9 (PSY) / mua cao tr\xE0o (BC)",
    climax,
    [...ev].filter((e) => (buy ? ["PS", "SC"] : ["PSY", "BC"]).includes(e)).join(", ") || "kh\xF4ng c\xF3"
  );
  const rs = relativeStrength(bars, benchmark);
  add(
    "rs",
    buy ? "M\u1EA1nh h\u01A1n VN-Index" : "Y\u1EBFu h\u01A1n VN-Index",
    rs ? buy ? rs.diffPct > 0 : rs.diffPct < 0 : null,
    rs ? `${rs.bars} phi\xEAn: m\xE3 ${pct(rs.stockPct)} \xB7 VN-Index ${pct(rs.indexPct)}${rs.stockHigherLow && rs.indexLowerLow ? " \xB7 m\xE3 gi\u1EEF \u0111\xE1y cao h\u01A1n khi ch\u1EC9 s\u1ED1 t\u1EA1o \u0111\xE1y th\u1EA5p h\u01A1n" : ""}` : "ch\u01B0a c\xF3 d\u1EEF li\u1EC7u ch\u1EC9 s\u1ED1 (ch\u1EC9 khung D, m\xE3 c\u1ED5 phi\u1EBFu)"
  );
  const channel = trendChannel(bars, start, buy ? "down" : "up", atr);
  add(
    "trendline",
    buy ? "\u0110\xE3 ph\xE1 \u0111\u01B0\u1EDDng cung c\u1EE7a xu h\u01B0\u1EDBng gi\u1EA3m" : "\u0110\xE3 ph\xE1 \u0111\u01B0\u1EDDng c\u1EA7u c\u1EE7a xu h\u01B0\u1EDBng t\u0103ng",
    channel ? channel.broken != null : null,
    channel ? channel.broken ? `\u0111\xF3ng c\u1EEDa ${buy ? "tr\xEAn" : "d\u01B0\u1EDBi"} \u0111\u01B0\u1EDDng ng\xE0y ${channel.broken.date}` : "ch\u01B0a ph\xE1" : "kh\xF4ng v\u1EBD \u0111\u01B0\u1EE3c \u0111\u01B0\u1EDDng xu h\u01B0\u1EDBng tr\u01B0\u1EDBc range"
  );
  const lows = pivots(bars, start, last, "low").filter((p) => p.ci <= last);
  const highs = pivots(bars, start, last, "high").filter((p) => p.ci <= last);
  const cmp = (ps) => ps.length >= 2 ? Math.sign(ps[ps.length - 1].price - ps[ps.length - 2].price) : null;
  const cl = cmp(lows), ch = cmp(highs);
  add(
    "lows",
    buy ? "\u0110\xE1y sau cao h\u01A1n \u0111\xE1y tr\u01B0\u1EDBc" : "\u0110\xE1y sau th\u1EA5p h\u01A1n \u0111\xE1y tr\u01B0\u1EDBc",
    cl == null ? null : buy ? cl > 0 : cl < 0,
    lows.length >= 2 ? `${fmt(lows[lows.length - 2].price)} \u2192 ${fmt(lows[lows.length - 1].price)}` : "ch\u01B0a \u0111\u1EE7 \u0111\xE1y"
  );
  add(
    "highs",
    buy ? "\u0110\u1EC9nh sau cao h\u01A1n \u0111\u1EC9nh tr\u01B0\u1EDBc" : "\u0110\u1EC9nh sau th\u1EA5p h\u01A1n \u0111\u1EC9nh tr\u01B0\u1EDBc",
    ch == null ? null : buy ? ch > 0 : ch < 0,
    highs.length >= 2 ? `${fmt(highs[highs.length - 2].price)} \u2192 ${fmt(highs[highs.length - 1].price)}` : "ch\u01B0a \u0111\u1EE7 \u0111\u1EC9nh"
  );
  const len = endR - start + 1;
  add("base", buy ? "\u0110\xE3 h\xECnh th\xE0nh n\u1EC1n \u0111i ngang (\u2265 20 n\u1EBFn)" : "\u0110\xE3 h\xECnh th\xE0nh v\xF9ng \u0111\u1EC9nh \u0111i ngang (\u2265 20 n\u1EBFn)", len >= 20, `${len} n\u1EBFn`);
  const a = atr[last] || 1;
  const spring = w.events.filter((e) => e.event === (buy ? "Spring" : "UT")).pop();
  const stop = buy ? Math.min(Lo, spring?.price ?? Lo) - 0.5 * a : Math.max(H, spring?.price ?? H) + 0.5 * a;
  const target = buy ? H + height : Lo - height;
  const risk = buy ? close - stop : stop - close, reward = buy ? target - close : close - target;
  const ratio = risk > 0 ? reward / risk : null;
  add(
    "reward",
    `L\u1EE3i nhu\u1EADn \u01B0\u1EDBc l\u01B0\u1EE3ng \u2265 ${WYCKOFF_TESTS.minRewardRisk}\xD7 r\u1EE7i ro`,
    ratio == null ? false : ratio >= WYCKOFF_TESTS.minRewardRisk,
    ratio == null ? "gi\xE1 \u0111\xE3 qua m\u1EE9c c\u1EAFt l\u1ED7" : `m\u1EE5c ti\xEAu ${fmt(target)} \xB7 c\u1EAFt l\u1ED7 ${fmt(stop)} \xB7 ${ratio.toFixed(1)}\xD7`
  );
  const passed = items.filter((x) => x.ok === true).length, avail = items.filter((x) => x.ok !== null).length;
  let extreme = buy ? -Infinity : Infinity;
  for (let j = start; j <= last; j++) extreme = buy ? Math.max(extreme, bars[j].high) : Math.min(extreme, bars[j].low);
  const leg = buy ? extreme - Lo : H - extreme;
  return {
    side,
    items,
    passed,
    avail,
    channel,
    rs,
    targets: WYCKOFF_TESTS.causeK.map((k) => ({ k, price: buy ? H + k * height : Lo - k * height })),
    retrace50: leg > height ? buy ? Lo + leg / 2 : H - leg / 2 : null,
    rewardRisk: ratio == null ? null : { entry: close, stop, target, ratio },
    note: WYCKOFF_TESTS_NOTE
  };
}

// src/lib/quant-core/wyckoffPlan.ts
var WYCKOFF_PLAN = {
  /** Tỷ trọng mỗi lần (tr.54–58: khoảng 30% mỗi lần, chỉ mua thêm khi lần trước đang lãi). */
  sizes: [0.3, 0.3, 0.4],
  /** Giới hạn khối lượng mỗi lệnh theo KL TB20 (tr.58: 10–20%); mức giữa dùng làm mặc định. */
  liquidityPct: 0.15,
  liquidityBand: [0.1, 0.15, 0.2],
  stopATR: 0.5
};
var WYCKOFF_PLAN_NOTE = "V\xED d\u1EE5 minh ho\u1EA1 theo t\xE0i li\u1EC7u (3 l\u1EA7n, ch\u1EC9 mua th\xEAm khi l\u1EA7n tr\u01B0\u1EDBc \u0111ang l\xE3i, kh\xF4ng b\xECnh qu\xE2n gi\xE1 xu\u1ED1ng) \u2014 KH\xD4NG ph\u1EA3i khuy\u1EBFn ngh\u1ECB. \u0110i\u1EC3m v\xE0o ch\u01B0a c\xF3 l\u1EE3i th\u1EBF \u0111\xE3 ki\u1EC3m \u0111\u1ECBnh tr\xEAn d\u1EEF li\u1EC7u VN (POE v3 ngo\xE0i m\u1EABu PF 0,46). Kh\u1ED1i l\u01B0\u1EE3ng m\u1ED7i l\u1EC7nh 10\u201320% KL TB20 (m\u1EB7c \u0111\u1ECBnh 15%).";
var idx = (bars, d) => d ? bars.findIndex((b) => b.date === d) : -1;
var lastOf = (w, names) => [...w.events].filter((e) => names.includes(e.event) && e.confirmedIndex != null).sort((a, b) => a.index - b.index).pop() ?? null;
var firstOf = (w, names) => [...w.events].filter((e) => names.includes(e.event)).sort((a, b) => a.index - b.index)[0] ?? null;
function phaseSegments(bars, w) {
  if ((w.status ?? "active") !== "active" || w.phase === "undetermined") return [];
  const firstEv = w.events.length ? Math.min(...w.events.map((e) => e.index)) : -1;
  const start = w.rangeStartDate ? idx(bars, w.rangeStartDate) : firstEv;
  if (start < 0) return [];
  const last = bars.length - 1;
  const endR = w.rangeEndDate ? idx(bars, w.rangeEndDate) : last;
  const long = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
  const climax = firstOf(w, long ? ["PS", "SC"] : ["PSY", "BC"]);
  const aEnd = lastOf(w, ["ST", "AR"]);
  const cEv = lastOf(w, long ? ["Spring"] : ["UT", "UTAD"]);
  const dEv = lastOf(w, long ? ["SOS"] : ["SOW"]);
  const marks = [];
  const aStart = climax ? Math.min(climax.index, start) : null;
  if (aStart != null) marks.push({ phase: "A", at: aStart });
  const bStart = aEnd && aEnd.index > (aStart ?? -1) ? aEnd.index : aStart != null ? Math.min(last, aStart + 5) : start;
  marks.push({ phase: "B", at: bStart });
  if (cEv && cEv.index > bStart) marks.push({ phase: "C", at: cEv.index });
  if (dEv && dEv.index > marks[marks.length - 1].at) marks.push({ phase: "D", at: dEv.index });
  const close = bars[last].close;
  const beyond = w.rangeHigh != null && w.rangeLow != null && (long ? close > w.rangeHigh : close < w.rangeLow);
  const lastMark = () => marks[marks.length - 1];
  if (w.wyckoffPhase === "E" || lastMark().phase === "D" && beyond && endR >= 0 && endR < last) {
    const eAt = Math.max(lastMark().at + 1, endR >= 0 ? endR : last);
    if (eAt <= last) marks.push({ phase: "E", at: eAt });
  }
  const ORDER = "ABCDE";
  if (w.wyckoffPhase) {
    const k = ORDER.indexOf(w.wyckoffPhase);
    while (marks.length > 1 && ORDER.indexOf(lastMark().phase) > k) marks.pop();
    if (ORDER.indexOf(lastMark().phase) < k) {
      const after = w.events.filter((e) => e.confirmedIndex != null && e.index > lastMark().at).map((e) => e.index);
      const at = after.length ? Math.max(...after) : lastMark().at + 1;
      if (at <= last) marks.push({ phase: w.wyckoffPhase, at });
    }
  }
  for (let i = marks.length - 1; i > 0; i--) if (marks[i].at <= marks[i - 1].at) marks.splice(i - 1, 1);
  const segs = marks.map((m, i) => {
    const e = i + 1 < marks.length ? Math.max(m.at, marks[i + 1].at - 1) : last;
    return { phase: m.phase, startIndex: m.at, endIndex: e, startDate: bars[m.at].date, endDate: bars[e].date, current: i === marks.length - 1 };
  });
  return segs;
}
function tradePlan3(bars, w) {
  if ((w.status ?? "active") !== "active" || w.phase === "undetermined" || w.rangeHigh == null || w.rangeLow == null || !bars.length) return null;
  const long = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
  const last = bars.length - 1;
  const atr = atrSeries(bars, 14);
  const a = atr[last] || 0;
  const H = w.rangeHigh, L = w.rangeLow;
  const ev = w.evidence ?? null;
  const tranches = [];
  const S = WYCKOFF_PLAN.sizes;
  const fmtP = (v2) => Math.round(v2).toLocaleString("vi-VN");
  if (long) {
    const sp = ev?.springs.filter((x) => x.side === "spring").pop() ?? null;
    const spring = lastOf(w, ["Spring"]);
    const a1 = sp?.actionable ? sp.kind === 3 ? sp.confirmedIndex : sp.test.index : -1;
    const s1Stop = (sp?.price ?? spring?.price ?? L) - WYCKOFF_PLAN.stopATR * a;
    tranches.push({
      n: 1,
      sizePct: S[0],
      label: "L\u1EA7n 1 \u2014 Spring #3, ho\u1EB7c Test c\u1EE7a Spring #1/#2",
      price: a1 >= 0 ? bars[a1].close : null,
      stop: s1Stop,
      status: sp ? a1 >= 0 ? "done" : "pending" : "na",
      date: a1 >= 0 ? bars[a1].date : null,
      note: sp ? a1 >= 0 ? `Spring #${sp.kind}${sp.test ? `, Test ${sp.test.date}` : ""}` : `Spring #${sp.kind} \u2014 ch\u1EDD Test KL th\u1EA5p` : "ch\u01B0a c\xF3 Spring trong c\u1EA5u tr\xFAc"
    });
    const sos = [...w.events].filter((e) => e.event === "SOS" && e.confirmedIndex != null && e.index > a1).sort((x, y) => x.index - y.index).pop() ?? null;
    let a2 = -1, a2Name = "";
    if (a1 >= 0 && sos) {
      const lps = [...w.events].filter((e) => e.event === "LPS" && e.index > sos.index).sort((x, y) => x.index - y.index)[0];
      const buec = ev?.breaks.find((x) => x.kind === "JAC" && !x.failed && x.backup && x.backup.index > Math.max(a1, sos.index))?.backup ?? null;
      const cand = [lps ? { i: lps.index, n: "LPS" } : null, buec ? { i: buec.index, n: "BUEC" } : null].filter(Boolean);
      const first = cand.sort((x, y) => x.i - y.i)[0];
      if (first) {
        a2 = first.i;
        a2Name = first.n;
      }
    }
    tranches.push({
      n: 2,
      sizePct: S[1],
      label: "L\u1EA7n 2 \u2014 LPS / BUEC sau SOS (JAC)",
      price: a2 >= 0 ? bars[a2].close : null,
      stop: a2 >= 0 ? bars[a2].low - WYCKOFF_PLAN.stopATR * a : null,
      status: a1 < 0 ? "pending" : a2 >= 0 ? "done" : "pending",
      date: a2 >= 0 ? bars[a2].date : null,
      note: a1 < 0 ? "ch\u1EDD l\u1EA7n 1" : a2 >= 0 ? `${a2Name} ${bars[a2].date}; d\u1EDDi c\u1EAFt l\u1ED7 l\u1EA7n 1 v\u1EC1 ho\xE0 v\u1ED1n` : sos ? "ch\u1EDD nh\u1ECBp l\xF9i KL th\u1EA5p v\u1EC1 kh\xE1ng c\u1EF1 c\u0169 (LPS / BUEC)" : "ch\u1EDD SOS"
    });
    let lvl = H;
    if (sos) for (let j = sos.index; j <= (a2 >= 0 ? a2 : last); j++) lvl = Math.max(lvl, bars[j].high);
    let a3 = -1;
    if (a2 >= 0) {
      for (let j = a2 + 1; j <= last; j++) if (bars[j].close > lvl) {
        a3 = j;
        break;
      }
    }
    tranches.push({
      n: 3,
      sizePct: S[2],
      label: "L\u1EA7n 3 \u2014 v\u01B0\u1EE3t \u0111\u1EC9nh SOS / BU",
      price: lvl,
      stop: a2 >= 0 ? bars[a2].low - WYCKOFF_PLAN.stopATR * a : null,
      status: a3 >= 0 ? "done" : "pending",
      date: a3 >= 0 ? bars[a3].date : null,
      note: a2 < 0 ? "ch\u1EDD l\u1EA7n 2" : a3 >= 0 ? "\u0111\xE3 v\u01B0\u1EE3t \u2014 d\u1EDDi c\u1EAFt l\u1ED7 d\u01B0\u1EDBi LPS" : `ch\u1EDD \u0111\xF3ng c\u1EEDa tr\xEAn ${fmtP(lvl)}`
    });
  } else {
    const ut = ev?.springs.filter((x) => x.side === "ut").pop() ?? null;
    const a1 = ut?.actionable ? ut.kind === 3 ? ut.confirmedIndex : ut.test.index : -1;
    tranches.push({
      n: 1,
      sizePct: S[0],
      label: "B\u01B0\u1EDBc 1 \u2014 UT #3, ho\u1EB7c Test c\u1EE7a UT",
      price: a1 >= 0 ? bars[a1].close : null,
      stop: ut ? ut.price + WYCKOFF_PLAN.stopATR * a : null,
      status: ut ? a1 >= 0 ? "done" : "pending" : "na",
      date: a1 >= 0 ? bars[a1].date : null,
      note: ut ? `UT #${ut.kind}${a1 >= 0 ? "" : " \u2014 ch\u1EDD Test"}` : "ch\u01B0a c\xF3 UT trong c\u1EA5u tr\xFAc"
    });
    const sow = [...w.events].filter((e) => e.event === "SOW" && e.confirmedIndex != null && e.index > a1).sort((x, y) => x.index - y.index).pop() ?? null;
    const lpsy = sow ? [...w.events].filter((e) => e.event === "LPSY" && e.index > sow.index).sort((x, y) => x.index - y.index)[0] ?? null : null;
    tranches.push({
      n: 2,
      sizePct: S[1],
      label: "B\u01B0\u1EDBc 2 \u2014 LPSY sau SOW",
      price: lpsy ? bars[lpsy.index].close : null,
      stop: lpsy ? bars[lpsy.index].high + WYCKOFF_PLAN.stopATR * a : null,
      status: lpsy ? "done" : "pending",
      date: lpsy?.date ?? null,
      note: lpsy ? `LPSY ${lpsy.date}` : sow ? "ch\u1EDD nh\u1ECBp h\u1ED3i KL th\u1EA5p (LPSY)" : "ch\u1EDD SOW"
    });
    const lvl = L;
    let a3 = -1;
    for (let j = Math.max(a1, idx(bars, w.rangeStartDate)) + 1; j <= last; j++) if (bars[j].close < lvl) {
      a3 = j;
      break;
    }
    tranches.push({
      n: 3,
      sizePct: S[2],
      label: "B\u01B0\u1EDBc 3 \u2014 \u0111\xF3ng c\u1EEDa th\u1EE7ng h\u1ED7 tr\u1EE3 range",
      price: a3 >= 0 ? bars[a3].close : lvl,
      stop: null,
      status: a3 >= 0 ? "done" : "pending",
      date: a3 >= 0 ? bars[a3].date : null,
      note: a3 >= 0 ? "\u0111\xE3 th\u1EE7ng \u2014 tho\xE1t ph\u1EA7n c\xF2n l\u1EA1i (c\xE1c b\u01B0\u1EDBc gi\u1EA3m t\u1EF7 tr\u1ECDng kh\xF4ng b\u1EAFt bu\u1ED9c theo th\u1EE9 t\u1EF1)" : `ch\u1EDD \u0111\xF3ng c\u1EEDa d\u01B0\u1EDBi ${fmtP(lvl)}`
    });
  }
  let v = 0, c = 0;
  for (let j = Math.max(0, last - 19); j <= last; j++) {
    v += bars[j].volume;
    c++;
  }
  const adv = c ? v / c : 0;
  const lots = (pct2) => Math.floor(adv * pct2 / 100) * 100;
  const maxShares = adv > 0 ? lots(WYCKOFF_PLAN.liquidityPct) : null;
  const liquidity = adv > 0 ? WYCKOFF_PLAN.liquidityBand.map((pct2) => ({ pct: pct2, shares: lots(pct2), value: lots(pct2) * bars[last].close })) : [];
  return {
    side: long ? "buy" : "sell",
    title: long ? "K\u1EBF ho\u1EA1ch 3 l\u1EA7n mua (theo t\xE0i li\u1EC7u)" : "3 b\u01B0\u1EDBc gi\u1EA3m t\u1EF7 tr\u1ECDng (VN kh\xF4ng b\xE1n kh\u1ED1ng)",
    tranches,
    maxShares,
    maxValue: maxShares != null ? maxShares * bars[last].close : null,
    liquidity,
    note: WYCKOFF_PLAN_NOTE
  };
}

// src/lib/quant-core/wyckoffSignalValidation.ts
var WYCKOFF_SIGNAL_VALIDATION = {
  T1: { status: "EXPERIMENTAL", adverse: true, summary: "Ngo\xE0i m\u1EABu 132 l\u1EC7nh: th\u1EAFng 6,8%, TB \u22124,35%/l\u1EC7nh [KTC \u22125,47; \u22123,21], PF 0,14 \u2014 k\xE9m h\u01A1n v\xE0o l\u1EC7nh ng\u1EABu nhi\xEAn (\u22123,68%). Trong m\u1EABu PF 1,36: ph\u1EE5 thu\u1ED9c ch\u1EBF \u0111\u1ED9 th\u1ECB tr\u01B0\u1EDDng." },
  T2: { status: "EXPERIMENTAL", adverse: false, summary: "Ngo\xE0i m\u1EABu m\u1EDBi 5 l\u1EC7nh (< 30) \u2014 ch\u01B0a ki\u1EC3m \u0111\u1ECBnh \u0111\u01B0\u1EE3c. To\xE0n k\u1EF3 55 l\u1EC7nh PF 0,81." },
  T3: { status: "EXPERIMENTAL", adverse: false, summary: "Ngo\xE0i m\u1EABu m\u1EDBi 2 l\u1EC7nh (< 30) \u2014 ch\u01B0a ki\u1EC3m \u0111\u1ECBnh \u0111\u01B0\u1EE3c. To\xE0n k\u1EF3 27 l\u1EC7nh PF 1,55." },
  "PH-buy:C": { status: "EXPERIMENTAL", adverse: true, summary: "Ngo\xE0i m\u1EABu 54 l\u1EA7n: v\u01B0\u1EE3t tr\u1ED9i 20 phi\xEAn \u22123,01% [KTC \u22124,92; \u22120,94] \u2014 NG\u01AF\u1EE2C k\u1EF3 v\u1ECDng." },
  "PH-buy:D": { status: "EXPERIMENTAL", adverse: false, summary: "Ngo\xE0i m\u1EABu 40 l\u1EA7n: \u22120,31% [\u22123,51; 2,96]; to\xE0n k\u1EF3 \u22121,23% \u2014 kh\xF4ng c\xF3 l\u1EE3i th\u1EBF." },
  "PH-buy:E": { status: "EXPERIMENTAL", adverse: false, summary: "Ngo\xE0i m\u1EABu 67 l\u1EA7n: \u22121,05% [\u22123,06; 1,45] \u2014 kh\xF4ng c\xF3 l\u1EE3i th\u1EBF (v3: to\xE0n k\u1EF3 \u22124,98%, ng\u01B0\u1EE3c k\u1EF3 v\u1ECDng)." },
  "PH-sell:D": { status: "EXPERIMENTAL", adverse: false, summary: "Ngo\xE0i m\u1EABu 50 l\u1EA7n: +0,10% [\u22122,55; 2,76] \u2014 kh\xF4ng c\xF3 l\u1EE3i th\u1EBF." },
  "PH-sell:E": { status: "EXPERIMENTAL", adverse: false, summary: "Ngo\xE0i m\u1EABu 113 l\u1EA7n: \u22120,47% [\u22122,35; 1,44] \u2014 \u0111\xFAng chi\u1EC1u nh\u01B0ng ch\u01B0a c\xF3 \xFD ngh\u0129a." }
};

// src/lib/quant-core/wyckoffSignals.ts
var WYCKOFF_SIGNAL_FRESH_BARS = 5;
var LABEL = {
  T1: "L\u1EA7n 1 kh\u1EDBp (Spring #3 / Test)",
  T2: "L\u1EA7n 2 kh\u1EDBp (LPS / BUEC sau SOS)",
  T3: "L\u1EA7n 3 kh\u1EDBp (v\u01B0\u1EE3t \u0111\u1EC9nh BU)",
  "PH-buy:C": "V\xE0o Phase C (t\xEDch lu\u1EF9)",
  "PH-buy:D": "V\xE0o Phase D (t\xEDch lu\u1EF9)",
  "PH-buy:E": "V\xE0o Phase E (t\u0103ng)",
  "PH-sell:D": "V\xE0o Phase D (ph\xE2n ph\u1ED1i)",
  "PH-sell:E": "V\xE0o Phase E (gi\u1EA3m)"
};
function wyckoffSignals(bars, w) {
  if ((w.status ?? "active") !== "active" || w.phase === "undetermined" || !bars.length) return [];
  const last = bars.length - 1;
  const at = (d) => bars.findIndex((b) => b.date === d);
  const out = [];
  const push = (key, side, date, knownIdx) => {
    if (knownIdx < 0) return;
    const age = last - knownIdx;
    out.push({ key, side, label: LABEL[key], date, knownDate: bars[knownIdx].date, ageBars: age, fresh: age <= WYCKOFF_SIGNAL_FRESH_BARS, validation: WYCKOFF_SIGNAL_VALIDATION[key] });
  };
  const p = w.tranches;
  if (p && p.side === "buy") {
    for (const t of p.tranches) if (t.status === "done" && t.date) push(`T${t.n}`, "buy", t.date, at(t.date));
  }
  const cur = w.phases?.find((x) => x.current);
  if (cur) {
    const long = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
    const key = `PH-${long ? "buy" : "sell"}:${cur.phase}`;
    if (LABEL[key]) {
      const opener = w.events.filter((e) => e.index === cur.startIndex && e.confirmedIndex != null).map((e) => e.confirmedIndex);
      push(key, long ? "buy" : "sell", cur.startDate, opener.length ? Math.max(...opener) : cur.startIndex);
    }
  }
  return out.sort((a, b) => a.ageBars - b.ageBars);
}

// src/lib/quant-core/eventStudy.ts
var COSTS = { buy: 15e-4, sell: 15e-4 + 1e-3 };

// src/lib/quant-core/index.ts
var ENGINE_VERSION = "2.3.0";
var WYCKOFF_DEFAULT_ENGINE = "v2";
function wyckoffTimeframePolicy(tf) {
  const t = tf ?? "D";
  if (t === "1m" || t === "5m") return { enabled: false, note: `Wyckoff t\u1EAFt \u1EDF khung ${t}: khung qu\xE1 nh\u1ECF, nhi\u1EC5u, ch\u01B0a ki\u1EC3m \u0111\u1ECBnh \u2014 xem khung D.` };
  if (t === "15m" || t === "1H") return { enabled: true, note: `Khung ${t}: Wyckoff khung nh\u1ECF kh\xF4ng th\u1EC3 hi\u1EC7n xu h\u01B0\u1EDBng, ch\u01B0a ki\u1EC3m \u0111\u1ECBnh \u2014 ch\u1EC9 d\xF9ng \u0111\u1EC3 tinh ch\u1EC9nh \u0111i\u1EC3m v\xE0o khi khung D \u0111\xE3 r\xF5.` };
  if (t === "W" || t === "M") return { enabled: true, note: `Khung ${t}: ch\u01B0a ki\u1EC3m \u0111\u1ECBnh th\u1ED1ng k\xEA (benchmark ch\u1EC9 tr\xEAn khung D).` };
  return { enabled: true, note: null };
}
function wyckoffFor(bars, engine, tf, isIndex, benchmark) {
  const policy = wyckoffTimeframePolicy(tf);
  const r = engine === "v3" ? classifyWyckoffV3(bars, { timeframe: tf, isIndex }) : classifyWyckoffV2(bars);
  if (!policy.enabled) {
    return { ...r, phase: "undetermined", status: "insufficient", statusReason: policy.note, events: [], structures: [], historical: null, checks: [], caveats: [policy.note] };
  }
  const caveats = [...r.caveats ?? []];
  if (policy.note && !caveats.some((c) => c.startsWith(`Khung ${tf}`))) caveats.unshift(policy.note);
  if (isIndex && !caveats.some((c) => c.includes("kh\xF4ng giao d\u1ECBch tr\u1EF1c ti\u1EBFp"))) {
    caveats.push("VN-Index l\xE0 ch\u1EC9 s\u1ED1, kh\xF4ng giao d\u1ECBch tr\u1EF1c ti\u1EBFp; kh\u1ED1i l\u01B0\u1EE3ng l\xE0 KL to\xE0n th\u1ECB tr\u01B0\u1EDDng (kh\xF4ng ph\u1EA3i d\xF2ng ti\u1EC1n v\xE0o m\u1ED9t t\xE0i s\u1EA3n).");
  }
  const bm = !isIndex && (tf ?? "D") === "D" ? benchmark : null;
  const tests = wyckoffNineTests(bars, r, bm);
  const rsItem = isIndex ? tests?.items.find((x) => x.key === "rs") : void 0;
  if (rsItem) rsItem.value = "kh\xF4ng \xE1p d\u1EE5ng cho ch\u1EC9 s\u1ED1";
  const out = { ...r, caveats, tests, phases: phaseSegments(bars, r), tranches: isIndex ? null : tradePlan3(bars, r) };
  out.signals = wyckoffSignals(bars, out);
  return out;
}

// src/lib/quant-core/convergence.ts
var CONVERGENCE_VERSION = "convergence-v2/H1";
var CONVERGENCE = {
  /** Trọng số (tổng 100) — đặt trước kiểm định. */
  weights: { wyckoff: 30, zone: 25, effort: 15, rs: 10, tests: 10, liquidity: 10 },
  gradeA: 70,
  gradeB: 50,
  /** Gom mức giá trong ±1,5% (như hợp lưu tay cầm của CAN SLIM). */
  clusterTol: 0.015,
  /** Cụm hợp lưu phải nằm trong 1,5 ATR quanh giá (phía mua: dưới hoặc tại giá). */
  zoneATR: 1.5,
  effortBars: 20,
  /** Sức chứa mỗi lệnh = 15% GTGD TB20: ≥ 5 tỷ đủ điểm, ≥ 2 tỷ nửa điểm. */
  liquidityPct: 0.15,
  liquidityFull: 5e9,
  liquidityHalf: 2e9,
  /** Tín hiệu kế hoạch 3 lần trong ≤ 5 nến -> trạng thái READY. */
  freshBars: 5
};
var BULL_VSA = /* @__PURE__ */ new Set(["Selling Climax", "Stopping Volume", "Shakeout", "No Supply"]);
var BEAR_VSA = /* @__PURE__ */ new Set(["Buying Climax", "Upthrust", "No Demand"]);
function clusterLevels(levels, tol = CONVERGENCE.clusterTol) {
  const sorted = levels.filter((x) => Number.isFinite(x.price) && x.price > 0).sort((a, b) => a.price - b.price);
  const out = [];
  for (const x of sorted) {
    const cl = out[out.length - 1];
    if (cl && Math.abs(x.price - cl.price) <= tol * x.price) {
      cl.price = (cl.price * cl.weight + x.price * x.weight) / (cl.weight + x.weight);
      cl.weight += x.weight;
      cl.low = Math.min(cl.low, x.price);
      cl.high = Math.max(cl.high, x.price);
      cl.sources.push(x.label);
      cl.kinds.add(x.kind);
    } else out.push({ price: x.price, weight: x.weight, low: x.price, high: x.price, sources: [x.label], kinds: /* @__PURE__ */ new Set([x.kind]) });
  }
  return out;
}
var isBuyPhase = (w) => w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
function convergenceAt(bars, benchmark, opts = {}) {
  if (bars.length < 60) return null;
  const w = wyckoffFor(bars, WYCKOFF_DEFAULT_ENGINE, "D", false, benchmark ?? null);
  if (w.status !== "active" || w.phase === "undetermined") return null;
  const buy = isBuyPhase(w);
  const side = buy ? "buy" : "sell";
  const dir = buy ? "bullish" : "bearish";
  const last = bars.length - 1;
  const close = bars[last].close;
  const atr = atrSeries(bars, 14);
  const a = atr[last] || close * 0.02;
  const W2 = CONVERGENCE.weights;
  const comp = [];
  const add = (key, label, max, frac, value) => comp.push({ key, label, max, points: Math.round(max * Math.max(0, Math.min(1, frac)) * 10) / 10, ok: frac >= 0.5, value });
  const cur = w.phases?.find((x) => x.current)?.phase ?? null;
  const spring = w.evidence?.springs.filter((x) => x.side === (buy ? "spring" : "ut")).pop() ?? null;
  const wFrac = buy ? cur === "D" ? 0.9 : cur === "E" ? 0.7 : cur === "C" ? spring?.actionable ? 1 : 0.6 : 0.3 : cur === "D" || cur === "E" ? 1 : cur === "C" ? spring?.actionable ? 0.8 : 0.6 : 0.3;
  add(
    "wyckoff",
    "Wyckoff \u0111ang ho\u1EA1t \u0111\u1ED9ng (pha A\u2013E)",
    W2.wyckoff,
    wFrac,
    `${buy ? "T\xEDch lu\u1EF9" : "Ph\xE2n ph\u1ED1i"} \xB7 Phase ${cur ?? w.wyckoffPhase ?? "?"}${spring ? ` \xB7 ${spring.side === "spring" ? "Spring" : "UT"} #${spring.kind}${spring.actionable ? " \u0111\u1EE7 \u0111i\u1EC1u ki\u1EC7n" : " ch\u1EDD Test"}` : ""}`
  );
  const st = computeStructure(bars);
  const obs = detectOrderBlocks(bars, st.events, st.atr).filter((z) => z.dir === dir && z.status === "ACTIVE");
  const fvgs = detectFVG(bars, st.atr, { limitPct: 0.07 }).filter((g) => g.dir === dir && (g.state === "OPEN" || g.state === "PARTIAL"));
  const levels = [];
  const lv = (kind, label, price, weight) => {
    if (price != null && Number.isFinite(price)) levels.push({ kind, label, price, weight });
  };
  if (buy) {
    lv("wyckoff", "H\u1ED7 tr\u1EE3 range Wyckoff", w.rangeLow, 1);
    const creek = w.evidence?.creek?.points;
    if (creek?.length) lv("wyckoff", "Creek", creek[creek.length - 1].price, 0.8);
    const lps = w.events.filter((e) => e.event === "LPS").pop();
    if (lps) lv("wyckoff", "LPS", lps.price, 1);
    if (spring) lv("wyckoff", "\u0110\xE1y Spring", spring.price, 0.8);
  } else {
    lv("wyckoff", "Kh\xE1ng c\u1EF1 range Wyckoff", w.rangeHigh, 1);
    const ice = w.evidence?.ice?.points;
    if (ice?.length) lv("wyckoff", "ICE", ice[ice.length - 1].price, 0.8);
    const lpsy = w.events.filter((e) => e.event === "LPSY").pop();
    if (lpsy) lv("wyckoff", "LPSY", lpsy.price, 1);
    if (spring) lv("wyckoff", "\u0110\u1EC9nh UT", spring.price, 0.8);
  }
  for (const z of obs.slice(-3)) lv("ob", `OB ${buy ? "t\u0103ng" : "gi\u1EA3m"} ${z.date}`, (z.top + z.bottom) / 2, 1);
  for (const g of fvgs.slice(-3)) lv("fvg", `FVG ${buy ? "t\u0103ng" : "gi\u1EA3m"} ${g.endDate}`, (g.top + g.bottom) / 2, 0.8);
  const vp = buildVolumeProfile(bars.slice(-60), { method: "triangular" });
  if (vp) lv("poc", "POC 60 phi\xEAn", vp.poc, 0.7);
  const dr = computeDealingRange(bars, st.pivots);
  if (dr) {
    const anchor = dr.highIndex < dr.lowIndex ? dr.highIndex : dr.lowIndex;
    const pts = anchoredVwap(bars, anchor);
    const lastV = pts[pts.length - 1];
    if (lastV) lv("avwap", "AVWAP swing", lastV.vwap, 0.7);
  }
  const clusters = clusterLevels(levels).filter((c2) => (buy ? c2.price <= close + 0.25 * a : c2.price >= close - 0.25 * a) && Math.abs(close - c2.price) <= CONVERGENCE.zoneATR * a);
  const best = clusters.sort((x, y) => y.kinds.size - x.kinds.size || y.weight - x.weight)[0] ?? null;
  const zone = best ? {
    price: best.price,
    low: best.low,
    high: best.high,
    weight: Math.round(best.weight * 100) / 100,
    sources: best.sources,
    kinds: [...best.kinds],
    distancePct: (close / best.price - 1) * 100
  } : null;
  add(
    "zone",
    "H\u1EE3p l\u01B0u v\xF9ng gi\xE1 c\xF9ng chi\u1EC1u (Wyckoff \u2229 OB \u2229 FVG \u2229 POC \u2229 AVWAP)",
    W2.zone,
    zone ? (zone.kinds.length - 1) / 3 + (zone.kinds.includes("wyckoff") ? 0.15 : 0) : 0,
    zone ? `${zone.kinds.length} lo\u1EA1i m\u1EE9c \xB7 ${Math.round(zone.low).toLocaleString("vi-VN")}\u2013${Math.round(zone.high).toLocaleString("vi-VN")} \xB7 c\xE1ch gi\xE1 ${zone.distancePct.toFixed(1)}%` : "kh\xF4ng c\xF3 c\u1EE5m trong 1,5 ATR"
  );
  const from = Math.max(0, last - CONVERGENCE.effortBars + 1);
  const vsa = detectVsa(bars).filter((s2) => s2.confirmedIndex >= from && s2.confirmedIndex <= last);
  const good = vsa.filter((s2) => (buy ? BULL_VSA : BEAR_VSA).has(s2.type)).length;
  const bad = vsa.filter((s2) => (buy ? BEAR_VSA : BULL_VSA).has(s2.type)).length;
  const act = w.tests?.items.find((x) => x.key === "activity") ?? null;
  add(
    "effort",
    buy ? "Cung c\u1EA1n / c\u1EA7u v\xE0o (VSA 20 phi\xEAn + KL t\u0103ng > KL gi\u1EA3m)" : "C\u1EA7u c\u1EA1n / cung ra (VSA 20 phi\xEAn + KL gi\u1EA3m > KL t\u0103ng)",
    W2.effort,
    (good > bad ? 0.5 : 0) + (act?.ok === true ? 0.5 : 0),
    `VSA c\xF9ng chi\u1EC1u ${good} / ng\u01B0\u1EE3c chi\u1EC1u ${bad}${act ? ` \xB7 ${act.value}` : ""}`
  );
  const rs = w.tests?.rs ?? null;
  add(
    "rs",
    buy ? "M\u1EA1nh h\u01A1n VN-Index (20 phi\xEAn)" : "Y\u1EBFu h\u01A1n VN-Index (20 phi\xEAn)",
    W2.rs,
    rs ? (buy ? rs.diffPct > 0 : rs.diffPct < 0) ? 1 : 0 : 0,
    rs ? `m\xE3 ${rs.stockPct >= 0 ? "+" : ""}${rs.stockPct.toFixed(1)}% \xB7 VN-Index ${rs.indexPct >= 0 ? "+" : ""}${rs.indexPct.toFixed(1)}%` : "ch\u01B0a c\xF3 d\u1EEF li\u1EC7u ch\u1EC9 s\u1ED1"
  );
  const t9 = w.tests ?? null;
  add("tests", `9 ph\xE9p th\u1EED ${buy ? "mua" : "b\xE1n"}`, W2.tests, t9 && t9.avail ? t9.passed / t9.avail : 0, t9 ? `${t9.passed}/${t9.avail} \u0111\u1EA1t` : "\u2014");
  let s = 0, c = 0;
  for (let j = from; j <= last; j++) {
    const b = bars[j];
    s += Number(b.value) > 0 ? Number(b.value) : b.close * b.volume;
    c++;
  }
  const avgValue20 = opts.avgValue20 ?? (c ? s / c : 0);
  const cap = avgValue20 * CONVERGENCE.liquidityPct;
  add("liquidity", "S\u1EE9c ch\u1EE9a m\u1ED7i l\u1EC7nh (15% GTGD TB20)", W2.liquidity, cap >= CONVERGENCE.liquidityFull ? 1 : cap >= CONVERGENCE.liquidityHalf ? 0.5 : 0, `${(cap / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} t\u1EF7 \u0111\u1ED3ng`);
  const score = Math.round(comp.reduce((x, y) => x + y.points, 0));
  const grade = score >= CONVERGENCE.gradeA ? "A" : score >= CONVERGENCE.gradeB ? "B" : "C";
  const tr = w.tranches?.tranches.filter((x) => x.status === "done").pop() ?? null;
  const signals = (w.signals ?? []).map((x) => ({ key: x.key, knownDate: x.knownDate, fresh: x.fresh, adverse: x.validation.adverse }));
  const ready = signals.some((x) => x.fresh && /^T[123]$/.test(x.key)) || w.tranches?.side === "sell" && signals.some((x) => x.fresh);
  return {
    version: CONVERGENCE_VERSION,
    side,
    status: ready ? "READY" : "WATCH",
    score,
    grade,
    components: comp,
    zone,
    levels,
    wyckoff: {
      engine: w.engine ?? WYCKOFF_DEFAULT_ENGINE,
      phase: w.phase,
      wyckoffPhase: w.wyckoffPhase ?? null,
      kind: w.kind ?? null,
      cyclePhase: cur,
      rangeHigh: w.rangeHigh,
      rangeLow: w.rangeLow,
      rangeStartDate: w.rangeStartDate,
      rangeEndDate: w.rangeEndDate,
      testsPassed: t9?.passed ?? null,
      testsAvail: t9?.avail ?? null,
      tranche: tr ? { n: tr.n, status: tr.status, date: tr.date } : null,
      signals
    },
    liquidity: { avgValue20: Math.round(avgValue20), capacity: [0.1, 0.15, 0.2].map((pct2) => ({ pct: pct2, value: Math.round(avgValue20 * pct2) })) },
    dataAsOf: bars[last].date,
    close
  };
}
export {
  CONVERGENCE,
  CONVERGENCE_VERSION,
  ENGINE_VERSION,
  WYCKOFF_DEFAULT_ENGINE,
  clusterLevels,
  convergenceAt
};
