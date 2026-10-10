// Lọc ngành (L5) — DÒNG TIỀN & TRẠNG THÁI NGÀNH, point-in-time tại phiên cuối (mọi số chỉ dùng dữ liệu ≤ t):
//   1. Dịch chuyển dòng tiền: thị phần GTGD của ngành trong toàn universe (TB 20 phiên), so với 60 phiên và z-score so với lịch
//      sử 250 phiên; ma trận chuyển dịch 4 tuần (ước lượng: phần thị phần mất của ngành giảm được phân bổ cho ngành tăng theo tỷ lệ).
//   2. Tích lũy / phân phối âm thầm: CMF-20 theo GTGD (vị trí đóng cửa trong biên độ × GTGD), tỷ lệ GTGD phiên tăng / phiên giảm,
//      biến động co lại (độ lệch chuẩn lợi suất 20 / 60 phiên) trong khi giá chỉ số ngành đi ngang và thị phần tăng.
//   3. Giai đoạn ngành 1–4 (Weinstein/Minervini — DÙNG LẠI classifyStage của SEPA) trên chỉ số ngành (khối lượng = GTGD ngành).
//   4. Độ rộng: % mã trên MA50 / MA200, % mã cách đỉnh 52 tuần ≤ 10%, khối ngoại ròng 20 phiên.
//   5. Trạng thái tổng hợp (luật minh bạch): Tăng trưởng / Tích lũy tích cực / Tích lũy đáy / Phân phối / Suy thoái / Trung tính.
//   6. Cổ phiếu dẫn dắt: RS kiểu IBD (40% 3 tháng + 20% mỗi quý trước) xếp phân vị toàn universe, trên MA50 & MA200, cách đỉnh 52 tuần
//      ≤ 15%, mạnh hơn chính ngành của nó 3 tháng, GTGD tăng > giảm; gắn nhãn các bộ lọc Gateway đang chứa mã.
// Chưa kiểm định ngoài mẫu — EXPERIMENTAL (mô tả trạng thái, không phải tín hiệu mua).

import { prepareSepa } from "../strategies/sepa/indicators.js";
import { classifyStage } from "../strategies/sepa/trend.js";

export const FLOW_PARAMS = Object.freeze({ share: 20, shareBase: 60, shareHist: 250, cmf: 20, rotationWeeks: 4, flatRet: 0.04, volContraction: 0.9 });
const round = (x, nd = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : null);
const valOf = (b) => (Number(b.value) > 0 ? Number(b.value) : b.close * (b.volume ?? 0));

/** Tổng GTGD universe theo ngày. */
export function totalValueByDate(seriesOf) {
  const m = new Map();
  for (const bars of seriesOf.values()) for (const b of bars) m.set(b.date, (m.get(b.date) ?? 0) + valOf(b));
  return m;
}

/** RS kiểu IBD tại phiên cuối cho mỗi mã có ≥ 253 phiên -> phân vị 0–99. */
export function rsPercentiles(seriesOf) {
  const raw = [];
  for (const [t, bars] of seriesOf) {
    const n = bars.length; if (n < 253) continue;
    const c = (k) => bars[n - 1 - k].close;
    const r = (a, b) => c(a) / c(b) - 1;
    raw.push([t, 0.4 * r(0, 63) + 0.2 * r(63, 126) + 0.2 * r(126, 189) + 0.2 * r(189, 252)]);
  }
  raw.sort((a, b) => a[1] - b[1]);
  return new Map(raw.map(([t], i) => [t, Math.round((i / Math.max(1, raw.length - 1)) * 99)]));
}

const sma = (xs, n, end) => { if (end + 1 < n) return NaN; let s = 0; for (let i = end - n + 1; i <= end; i++) s += xs[i]; return s / n; };
function sd(xs) { if (xs.length < 2) return NaN; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); }

/**
 * @param members  [{ ticker, bars }]
 * @param index    [{ date, close, n }] chỉ số ngành (buildSectorIndex)
 * @param dates    lịch phiên (VN-Index)
 * @param totals   Map(date -> tổng GTGD universe)
 */
export function sectorFlow({ members, index, dates, totals, rs, tagsOf = () => [], p = FLOW_PARAMS }) {
  const t = dates.length - 1, last = dates[t];
  const byDate = members.map((m) => new Map(m.bars.map((b, i) => [b.date, i])));
  // phiên của mã tại ngày đánh giá: đúng ngày, hoặc phiên gần nhất ≤ ngày đó trong 7 ngày (mã tạm dừng / lệch nguồn 1 phiên)
  const lastIdx = members.map((m, k) => { const i = byDate[k].get(last); if (i != null) return i; const b = m.bars.at(-1); return b && b.date <= last && Date.parse(last) - Date.parse(b.date) <= 7 * 86_400_000 ? m.bars.length - 1 : null; });
  const valueAt = (d) => { let s = 0; members.forEach((m, k) => { const i = byDate[k].get(d); if (i != null) s += valOf(m.bars[i]); }); return s; };
  // thị phần GTGD theo ngày (cả lịch sử, chỉ quá khứ)
  const shareDaily = dates.map((d) => { const tot = totals.get(d) ?? 0; return tot > 0 ? valueAt(d) / tot : NaN; });
  const avgShare = (end, n) => { const xs = shareDaily.slice(Math.max(0, end - n + 1), end + 1).filter(Number.isFinite); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; };
  const share20 = avgShare(t, p.share), share60 = avgShare(t, p.shareBase);
  const hist = []; for (let e = Math.max(p.share, t - p.shareHist); e <= t; e += 5) hist.push(avgShare(e, p.share));
  const hs = hist.filter(Number.isFinite), hsd = sd(hs), hm = hs.reduce((a, b) => a + b, 0) / (hs.length || 1);
  const shareZ = hsd > 0 ? (share20 - hm) / hsd : 0;
  const shareHistory = []; for (let w = 25; w >= 0; w--) { const e = t - w * 5; if (e >= p.share) shareHistory.push({ date: dates[e], share: round(avgShare(e, p.share) * 100, 3) }); }
  // dòng tiền thông minh: CMF-20 theo GTGD, tỷ lệ GTGD tăng/giảm, khối ngoại ròng 20 phiên
  let mfv = 0, vsum = 0, upV = 0, dnV = 0, foreign = 0, foreignN = 0;
  const above50 = [], above200 = [], nearHigh = [];
  for (const [k, m] of members.entries()) {
    const i = lastIdx[k]; if (i == null || i < 1) continue;
    for (let j = Math.max(1, i - p.cmf + 1); j <= i; j++) {
      const b = m.bars[j], rng = b.high - b.low, v = valOf(b);
      const clv = rng > 0 ? ((b.close - b.low) - (b.high - b.close)) / rng : 0;
      mfv += clv * v; vsum += v;
      if (b.close > m.bars[j - 1].close) upV += v; else if (b.close < m.bars[j - 1].close) dnV += v;
      if (Number.isFinite(b.foreignNet)) { foreign += b.foreignNet; foreignN++; }
    }
    const closes = m.bars.slice(0, i + 1).map((b) => b.close);
    const m50 = sma(closes, 50, i), m200 = sma(closes, 200, i);
    if (Number.isFinite(m50)) above50.push(closes[i] > m50);
    if (Number.isFinite(m200)) above200.push(closes[i] > m200);
    if (i >= 250) { let hi = 0; for (let j = i - 251; j <= i; j++) hi = Math.max(hi, m.bars[j].high); nearHigh.push(closes[i] >= hi * 0.9); }
  }
  const pct = (a) => (a.length ? round((a.filter(Boolean).length / a.length) * 100, 1) : null);
  const cmf = vsum > 0 ? mfv / vsum : 0, udr = dnV > 0 ? upV / dnV : upV > 0 ? 3 : 1;
  // chỉ số ngành: lợi suất 20 phiên, co biến động
  const ic = index.map((x) => x.close), it = ic.length - 1;
  const ret = (n) => (it - n >= 0 ? ic[it] / ic[it - n] - 1 : NaN);
  const rets = (n) => { const out = []; for (let i = Math.max(1, it - n + 1); i <= it; i++) out.push(ic[i] / ic[i - 1] - 1); return out; };
  const volRatio = sd(rets(20)) / sd(rets(60));
  const ret20 = ret(20), ret63 = ret(63);
  const shareUp = share20 > share60;
  const stealthAcc = cmf > 0.05 && udr > 1.1 && Math.abs(ret20) < p.flatRet && volRatio < p.volContraction && shareUp;
  const stealthDist = cmf < -0.05 && udr < 0.9 && Math.abs(ret20) < p.flatRet && !shareUp;
  const accScore = Math.round(Math.max(0, Math.min(100, 50 + 250 * cmf + 15 * Math.log2(udr) + (shareUp ? 8 : -8) + (volRatio < 1 ? 7 : -7))));
  // giai đoạn ngành: classifyStage của SEPA trên chỉ số ngành (OHLC = đóng cửa, KL = GTGD ngành)
  let stage = null;
  if (index.length >= 230) {
    const bars = index.map((x, i) => { const v = valueAt(x.date); return { date: x.date, open: i ? index[i - 1].close : x.close, high: Math.max(x.close, i ? index[i - 1].close : x.close), low: Math.min(x.close, i ? index[i - 1].close : x.close), close: x.close, volume: v }; });
    const S = prepareSepa(bars), st = classifyStage(S, S.n - 1);
    stage = { stage: st.stage, label: st.label, confidence: st.confidence, stage2Start: st.stage2Start, baseCount: st.baseCount };
  }
  // cổ phiếu dẫn dắt của ngành
  const leaders = [];
  for (const [k, m] of members.entries()) {
    const i = lastIdx[k]; if (i == null || i < 252) continue;
    const c = m.bars.map((b) => b.close), r63 = c[i] / c[i - 63] - 1;
    const m50 = sma(c, 50, i), m200 = sma(c, 200, i);
    let hi = 0; for (let j = i - 251; j <= i; j++) hi = Math.max(hi, m.bars[j].high);
    let u = 0, d = 0; for (let j = i - 19; j <= i; j++) { const v = valOf(m.bars[j]); if (c[j] > c[j - 1]) u += v; else if (c[j] < c[j - 1]) d += v; }
    const checks = { aboveMa50: c[i] > m50, aboveMa200: c[i] > m200, nearHigh: c[i] >= hi * 0.85, beatsSector: Number.isFinite(ret63) ? r63 > ret63 : null, rsStrong: (rs.get(m.ticker) ?? 0) >= 70, volumeUp: u > d };
    const passed = Object.values(checks).filter((x) => x === true).length;
    leaders.push({ ticker: m.ticker, rs: rs.get(m.ticker) ?? null, ret63: round(r63 * 100, 1), fromHigh: round((c[i] / hi - 1) * 100, 1), passed, checks, tags: tagsOf(m.ticker), leader: passed >= 5 && checks.rsStrong && checks.aboveMa200 });
  }
  leaders.sort((a, b) => Number(b.leader) - Number(a.leader) || b.passed - a.passed || (b.rs ?? 0) - (a.rs ?? 0));
  return {
    share: { share20: round(share20 * 100, 3), share60: round(share60 * 100, 3), changePct: round((share20 / share60 - 1) * 100, 1), z: round(shareZ, 2),
      state: shareZ >= 1 && share20 > share60 * 1.1 ? "INFLOW" : shareZ <= -1 && share20 < share60 * 0.9 ? "OUTFLOW" : share20 > share60 ? "RISING" : "FALLING", history: shareHistory },
    money: { cmf20: round(cmf, 3), upDownValue: round(udr, 2), foreignNet20: foreignN ? Math.round(foreign) : null, foreignCoverage: foreignN, accumulationScore: accScore, stealthAccumulation: stealthAcc, stealthDistribution: stealthDist, volContraction: round(volRatio, 2) },
    price: { ret20: round(ret20 * 100, 2), ret63: round(ret63 * 100, 2) },
    breadth: { aboveMa50: pct(above50), aboveMa200: pct(above200), nearHigh52: pct(nearHigh), members: above50.length },
    stage,
    leaders: leaders.slice(0, 6),
  };
}

/** Trạng thái tổng hợp (luật minh bạch) từ giai đoạn + góc RRG + dòng tiền + độ rộng. */
export function sectorState(f, quadrant) {
  const why = [], st = f.stage?.stage ?? 0, b50 = f.breadth.aboveMa50 ?? 50, b200 = f.breadth.aboveMa200 ?? 50;
  if (st === 2 && (quadrant === "LEADING" || quadrant === "IMPROVING") && b50 >= 55) {
    why.push(`Giai đoạn 2 (tăng trưởng)`, `RRG ${quadrant === "LEADING" ? "Dẫn dắt" : "Cải thiện"}`, `${b50}% mã trên MA50`);
    return { key: "GROWTH", label: "Tăng trưởng", why };
  }
  // tích lũy ở đáy: giá còn yếu (GĐ4 / Tụt hậu) nhưng dòng tiền vào mạnh và có hệ thống -> tách khỏi "Suy thoái"
  const inflow = f.share.state === "INFLOW" || f.share.state === "RISING";
  if ((st === 4 || st === 1 || quadrant === "LAGGING") && f.money.accumulationScore >= 75 && f.money.cmf20 > 0.1 && inflow) {
    why.push(`Dòng tiền vào khi giá còn yếu (giai đoạn ${st || "?"})`, `CMF-20 ${f.money.cmf20}`, `điểm tích lũy ${f.money.accumulationScore}`, `thị phần GTGD +${f.share.changePct}%`, "tích lũy sớm — chưa xác nhận xu hướng, rủi ro cao");
    return { key: "BOTTOMING", label: "Tích lũy đáy", why };
  }
  if (st === 4 || (quadrant === "LAGGING" && b200 < 35)) {
    if (st === 4) why.push("Giai đoạn 4 (suy thoái)"); if (quadrant === "LAGGING") why.push("RRG Tụt hậu"); why.push(`${b200}% mã trên MA200`);
    return { key: "DECLINE", label: "Suy thoái", why };
  }
  if (st === 3 || f.money.stealthDistribution || ((quadrant === "LEADING" || quadrant === "WEAKENING") && f.money.cmf20 < -0.05 && f.share.state !== "INFLOW" && f.share.state !== "RISING")) {
    if (st === 3) why.push("Giai đoạn 3 (phân phối)"); if (f.money.stealthDistribution) why.push("Phân phối âm thầm"); why.push(`CMF-20 ${f.money.cmf20}`, `thị phần GTGD ${f.share.changePct}% so 60 phiên`);
    return { key: "DISTRIBUTION", label: "Phân phối", why };
  }
  if (f.money.stealthAccumulation || ((st === 1 || st === 2) && f.money.accumulationScore >= 60)) {
    if (f.money.stealthAccumulation) why.push("Tích lũy âm thầm (giá đi ngang, biến động co, dòng tiền vào)");
    why.push(`Điểm tích lũy ${f.money.accumulationScore}`, `Giai đoạn ${st || "?"}`, `thị phần GTGD ${f.share.changePct >= 0 ? "+" : ""}${f.share.changePct}%`);
    return { key: "ACCUMULATION", label: "Tích lũy tích cực", why };
  }
  why.push(`Giai đoạn ${st || "?"}`, `RRG ${quadrant}`, `điểm tích lũy ${f.money.accumulationScore}`);
  return { key: "NEUTRAL", label: "Trung tính", why };
}

/** Ma trận dịch chuyển dòng tiền giữa các ngành (cùng cấp) trong `weeks` tuần: thay đổi thị phần GTGD TB20, phân bổ tỷ lệ. */
export function rotationMatrix(rows, weeks = FLOW_PARAMS.rotationWeeks) {
  const ch = rows.map((r) => { const h = r.flow.share.history; const now = h.at(-1)?.share, then = h.at(-1 - weeks)?.share; return { code: r.code, name: r.name, delta: now != null && then != null ? now - then : 0 }; });
  const gainers = ch.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta), losers = ch.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta);
  const G = gainers.reduce((a, b) => a + b.delta, 0), transfers = [];
  for (const l of losers) for (const g of gainers) transfers.push({ from: l.code, fromName: l.name, to: g.code, toName: g.name, pp: round((-l.delta * g.delta) / (G || 1), 3) });
  transfers.sort((a, b) => b.pp - a.pp);
  return { weeks, gainers: gainers.map((x) => ({ ...x, delta: round(x.delta, 3) })), losers: losers.map((x) => ({ ...x, delta: round(x.delta, 3) })), transfers: transfers.slice(0, 10),
    note: "Ước lượng: thị phần GTGD (TB 20 phiên) mà các ngành giảm mất được phân bổ cho các ngành tăng theo tỷ lệ — đơn vị điểm % thị phần, không phải dòng tiền thực khớp lệnh." };
}
