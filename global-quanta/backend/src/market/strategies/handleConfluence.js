// Hợp lưu tay cầm (Screener Engine v2 / S4) — Elliott + Fibonacci tính từ ĐÁY CỐC BÊN PHẢI.
//
// Cạnh phải của cốc (đáy cốc → miệng phải) được coi là một sóng đẩy; tay cầm là sóng ĐIỀU CHỈNH của nó.
//   1. Hồi quy Fibonacci của cạnh phải: 23,6% / 38,2% / 50% (O'Neil: tay cầm ở nửa trên cốc, thường hồi ≤ 1/3–1/2).
//   2. Đếm sóng bên trong cạnh phải (zigzag): nếu thấy 0-1-2-3, tay cầm ≈ sóng 4 -> vùng 0,24 / 0,38 của sóng 3 (GET T-34).
//   3. Bên trong tay cầm: A-B-C -> mục tiêu C = 1,0 × A (zig-zag GET T-27).
//   4. AVWAP neo từ đáy cốc, POC Volume Profile của cốc.
// Các mức nằm trong 1,5% được gom thành CỤM có trọng số; cụm mạnh nhất trong vùng tay cầm hợp lệ = vùng đỡ hợp lưu.
// Tất cả chỉ dùng nến ≤ t−1 (không nhìn trước). Kết quả là DIỄN GIẢI (INFERRED), chưa qua kiểm định.

import { dailyVolumeProfile } from "./baseBreakoutV2.js";

const CLUSTER_TOL = 0.015;
const WEIGHT = { fib382: 1, fib236: 0.8, fib50: 0.8, wave4: 0.9, cEqualsA: 0.9, avwap: 1, poc: 0.8 };

/** ZigZag theo % trên mảng H/L trong [from, to] — pivot kèm ci (nến xác nhận). */
export function zigzagRange(H, L, from, to, pct) {
  const out = [];
  let dir = 0, hi = from, lo = from, ext = from;
  for (let i = from + 1; i <= to; i++) {
    if (dir === 0) {
      if (H[i] > H[hi]) hi = i;
      if (L[i] < L[lo]) lo = i;
      if (H[hi] - L[lo] >= pct * L[lo]) {
        if (lo < hi) { out.push({ i: lo, type: "L", price: L[lo], ci: i }); dir = 1; ext = hi; }
        else { out.push({ i: hi, type: "H", price: H[hi], ci: i }); dir = -1; ext = lo; }
      }
    } else if (dir === 1) {
      if (H[i] >= H[ext]) ext = i;
      else if (H[ext] - L[i] >= pct * H[ext]) { out.push({ i: ext, type: "H", price: H[ext], ci: i }); dir = -1; ext = i; }
    } else {
      if (L[i] <= L[ext]) ext = i;
      else if (H[i] - L[ext] >= pct * L[ext]) { out.push({ i: ext, type: "L", price: L[ext], ci: i }); dir = 1; ext = i; }
    }
  }
  if (dir !== 0) out.push({ i: ext, type: dir === 1 ? "H" : "L", price: dir === 1 ? H[ext] : L[ext], ci: null });
  return out;
}

function anchoredVwap(S, from, to) {
  let pv = 0, v = 0;
  for (let i = from; i <= to; i++) { const tp = (S.H[i] + S.L[i] + S.C[i]) / 3; pv += tp * S.V[i]; v += S.V[i]; }
  return v > 0 ? pv / v : null;
}

/** Gom các mức giá trong `tol` thành cụm (trung bình theo trọng số), mạnh nhất trước. */
export function clusterLevels(levels, tol = CLUSTER_TOL) {
  const sorted = levels.filter((x) => Number.isFinite(x.price)).sort((a, b) => a.price - b.price);
  const out = [];
  for (const x of sorted) {
    const cl = out[out.length - 1];
    if (cl && Math.abs(x.price - cl.price) <= tol * x.price) {
      cl.price = (cl.price * cl.weight + x.price * x.weight) / (cl.weight + x.weight);
      cl.weight += x.weight; cl.low = Math.min(cl.low, x.price); cl.high = Math.max(cl.high, x.price); cl.sources.push(x.label);
    } else out.push({ price: x.price, weight: x.weight, low: x.price, high: x.price, sources: [x.label] });
  }
  return out.map((c) => ({ ...c, weight: Math.round(c.weight * 100) / 100 })).sort((a, b) => b.weight - a.weight);
}

/**
 * @param S  chuỗi đã chuẩn bị (prepareCs): H, L, C, V, date
 * @param p  mẫu hình từ detectCupHandle (leftLipIdx, cupLowIdx, rightLipIdx, cupLow, rightLip, handleLow, …)
 * @param t  phiên đánh giá (dùng nến ≤ t−1 cho tay cầm)
 */
export function handleConfluence(S, p, t) {
  const len = p.rightLip - p.cupLow;
  if (!(len > 0)) return null;
  const levels = [];
  const add = (key, label, price) => levels.push({ key, label, price, weight: WEIGHT[key] });
  const fib = [0.236, 0.382, 0.5].map((r) => ({ ratio: r, price: p.rightLip - r * len }));
  add("fib236", "Fib 23,6% cạnh phải", fib[0].price);
  add("fib382", "Fib 38,2% cạnh phải", fib[1].price);
  add("fib50", "Fib 50% cạnh phải", fib[2].price);

  // Đếm sóng bên trong cạnh phải: đáy cốc = 0, cần ≥ 0-1-2-3 (L-H-L-H) với 3 = miệng phải.
  const pct = Math.max(0.03, Math.min(0.08, (len / p.cupLow) / 5));
  const pv = zigzagRange(S.H, S.L, p.cupLowIdx, p.rightLipIdx, pct).filter((x) => x.i > p.cupLowIdx);
  let wave = null;
  const highs = pv.filter((x) => x.type === "H"), lows = pv.filter((x) => x.type === "L");
  if (highs.length >= 2 && lows.length >= 1) {
    const w3top = { i: p.rightLipIdx, price: p.rightLip };
    const w2 = [...lows].reverse().find((x) => x.i < w3top.i && x.price > p.cupLow);
    const w1 = w2 && [...highs].reverse().find((x) => x.i < w2.i);
    if (w1 && w2 && w2.price > p.cupLow && w3top.price > w1.price) {
      const w3len = w3top.price - w2.price;
      wave = {
        count: "0-1-2-3 (tay cầm ≈ sóng 4)",
        points: [{ i: p.cupLowIdx, price: p.cupLow }, { i: w1.i, price: w1.price }, { i: w2.i, price: w2.price }, w3top].map((x) => ({ date: S.date[x.i], price: x.price })),
        wave4Zone: [0.24, 0.38].map((r) => ({ ratio: r, price: w3top.price - r * w3len })),
        overlapLimit: w1.price, // sóng 4 không được chồng lấn đỉnh sóng 1
      };
      add("wave4", "Sóng 4: 0,24 × sóng 3", wave.wave4Zone[0].price);
      add("wave4", "Sóng 4: 0,38 × sóng 3", wave.wave4Zone[1].price);
    }
  }

  // A-B-C trong tay cầm (zigzag mịn), mục tiêu C = 1,0 × A.
  let abc = null;
  if (t - 1 - p.rightLipIdx >= 3) {
    // Ngưỡng theo độ sâu TAY CẦM (1/3), không theo cốc — tay cầm chỉ sâu vài %.
    const hPct = Math.max(0.012, Math.min(0.04, (p.rightLip - p.handleLow) / p.rightLip / 3));
    const hp = zigzagRange(S.H, S.L, p.rightLipIdx, t - 1, hPct).filter((x) => x.i > p.rightLipIdx);
    const A = hp.find((x) => x.type === "L" && x.ci != null);
    const B = A && hp.find((x) => x.type === "H" && x.i > A.i && x.ci != null);
    if (A && B) {
      const lenA = p.rightLip - A.price;
      const target = B.price - lenA;
      abc = { A: { date: S.date[A.i], price: A.price }, B: { date: S.date[B.i], price: B.price }, bRatio: (B.price - A.price) / lenA, cTarget: target };
      add("cEqualsA", "Sóng C = 1,0 × A", target);
    }
  }

  const avwap = anchoredVwap(S, p.cupLowIdx, t - 1);
  if (avwap) add("avwap", "AVWAP từ đáy cốc", avwap);
  const vp = dailyVolumeProfile(S.H, S.L, S.V, p.leftLipIdx, p.rightLipIdx);
  if (vp) add("poc", "POC của cốc", vp.poc);

  // Chỉ xét cụm trong vùng tay cầm hợp lệ: nửa trên cốc, dưới miệng phải.
  const floor = p.cupLow + 0.5 * (p.leftLip - p.cupLow);
  const clusters = clusterLevels(levels).filter((c) => c.high <= p.rightLip && c.low >= floor);
  const best = clusters.find((c) => c.sources.length >= 2) ?? null;
  const touch = best ? p.handleLow <= best.high * 1.01 && p.handleLow >= best.low * 0.985 : false;
  return {
    rightLeg: { from: { date: S.date[p.cupLowIdx], price: p.cupLow }, to: { date: S.date[p.rightLipIdx], price: p.rightLip } },
    retracePct: ((p.rightLip - p.handleLow) / len) * 100,
    fib, wave, abc, avwap, poc: vp?.poc ?? null,
    clusters: clusters.slice(0, 3),
    best,
    handleAtConfluence: touch,
    // Mua sớm trong tay cầm tại cụm hợp lưu, cắt lỗ ngay dưới cụm (chặt hơn 8% của O'Neil).
    earlyEntry: best ? { price: best.high, stop: best.low * 0.985, riskPct: ((best.high - best.low * 0.985) / best.high) * 100 } : null,
  };
}
