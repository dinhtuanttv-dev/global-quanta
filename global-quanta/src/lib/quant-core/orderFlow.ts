// @gq/quant-core · Order Flow Engine (TA_VNINDEX_UPGRADE_SPEC §2.2.3).
//   Nguồn dòng lệnh: (1) TICK — Lee–Ready của Gateway theo phút (market_tick_flow); (2) BVC — Bulk Volume Classification
//   (Easley–López de Prado–O'Hara 2012) cho phiên CHƯA có tick: V_mua = V·Φ(ΔP/σ), σ = EWMA độ lệch ΔP các nến TRƯỚC.
//   Cả hai đều là SUY LUẬN (INFERRED) — sàn không công bố bên chủ động. Mọi chỉ báo chỉ dùng dữ liệu ≤ nến hiện tại.

import { logVolumes, tickSize, trailingZ, type Bar, type Dir } from "./math";
import type { Pivot } from "./structure";

export interface FlowMinute { date: string; minute: number; buy: number; sell: number; unknown: number; auction: number; large: number }
export type FlowSource = "TICK" | "BVC";
export interface FlowBar { date: string; buy: number; sell: number; delta: number; cvd: number; large: number; source: FlowSource }
export interface AbsorptionEvent { index: number; date: string; dir: Dir; zV: number; confirmedIndex: number }
export interface DivergenceEvent { index: number; date: string; dir: Dir; pivotIndex: number; confirmedIndex: number }
export interface VpinResult { series: (number | null)[]; latest: number | null; percentile: number | null; bucketVolume: number }

const EWMA_LAMBDA = 0.94;

/** Hàm phân phối chuẩn Φ (xấp xỉ Abramowitz–Stegun 7.1.26, sai số < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const isIso = (d: string) => d.length > 10;
const minuteOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/**
 * Gán dòng lệnh vào nến khung hiện tại (intraday: theo [giờ bắt đầu nến, giờ bắt đầu nến kế) trong cùng phiên;
 * D/W/M: theo ngày/tuần/tháng của nến). Phiên không có tick -> BVC. CVD reset mỗi phiên (intraday) / cộng dồn (D/W/M).
 */
export function buildFlowBars(bars: (Bar & { auction?: string })[], minutes: FlowMinute[]): FlowBar[] {
  const tickSessions = new Set(minutes.map((m) => m.date));
  const intraday = bars.length > 0 && isIso(bars[0].date);
  const sums = new Array(bars.length).fill(null).map(() => ({ buy: 0, sell: 0, large: 0, has: false }));
  // Chỉ số nến theo phiên (intraday) hoặc theo kỳ (D/W/M: nến cuối có date ≤ ngày của phút).
  if (intraday) {
    const byDay = new Map<string, { start: number; i: number }[]>();
    bars.forEach((b, i) => {
      const day = b.date.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push({ start: minuteOf(b.date), i });
    });
    for (const m of minutes) {
      const list = byDay.get(m.date);
      if (!list) continue;
      let k = 0;
      while (k + 1 < list.length && list[k + 1].start <= m.minute) k++;
      const s = sums[list[k].i];
      s.buy += m.buy; s.sell += m.sell; s.large += m.large; s.has = true;
    }
  } else {
    let j = 0;
    const sorted = [...minutes].sort((a, b) => a.date.localeCompare(b.date));
    for (const m of sorted) {
      while (j + 1 < bars.length && bars[j + 1].date <= m.date) j++;
      if (bars[j].date > m.date) continue;
      const s = sums[j];
      s.buy += m.buy; s.sell += m.sell; s.large += m.large; s.has = true;
    }
  }

  const out: FlowBar[] = [];
  let variance: number | null = null;
  let cvd = 0;
  let session = "";
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const day = b.date.slice(0, 10);
    if (intraday && day !== session) { cvd = 0; session = day; }
    const dp = i > 0 ? b.close - bars[i - 1].close : 0;
    const sigma = variance !== null ? Math.sqrt(variance) : null;
    let buy: number;
    let sell: number;
    let source: FlowSource;
    const periodHasTick = intraday ? tickSessions.has(day) : sums[i].has;
    if (periodHasTick) {
      ({ buy, sell } = sums[i]);
      source = "TICK";
    } else {
      const vol = b.auction ? 0 : b.volume; // nến khớp định kỳ không có bên chủ động
      const p = sigma && sigma > 0 ? normCdf(dp / sigma) : 0.5;
      buy = vol * p;
      sell = vol - buy;
      source = "BVC";
    }
    // σ cập nhật SAU khi dùng (point-in-time).
    if (i > 0) variance = variance === null ? dp * dp : EWMA_LAMBDA * variance + (1 - EWMA_LAMBDA) * dp * dp;
    const delta = buy - sell;
    cvd += delta;
    out.push({ date: b.date, buy, sell, delta, cvd, large: sums[i].large, source });
  }
  return out;
}

/** Absorption: effort lớn (zV ≥ 2) nhưng giá gần như không đi (|ΔP| ≤ 1 bước giá) trong 2 nến liên tiếp. */
export function detectAbsorption(bars: Bar[], flow: FlowBar[], { isIndex = false, zMin = 2 } = {}): AbsorptionEvent[] {
  const lv = logVolumes(bars);
  const out: AbsorptionEvent[] = [];
  let prevHit = false;
  for (let i = 1; i < bars.length; i++) {
    const z = trailingZ(lv, i, 30);
    const flat = Math.abs(bars[i].close - bars[i - 1].close) <= tickSize(bars[i].close, isIndex) + 1e-9;
    const hit = z !== null && z >= zMin && flat;
    if (hit && prevHit) {
      const d = flow[i].delta + flow[i - 1].delta;
      out.push({ index: i, date: bars[i].date, dir: d < 0 ? "bullish" : "bearish", zV: Math.round(z! * 100) / 100, confirmedIndex: i });
      prevHit = false; // không đếm chồng
      continue;
    }
    prevHit = hit;
  }
  return out;
}

/** CVD divergence trên pivot ĐÃ xác nhận: giá đỉnh cao hơn nhưng CVD thấp hơn -> ▼; đáy thấp hơn nhưng CVD cao hơn -> ▲. */
export function detectCvdDivergence(pivots: Pivot[], flow: FlowBar[]): DivergenceEvent[] {
  const out: DivergenceEvent[] = [];
  const last: { high?: Pivot; low?: Pivot } = {};
  for (const p of [...pivots].sort((a, b) => a.confirmedIndex - b.confirmedIndex)) {
    const prev = p.kind === "high" ? last.high : last.low;
    if (prev && flow[p.index] && flow[prev.index]) {
      const sameSession = flow[p.index].date.slice(0, 10) === flow[prev.index].date.slice(0, 10) || flow[p.index].date.length <= 10;
      if (sameSession) {
        if (p.kind === "high" && p.price > prev.price && flow[p.index].cvd < flow[prev.index].cvd) {
          out.push({ index: p.index, date: p.date, dir: "bearish", pivotIndex: prev.index, confirmedIndex: p.confirmedIndex });
        }
        if (p.kind === "low" && p.price < prev.price && flow[p.index].cvd > flow[prev.index].cvd) {
          out.push({ index: p.index, date: p.date, dir: "bullish", pivotIndex: prev.index, confirmedIndex: p.confirmedIndex });
        }
      }
    }
    if (p.kind === "high") last.high = p; else last.low = p;
  }
  return out;
}

/**
 * VPIN (Easley–López de Prado–O'Hara): rổ khối lượng cố định V_b, cửa sổ n rổ; VPIN = Σ|V_mua − V_bán| / (n·V_b).
 * V_b mặc định = KL trung bình mỗi phiên / 50. Giá trị gán cho nến làm đầy rổ; percentile so với lịch sử trong cửa sổ.
 */
export function computeVpin(bars: Bar[], flow: FlowBar[], { sessions = 1, buckets = 50, window = 50 } = {}): VpinResult {
  const total = bars.reduce((s, b) => s + b.volume, 0);
  const bucketVolume = total / Math.max(1, sessions) / buckets;
  const series: (number | null)[] = new Array(bars.length).fill(null);
  if (!(bucketVolume > 0)) return { series, latest: null, percentile: null, bucketVolume: 0 };
  const imbalances: number[] = [];
  let fillB = 0;
  let fillS = 0;
  for (let i = 0; i < bars.length; i++) {
    const v = flow[i].buy + flow[i].sell;
    if (!(v > 0)) { series[i] = i > 0 ? series[i - 1] : null; continue; }
    let rb = flow[i].buy;
    let rs = flow[i].sell;
    while (rb + rs > 1e-9) {
      const room = bucketVolume - (fillB + fillS);
      const take = Math.min(room, rb + rs);
      const fb = (rb / (rb + rs)) * take;
      fillB += fb; fillS += take - fb; rb -= fb; rs -= take - fb;
      if (fillB + fillS >= bucketVolume - 1e-9) { imbalances.push(Math.abs(fillB - fillS)); fillB = 0; fillS = 0; }
    }
    if (imbalances.length >= window) {
      const w = imbalances.slice(-window);
      series[i] = w.reduce((s, x) => s + x, 0) / (window * bucketVolume);
    } else series[i] = i > 0 ? series[i - 1] : null;
  }
  const vals = series.filter((x): x is number => x !== null);
  const latest = vals.length ? vals[vals.length - 1] : null;
  const percentile = latest !== null && vals.length > 1 ? Math.round((vals.filter((x) => x <= latest).length / vals.length) * 100) : null;
  return { series, latest: latest !== null ? Math.round(latest * 1000) / 1000 : null, percentile, bucketVolume };
}
