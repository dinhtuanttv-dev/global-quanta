// Kiểm chứng trạng thái ý đồ IFE trên TOÀN universe (dữ liệu ngày SSI), hàm thuần.
//
// - Mỗi ngày: BVC ngày (buy% = Φ(r/σ20)), nỗ lực = delta/ADV20, kết quả = lợi suất; z-score
//   TRƯỢT 60 ngày; trạng thái = HMM lọc tiến với nguyên mẫu CỐ ĐỊNH (không khớp tham số)
//   -> mọi trạng thái là ngoài mẫu, không nhìn tương lai.
// - Nhãn: ba rào chắn trong `horizon` phiên tới, rào ±k·ATR14 (chạm trên trước = +1, dưới = −1).
// - So tỷ lệ chạm rào của từng trạng thái với phần còn lại (kiểm định hai tỷ lệ), kiểm soát
//   nhiều phép thử bằng Benjamini–Hochberg (q = 0,10), và yêu cầu CÙNG CHIỀU ở hai nửa thời gian.

import { normCdf, trailingZ, forwardFilter, INTENT_STATES } from "./ife.js";

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function dailyFeatures(rows) {
  const ret = rows.map((r, i) => (i && rows[i - 1].closeAdj ? r.closeAdj / rows[i - 1].closeAdj - 1 : 0));
  const delta = rows.map((r, i) => {
    if (i < 21) return 0;
    const w = ret.slice(i - 20, i);
    const m = mean(w);
    const sd = Math.sqrt(mean(w.map((v) => (v - m) ** 2))) || 1e-4;
    return (r.volume || 0) * (2 * normCdf(ret[i] / sd) - 1);
  });
  const effort = rows.map((r, i) => {
    const adv = mean(rows.slice(Math.max(0, i - 20), i).map((x) => x.volume || 0));
    return adv ? delta[i] / adv : 0;
  });
  const atrPct = rows.map((r, i) => {
    if (i < 15) return null;
    const trs = [];
    for (let k = i - 14; k < i; k++) {
      const prevClose = rows[k - 1].close;
      trs.push(Math.max(rows[k].high - rows[k].low, Math.abs(rows[k].high - prevClose), Math.abs(rows[k].low - prevClose)) / rows[k].close);
    }
    return mean(trs);
  });
  return { ret, effort, atrPct };
}

/** Ba rào chắn trên giá ĐIỀU CHỈNH (đổi high/low theo hệ số closeAdj/close). */
export function tripleBarrier(rows, i, horizon, k, atrPct) {
  if (i + horizon >= rows.length || !atrPct) return null;
  const base = rows[i].closeAdj;
  const up = base * (1 + k * atrPct), dn = base * (1 - k * atrPct);
  for (let j = i + 1; j <= i + horizon; j++) {
    const f = rows[j].close ? rows[j].closeAdj / rows[j].close : 1;
    const hi = rows[j].high * f, lo = rows[j].low * f;
    if (hi >= up && lo <= dn) return 0; // chạm cả hai trong cùng phiên: không xác định
    if (hi >= up) return 1;
    if (lo <= dn) return -1;
  }
  return 0;
}

function twoPropP(k1, n1, k2, n2) {
  if (!n1 || !n2) return 1;
  const p1 = k1 / n1, p2 = k2 / n2, p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return 1;
  const z = (p1 - p2) / se;
  return 2 * (1 - normCdf(Math.abs(z)));
}

export function benjaminiHochberg(pvalues, q = 0.1) {
  const idx = pvalues.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const m = pvalues.length;
  let cutoff = -1;
  idx.forEach(([p], rank) => { if (p <= ((rank + 1) / m) * q) cutoff = rank; });
  const sig = new Array(m).fill(false);
  for (let r = 0; r <= cutoff; r++) sig[idx[r][1]] = true;
  return sig;
}

/**
 * @param {Map<string, any[]>} rowsBySymbol  dữ liệu ngày (cũ -> mới) có closeAdj/close/high/low/volume
 */
export function validateIntentStates(rowsBySymbol, { horizon = 5, barrierAtr = 1.5, minProb = 0.5 } = {}) {
  const samples = [];
  for (const [symbol, rows] of rowsBySymbol) {
    if (rows.length < 90) continue;
    const { ret, effort, atrPct } = dailyFeatures(rows);
    const zE = trailingZ(effort), zR = trailingZ(ret);
    const path = forwardFilter(rows.map((_, i) => (zE[i] === null ? null : [zE[i], zR[i]])), { stay: 0.8, dims: 2 });
    for (let i = 60; i < rows.length; i++) {
      const label = tripleBarrier(rows, i, horizon, barrierAtr, atrPct[i]);
      if (label === null) continue;
      const p = path[i];
      const top = p.indexOf(Math.max(...p));
      samples.push({ symbol, date: rows[i].date, state: p[top] >= minProb ? top : -1, label });
    }
  }
  if (!samples.length) return { samples: 0, states: [] };
  const dates = samples.map((s) => s.date).sort();
  const mid = dates[Math.floor(dates.length / 2)];
  const rate = (arr, v) => (arr.length ? arr.filter((s) => s.label === v).length / arr.length : 0);
  const base = { up: rate(samples, 1), down: rate(samples, -1) };

  const rowsOut = INTENT_STATES.map((st, i) => {
    const inS = samples.filter((s) => s.state === i), outS = samples.filter((s) => s.state !== i);
    const k = (arr, v) => arr.filter((s) => s.label === v).length;
    const lift = (arr, rest, v) => rate(arr, v) - rate(rest, v);
    const halves = (v) => [samples.filter((s) => s.date < mid), samples.filter((s) => s.date >= mid)].map((h) => {
      const a = h.filter((s) => s.state === i), r = h.filter((s) => s.state !== i);
      return a.length >= 30 ? Math.sign(lift(a, r, v)) : 0;
    });
    const [hu1, hu2] = halves(1), [hd1, hd2] = halves(-1);
    return {
      id: st.id, label: st.label, n: inS.length,
      upRate: rate(inS, 1), downRate: rate(inS, -1),
      liftUp: lift(inS, outS, 1), liftDown: lift(inS, outS, -1),
      pUp: twoPropP(k(inS, 1), inS.length, k(outS, 1), outS.length),
      pDown: twoPropP(k(inS, -1), inS.length, k(outS, -1), outS.length),
      stableUp: hu1 !== 0 && hu1 === hu2, stableDown: hd1 !== 0 && hd1 === hd2,
    };
  });
  const sig = benjaminiHochberg(rowsOut.flatMap((r) => [r.pUp, r.pDown]));
  rowsOut.forEach((r, i) => {
    r.significantUp = sig[2 * i] && r.n >= 100;
    r.significantDown = sig[2 * i + 1] && r.n >= 100;
    const upOk = r.significantUp && r.stableUp && r.liftUp > 0;
    const downOk = r.significantDown && r.stableDown && r.liftDown > 0;
    r.verdict = upOk && !downOk ? "Có bằng chứng: tăng xác suất chạm rào TRÊN"
      : downOk && !upOk ? "Có bằng chứng: tăng xác suất chạm rào DƯỚI"
      : upOk && downOk ? "Có bằng chứng: biến động mạnh hai chiều"
      : "Chưa đủ bằng chứng";
    r.validated = upOk || downOk;
  });
  return {
    samples: samples.length, symbols: rowsBySymbol.size, from: dates[0], to: dates.at(-1),
    horizonDays: horizon, barrierAtr, base, states: rowsOut,
    method: "HMM lọc tiến (nguyên mẫu cố định) trên BVC ngày; ba rào chắn; kiểm định hai tỷ lệ + Benjamini–Hochberg q=0,10; ổn định hai nửa thời gian.",
  };
}
