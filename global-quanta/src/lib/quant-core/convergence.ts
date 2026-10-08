// @gq/quant-core · Bộ lọc Hợp lưu v2 (H1) — thay engine cũ (Wyckoff v1 + OB/FVG không xét chiều, Effort 1 nến, dữ liệu Yahoo).
// Chạy trên Gateway (bản đóng gói backend/src/market/vendor/quantCore.mjs) và trong bảng phụ ở trình duyệt -> cùng kết luận.
//
// Điều kiện CỨNG: cấu trúc Wyckoff (engine mặc định v2) ĐANG HOẠT ĐỘNG; cấu trúc lịch sử / chưa xác định -> không vào danh sách.
// Mọi thành phần chỉ được tính khi CÙNG CHIỀU với Wyckoff (phía mua: OB / FVG tăng nằm dưới giá; phía bán: ngược lại).
// Trọng số là giá trị khởi điểm đặt TRƯỚC kiểm định (không tinh chỉnh theo kết quả). Không phải xác suất.
import { atrSeries, type Bar } from "./math";
import { computeStructure } from "./structure";
import { computeDealingRange, detectFVG, detectOrderBlocks, type FairValueGapZone, type OrderBlockZone } from "./zones";
import { detectVsa, type VsaSignal } from "./vsa";
import { buildVolumeProfile } from "./volumeProfile";
import { anchoredVwap } from "./vwap";
import { wyckoffFor, WYCKOFF_DEFAULT_ENGINE } from "./index";
import type { WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";

export const CONVERGENCE_VERSION = "convergence-v2/H1";

export const CONVERGENCE = {
  /** Trọng số (tổng 100) — đặt trước kiểm định. */
  weights: { wyckoff: 30, zone: 25, effort: 15, rs: 10, tests: 10, liquidity: 10 },
  gradeA: 70, gradeB: 50,
  /** Gom mức giá trong ±1,5% (như hợp lưu tay cầm của CAN SLIM). */
  clusterTol: 0.015,
  /** Cụm hợp lưu phải nằm trong 1,5 ATR quanh giá (phía mua: dưới hoặc tại giá). */
  zoneATR: 1.5,
  effortBars: 20,
  /** Sức chứa mỗi lệnh = 15% GTGD TB20: ≥ 5 tỷ đủ điểm, ≥ 2 tỷ nửa điểm. */
  liquidityPct: 0.15, liquidityFull: 5e9, liquidityHalf: 2e9,
  /** Tín hiệu kế hoạch 3 lần trong ≤ 5 nến -> trạng thái READY. */
  freshBars: 5,
} as const;

export interface ConvergenceComponent { key: string; label: string; max: number; points: number; ok: boolean; value: string }
export interface ConvergenceLevel { kind: "wyckoff" | "ob" | "fvg" | "poc" | "avwap"; label: string; price: number; weight: number }
export interface ConvergenceZone { price: number; low: number; high: number; weight: number; sources: string[]; kinds: string[]; distancePct: number }
export interface ConvergenceResultV2 {
  version: string;
  side: "buy" | "sell";
  status: "READY" | "WATCH";
  score: number;
  grade: "A" | "B" | "C";
  components: ConvergenceComponent[];
  zone: ConvergenceZone | null;
  levels: ConvergenceLevel[];
  wyckoff: {
    engine: string; phase: string; wyckoffPhase: string | null; kind: string | null; cyclePhase: string | null;
    rangeHigh: number | null; rangeLow: number | null; rangeStartDate: string | null; rangeEndDate: string | null;
    testsPassed: number | null; testsAvail: number | null;
    tranche: { n: number; status: string; date: string | null } | null;
    signals: { key: string; knownDate: string; fresh: boolean; adverse: boolean }[];
  };
  liquidity: { avgValue20: number; capacity: { pct: number; value: number }[] };
  dataAsOf: string;
  close: number;
}

const BULL_VSA = new Set(["Selling Climax", "Stopping Volume", "Shakeout", "No Supply"]);
const BEAR_VSA = new Set(["Buying Climax", "Upthrust", "No Demand"]);

/** Gom mức giá gần nhau (±tol): giá trung bình theo trọng số, nguồn, khoảng. */
export function clusterLevels(levels: ConvergenceLevel[], tol: number = CONVERGENCE.clusterTol) {
  const sorted = levels.filter((x) => Number.isFinite(x.price) && x.price > 0).sort((a, b) => a.price - b.price);
  const out: { price: number; weight: number; low: number; high: number; sources: string[]; kinds: Set<string> }[] = [];
  for (const x of sorted) {
    const cl = out[out.length - 1];
    if (cl && Math.abs(x.price - cl.price) <= tol * x.price) {
      cl.price = (cl.price * cl.weight + x.price * x.weight) / (cl.weight + x.weight);
      cl.weight += x.weight; cl.low = Math.min(cl.low, x.price); cl.high = Math.max(cl.high, x.price); cl.sources.push(x.label); cl.kinds.add(x.kind);
    } else out.push({ price: x.price, weight: x.weight, low: x.price, high: x.price, sources: [x.label], kinds: new Set([x.kind]) });
  }
  return out;
}

const isBuyPhase = (w: WyckoffResult) => w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";

/** Đánh giá Hợp lưu v2 tại nến cuối của `bars` (chỉ dùng dữ liệu ≤ nến cuối). null = không có cấu trúc Wyckoff đang hoạt động. */
export function convergenceAt(bars: Bar[], benchmark?: Bar[] | null, opts: { avgValue20?: number } = {}): ConvergenceResultV2 | null {
  if (bars.length < 60) return null;
  const w = wyckoffFor(bars, WYCKOFF_DEFAULT_ENGINE, "D", false, benchmark ?? null);
  if (w.status !== "active" || w.phase === "undetermined") return null;
  const buy = isBuyPhase(w);
  const side: "buy" | "sell" = buy ? "buy" : "sell";
  const dir = buy ? "bullish" : "bearish";
  const last = bars.length - 1;
  const close = bars[last].close;
  const atr = atrSeries(bars, 14);
  const a = atr[last] || close * 0.02;
  const W = CONVERGENCE.weights;
  const comp: ConvergenceComponent[] = [];
  const add = (key: string, label: string, max: number, frac: number, value: string) =>
    comp.push({ key, label, max, points: Math.round(max * Math.max(0, Math.min(1, frac)) * 10) / 10, ok: frac >= 0.5, value });

  // ---- W: trạng thái Wyckoff (pha theo dòng thời gian A–E, sự kiện đã xác nhận) ----
  const cur = w.phases?.find((x) => x.current)?.phase ?? null;
  const spring = w.evidence?.springs.filter((x) => x.side === (buy ? "spring" : "ut")).pop() ?? null;
  const wFrac = buy
    ? cur === "D" ? 0.9 : cur === "E" ? 0.7 : cur === "C" ? (spring?.actionable ? 1 : 0.6) : 0.3
    : cur === "D" || cur === "E" ? 1 : cur === "C" ? (spring?.actionable ? 0.8 : 0.6) : 0.3;
  add("wyckoff", "Wyckoff đang hoạt động (pha A–E)", W.wyckoff, wFrac,
    `${buy ? "Tích luỹ" : "Phân phối"} · Phase ${cur ?? w.wyckoffPhase ?? "?"}${spring ? ` · ${spring.side === "spring" ? "Spring" : "UT"} #${spring.kind}${spring.actionable ? " đủ điều kiện" : " chờ Test"}` : ""}`);

  // ---- Z: hợp lưu vùng giá CÙNG CHIỀU ----
  const st = computeStructure(bars);
  const obs: OrderBlockZone[] = detectOrderBlocks(bars, st.events, st.atr).filter((z) => z.dir === dir && z.status === "ACTIVE");
  const fvgs: FairValueGapZone[] = detectFVG(bars, st.atr, { limitPct: 0.07 }).filter((g) => g.dir === dir && (g.state === "OPEN" || g.state === "PARTIAL"));
  const levels: ConvergenceLevel[] = [];
  const lv = (kind: ConvergenceLevel["kind"], label: string, price: number | null | undefined, weight: number) => { if (price != null && Number.isFinite(price)) levels.push({ kind, label, price, weight }); };
  if (buy) {
    lv("wyckoff", "Hỗ trợ range Wyckoff", w.rangeLow, 1);
    const creek = w.evidence?.creek?.points; if (creek?.length) lv("wyckoff", "Creek", creek[creek.length - 1].price, 0.8);
    const lps = w.events.filter((e) => e.event === "LPS").pop(); if (lps) lv("wyckoff", "LPS", lps.price, 1);
    if (spring) lv("wyckoff", "Đáy Spring", spring.price, 0.8);
  } else {
    lv("wyckoff", "Kháng cự range Wyckoff", w.rangeHigh, 1);
    const ice = w.evidence?.ice?.points; if (ice?.length) lv("wyckoff", "ICE", ice[ice.length - 1].price, 0.8);
    const lpsy = w.events.filter((e) => e.event === "LPSY").pop(); if (lpsy) lv("wyckoff", "LPSY", lpsy.price, 1);
    if (spring) lv("wyckoff", "Đỉnh UT", spring.price, 0.8);
  }
  for (const z of obs.slice(-3)) lv("ob", `OB ${buy ? "tăng" : "giảm"} ${z.date}`, (z.top + z.bottom) / 2, 1);
  for (const g of fvgs.slice(-3)) lv("fvg", `FVG ${buy ? "tăng" : "giảm"} ${g.endDate}`, (g.top + g.bottom) / 2, 0.8);
  const vp = buildVolumeProfile(bars.slice(-60), { method: "triangular" });
  if (vp) lv("poc", "POC 60 phiên", vp.poc, 0.7);
  const dr = computeDealingRange(bars, st.pivots);
  if (dr) {
    const anchor = dr.highIndex < dr.lowIndex ? dr.highIndex : dr.lowIndex;
    const pts = anchoredVwap(bars, anchor);
    const lastV = pts[pts.length - 1];
    if (lastV) lv("avwap", "AVWAP swing", lastV.vwap, 0.7);
  }
  const clusters = clusterLevels(levels).filter((c) => (buy ? c.price <= close + 0.25 * a : c.price >= close - 0.25 * a) && Math.abs(close - c.price) <= CONVERGENCE.zoneATR * a);
  const best = clusters.sort((x, y) => y.kinds.size - x.kinds.size || y.weight - x.weight)[0] ?? null;
  const zone: ConvergenceZone | null = best ? {
    price: best.price, low: best.low, high: best.high, weight: Math.round(best.weight * 100) / 100, sources: best.sources, kinds: [...best.kinds],
    distancePct: (close / best.price - 1) * 100,
  } : null;
  add("zone", "Hợp lưu vùng giá cùng chiều (Wyckoff ∩ OB ∩ FVG ∩ POC ∩ AVWAP)", W.zone, zone ? (zone.kinds.length - 1) / 3 + (zone.kinds.includes("wyckoff") ? 0.15 : 0) : 0,
    zone ? `${zone.kinds.length} loại mức · ${Math.round(zone.low).toLocaleString("vi-VN")}–${Math.round(zone.high).toLocaleString("vi-VN")} · cách giá ${zone.distancePct.toFixed(1)}%` : "không có cụm trong 1,5 ATR");

  // ---- E: effort trên cả cấu trúc gần đây (không chỉ nến cuối) ----
  const from = Math.max(0, last - CONVERGENCE.effortBars + 1);
  const vsa: VsaSignal[] = detectVsa(bars).filter((s) => s.confirmedIndex >= from && s.confirmedIndex <= last);
  const good = vsa.filter((s) => (buy ? BULL_VSA : BEAR_VSA).has(s.type)).length;
  const bad = vsa.filter((s) => (buy ? BEAR_VSA : BULL_VSA).has(s.type)).length;
  const act = w.tests?.items.find((x) => x.key === "activity") ?? null;
  add("effort", buy ? "Cung cạn / cầu vào (VSA 20 phiên + KL tăng > KL giảm)" : "Cầu cạn / cung ra (VSA 20 phiên + KL giảm > KL tăng)", W.effort,
    (good > bad ? 0.5 : 0) + (act?.ok === true ? 0.5 : 0),
    `VSA cùng chiều ${good} / ngược chiều ${bad}${act ? ` · ${act.value}` : ""}`);

  // ---- R: sức mạnh so với VN-Index ----
  const rs = w.tests?.rs ?? null;
  add("rs", buy ? "Mạnh hơn VN-Index (20 phiên)" : "Yếu hơn VN-Index (20 phiên)", W.rs, rs ? ((buy ? rs.diffPct > 0 : rs.diffPct < 0) ? 1 : 0) : 0,
    rs ? `mã ${rs.stockPct >= 0 ? "+" : ""}${rs.stockPct.toFixed(1)}% · VN-Index ${rs.indexPct >= 0 ? "+" : ""}${rs.indexPct.toFixed(1)}%` : "chưa có dữ liệu chỉ số");

  // ---- T: 9 phép thử ----
  const t9 = w.tests ?? null;
  add("tests", `9 phép thử ${buy ? "mua" : "bán"}`, W.tests, t9 && t9.avail ? t9.passed / t9.avail : 0, t9 ? `${t9.passed}/${t9.avail} đạt` : "—");

  // ---- L: thanh khoản (sức chứa mỗi lệnh 15% GTGD TB20) ----
  let s = 0, c = 0;
  for (let j = from; j <= last; j++) { const b = bars[j] as Bar & { value?: number }; s += Number(b.value) > 0 ? Number(b.value) : b.close * b.volume; c++; }
  const avgValue20 = opts.avgValue20 ?? (c ? s / c : 0);
  const cap = avgValue20 * CONVERGENCE.liquidityPct;
  add("liquidity", "Sức chứa mỗi lệnh (15% GTGD TB20)", W.liquidity, cap >= CONVERGENCE.liquidityFull ? 1 : cap >= CONVERGENCE.liquidityHalf ? 0.5 : 0, `${(cap / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ đồng`);

  const score = Math.round(comp.reduce((x, y) => x + y.points, 0));
  const grade = score >= CONVERGENCE.gradeA ? "A" : score >= CONVERGENCE.gradeB ? "B" : "C";
  const tr = w.tranches?.tranches.filter((x) => x.status === "done").pop() ?? null;
  const signals = (w.signals ?? []).map((x) => ({ key: x.key, knownDate: x.knownDate, fresh: x.fresh, adverse: x.validation.adverse }));
  const ready = signals.some((x) => x.fresh && /^T[123]$/.test(x.key)) || (w.tranches?.side === "sell" && signals.some((x) => x.fresh));
  return {
    version: CONVERGENCE_VERSION, side, status: ready ? "READY" : "WATCH", score, grade, components: comp, zone, levels,
    wyckoff: {
      engine: w.engine ?? WYCKOFF_DEFAULT_ENGINE, phase: w.phase, wyckoffPhase: w.wyckoffPhase ?? null, kind: w.kind ?? null, cyclePhase: cur,
      rangeHigh: w.rangeHigh, rangeLow: w.rangeLow, rangeStartDate: w.rangeStartDate, rangeEndDate: w.rangeEndDate,
      testsPassed: t9?.passed ?? null, testsAvail: t9?.avail ?? null,
      tranche: tr ? { n: tr.n, status: tr.status, date: tr.date } : null, signals,
    },
    liquidity: { avgValue20: Math.round(avgValue20), capacity: [0.1, 0.15, 0.2].map((pct) => ({ pct, value: Math.round(avgValue20 * pct) })) },
    dataAsOf: bars[last].date, close,
  };
}
