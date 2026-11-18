// G3 (18/11/2026) — "Khoảng cách tới danh mục Elite HL" của một mã: các điều kiện của quy tắc Hợp lưu HL-v1 + điều kiện giao dịch được,
// cái nào đạt / còn thiếu, kèm số đo. Thay khối "khoảng cách tới danh mục dòng tiền (Z)" cũ. Hàm thuần, chỉ mô tả.
import { HL_RULES, type HlResult } from "./confluence";

export interface GapCond { id: "ls" | "ta" | "rrg" | "liq" | "price" | "sigma"; ok: boolean | null; text: string }
export interface HlGap { conds: GapCond[]; missing: number; verdictVi: string }

const n0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const n1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }));

export function hlGap(
  r: HlResult | null | undefined,
  score: { advBn?: number | null; close?: number | null; sigma20?: number | null } | null | undefined,
  rule: { minAdvBn?: number; minPrice?: number; minSigma20?: number } = {},
  tier1: { lsLeaderPct?: number; taMin?: number; taModels?: number } = {},
): HlGap | null {
  if (!r) return null;
  const lsCut = tier1.lsLeaderPct ?? HL_RULES.lsLeaderPct, taMin = tier1.taMin ?? HL_RULES.taMin, taN = tier1.taModels ?? r.taModels.length;
  const minAdv = rule.minAdvBn ?? 5, minPrice = rule.minPrice ?? 5000, minSig = rule.minSigma20 ?? 0.005;
  const conds: GapCond[] = [
    { id: "ls", ok: r.lsPct == null ? null : r.lsPct >= lsCut, text: `Sức mạnh dẫn dắt LS-v1: phân vị ${n0(r.lsPct)} (cần ≥ ${lsCut})` },
    { id: "ta", ok: r.taKnown ? r.taCount >= taMin : null, text: `Mô hình TA đạt: ${r.taCount}/${taN} (cần ≥ ${taMin})` },
    { id: "rrg", ok: r.rrg == null ? null : r.cls !== "T1_SECTOR_AGAINST" && r.t2 >= 0, text: r.rrg == null ? "Ngành chưa có góc RRG" : `Ngành trên RRG: ${r.t2 > 0 ? "ủng hộ" : r.t2 === 0 ? "trung tính" : "phản đối"}` },
    { id: "liq", ok: score?.advBn == null ? null : score.advBn >= minAdv, text: `GTGD TB20 ${n1(score?.advBn)} tỷ (cần ≥ ${n0(minAdv)} tỷ)` },
    { id: "price", ok: score?.close == null ? null : score.close >= minPrice, text: `Giá ${n0(score?.close)}đ (cần ≥ ${n0(minPrice)}đ)` },
    { id: "sigma", ok: score?.sigma20 == null ? null : score.sigma20 >= minSig, text: `Biến động 20 phiên ${n1((score?.sigma20 ?? 0) * 100)}%/ngày (cần ≥ ${n1(minSig * 100)}%)` },
  ];
  const missing = conds.filter((c) => c.ok === false).length, unknown = conds.filter((c) => c.ok === null).length;
  const verdictVi = missing ? `Còn thiếu ${missing} điều kiện${unknown ? ` · ${unknown} chưa có số liệu` : ""}.`
    : unknown ? `Chưa đủ số liệu để xét ${unknown} điều kiện.`
      : "Đạt mọi điều kiện của quy tắc — vào khi có phiên cân bằng đầu tuần và còn ô trống / trần ngành.";
  return { conds, missing, verdictVi };
}
