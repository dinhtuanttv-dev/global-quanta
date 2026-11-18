// LQ1 (18/11/2026) — Phòng tuyến thanh khoản, phần hiển thị: nhãn bậc, câu lý do có số đo, năng lực giao dịch theo vốn của người xem.
// Công thức năng lực giống hệt Gateway (backend/src/market/elite/liquidity.js — test đối chiếu cùng số). CHỈ HIỂN THỊ, không đổi danh mục.
import type { HlQueueItem, LiqStats, LqReason, LqRules, LqTier } from "./decisionTypes";

/** Ngưỡng mặc định khi Gateway bản cũ chưa gửi `liquidity` (trùng LQ_RULES). */
export const LQ_DEFAULT: LqRules = {
  version: "LQ-v1 (18/11/2026)", capitalBn: 5, wRef: 0.1, wMax: 0.15, rhoIn: 0.1, rhoOut: 0.2, exitDays: 3, impactY: 0.8, impactMax: 0.005, sigmaFloor: 0.01,
  absMinMedBn: 5, illiqWarn: 0.5, illiqMax: 1, densityMin: 15, maxShareWarn: 0.3, l1MedBn: 50, l1Illiq: 0.05,
  stressRet: 0.05, stressFrac: 0.25, holdWarnFrac: 0.7, dtlWarn: 5, win: 20, win60: 60, minObs: 15, medMin: 7.5, p10Min: 1.25, dayMin: 2.5,
};

export const LQ_TIER: Record<LqTier, { short: string; label: string; cls: string; dot: string; hint: string }> = {
  L1: { short: "L1", label: "Rất sâu", cls: "border-emerald-400/50 text-emerald-200", dot: "bg-emerald-400", hint: "Trung vị GTGD ≥ 50 tỷ và trượt giá rất thấp" },
  L2: { short: "L2", label: "Chuẩn", cls: "border-sky-400/50 text-sky-200", dot: "bg-sky-400", hint: "Đạt mọi ngưỡng vào theo vốn tham chiếu" },
  L3: { short: "L3", label: "Mỏng", cls: "border-amber-400/60 text-amber-200", dot: "bg-amber-400", hint: "Đạt sàn tuyệt đối nhưng trượt ít nhất một ngưỡng phụ" },
  L4: { short: "L4", label: "Chỉ nghiên cứu", cls: "border-rose-400/60 text-rose-200", dot: "bg-rose-400", hint: "Trung vị dưới sàn tuyệt đối hoặc trượt giá vượt trần" },
  NA: { short: "—", label: "Thiếu số liệu", cls: "border-slate-500/50 text-slate-300", dot: "bg-slate-500", hint: "Dưới 15/20 phiên có số liệu GTGD" },
};

const vn = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
/** Tỷ đồng: dưới 1 tỷ đổi sang triệu. */
export const bnText = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v < 1 ? `${Math.round(v * 1000).toLocaleString("vi-VN")} tr`
  : v < 10 ? `${v.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} tỷ` : `${vn(v, 0)} tỷ`);

export function lqThresholds(rules: LqRules, capitalBn = rules.capitalBn) {
  const medMin = Math.max(rules.absMinMedBn, (rules.wMax * capitalBn) / rules.rhoIn);
  return { capitalBn, medMin, p10Min: (rules.wMax * capitalBn) / (rules.exitDays * rules.rhoOut), dayMin: medMin / 3 };
}

/** Năng lực tại vị thế Q (tỷ) — giống `lqCapacity` của Gateway. */
export function lqCapacity(l: { med20?: number | null; p10?: number | null }, sigma20: number | null | undefined, qBn: number, rules: LqRules) {
  const med = l.med20 ?? 0, p10 = Math.max(l.p10 ?? 0, 0);
  if (!(med > 0)) return { capacityBn: 0, capitalMaxBn: 0, impactPct: null as number | null, dtl: null as number | null, binding: "in" as const };
  const sig = Math.max(Number.isFinite(sigma20) ? (sigma20 as number) : 0, rules.sigmaFloor);
  const caps = { in: rules.rhoIn * med, out: rules.exitDays * rules.rhoOut * p10, impact: med * (rules.impactMax / (rules.impactY * sig)) ** 2 };
  const binding = (Object.entries(caps) as [keyof typeof caps, number][]).sort((a, b) => a[1] - b[1])[0][0];
  return {
    capacityBn: caps[binding], capitalMaxBn: caps[binding] / rules.wMax, binding,
    impactPct: qBn > 0 ? rules.impactY * sig * Math.sqrt(qBn / med) * 100 : null,
    dtl: qBn > 0 && p10 > 0 ? qBn / (rules.rhoOut * p10) : null,
  };
}
export const BINDING_VI = { in: "vào lệnh ≤ 10% trung vị GTGD", out: "thoát trong 3 phiên xấu", impact: "chi phí tác động ≤ 0,5%" } as const;

/** Câu lý do có số đo (một dòng mỗi lý do), theo thứ tự nghiêm trọng của Gateway. */
export function reasonText(id: LqReason, l: LiqStats, rules: LqRules): string {
  const th = lqThresholds(rules);
  switch (id) {
    case "MED_ABS": return `Trung vị GTGD 20 phiên ${bnText(l.med20)} < sàn ${bnText(rules.absMinMedBn)}`;
    case "ILLIQ_MAX": return `Trượt giá (Amihud) ${vn(l.illiq, 2)}%/tỷ > trần ${vn(rules.illiqMax, 1)}%/tỷ`;
    case "MED": return `Trung vị ${bnText(l.med20)} < ${bnText(th.medMin)} (cần cho vốn ${vn(rules.capitalBn, 0)} tỷ)`;
    case "P10": return `Phiên thấp (p10, 60 phiên) ${bnText(l.p10)} < ${bnText(th.p10Min)}`;
    case "DENSITY": return `Chỉ ${l.density}/20 phiên có GTGD ≥ ${bnText(th.dayMin)} (cần ≥ ${rules.densityMin})`;
    case "ILLIQ": return `Trượt giá ${vn(l.illiq, 2)}%/tỷ > ${vn(rules.illiqWarn, 1)}%/tỷ`;
    case "SPIKE": return `Một phiên chiếm ${vn((l.maxShare ?? 0) * 100, 0)}% GTGD 20 phiên — trung bình bị đột biến kéo lên`;
    case "STRESS": return `${l.stressDays} phiên giảm ≥ ${vn(rules.stressRet * 100, 0)}% mà khớp < ${vn(rules.stressFrac * 100, 0)}% trung vị (cạn cầu)`;
    case "NO_DATA": return `Chỉ ${l.n20}/20 phiên có số liệu GTGD`;
  }
}

/** Cờ khi ĐANG GIỮ (chỉ cảnh báo, không bán): đỏ = có phiên cạn cầu; vàng = trung vị < 70% ngưỡng vào hoặc thoát > 5 phiên. */
export function holdFlag(l: LiqStats | null | undefined, weight: number, sigma20: number | null | undefined, rules: LqRules, capitalBn = rules.capitalBn): { level: "red" | "amber"; text: string } | null {
  if (!l || l.tier === "NA") return null;
  if ((l.stressDays ?? 0) > 0) return { level: "red", text: `${l.stressDays} phiên giảm sâu mà cạn cầu trong 60 phiên` };
  const th = lqThresholds(rules, capitalBn), cap = lqCapacity(l, sigma20, weight * capitalBn, rules);
  if ((l.med20 ?? 0) < rules.holdWarnFrac * th.medMin) return { level: "amber", text: `Trung vị ${bnText(l.med20)} < ${vn(rules.holdWarnFrac * 100, 0)}% ngưỡng vào` };
  if (cap.dtl != null && cap.dtl > rules.dtlWarn) return { level: "amber", text: `Cần ~${vn(cap.dtl, 1)} phiên để thoát ở 20% phiên xấu` };
  return null;
}

/** Vốn tối đa mà danh mục hôm nay chịu được: min theo từng vị thế của năng lực / tỷ trọng thật. */
export function portfolioCapacity(rows: { ticker: string; weight: number; liq?: LiqStats | null; sigma20?: number | null }[], rules: LqRules) {
  let best: { capitalBn: number; ticker: string; binding: keyof typeof BINDING_VI } | null = null;
  for (const r of rows) {
    if (!r.liq || r.liq.tier === "NA" || !(r.weight > 0)) continue;
    const c = lqCapacity(r.liq, r.sigma20, 0, rules), capital = c.capacityBn / r.weight;
    if (!best || capital < best.capitalBn) best = { capitalBn: capital, ticker: r.ticker, binding: c.binding };
  }
  return best;
}

/** Hàng chờ: tách mã chưa giao dịch được (Gateway mới: queueIlliquid; Gateway cũ: code "illiquid" trong queue). */
export function splitQueue(queue: HlQueueItem[], queueIlliquid?: HlQueueItem[] | null) {
  return { tradable: queue.filter((q) => q.code !== "illiquid"), illiquid: [...(queueIlliquid ?? []), ...queue.filter((q) => q.code === "illiquid")] };
}

/** Chú thích dài cho huy hiệu (rê chuột / đọc màn hình). */
export function lqTooltip(l: LiqStats, rules: LqRules, sigma20?: number | null, weight?: number | null): string {
  const t = LQ_TIER[l.tier];
  if (l.tier === "NA") return `${t.label}: ${t.hint}`;
  const q = (weight ?? rules.wRef) * rules.capitalBn, cap = lqCapacity(l, sigma20, q, rules);
  return [
    `Thanh khoản ${t.short} · ${t.label} (${rules.version})`,
    `Trung vị 20 phiên ${bnText(l.med20)} · trung bình ${bnText(l.mean20)} · thấp nhất ${bnText(l.min20)} · cao nhất ${bnText(l.max20)}`,
    `Phiên thấp p10 (60 phiên) ${bnText(l.p10)} · ${l.density}/20 phiên ≥ ${bnText(lqThresholds(rules).dayMin)}`,
    `Trượt giá Amihud ${vn(l.illiq, 3)}%/tỷ`,
    `Vị thế ${vn((weight ?? rules.wRef) * 100, 0)}% × vốn ${vn(rules.capitalBn, 0)} tỷ = ${bnText(q)}: tác động ~${vn(cap.impactPct, 2)}%, thoát ~${vn(cap.dtl, 1)} phiên`,
    `Vị thế tối đa ${bnText(cap.capacityBn)} (ràng buộc: ${BINDING_VI[cap.binding]})`,
    ...l.reasons.map((id) => `• ${reasonText(id, l, rules)}`),
    "Mô tả — không đổi danh mục.",
  ].join("\n");
}

export interface LqPoint { d: string; v: number | null; r: number | null }
const quantile = (a: number[], p: number) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
/**
 * Tính lại số đo từ chuỗi 60 phiên của Hồ sơ cho VỐN BẤT KỲ (giống hệt `liquidityStats` của Gateway khi vốn = vốn tham chiếu —
 * test đối chiếu từng trường). Dùng cho ô "thử với vốn của anh"; bảng quyết định luôn dùng số của Gateway.
 */
export function statsFromSeries(series: LqPoint[], sigma20: number | null | undefined, rules: LqRules, capitalBn = rules.capitalBn): LiqStats {
  const th = lqThresholds(rules, capitalBn);
  const w60 = series.slice(-rules.win60), w20 = w60.slice(-rules.win);
  const ok = (x: number | null): x is number => x != null && Number.isFinite(x) && x >= 0;
  const v20 = w20.map((p) => p.v).filter(ok), v60 = w60.map((p) => p.v).filter(ok);
  const version = rules.version;
  if (v20.length < rules.minObs) return { version, tier: "NA", reasons: ["NO_DATA"], n20: v20.length, n60: v60.length };
  const sum20 = v20.reduce((a, x) => a + x, 0), med20 = quantile(v20, 0.5)!, med60 = quantile(v60, 0.5)!, p10 = quantile(v60, 0.1)!;
  let absR = 0, volR = 0, stressDays = 0;
  for (const p of w60) {
    if (!ok(p.v) || p.r == null || !Number.isFinite(p.r)) continue;
    if (p.v > 0) { absR += Math.abs(p.r); volR += p.v; }
    if (p.r <= -rules.stressRet && p.v < rules.stressFrac * med60) stressDays++;
  }
  const illiq = volR > 0 ? (absR / volR) * 100 : null, density = v20.filter((x) => x >= th.dayMin).length, maxShare = sum20 > 0 ? Math.max(...v20) / sum20 : null;
  const reasons: LqReason[] = [];
  let tier: LqTier;
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
  const cap = lqCapacity({ med20, p10 }, sigma20, rules.wRef * capitalBn, rules);
  return {
    version, tier, reasons, n20: v20.length, n60: v60.length, med20, mean20: sum20 / v20.length, p10, min20: Math.min(...v20), max20: Math.max(...v20),
    density, maxShare, illiq, stressDays, capacityBn: cap.capacityBn, capitalMaxBn: cap.capitalMaxBn, binding: cap.binding, impactPct: cap.impactPct, dtl: cap.dtl,
  };
}
