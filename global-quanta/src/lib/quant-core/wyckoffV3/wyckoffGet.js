/**
 * wyckoff.js — Phương pháp Wyckoff · ES module, không phụ thuộc thư viện ngoài
 * Nguồn: tài liệu "phương pháp đầu tư Wyckoff" (tích lũy A–E, phân phối, Upthrust/Spring, 3 quy luật, Buying/Selling Climax, POE#1–#3).
 *
 * Dữ liệu nến: [{ time, open, high, low, close, volume }]  (tăng dần theo thời gian; BẮT BUỘC có volume)
 *
 * NGUYÊN TẮC THIẾT KẾ
 *  • Nhân quả (causal): mọi bộ phát hiện chỉ dùng dữ liệu ≤ nến hiện tại → dùng được cho backtest và thời gian thực.
 *  • Tài liệu mô tả bằng lời (định tính). Mọi ngưỡng số (vd. "KLGD lớn", "thấp", "wide spread") đều là THAM SỐ trong DEFAULTS,
 *    do mình chọn giá trị khởi điểm. Chúng cần được hiệu chỉnh/backtest, không phải chân lý của tài liệu.
 *  • Phân phối = ảnh gương của tích lũy (đảo dấu giá) → cùng một bộ máy, đặt lại tên sự kiện (PS→PSY, SC→BC, Spring→UT/UTAD, SOS→SOW, LPS→LPSY...).
 *
 * [GQ] Tích hợp vào quant-core (Wyckoff v3, 2026-10-08) từ bản người dùng đính kèm. Logic giữ nguyên, chỉ sửa ở các chỗ đánh dấu [GQ]:
 *   1. Mọi sự kiện có `ci` = chỉ số nến tại đó sự kiện được XÁC NHẬN (chỉ biết được khi nến ci đóng cửa). Bản gốc gắn
 *      sự kiện vào ngày xảy ra (VD Spring ở đáy iLow) nhưng một số sự kiện chỉ biết được sau đó (Spring khi đóng cửa lại
 *      trong TR, Test khi đảo chiều, ST Phase B cần 2 nến sau, LPS/BUA khi phá khỏi BUA). Sự kiện tạm thời: ci = null.
 *   2. Sau SOS (Phase D) nếu giá ĐÓNG CỬA dưới hỗ trợ TR -> cấu trúc thất bại (bản gốc chỉ xét 3 nến sau SOS).
 *   3. Cấu trúc "đang hoạt động" nhưng lâu không có sự kiện mới (so với độ dài CHÍNH cấu trúc đó, không dùng số phiên cố định)
 *      hoặc giá đã rời TR xa -> `stale`; `current` = cấu trúc đang hoạt động MỚI NHẤT còn hiệu lực (bản gốc: pha xa nhất).
 *   4. backtestPOE: khoá loại trùng theo chỉ số tuyệt đối (bản gốc dùng khoá cấu trúc tương đối với cửa sổ trượt -> đếm lặp),
 *      vào lệnh giá MỞ CỬA nến sau khi tín hiệu được biết (bản gốc: đóng cửa nến t).
 *   5. Phase B chỉ chạy khi Phase A HOÀN TẤT (ST đã xác nhận / hết cửa sổ tìm ST / giá bứt lên trên AR); SC/AR/PS chỉ xác
 *      nhận cùng ST (trước đó SC còn có thể bị hạ cấp thành PS); SOS nhánh không-Spring tạm thời trong falseBreakBars nến.
 *      -> test bất biến: cập nhật từng nến, sự kiện đã xác nhận của cấu trúc có climax không đổi (đo trên 225 mã: 0,00%).
 *   6. Spring thất bại cả sau cửa sổ Test; sau SOS, đóng cửa dưới giữa TR (ngưỡng sosFailFrac) -> cấu trúc thất bại.
 *   7. Ghi chú sự kiện của cấu trúc phân phối (ảnh gương) dùng đúng từ ngữ chiều giảm.
 * Giới hạn còn lại: vùng đi ngang KHÔNG có climax chọn hướng theo bằng chứng tới hiện tại -> có thể đổi hướng (0,9% sự kiện).
 */

// ───────────────────────────── Tham số ─────────────────────────────
export const DEFAULTS = {
  atrN: 14, volBase: 50,
  // bối cảnh xu hướng trước đó
  trendLookback: 30, trendMinATR: 4, trendMinER: 0.25,
  // Phase A
  scVol: 2.0, scChainVol: 2.0, scSpread: 1.3, scLowLookback: 20,   // SC: KLGD đột biến + biên rộng, hoặc chuỗi nến KLGD lớn thân hẹp
  psVol: 1.3, psLookback: 25,                                      // PS: vài nến KLGD > trung bình
  arMinBars: 2, arMaxBars: 10, arPullbackFrac: 0.3, arMinRiseATR: 1.5,   // AR: nhịp tăng 2–3 ngày
  stMaxBars: 60, stZoneFrac: 0.15, stBreakFrac: 0.1, stVolRatio: 0.8,
  // Phase B/C
  minBarsB: 12,                    // thủng đáy trước ngưỡng này = SOW trong B, sau ngưỡng = Spring/Shakeout (Phase C)
  falseBreakBars: 3,               // số nến tối đa để coi là "quay lại ngay"
  breachMaxBars: 4,                // số nến đóng dưới hỗ trợ tối đa vẫn coi là Spring/Shakeout
  lowVol: 0.8, highVol: 1.5,       // KLGD thấp / lớn hơn trung bình (so với trung bình volBase nến)
  testMaxBars: 25, testZoneFrac: 0.25, testRallyFrac: 0.35,   // Test chỉ tính sau khi giá đã hồi ≥ testRallyFrac × độ rộng TR
  // Phase D/E
  sosSpread: 1.3, sosVol: 1.2, sosHold: 3, sosFailFrac: 0.5,
  lpsMaxRetraceFrac: 0.5,
  buaMinBars: 3, buaMaxRangeATR: 3,
  // Quản lý lệnh: tài liệu dùng "5–10 pip" (forex). Với cổ phiếu dùng ATR/%.
  stop: { mode: 'atr', value: 0.25 },     // 'atr' | 'pct' | 'abs'
  poeSizes: [50, 30, 20],                 // % vị thế chuẩn cho POE#1, #2, #3 (tài liệu)
  // vùng đi ngang tổng quát (tái tích lũy / tái phân phối, không có SC/BC rõ)
  rangeMinBars: 25, rangeER: 0.3, rangeMaxATR: 12,
  allowNoVolume: false,
  // [GQ] hết hiệu lực: không có sự kiện xác nhận mới trong staleFactor × độ dài cấu trúc (tối thiểu staleMinBars nến),
  // hoặc giá đóng cửa cách biên TR quá awayHeights × độ rộng TR mà không có SOS/SOW xác nhận.
  staleFactor: 1, staleMinBars: 20, awayHeights: 1,
};

const R = (x, d = 2) => (x == null || !isFinite(x) ? x : +x.toFixed(d));
const merge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]; return o; };
const sma = (a, n) => { const out = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; } return out; };
const mirrorCandles = c => c.map(x => ({ ...x, open: -x.open, close: -x.close, high: -x.low, low: -x.high }));

// ───────────────────────────── 1. Chỉ số từng nến ─────────────────────────────
export function atrSeries(c, n = 14) {
  const out = new Array(c.length).fill(NaN); let sum = 0, prev = NaN;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].high - c[i].low
      : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i < n) { sum += tr; if (i === n - 1) { prev = sum / n; out[i] = prev; } } else { prev = (prev * (n - 1) + tr) / n; out[i] = prev; }
  }
  return out;
}
export const hasVolume = c => c.length > 0 && c.every(x => Number.isFinite(x.volume));

/** volRel = KLGD / trung bình volBase nến TRƯỚC (không pha loãng đột biến); spreadRel = biên độ / ATR nến trước; clv ∈ [-1,1]. */
export function barMetrics(c, o = DEFAULTS) {
  const n = c.length, atr = atrSeries(c, o.atrN), hv = hasVolume(c);
  const volRel = new Array(n).fill(1), spreadRel = new Array(n).fill(1), clv = new Array(n).fill(0), body = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (hv) { const a = Math.max(0, i - o.volBase), cnt = i - a; if (cnt >= 5) { let t = 0; for (let j = a; j < i; j++) t += c[j].volume; volRel[i] = c[i].volume / (t / cnt || 1); } }
    const rng = c[i].high - c[i].low, ref = i > 0 && isFinite(atr[i - 1]) ? atr[i - 1] : atr[i];
    spreadRel[i] = ref > 0 ? rng / ref : 1;
    clv[i] = rng > 0 ? (2 * c[i].close - c[i].high - c[i].low) / rng : 0;
    body[i] = rng > 0 ? Math.abs(c[i].close - c[i].open) / rng : 0;
  }
  return { atr, volRel, spreadRel, clv, body, hasVolume: hv };
}

const er = (c, i, L) => { let path = 0; for (let k = i - L + 1; k <= i; k++) path += Math.abs(c[k].close - c[k - 1].close); return path > 0 ? Math.abs(c[i].close - c[i - L].close) / path : 0; };
/** Xu hướng trước đó: −1 giảm, +1 tăng, 0 không rõ. */
export function priorTrend(c, m, i, o = DEFAULTS) {
  const L = o.trendLookback; if (i < L) return { dir: 0 };
  const net = (c[i].close - c[i - L].close) / (m.atr[i] || 1), e = er(c, i, L);
  return { dir: e >= o.trendMinER && net <= -o.trendMinATR ? -1 : e >= o.trendMinER && net >= o.trendMinATR ? 1 : 0, netATR: net, er: e };
}
const stopBuf = (m, o, i, price) => o.stop.mode === 'atr' ? o.stop.value * (m.atr[Math.min(i, m.atr.length - 1)] || 0) : o.stop.mode === 'pct' ? o.stop.value * Math.abs(price) : o.stop.value;

// ───────────────────────────── 2. Phase A: PS, SC, AR, ST ─────────────────────────────
/** Selling Climax: ở đáy thấp nhất gần đây, sau xu hướng giảm; KLGD đột biến + biên rộng, hoặc chuỗi nến KLGD lớn. */
export function isClimax(c, m, i, o = DEFAULTS) {
  if (i < Math.max(o.trendLookback, o.scLowLookback) || i < 3) return false;
  if (priorTrend(c, m, i, o).dir !== -1) return false;
  for (let j = i - o.scLowLookback; j < i; j++) if (c[j].low < c[i].low) return false;
  const chain = (m.volRel[i] + m.volRel[i - 1] + m.volRel[i - 2]) / 3 >= o.scChainVol;
  return (m.volRel[i] >= o.scVol && m.spreadRel[i] >= o.scSpread) || chain;
}

function findPS(c, m, iSC, o) {
  const out = [];
  for (let k = Math.max(2, iSC - o.psLookback); k < iSC - 2; k++)
    if (m.volRel[k] >= o.psVol && c[k].low <= Math.min(c[k - 1].low, c[k - 2].low, c[k + 1].low, c[k + 2].low)) out.push(k);
  return out.slice(-2);
}

function trendlineBreak(c, iSC, iAR, resPrice) {      // Phase A tiêu chuẩn: AR phá lên trendline giảm
  const sw = [];
  for (let k = Math.max(2, iSC - 40); k < iSC - 2; k++)
    if (c[k].high >= Math.max(c[k - 1].high, c[k - 2].high, c[k + 1].high, c[k + 2].high)) sw.push(k);
  if (sw.length < 2) return false;
  const a = sw[sw.length - 2], b = sw[sw.length - 1]; if (c[b].high >= c[a].high) return false;
  const slope = (c[b].high - c[a].high) / (b - a);
  return resPrice > c[b].high + slope * (iAR - b);
}

function buildPhaseA(c, m, iSC0, o, endI) {
  let iSC = iSC0, sup = c[iSC].low, j = iSC + 1, hi = -Infinity, iAR = -1, arEnd = iSC, broke = false;
  while (j <= endI && j <= iSC + o.arMaxBars) {
    if (c[j].low < sup) { iSC = j; sup = c[j].low; hi = -Infinity; iAR = -1; arEnd = j; j++; continue; }   // vẫn đang bán tháo → SC thật sự thấp hơn
    if (c[j].high > hi) { hi = c[j].high; iAR = j; }
    arEnd = j;
    if (j - iSC >= o.arMinBars && c[j].close < hi - o.arPullbackFrac * (hi - sup)) { broke = true; break; }
    j++;
  }
  if (iAR < 0) return { provisional: true, iSC, sup };
  const arProvisional = !broke && j > endI;
  const h = hi - sup;
  if (!arProvisional && h < o.arMinRiseATR * (m.atr[iSC] || 1)) return { demoted: arEnd };           // nhịp hồi quá nhỏ → không phải AR
  // [GQ] SC/AR chỉ được xác nhận khi nhịp hồi AR kết thúc (nến arEnd); trước đó là tạm thời.
  const st = { iSC, sup, iAR, res: hi, h, arEnd, arProvisional, ciA: arProvisional ? null : arEnd };
  if (arProvisional) return st;
  // Secondary Test
  let iST = -1, ciST = null, rallied = false;
  for (let k = arEnd + 1; k <= Math.min(endI, arEnd + o.stMaxBars); k++) {
    if (c[k].close > hi) { rallied = true; break; }                // bứt lên trước khi có ST
    if (c[k].low <= sup + o.stZoneFrac * h) {
      if (c[k].close < sup - o.stBreakFrac * h) {                  // đóng dưới SC → kiểm tra duy trì
        if (k + 1 > endI) break;
        if (c[k + 1].close < sup) return { demoted: k };           // thủng SC và tiếp tục giảm ⇒ SC cũ chỉ là PS
        continue;
      }
      iST = k; let q = k + 1;
      for (; q <= Math.min(endI, k + 3) && c[q].low <= sup + o.stZoneFrac * h; q++) if (c[q].low < c[iST].low) iST = q;
      // [GQ] đáy ST chỉ chốt khi cửa sổ tinh chỉnh (≤ 3 nến) KẾT THÚC: nến q rời vùng ST (biết khi q đóng cửa) hoặc hết 3 nến.
      // Dữ liệu dừng giữa cửa sổ -> ST còn tạm thời (ci = null) vì đáy còn có thể dời sang nến sau.
      ciST = q <= endI && q <= k + 3 ? q : q === k + 4 ? k + 3 : null;
      break;
    }
  }
  st.iST = iST; st.ciST = ciST; st.iStart = iST >= 0 ? iST : arEnd;
  // [GQ] Phase A HOÀN TẤT khi ST đã xác nhận, hoặc không có ST nhưng cửa sổ tìm ST đã hết / giá đã bứt lên trên AR.
  // Chưa hoàn tất -> chưa chạy Phase B (điểm bắt đầu B còn có thể dịch khi ST xuất hiện / được tinh chỉnh -> vẽ lại).
  st.aComplete = ciST != null || (iST < 0 && (rallied || arEnd + o.stMaxBars <= endI));
  return st;
}

// ───────────────────────────── 3. Phase B → E (bộ máy trạng thái, theo hướng tích lũy) ─────────────────────────────
function breachBelow(c, m, i0, sup, o, endI) {
  let n = 0, iLow = i0, low = Infinity, vsum = 0, last = i0 - 1;
  for (let j = i0; ; j++) {
    if (j > endI) return { complete: false, n, iLow, low, last, volMean: n ? vsum / n : 1 };
    if (j - i0 >= o.breachMaxBars) return { complete: true, recovered: false, n, iLow, low, last, at: j - 1, volMean: vsum / n };   // [GQ] at: nến xác nhận phá vỡ
    if (c[j].low < low) { low = c[j].low; iLow = j; }
    if (c[j].close < sup) { n++; last = j; vsum += m.volRel[j]; }
    else return { complete: true, recovered: true, n, iRec: j, iLow, low, last, volMean: n ? vsum / n : 1 };
  }
}
function breachAbove(c, i0, res, o, endI) {
  let n = 0, iHigh = i0, high = -Infinity;
  for (let j = i0; ; j++) {
    if (j > endI) return { complete: false, n, iHigh, high };
    if (c[j].high > high) { high = c[j].high; iHigh = j; }
    if (c[j].close > res) { n++; if (n > o.falseBreakBars) return { complete: true, returned: false, n, iHigh, high, at: j }; }
    else return { complete: true, returned: true, n, iRet: j, iHigh, high };
  }
}
/** Phân loại Spring theo tài liệu: #3 (KLGD thấp), #2 (KLGD trung bình), Shakeout (nhiều nến đóng dưới, KLGD lớn). */
export function classifySpring(ep, o = DEFAULTS) {
  if (ep.n >= 3 || ep.volMean >= o.highVol) return 'SHAKEOUT';
  if (ep.volMean < o.lowVol && ep.n <= 2) return 'SPRING_3';
  return 'SPRING_2';
}
export function supplyReading(v, o = DEFAULTS) {
  if (v < o.lowVol) return 'KLGD thấp: cung đã cạn, không còn cản trở nhịp tăng';
  if (v >= o.highVol) return 'KLGD lớn: cảnh báo nhịp giảm mới, cần thận trọng';
  return 'KLGD trung bình: có thể còn nhiều lần kiểm định cung nữa';
}

function runB2E(c, m, tr, o, endI) {
  const sup = tr.sup, res = tr.res, h = res - sup, zone = sup + o.testZoneFrac * h, mid = sup + 0.5 * h;
  const ev = [], poes = [];
  // [GQ] ci mặc định = i (sự kiện biết được ngay khi nến i đóng cửa); truyền x.ci khi chỉ biết được sau đó, null khi tạm thời.
  const add = (type, i, price, x = {}) => { const e = { type, i, ci: i, time: c[i].time, price, volRel: R(m.volRel[i]), spreadRel: R(m.spreadRel[i]), ...x }; ev.push(e); return e; };
  const buf = (i, p) => stopBuf(m, o, i, p);
  const poe = (n, i, entry, stop, note) => poes.push({ poe: n, i, time: c[i].time, entry, stop, sizePct: o.poeSizes[n - 1], note });
  const fin = (x) => ({ events: ev, poes, ...x });
  let i = tr.iStart + 1, phase = 'B', spring = null, springType = null, test = null, testRev = -1, springHigh = -Infinity;
  let sos = -1, sosWeak = false, status = 'active', endIndex = endI, noSpringPath = false;
  void mid;

  // ── B → C ──
  while (i <= endI) {
    const b = c[i];
    if (b.close < sup) {
      const ep = breachBelow(c, m, i, sup, o, endI);
      if (!ep.complete) { add('SPRING_PENDING', ep.iLow, ep.low, { ci: null, closesBelow: ep.n, note: 'đang dưới hỗ trợ, chưa rõ là Spring hay phá vỡ' }); phase = i - tr.iStart >= o.minBarsB ? 'C' : 'B'; i = endI + 1; break; }
      if (!ep.recovered) { add('BREAKDOWN', ep.iLow, ep.low, { ci: ep.at, closesBelow: ep.n, note: 'không quay lại TR → không phải Spring; cấu trúc tích lũy bị phá vỡ' }); return fin({ phase, status: 'broken-down', endIndex: ep.at }); }
      if (i - tr.iStart < o.minBarsB) { add('SOW_B', ep.iLow, ep.low, { ci: ep.iRec, closesBelow: ep.n, volMean: R(ep.volMean) }); i = ep.iRec + 1; continue; }
      spring = ep; break;
    }
    if (b.high > res) {
      const ep = breachAbove(c, i, res, o, endI);
      if (!ep.complete) { i = endI + 1; break; }
      if (ep.returned) { add('UTA', ep.iHigh, ep.high, { ci: ep.iRet, closesAbove: ep.n }); i = ep.iRet + 1; continue; }
      noSpringPath = true; sos = -2; break;                        // giữ được trên kháng cự, không qua Spring
    }
    if (i + 2 <= endI && b.close >= sup && b.low <= zone && b.low <= Math.min(c[i - 1].low, c[i - 2].low, c[i + 1].low, c[i + 2].low))
      add('ST', i, b.low, { ci: i + 2, inPhase: 'B', volVsSC: tr.scVol ? R(m.volRel[i] / tr.scVol) : null });   // [GQ] cần 2 nến sau để biết là đáy
    i++;
  }

  // ── C: Spring / Shakeout, Test, POE#1 ──
  let jStart = i;
  if (spring) {
    springType = classifySpring(spring, o); phase = 'C';
    add(springType, spring.iLow, spring.low, { ci: spring.iRec, closesBelow: spring.n, volMean: R(spring.volMean), supply: supplyReading(spring.volMean, o), recoveredAt: spring.iRec });
    const stopSpring = spring.low - buf(spring.iRec, spring.low);
    if (springType === 'SPRING_3' && spring.iRec === spring.last + 1) poe(1, spring.iRec, c[spring.iRec].close, stopSpring, 'POE#1: nến xác nhận đóng lại trong TR (Spring #3)');
    springHigh = c[spring.iRec].high; let cand = -1;
    const tEnd = Math.min(endI, spring.iRec + o.testMaxBars); let k = spring.iRec + 1;
    for (; k <= tEnd; k++) {
      const bk = c[k];
      if (bk.close < sup && bk.low < spring.low) { add('SPRING_FAIL', k, bk.low, { note: 'thủng đáy Spring → Spring thất bại (SOW)' }); return fin({ phase, status: 'failed', endIndex: k, spring, springType }); }
      if (bk.close > res) break;
      if (cand < 0) { springHigh = Math.max(springHigh, bk.high); if (springHigh >= sup + o.testRallyFrac * h && bk.low <= zone && bk.low >= spring.low) cand = k; }
      else {
        if (bk.low < c[cand].low && bk.low >= spring.low) cand = k;
        if (bk.close > c[cand].high) { test = cand; testRev = k; break; }
      }
    }
    if (test != null && test >= 0) {
      add('TEST', test, c[test].low, { ci: testRev, higherLow: c[test].low > spring.low, volVsSpring: R(m.volRel[test] / Math.max(1e-9, spring.volMean)), lowVolume: m.volRel[test] < 1 });
      if (springType !== 'SPRING_3') poe(1, testRev, c[testRev].close, stopSpring, `POE#1: đáy sau cao hơn xác nhận nhịp test (${springType === 'SHAKEOUT' ? 'Shakeout' : 'Spring #2'})`);
      jStart = testRev + 1;
    } else jStart = spring.iRec + 1;
    // [GQ] Spring thất bại cả SAU cửa sổ Test: đóng cửa dưới đáy Spring bất kỳ lúc nào trước SOS -> cấu trúc thất bại.
    for (let q = Math.max(k, spring.iRec + 1); q <= endI; q++) {
      if (c[q].close > res) break;
      if (c[q].close < spring.low) { add('SPRING_FAIL', q, c[q].low, { note: 'đóng cửa dưới đáy Spring → Spring thất bại' }); return fin({ phase, status: 'failed', endIndex: q, spring, springType }); }
    }
    // POE#2: breakout vượt đỉnh nhịp hồi sau Spring
    const lowRef = test != null && test >= 0 ? c[test].low : spring.low;
    for (let q = jStart; q <= endI; q++) if (c[q].close > springHigh) { poe(2, q, c[q].close, lowRef - buf(q, lowRef), 'POE#2: breakout vượt đỉnh nhịp hồi sau Spring'); break; }
  }

  // ── D: SOS ──
  const strong = j => c[j].close > res && m.spreadRel[j] >= o.sosSpread && m.volRel[j] >= o.sosVol;
  let sosCi = null;
  if (sos === -2) {
    for (let j = i; j <= endI; j++) if (c[j].close > res) {
      sos = j; sosWeak = !strong(j);
      let q = j;
      for (; q <= Math.min(endI, j + o.falseBreakBars) && c[q].close > res; q++) if (strong(q)) { sos = q; sosWeak = false; break; }
      // [GQ] SOS nhánh không-Spring còn có thể dời sang nến mạnh hơn trong falseBreakBars nến -> chỉ chốt khi tìm thấy nến mạnh
      // hoặc hết cửa sổ (hoặc giá rời vùng trên kháng cự); dữ liệu dừng giữa cửa sổ -> tạm thời.
      sosCi = !sosWeak ? sos : (q <= endI ? Math.min(q, j + o.falseBreakBars) : null);
      break;
    }
  }
  else if (spring || phase === 'B') { sos = -1; for (let j = jStart; j <= endI; j++) if (strong(j)) { sos = j; sosCi = j; break; } }
  let buaInfo = null, e5 = -1;
  if (sos >= 0) {
    add('SOS', sos, c[sos].close, { ci: sosCi, weak: sosWeak, noSpring: noSpringPath, holdUntil: sos + o.sosHold, note: 'vượt kháng cự, biên rộng, KLGD tăng' });
    phase = 'D';
    for (let k = sos + 1; k <= Math.min(endI, sos + o.sosHold); k++) if (c[k].close < sup + o.sosFailFrac * h) {
      add('SOS_FAIL', k, c[k].close, { note: 'SOS thất bại: quay sâu vào TR → Spring/SOS không thành (SOW), hướng tích lũy bị vô hiệu' });
      return fin({ phase, status: 'failed', endIndex: k, spring, springType, sos });
    }
    // LPS / BUA / E
    let iPeak = sos, peak = c[sos].high;
    for (let k = sos + 1; k <= endI; k++) {
      // [GQ] sau SOS mà ĐÓNG CỬA sâu vào TR (dưới giữa TR, cùng ngưỡng sosFailFrac của SOS_FAIL) -> cấu trúc thất bại
      // (bản gốc chỉ xét sosHold nến sau SOS, sau đó giữ Phase D vô thời hạn kể cả khi giá đã quay về đáy TR).
      if (c[k].close < sup + o.sosFailFrac * h) {
        add('STRUCTURE_FAIL', k, c[k].close, { note: 'đóng cửa sâu vào TR (dưới giữa TR) sau SOS → phá vỡ thất bại, cấu trúc tích lũy bị vô hiệu' });
        return fin({ phase, status: 'failed', endIndex: k, spring, springType, sos });
      }
      if (c[k].close > peak) {
        if (k - iPeak >= 2) {
          const w = buaStats(c, m, iPeak + 1, k - 1, peak, res, o);
          buaInfo = { ...w, i0: iPeak + 1, i1: k - 1 };
          add('BUA', w.iLow, w.low, { ci: k, buaType: w.type, bars: w.n, high: peak, volMean: R(w.volMean), expectedDuration: w.duration, rangeATR: R(w.rangeATR) });
          const refLow = test != null && test >= 0 ? c[test].low : spring ? spring.low : sup;
          if (w.low > refLow && m.volRel[w.iLow] < 1 && (peak - w.low) <= o.lpsMaxRetraceFrac * (peak - sup)) add('LPS', w.iLow, w.low, { ci: k, note: 'đáy sau cao hơn, KLGD thấp' });
          add('E_BREAKOUT', k, c[k].close, { note: 'phá khỏi BUA → xu hướng tăng được xác nhận (Phase E)' });
          poe(3, k, c[k].close, w.low - buf(k, w.low), 'POE#3: breakout khỏi BUA; dời toàn bộ SL lên đáy BUA');
          e5 = k; phase = 'E'; break;
        }
        peak = c[k].high; iPeak = k;
      } else if (c[k].high > peak) { peak = c[k].high; iPeak = k; }
    }
    if (e5 < 0 && endI - iPeak >= 1) {
      const w = buaStats(c, m, iPeak + 1, endI, peak, res, o); buaInfo = { ...w, i0: iPeak + 1, i1: endI, forming: true };
      add('BUA_FORMING', w.iLow, w.low, { ci: null, buaType: w.type, bars: w.n, high: peak, volMean: R(w.volMean), expectedDuration: w.duration, note: 'BUA đang hình thành; POE#3 khi giá phá lên khỏi đỉnh BUA' });
    }
  }
  const out = { phase, status: e5 >= 0 ? 'completed' : status, endIndex: e5 >= 0 ? e5 : endI, spring, springType, test, sos: sos >= 0 ? sos : null, bua: buaInfo, e5, noSpringPath };
  ev.sort((a, b) => a.i - b.i);
  return fin(out);
}

function buaStats(c, m, i0, i1, peak, res, o) {
  let lo = Infinity, iLow = i0, vs = 0;
  for (let k = i0; k <= i1; k++) { if (c[k].low < lo) { lo = c[k].low; iLow = k; } vs += m.volRel[k]; }
  const n = i1 - i0 + 1, atr = m.atr[i1] || 1, volMean = vs / n, range = peak - lo;
  const type = lo < res ? 'deep-into-TR' : (n >= o.buaMinBars && range <= o.buaMaxRangeATR * atr ? 'mini-TR' : 'shallow-pullback');
  return { n, low: lo, iLow, volMean, type, rangeATR: range / atr, duration: volMean < 1 ? 'ngắn (KLGD thấp)' : volMean >= o.highVol ? 'dài (KLGD lớn)' : 'trung bình' };
}

// ───────────────────────────── 4. Biến thể mô hình (sơ đồ trong tài liệu) ─────────────────────────────
export function classifyVariant(c, m, tr, run, o) {
  const h = tr.res - tr.sup, a = tr.iStart, b = run.spring ? run.spring.iLow : run.sos != null ? run.sos : c.length - 1;
  if (run.spring) return { variant: 'conventional', note: 'Có Spring/Shakeout (mô hình tiêu chuẩn)' };
  const sowCount = run.events.filter(e => e.type === 'SOW_B').length;
  if (sowCount >= 2) return { variant: 'continuous-weakness', note: 'Nhiều SOW liên tiếp, hỗ trợ bị đẩy thấp dần' };
  if (b - a < 9) return { variant: 'unspecified', note: 'Phase B quá ngắn để phân loại' };
  const third = Math.floor((b - a) / 3), lowOf = (x, y) => Math.min(...c.slice(x, y + 1).map(z => z.low));
  const l1 = lowOf(a, a + third), l3 = lowOf(b - third, b), rise = (l3 - l1) / h;
  if (rise >= 0.35) return { variant: 'extra-strength', note: 'Đáy nâng cao mạnh, không cần Spring' };
  if (rise >= 0.15) return { variant: 'absorption-at-higher-level', note: 'Hấp thụ cung ở vùng giá cao hơn, không có SOW/Spring' };
  return { variant: 'unspecified', note: '' };
}

// ───────────────────────────── 5. Quét cấu trúc: tích lũy / phân phối / tái tích lũy / tái phân phối ─────────────────────────────
function scanSC(c, m, o, endI) {
  const out = []; let i = Math.max(o.trendLookback, o.scLowLookback);
  while (i <= endI) {
    if (!isClimax(c, m, i, o)) { i++; continue; }
    const st = buildPhaseA(c, m, i, o, endI);
    if (st.demoted) { i = st.demoted + 1; continue; }
    if (st.provisional) { out.push({ st, run: { events: [], poes: [], phase: 'A', status: 'active', endIndex: endI }, provisional: true }); break; }
    if (st.arProvisional || !st.aComplete) { out.push({ st, run: { events: [], poes: [], phase: 'A', status: 'active', endIndex: endI } }); break; }   // [GQ] Phase A chưa hoàn tất
    st.scVol = m.volRel[st.iSC];
    const run = runB2E(c, m, st, o, endI);
    out.push({ st, run });
    if (run.status === 'active') break;
    i = run.endIndex + 1;
  }
  return out;
}

const DIST_NAMES = { PS: 'PSY', SC: 'BC', AR: 'AR', ST: 'ST', UTA: 'SOW_B', SOW_B: 'UT', SPRING_3: 'UT_3', SPRING_2: 'UT_2', SHAKEOUT: 'UTAD',
  SPRING_PENDING: 'UT_PENDING', SPRING_FAIL: 'UT_FAIL', BREAKDOWN: 'BREAKOUT_UP', TEST: 'TEST', SOS: 'SOW', SOS_FAIL: 'SOW_FAIL', LPS: 'LPSY',
  BUA: 'BUA', BUA_FORMING: 'BUA_FORMING', E_BREAKOUT: 'E_BREAKDOWN', STRUCTURE_FAIL: 'STRUCTURE_FAIL' };

function assemble(kind, long, c, m, o, st, run, extra = {}) {
  const sgn = long ? 1 : -1, name = t => (long ? t : DIST_NAMES[t] || t);
  const A = [];
  if (st.iSC != null && !extra.generic) {
    // [GQ] PS cần 2 nến sau để là đáy cục bộ; SC/AR chỉ chốt khi AR kết thúc (ciA); ST Phase A chốt ở ciST.
    findPS(c, m, st.iSC, o).forEach(k => A.push({ type: 'PS', i: k, ci: st.ciST ?? null, price: c[k].low, volRel: R(m.volRel[k]) }));
    // [GQ] SC/AR còn có thể bị hạ cấp (SC thủng tiếp -> chỉ là PS) cho tới khi có ST -> chỉ xác nhận khi Phase A hoàn tất (ST).
    A.push({ type: 'SC', i: st.iSC, ci: st.ciST ?? null, price: st.sup, volRel: R(m.volRel[st.iSC]), spreadRel: R(m.spreadRel[st.iSC]) });
    if (st.iAR != null) A.push({ type: 'AR', i: st.iAR, ci: st.ciST ?? null, price: st.res, provisional: !!st.arProvisional });
    if (st.iST >= 0) A.push({ type: 'ST', i: st.iST, ci: st.ciST, price: c[st.iST].low, volRel: R(m.volRel[st.iST]), volVsSC: R(m.volRel[st.iST] / (m.volRel[st.iSC] || 1)), lowerVolume: m.volRel[st.iST] < m.volRel[st.iSC] * o.stVolRatio, inPhase: 'A' });
  }
  // [GQ] ghi chú của sự kiện phân phối (ảnh gương) dùng đúng từ ngữ chiều giảm.
  const mirrorNote = n => (long || !n ? n : n
    .replace(/tích lũy/g, 'phân phối').replace(/Spring/g, 'Upthrust').replace(/SOS/g, 'SOW').replace(/hỗ trợ/g, 'kháng cự')
    .replace(/dưới/g, '§TREN§').replace(/trên/g, 'dưới').replace(/§TREN§/g, 'trên').replace(/đáy/g, 'đỉnh').replace(/tăng/g, 'giảm'));
  const events = [...A, ...run.events].sort((a, b) => a.i - b.i).map(e => ({ ...e, time: c[e.i].time, type: name(e.type), price: sgn * e.price, ...(e.note ? { note: mirrorNote(e.note) } : {}) }));
  const poes = run.poes.map(p => ({ ...p, side: long ? 'long' : 'short', entry: sgn * p.entry, stop: sgn * p.stop,
    note: long ? p.note : p.note.replace('đáy sau cao hơn', 'đỉnh sau thấp hơn').replace('Spring', 'Upthrust') }));
  const support = long ? st.sup : -st.res, resistance = long ? st.res : -st.sup;
  const vr = classifyVariant(c, m, st, run, o);
  const checklist = !extra.generic && st.iSC != null ? {
    climaxVolumeSpike: m.volRel[st.iSC] >= o.scVol,
    secondaryTestLowerVolume: st.iST >= 0 ? m.volRel[st.iST] < m.volRel[st.iSC] * o.stVolRatio : null,
    phaseATrendlineBreak: st.iAR != null ? trendlineBreak(c, st.iSC, st.iAR, st.res) : null,
    springLowVolume: run.spring ? run.spring.volMean < o.lowVol : null,
    sosWithVolume: run.sos != null ? m.volRel[run.sos] >= o.sosVol : null,
    shortTermReversalWarning: null,
  } : null;
  const done = checklist ? Object.values(checklist).filter(v => v === true).length : 0, avail = checklist ? Object.values(checklist).filter(v => v !== null).length : 0;
  const phaseName = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' }[run.phase] || run.phase;
  return { key: `${st.iSC ?? st.iStart}|${long ? 'L' : 'S'}`, kind, direction: long ? 'long' : 'short', support, resistance, height: resistance - support,
    startI: st.iSC ?? st.iStart, endI: run.endIndex, phase: phaseName, status: run.status, variant: vr.variant, variantNote: vr.note,
    events, poes, checklist, checklistScore: avail ? done / avail : null, bua: run.bua, spring: run.spring ? { type: name(run.springType), low: sgn * (long ? run.spring.low : run.spring.low) } : null, ...extra };
}

/** Vùng đi ngang tổng quát (tái tích lũy / tái phân phối; không cần SC/BC): thử cả 2 hướng, chọn hướng có nhiều bằng chứng hơn. */
function scanRanges(c, m, mc, mm, o, endI, claimed) {
  const out = []; let a = o.trendLookback;
  const W = o.rangeMinBars;
  while (a + W - 1 <= endI) {
    const b = a + W - 1;
    if (claimed(a, b)) { a += 5; continue; }
    let hi = -Infinity, lo = Infinity; for (let k = a; k <= b; k++) { hi = Math.max(hi, c[k].high); lo = Math.min(lo, c[k].low); }
    if (er(c, b, W - 1) > o.rangeER || (hi - lo) > o.rangeMaxATR * (m.atr[b] || 1)) { a++; continue; }
    const pt = priorTrend(c, m, a, o);
    if (pt.dir === 0) { a++; continue; }       // TR luôn nối tiếp một xu hướng (tài liệu): không có xu hướng trước đó thì bỏ qua
    const tr = { sup: lo, res: hi, iStart: b, iSC: null };
    const runL = runB2E(c, m, tr, o, endI);
    const runS = runB2E(mc, mm, { sup: -hi, res: -lo, iStart: b }, o, endI);
    const score = r => r.events.reduce((s, e) => s + ({ SPRING_3: 3, SPRING_2: 3, SHAKEOUT: 3, TEST: 2, SOS: 3, LPS: 1, BUA: 1, E_BREAKOUT: 3 }[e.type] || 0), 0);
    const sL = score(runL), sS = score(runS);
    const long = sL >= sS, run = long ? runL : runS, best = Math.max(sL, sS);
    if (best >= 5 || run.status === 'active') {
      const kind = best < 5 ? 'range-undetermined' : long ? (pt.dir > 0 ? 're-accumulation' : 'accumulation') : (pt.dir < 0 ? 're-distribution' : 'distribution');
      const st = long ? tr : { sup: -hi, res: -lo, iStart: b };
      const s = assemble(kind, long, long ? c : mc, long ? m : mm, o, st, run, { generic: true, priorTrend: pt.dir, evidence: { long: sL, short: sS } });
      s.support = lo; s.resistance = hi; s.height = hi - lo; s.startI = a;
      if (!long) s.events.forEach(e => { e.time = c[e.i].time; });
      out.push(s);
    }
    a = Math.max(run.endIndex + 1, b + 1);
    if (run.status === 'active') break;
  }
  return out;
}

// ───────────────────────────── [GQ] Hết hiệu lực (stale) ─────────────────────────────
/**
 * Cấu trúc "active" hết hiệu lực khi:
 *   (a) không có sự kiện XÁC NHẬN mới trong max(staleMinBars, staleFactor × độ dài cấu trúc tính tới sự kiện cuối) nến, hoặc
 *   (b) giá đóng cửa hiện tại cách biên TR > awayHeights × độ rộng TR (đã rời vùng mà máy trạng thái không ghi nhận).
 * Độ dài tính bằng SỐ NẾN của chính khung đang phân tích -> tự thích ứng D/W/M/intraday (không dùng một ngưỡng phiên chung).
 */
export function freshness(s, c, o = DEFAULTS) {
  const endI = c.length - 1;
  const confirmed = s.events.filter(e => e.ci != null && e.ci <= endI);
  const lastCi = confirmed.length ? Math.max(...confirmed.map(e => e.ci)) : s.startI;
  const span = Math.max(1, lastCi - s.startI);
  const limit = Math.max(o.staleMinBars, Math.round(o.staleFactor * span));
  const since = endI - lastCi;
  const close = c[endI].close, h = Math.max(1e-9, s.resistance - s.support);
  const away = close > s.resistance + o.awayHeights * h ? 'above' : close < s.support - o.awayHeights * h ? 'below' : null;
  const reasons = [];
  if (since > limit) reasons.push(`${since} nến không có sự kiện xác nhận mới (ngưỡng ${limit} = độ dài cấu trúc)`);
  if (away && !['D', 'E'].includes(s.phase)) reasons.push(`giá đã rời ${away === 'above' ? 'lên trên' : 'xuống dưới'} TR quá 1 lần độ rộng TR`);
  return { lastConfirmedIndex: lastCi, barsSinceLastEvent: since, limit, away, stale: reasons.length > 0, reasons };
}

// ───────────────────────────── 6. Phân tích tổng hợp ─────────────────────────────
export function analyzeWyckoff(candles, userOpts = {}) {
  const o = merge(DEFAULTS, userOpts), n = candles.length;
  if (!hasVolume(candles) && !o.allowNoVolume) return { error: 'Thiếu trường volume: Wyckoff dựa trên khối lượng. Đặt allowNoVolume:true để chạy với khối lượng trung tính (độ tin cậy thấp).' };
  const c = candles.map(x => ({ ...x, volume: Number.isFinite(x.volume) ? x.volume : 1 })), endI = n - 1;
  if (n < o.trendLookback + 20) return { error: 'Không đủ dữ liệu', structures: [] };
  const m = barMetrics(c, o), mc = mirrorCandles(c), mm = barMetrics(mc, o);
  const structures = [];
  scanSC(c, m, o, endI).forEach(({ st, run }) => structures.push(assemble('accumulation', true, c, m, o, st, run)));
  scanSC(mc, mm, o, endI).forEach(({ st, run }) => {
    const s = assemble('distribution', false, mc, mm, o, st, run); s.events.forEach(e => { e.time = c[e.i].time; }); structures.push(s);
  });
  const claimed = (a, b) => structures.some(s => s.startI <= b && s.endI >= a);
  scanRanges(c, m, mc, mm, o, endI, claimed).forEach(s => structures.push(s));
  structures.sort((a, b) => a.startI - b.startI);
  // [GQ] gắn độ mới; cấu trúc active nhưng hết hiệu lực -> status 'stale'.
  structures.forEach(s => { s.freshness = freshness(s, c, o); if (s.status === 'active' && s.freshness.stale) s.status = 'stale'; });
  const rank = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  // [GQ] cấu trúc hiện tại = cấu trúc active MỚI NHẤT (theo sự kiện xác nhận cuối), hoà thì pha xa hơn.
  const active = structures.filter(s => s.status === 'active').sort((x, y) => y.freshness.lastConfirmedIndex - x.freshness.lastConfirmedIndex || (rank[y.phase] || 0) - (rank[x.phase] || 0));
  const current = active[0] || null;
  const signals = structures.flatMap(s => s.poes.map(p => ({ ...p, structure: s.key, kind: s.kind }))).sort((a, b) => a.i - b.i);
  const alerts = [];
  structures.forEach(s => s.events.forEach(e => { if (['SOS_FAIL', 'SOW_FAIL', 'UT_FAIL', 'SPRING_FAIL', 'BREAKDOWN', 'BREAKOUT_UP', 'STRUCTURE_FAIL'].includes(e.type)) alerts.push({ i: e.i, time: e.time, type: e.type, structure: s.key, note: e.note }); }));
  return { options: o, metrics: m, structures, active, current, signals, alerts,
    plan: current ? planForPhase(current.phase, current.direction) : null };
}

// ───────────────────────────── 7. Kế hoạch giao dịch theo phase & khung thời gian (tài liệu) ─────────────────────────────
export function planForPhase(phase, direction = 'long') {
  const L = direction === 'long';
  const P = {
    A: { action: 'Đứng ngoài', detail: 'Wyckoffian không giao dịch ở Phase A (chờ ST xác nhận biên TR).' },
    B: { action: L ? 'Mua kênh dưới, bán kênh trên' : 'Bán kênh trên, mua kênh dưới', detail: 'Nhiều false break hai phía (UTA/SOW trong B). Rủi ro cao; mục tiêu chính là quan sát cạn cung/cầu.' },
    C: { action: L ? 'Mua bình quân xuống' : 'Bán bình quân lên', detail: L ? 'Spring/Shakeout rồi Test. POE#1 sau khi test thành công (50% vị thế chuẩn).' : 'Upthrust/UTAD rồi Test. Tìm điểm bán sau xác nhận.' },
    D: { action: L ? 'Mua bình quân lên' : 'Bán bình quân xuống', detail: L ? 'POE#2 (breakout, 30%), LPS, POE#3 (breakout khỏi BUA, 20%); dời SL lên đáy BUA.' : 'LPSY là điểm vào bán tốt; chỉ bán thêm nếu các vị thế đầu đã có lãi.' },
    E: { action: L ? 'Đi theo xu hướng tăng' : 'Đi theo xu hướng giảm', detail: 'Theo dõi hành vi khối lượng (volumeBehavior): tăng sốc = cảnh báo đảo chiều ngắn hạn; tăng rồi giảm = nhịp sắp kết thúc.' },
  };
  return { phase, direction, ...(P[phase] || { action: 'Chưa xác định', detail: '' }) };
}
export function timeframeAdvice(tf) {
  const t = String(tf).toUpperCase();
  if (['M', '1M', 'MN', 'W', '1W'].includes(t)) return { role: 'dài hạn', tradeable: true, note: 'TR/Phase trên Monthly–Weekly thể hiện xu hướng dài hạn.' };
  if (['D', '1D', 'H4', '4H'].includes(t)) return { role: 'trung hạn', tradeable: true, note: 'TR/Phase trên Daily–H4 thể hiện xu hướng trung hạn.' };
  return { role: 'khung nhỏ', tradeable: false, note: 'Không thể hiện xu hướng: tránh giao dịch; chỉ dùng TR khung nhỏ để tinh chỉnh POE, và chỉ khi đã xác định đúng sự kiện ở khung lớn.' };
}

// ───────────────────────────── 8. Hành vi khối lượng & 3 quy luật ─────────────────────────────
/** Mục (d) của tài liệu: ổn định / tăng sốc (đảo chiều ngắn hạn) / tăng rồi giảm (nhịp tăng sắp kết thúc). */
export function volumeBehavior(m, i0, i1, { shockK = 3 } = {}) {
  const v = m.volRel.slice(i0, i1 + 1); if (v.length < 5) return { label: 'unknown' };
  const mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  const mx = Math.max(...v), sm = sma(v, 3).map(x => (isNaN(x) ? 0 : x)), pk = sm.indexOf(Math.max(...sm));
  if (mx >= shockK && mx / Math.max(1e-9, [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]) >= shockK)
    return { label: 'shock', warning: 'KLGD tăng sốc: cảnh báo đảo chiều ngắn hạn', max: R(mx), mean: R(mean) };
  const start = sm.slice(0, 3).reduce((a, b) => a + b, 0) / 3 || 1, end = sm.slice(-3).reduce((a, b) => a + b, 0) / 3;
  if (pk > v.length * 0.2 && pk < v.length * 0.85 && sm[pk] / start >= 1.5 && end / sm[pk] <= 0.6)
    return { label: 'rise-then-fall', warning: 'KLGD tăng rồi giảm dần: nhịp tăng sắp kết thúc', mean: R(mean) };
  if (mean <= 1.2 && sd / mean <= 0.5) return { label: 'stable', note: 'KLGD thấp, đều: nhịp tăng ổn định', mean: R(mean) };
  return { label: 'mixed', mean: R(mean) };
}

/** Quy luật 3 – Nỗ lực/Kết quả: KLGD (nỗ lực) so với biến động giá (kết quả). */
export function effortResult(c, m, i, L = 3) {
  const a = Math.max(0, i - L + 1), effort = m.volRel.slice(a, i + 1).reduce((x, y) => x + y, 0) / (i - a + 1);
  const result = Math.abs(c[i].close - c[a].open) / (m.atr[i] || 1);
  let label = 'harmony', note = 'Khối lượng và hành động giá tương xứng';
  if (effort >= 1.5 && result < 0.6) { label = 'effort-without-result'; note = 'Nỗ lực lớn nhưng kết quả nhỏ: có sự hấp thụ/kháng cự – cần xem lại nhận định'; }
  else if (effort <= 0.8 && result >= 1.5) { label = 'result-without-effort'; note = 'Giá đi xa với KLGD thấp: thiếu xác nhận, cần xem lại nhận định'; }
  return { effort: R(effort), result: R(result), label, note };
}

/** Quy luật 1 – Cung/Cầu: áp lực ròng = Σ(vị trí đóng cửa × KLGD tương đối), chuẩn hoá về [−1, 1]. */
export function supplyDemandBalance(c, m, i0, i1) {
  let num = 0, den = 0; for (let k = i0; k <= i1; k++) { num += m.clv[k] * m.volRel[k]; den += m.volRel[k]; }
  const s = den ? num / den : 0;
  return { score: R(s), label: s > 0.15 ? 'cầu chiếm ưu thế' : s < -0.15 ? 'cung chiếm ưu thế' : 'cân bằng' };
}

/** "KLGD lớn phải đi kèm kết quả lớn": breakout KLGD lớn nên có gap, đi xa, retrace ngắn; KLGD nhỏ gắn với Upthrust/Spring. */
export function breakoutQuality(c, m, i, long = true, o = DEFAULTS, look = 5) {
  const s = long ? 1 : -1, atr = m.atr[i] || 1, end = Math.min(c.length - 1, i + look);
  const gap = i > 0 && (long ? c[i].low > c[i - 1].high : c[i].high < c[i - 1].low);
  const fut = c.slice(i + 1, end + 1);
  const best = fut.length ? Math.max(0, ...fut.map(x => s * (x.close - c[i].close))) : 0;
  const worstPx = fut.length ? (long ? Math.min(...fut.map(x => x.low)) : Math.max(...fut.map(x => x.high))) : c[i].close;
  const retrace = best > 0 ? Math.max(0, s * (c[i].close - worstPx)) / best : 0;
  const bigVol = m.volRel[i] >= o.highVol;
  const checks = { gap, followThrough: end > i && best >= 2 * atr, shortRetrace: end > i && retrace <= 0.5 };
  return { bigVolume: bigVol, checks, note: bigVol ? 'KLGD lớn: kỳ vọng gap, đi xa, retrace ngắn' : 'KLGD nhỏ: dễ là Upthrust/Spring (false break)',
    consistent: bigVol ? Object.values(checks).filter(Boolean).length >= 2 : null };
}

/**
 * Quy luật 2 – Nguyên nhân/Kết quả. Tài liệu chỉ nêu định tính (và nhắc biểu đồ điểm-và-hình mà không nêu cách đếm),
 * nên đây là ƯỚC LƯỢNG: nguyên nhân = độ rộng + thời gian TR; mục tiêu = k × độ rộng TR tính từ biên (k là giả định).
 */
export function causeEffect(s, ks = [1, 1.5, 2]) {
  const bars = s.endI - s.startI + 1, long = s.direction === 'long';
  return { cause: { bars, height: s.height }, targets: ks.map(k => ({ k, price: long ? s.resistance + k * s.height : s.support - k * s.height })),
    note: 'Ước lượng theo độ rộng TR (giả định k). Chưa cài đếm điểm-và-hình vì tài liệu không nêu phương pháp.' };
}

// ───────────────────────────── 9. Backtest các điểm vào POE (walk-forward, có đối chứng ngẫu nhiên) ─────────────────────────────
export function seededRng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function tradeOutcome(c, t, long, entry, stop, R_, horizon) {
  const risk = Math.abs(entry - stop), tgt = long ? entry + R_ * risk : entry - R_ * risk, end = Math.min(c.length - 1, t + horizon);
  for (let j = t + 1; j <= end; j++) {
    if (long ? c[j].low <= stop : c[j].high >= stop) return { hit: false, r: -1 };
    if (long ? c[j].high >= tgt : c[j].low <= tgt) return { hit: true, r: R_ };
  }
  return { hit: false, r: 0, open: true };
}

/**
 * Chạy lại phân tích tại từng t chỉ với dữ liệu ≤ t. [GQ] Khoá loại trùng theo chỉ số TUYỆT ĐỐI của tín hiệu; vào lệnh
 * ở giá MỞ CỬA nến t+1 (tín hiệu chỉ biết khi nến t đóng cửa). Đây là thước đo nhanh về tín hiệu, KHÔNG có phí/thuế/T+2,5 —
 * backtest thực thi theo luật VN nằm ở bộ benchmark.
 */
export function backtestPOE(candles, userOpts = {}, bt = {}) {
  const { step = 2, warmup = 150, window = 400, horizon = 60, targetR = 2, nullPerTrade = 10, seed = 1 } = bt;
  const n = candles.length, rng = seededRng(seed), seen = new Set(), trades = [];
  for (let t = warmup; t < n - horizon - 1; t += step) {
    const lo = Math.max(0, t - window + 1), res = analyzeWyckoff(candles.slice(lo, t + 1), userOpts);
    if (res.error) return { error: res.error };
    for (const sg of res.signals) {
      const key = `${sg.poe}|${sg.side}|${sg.i + lo}`; if (seen.has(key)) continue; seen.add(key);
      const long = sg.side === 'long', entry = candles[t + 1].open, stop = sg.stop;
      if (long ? stop >= entry : stop <= entry) continue;
      const o = tradeOutcome(candles, t + 1, long, entry, stop, targetR, horizon);
      let bh = 0, bn = 0;
      for (let k = 0; k < nullPerTrade; k++) {
        const b = warmup + Math.floor(rng() * (n - horizon - warmup - 1)), risk = Math.abs(entry - stop) / entry * candles[b + 1].open;
        const ob = tradeOutcome(candles, b + 1, long, candles[b + 1].open, long ? candles[b + 1].open - risk : candles[b + 1].open + risk, targetR, horizon);
        if (!ob.open) { bn++; bh += ob.hit ? 1 : 0; }
      }
      trades.push({ t, signalIndex: sg.i + lo, poe: sg.poe, side: sg.side, kind: sg.kind, hit: o.hit, r: o.r, open: !!o.open, baseHitRate: bn ? bh / bn : null });
    }
  }
  const closed = trades.filter(x => !x.open), N = closed.length;
  const hit = N ? closed.filter(x => x.hit).length / N : null, base = N ? closed.reduce((a, x) => a + (x.baseHitRate ?? 0), 0) / N : null;
  return { trades, summary: { n: N, hitRate: hit, avgR: N ? closed.reduce((a, x) => a + x.r, 0) / N : null, baseHitRate: base, lift: base ? hit / base : null,
    z: N && base > 0 && base < 1 ? (hit - base) / Math.sqrt(base * (1 - base) / N) : null },
    caveat: 'Mẫu chồng lấn theo thời gian nên z-score bị phóng đại. Cần gộp nhiều mã/giai đoạn và kiểm tra out-of-sample trước khi tin dùng.' };
}

// ───────────────────────────── 10. Adapter hiển thị (Lightweight Charts v4) ─────────────────────────────
export function toChartOverlays(res, candles) {
  const markers = [], boxes = [], priceLines = [];
  for (const s of res.structures || []) {
    boxes.push({ from: candles[s.startI].time, to: candles[Math.min(s.endI, candles.length - 1)].time, top: s.resistance, bottom: s.support, label: `${s.kind} · Phase ${s.phase}${s.variant ? ' · ' + s.variant : ''}`, status: s.status });
    const lowTypes = new Set(['PS', 'SC', 'ST', 'SPRING_3', 'SPRING_2', 'SHAKEOUT', 'TEST', 'LPS', 'BUA', 'SOW_B']);
    const highTypes = new Set(['PSY', 'BC', 'ST', 'UT_3', 'UT_2', 'UTAD', 'UT', 'TEST', 'LPSY', 'BUA']);
    s.events.forEach(e => markers.push({ time: e.time, position: (s.direction === 'long' ? lowTypes.has(e.type) : !highTypes.has(e.type)) ? 'belowBar' : 'aboveBar',
      shape: ['SOS', 'SOW', 'E_BREAKOUT', 'E_BREAKDOWN'].includes(e.type) ? (s.direction === 'long' ? 'arrowUp' : 'arrowDown') : 'circle',
      color: s.direction === 'long' ? '#26a69a' : '#ef5350', text: e.type }));
    s.poes.forEach(p => priceLines.push({ price: p.stop, title: `SL POE#${p.poe}`, color: '#ef5350' }));
  }
  return { markers, boxes, priceLines };
}
