// @gq/quant-core · MTF v3 · S5 — lớp quyết định (MÔ TẢ): 4 thiết lập vào lệnh, 4 cổng CẤM VÀO, kế hoạch cắt lỗ / mục tiêu / R:R ≥ 2 và
// dừng lỗ kéo theo đáy Dow. Nguồn: K3 (chân dưới đổi theo chân trên), K5 (nén → mở rộng), K8 (nơi không được vào lệnh), K10 (R:R, cắt lỗ
// theo mức kỹ thuật, mục tiêu ở mức khung lớn, nâng dừng lỗ), K11 (vào muộn), K17 (phá vỡ nền). Định nghĩa trùng MTF-v3-prereg.md
// (H2, H3, H4, cổng H5) — KHÔNG gọi MUA / BÁN cho tới khi kiểm định S7 ĐẠT.
import type { Analysis3 } from "./frame";
import { mtfTriggerAt } from "./frame";
import { baseAt } from "./bases";
import { htfResistanceNear, levelsAt, type Level3 } from "./levels";

export const DECISION = { overAtr: 3, htfAtr: 1, extendedPct: 90, extendedAge: 40, lateAtr: 1.5, stopBufAtr: 0.25, minStopAtr: 1, minRr: 2, bandAtr: 0.25, bandLookback: 10, breakoutFresh: 3 } as const;

export type SetupKey = "pullback" | "breakout" | "expansion" | "reversal";
export const SETUP_LABEL: Record<SetupKey, string> = {
  pullback: "Mua điều chỉnh — chân dưới đổi theo chân trên", breakout: "Phá vỡ nền trong giai đoạn 2", expansion: "Nén → mở rộng theo xếp lớp", reversal: "Đảo chiều — đổi tính chất ↑ sau nền",
};
export type GateKey = "over" | "htfResistance" | "spent" | "againstWeek";
export const GATE_LABEL: Record<GateKey, string> = {
  over: "Quá đà: lệch ≥ 3 ATR trên EMA50", htfResistance: "Kháng cự Tuần / Tháng ngay phía trên (≤ 1 ATR)", spent: "Dải MA đã mở hết (≥ 90%) và xếp lớp ≥ 40 phiên", againstWeek: "Ngược khung Tuần (Tuần giảm / tăng đã gãy)",
};

export interface Decision3 {
  setups: { key: SetupKey; label: string; on: boolean; why: string }[];
  gates: { key: GateKey; label: string; hit: boolean; detail: string | null }[];
  active: SetupKey | null;
  late: boolean;
  plan: { entry: number; stop: number; stopBasis: string; target1: number; target1Basis: string; target2: number | null; rr1: number; ok: boolean; trail: number | null } | null;
  state: "setup" | "blocked" | "wait";
  headline: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function decisionAt(a: Analysis3, t: number, elliottTarget: number | null = null): Decision3 {
  const D = a.D, R = D.r, c = R.bars[t].close, atr = R.atr[t];
  const wi = a.ribbon.wIdx[t] ?? -1, wState = wi >= 0 ? a.W.dow.state[wi] : null;
  const trig = mtfTriggerAt(a, t);
  // ① mua điều chỉnh: tín hiệu L + low chạm dải EMA21–EMA50 trong 10 phiên trước
  let touched = false;
  for (let j = Math.max(0, t - DECISION.bandLookback); j <= t && !touched; j++) {
    const top = Math.max(R.ema21[j], R.ema50[j]);
    if (Number.isFinite(top) && R.bars[j].low <= top + DECISION.bandAtr * R.atr[j]) touched = true;
  }
  const pullback = trig.side === "L" && touched;
  // ② phá vỡ nền trong giai đoạn 2 (nền hợp lệ, ≤ nền thứ 3, phá vỡ ≤ 3 phiên)
  const base = baseAt(D, t);
  const freshBreak = !!base?.breakout && t - base.breakout.index <= DECISION.breakoutFresh;
  const breakout = D.stage.stage[t] === "S2" && !!base && base.valid && (base.baseCount ?? 1) <= 3 && freshBreak && (base.vcp || base.depth <= 0.15);
  // ③ nén → mở rộng (≤ 3 phiên), W không giảm
  let exp = false;
  for (let j = Math.max(0, t - 3); j <= t; j++) if (R.expand[j] === 1) exp = true;
  const expansion = exp && wState !== "DOWN" && wState !== "BROKEN_UP";
  // ④ đảo chiều: CHoCH↑ ngày ≤ 5 phiên trong lúc giai đoạn ngày S1 (nền) và tuần không giảm
  let choch = false;
  for (let j = Math.max(0, t - 5); j <= t; j++) if (D.dow.event[j] === "CHOCH_UP") choch = true;
  const reversal = choch && D.stage.stage[t] === "S1" && wState !== "DOWN";
  const setups = [
    { key: "pullback" as const, on: pullback, why: trig.side === "L" ? (touched ? "Tuần tăng + Ngày đổi tính chất ↑, vừa chạm dải EMA21–50" : "Có đồng pha nhưng chưa về dải EMA21–50") : "Chưa có đồng pha Tuần × Ngày" },
    { key: "breakout" as const, on: breakout, why: !base ? "Chưa có nền" : freshBreak ? (D.stage.stage[t] !== "S2" ? "Phá vỡ nhưng không ở giai đoạn 2" : base.valid ? `Phá vỡ ${base.footprint}` : `Nền chưa đạt: ${base.reasons.join(", ")}`) : `Đang trong nền — pivot ${r2(base.pivot)}` },
    { key: "expansion" as const, on: expansion, why: exp ? "Dải EMA vừa thoát nén và mở rộng theo xếp lớp tăng" : `Dải ${R.phase[t] === "squeeze" ? "đang nén — chờ bung" : "chưa có sự kiện mở rộng"}` },
    { key: "reversal" as const, on: reversal, why: choch ? `Đổi tính chất ↑ khi giai đoạn ${D.stage.stage[t]}` : "Chưa đổi tính chất ↑" },
  ].map((s) => ({ ...s, label: SETUP_LABEL[s.key] }));
  const active = (setups.find((s) => s.on)?.key ?? null) as SetupKey | null;
  // cổng cấm vào
  const lv: Level3[] = levelsAt(a, t), res = Number.isFinite(atr) ? htfResistanceNear(lv, c, atr, DECISION.htfAtr) : null;
  const gates = [
    { key: "over" as const, hit: R.dev50[t] >= DECISION.overAtr, detail: Number.isFinite(R.dev50[t]) ? `lệch ${r2(R.dev50[t])} ATR` : null },
    { key: "htfResistance" as const, hit: !!res, detail: res ? `${res.frames.join("/")} ${r2(res.price)} (${res.touches} lần chạm)` : null },
    { key: "spent" as const, hit: (R.widthPct[t] ?? 0) >= DECISION.extendedPct && R.orderAge[t] >= DECISION.extendedAge, detail: R.widthPct[t] != null ? `dải ${Math.round(R.widthPct[t]!)}% · xếp lớp ${R.orderAge[t]} phiên` : null },
    { key: "againstWeek" as const, hit: wState === "DOWN" || wState === "BROKEN_UP", detail: wState },
  ].map((g) => ({ ...g, label: GATE_LABEL[g.key] }));
  // kế hoạch: cắt lỗ theo mức kỹ thuật, mục tiêu ở mức cản gần nhất (ưu tiên Tuần / Tháng), R:R ≥ 2
  let plan: Decision3["plan"] = null;
  if (Number.isFinite(atr) && atr > 0) {
    const pl = D.dow.protectedLow[t], lastLow = D.dow.lastLow[t];
    const baseStop = active === "breakout" && base?.contractions.length ? base.contractions[base.contractions.length - 1].lo : NaN;
    const [stopRef, stopBasis] = Number.isFinite(baseStop) ? [baseStop, "đáy nhịp co cuối của nền"] : Number.isFinite(pl) && pl < c ? [pl, "đáy bảo vệ (押し安値)"] : Number.isFinite(lastLow) && lastLow < c ? [lastLow, "đáy sóng gần nhất"] : [NaN, ""];
    if (Number.isFinite(stopRef)) {
      // cắt lỗ dưới mức kỹ thuật, nhưng cách giá vào tối thiểu 1 ATR (không đặt trong vùng dao động bình thường của một phiên)
      const stop = Math.min(stopRef - DECISION.stopBufAtr * atr, c - DECISION.minStopAtr * atr), risk = c - stop;
      // mục tiêu 1 = kháng cự GẦN NHẤT phía trên ("mục tiêu chốt lời đầu tiên") — quá gần thì R:R không đạt (K8: không vào sát dưới cản)
      const lvT = lv.filter((l) => l.role === "resistance" && l.lo > c).sort((x, y) => x.lo - y.lo)[0] ?? null;
      const [target1, t1Basis] = lvT ? [lvT.lo, `kháng cự ${lvT.frames.join("/")} ${r2(lvT.price)}`] : [c + 2 * risk, "2R (không có mức cản phía trên)"];
      const rr1 = r2(risk > 0 ? (target1 - c) / risk : 0); // cổng R:R xét trên đúng con số hiển thị
      plan = { entry: r2(c), stop: r2(stop), stopBasis, target1: r2(target1), target1Basis: t1Basis, target2: elliottTarget != null && elliottTarget > target1 ? r2(elliottTarget) : r2(c + 3 * risk), rr1, ok: rr1 >= DECISION.minRr, trail: Number.isFinite(pl) ? r2(pl) : null };
    }
  }
  // vào muộn: giá đã chạy > 1,5 ATR khỏi mức kích hoạt (đỉnh sóng bị vượt / pivot)
  const trigPrice = active === "breakout" && base ? base.pivot : D.dow.lastHigh[t];
  const late = !!active && Number.isFinite(trigPrice) && Number.isFinite(atr) && c - trigPrice > DECISION.lateAtr * atr;
  const blocked = gates.some((g) => g.hit) || (plan != null && !plan.ok) || late;
  const state: Decision3["state"] = active ? (blocked ? "blocked" : "setup") : "wait";
  const firstGate = gates.find((g) => g.hit);
  const headline = state === "setup" ? `Đủ điều kiện mô tả: ${SETUP_LABEL[active!]}`
    : state === "blocked" ? `Có thiết lập nhưng KHÔNG nên vào: ${firstGate ? firstGate.label : late ? "đã quá muộn (> 1,5 ATR khỏi điểm kích hoạt)" : `R:R ${plan?.rr1 ?? "—"} < 2`}`
    : "Chờ — chưa có thiết lập nào";
  return { setups, gates, active, late, plan, state, headline };
}
