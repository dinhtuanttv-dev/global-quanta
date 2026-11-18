// LQ-v1 (18/11/2026) — Phòng tuyến thanh khoản: số đo MÔ TẢ cho tab Quyết định (tệp 14 thẩm định thanh khoản, pha LQ0).
// CHỈ HIỂN THỊ: không đổi `eligible`, `advBn`, `hlTradable` hay danh mục. Đổi cổng chọn mã cần đăng ký trước LQ-r1.
//
// Số đo trên giá trị KHỚP LỆNH (market_daily.value = TotalMatchVal; kho VNDirect nmValue — không gồm thoả thuận):
//   med20      trung vị GTGD 20 phiên (bền với phiên đột biến; trung bình bị 1/20 phiên kéo lệch)
//   p10_60     phân vị 10% GTGD 60 phiên (phiên thấp thứ ~6) — sàn "ngày xấu" khi cần bán thoát
//   density    số phiên trong 20 có GTGD ≥ dayMin — chặn mẫu "1 phiên cõng 19 phiên"
//   maxShare   phiên lớn nhất / tổng 20 phiên — độ tập trung đột biến
//   illiq      Amihud dạng tỷ số tổng Σ|r| / ΣGTGD trên 60 phiên, %/tỷ đồng (bền hơn trung bình các tỷ số khi GTGD → 0)
//   stressDays phiên giảm ≥ 5% mà GTGD < 25% trung vị 60 phiên (dấu hiệu sàn trắng bên mua / cạn cầu)
//   capacity   vị thế lớn nhất thoả: vào ≤ 10% trung vị, thoát ≤ 3 phiên ở ≤ 20% phiên xấu (p10), tác động căn bậc hai ≤ 0,5%
//   impact     Y·σ·√(Q/V) — luật căn bậc hai (Almgren et al. 2005; Tóth et al. 2011), Q = vị thế tham chiếu tại vốn A
// Ngưỡng vào là HÀM CỦA VỐN A: medMin = max(5 tỷ, wMax·A/ρ_in), p10Min = wMax·A/(ngày thoát·ρ_out), dayMin = medMin/3.

export const LQ_VERSION = "LQ-v1 (18/11/2026)";
export const LQ_RULES = Object.freeze({
  capitalBn: 5, wRef: 0.1, wMax: 0.15, rhoIn: 0.1, rhoOut: 0.2, exitDays: 3, impactY: 0.8, impactMax: 0.005, sigmaFloor: 0.01,
  absMinMedBn: 5, illiqWarn: 0.5, illiqMax: 1.0, densityMin: 15, maxShareWarn: 0.3, l1MedBn: 50, l1Illiq: 0.05,
  stressRet: 0.05, stressFrac: 0.25, holdWarnFrac: 0.7, dtlWarn: 5, win: 20, win60: 60, minObs: 15,
});
export const LQ_TIERS = ["L1", "L2", "L3", "L4", "NA"];

const fin = Number.isFinite;
const r3 = (v) => (fin(v) ? Number(v.toPrecision(4)) : null);
export function quantile(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Ngưỡng vào suy ra từ vốn A (tỷ đồng). */
export function lqThresholds(rules = LQ_RULES, capitalBn = rules.capitalBn) {
  const medMin = Math.max(rules.absMinMedBn, (rules.wMax * capitalBn) / rules.rhoIn);
  return { capitalBn, medMin, p10Min: (rules.wMax * capitalBn) / (rules.exitDays * rules.rhoOut), dayMin: medMin / 3 };
}

/** Năng lực giao dịch tại vị thế Q (tỷ): vị thế tối đa, tác động, số phiên thoát. */
export function lqCapacity({ med20, p10, sigma20 }, qBn, rules = LQ_RULES) {
  if (!(med20 > 0)) return { capacityBn: 0, capitalMaxBn: 0, impactPct: null, dtl: null, binding: "med" };
  const sig = Math.max(fin(sigma20) ? sigma20 : 0, rules.sigmaFloor);
  const caps = { in: rules.rhoIn * med20, out: rules.exitDays * rules.rhoOut * Math.max(p10 ?? 0, 0), impact: med20 * (rules.impactMax / (rules.impactY * sig)) ** 2 };
  const binding = Object.entries(caps).sort((a, b) => a[1] - b[1])[0][0];
  const capacityBn = caps[binding];
  return {
    capacityBn, capitalMaxBn: capacityBn / rules.wMax, binding,
    impactPct: qBn > 0 ? rules.impactY * sig * Math.sqrt(qBn / med20) * 100 : null,
    dtl: qBn > 0 && p10 > 0 ? qBn / (rules.rhoOut * p10) : null,
  };
}

/**
 * Số đo thanh khoản của một mã tại phiên cuối của `rows`.
 * @param rows   [{ date, closeAdj, value }] tăng dần, ≤ phiên tính (value: đồng, null = thiếu)
 * @param sigma20 độ lệch chuẩn lợi suất ngày 20 phiên (đã tính ở priceStats)
 */
export function liquidityStats(rows, sigma20 = null, rules = LQ_RULES, capitalBn = rules.capitalBn) {
  const th = lqThresholds(rules, capitalBn);
  const tail = rows.slice(-(rules.win60 + 1));
  const w60 = tail.slice(1), w20 = w60.slice(-rules.win);
  const v = (r) => (fin(r.value) && r.value >= 0 ? r.value / 1e9 : null);
  const v20 = w20.map(v).filter((x) => x != null), v60 = w60.map(v).filter((x) => x != null);
  if (v20.length < rules.minObs) return { version: LQ_VERSION, tier: "NA", reasons: ["NO_DATA"], n20: v20.length, n60: v60.length };
  const sum20 = v20.reduce((a, x) => a + x, 0);
  const med20 = quantile(v20, 0.5), med60 = quantile(v60, 0.5), p10 = quantile(v60, 0.1);
  let absR = 0, volR = 0, stressDays = 0;
  for (let i = 0; i < w60.length; i++) {
    const prev = tail[i], cur = w60[i], val = v(cur);
    if (!(prev.closeAdj > 0) || !(cur.closeAdj > 0) || val == null) continue;
    const r = cur.closeAdj / prev.closeAdj - 1;
    if (val > 0) { absR += Math.abs(r); volR += val; }
    if (r <= -rules.stressRet && val < rules.stressFrac * med60) stressDays++;
  }
  const illiq = volR > 0 ? (absR / volR) * 100 : null;
  const density = v20.filter((x) => x >= th.dayMin).length;
  const maxShare = sum20 > 0 ? Math.max(...v20) / sum20 : null;
  const reasons = [];
  let tier;
  if (med20 < rules.absMinMedBn) reasons.push("MED_ABS");
  if (illiq != null && illiq > rules.illiqMax) reasons.push("ILLIQ_MAX");
  if (reasons.length) tier = "L4";
  else {
    if (med20 < th.medMin) reasons.push("MED");
    if (p10 < th.p10Min) reasons.push("P10");
    if (density < rules.densityMin) reasons.push("DENSITY");
    if (illiq != null && illiq > rules.illiqWarn) reasons.push("ILLIQ");
    if (maxShare != null && maxShare > rules.maxShareWarn) reasons.push("SPIKE");
    if (stressDays > 0) reasons.push("STRESS");
    tier = reasons.length ? "L3" : med20 >= rules.l1MedBn && illiq != null && illiq <= rules.l1Illiq ? "L1" : "L2";
  }
  const cap = lqCapacity({ med20, p10, sigma20 }, rules.wRef * capitalBn, rules);
  return {
    version: LQ_VERSION, tier, reasons, n20: v20.length, n60: v60.length,
    med20: r3(med20), mean20: r3(sum20 / v20.length), p10: r3(p10), min20: r3(Math.min(...v20)), max20: r3(Math.max(...v20)),
    density, maxShare: r3(maxShare), illiq: r3(illiq), stressDays,
    capacityBn: r3(cap.capacityBn), capitalMaxBn: r3(cap.capitalMaxBn), binding: cap.binding, impactPct: r3(cap.impactPct), dtl: r3(cap.dtl),
  };
}

/** Chuỗi 60 phiên cho Hồ sơ (biểu đồ GTGD): [{ d, v (tỷ), r }]. */
export function liquiditySeries(rows, rules = LQ_RULES) {
  const tail = rows.slice(-(rules.win60 + 1));
  return tail.slice(1).map((x, i) => ({ d: x.date, v: fin(x.value) ? r3(x.value / 1e9) : null, r: tail[i].closeAdj > 0 && x.closeAdj > 0 ? r3(x.closeAdj / tail[i].closeAdj - 1) : null }));
}

/** Bảng ngưỡng công khai cho giao diện. */
export const lqPublicRules = (rules = LQ_RULES) => ({ version: LQ_VERSION, ...rules, ...lqThresholds(rules) });
