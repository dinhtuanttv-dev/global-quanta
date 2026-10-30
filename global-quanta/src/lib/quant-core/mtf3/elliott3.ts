// @gq/quant-core · MTF v3 · S3 — hợp lưu Elliott × dải EMA × cấu trúc Dow (K13, K21 trong docs/mtf-v3/01_SOURCE_SYNTHESIS.md).
// Dùng NGUYÊN engine Elliott Pro v3 (cây sóng + kịch bản — thành phần có walk-forward EP5 PASS nhỏ) trên khung Ngày và Tuần, không viết
// lại quy tắc sóng. Lớp này chỉ ghép: (1) sóng 2 / sóng 4 VỪA kết thúc (kịch bản chính = sóng 3 / sóng 5) có nằm trong vùng Fib VÀ trong
// dải EMA không; (2) "bắt sóng 3 của chân trên bằng sóng 3 của chân dưới"; (3) mức vô hiệu so với đáy bảo vệ Dow, mục tiêu của kịch bản.
// Chỉ MÔ TẢ tới khi H6 (MTF-v3-prereg) được kiểm định.
import type { Bar } from "../math";
import { buildWaveTree, describePosition } from "../elliott/v3/waveTree";
import { scenariosFromTree, TEMPLATE_TITLE, type EwScenario } from "../elliott/v3/scenarios";
import type { Analysis3 } from "./frame";

export const ELLIOTT3 = { w2Retrace: [0.382, 0.786] as const, w4Retrace: [0.236, 0.618] as const, bandAtr: 0.5, minBars: 60 } as const;

export interface WaveEnd { wave: "2" | "4"; price: number; date: string | null; retrace: number | null; inFibZone: boolean | null; inEmaBand: boolean | null; band: [number, number] | null; bandName: string }
export interface EwView { label: string; position: string; template: EwScenario["template"] | null; dir: "up" | "down" | null; provisional: boolean }
export interface Elliott3 {
  day: EwView | null;
  week: EwView | null;
  relation: "aligned" | "pullback" | "counter" | "unclear"; relationText: string;
  /** Kịch bản sóng 3 ở cả Tuần và Ngày, cùng chiều ("bắt sóng 3 của chân trên bằng sóng 3 của chân dưới"). */
  nested3: "up" | "down" | null;
  /** Sóng 2 / 4 vừa kết thúc theo kịch bản chính khung ngày, so với Fib và dải EMA. */
  waveEnd: WaveEnd | null;
  confluence: "strong" | "partial" | "none";
  trigger: { price: number; text: string } | null;
  invalidation: { price: number; side: "above" | "below"; reason: string } | null;
  /** Mức vô hiệu Elliott so với đáy bảo vệ Dow khung ngày (dương = đáy bảo vệ nằm trên mức vô hiệu). */
  stopAgreement: { elliott: number; dow: number; gapAtr: number } | null;
  targets: { label: string; price: number }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const candlesOf = (bars: Bar[]) => bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));

function primaryOf(bars: Bar[]): { sc: EwScenario | null; position: string } | null {
  if (bars.length < ELLIOTT3.minBars) return null;
  const candles = candlesOf(bars), tree = buildWaveTree(candles);
  const scs = scenariosFromTree(tree, candles);
  return { sc: scs.find((s) => s.role === "primary") ?? scs[0] ?? null, position: describePosition(tree) };
}
function viewOf(p: { sc: EwScenario | null; position: string } | null): EwView | null {
  if (!p) return null;
  const sc = p.sc;
  return {
    label: sc ? `${TEMPLATE_TITLE[sc.template]} ${sc.dir > 0 ? "tăng" : "giảm"}${sc.provisional ? " (tạm)" : ""}` : "Chưa có kịch bản",
    position: p.position, template: sc?.template ?? null, dir: sc ? (sc.dir > 0 ? "up" : "down") : null, provisional: !!sc?.provisional,
  };
}

export function elliott3(daily: Bar[], a: Analysis3): Elliott3 {
  const t = daily.length - 1, R = a.D.r;
  const dp = primaryOf(daily);
  // tuần: chỉ các tuần ĐÃ ĐÓNG (bỏ tuần đang chạy) — cùng quy ước khung lớn của MTF v3
  const wi = a.ribbon.wIdx[t] ?? -1;
  const wp = wi >= 0 ? primaryOf(a.W.r.bars.slice(0, wi + 1)) : null;
  const day = viewOf(dp), week = viewOf(wp), sc = dp?.sc ?? null;

  let waveEnd: WaveEnd | null = null;
  if (sc && (sc.template === "wave3" || sc.template === "wave5")) {
    const isW2 = sc.template === "wave3", an = sc.anchors;
    // wave3: mốc [0, 1, 2]; wave5: mốc [0 … 4] — sóng điều chỉnh vừa xong kết thúc ở mốc cuối, đo trên sóng đẩy liền trước
    const e = an[an.length - 1], s0 = an[an.length - 3], s1 = an[an.length - 2];
    if (e && s0 && s1) {
      const leg = Math.abs(s1.price - s0.price), retrace = leg > 0 ? Math.abs(s1.price - e.price) / leg : null;
      const ti = daily.findIndex((b) => b.date === String(e.time).slice(0, 10));
      const [lo, hi] = isW2 ? ELLIOTT3.w2Retrace : ELLIOTT3.w4Retrace;
      const i = ti >= 0 ? ti : t;
      const e1 = isW2 ? R.ema50[i] : R.ema21[i], e2 = isW2 ? R.ema100[i] : R.ema50[i], at = R.atr[i];
      const band: [number, number] | null = [e1, e2, at].every(Number.isFinite) ? [Math.min(e1, e2) - ELLIOTT3.bandAtr * at, Math.max(e1, e2) + ELLIOTT3.bandAtr * at] : null;
      waveEnd = {
        wave: isW2 ? "2" : "4", price: r2(e.price), date: ti >= 0 ? daily[ti].date : null, retrace: retrace == null ? null : r2(retrace),
        inFibZone: retrace == null ? null : retrace >= lo && retrace <= hi,
        inEmaBand: band ? e.price >= band[0] && e.price <= band[1] : null,
        band: band ? [r2(band[0]), r2(band[1])] : null, bandName: isW2 ? "EMA50–EMA100" : "EMA21–EMA50",
      };
    }
  }
  const confluence = waveEnd && waveEnd.inFibZone && waveEnd.inEmaBand ? "strong" : waveEnd && (waveEnd.inFibZone || waveEnd.inEmaBand) ? "partial" : "none";
  const nested3 = day?.template === "wave3" && week?.template === "wave3" && day.dir === week.dir ? day.dir : null;
  const relation: Elliott3["relation"] = !day?.dir || !week?.dir ? "unclear"
    : day.dir === week.dir ? "aligned" : week.template === "wave3" || week.template === "wave5" ? "pullback" : "counter";
  const relationText = relation === "aligned" ? `Ngày và Tuần cùng chiều ${day!.dir === "up" ? "tăng" : "giảm"}`
    : relation === "pullback" ? "Ngày đang điều chỉnh ngược chiều sóng đẩy của Tuần"
    : relation === "counter" ? "Ngày ngược chiều Tuần" : "Chưa đủ kịch bản ở một trong hai khung";
  const inv = sc ? { price: r2(sc.invalidation.price), side: (sc.dir > 0 ? "below" : "above") as "below" | "above", reason: sc.invalidation.text } : null;
  const pl = a.D.dow.protectedLow[t], at = R.atr[t];
  const stopAgreement = inv && inv.side === "below" && Number.isFinite(pl) && at > 0 ? { elliott: inv.price, dow: r2(pl), gapAtr: r2((pl - inv.price) / at) } : null;
  return {
    day, week, relation, relationText, nested3, waveEnd, confluence,
    trigger: sc ? { price: r2(sc.trigger.price), text: sc.trigger.text } : null,
    invalidation: inv, stopAgreement,
    targets: (sc?.targets ?? []).slice(0, 3).map((x) => ({ label: x.label, price: r2(x.price) })),
  };
}
