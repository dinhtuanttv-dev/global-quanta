// RADAR 4 ĐIỀU KIỆN BÁN (20/11/2026, rà soát ngược Bảng quyết định) — khoảng cách của TỪNG vị thế tới CẢ BỐN điều kiện bán của quy tắc
// G2r (backend/src/market/elite/eliteHl.js exitReason): LS-v1 < exitLsPct · TA < exitTaMin · ngành RRG ≤ exitRrg (Tụt hậu) · vắng điểm
// LS-v1 đủ missSessions phiên. Radar cũ chỉ đo điều kiện LS và BỎ mã thiếu điểm LS (đúng lúc mã có nguy cơ bị bán vì vắng dữ liệu).
// Hàm thuần, CHỈ ĐỌC ngưỡng trong hl.rule và số đã có trong tài liệu quyết định; không quyết định bán — backend vẫn là nguồn duy nhất.
import type { EliteDecision, HlPick } from "./decisionTypes";

export type TriggerLevel = "OK" | "WATCH" | "NEAR";
export interface TriggerCell { level: TriggerLevel; text: string; title: string }
export interface ExitTriggerRow {
  ticker: string; weight: number | null;
  ls: TriggerCell; ta: TriggerCell; rrg: TriggerCell; data: TriggerCell;
  /** Số điều kiện đang ở mức SÁT (NEAR) / CẦN THEO DÕI (WATCH). */
  near: number; watch: number;
}
export interface ExitRules { exitLsPct: number; warnLsPct: number; exitTaMin: number; exitRrg: number; missSessions: number; taModels: number }

/** Mặc định = HL_PF của backend (eliteHl.js) — chỉ dùng khi tài liệu cũ chưa gửi trường đó. */
export const EXIT_DEFAULTS: ExitRules = { exitLsPct: 60, warnLsPct: 70, exitTaMin: 1, exitRrg: -2, missSessions: 2, taModels: 7 };
const RRG_VI: Record<string, string> = { "2": "Dẫn dắt", "1": "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };

export function exitRules(d: EliteDecision): ExitRules {
  const r = (d.hl?.rule ?? {}) as Partial<ExitRules> & Record<string, unknown>;
  const pick = (k: keyof ExitRules) => (typeof r[k] === "number" ? (r[k] as number) : EXIT_DEFAULTS[k]);
  return { exitLsPct: pick("exitLsPct"), warnLsPct: pick("warnLsPct"), exitTaMin: pick("exitTaMin"), exitRrg: pick("exitRrg"), missSessions: pick("missSessions"), taModels: d.hl?.tier1?.taModels ?? EXIT_DEFAULTS.taModels };
}

export function exitTriggerRow(p: HlPick, R: ExitRules): ExitTriggerRow {
  const h = p.hl, miss = h.miss ?? 0, lsMissing = h.lsPct == null;
  // 1) LS-v1: khoảng cách = exitBufferLs của backend (lsPct − exitLsPct); dưới mức cảnh báo (warnLsPct) -> SÁT.
  const ls: TriggerCell = lsMissing
    ? { level: "NEAR", text: "thiếu điểm", title: `Không có điểm LS-v1 của mã phiên này — chưa xét ngưỡng LS (bị bán nếu vắng ${R.missSessions} phiên liên tiếp)` }
    : (() => {
      const buf = h.exitBufferLs ?? (h.lsPct as number) - R.exitLsPct;
      const level: TriggerLevel = (h.lsPct as number) < R.warnLsPct ? "NEAR" : buf < (R.warnLsPct - R.exitLsPct) * 2 ? "WATCH" : "OK";
      return { level, text: `${Math.round(h.lsPct as number)} · cách ${Math.round(buf)}`, title: `LS-v1 phân vị ${Math.round(h.lsPct as number)} — bị bán khi < ${R.exitLsPct}; mức cảnh báo ${R.warnLsPct}` };
    })();
  // 2) TA: bị bán khi số mô hình đạt < exitTaMin. Đang đúng bằng ngưỡng -> mất thêm 1 mô hình là bán (SÁT).
  const taN = h.taCount ?? null;
  const ta: TriggerCell = taN == null || lsMissing
    ? { level: lsMissing ? "WATCH" : "OK", text: "—", title: "Điều kiện TA hoãn khi mã thiếu dữ liệu riêng (cột TA mặc định 0, không phân biệt được với \"0 mô hình đạt\")" }
    : { level: taN <= R.exitTaMin ? "NEAR" : taN <= R.exitTaMin + 1 ? "WATCH" : "OK", text: `${taN}/${R.taModels}`,
      title: `${taN} mô hình TA đạt — bị bán khi < ${R.exitTaMin}${taN <= R.exitTaMin ? " (mất thêm 1 mô hình là chạm ngưỡng)" : ""}` };
  // 3) Ngành RRG: bị bán khi rrg ≤ exitRrg (Tụt hậu). Suy yếu là góc liền trước Tụt hậu trên vòng quay RRG -> SÁT.
  const rg = h.rrg ?? null;
  const rrg: TriggerCell = rg == null
    ? { level: "OK", text: "—", title: "Chưa có RRG ngành — điều kiện ngành chưa xét" }
    : { level: rg <= R.exitRrg ? "NEAR" : rg === -1 ? "NEAR" : "OK", text: RRG_VI[String(rg)] ?? String(rg),
      title: `Ngành ở góc ${RRG_VI[String(rg)] ?? rg} — bị bán khi rơi vào Tụt hậu${rg === -1 ? " (Suy yếu là góc liền trước Tụt hậu trên vòng quay RRG)" : ""}` };
  // 4) Dữ liệu: số phiên vắng liên tiếp / ngưỡng.
  const data: TriggerCell = miss > 0
    ? { level: "NEAR", text: `vắng ${miss}/${R.missSessions}`, title: `Vắng dữ liệu của mã ${miss} phiên liên tiếp — bị bán khi đủ ${R.missSessions}` }
    : { level: "OK", text: "đủ", title: "Phiên này có đủ dữ liệu của mã" };
  const cells = [ls, ta, rrg, data];
  return { ticker: p.ticker, weight: p.weight ?? null, ls, ta, rrg, data, near: cells.filter((c) => c.level === "NEAR").length, watch: cells.filter((c) => c.level === "WATCH").length };
}

/** Mọi vị thế đang giữ, mã gần điều kiện bán nhất lên đầu (nhiều điều kiện SÁT -> nhiều cần theo dõi -> LS gần ngưỡng hơn). */
export function exitTriggers(picks: readonly HlPick[], R: ExitRules): ExitTriggerRow[] {
  const ls = (p: HlPick) => p.hl.exitBufferLs ?? (p.hl.lsPct == null ? -1 : p.hl.lsPct - R.exitLsPct);
  const lsBy = new Map(picks.map((p) => [p.ticker, ls(p)]));
  return picks.map((p) => exitTriggerRow(p, R)).sort((a, b) => b.near - a.near || b.watch - a.watch || (lsBy.get(a.ticker) ?? 0) - (lsBy.get(b.ticker) ?? 0));
}
