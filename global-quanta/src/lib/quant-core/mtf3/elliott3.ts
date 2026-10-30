// @gq/quant-core · MTF v3 · S3 — hợp lưu Elliott × dải EMA × cấu trúc Dow (K13, K21 trong docs/mtf-v3/01_SOURCE_SYNTHESIS.md).
// Dùng NGUYÊN engine Elliott Pro (elliottMtf: bản đếm Ngày + Tuần, quan hệ lồng khung) — không viết lại quy tắc sóng. Lớp này chỉ
// ghép: (1) sóng 2 / sóng 4 kết thúc có nằm trong dải EMA hay không (Fib 0,382–0,618 ∩ EMA50–EMA100), (2) "bắt sóng 3 của chân trên
// bằng sóng 3 của chân dưới", (3) mục tiêu Fib + mức vô hiệu so với đáy bảo vệ Dow. Chỉ MÔ TẢ tới khi H6 (MTF-v3-prereg) kiểm định.
import type { Bar } from "../math";
import { elliottMtf } from "../elliott/mtf";
import type { ElliottState } from "../elliott";
import type { Analysis3 } from "./frame";

export const ELLIOTT3 = { w2Retrace: [0.382, 0.786] as const, w4Retrace: [0.236, 0.618] as const, bandAtr: 0.5 } as const;

export interface WaveEnd { wave: "2" | "4"; price: number; date: string | null; retrace: number | null; inFibZone: boolean | null; inEmaBand: boolean | null; band: [number, number] | null; bandName: string }
export interface Elliott3 {
  day: { label: string; wave: ElliottState["wave"]; dir: ElliottState["dir"]; degree: string | null; weight: number | null } | null;
  week: { label: string; wave: ElliottState["wave"]; dir: ElliottState["dir"]; partial: boolean } | null;
  relation: string; relationText: string;
  /** Sóng 3 tuần + sóng 3 ngày cùng chiều ("bắt sóng 3 của chân trên bằng sóng 3 của chân dưới"). */
  nested3: "up" | "down" | null;
  /** Kết thúc sóng điều chỉnh gần nhất của bản đếm ngày (sóng 2 hoặc 4) so với Fib và dải EMA. */
  waveEnd: WaveEnd | null;
  confluence: "strong" | "partial" | "none";
  invalidation: { price: number; side: "above" | "below"; reason: string } | null;
  /** Mức vô hiệu Elliott so với đáy bảo vệ Dow khung ngày (cùng phía = hai phương pháp đồng ý điểm sai). */
  stopAgreement: { elliott: number; dow: number; gapAtr: number } | null;
  targets: { label: string; price: number }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function elliott3(daily: Bar[], a: Analysis3): Elliott3 {
  const t = daily.length - 1;
  const em = elliottMtf(daily);
  const d = em.day, w = em.week, R = a.D.r;
  const atr = R.atr[t] > 0 ? R.atr[t] : NaN;
  let waveEnd: WaveEnd | null = null;
  const pat = d?.patterns ?? null;
  const pick = (seg: NonNullable<NonNullable<typeof pat>["wave2"]>, wave: "2" | "4"): WaveEnd | null => {
    if (!seg.points?.length) return null;
    const end = seg.points[seg.points.length - 1];
    // engine Elliott phân tích cửa sổ barCount nến cuối: chỉ số trong cửa sổ -> chỉ số trên chuỗi ngày đầy đủ
    const ti = t - (d!.barCount - 1 - end.i);
    const [lo, hi] = wave === "2" ? ELLIOTT3.w2Retrace : ELLIOTT3.w4Retrace;
    const retrace = Number.isFinite(seg.retrace) ? seg.retrace : null;
    // sóng 2: dải EMA50–EMA100; sóng 4 (nông hơn): dải EMA21–EMA50
    const e1 = wave === "2" ? R.ema50[ti] : R.ema21[ti], e2 = wave === "2" ? R.ema100[ti] : R.ema50[ti], at = R.atr[ti];
    const band: [number, number] | null = [e1, e2, at].every(Number.isFinite) ? [Math.min(e1, e2) - ELLIOTT3.bandAtr * at, Math.max(e1, e2) + ELLIOTT3.bandAtr * at] : null;
    return {
      wave, price: r2(end.price), date: ti >= 0 && ti <= t ? daily[ti].date : end.time ?? null, retrace: retrace == null ? null : r2(retrace),
      inFibZone: retrace == null ? null : retrace >= lo && retrace <= hi,
      inEmaBand: band ? end.price >= band[0] && end.price <= band[1] : null,
      band: band ? [r2(band[0]), r2(band[1])] : null, bandName: wave === "2" ? "EMA50–EMA100" : "EMA21–EMA50",
    };
  };
  if (d && pat) {
    if (d.wave === "3" && pat.wave2) waveEnd = pick(pat.wave2, "2");
    else if ((d.wave === "5" || d.wave === "4") && pat.wave4) waveEnd = pick(pat.wave4, "4");
    else if (pat.wave2) waveEnd = pick(pat.wave2, "2");
  }
  const confluence = waveEnd && waveEnd.inFibZone && waveEnd.inEmaBand ? "strong" : waveEnd && (waveEnd.inFibZone || waveEnd.inEmaBand) ? "partial" : "none";
  const nested3 = d && w && d.wave === "3" && w.wave === "3" && d.dir === w.dir ? d.dir : null;
  const pl = a.D.dow.protectedLow[t];
  const inv = d?.invalidation ?? null;
  const stopAgreement = inv && Number.isFinite(pl) && Number.isFinite(atr) && inv.side === "below" ? { elliott: r2(inv.price), dow: r2(pl), gapAtr: r2((pl - inv.price) / atr) } : null;
  const close = daily[t].close;
  const targets = (d?.levels ?? []).filter((l) => (d?.dir === "down" ? l.price < close : l.price > close)).sort((x, y) => Math.abs(x.price - close) - Math.abs(y.price - close)).slice(0, 3).map((l) => ({ label: l.label, price: r2(l.price) }));
  return {
    day: d ? { label: d.label, wave: d.wave, dir: d.dir, degree: d.degree, weight: d.weight } : null,
    week: w ? { label: w.label, wave: w.wave, dir: w.dir, partial: w.partial } : null,
    relation: em.relation, relationText: em.relationText, nested3: nested3 ?? null, waveEnd, confluence, invalidation: inv, stopAgreement, targets,
  };
}
