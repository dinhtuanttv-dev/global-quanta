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
  let atr2 = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRange(bars, i);
    if (i < period) {
      sum += tr;
      atr2 = sum / (i + 1);
    } else {
      atr2 = (atr2 * (period - 1) + tr) / period;
    }
    out[i] = atr2;
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
  const atr2 = atrSeries(bars, p.atrPeriod);
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
      const a = atr2[i] > 0 ? atr2[i] : 1;
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
  return { pivots: pivots2, events, trend, atr: atr2 };
}

// src/lib/quant-core/zones.ts
var OB_EXPIRY_BARS = 120;
function detectOrderBlocks(bars, events, atr2) {
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
    const a = atr2[ev.index] > 0 ? atr2[ev.index] : 1;
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
function detectFVG(bars, atr2, params = {}) {
  const p = { minATR: 0.25, minTicks: 2, limitPct: 0.07, isIndex: false, ...params };
  const out = [];
  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    const a = atr2[i] > 0 ? atr2[i] : 0;
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
  const atr2 = atrSeries(bars, 14);
  const out = [];
  for (let i = W; i < bars.length; i++) {
    const zV = trailingZ(lv, i, W);
    const zS = trailingZ(sp, i, W);
    if (zV === null || zS === null) continue;
    const b = bars[i];
    const prev = bars[i - 1];
    const c = clv(b);
    const slope2 = i >= 6 ? ema[i - 1] / ema[i - 6] - 1 : 0;
    const up = slope2 > 0;
    const down = slope2 < 0;
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
    else if (zV >= 1.5 && Math.abs(b.close - prev.close) <= 0.3 * (atr2[i] || Infinity)) type = "Absorption";
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
function valueArea(vol, poc, pct3 = 0.7) {
  const total = vol.reduce((s, v) => s + v, 0);
  let lo = poc;
  let hi = poc;
  let acc = vol[poc];
  while (acc < pct3 * total && (lo > 0 || hi < vol.length - 1)) {
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
function classifySpringBar(bars, k, ci, level, side, atr2, forcedKind) {
  const E = WYCKOFF_EVIDENCE;
  const A = atr2 ?? atrSeries(bars, 14);
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
      const near2 = side === "spring" ? b.low <= level + E.testNearATR * (A[j] || a) : b.high >= level - E.testNearATR * (A[j] || a);
      const holds = side === "spring" ? b.low >= extreme : b.high <= extreme;
      if (near2 && holds && b.volume < avgBefore(vols, j, E.avgWindow) && b.volume < E.testVolVsSpring * bars[k].volume) {
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
function levelAt(pts2, x, dir) {
  const known = pts2.filter((p) => p.ci < x);
  if (known.length < 2 || x <= known[known.length - 1].index) return null;
  const a = known[known.length - 2].price, b = known[known.length - 1].price;
  return dir === 1 ? Math.max(a, b) : Math.min(a, b);
}
var BREAK_HORIZON = 40;
function lineBreak(bars, range, pts2, dir, atr2) {
  const E = WYCKOFF_EVIDENCE;
  const spreads2 = bars.map((x) => x.high - x.low);
  const vols = bars.map((x) => x.volume);
  const n = bars.length;
  const mid = (range.high + range.low) / 2;
  let weak = null;
  for (let x = range.start + 2 * E.pivotK + 1; x < Math.min(n, range.end + BREAK_HORIZON + 1); x++) {
    const L = levelAt(pts2, x, dir);
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
      const b = bars[j], a = atr2[j] || 1;
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
  const len2 = range.end - range.start + 1;
  if (len2 < 20) return null;
  const seg = bars.slice(range.start, range.end + 1);
  const half = Math.floor(len2 / 2);
  const f = [];
  let li = 0, hi = 0;
  seg.forEach((b, i) => {
    if (b.low < seg[li].low) li = i;
    if (b.high > seg[hi].high) hi = i;
  });
  const lp = li / (len2 - 1), hp = hi / (len2 - 1);
  f.push({
    key: "extremes",
    label: "V\u1ECB tr\xED \u0111\xE1y / \u0111\u1EC9nh th\u1EA5p nh\u1EA5t \u2013 cao nh\u1EA5t trong range",
    value: `\u0111\xE1y \u1EDF ${Math.round(lp * 100)}%, \u0111\u1EC9nh \u1EDF ${Math.round(hp * 100)}% th\u1EDDi gian`,
    vote: lp <= 0.5 && hp > 0.5 ? 1 : hp <= 0.5 && lp > 0.5 ? -1 : 0
  });
  const lows = pivots(bars, range.start + half, range.end, "low", 2).filter((p) => p.ci <= range.end);
  const highs = pivots(bars, range.start + half, range.end, "high", 2).filter((p) => p.ci <= range.end);
  const slope2 = (ps) => ps.length >= 2 ? Math.sign(ps[ps.length - 1].price - ps[0].price) : 0;
  const sl = slope2(lows), sh = slope2(highs);
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
  const atr2 = atrSeries(bars, 14);
  const springs = [];
  const confirmations = [];
  for (const e of events) {
    if ((e.event === "Spring" || e.event === "UT" || e.event === "UTAD") && e.confirmedIndex != null) {
      const forced = e.label ? V3_KIND[e.label] : void 0;
      springs.push(classifySpringBar(bars, e.index, e.confirmedIndex, e.event === "Spring" ? range.low : range.high, e.event === "Spring" ? "spring" : "ut", atr2, forced));
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
  const up = hp.length >= 2 ? lineBreak(bars, range, hp, 1, atr2) : null;
  const dn = lp.length >= 2 ? lineBreak(bars, range, lp, -1, atr2) : null;
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
  for (let len2 = WYCKOFF_RANGE.maxBars; len2 >= WYCKOFF_RANGE.minBars; len2 -= 5) {
    for (let end = n - 1; end >= Math.max(WYCKOFF_RANGE.minBars, n - 1 - WYCKOFF_RANGE.recentBars); end--) {
      const start = end - len2 + 1;
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
  const atr2 = atrSeries(bars, 14);
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
  const a = (k) => atr2[k] || 1;
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
  const fmt6 = (v) => Math.round(v).toLocaleString("vi-VN");
  let staleReason = null;
  if (res.phase !== "undetermined") {
    if ((res.phase === "spring" || res.phase === "test") && springBroken != null) {
      staleReason = `Spring ${bars[spring].date} \u0111\xE3 b\u1ECB ph\xE1: \u0111\xF3ng c\u1EEDa d\u01B0\u1EDBi \u0111\xE1y Spring (${fmt6(bars[spring].low)}) ng\xE0y ${bars[springBroken].date}.`;
    } else if (res.phase === "distribution" && decisive?.phase === "distribution" && utBroken != null) {
      staleReason = `UT ${bars[ut].date} \u0111\xE3 b\u1ECB ph\xE1: \u0111\xF3ng c\u1EEDa tr\xEAn \u0111\u1EC9nh UT (${fmt6(bars[ut].high)}) ng\xE0y ${bars[utBroken].date}.`;
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
  const n = c.length, atr2 = atrSeries2(c, o.atrN), hv = hasVolume(c);
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
    const rng = c[i].high - c[i].low, ref = i > 0 && isFinite(atr2[i - 1]) ? atr2[i - 1] : atr2[i];
    spreadRel[i] = ref > 0 ? rng / ref : 1;
    clv2[i] = rng > 0 ? (2 * c[i].close - c[i].high - c[i].low) / rng : 0;
    body[i] = rng > 0 ? Math.abs(c[i].close - c[i].open) / rng : 0;
  }
  return { atr: atr2, volRel, spreadRel, clv: clv2, body, hasVolume: hv };
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
  const slope2 = (c[b].high - c[a].high) / (b - a);
  return resPrice > c[b].high + slope2 * (iAR - b);
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
  const n = i1 - i0 + 1, atr2 = m.atr[i1] || 1, volMean = vs / n, range = peak - lo;
  const type = lo < res ? "deep-into-TR" : n >= o.buaMinBars && range <= o.buaMaxRangeATR * atr2 ? "mini-TR" : "shallow-pullback";
  return { n, low: lo, iLow, volMean, type, rangeATR: range / atr2, duration: volMean < 1 ? "ng\u1EAFn (KLGD th\u1EA5p)" : volMean >= o.highVol ? "d\xE0i (KLGD l\u1EDBn)" : "trung b\xECnh" };
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
function trendChannel(bars, start, kind, atr2) {
  const A = atr2 ?? atrSeries(bars, 14);
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
  const atr2 = atrSeries(bars, 14);
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
  const channel = trendChannel(bars, start, buy ? "down" : "up", atr2);
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
  const len2 = endR - start + 1;
  add("base", buy ? "\u0110\xE3 h\xECnh th\xE0nh n\u1EC1n \u0111i ngang (\u2265 20 n\u1EBFn)" : "\u0110\xE3 h\xECnh th\xE0nh v\xF9ng \u0111\u1EC9nh \u0111i ngang (\u2265 20 n\u1EBFn)", len2 >= 20, `${len2} n\u1EBFn`);
  const a = atr2[last] || 1;
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
  const atr2 = atrSeries(bars, 14);
  const a = atr2[last] || 0;
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
  const lots = (pct3) => Math.floor(adv * pct3 / 100) * 100;
  const maxShares = adv > 0 ? lots(WYCKOFF_PLAN.liquidityPct) : null;
  const liquidity = adv > 0 ? WYCKOFF_PLAN.liquidityBand.map((pct3) => ({ pct: pct3, shares: lots(pct3), value: lots(pct3) * bars[last].close })) : [];
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
  const atr2 = atrSeries(bars, 14);
  const a = atr2[last] || close * 0.02;
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
    const pts2 = anchoredVwap(bars, anchor);
    const lastV = pts2[pts2.length - 1];
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
    liquidity: { avgValue20: Math.round(avgValue20), capacity: [0.1, 0.15, 0.2].map((pct3) => ({ pct: pct3, value: Math.round(avgValue20 * pct3) })) },
    dataAsOf: bars[last].date,
    close
  };
}

// src/lib/quant-core/mtf/patterns.ts
var PATTERN_PARAMS = { eqAtr: 1, shoulderAtr: 1.5, neckMinAtr: 1.5, neckMaxSlopeAtr: 1.5, waitMult: 1.5 };
var neckAt = (nk, j) => nk.i1 === nk.i0 ? nk.p0 : nk.p0 + (nk.p1 - nk.p0) * (j - nk.i0) / (nk.i1 - nk.i0);
function resolve(bars, p, extreme, width, pp) {
  const last = Math.min(bars.length - 1, p.confirmedIndex + Math.max(10, Math.round(width * pp.waitMult)));
  for (let j = p.confirmedIndex; j <= last; j++) {
    const c = bars[j].close;
    const nk = neckAt(p.neck, j);
    if (p.dir === 1 ? c > nk : c < nk) {
      p.breakIndex = j;
      return;
    }
    if (p.dir === 1 ? c < extreme : c > extreme) {
      p.failIndex = j;
      return;
    }
  }
  if (last < bars.length - 1) p.failIndex = last + 1;
}
function detectPatterns(bars, atr2, mid, pp = PATTERN_PARAMS) {
  const out = [];
  for (let k = 2; k < mid.length; k++) {
    const s2 = mid[k], s1 = mid[k - 1], s0 = mid[k - 2];
    const a = Math.max(atr2[s2.index], 1e-9);
    const conf = s2.confirmedIndex;
    if (s0.kind === s2.kind && Math.abs(s2.price - s0.price) <= pp.eqAtr * a) {
      const prev = k >= 3 ? mid[k - 3] : null;
      const dir = s0.kind === "L" ? 1 : -1;
      const ext = dir === 1 ? Math.min(s0.price, s2.price) : Math.max(s0.price, s2.price);
      const height = Math.abs(s1.price - ext);
      const ctx = prev ? dir === 1 ? prev.price > s1.price : prev.price < s1.price : false;
      if (height >= pp.neckMinAtr * a && ctx) {
        const p = {
          type: dir === 1 ? "W" : "M",
          dir,
          points: [
            { index: s0.index, price: s0.price, label: dir === 1 ? "\u0110\xE1y 1" : "\u0110\u1EC9nh 1" },
            { index: s1.index, price: s1.price, label: "C\u1ED5" },
            { index: s2.index, price: s2.price, label: dir === 1 ? "\u0110\xE1y 2" : "\u0110\u1EC9nh 2" }
          ],
          neck: { i0: s1.index, p0: s1.price, i1: s1.index, p1: s1.price },
          start: prev ? prev.index : s0.index,
          confirmedIndex: conf,
          breakIndex: null,
          failIndex: null,
          height,
          target: s1.price + dir * height
        };
        resolve(bars, p, ext, s2.index - s0.index, pp);
        out.push(p);
      }
    }
    if (k >= 4) {
      const L1 = mid[k - 4], N1 = mid[k - 3], Hd = mid[k - 2], N2 = mid[k - 1], L3 = s2;
      if (L1.kind === L3.kind && Hd.kind === L1.kind) {
        const dir = L1.kind === "L" ? 1 : -1;
        const headBeyond = dir === 1 ? Hd.price < L1.price && Hd.price < L3.price : Hd.price > L1.price && Hd.price > L3.price;
        const shouldersEq = Math.abs(L1.price - L3.price) <= pp.shoulderAtr * a;
        const neckFlat = Math.abs(N1.price - N2.price) <= pp.neckMaxSlopeAtr * a;
        const neck = { i0: N1.index, p0: N1.price, i1: N2.index, p1: N2.price };
        const height = Math.abs(neckAt(neck, Hd.index) - Hd.price);
        if (headBeyond && shouldersEq && neckFlat && height >= pp.neckMinAtr * a) {
          const nkEnd = neckAt(neck, L3.index);
          const p = {
            type: dir === 1 ? "IHS" : "HS",
            dir,
            points: [
              { index: L1.index, price: L1.price, label: "Vai tr\xE1i" },
              { index: N1.index, price: N1.price, label: "C\u1ED5" },
              { index: Hd.index, price: Hd.price, label: "\u0110\u1EA7u" },
              { index: N2.index, price: N2.price, label: "C\u1ED5" },
              { index: L3.index, price: L3.price, label: "Vai ph\u1EA3i" }
            ],
            neck,
            start: L1.index,
            confirmedIndex: conf,
            breakIndex: null,
            failIndex: null,
            height,
            target: nkEnd + dir * height
          };
          resolve(bars, p, Hd.price, L3.index - L1.index, pp);
          out.push(p);
        }
      }
    }
  }
  return out;
}
function patternStatusAt(p, t) {
  if (p.confirmedIndex > t) return null;
  if (p.breakIndex != null && p.breakIndex <= t) return "confirmed";
  if (p.failIndex != null && p.failIndex <= t) return "failed";
  return "forming";
}
var PATTERN_NAME = {
  W: "Hai \u0111\xE1y (W)",
  M: "Hai \u0111\u1EC9nh (M)",
  IHS: "Vai\u2013\u0111\u1EA7u\u2013vai ng\u01B0\u1EE3c",
  HS: "Vai\u2013\u0111\u1EA7u\u2013vai"
};

// src/lib/quant-core/mtf/align.ts
var dayKey = (date) => date.slice(0, 10);
function weekKey(date) {
  const d = /* @__PURE__ */ new Date(`${dayKey(date)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear();
  const wk = 1 + Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 864e5 / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}
function toWeekly(daily) {
  const out = [];
  let key = "";
  for (const b of daily) {
    const k = weekKey(b.date);
    const cur = out[out.length - 1];
    if (k !== key || !cur) {
      out.push({ ...b });
      key = k;
      continue;
    }
    cur.high = Math.max(cur.high, b.high);
    cur.low = Math.min(cur.low, b.low);
    cur.close = b.close;
    cur.volume += b.volume;
    cur.date = b.date;
  }
  return out;
}
function closedHtfIndex(ltf, htf, htfIsWeekly) {
  const key = htfIsWeekly ? (d) => weekKey(d) : dayKey;
  const hk = htf.map((b) => key(b.date));
  const out = new Array(ltf.length).fill(-1);
  let j = -1;
  for (let i = 0; i < ltf.length; i++) {
    const k = key(ltf[i].date);
    while (j + 1 < htf.length && hk[j + 1] < k) j++;
    out[i] = j;
  }
  return out;
}
var stageBias = (s) => s === "UP" || s === "B" ? 1 : s === "DOWN" || s === "D" || s === "Bp" || s === "C" ? -1 : 0;
var BUY_CODES = /* @__PURE__ */ new Set(["M1", "M2", "M3", "G3"]);
function alignMatrix(trend, entry, week, entryBuyRecent) {
  const rules = [];
  const cell = `Ng\xE0y:${trend}${entry ? ` \xD7 H1:${entry}` : ""}`;
  let verdict = "\u0110\u1EE8NG NGO\xC0I";
  let rule = "R6";
  let text = "";
  const e = entry ?? trend;
  const eBull = e === "UP" || e === "A";
  const eBear = e === "C" || e === "D" || e === "DOWN" || e === "Bp";
  switch (trend) {
    case "UP":
      rule = "R1";
      if (e === "UP" && entryBuyRecent) {
        verdict = "MUA";
        text = "Khung ng\xE0y t\u0103ng, khung v\xE0o l\u1EC7nh t\u0103ng v\xE0 v\u1EEBa c\xF3 t\xEDn hi\u1EC7u mua \u2014 thu\u1EADn c\u1EA3 hai khung.";
      } else if (e === "B") {
        verdict = "CH\u1EDC MUA";
        text = "Khung ng\xE0y t\u0103ng nh\u01B0ng khung v\xE0o l\u1EC7nh \u0111ang qu\xE1 mua \u2014 kh\xF4ng mua \u0111u\u1ED5i, ch\u1EDD h\u1ED3i v\u1EC1 h\u1ED7 tr\u1EE3.";
      } else if (eBear) {
        verdict = "CH\u1EDC MUA";
        text = "Khung ng\xE0y t\u0103ng, khung v\xE0o l\u1EC7nh \u0111ang \u0111i\u1EC1u ch\u1EC9nh \u2014 ch\u1EDD khung nh\u1ECF quay l\u1EA1i t\xEDch l\u0169y / t\u0103ng r\u1ED3i m\u1EDBi mua.";
      } else {
        verdict = "CH\u1EDC MUA";
        text = "Khung ng\xE0y t\u0103ng \u2014 ch\u1EDD t\xEDn hi\u1EC7u mua (h\u1ED3i ch\u1EA1m MA / ph\xE1 n\u1EC1n) \u1EDF khung v\xE0o l\u1EC7nh.";
      }
      rules.push("R1: ch\u1EC9 m\u1EDF mua \u1EDF khung nh\u1ECF khi khung ng\xE0y \u0111ang t\u0103ng chu\u1EA9n.");
      break;
    case "A":
      rule = "R6";
      if (e === "UP" && entryBuyRecent) {
        verdict = "MUA";
        text = "Khung ng\xE0y \u0111ang t\xEDch l\u0169y \u0111\xE1y; khung v\xE0o l\u1EC7nh \u0111\xE3 t\u0103ng \u2014 ch\u1EC9 mua th\u0103m d\xF2 (n\u1EEDa t\u1EF7 tr\u1ECDng).";
      } else {
        verdict = "CH\u1EDC MUA";
        text = "Khung ng\xE0y \u0111ang t\xEDch l\u0169y \u0111\xE1y \u2014 ch\u1EDD ph\xE1 n\u1EC1n / vi\u1EC1n c\u1ED5 \u0111\u1EC3 x\xE1c nh\u1EADn.";
      }
      rules.push("R6: t\xEDch l\u0169y / \u0111i ngang \u2014 ch\u1EC9 giao d\u1ECBch khi ph\xE1 v\u1EE1, t\u1EF7 tr\u1ECDng nh\u1ECF.");
      break;
    case "B":
      rule = "R3";
      verdict = eBear ? "GI\u1EA2M T\u1EF6 TR\u1ECCNG" : "\u0110\u1EE8NG NGO\xC0I";
      text = eBear ? "Khung ng\xE0y qu\xE1 mua v\xE0 khung nh\u1ECF \u0111\xE3 suy y\u1EBFu \u2014 ch\u1ED1t l\u1EDDi d\u1EA7n." : "Khung ng\xE0y qu\xE1 mua \u2014 kh\xF4ng m\u1EDF mua m\u1EDBi, n\xE2ng c\u1EAFt l\u1ED7.";
      rules.push("R3: khung ng\xE0y qu\xE1 mua \u2014 kh\xF4ng mua \u0111u\u1ED5i, ch\u1ED1t m\u1ED9t ph\u1EA7n \u1EDF kh\xE1ng c\u1EF1.");
      break;
    case "C":
      rule = "R4";
      verdict = "GI\u1EA2M T\u1EF6 TR\u1ECCNG";
      text = "Khung ng\xE0y suy y\u1EBFu t\u1EA1i \u0111\u1EC9nh \u2014 h\u1EA1 t\u1EF7 tr\u1ECDng, kh\xF4ng m\u1EDF mua m\u1EDBi d\xF9 khung nh\u1ECF h\u1ED3i.";
      rules.push("R4: khung ng\xE0y \u1EDF giai \u0111o\u1EA1n C \u2014 c\u1EA5m mua m\u1EDBi \u1EDF khung nh\u1ECF.");
      break;
    case "D":
    case "DOWN":
      rule = "R2";
      verdict = eBull ? "\u0110\u1EE8NG NGO\xC0I" : "B\xC1N";
      text = eBull ? "Khung ng\xE0y gi\u1EA3m \u2014 nh\u1ECBp t\u0103ng \u1EDF khung nh\u1ECF ch\u1EC9 l\xE0 h\u1ED3i k\u1EF9 thu\u1EADt, \u0111\u1EE9ng ngo\xE0i." : "Khung ng\xE0y gi\u1EA3m v\xE0 khung nh\u1ECF c\xF9ng chi\u1EC1u \u2014 b\xE1n / kh\xF4ng n\u1EAFm gi\u1EEF.";
      rules.push("R2: khung ng\xE0y gi\u1EA3m \u2014 kh\xF4ng mua, nh\u1ECBp h\u1ED3i khung nh\u1ECF l\xE0 c\u01A1 h\u1ED9i tho\xE1t h\xE0ng.");
      break;
    case "Bp":
      rule = "R5";
      verdict = eBear ? "B\xC1N" : "GI\u1EA2M T\u1EF6 TR\u1ECCNG";
      text = "Khung ng\xE0y h\u1ED3i l\xEAn MA trong xu h\u01B0\u1EDBng gi\u1EA3m \u2014 v\xF9ng MA l\xE0 \u0111i\u1EC3m b\xE1n, kh\xF4ng ph\u1EA3i \u0111i\u1EC3m mua.";
      rules.push("R5: B\u2032 \u2014 h\u1ED3i l\xEAn MA trong xu h\u01B0\u1EDBng gi\u1EA3m l\xE0 \u0111i\u1EC3m b\xE1n.");
      break;
    default:
      rule = "R6";
      verdict = e === "UP" && entryBuyRecent ? "CH\u1EDC MUA" : "\u0110\u1EE8NG NGO\xC0I";
      text = "Khung ng\xE0y \u0111i ngang \u2014 ch\u1EC9 mua g\u1EA7n bi\xEAn d\u01B0\u1EDBi v\xF9ng ho\u1EB7c khi ph\xE1 v\u1EE1 l\xEAn.";
      rules.push("R6: \u0111i ngang \u2014 giao d\u1ECBch \u1EDF bi\xEAn v\xF9ng / ch\u1EDD ph\xE1 v\u1EE1.");
  }
  let sizeMult = trend === "A" ? 0.5 : 1;
  const wb = stageBias(week), tb = stageBias(trend);
  if (week && wb !== 0 && tb !== 0 && wb !== tb) {
    sizeMult *= 0.5;
    rules.push("R7: khung tu\u1EA7n ng\u01B0\u1EE3c chi\u1EC1u khung ng\xE0y \u2014 gi\u1EA3m m\u1ED9t n\u1EEDa t\u1EF7 tr\u1ECDng.");
    if (verdict === "MUA") text += " Khung tu\u1EA7n ng\u01B0\u1EE3c chi\u1EC1u: ch\u1EC9 d\xF9ng n\u1EEDa t\u1EF7 tr\u1ECDng.";
  }
  return { verdict, rule, cell, sizeMult, text, rules };
}
var fmt2 = (x) => Math.abs(x) >= 100 ? x.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : x.toFixed(2).replace(".", ",");
function scenarios(a, extraZones = []) {
  const t = a.bars.length - 1;
  if (t < 1) return [];
  const c = a.bars[t].close, atr2 = Math.max(a.atr[t], 1e-9);
  const zones = [...a.zones, ...extraZones].filter((z) => z.strength >= 0.25);
  const above = zones.filter((z) => z.lo > c).sort((x, y) => x.mid - y.mid);
  const below = zones.filter((z) => z.hi < c).sort((x, y) => y.mid - x.mid);
  const pats = a.patterns.filter((p) => {
    const s = patternStatusAt(p, t);
    return s === "forming" || s === "confirmed" && t - p.breakIndex <= 20;
  });
  const bull = pats.filter((p) => p.dir === 1).pop();
  const bear = pats.filter((p) => p.dir === -1).pop();
  const out = [];
  const trigL = above[0] ? above[0].hi : c + atr2;
  const stopL = below[0] ? Math.min(below[0].lo - 0.5 * atr2, trigL - atr2) : trigL - 2 * atr2;
  const tgL = above.slice(1, 3).map((z) => z.mid);
  if (bull) tgL.push(bull.target);
  const targetsL = [...new Set(tgL.filter((x) => x > trigL).map((x) => +x.toFixed(4)))].sort((x, y) => x - y).slice(0, 3);
  const basisL = targetsL.length ? "zones" : "R-multiple";
  if (!targetsL.length) targetsL.push(trigL + 2 * (trigL - stopL));
  out.push({
    side: "L",
    title: "K\u1ECBch b\u1EA3n t\u0103ng",
    trigger: trigL,
    entry: trigL,
    stop: stopL,
    targets: targetsL,
    rr: trigL > stopL ? (targetsL[0] - trigL) / (trigL - stopL) : null,
    targetBasis: basisL,
    text: `N\u1EBFu gi\xE1 \u0110\xD3NG C\u1EECA tr\xEAn ${fmt2(trigL)}${bull ? ` (x\xE1c nh\u1EADn ${PATTERN_NAME[bull.type]})` : ""}: m\u1EE5c ti\xEAu ${targetsL.map(fmt2).join(" \u2192 ")}${basisL === "R-multiple" ? " (\u0111o theo 2R \u2014 ph\xEDa tr\xEAn kh\xF4ng c\xF2n v\xF9ng c\u1EA3n \u0111\xE3 bi\u1EBFt)" : ""}; c\u1EAFt l\u1ED7 d\u01B0\u1EDBi ${fmt2(stopL)}. Ch\u1ED1t m\u1ED9t n\u1EEDa \u1EDF m\u1EE5c ti\xEAu \u0111\u1EA7u.`
  });
  const trigS = below[0] ? below[0].lo : c - atr2;
  const stopS = above[0] ? Math.max(above[0].hi + 0.5 * atr2, trigS + atr2) : trigS + 2 * atr2;
  const tgS = below.slice(1, 3).map((z) => z.mid);
  if (bear) tgS.push(bear.target);
  const targetsS = [...new Set(tgS.filter((x) => x < trigS && x > 0).map((x) => +x.toFixed(4)))].sort((x, y) => y - x).slice(0, 3);
  const basisS = targetsS.length ? "zones" : "R-multiple";
  if (!targetsS.length) targetsS.push(Math.max(0, trigS - 2 * (stopS - trigS)));
  out.push({
    side: "S",
    title: "K\u1ECBch b\u1EA3n gi\u1EA3m",
    trigger: trigS,
    entry: trigS,
    stop: stopS,
    targets: targetsS,
    rr: stopS > trigS ? (trigS - targetsS[0]) / (stopS - trigS) : null,
    targetBasis: basisS,
    text: `N\u1EBFu gi\xE1 \u0110\xD3NG C\u1EECA d\u01B0\u1EDBi ${fmt2(trigS)}${bear ? ` (x\xE1c nh\u1EADn ${PATTERN_NAME[bear.type]})` : ""}: r\u1EE7i ro v\u1EC1 ${targetsS.map(fmt2).join(" \u2192 ")}${basisS === "R-multiple" ? " (\u0111o theo 2R \u2014 b\xEAn d\u01B0\u1EDBi kh\xF4ng c\xF2n h\u1ED7 tr\u1EE3 \u0111\xE3 bi\u1EBFt)" : ""} \u2014 tho\xE1t h\xE0ng / kh\xF4ng b\u1EAFt \u0111\xE1y.`
  });
  return out;
}
var recentBuy = (signals, t, within = 5) => signals.some((s) => BUY_CODES.has(s.code) && s.confirmedIndex <= t && t - s.confirmedIndex < within);

// src/lib/quant-core/mtf/core.ts
function smaSeries(values, period) {
  const out = new Array(values.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}
function indicators(bars, p) {
  const close = bars.map((b) => b.close);
  const maFast = smaSeries(close, p.maFast);
  const maSlow = smaSeries(close, p.maSlow);
  const atr2 = atrSeries(bars, p.atr);
  const n = bars.length;
  const slope2 = new Array(n).fill(NaN);
  const slopeFast = new Array(n).fill(NaN);
  const dev = new Array(n).fill(NaN);
  const spread = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = atr2[i] > 0 ? atr2[i] : NaN;
    if (i >= p.slopeLen) {
      slope2[i] = (maSlow[i] - maSlow[i - p.slopeLen]) / (p.slopeLen * a);
      slopeFast[i] = (maFast[i] - maFast[i - p.slopeLen]) / (p.slopeLen * a);
    }
    dev[i] = (close[i] - maSlow[i]) / a;
    spread[i] = (maFast[i] - maSlow[i]) / a;
  }
  const volAvg = smaSeries(bars.map((b) => b.volume), 20);
  return { maFast, maSlow, atr: atr2, slope: slope2, slopeFast, dev, spread, volAvg };
}
function dcSwings(bars, atr2, theta, level) {
  const out = [];
  if (bars.length === 0) return out;
  let mode = 0;
  let hiP = bars[0].high, hiI = 0, loP = bars[0].low, loI = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const th = theta * Math.max(atr2[i], 1e-9);
    if (mode >= 0 && b.high > hiP) {
      hiP = b.high;
      hiI = i;
    }
    if (mode <= 0 && b.low < loP) {
      loP = b.low;
      loI = i;
    }
    if (mode === 1) {
      if (hiP - b.close >= th) {
        out.push({ kind: "H", index: hiI, confirmedIndex: i, price: hiP, level });
        mode = -1;
        loP = b.low;
        loI = i;
        for (let j = hiI + 1; j <= i; j++) if (bars[j].low < loP) {
          loP = bars[j].low;
          loI = j;
        }
      }
    } else if (mode === -1) {
      if (b.close - loP >= th) {
        out.push({ kind: "L", index: loI, confirmedIndex: i, price: loP, level });
        mode = 1;
        hiP = b.high;
        hiI = i;
        for (let j = loI + 1; j <= i; j++) if (bars[j].high > hiP) {
          hiP = bars[j].high;
          hiI = j;
        }
      }
    } else {
      if (hiP - b.close >= th && hiI < i) {
        out.push({ kind: "H", index: hiI, confirmedIndex: i, price: hiP, level });
        mode = -1;
        loP = b.low;
        loI = i;
        for (let j = hiI + 1; j <= i; j++) if (bars[j].low < loP) {
          loP = bars[j].low;
          loI = j;
        }
      } else if (b.close - loP >= th && loI < i) {
        out.push({ kind: "L", index: loI, confirmedIndex: i, price: loP, level });
        mode = 1;
        hiP = b.high;
        hiI = i;
        for (let j = loI + 1; j <= i; j++) if (bars[j].high > hiP) {
          hiP = bars[j].high;
          hiI = j;
        }
      }
    }
  }
  return out;
}
function dowSeries(bars, sw) {
  const n = bars.length;
  const out = new Array(n).fill(0);
  const highs = [];
  const lows = [];
  let k = 0;
  let state = 0;
  let broken = false;
  for (let i = 0; i < n; i++) {
    let changed = false;
    while (k < sw.length && sw[k].confirmedIndex === i) {
      const s = sw[k++];
      (s.kind === "H" ? highs : lows).push(s.price);
      changed = true;
    }
    if (changed && highs.length >= 2 && lows.length >= 2) {
      const hh = highs[highs.length - 1] > highs[highs.length - 2];
      const hl = lows[lows.length - 1] > lows[lows.length - 2];
      const next = hh && hl ? 1 : !hh && !hl ? -1 : 0;
      if (next !== state || broken) {
        state = next;
        broken = false;
      }
    }
    const c = bars[i].close;
    if (!broken && state === 1 && lows.length && c < lows[lows.length - 1]) broken = true;
    if (!broken && state === -1 && highs.length && c > highs[highs.length - 1]) broken = true;
    out[i] = broken ? 0 : state;
  }
  return out;
}

// src/lib/quant-core/mtf/stages.ts
var STAGE_CONFIRM_BARS = 3;
var PATTERN_FRESH_BARS = 20;
function stageMachine(bars, ind, dow, patterns, p) {
  const n = bars.length;
  const stage = new Array(n).fill("RANGE");
  const stageAge = new Array(n).fill(0);
  let cur = "RANGE";
  let age = 0;
  let pend = null;
  let pendN = 0;
  const byConf = [...patterns].sort((a, b) => a.confirmedIndex - b.confirmedIndex);
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const mf = ind.maFast[i], ms = ind.maSlow[i], sl = ind.slope[i], slf = ind.slopeFast[i], dv = ind.dev[i], sp = ind.spread[i];
    if (!Number.isFinite(ms) || !Number.isFinite(sl)) {
      stage[i] = cur;
      stageAge[i] = ++age;
      continue;
    }
    let freshBull = null, freshBear = null, formingBull = false, formingBear = false;
    for (const pt of byConf) {
      if (pt.confirmedIndex > i) break;
      const st = patternStatusAt(pt, i);
      if (st === "confirmed" && i - pt.breakIndex <= PATTERN_FRESH_BARS) {
        if (pt.dir === 1) freshBull = pt;
        else freshBear = pt;
      } else if (st === "forming") {
        if (pt.dir === 1) formingBull = true;
        else formingBear = true;
      }
    }
    const war = Math.abs(sp) <= p.warAtr;
    const trendUp = mf > ms && sl > 0 && c > ms;
    const trendDn = mf < ms && sl < 0 && c < ms;
    const wasTop = cur === "UP" || cur === "B" || cur === "C";
    const wasBottom = cur === "DOWN" || cur === "Bp" || cur === "D" || cur === "A";
    let cand;
    let force = false;
    if (freshBear && freshBear.breakIndex === i && wasTop) {
      cand = "D";
      force = true;
    } else if (freshBull && freshBull.breakIndex === i && (wasBottom || cur === "RANGE")) {
      cand = "UP";
      force = true;
    } else if (trendUp) {
      if (dv >= p.overAtr) cand = "B";
      else if (dow[i] === -1 || c < mf && slf < 0 || formingBear) cand = cur === "D" ? "D" : "C";
      else cand = "UP";
    } else if (trendDn) {
      if (c >= mf - p.touchAtr * Math.max(ind.atr[i], 1e-9) && slf >= 0) cand = "Bp";
      else if (cur === "C" || cur === "B") cand = "D";
      else cand = "DOWN";
    } else {
      if (wasTop) cand = c < ms ? "D" : war || c < mf ? "C" : cur;
      else if (wasBottom) cand = formingBull || war || c > mf ? "A" : cur === "D" ? "D" : "DOWN";
      else cand = war ? "RANGE" : dow[i] === 1 && c > ms ? "UP" : dow[i] === -1 && c < ms ? "DOWN" : "RANGE";
      if (cur === "A" && c > ms && mf > ms && sl >= 0) cand = "UP";
    }
    if (cand === cur) {
      pend = null;
      pendN = 0;
    } else if (force) {
      cur = cand;
      age = 0;
      pend = null;
      pendN = 0;
    } else {
      if (pend === cand) pendN++;
      else {
        pend = cand;
        pendN = 1;
      }
      if (pendN >= STAGE_CONFIRM_BARS) {
        cur = cand;
        age = 0;
        pend = null;
        pendN = 0;
      }
    }
    stage[i] = cur;
    stageAge[i] = ++age;
  }
  return { stage, stageAge };
}
var STAGE_LABEL = {
  A: "A \xB7 T\xEDch l\u0169y \u0111\xE1y",
  UP: "Xu h\u01B0\u1EDBng t\u0103ng",
  B: "B \xB7 Qu\xE1 mua, r\u1EE7i ro ph\xE2n ph\u1ED1i",
  C: "C \xB7 Suy y\u1EBFu t\u1EA1i \u0111\u1EC9nh",
  D: "D \xB7 Ph\xE1 v\u1EE1 \u0111i xu\u1ED1ng",
  DOWN: "Xu h\u01B0\u1EDBng gi\u1EA3m",
  Bp: "B\u2032 \xB7 H\u1ED3i l\xEAn MA trong xu h\u01B0\u1EDBng gi\u1EA3m",
  RANGE: "\u0110i ngang, ch\u01B0a r\xF5 xu h\u01B0\u1EDBng"
};
var STAGE_TEXT = {
  A: "Gi\xE1 ng\u1EEBng gi\u1EA3m, MA ch\xE2n d\u01B0\u1EDBi v\xE0 ch\xE2n tr\xEAn h\u1ED9i t\u1EE5, \u0111ang t\u1EA1o n\u1EC1n \u0111\xE1y. Ch\u1EDD ph\xE1 v\u1EE1 n\u1EC1n / vi\u1EC1n c\u1ED5 \u0111\u1EC3 x\xE1c nh\u1EADn \u0111\u1EA3o chi\u1EC1u.",
  UP: "Gi\xE1 tr\xEAn MA ch\xE2n tr\xEAn \u0111ang d\u1ED1c l\xEAn, Dow t\u1EA1o \u0111\u1EC9nh \u2013 \u0111\xE1y sau cao h\u01A1n. \u01AFu ti\xEAn mua khi gi\xE1 h\u1ED3i v\u1EC1 h\u1ED7 tr\u1EE3 / MA.",
  B: "Gi\xE1 l\u1EC7ch xa MA ch\xE2n tr\xEAn (qu\xE1 mua). Kh\xF4ng mua \u0111u\u1ED5i; ch\u1ED1t l\u1EDDi m\u1ED9t ph\u1EA7n \u1EDF kh\xE1ng c\u1EF1, n\xE2ng \u0111i\u1EC3m c\u1EAFt l\u1ED7.",
  C: "Xu h\u01B0\u1EDBng t\u0103ng y\u1EBFu d\u1EA7n: gi\xE1 th\u1EE7ng MA ch\xE2n d\u01B0\u1EDBi ho\u1EB7c Dow t\u1EA1o \u0111\u1EC9nh th\u1EA5p h\u01A1n, MA b\u1EAFt \u0111\u1EA7u h\u1ED9i t\u1EE5. H\u1EA1 t\u1EF7 tr\u1ECDng, kh\xF4ng m\u1EDF mua m\u1EDBi.",
  D: "Gi\xE1 ph\xE1 xu\u1ED1ng d\u01B0\u1EDBi MA ch\xE2n tr\xEAn / vi\u1EC1n c\u1ED5 m\u1EABu \u0111\u1EC9nh. C\u1EA5u tr\xFAc t\u0103ng \u0111\xE3 b\u1ECB ph\xE1 \u2014 \u01B0u ti\xEAn b\u1EA3o to\xE0n v\u1ED1n.",
  DOWN: "Gi\xE1 d\u01B0\u1EDBi MA ch\xE2n tr\xEAn \u0111ang d\u1ED1c xu\u1ED1ng, Dow t\u1EA1o \u0111\u1EC9nh \u2013 \u0111\xE1y sau th\u1EA5p h\u01A1n. \u0110\u1EE9ng ngo\xE0i ho\u1EB7c ch\u1EC9 giao d\u1ECBch ng\u1EAFn r\u1EA5t nh\u1ECF.",
  Bp: "Gi\xE1 h\u1ED3i l\xEAn ch\u1EA1m MA ch\xE2n d\u01B0\u1EDBi trong xu h\u01B0\u1EDBng gi\u1EA3m \u2014 th\u01B0\u1EDDng l\xE0 \u0111i\u1EC3m b\xE1n / gi\u1EA3m t\u1EF7 tr\u1ECDng, kh\xF4ng ph\u1EA3i \u0111i\u1EC3m mua.",
  RANGE: "Hai MA \u0111i ngang, \u0111an xen; ch\u01B0a c\xF3 c\u1EA5u tr\xFAc r\xF5. Ch\u1EC9 giao d\u1ECBch \u1EDF bi\xEAn v\xF9ng ho\u1EB7c ch\u1EDD ph\xE1 v\u1EE1."
};

// src/lib/quant-core/mtf/explain.ts
var STAGE_TONE = { A: "neutral", UP: "bull", B: "warn", C: "warn", D: "bear", DOWN: "bear", Bp: "warn", RANGE: "neutral" };
var fmt3 = (x) => Math.abs(x) >= 100 ? x.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : x.toFixed(2).replace(".", ",");
function stageSegments(a) {
  const out = [];
  for (let i = 0; i < a.stage.length; i++) {
    const s = a.stage[i];
    const cur = out[out.length - 1];
    if (cur && cur.stage === s) {
      cur.i1 = i;
      cur.to = a.bars[i].date;
      continue;
    }
    out.push({ stage: s, label: STAGE_LABEL[s], from: a.bars[i].date, to: a.bars[i].date, i0: i, i1: i });
  }
  return out;
}
function annotations(a, maxSignals = 12, maxStages = 8) {
  const t = a.bars.length - 1;
  const out = [];
  const at = (i) => a.bars[Math.max(0, Math.min(t, i))];
  for (const seg of stageSegments(a).slice(-maxStages)) {
    if (seg.i0 === 0) continue;
    const b = at(seg.i0);
    const up = seg.stage === "UP" || seg.stage === "A";
    out.push({
      tf: a.tf,
      kind: "stage",
      date: b.date,
      index: seg.i0,
      price: up ? b.low : b.high,
      text: seg.label,
      detail: `T\u1EEB ${seg.from}: ${seg.label}.`,
      tone: STAGE_TONE[seg.stage],
      confirmedIndex: seg.i0
    });
  }
  for (const p of a.patterns) {
    const st = patternStatusAt(p, t);
    if (!st || st === "failed") continue;
    if (p.points[0].index < t - a.params.levelLookback) continue;
    const i = st === "confirmed" ? p.breakIndex : p.confirmedIndex;
    const b = at(i);
    const name = PATTERN_NAME[p.type];
    out.push({
      tf: a.tf,
      kind: "pattern",
      date: b.date,
      index: i,
      price: p.dir === 1 ? b.low : b.high,
      text: st === "confirmed" ? `${name} \u2013 \u0111\xE3 ph\xE1 c\u1ED5` : `${name} \u2013 \u0111ang h\xECnh th\xE0nh`,
      detail: st === "confirmed" ? `${name}: gi\xE1 \u0111\xF3ng c\u1EEDa ${p.dir === 1 ? "v\u01B0\u1EE3t" : "th\u1EE7ng"} vi\u1EC1n c\u1ED5. M\u1EE5c ti\xEAu \u0111o theo \u0111\u1ED9 cao m\u1EABu \u2248 ${fmt3(p.target)}.` : `${name} \u0111ang h\xECnh th\xE0nh: c\u1EA7n \u0111\xF3ng c\u1EEDa ${p.dir === 1 ? "tr\xEAn" : "d\u01B0\u1EDBi"} vi\u1EC1n c\u1ED5 \u2248 ${fmt3(p.neck.p1)} \u0111\u1EC3 x\xE1c nh\u1EADn.`,
      tone: p.dir === 1 ? "bull" : "bear",
      confirmedIndex: i
    });
    for (const pt of p.points) {
      const pb = at(pt.index);
      out.push({ tf: a.tf, kind: "swing", date: pb.date, index: pt.index, price: pt.price, text: pt.label, detail: `${name}: ${pt.label} ${fmt3(pt.price)}`, tone: p.dir === 1 ? "bull" : "bear", confirmedIndex: p.confirmedIndex });
    }
  }
  for (const s of a.signals.slice(-maxSignals)) {
    const b = at(s.index);
    out.push({
      tf: a.tf,
      kind: "signal",
      date: b.date,
      index: s.index,
      price: s.side === "MUA" ? b.low : b.high,
      text: s.code,
      detail: s.note,
      tone: s.side === "MUA" ? "bull" : "bear",
      confirmedIndex: s.confirmedIndex
    });
  }
  return out.sort((x, y) => x.index - y.index);
}
function narrateTf(a) {
  const t = a.bars.length - 1;
  if (t < 0) return [];
  const name = a.tf === "W" ? "Khung tu\u1EA7n" : a.tf === "D" ? "Khung ng\xE0y" : "Khung 1 gi\u1EDD";
  const c = a.bars[t].close;
  const lines = [`${name}: ${STAGE_LABEL[a.stage[t]]} (${a.stageAge[t]} n\u1EBFn).`];
  const ms = a.maSlow[t];
  if (Number.isFinite(ms)) lines.push(`Gi\xE1 ${fmt3(c)} ${c >= ms ? "tr\xEAn" : "d\u01B0\u1EDBi"} MA ch\xE2n tr\xEAn ${fmt3(ms)} (l\u1EC7ch ${a.dev[t].toFixed(1).replace(".", ",")} ATR); MA ${a.slope[t] > 0 ? "d\u1ED1c l\xEAn" : a.slope[t] < 0 ? "d\u1ED1c xu\u1ED1ng" : "\u0111i ngang"}.`);
  lines.push(a.dow[t] === 1 ? "Dow: \u0111\u1EC9nh \u2013 \u0111\xE1y sau cao h\u01A1n (xu h\u01B0\u1EDBng t\u0103ng)." : a.dow[t] === -1 ? "Dow: \u0111\u1EC9nh \u2013 \u0111\xE1y sau th\u1EA5p h\u01A1n (xu h\u01B0\u1EDBng gi\u1EA3m)." : "Dow: ch\u01B0a c\xF3 c\u1EA5u tr\xFAc r\xF5.");
  if (a.base && a.base.bars >= 15) {
    const b = a.base;
    lines.push(`N\u1EC1n gi\xE1 ${b.bars} n\u1EBFn (${fmt3(b.lo)}\u2013${fmt3(b.hi)}, bi\xEAn \u0111\u1ED9 ${b.rangeAtr.toFixed(1).replace(".", ",")} ATR${b.contractions ? `, co h\u1EB9p ${b.contractions} l\u1EA7n` : ""}${b.tight ? ", \u0111ang si\u1EBFt ch\u1EB7t" : ""}).`);
  }
  return lines;
}

// src/lib/quant-core/mtf/levels.ts
var LEVEL_W = { small: 1, mid: 2, large: 3 };
function volumePoc(bars, from, t, step) {
  if (!(step > 0) || t < from) return null;
  const m = /* @__PURE__ */ new Map();
  for (let j = from; j <= t; j++) {
    const b = bars[j];
    const k = Math.round((b.high + b.low + b.close) / 3 / step);
    m.set(k, (m.get(k) ?? 0) + b.volume);
  }
  let best = null, bv = -1;
  for (const [k, v] of m) if (v > bv) {
    bv = v;
    best = k;
  }
  return best == null ? null : best * step;
}
function zonesAt(bars, ind, swings, patterns, t, p, maxZones = 8) {
  if (t < 1) return [];
  const atr2 = Math.max(ind.atr[t], 1e-9);
  const from = Math.max(0, t - p.levelLookback);
  const close = bars[t].close;
  const cands = [];
  const recency = (idx2) => Math.exp(-((t - idx2) / Math.max(1, p.levelLookback)) * 2);
  const vol = (idx2) => {
    const va = ind.volAvg[idx2];
    return Number.isFinite(va) && va > 0 ? Math.min(2, Math.max(0.5, bars[idx2].volume / va)) : 1;
  };
  for (const lv of ["small", "mid", "large"]) {
    for (const s of swings[lv]) {
      if (s.confirmedIndex > t || s.index < from) continue;
      cands.push({ price: s.price, w: LEVEL_W[lv] * recency(s.index) * vol(s.index), src: "Dow", kind: s.kind });
    }
  }
  for (const pt of patterns) {
    if (pt.confirmedIndex > t || pt.start < from) continue;
    cands.push({ price: neckAt(pt.neck, t), w: 2.5 * recency(pt.confirmedIndex), src: "\u0110\u01B0\u1EDDng" });
  }
  if (Number.isFinite(ind.maFast[t])) cands.push({ price: ind.maFast[t], w: 1.5, src: "MA" });
  if (Number.isFinite(ind.maSlow[t])) cands.push({ price: ind.maSlow[t], w: 2.5, src: "MA" });
  const poc = volumePoc(bars, from, t, 0.25 * atr2);
  if (poc != null) cands.push({ price: poc, w: 2, src: "Kh\u1ED1i l\u01B0\u1EE3ng" });
  if (cands.length === 0) return [];
  const h = 0.5 * atr2;
  const lo = Math.min(...cands.map((c) => c.price)) - 2 * h;
  const hi = Math.max(...cands.map((c) => c.price)) + 2 * h;
  const step = h / 4;
  const steps = Math.min(4e3, Math.ceil((hi - lo) / step) + 1);
  const dens = new Float64Array(steps);
  for (let g = 0; g < steps; g++) {
    const x = lo + g * step;
    let s = 0;
    for (const c of cands) {
      const z = (x - c.price) / h;
      if (z > -4 && z < 4) s += c.w * Math.exp(-0.5 * z * z);
    }
    dens[g] = s;
  }
  const peaks = [];
  for (let g = 1; g < steps - 1; g++) if (dens[g] > dens[g - 1] && dens[g] >= dens[g + 1]) peaks.push({ x: lo + g * step, d: dens[g] });
  if (!peaks.length) return [];
  const dMax = Math.max(...peaks.map((q) => q.d));
  peaks.sort((a, b) => b.d - a.d);
  const out = [];
  for (const pk of peaks) {
    if (out.length >= maxZones) break;
    if (pk.d < 0.15 * dMax) break;
    if (out.some((z) => Math.abs(z.mid - pk.x) < 1.2 * h)) continue;
    const zlo = pk.x - 0.6 * h, zhi = pk.x + 0.6 * h;
    const near2 = cands.filter((c) => Math.abs(c.price - pk.x) <= 1.5 * h);
    const sources = [...new Set(near2.map((c) => c.src))];
    let touches = 0;
    for (let j = from; j <= t; j++) if (bars[j].low <= zhi && bars[j].high >= zlo && (j === from || !(bars[j - 1].low <= zhi && bars[j - 1].high >= zlo))) touches++;
    const role2 = pk.x <= close ? "support" : "resistance";
    const hs = near2.filter((c) => c.kind === "H").length, ls = near2.filter((c) => c.kind === "L").length;
    const flipped = role2 === "support" ? hs > ls : ls > hs;
    out.push({ lo: zlo, hi: zhi, mid: pk.x, strength: Math.min(1, pk.d / dMax), sources, touches, role: role2, flipped });
  }
  return out.sort((a, b) => a.mid - b.mid);
}
function bbwPercentile(bars, t, look = 250) {
  const bbw = (i) => {
    if (i < 19) return NaN;
    let s = 0, s2 = 0;
    for (let j = i - 19; j <= i; j++) {
      s += bars[j].close;
      s2 += bars[j].close * bars[j].close;
    }
    const m = s / 20;
    const v = Math.max(0, s2 / 20 - m * m);
    return m > 0 ? 4 * Math.sqrt(v) / m : NaN;
  };
  const cur = bbw(t);
  if (!Number.isFinite(cur) || t < 60) return null;
  let below = 0, cnt = 0;
  for (let i = Math.max(19, t - look); i < t; i++) {
    const v = bbw(i);
    if (Number.isFinite(v)) {
      cnt++;
      if (v < cur) below++;
    }
  }
  return cnt ? Math.round(below / cnt * 100) : null;
}
function baseAt(bars, ind, small, t, p, maxRangeAtr = 6) {
  const atr2 = Math.max(ind.atr[t], 1e-9);
  let best = null;
  let lo = Infinity, hi = -Infinity;
  for (let s = t; s >= Math.max(0, t - 120); s--) {
    lo = Math.min(lo, bars[s].low);
    hi = Math.max(hi, bars[s].high);
    if ((hi - lo) / atr2 > maxRangeAtr) break;
    if (t - s + 1 >= 15) best = { s, lo, hi };
  }
  if (!best) return null;
  const sw = small.filter((x) => x.confirmedIndex <= t && x.index >= best.s);
  const depths = [];
  for (let k = 1; k < sw.length; k++) if (sw[k - 1].kind === "H" && sw[k].kind === "L") depths.push(sw[k - 1].price - sw[k].price);
  let contractions = 0;
  for (let k = 1; k < depths.length; k++) if (depths[k] < depths[k - 1]) contractions++;
  else contractions = 0;
  let tlo = Infinity, thi = -Infinity;
  for (let j = Math.max(0, t - 9); j <= t; j++) {
    tlo = Math.min(tlo, bars[j].low);
    thi = Math.max(thi, bars[j].high);
  }
  const sp = ind.spread[t];
  return {
    start: best.s,
    end: t,
    lo: best.lo,
    hi: best.hi,
    bars: t - best.s + 1,
    rangeAtr: (best.hi - best.lo) / atr2,
    contractions,
    tight: (thi - tlo) / atr2 <= 1.5,
    positionPct: best.hi > best.lo ? Math.round((bars[t].close - best.lo) / (best.hi - best.lo) * 100) : 50,
    bbwPct: bbwPercentile(bars, t),
    maConverged: Number.isFinite(sp) && Math.abs(sp) <= p.warAtr
  };
}

// src/lib/quant-core/mtf/signals.ts
var DEBOUNCE = 5;
var G3_WINDOW = 30;
var SIGNAL_TEXT = {
  M1: "Mua 1 \u2013 gi\xE1 v\u01B0\u1EE3t l\xEAn MA v\u1EEBa ng\u1EEBng gi\u1EA3m",
  M2: "Mua 2 \u2013 th\u1EE7ng MA ng\u1EAFn r\u1ED3i quay l\u1EA1i tr\xEAn MA \u0111ang l\xEAn",
  M3: "Mua 3 \u2013 h\u1ED3i v\u1EC1 ch\u1EA1m MA \u0111ang l\xEAn, kh\xF4ng th\u1EE7ng",
  M4: "Mua 4 \u2013 l\u1EC7ch qu\xE1 xa d\u01B0\u1EDBi MA (qu\xE1 b\xE1n), b\u1EADt h\u1ED3i",
  B1: "B\xE1n 1 \u2013 gi\xE1 th\u1EE7ng MA v\u1EEBa ng\u1EEBng t\u0103ng",
  B2: "B\xE1n 2 \u2013 v\u01B0\u1EE3t MA ng\u1EAFn r\u1ED3i quay l\u1EA1i d\u01B0\u1EDBi MA \u0111ang xu\u1ED1ng",
  B3: "B\xE1n 3 \u2013 h\u1ED3i l\xEAn ch\u1EA1m MA \u0111ang xu\u1ED1ng, kh\xF4ng v\u01B0\u1EE3t",
  B4: "B\xE1n 4 \u2013 l\u1EC7ch qu\xE1 xa tr\xEAn MA (qu\xE1 mua), suy y\u1EBFu",
  G3: "Mua 3 b\u01B0\u1EDBc \u2013 MA h\u1ED9i t\u1EE5 \u2192 ph\xE2n k\u1EF3 \u2192 nh\u1ECBp h\u1ED3i \u0111\u1EA7u ti\xEAn",
  L: "K\u1ECBch b\u1EA3n t\u0103ng",
  S: "K\u1ECBch b\u1EA3n gi\u1EA3m",
  "KT+": "\u0110\u1EE7 l\u1EE3i th\u1EBF k\u1EF9 thu\u1EADt mua",
  "KT-": "\u0110\u1EE7 l\u1EE3i th\u1EBF k\u1EF9 thu\u1EADt b\xE1n"
};
function granville(bars, ind, p) {
  const out = [];
  const last = {};
  let lastWar = -Infinity;
  let lastG3 = -Infinity;
  let armM4 = true, armB4 = true;
  const push = (i, code, side, price) => {
    if ((last[code] ?? -Infinity) > i - DEBOUNCE) return;
    last[code] = i;
    out.push({ index: i, confirmedIndex: i, code, side, price, note: SIGNAL_TEXT[code] });
  };
  for (let i = 1; i < bars.length; i++) {
    const ma = ind.maSlow[i], maP = ind.maSlow[i - 1], sl = ind.slope[i], a = Math.max(ind.atr[i], 1e-9);
    if (!Number.isFinite(ma) || !Number.isFinite(maP) || !Number.isFinite(sl)) continue;
    const b = bars[i], c = b.close, cp = bars[i - 1].close;
    const bull = c > b.open, bear = c < b.open;
    const tch = p.touchAtr * a;
    const crossUp = cp <= maP && c > ma, crossDn = cp >= maP && c < ma;
    const slPrev = i >= 10 && Number.isFinite(ind.slope[i - 10]) ? ind.slope[i - 10] : sl;
    if (Math.abs(ind.spread[i]) <= p.warAtr) lastWar = i;
    if (crossUp && sl >= -0.02 && slPrev <= 0) push(i, "M1", "MUA", c);
    else if (crossUp && sl > 0 && slPrev > 0) push(i, "M2", "MUA", c);
    if (!crossUp && sl > 0 && c > ma && b.low <= ma + tch && bull) {
      push(i, "M3", "MUA", c);
      if (i - lastWar <= G3_WINDOW && ind.spread[i] > p.warAtr && lastG3 < lastWar) {
        lastG3 = i;
        push(i, "G3", "MUA", c);
      }
    }
    if (ind.dev[i] > -p.overAtr / 2) armM4 = true;
    if (ind.dev[i] < p.overAtr / 2) armB4 = true;
    if (armM4 && ind.dev[i] <= -p.overAtr && bull && sl < 0) {
      armM4 = false;
      push(i, "M4", "MUA", c);
    }
    if (crossDn && sl <= 0.02 && slPrev >= 0) push(i, "B1", "B\xC1N", c);
    else if (crossDn && sl < 0 && slPrev < 0) push(i, "B2", "B\xC1N", c);
    if (!crossDn && sl < 0 && c < ma && b.high >= ma - tch && bear) push(i, "B3", "B\xC1N", c);
    if (armB4 && ind.dev[i] >= p.overAtr && bear && sl > 0) {
      armB4 = false;
      push(i, "B4", "B\xC1N", c);
    }
  }
  return out;
}
var fmt4 = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)).replace(".", ",");
function checklists(bars, ind, dow, zones, t, p) {
  const c = bars[t].close, a = Math.max(ind.atr[t], 1e-9);
  const ma = ind.maSlow[t], sl = ind.slope[t], sp = ind.spread[t], dv = ind.dev[t];
  let warRecent = false;
  for (let j = Math.max(0, t - G3_WINDOW); j < t; j++) if (Math.abs(ind.spread[j]) <= p.warAtr) {
    warRecent = true;
    break;
  }
  const spPrev = t >= 3 ? ind.spread[t - 3] : NaN;
  let upV = 0, dnV = 0;
  for (let j = Math.max(1, t - 9); j <= t; j++) bars[j].close >= bars[j - 1].close ? upV += bars[j].volume : dnV += bars[j].volume;
  const sup = zones.filter((z) => z.role === "support" && z.strength >= 0.3).sort((x, y) => y.mid - x.mid)[0];
  const res = zones.filter((z) => z.role === "resistance" && z.strength >= 0.3).sort((x, y) => x.mid - y.mid)[0];
  const stopB = sup ? sup.lo - 0.5 * a : c - 2 * a;
  const rrBuy = res && c > stopB ? (res.lo - c) / (c - stopB) : null;
  const stopS = res ? res.hi + 0.5 * a : c + 2 * a;
  const rrSell = sup && stopS > c ? (c - sup.hi) / (stopS - c) : null;
  const buy = [
    { key: "dow", ok: dow[t] === 1, text: "Dow t\u0103ng: \u0111\u1EC9nh \u2013 \u0111\xE1y sau cao h\u01A1n" },
    { key: "ma", ok: c > ma && sl > 0, text: "Gi\xE1 tr\xEAn MA ch\xE2n tr\xEAn, MA d\u1ED1c l\xEAn" },
    { key: "diverge", ok: warRecent && sp > p.warAtr && sp > spPrev, text: "MA v\u1EEBa h\u1ED9i t\u1EE5 r\u1ED3i ph\xE2n k\u1EF3 l\xEAn (\u0111i\u1EC3m v\xE0o h\u1EE3p l\u1EC7)" },
    { key: "support", ok: !!sup && c - sup.hi <= 1.5 * a, text: sup ? `G\u1EA7n h\u1ED7 tr\u1EE3 m\u1EA1nh ${fmt4(sup.mid)} (\u2264 1,5 ATR)` : "Ch\u01B0a c\xF3 h\u1ED7 tr\u1EE3 m\u1EA1nh b\xEAn d\u01B0\u1EDBi" },
    { key: "notOver", ok: Number.isFinite(dv) && dv < p.overAtr, text: "Ch\u01B0a qu\xE1 mua (gi\xE1 ch\u01B0a l\u1EC7ch xa MA ch\xE2n tr\xEAn)" },
    { key: "volume", ok: upV > dnV, text: "Kh\u1ED1i l\u01B0\u1EE3ng phi\xEAn t\u0103ng l\u1EDBn h\u01A1n phi\xEAn gi\u1EA3m (10 n\u1EBFn)" },
    { key: "rr", ok: rrBuy != null && rrBuy >= 2, text: rrBuy != null ? `L\u1EE3i nhu\u1EADn/r\u1EE7i ro \u0111\u1EBFn kh\xE1ng c\u1EF1 g\u1EA7n nh\u1EA5t = ${fmt4(rrBuy)} (c\u1EA7n \u2265 2)` : "Ch\u01B0a \u0111o \u0111\u01B0\u1EE3c l\u1EE3i nhu\u1EADn/r\u1EE7i ro" }
  ];
  const sell = [
    { key: "dow", ok: dow[t] === -1, text: "Dow gi\u1EA3m: \u0111\u1EC9nh \u2013 \u0111\xE1y sau th\u1EA5p h\u01A1n" },
    { key: "ma", ok: c < ma && sl < 0, text: "Gi\xE1 d\u01B0\u1EDBi MA ch\xE2n tr\xEAn, MA d\u1ED1c xu\u1ED1ng" },
    { key: "diverge", ok: warRecent && sp < -p.warAtr && sp < spPrev, text: "MA v\u1EEBa h\u1ED9i t\u1EE5 r\u1ED3i ph\xE2n k\u1EF3 xu\u1ED1ng" },
    { key: "resistance", ok: !!res && res.lo - c <= 1.5 * a, text: res ? `G\u1EA7n kh\xE1ng c\u1EF1 m\u1EA1nh ${fmt4(res.mid)} (\u2264 1,5 ATR)` : "Ch\u01B0a c\xF3 kh\xE1ng c\u1EF1 m\u1EA1nh b\xEAn tr\xEAn" },
    { key: "notOver", ok: Number.isFinite(dv) && dv > -p.overAtr, text: "Ch\u01B0a qu\xE1 b\xE1n (gi\xE1 ch\u01B0a l\u1EC7ch xa d\u01B0\u1EDBi MA ch\xE2n tr\xEAn)" },
    { key: "volume", ok: dnV > upV, text: "Kh\u1ED1i l\u01B0\u1EE3ng phi\xEAn gi\u1EA3m l\u1EDBn h\u01A1n phi\xEAn t\u0103ng (10 n\u1EBFn)" },
    { key: "rr", ok: rrSell != null && rrSell >= 2, text: rrSell != null ? `D\u01B0 \u0111\u1ECBa gi\u1EA3m/r\u1EE7i ro \u0111\u1EBFn h\u1ED7 tr\u1EE3 g\u1EA7n nh\u1EA5t = ${fmt4(rrSell)} (c\u1EA7n \u2265 2)` : "Ch\u01B0a \u0111o \u0111\u01B0\u1EE3c d\u01B0 \u0111\u1ECBa gi\u1EA3m" }
  ];
  return { buy, sell, rrBuy, rrSell };
}

// src/lib/quant-core/mtf/types.ts
var TF_PARAMS = {
  H1: { tf: "H1", maFast: 20, maSlow: 100, atr: 14, slopeLen: 5, dcSmall: 1.5, dcMid: 3, dcLarge: 6, touchAtr: 0.6, overAtr: 4, warAtr: 0.5, levelLookback: 500 },
  D: { tf: "D", maFast: 20, maSlow: 100, atr: 14, slopeLen: 5, dcSmall: 1.5, dcMid: 3, dcLarge: 6, touchAtr: 0.6, overAtr: 4, warAtr: 0.5, levelLookback: 500 },
  W: { tf: "W", maFast: 10, maSlow: 40, atr: 14, slopeLen: 3, dcSmall: 1.5, dcMid: 2.5, dcLarge: 5, touchAtr: 0.6, overAtr: 3.5, warAtr: 0.5, levelLookback: 260 }
};

// src/lib/quant-core/mtf/compact.ts
var r2 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100;
function compactTf(a, { segments = 16, signals = 24, swings = 24 } = {}) {
  const t = a.bars.length - 1, d = (i) => a.bars[Math.max(0, Math.min(t, i))].date;
  const segs = [];
  for (let i = 0; i <= t; i++) {
    const s = a.stage[i], cur = segs[segs.length - 1];
    if (cur && cur.stage === s) {
      cur.to = d(i);
      cur.bars++;
    } else segs.push({ stage: s, label: STAGE_LABEL[s], from: d(i), to: d(i), bars: 1 });
  }
  const pats = a.patterns.map((p) => ({ p, status: patternStatusAt(p, t) })).filter(({ p, status }) => status && (status !== "failed" || t - (p.failIndex ?? 0) <= 10) && p.start >= t - a.params.levelLookback).slice(-8).map(({ p, status }) => ({
    type: p.type,
    name: PATTERN_NAME[p.type],
    dir: p.dir,
    status,
    points: p.points.map((x) => ({ date: d(x.index), price: r2(x.price), label: x.label })),
    neck: { d0: d(p.neck.i0), p0: r2(p.neck.p0), d1: d(p.neck.i1), p1: r2(p.neck.p1) },
    confirmedDate: d(p.confirmedIndex),
    breakDate: p.breakIndex != null ? d(p.breakIndex) : null,
    failDate: p.failIndex != null && p.failIndex <= t ? d(p.failIndex) : null,
    target: r2(p.target),
    height: r2(p.height)
  }));
  return {
    tf: a.tf,
    asOf: d(t),
    close: r2(a.bars[t]?.close),
    stage: a.stage[t],
    stageLabel: STAGE_LABEL[a.stage[t]],
    stageText: STAGE_TEXT[a.stage[t]],
    stageAge: a.stageAge[t],
    dow: a.dow[t],
    ma: { fast: a.params.maFast, slow: a.params.maSlow, fastValue: r2(a.maFast[t]), slowValue: r2(a.maSlow[t]) },
    dev: r2(a.dev[t]),
    slope: r2(a.slope[t]),
    spread: r2(a.spread[t]),
    atr: r2(a.atr[t]),
    segments: segs.slice(-segments),
    zones: a.zones.map((z) => ({ ...z, lo: r2(z.lo), hi: r2(z.hi), mid: r2(z.mid), strength: r2(z.strength) })),
    base: a.base ? { ...a.base, from: d(a.base.start), to: d(a.base.end), lo: r2(a.base.lo), hi: r2(a.base.hi), rangeAtr: r2(a.base.rangeAtr) } : null,
    patterns: pats,
    signals: a.signals.slice(-signals).map((s) => ({ date: d(s.index), code: s.code, side: s.side, price: r2(s.price), note: s.note })),
    swings: a.swings.mid.filter((s) => s.confirmedIndex <= t).slice(-swings).map((s) => ({ date: d(s.index), kind: s.kind, price: r2(s.price), confirmedDate: d(s.confirmedIndex) })),
    checklistBuy: a.checklistBuy,
    checklistSell: a.checklistSell
  };
}
function compactStructure(m) {
  const d = m.tfs.D, h = m.tfs.H1, w = m.tfs.W;
  let dayContextOnH1 = null;
  if (h && m.dayStageOnH1) {
    dayContextOnH1 = [];
    m.dayStageOnH1.forEach((s, i) => {
      const cur = dayContextOnH1[dayContextOnH1.length - 1], dt = h.bars[i].date;
      if (cur && cur.stage === s) cur.to = dt;
      else dayContextOnH1.push({ stage: s, label: s ? STAGE_LABEL[s] : null, from: dt, to: dt });
    });
  }
  return {
    version: m.version,
    asOf: m.asOf,
    context: m.context,
    align: m.align,
    checklist: m.checklist,
    scenarios: m.scenarios.map((s) => ({ ...s, trigger: r2(s.trigger), entry: r2(s.entry), stop: r2(s.stop), targets: s.targets.map((x) => r2(x)), rr: r2(s.rr) })),
    tfs: { ...w ? { W: compactTf(w, { segments: 10 }) } : {}, D: compactTf(d), ...h ? { H1: compactTf(h) } : {} },
    annotations: m.annotations.map((a) => ({ tf: a.tf, kind: a.kind, date: a.date, price: r2(a.price), text: a.text, detail: a.detail, tone: a.tone })),
    timeline: m.timeline.map((r) => ({ tf: r.tf, segments: r.segments.slice(-40).map((s) => ({ stage: s.stage, label: s.label, from: s.from, to: s.to })) })),
    dayContextOnH1,
    narrative: m.narrative
  };
}

// src/lib/quant-core/mtf/index.ts
var MTF_STRUCTURE_VERSION = "1.0.0";
function analyzeTf(bars, tf, over = {}) {
  const p = { ...TF_PARAMS[tf], ...over, tf };
  const ind = indicators(bars, p);
  const swings = {
    small: dcSwings(bars, ind.atr, p.dcSmall, "small"),
    mid: dcSwings(bars, ind.atr, p.dcMid, "mid"),
    large: dcSwings(bars, ind.atr, p.dcLarge, "large")
  };
  const dow = dowSeries(bars, swings.mid);
  const patterns = detectPatterns(bars, ind.atr, swings.mid);
  const { stage, stageAge } = stageMachine(bars, ind, dow, patterns, p);
  const signals = granville(bars, ind, p);
  const t = bars.length - 1;
  const zones = t >= 1 ? zonesAt(bars, ind, swings, patterns, t, p) : [];
  const base = t >= 15 ? baseAt(bars, ind, swings.small, t, p) : null;
  const ck = t >= 1 ? checklists(bars, ind, dow, zones, t, p) : { buy: [], sell: [] };
  return {
    tf,
    params: p,
    bars,
    maFast: ind.maFast,
    maSlow: ind.maSlow,
    atr: ind.atr,
    slope: ind.slope,
    dev: ind.dev,
    spread: ind.spread,
    swings,
    dow,
    stage,
    stageAge,
    patterns,
    signals,
    zones,
    base,
    checklistBuy: ck.buy,
    checklistSell: ck.sell
  };
}
function analyzeTfSeries(bars, tf, over = {}) {
  const a = analyzeTf(bars, tf, over);
  const ind = indicators(bars, a.params);
  return {
    a,
    at(t) {
      const zones = zonesAt(bars, ind, a.swings, a.patterns, t, a.params);
      const base = t >= 15 ? baseAt(bars, ind, a.swings.small, t, a.params) : null;
      const ck = checklists(bars, ind, a.dow, zones, t, a.params);
      return { zones, base, checklistBuy: ck.buy, checklistSell: ck.sell, rrBuy: ck.rrBuy, rrSell: ck.rrSell };
    }
  };
}
function analyzeStructureMtf(input) {
  const d = analyzeTf(input.d, "D");
  const wBars = input.w && input.w.length ? input.w : toWeekly(input.d);
  const w = wBars.length >= 20 ? analyzeTf(wBars, "W") : null;
  const h = input.h1 && input.h1.length >= 30 ? analyzeTf(input.h1, "H1") : null;
  const entry = h ?? d;
  const te = entry.bars.length - 1;
  let dayStage;
  let dayStageOnH1 = null;
  if (h) {
    const map = closedHtfIndex(h.bars, d.bars, false);
    dayStageOnH1 = map.map((j2) => j2 >= 0 ? d.stage[j2] : null);
    const j = map[te];
    dayStage = j >= 0 ? d.stage[j] : "RANGE";
  } else {
    dayStage = d.stage[d.bars.length - 1] ?? "RANGE";
  }
  let weekStage = null;
  if (w) {
    const map = closedHtfIndex(entry.bars, w.bars, true);
    const j = map[te];
    weekStage = j >= 0 ? w.stage[j] : null;
  }
  const h1Stage = h ? h.stage[te] : null;
  const align = alignMatrix(dayStage, h1Stage, weekStage, recentBuy(entry.signals, te));
  const htfOk = dayStage === "UP" || dayStage === "A";
  const htfDn = dayStage === "DOWN" || dayStage === "D" || dayStage === "Bp" || dayStage === "C";
  const buy = [{ key: "htf", ok: !h ? weekStage ? weekStage === "UP" || weekStage === "A" : htfOk : htfOk, text: h ? "Khung ng\xE0y thu\u1EADn chi\u1EC1u t\u0103ng (UP / t\xEDch l\u0169y A)" : "Khung tu\u1EA7n thu\u1EADn chi\u1EC1u t\u0103ng" }, ...entry.checklistBuy];
  const sell = [{ key: "htf", ok: !h ? weekStage ? weekStage === "DOWN" || weekStage === "D" : htfDn : htfDn, text: h ? "Khung ng\xE0y thu\u1EADn chi\u1EC1u gi\u1EA3m" : "Khung tu\u1EA7n thu\u1EADn chi\u1EC1u gi\u1EA3m" }, ...entry.checklistSell];
  const sc = scenarios(entry, h ? d.zones.filter((z) => z.strength >= 0.5) : []);
  const ann = [...w ? annotations(w, 6, 4) : [], ...annotations(d), ...h ? annotations(h) : []];
  const timeline = [
    ...w ? [{ tf: "W", segments: stageSegments(w) }] : [],
    { tf: "D", segments: stageSegments(d) },
    ...h ? [{ tf: "H1", segments: stageSegments(h) }] : []
  ];
  const narrative = [...w ? narrateTf(w) : [], ...narrateTf(d), ...h ? narrateTf(h) : [], `K\u1EBFt lu\u1EADn: ${align.verdict} \u2014 ${align.text}`, ...align.rules];
  return {
    version: MTF_STRUCTURE_VERSION,
    asOf: entry.bars[te]?.date ?? "",
    tfs: { ...w ? { W: w } : {}, D: d, ...h ? { H1: h } : {} },
    context: { week: weekStage, day: dayStage, h1: h1Stage },
    align,
    checklist: { buy, sell, buyScore: buy.filter((x) => x.ok).length, sellScore: sell.filter((x) => x.ok).length },
    scenarios: sc,
    annotations: ann,
    timeline,
    narrative,
    dayStageOnH1
  };
}
function minutesToH1(minutes) {
  const out = [];
  let key = "";
  for (const m of minutes) {
    const day = m.date.slice(0, 10);
    const hh = Number(m.date.slice(11, 13));
    if (!Number.isFinite(hh)) continue;
    const slot = hh < 9 ? 9 : hh === 12 ? 11 : hh >= 15 ? 14 : hh;
    const k = `${day} ${String(slot).padStart(2, "0")}:00`;
    const cur = out[out.length - 1];
    if (k !== key || !cur) {
      out.push({ date: k, open: m.open, high: m.high, low: m.low, close: m.close, volume: m.volume });
      key = k;
      continue;
    }
    cur.high = Math.max(cur.high, m.high);
    cur.low = Math.min(cur.low, m.low);
    cur.close = m.close;
    cur.volume += m.volume;
  }
  return out;
}

// src/lib/quant-core/elliott/elliottGet.js
function atr(c, n = 14) {
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
function zigzag(c, { pct: pct3 = 0.03, atrPeriod = 14, atrMult = 0 } = {}) {
  const n = c.length;
  if (n < 3) return [];
  const A = atrMult > 0 ? atr(c, atrPeriod) : null;
  const thr = (i) => A && !isNaN(A[i]) ? atrMult * A[i] : pct3 * c[i].close;
  const mk = (i, type, confirmed = true, ci = null) => ({ i, time: c[i].time, type, price: type === "H" ? c[i].high : c[i].low, confirmed, ci: confirmed ? ci : null });
  const out = [];
  let dir = 0, hi = 0, lo = 0, ext = 0;
  for (let i = 1; i < n; i++) {
    if (dir === 0) {
      if (c[i].high > c[hi].high) hi = i;
      if (c[i].low < c[lo].low) lo = i;
      if (c[hi].high - c[lo].low >= thr(i)) {
        if (lo < hi || lo === hi && c[i].close >= c[i].open) {
          out.push(mk(lo, "L", true, i));
          dir = 1;
          ext = hi;
        } else {
          out.push(mk(hi, "H", true, i));
          dir = -1;
          ext = lo;
        }
      }
    } else if (dir === 1) {
      if (c[i].high >= c[ext].high) ext = i;
      else if (c[ext].high - c[i].low >= thr(i)) {
        out.push(mk(ext, "H", true, i));
        dir = -1;
        ext = i;
      }
    } else {
      if (c[i].low <= c[ext].low) ext = i;
      else if (c[i].high - c[ext].low >= thr(i)) {
        out.push(mk(ext, "L", true, i));
        dir = 1;
        ext = i;
      }
    }
  }
  if (dir !== 0) out.push(mk(ext, dir === 1 ? "H" : "L", false));
  return out;
}
var DEFAULT_MODEL = { bias: 0, logp: 1, osc: 1.5, nest: 1, alt: 0.5 };
var DEFAULT_MODEL_FULL = { ...DEFAULT_MODEL, vol: 0.5, time: 0.3 };

// src/lib/quant-core/elliott/patterns.ts
var PATTERN_NAME2 = {
  IM: "Xung l\u1EF1c",
  LD: "N\xEAm m\u1EDF \u0111\u1EA7u (Leading Diagonal)",
  ED: "N\xEAm k\u1EBFt th\xFAc (Ending Diagonal)",
  ZZ: "Zigzag",
  DZ: "Zigzag k\xE9p",
  FL: "Flat",
  "EX-FL": "Flat m\u1EDF r\u1ED9ng",
  RFL: "Flat ch\u1EA1y",
  TR: "Tam gi\xE1c thu h\u1EB9p",
  RTR: "Tam gi\xE1c ch\u1EA1y",
  ETR: "Tam gi\xE1c m\u1EDF r\u1ED9ng",
  D3: "\u0110i\u1EC1u ch\u1EC9nh k\xE9p W-X-Y",
  T3: "\u0110i\u1EC1u ch\u1EC9nh ba W-X-Y-X-Z"
};
var DW_FIB = {
  retrace: [0.236, 0.382, 0.5, 0.618, 0.786],
  zzB: { typical: [0.5, 0.618], max: 0.786 },
  flatB: { min: 0.9, expandedMax: 1.382, expandedTypical: [1.272, 1.382] },
  w3: [1.618, 2.618, 3.618],
  w4: [0.382, 0.5],
  w5Of03: [0.382, 0.618],
  c: [1, 1.618]
};
var near = (v, xs, tol = 0.08) => xs.some((x) => Math.abs(v - x) <= tol * Math.max(1, x));
var fit = (tag, rules, labels) => {
  const hard = rules.filter((r) => r.severity === "hard"), soft = rules.filter((r) => r.severity === "soft" && r.pass !== null);
  return { tag, name: PATTERN_NAME2[tag], labels, rules, valid: hard.every((r) => r.pass !== false), score: soft.length ? soft.filter((r) => r.pass).length / soft.length : 0.5 };
};
var pct2 = (v) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
var len = (a, b) => Math.abs(b.price - a.price);
var dirOf = (a, b) => b.price >= a.price ? 1 : -1;
var slope = (a, b) => (b.price - a.price) / Math.max(1, b.i - a.i);
function rankFits(fits) {
  return fits.map((f, k) => ({ f, k })).sort((a, b) => Number(b.f.valid) - Number(a.f.valid) || b.f.score - a.f.score || a.k - b.k).map((x) => x.f);
}
function classifyMotive(p, position = "unknown") {
  if (p.length < 6) return [];
  const s = dirOf(p[0], p[1]);
  const w = [len(p[0], p[1]), len(p[1], p[2]), len(p[2], p[3]), len(p[3], p[4]), len(p[4], p[5])];
  const r22 = w[1] / w[0], r4 = w[3] / w[2];
  const w3Shortest = w[2] < w[0] && w[2] < w[4];
  const overlap = s * (p[4].price - p[1].price) <= 0;
  const w3Beyond = s * (p[3].price - p[1].price) > 0;
  const w5Beyond = s * (p[5].price - p[3].price) > 0;
  const base = [
    { id: "w2-origin", severity: "hard", pass: r22 < 1, text: `S\xF3ng 2 kh\xF4ng v\u01B0\u1EE3t g\u1ED1c s\xF3ng 1 (h\u1ED3i ${pct2(r22)})` },
    { id: "w3-not-shortest", severity: "hard", pass: !w3Shortest, text: "S\xF3ng 3 kh\xF4ng ph\u1EA3i s\xF3ng ng\u1EAFn nh\u1EA5t trong 1-3-5" },
    { id: "w3-beyond-w1", severity: "hard", pass: w3Beyond, text: "S\xF3ng 3 v\u01B0\u1EE3t \u0111i\u1EC3m cu\u1ED1i s\xF3ng 1" }
  ];
  const out = [];
  out.push(fit("IM", [
    ...base,
    { id: "w4-no-overlap", severity: "hard", pass: !overlap, text: "S\xF3ng 4 kh\xF4ng l\u1EA5n v\xE0o v\xF9ng gi\xE1 s\xF3ng 1" },
    { id: "w5-beyond-w3", severity: "soft", pass: w5Beyond, text: w5Beyond ? "S\xF3ng 5 v\u01B0\u1EE3t \u0111\u1EC9nh/\u0111\xE1y s\xF3ng 3" : "S\xF3ng 5 h\u1EE5t (truncation)" },
    { id: "w3-ext", severity: "soft", pass: near(w[2] / w[0], DW_FIB.w3, 0.12), text: `S\xF3ng 3 \u2248 161,8 / 261,8 / 361,8% s\xF3ng 1 (th\u1EF1c t\u1EBF ${pct2(w[2] / w[0])})` },
    { id: "w4-depth", severity: "soft", pass: near(r4, DW_FIB.w4, 0.12) || r4 < 0.5, text: `S\xF3ng 4 h\u1ED3i 38,2\u201350% s\xF3ng 3 (th\u1EF1c t\u1EBF ${pct2(r4)})` }
  ], ["0", "1", "2", "3", "4", "5"]));
  const s13 = slope(p[1], p[3]), s24 = slope(p[2], p[4]);
  const contracting = w[2] < w[0] && w[4] < w[2] && w[3] < w[1] && s * (s13 - s24) < 0;
  const expanding = w[2] > w[0] && w[4] > w[2] && w[3] > w[1] && s * (s13 - s24) > 0;
  const wedge = [
    ...base,
    { id: "diag-overlap", severity: "hard", pass: overlap, text: "S\xF3ng 4 l\u1EA5n v\xE0o v\xF9ng gi\xE1 s\xF3ng 1 (\u0111\u1EB7c tr\u01B0ng c\u1EE7a n\xEAm)" },
    { id: "diag-wedge", severity: "hard", pass: contracting || expanding, text: contracting ? "N\xEAm thu h\u1EB9p: 1 > 3 > 5, 2 > 4, hai \u0111\u01B0\u1EDDng h\u1ED9i t\u1EE5" : expanding ? "N\xEAm m\u1EDF r\u1ED9ng: 1 < 3 < 5, 2 < 4, hai \u0111\u01B0\u1EDDng ph\xE2n k\u1EF3" : "Hai \u0111\u01B0\u1EDDng 1-3 v\xE0 2-4 kh\xF4ng t\u1EA1o h\xECnh n\xEAm" },
    { id: "diag-w5", severity: "soft", pass: w5Beyond, text: w5Beyond ? "S\xF3ng 5 v\u01B0\u1EE3t s\xF3ng 3" : "S\xF3ng 5 kh\xF4ng v\u01B0\u1EE3t s\xF3ng 3 (n\xEAm h\u1EE5t)" },
    { id: "diag-deep", severity: "soft", pass: r22 >= 0.5 && r4 >= 0.5, text: "S\xF3ng 2 v\xE0 4 h\u1ED3i s\xE2u (\u2265 50%) \u2014 \u0111i\u1EC3n h\xECnh c\u1EE7a n\xEAm" }
  ];
  if (position !== "middle") {
    if (position !== "last") out.push(fit("LD", [...wedge, { id: "ld-pos", severity: "soft", pass: position === "first" ? true : null, text: "N\xEAm m\u1EDF \u0111\u1EA7u \u1EDF s\xF3ng 1 / s\xF3ng A" }], ["0", "1", "2", "3", "4", "5"]));
    if (position !== "first") out.push(fit("ED", [...wedge, { id: "ed-pos", severity: "soft", pass: position === "last" ? true : null, text: "N\xEAm k\u1EBFt th\xFAc \u1EDF s\xF3ng 5 / s\xF3ng C" }], ["0", "1", "2", "3", "4", "5"]));
  }
  return rankFits(out);
}
function classifyThreeLeg(start, A, B, C, sub = {}) {
  const s = dirOf(start, A), lenA = len(start, A);
  if (!(lenA > 0)) return [];
  const bR = s * (A.price - B.price) / lenA;
  const cBeyond = C ? s * (C.price - A.price) > 0 : null;
  const cR = C ? len(B, C) / lenA : null;
  const L = ["0", "A", "B", "C"];
  const known = (n) => n === 3 || n === 5 ? n : null;
  const aw = known(sub.aWaves), cw = known(sub.cWaves);
  const out = [];
  out.push(fit("ZZ", [
    { id: "zz-b", severity: "hard", pass: bR < 1, text: `B kh\xF4ng v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u A (B h\u1ED3i ${pct2(bR)})` },
    { id: "zz-c", severity: "hard", pass: cBeyond, text: C ? cBeyond ? "C v\u01B0\u1EE3t \u0111i\u1EC3m cu\u1ED1i A" : "C ch\u01B0a v\u01B0\u1EE3t \u0111i\u1EC3m cu\u1ED1i A" : "C ch\u01B0a h\xECnh th\xE0nh" },
    { id: "zz-b-depth", severity: "soft", pass: bR <= DW_FIB.zzB.max, text: `B h\u1ED3i 50\u201361,8% (\u2264 78,6%) c\u1EE7a A` },
    { id: "zz-c-ratio", severity: "soft", pass: cR == null ? null : near(cR, DW_FIB.c, 0.12), text: cR == null ? "C = 100 / 161,8% A (ch\u1EDD C)" : `C \u2248 100 / 161,8% A (th\u1EF1c t\u1EBF ${pct2(cR)})` },
    { id: "zz-a5", severity: "soft", pass: aw == null ? null : aw === 5, text: "A c\xF3 5 s\xF3ng con (5-3-5)" }
  ], L));
  out.push(fit("FL", [
    { id: "fl-b", severity: "hard", pass: bR >= DW_FIB.flatB.min && bR <= 1.05, text: `B h\u1ED3i 90\u2013105% c\u1EE7a A (th\u1EF1c t\u1EBF ${pct2(bR)})` },
    { id: "fl-c", severity: "soft", pass: cR == null ? null : cR >= 0.9 && cR <= 1.2, text: cR == null ? "C \u2248 A (ch\u1EDD C)" : `C \u2248 A, k\u1EBFt th\xFAc g\u1EA7n cu\u1ED1i A (th\u1EF1c t\u1EBF ${pct2(cR)})` },
    { id: "fl-a3", severity: "soft", pass: aw == null ? null : aw === 3, text: "A c\xF3 3 s\xF3ng con (3-3-5)" }
  ], L));
  out.push(fit("EX-FL", [
    { id: "exfl-b", severity: "hard", pass: bR > 1, text: `B v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u A (B = ${pct2(bR)} c\u1EE7a A)` },
    { id: "exfl-c", severity: "hard", pass: C ? cBeyond : null, text: C ? cBeyond ? "C v\u01B0\u1EE3t \u0111i\u1EC3m cu\u1ED1i A" : "C ch\u01B0a v\u01B0\u1EE3t cu\u1ED1i A" : "C ch\u01B0a h\xECnh th\xE0nh" },
    { id: "exfl-b-ratio", severity: "soft", pass: bR <= DW_FIB.flatB.expandedMax + 0.05, text: `B \u2248 127,2 / 138,2% c\u1EE7a A` },
    { id: "exfl-c-ratio", severity: "soft", pass: cR == null ? null : near(cR, [1.618], 0.15), text: cR == null ? "C \u2248 161,8% A (ch\u1EDD C)" : `C \u2248 161,8% A (th\u1EF1c t\u1EBF ${pct2(cR)})` },
    { id: "exfl-a3", severity: "soft", pass: aw == null ? null : aw === 3, text: "A c\xF3 3 s\xF3ng con" }
  ], L));
  out.push(fit("RFL", [
    { id: "rfl-b", severity: "hard", pass: bR > 1, text: `B v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u A (B = ${pct2(bR)} c\u1EE7a A)` },
    { id: "rfl-c", severity: "hard", pass: C ? cBeyond === false : null, text: C ? cBeyond ? "C v\u01B0\u1EE3t cu\u1ED1i A (kh\xF4ng ph\u1EA3i flat ch\u1EA1y)" : "C kh\xF4ng t\u1EDBi cu\u1ED1i A \u2014 xu h\u01B0\u1EDBng l\u1EDBn m\u1EA1nh" : "C ch\u01B0a h\xECnh th\xE0nh" },
    { id: "rfl-a3", severity: "soft", pass: aw == null ? null : aw === 3, text: "A c\xF3 3 s\xF3ng con" }
  ], L));
  out.push(fit("D3", [
    { id: "d3-w3", severity: "hard", pass: aw === 3, text: aw == null ? "W: ch\u01B0a \u0111\u1EBFm \u0111\u01B0\u1EE3c s\xF3ng con" : `W l\xE0 \u0111i\u1EC1u ch\u1EC9nh 3 s\xF3ng (\u0111\u1EBFm \u0111\u01B0\u1EE3c ${aw})` },
    { id: "d3-y3", severity: "hard", pass: cw === 3, text: cw == null ? "Y: ch\u01B0a \u0111\u1EBFm \u0111\u01B0\u1EE3c s\xF3ng con" : `Y l\xE0 \u0111i\u1EC1u ch\u1EC9nh 3 s\xF3ng (\u0111\u1EBFm \u0111\u01B0\u1EE3c ${cw})` },
    { id: "d3-x", severity: "hard", pass: bR < 1, text: `X kh\xF4ng v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u W (X h\u1ED3i ${pct2(bR)})` },
    { id: "d3-y-ratio", severity: "soft", pass: cR == null ? null : near(cR, [1, 0.618, 1.618], 0.12), text: cR == null ? "Y \u2248 W (ch\u1EDD Y)" : `Y \u2248 61,8 / 100 / 161,8% W (th\u1EF1c t\u1EBF ${pct2(cR)})` }
  ], ["0", "W", "X", "Y"]));
  return rankFits(out);
}
function classifyTriangle(p) {
  if (p.length < 6) return [];
  const [o, a, b, c, d, e] = p;
  const L = [len(o, a), len(a, b), len(b, c), len(c, d), len(d, e)];
  const beyondPrevStart = (k) => L[k] > L[k - 1];
  const sAC = slope(a, c), sBD = slope(b, d);
  const s = dirOf(o, a);
  const gapStart = Math.abs(a.price - b.price), gapEnd = Math.abs(a.price + sAC * (e.i - a.i) - (b.price + sBD * (e.i - b.i)));
  const converge = gapEnd < gapStart, diverge = gapEnd > gapStart;
  const labels = ["0", "A", "B", "C", "D", "E"];
  const noneBeyond = [2, 3, 4].every((k) => !beyondPrevStart(k));
  const eInsideD = L[4] < L[3];
  return rankFits([
    fit("TR", [
      { id: "tr-b", severity: "hard", pass: !beyondPrevStart(1), text: "B kh\xF4ng v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u A" },
      { id: "tr-nobeyond", severity: "hard", pass: noneBeyond, text: "C, D, E kh\xF4ng v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u s\xF3ng tr\u01B0\u1EDBc" },
      { id: "tr-converge", severity: "hard", pass: converge, text: "Hai \u0111\u01B0\u1EDDng A-C v\xE0 B-D h\u1ED9i t\u1EE5" },
      { id: "tr-e", severity: "soft", pass: eInsideD, text: "E n\u1EB1m trong D" },
      { id: "tr-shrink", severity: "soft", pass: L[2] < L[1] && L[3] < L[2], text: "C\xE1c s\xF3ng co d\u1EA7n" }
    ], labels),
    fit("RTR", [
      { id: "rtr-b", severity: "hard", pass: beyondPrevStart(1), text: "B v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u A (tam gi\xE1c ch\u1EA1y)" },
      { id: "rtr-nobeyond", severity: "hard", pass: noneBeyond, text: "C, D, E kh\xF4ng v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u s\xF3ng tr\u01B0\u1EDBc" },
      { id: "rtr-converge", severity: "hard", pass: converge, text: "Hai \u0111\u01B0\u1EDDng A-C v\xE0 B-D h\u1ED9i t\u1EE5" },
      { id: "rtr-e", severity: "soft", pass: eInsideD, text: "E n\u1EB1m trong D" }
    ], labels),
    fit("ETR", [
      { id: "etr-grow", severity: "hard", pass: [2, 3, 4].every(beyondPrevStart), text: "M\u1ED7i s\xF3ng C, D, E v\u01B0\u1EE3t \u0111i\u1EC3m \u0111\u1EA7u s\xF3ng tr\u01B0\u1EDBc" },
      { id: "etr-diverge", severity: "hard", pass: diverge, text: "Hai \u0111\u01B0\u1EDDng A-C v\xE0 B-D ph\xE2n k\u1EF3" },
      { id: "etr-dir", severity: "soft", pass: s * (e.price - c.price) > 0 === s * (a.price - o.price) > 0, text: "E c\xF9ng h\u01B0\u1EDBng A" }
    ], labels)
  ]);
}
function innerPivots(candles, a, b, pct3) {
  const seg = candles.slice(a.i, b.i + 1);
  if (seg.length < 5) return [a, b];
  const inner = zigzag(seg, { pct: pct3 }).filter((p) => p.i > 0 && p.i < seg.length - 1 && p.confirmed).map((p) => ({ i: p.i + a.i, price: p.price, time: String(p.time) }));
  const out = [a];
  for (const p of [...inner, b]) {
    const prev = out[out.length - 1], prev2 = out[out.length - 2];
    if (prev2 && Math.sign(prev.price - prev2.price) === Math.sign(p.price - prev.price)) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

// src/lib/quant-core/elliott/v3/waveTree.ts
var WAVE_TREE_VERSION = "ew-v3.0";
var BASE_PCT_STEP = 2e-3;
var WINDOW_ANCHOR = 25;
var NOTATION = [
  () => "",
  (k, m) => m ? ["i", "ii", "iii", "iv", "v"][k] : ["a", "b", "c", "d", "e"][k],
  (k, m) => m ? String(k + 1) : "ABCDE"[k],
  (k, m) => `(${m ? k + 1 : "ABCDE"[k]})`,
  (k, m) => `[${m ? k + 1 : "ABCDE"[k]}]`,
  (k, m) => `{${m ? k + 1 : "ABCDE"[k]}}`
];
var WXY = ["W", "X", "Y"];
function waveLabel(level, index, pattern) {
  const f = NOTATION[Math.min(level, NOTATION.length - 1)];
  if (pattern === "D3") {
    const w = WXY[index] ?? "?";
    return level === 1 ? w.toLowerCase() : level >= 3 ? `(${w})` : w;
  }
  return f(index, pattern === "IM" || pattern === "LD" || pattern === "ED");
}
function medianAtrPct(c, n = 14, lookback = 200) {
  if (c.length < n + 2) return 0.03;
  const tr = [];
  let prev = NaN;
  const pcts = [];
  for (let i = 1; i < c.length; i++) {
    const t = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    tr.push(t);
    if (tr.length === n) prev = tr.reduce((a, b) => a + b, 0) / n;
    else if (tr.length > n) prev = (prev * (n - 1) + t) / n;
    if (tr.length >= n && i >= c.length - lookback && c[i].close > 0) pcts.push(prev / c[i].close);
  }
  pcts.sort((a, b) => a - b);
  return pcts.length ? pcts[pcts.length >> 1] : 0.03;
}
var PT = (p) => ({ i: p.i, price: p.price, time: p.time });
var ROLE_H = /* @__PURE__ */ new Set();
var ROLE_L = /* @__PURE__ */ new Set();
function extremesOk(c, pts2, roleH = ROLE_H, roleL = ROLE_L) {
  for (let k = 1; k < pts2.length - 1; k++) {
    const up = pts2[k].price > pts2[k - 1].price;
    for (let i = pts2[k - 1].i + 1; i < pts2[k + 1].i; i++) {
      if (up ? !roleL.has(i) && c[i].high > pts2[k].price * (1 + 1e-9) : !roleH.has(i) && c[i].low < pts2[k].price * (1 - 1e-9)) return false;
    }
  }
  return true;
}
var role = (n) => n.kind === "motive" ? 5 : n.kind === "corrective" ? 3 : n.kind === "leg" ? n.sig >= 5 ? 5 : n.sig === 3 ? 3 : 1 : 1;
var sigScore = (nodes2, expect) => {
  let s = 0;
  nodes2.forEach((n, k) => {
    const r = role(n);
    if (r === 1) return;
    s += expect[k]?.includes(r) ? 0.4 : -0.4;
  });
  return s;
};
var PATTERN_PRIOR = { IM: 0.3, LD: -0.3, ED: -0.2, ZZ: 0.2, FL: 0.1, "EX-FL": 0, RFL: -1.4, TR: 0, RTR: -1, ETR: -1, D3: -0.2 };
var structScore = (len2, fitScore, sig, tag) => len2 * (0.45 + 0.55 * fitScore) + sig + (PATTERN_PRIOR[tag] ?? 0);
var partialScore = (len2, sig, tag) => len2 * 0.35 + 0.6 * sig + (PATTERN_PRIOR[tag] ?? 0);
var ORPHAN_COST = -0.6;
var ORPHAN_EDGE_COST = -0.25;
function makeNode(level, kind, pattern, children, complete, score, fit2) {
  const start = children[0].start, end = children[children.length - 1].end;
  return {
    level,
    kind,
    pattern,
    complete,
    provisional: children.some((c) => c.provisional),
    dir: end.price >= start.price ? 1 : -1,
    start,
    end,
    children,
    childLabels: [],
    sig: kind === "motive" ? 5 : kind === "corrective" ? 3 : 1,
    score,
    fit: fit2
  };
}
function candidatesAt(c, nodes2, j, level) {
  const out = [];
  const m = nodes2.length;
  const pts2 = (len2) => [nodes2[j].start, ...nodes2.slice(j, j + len2).map((n) => n.end)];
  if (j + 5 <= m) {
    const p = pts2(5), seg = nodes2.slice(j, j + 5);
    if (extremesOk(c, p)) {
      const pp = p.map(PT);
      for (const f of classifyMotive(pp, "unknown")) if (f.valid) {
        const exp = f.tag === "IM" ? [[5], [3, 1], [5], [3, 1], [5]] : [[5, 3], [3], [5, 3], [3], [5, 3]];
        out.push({ len: 5, node: makeNode(level, "motive", f.tag, seg, true, structScore(5, f.score, sigScore(seg, exp), f.tag), f) });
      }
      for (const f of classifyTriangle(pp)) if (f.valid)
        out.push({ len: 5, node: makeNode(level, "corrective", f.tag, seg, true, structScore(5, f.score, sigScore(seg, [[3], [3], [3], [3], [3]]), f.tag), f) });
    }
  }
  if (j + 3 <= m) {
    const p = pts2(3), seg = nodes2.slice(j, j + 3);
    if (extremesOk(c, p)) {
      const [o, A, B, C] = p.map(PT);
      for (const f of classifyThreeLeg(o, A, B, C, { aWaves: role(seg[0]) === 1 ? null : role(seg[0]), cWaves: role(seg[2]) === 1 ? null : role(seg[2]) })) if (f.valid) {
        const exp = f.tag === "ZZ" ? [[5], [3], [5]] : f.tag === "D3" ? [[3], [3, 5], [3]] : [[3], [3], [5]];
        out.push({ len: 3, node: makeNode(level, "corrective", f.tag, seg, true, structScore(3, f.score, sigScore(seg, exp), f.tag), f) });
      }
    }
  }
  const rest = m - j;
  if (rest >= 1 && rest <= 4) {
    const p = pts2(rest), seg = nodes2.slice(j);
    if (extremesOk(c, p)) {
      const L = (a, b) => Math.abs(b.price - a.price);
      const s = Math.sign(p[1].price - p[0].price);
      const w2ok = rest < 2 || L(p[1], p[2]) < L(p[0], p[1]);
      const w3ok = rest < 3 || s * (p[3].price - p[1].price) > 0 || !p[3].confirmed;
      const w4ok = rest < 4 || s * (p[4].price - p[1].price) > 0;
      if (w2ok && w3ok && w4ok && rest >= 2)
        out.push({ len: rest, node: makeNode(level, "motive", "IM", seg, false, partialScore(rest, sigScore(seg, [[5], [3, 1], [5], [3, 1]]), "IM"), null) });
      if (rest <= 2 && w2ok && rest === 2)
        out.push({ len: rest, node: makeNode(level, "corrective", "ZZ", seg, false, partialScore(rest, sigScore(seg, [[5, 3], [3]]), "ZZ"), null) });
      if (rest === 2) {
        const bR = L(p[1], p[2]) / L(p[0], p[1]);
        if (bR > 1 && bR <= 1.382 + 0.05) out.push({ len: 2, node: makeNode(level, "corrective", "EX-FL", seg, false, partialScore(2, sigScore(seg, [[3], [3]]), "EX-FL"), null) });
      }
      if (rest >= 3) {
        const legs = seg.map((n) => L(n.start, n.end));
        const shrinking = legs.slice(1).every((x, k) => k === 0 || x < legs[k]);
        if (shrinking) out.push({ len: rest, node: makeNode(level, "corrective", "TR", seg, false, partialScore(rest, sigScore(seg, [[3], [3], [3], [3]]), "TR") - 0.3, null) });
      }
    }
  }
  return out;
}
function parseLevel(c, nodes2, level, K = 2) {
  const m = nodes2.length;
  const best = Array.from({ length: m + 1 }, () => []);
  best[0] = [{ score: 0, nodes: [] }];
  const push = (e, p) => {
    const list = best[e];
    list.push(p);
    list.sort((a, b) => b.score - a.score);
    if (list.length > K) list.length = K;
  };
  for (let j = 0; j < m; j++) {
    if (!best[j].length) continue;
    const cands = candidatesAt(c, nodes2, j, level);
    for (const prev of best[j]) {
      const orphan = { ...nodes2[j], level, kind: "orphan", pattern: null, children: [nodes2[j]], complete: true, childLabels: [], sig: 1, score: 0, fit: null };
      push(j + 1, { score: prev.score + (j === m - 1 ? ORPHAN_EDGE_COST : ORPHAN_COST), nodes: [...prev.nodes, orphan] });
      for (const cd of cands) push(j + cd.len, { score: prev.score + cd.node.score, nodes: [...prev.nodes, cd.node] });
    }
  }
  return best[m];
}
function assignLabels(n) {
  if (n.kind !== "motive" && n.kind !== "corrective") return;
  n.childLabels = n.children.map((_, k) => waveLabel(n.level, k, n.pattern));
}
function buildWaveTree(candles, opts = {}) {
  const start = Math.floor(Math.max(0, candles.length - 500) / WINDOW_ANCHOR) * WINDOW_ANCHOR;
  const c = candles.slice(start);
  if (c.length < 60) return null;
  const basePct = opts.basePct ?? Math.min(0.08, Math.max(8e-3, Math.round(medianAtrPct(c) / BASE_PCT_STEP) * BASE_PCT_STEP));
  const zz = zigzag(c, { pct: basePct });
  const pivots2 = zz.map((p) => ({ i: p.i, price: p.price, time: String(p.time), type: p.type, confirmed: p.confirmed, ci: p.ci })).filter((p) => !opts.confirmedOnly || p.confirmed);
  if (pivots2.length < 3) return null;
  ROLE_H = new Set(pivots2.filter((p) => p.type === "H").map((p) => p.i));
  ROLE_L = new Set(pivots2.filter((p) => p.type === "L").map((p) => p.i));
  const legs = [];
  for (let k = 1; k < pivots2.length; k++) {
    const a = pivots2[k - 1], b = pivots2[k];
    const n = innerPivots(c, PT(a), PT(b), basePct * 0.45).length - 1;
    legs.push({
      level: 0,
      kind: "leg",
      pattern: null,
      complete: b.confirmed,
      provisional: !b.confirmed,
      dir: b.price >= a.price ? 1 : -1,
      start: a,
      end: b,
      children: [],
      childLabels: [],
      sig: n,
      score: 0,
      fit: null
    });
  }
  const levels = [legs];
  const alternates = [];
  const maxLevels = opts.maxLevels ?? 5;
  let cur = legs;
  for (let lv = 1; lv <= maxLevels && cur.length >= 3; lv++) {
    const paths = parseLevel(c, cur, lv);
    if (!paths.length) break;
    const top = paths[0].nodes;
    if (!top.some((n) => n.kind === "motive" || n.kind === "corrective")) break;
    top.forEach(assignLabels);
    levels.push(top);
    const alt = paths[1]?.nodes[paths[1].nodes.length - 1];
    const last = top[top.length - 1];
    if (alt && (alt.kind !== last.kind || alt.pattern !== last.pattern || alt.start.i !== last.start.i)) {
      assignLabels(alt);
      alternates.push({ level: lv, node: alt });
    }
    if (top.length === cur.length) break;
    cur = top;
  }
  const position = levels.slice(1).map((l) => l[l.length - 1]).reverse();
  let dualLabel = null;
  for (const a of [...alternates].sort((x, y) => y.level - x.level)) {
    const main = levels[a.level][levels[a.level].length - 1];
    if (main.kind !== "orphan" && a.node.kind !== "orphan" && main.kind !== a.node.kind) {
      const nm = waveLabel(a.level + 1, 0, main.kind === "motive" ? "IM" : "ZZ"), na = waveLabel(a.level + 1, 0, a.node.kind === "motive" ? "IM" : "ZZ");
      dualLabel = main.kind === "motive" ? `${nm}/${na}` : `${na}/${nm}`;
      break;
    }
  }
  return { version: WAVE_TREE_VERSION, basePct, pivots: pivots2, levels, position, alternates, dualLabel, asOf: String(c[c.length - 1].time), barCount: c.length };
}

// src/lib/quant-core/elliott/v3/scenarios.ts
var SCENARIO_ENGINE_VERSION = "ew-scn-1.0";
var STATE_LABEL = {
  waiting: "Ch\u1EDD k\xEDch ho\u1EA1t",
  triggered: "\u0110\xE3 k\xEDch ho\u1EA1t",
  target1: "\u0110\u1EA1t m\u1EE5c ti\xEAu 1",
  target2: "\u0110\u1EA1t m\u1EE5c ti\xEAu 2",
  invalidated: "V\xF4 hi\u1EC7u",
  expired: "H\u1EBFt h\u1EA1n"
};
var TEMPLATE_TITLE = {
  wave3: "S\xF3ng 3",
  wave5: "S\xF3ng 5",
  waveC: "S\xF3ng C",
  triangleThrust: "B\u1EADt kh\u1ECFi tam gi\xE1c",
  afterImpulse: "\u0110i\u1EC1u ch\u1EC9nh sau 5 s\xF3ng",
  afterCorrection: "Xu h\u01B0\u1EDBng m\u1EDBi sau \u0111i\u1EC1u ch\u1EC9nh"
};
var EXPIRY = { waitBars: 60, runBars: 120 };
var pts = (n) => [n.children[0].start, ...n.children.map((c) => c.end)];
var fmt5 = (v) => Math.round(v).toLocaleString("vi-VN");
function finish(base, used, symbol) {
  const trig = base.trigger.price, d = base.dir;
  if (d * (base.invalidation.price - trig) >= 0) return null;
  const from = base.anchors[base.anchors.length - 1].price;
  if (d * (base.targets[0].price - trig) <= 0)
    base = { ...base, targets: base.targets.map((t) => ({ price: trig + d * Math.abs(t.price - from), label: `${t.label} (\u0111o t\u1EEB k\xEDch ho\u1EA1t)` })) };
  const ci = used.map((p) => p.ci);
  const provisional = ci.some((x) => x == null);
  const anchorKey = base.anchors.map((a) => a.time).join(",");
  return { ...base, id: `${symbol}|${base.template}|${base.level}|${anchorKey}`, createdAt: null, provisional, expiry: EXPIRY };
}
function scenarioFromNode(n, prev, role2, symbol = "") {
  if (n.kind !== "motive" && n.kind !== "corrective") return null;
  const p = pts(n);
  const k = n.children.length;
  const s = p[1].price >= p[0].price ? 1 : -1;
  const L = (a, b) => Math.abs(b.price - a.price);
  const lab = n.childLabels;
  const anchors = (k2) => p.slice(0, k2 + 1).map((x, j) => ({ time: x.time, price: x.price, label: j === 0 ? "0" : lab[j - 1] ?? String(j) }));
  const tri = n.pattern === "TR" || n.pattern === "RTR" || n.pattern === "ETR";
  if (n.kind === "motive") {
    if ((k === 2 || k === 3) && !n.complete) {
      const w1 = L(p[0], p[1]);
      return finish({
        template: "wave3",
        role: role2,
        level: n.level,
        dir: s,
        title: TEMPLATE_TITLE.wave3,
        anchors: anchors(2),
        trigger: { price: p[1].price, line: null, text: `\u0110\xF3ng c\u1EEDa ${s > 0 ? "v\u01B0\u1EE3t" : "th\u1EE7ng"} ${lab[0]} ${fmt5(p[1].price)}` },
        targets: [{ price: p[2].price + s * 1.618 * w1, label: "161,8% s\xF3ng 1" }, { price: p[2].price + s * 2.618 * w1, label: "261,8% s\xF3ng 1" }],
        invalidation: { price: p[2].price, text: `${s > 0 ? "Th\u1EE7ng" : "V\u01B0\u1EE3t"} cu\u1ED1i s\xF3ng 2 ${fmt5(p[2].price)}` }
      }, p.slice(0, 3), symbol);
    }
    if ((k === 4 || k === 5) && !n.complete) {
      const len03 = L(p[0], p[3]);
      let t = [0.618, 1], t1 = p[4].price + s * t[0] * len03;
      if (s * (t1 - p[3].price) <= 0) {
        t = [1, 1.618];
        t1 = p[4].price + s * t[0] * len03;
      }
      return finish({
        template: "wave5",
        role: role2,
        level: n.level,
        dir: s,
        title: TEMPLATE_TITLE.wave5,
        anchors: anchors(4),
        trigger: { price: p[3].price, line: null, text: `\u0110\xF3ng c\u1EEDa ${s > 0 ? "v\u01B0\u1EE3t" : "th\u1EE7ng"} cu\u1ED1i s\xF3ng 3 ${fmt5(p[3].price)}` },
        targets: t.map((r) => ({ price: p[4].price + s * r * len03, label: `${String(r * 100).replace(".", ",")}% c\u1EE7a 0\u21923` })),
        invalidation: { price: p[4].price, text: `${s > 0 ? "Th\u1EE7ng" : "V\u01B0\u1EE3t"} cu\u1ED1i s\xF3ng 4 ${fmt5(p[4].price)}` }
      }, p.slice(0, 5), symbol);
    }
    if (n.complete && k === 5) {
      const len2 = L(p[0], p[5]);
      return finish({
        template: "afterImpulse",
        role: role2,
        level: n.level,
        dir: -s,
        title: TEMPLATE_TITLE.afterImpulse,
        anchors: anchors(5),
        trigger: { price: p[4].price, line: null, text: `\u0110\xF3ng c\u1EEDa ${s > 0 ? "th\u1EE7ng" : "v\u01B0\u1EE3t"} cu\u1ED1i s\xF3ng 4 ${fmt5(p[4].price)}` },
        targets: [{ price: p[5].price - s * 0.382 * len2, label: "h\u1ED3i 38,2% c\u1EE7a 0\u21925" }, { price: p[5].price - s * 0.618 * len2, label: "h\u1ED3i 61,8% c\u1EE7a 0\u21925" }],
        invalidation: { price: p[5].price, text: `${s > 0 ? "V\u01B0\u1EE3t" : "Th\u1EE7ng"} \u0111\u1EC9nh s\xF3ng 5 ${fmt5(p[5].price)}` }
      }, p, symbol);
    }
    return null;
  }
  if (tri && k >= 4) {
    const A = L(p[0], p[1]), thrust = -s;
    const B = p[2], D = p[4], last = p[Math.min(k, 5)];
    const opp = [p[3], p[5]].filter(Boolean).map((x) => x.price);
    const inv = thrust > 0 ? Math.min(...opp) : Math.max(...opp);
    return finish({
      template: "triangleThrust",
      role: role2,
      level: n.level,
      dir: thrust,
      title: TEMPLATE_TITLE.triangleThrust,
      anchors: anchors(Math.min(k, 5)),
      trigger: { price: D.price, line: { a: { time: B.time, price: B.price }, b: { time: D.time, price: D.price } }, text: "\u0110\xF3ng c\u1EEDa v\u01B0\u1EE3t \u0111\u01B0\u1EDDng B\u2013D c\u1EE7a tam gi\xE1c" },
      targets: [{ price: last.price + thrust * A, label: "100% \u0111\u1ED9 r\u1ED9ng ch\u1EB7ng A" }, { price: last.price + thrust * 1.618 * A, label: "161,8% ch\u1EB7ng A" }],
      invalidation: { price: inv, text: `${thrust > 0 ? "Th\u1EE7ng" : "V\u01B0\u1EE3t"} ${fmt5(inv)} (c\u1EF1c tr\u1ECB C/E)` }
    }, p.slice(0, Math.min(k, 5) + 1), symbol);
  }
  if (!tri && (k === 2 || k === 3) && !n.complete) {
    const lenA = L(p[0], p[1]);
    return finish({
      template: "waveC",
      role: role2,
      level: n.level,
      dir: s,
      title: TEMPLATE_TITLE.waveC,
      anchors: anchors(2),
      trigger: { price: p[1].price, line: null, text: `\u0110\xF3ng c\u1EEDa ${s > 0 ? "v\u01B0\u1EE3t" : "th\u1EE7ng"} cu\u1ED1i ${lab[0]} ${fmt5(p[1].price)}` },
      targets: [{ price: p[2].price + s * lenA, label: "C = 100% A" }, { price: p[2].price + s * 1.618 * lenA, label: "C = 161,8% A" }],
      invalidation: { price: p[2].price, text: `${s > 0 ? "Th\u1EE7ng" : "V\u01B0\u1EE3t"} cu\u1ED1i ${lab[1]} ${fmt5(p[2].price)}` }
    }, p.slice(0, 3), symbol);
  }
  if (!tri && n.complete && k === 3) {
    const nd = -s;
    const base = prev && prev.kind === "motive" ? L(prev.start, prev.end) : L(p[0], p[1]);
    return finish({
      template: "afterCorrection",
      role: role2,
      level: n.level,
      dir: nd,
      title: TEMPLATE_TITLE.afterCorrection,
      anchors: anchors(3),
      trigger: { price: p[2].price, line: null, text: `\u0110\xF3ng c\u1EEDa ${nd > 0 ? "v\u01B0\u1EE3t" : "th\u1EE7ng"} cu\u1ED1i ${lab[1]} ${fmt5(p[2].price)}` },
      targets: [{ price: p[3].price + nd * base, label: prev?.kind === "motive" ? "100% c\u1EA5u tr\xFAc \u0111\u1EA9y tr\u01B0\u1EDBc" : "100% ch\u1EB7ng A" }, { price: p[3].price + nd * 1.618 * base, label: "161,8%" }],
      invalidation: { price: p[3].price, text: `${nd > 0 ? "Th\u1EE7ng" : "V\u01B0\u1EE3t"} cu\u1ED1i ${lab[2]} ${fmt5(p[3].price)}` }
    }, p, symbol);
  }
  return null;
}
function scenariosFromTree(tree, candles, symbol = "") {
  if (!tree) return [];
  const w = candles.slice(candles.length - tree.barCount);
  const out = [];
  for (let lv = tree.levels.length - 1; lv >= 1 && out.length < 2; lv--) {
    const lvl = tree.levels[lv];
    const sc = scenarioFromNode(lvl[lvl.length - 1], lvl[lvl.length - 2] ?? null, out.length ? "secondary" : "primary", symbol);
    if (sc) out.push(sc);
  }
  for (const a of tree.alternates) {
    const lvl = tree.levels[a.level];
    const sc = scenarioFromNode(a.node, lvl[lvl.length - 2] ?? null, "alternate", symbol);
    if (sc && !out.some((x) => x.id === sc.id)) {
      out.push(sc);
      break;
    }
  }
  for (const sc of out) {
    if (sc.provisional) continue;
    const piv = tree.pivots.filter((p) => sc.anchors.some((a) => a.time === p.time));
    const ci = Math.max(...piv.map((p) => p.ci ?? -1));
    sc.createdAt = ci >= 0 && w[ci] ? String(w[ci].time) : null;
    if (!sc.createdAt) sc.provisional = true;
  }
  return out;
}
function triggerAt(sc, candles, i) {
  if (!sc.trigger.line) return sc.trigger.price;
  const ia = candles.findIndex((c) => String(c.time) === sc.trigger.line.a.time), ib = candles.findIndex((c) => String(c.time) === sc.trigger.line.b.time);
  if (ia < 0 || ib <= ia) return sc.trigger.price;
  const slope2 = (sc.trigger.line.b.price - sc.trigger.line.a.price) / (ib - ia);
  return sc.trigger.line.a.price + slope2 * (i - ia);
}
function evaluateLifecycle(sc, candles, fromTime = sc.createdAt) {
  const ev = [];
  if (!fromTime) return { state: "waiting", events: ev, triggerPrice: null, barsEvaluated: 0 };
  let state = "waiting", trigIdx = -1, waited = 0, n = 0;
  let triggerPrice = null;
  const d = sc.dir, inv = sc.invalidation.price, [t1, t2] = sc.targets.map((t) => t.price);
  const touchedInv = (adverse) => d * (inv - adverse) >= 0;
  const reached = (favorable, t) => d * (favorable - t) >= 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = String(c.time);
    if (time <= fromTime) continue;
    n++;
    const fav = d > 0 ? c.high : c.low, adv = d > 0 ? c.low : c.high;
    if (touchedInv(adv)) {
      state = "invalidated";
      ev.push({ type: "invalidated", time, price: inv });
      break;
    }
    if (state === "waiting") {
      if (d * (c.close - triggerAt(sc, candles, i)) > 0) {
        state = "triggered";
        trigIdx = i;
        triggerPrice = c.close;
        ev.push({ type: "triggered", time, price: c.close });
        continue;
      }
      if (++waited > sc.expiry.waitBars) {
        state = "expired";
        ev.push({ type: "expired", time, price: c.close });
        break;
      }
      continue;
    }
    if (state === "triggered" && reached(fav, t1)) {
      state = "target1";
      ev.push({ type: "target1", time, price: t1 });
    }
    if (state === "target1" && t2 != null && reached(fav, t2)) {
      state = "target2";
      ev.push({ type: "target2", time, price: t2 });
      break;
    }
    if (state === "triggered" && i - trigIdx > sc.expiry.runBars) {
      state = "expired";
      ev.push({ type: "expired", time, price: c.close });
      break;
    }
  }
  return { state, events: ev, triggerPrice, barsEvaluated: n };
}
function randomWalkHitProb(x, target, invalid) {
  const a = Math.abs(target - x), b = Math.abs(x - invalid);
  return a + b > 0 ? b / (a + b) : 0.5;
}
function scoreLedger(rows) {
  let hits = 0, exp = 0, varSum = 0, n = 0;
  for (const r of rows) {
    if (r.triggerPrice == null || !r.outcome) continue;
    const p = randomWalkHitProb(r.triggerPrice, r.target1, r.invalidation);
    n++;
    exp += p;
    varSum += p * (1 - p);
    if (r.outcome === "hit") hits++;
  }
  const z = varSum > 0 ? (hits - exp) / Math.sqrt(varSum) : null;
  return { n, hits, expected: exp, hitRate: n ? hits / n : null, expectedRate: n ? exp / n : null, z, pass: n >= EP2_PREREG.minN && z != null && z >= EP2_PREREG.zPass };
}
var EP2_PREREG = {
  registeredAt: "2026-10-24",
  hypothesis: "K\u1ECBch b\u1EA3n \u0111\xE3 k\xEDch ho\u1EA1t \u0111\u1EA1t m\u1EE5c ti\xEAu 1 tr\u01B0\u1EDBc m\u1ED1c v\xF4 hi\u1EC7u NHI\u1EC0U H\u01A0N chu\u1EA9n ng\u1EABu nhi\xEAn (ng\u01B0\u1EDDi \u0111\xE1nh b\u1EA1c ph\xE1 s\u1EA3n).",
  minN: 100,
  zPass: 1.96,
  note: "Ch\u01B0a \u0111\u1EE7 100 k\u1ECBch b\u1EA3n k\u1EBFt th\xFAc th\xEC ghi 'ch\u01B0a \u0111\u1EE7 m\u1EABu'; kh\xF4ng \u0111\u1ED5i ti\xEAu ch\xED sau khi xem d\u1EEF li\u1EC7u."
};
export {
  CONVERGENCE,
  CONVERGENCE_VERSION,
  ENGINE_VERSION,
  EP2_PREREG,
  STATE_LABEL as EW_STATE_LABEL,
  TEMPLATE_TITLE as EW_TEMPLATE_TITLE,
  MTF_STRUCTURE_VERSION,
  PATTERN_NAME,
  SCENARIO_ENGINE_VERSION,
  SIGNAL_TEXT,
  STAGE_LABEL,
  STAGE_TEXT,
  WAVE_TREE_VERSION,
  WYCKOFF_DEFAULT_ENGINE,
  alignMatrix,
  analyzeStructureMtf,
  analyzeTf as analyzeStructureTf,
  analyzeTfSeries as analyzeStructureTfSeries,
  buildWaveTree,
  closedHtfIndex,
  clusterLevels,
  compactStructure,
  compactTf as compactStructureTf,
  convergenceAt,
  evaluateLifecycle,
  minutesToH1,
  patternStatusAt,
  randomWalkHitProb,
  recentBuy,
  scenariosFromTree,
  scoreLedger,
  toWeekly
};
