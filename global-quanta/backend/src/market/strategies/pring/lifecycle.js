// Vòng đời một mô hình tại phiên t (Pring ch6, ch17): ĐANG HÌNH THÀNH -> PHÁ VỠ dứt khoát (đóng cửa vượt đường ≥ max(1%,
// 0,5×ATR)) -> XÁC NHẬN khi giữ ≥ 2 thanh -> PULLBACK (quay về kiểm tra điểm phá vỡ) -> ĐẠT MỤC TIÊU 1×/2×/3× (thang log) /
// THẤT BẠI (quay lại ≥ 50% thân mô hình hoặc vượt mức vô hiệu) / HẾT HẠN. Chỉ dùng dữ liệu ≤ t.

import { PRING } from "./config.js";
import { atrOf, logTarget, majorTrend, rsiOf, touchTol, volAvgBefore, volumeSlope } from "./core.js";
import { breakoutBarContext } from "./bars.js";

export const STATE_VI = Object.freeze({
  FORMING: "Đang hình thành", BREAKOUT: "Vừa phá vỡ (chờ giữ 2 thanh)", CONFIRMED: "Phá vỡ đã xác nhận", PULLBACK: "Pullback về điểm phá vỡ",
  TARGET1: "Đạt mục tiêu 1×", TARGET2: "Đạt mục tiêu 2×", TARGET3: "Đạt mục tiêu 3×", FAILED: "Thất bại", EXPIRED: "Hết hạn",
});

const pen = (S, i, v) => Math.max(PRING.penMinPct * v, PRING.penAtr * (atrOf(S)[i] || 0.02 * v));

/**
 * @param g hình học từ detector: { dir: +1 lên / −1 xuống, endIdx (điểm cuối mô hình), startIdx, level(i) (đường phá vỡ),
 *          opposite(i) (biên đối diện), height (log), invalidation (giá vô hiệu nếu đi ngược trước/sau phá vỡ), needsBreakout }
 */
export function lifecycle(S, t, g) {
  const dir = g.dir, C = S.C, H = S.H, L = S.L;
  const out = { state: "FORMING", breakoutIdx: null, confirmIdx: null, pullbackIdx: null, failIdx: null, failReason: null, targetsHit: [], events: [] };
  // tìm phá vỡ dứt khoát đầu tiên sau điểm cuối mô hình
  const lastSearch = Math.min(t, g.endIdx + PRING.breakoutSearchBars);
  for (let i = g.endIdx + 1; i <= lastSearch; i++) {
    const v = g.level(i);
    // vô hiệu trước khi phá vỡ: đi ngược qua mức vô hiệu (ví dụ vượt đầu của vai-đầu-vai đỉnh)
    if (g.invalidation != null && (dir > 0 ? L[i] < g.invalidation : H[i] > g.invalidation)) { out.state = "FAILED"; out.failIdx = i; out.failReason = "Đi ngược qua mức vô hiệu trước khi phá vỡ"; return out; }
    if (dir > 0 ? C[i] >= v + pen(S, i, v) : C[i] <= v - pen(S, i, v)) { out.breakoutIdx = i; break; }
  }
  if (out.breakoutIdx == null) {
    if (t > g.endIdx + PRING.breakoutSearchBars) out.state = "EXPIRED";
    return out;
  }
  const bo = out.breakoutIdx, lvl = g.level(bo), opp = g.opposite(bo);
  out.events.push({ kind: "BREAKOUT", i: bo, date: S.date[bo], price: C[bo] });
  // giữ ≥ holdBars thanh đóng cửa ngoài đường (kể cả thanh phá vỡ)
  let held = 0;
  for (let i = bo; i <= t && held < PRING.holdBars; i++) { if (dir > 0 ? C[i] > g.level(i) : C[i] < g.level(i)) held++; else break; }
  if (held < PRING.holdBars) {
    if (t >= bo + PRING.holdBars - 1) { out.state = "FAILED"; out.failIdx = bo + held; out.failReason = "Không giữ được ngoài mô hình 2 thanh (ch17)"; }
    else out.state = "BREAKOUT";
    return out;
  }
  out.confirmIdx = bo + PRING.holdBars - 1;
  out.state = "CONFIRMED";
  // thất bại: quay lại ≥ 50% thân mô hình (giữa đường phá vỡ và biên đối diện, tính tại thanh phá vỡ) hoặc qua mức vô hiệu
  const failLevel = lvl + (opp - lvl) * PRING.failRetrace;
  const targets = [1, 2, 3].map((k) => logTarget(lvl, g.height, k, dir));
  for (let i = bo + 1; i <= t; i++) {
    if (dir > 0 ? C[i] < failLevel : C[i] > failLevel) { out.state = "FAILED"; out.failIdx = i; out.failReason = "Quay lại ≥ 50% thân mô hình (ch6)"; break; }
    if (g.invalidation != null && (dir > 0 ? C[i] < g.invalidation : C[i] > g.invalidation)) { out.state = "FAILED"; out.failIdx = i; out.failReason = "Vượt mức vô hiệu của mô hình"; break; }
    for (let k = out.targetsHit.length; k < 3; k++) {
      if (dir > 0 ? H[i] >= targets[k] : L[i] <= targets[k]) { out.targetsHit.push({ k: k + 1, i, date: S.date[i] }); out.events.push({ kind: `TARGET${k + 1}`, i, date: S.date[i], price: targets[k] }); }
      else break;
    }
    if (out.pullbackIdx == null && !out.targetsHit.length && i > out.confirmIdx) {
      const near = PRING.pullbackAtr * (atrOf(S)[i] || 0.02 * lvl);
      if (dir > 0 ? L[i] <= g.level(i) + near : H[i] >= g.level(i) - near) { out.pullbackIdx = i; out.events.push({ kind: "PULLBACK", i, date: S.date[i], price: dir > 0 ? L[i] : H[i] }); }
    }
  }
  if (out.state !== "FAILED") {
    if (out.targetsHit.length) out.state = `TARGET${out.targetsHit.length}`;
    else if (out.pullbackIdx != null) out.state = "PULLBACK";
    if (t - bo > PRING.maxAgeAfterBreakout && out.state !== "TARGET3") out.state = out.targetsHit.length ? out.state : "EXPIRED";
  }
  out.failLevel = failLevel;
  out.targets = targets;
  return out;
}

/**
 * Bằng chứng Pring cho một mô hình (ch5–ch7, ch9, ch17) — để hiển thị + điểm minh bạch (CHƯA kiểm định, xem P3).
 */
export function evidence(S, t, g, lc) {
  const dir = g.dir, bo = lc.breakoutIdx;
  const width = g.endIdx - g.startIdx;
  const volSlope = volumeSlope(S, g.startIdx, g.endIdx);
  const boVol = bo != null ? S.V[bo] / (volAvgBefore(S, bo) || 1) : null;
  const trend = majorTrend(S, bo ?? t);
  const rsi = rsiOf(S);
  // phân kỳ: giá phá vỡ vượt cực trị cùng phía của mô hình nhưng RSI thấp hơn (lên) / cao hơn (xuống) ≥ 5 điểm
  let divergence = null;
  if (bo != null && g.sameSideExtremeIdx != null && Number.isFinite(rsi[bo]) && Number.isFinite(rsi[g.sameSideExtremeIdx])) {
    const d = rsi[bo] - rsi[g.sameSideExtremeIdx];
    divergence = dir > 0 ? d <= -5 : d >= 5;
  }
  const bars = bo != null ? breakoutBarContext(S, bo, t, dir > 0 ? "bull" : "bear", g.level(bo)) : { warn: [], confirm: [] };
  const withTrend = trend === dir;
  const counterTrend = trend === -dir;
  const triPos = g.apexIdx != null && bo != null ? (bo - g.startIdx) / Math.max(1, g.apexIdx - g.startIdx) : null;
  const items = [
    { key: "prior", label: g.role === "reversal" ? "Có xu hướng trước để đảo chiều (ch6)" : "Mô hình tiếp diễn theo xu hướng trước", ok: g.priorOk !== false, value: g.priorMove ?? null },
    { key: "touches", label: "Số lần chạm/tiếp cận biên (≥ 2 mỗi biên, càng nhiều càng mạnh)", ok: (g.touches ?? 0) >= 4, value: g.touches ?? null },
    { key: "width", label: "Độ rộng mô hình (càng dài càng quan trọng)", ok: width >= PRING.minBars, value: width },
    { key: "height", label: "Chiều cao mô hình (càng sâu, mục tiêu càng lớn)", ok: g.height >= 0.05, value: Math.expm1(g.height) },
    { key: "volContract", label: "Khối lượng co lại khi hình thành (ch5, ch6)", ok: volSlope < 0, value: volSlope },
    { key: "boVol", label: dir > 0 ? "Khối lượng mở rộng khi phá vỡ lên (≥ 1,5× TB25)" : "Khối lượng khi phá vỡ xuống (không bắt buộc)", ok: boVol == null ? null : dir > 0 ? boVol >= PRING.breakoutVolRatio : true, value: boVol },
    { key: "hold", label: "Phá vỡ dứt khoát và giữ ≥ 2 thanh (ch17)", ok: lc.confirmIdx != null ? true : bo == null ? null : false, value: null },
    { key: "trend", label: "Phá vỡ thuận xu hướng chính (phá vỡ ngược xu hướng dễ thất bại — ch17)", ok: bo == null ? null : withTrend, value: trend },
    { key: "divergence", label: "Không phân kỳ động lượng tại điểm phá vỡ (ch17)", ok: divergence == null ? null : !divergence, value: divergence },
    { key: "barWarn", label: "Không có thanh cạn kiệt / Pinocchio ngược hướng tại phá vỡ (ch17)", ok: bo == null ? null : bars.warn.length === 0, value: bars.warn.map((x) => x.label) },
    ...(triPos != null ? [{ key: "apex", label: "Tam giác phá vỡ ở ½–⅔ khoảng cách tới đỉnh (ch9)", ok: triPos >= PRING.triangleSweet[0] && triPos <= PRING.triangleSweet[1], value: triPos }] : []),
  ];
  // điểm minh bạch 0–100 (trọng số đặt trước, chưa kiểm định)
  let sc = 0;
  sc += Math.min(1, ((g.touches ?? 2) - 2) / 4) * 15;
  sc += Math.min(1, Math.log(Math.max(1, width / PRING.minBars)) / Math.log(10)) * 10;
  sc += Math.min(1, g.height / 0.25) * 10;
  sc += volSlope < 0 ? 10 : 0;
  sc += boVol == null ? 0 : Math.min(1, Math.max(0, (boVol - 1) / 1)) * 15;
  sc += g.priorOk !== false ? 10 : 0;
  sc += withTrend ? 10 : counterTrend ? -10 : 0;
  sc += lc.confirmIdx != null ? 10 : 0;
  sc += bars.confirm.length ? 5 : 0;
  sc -= bars.warn.length ? 10 : 0;
  sc -= divergence ? 10 : 0;
  sc += triPos != null && triPos >= PRING.triangleSweet[0] && triPos <= PRING.triangleSweet[1] ? 5 : 0;
  return { items, score: Math.round(Math.max(0, Math.min(100, sc + 10))), volSlope, boVol, trend, withTrend, counterTrend, divergence, bars, triPos };
}

/** Kế hoạch (ch6): vào khi phá vỡ (hoặc pullback), dừng ở mức thất bại 50% / mức vô hiệu gần hơn, mục tiêu 1×; R:R ≥ 3:1. */
export function plan(S, t, g, lc) {
  if (lc.breakoutIdx == null || !lc.targets) {
    const lvl = g.level(t), dir = g.dir;
    const entry = lvl + dir * pen(S, t, lvl);
    const stop = g.level(t) + (g.opposite(t) - g.level(t)) * PRING.failRetrace;
    const target = logTarget(lvl, g.height, 1, dir);
    const risk = Math.abs(entry - stop);
    return { entry, stop, target, rr: risk > 0 ? Math.abs(target - entry) / risk : null, basis: "Lệnh chờ tại điểm phá vỡ dứt khoát" };
  }
  const entry = S.C[lc.confirmIdx];
  const stop = lc.failLevel;
  const risk = Math.abs(entry - stop);
  return { entry, stop, target: lc.targets[0], target2: lc.targets[1], target3: lc.targets[2], rr: risk > 0 ? Math.abs(lc.targets[0] - entry) / risk : null, basis: "Vào khi phá vỡ được xác nhận (giữ 2 thanh)" };
}

export { touchTol };
