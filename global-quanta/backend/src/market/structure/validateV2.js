// MTF v2 — kiểm định ĐẶT TRƯỚC (MTF-v2-prereg.md): engine bám đúng tài liệu gốc, cùng dữ liệu / tập mã / lợi suất / KTC như v1.
//   V1 L khung 1 giờ · V2 L khung 1 giờ có cổng R:R ≥ 1 · V3 L khung ngày · V4 vào giai đoạn B (tái tích lũy) · V5 S khung ngày
//   BH-FDR q = 0,10 trên 5 p OOS. Mô tả: placebo, bảng giai đoạn có KTC, cờ quá đà, mẫu đáy theo vị trí, L theo bối cảnh ngày,
//   H1/H5 của v1 trên engine v2, M / Q / T3 chạy lại nguyên quy trình v1. Hàm thuần, không gọi SSI, không ghi DB.
import * as Q from "../vendor/quantCore.mjs";
import { benchmark, bhQ } from "../strategies/pring/validate.js";
import {
  MTF_PREREG, dailyEvents, dedupBy, excess, placebo, prepareIndex, prepareSymbol, runCqr, runHmm, runMeta, seg, splitStats, verdictMean,
} from "./validate.js";
import { rng } from "./ml.js";

export const MTF_V2_PREREG = Object.freeze({
  ...MTF_PREREG,
  version: "structure/MTF-v2-prereg-2026-10-24",
  hypotheses: ["V1", "V2", "V3", "V4", "V5"],
});
const P = MTF_V2_PREREG;
const STAGES = ["A", "UP", "B", "C", "D", "DOWN", "Bp", "RANGE"];
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

/** Sự kiện khung ngày v2: L (V3), vào B (V4), S (V5) + mẫu đáy phá cổ theo vị trí (mô tả). */
export function dailyEventsV2(u) {
  const { a, elig, bars } = u, out = [];
  const lastT = bars.length - 1 - P.endBuffer;
  for (const sg of a.signals) {
    const t = sg.index;
    if (t > lastT || !elig[t]) continue;
    if (sg.code === "L") out.push({ symbol: u.symbol, t, date: bars[t].date, kind: "V3" });
    if (sg.code === "S") out.push({ symbol: u.symbol, t, date: bars[t].date, kind: "V5" });
  }
  for (let t = 1; t <= lastT; t++) {
    if (elig[t] && a.stage[t] === "B" && a.stage[t - 1] !== "B") out.push({ symbol: u.symbol, t, date: bars[t].date, kind: "V4" });
  }
  for (const pt of a.patterns) {
    if (pt.dir !== 1 || pt.breakIndex == null) continue;
    const t = pt.breakIndex;
    if (t > lastT || !elig[t]) continue;
    out.push({ symbol: u.symbol, t, date: bars[t].date, kind: pt.context === "reaccum" ? "PAT_REACCUM" : "PAT_REVERSAL" });
  }
  return out;
}

/** Sự kiện khung 1 giờ: mọi tín hiệu L (V1) và L có R:R ≥ 1 tại nến tín hiệu (V2); kèm giai đoạn ngày đã đóng (mô tả). */
export function h1EventsV2(u, h1Bars) {
  const h = Q.analyzeStructureTf(h1Bars, "H1");
  const dmap = Q.closedHtfIndex(h1Bars, u.bars, false);
  const out = [];
  for (const sg of h.signals) {
    const t = sg.index;
    if (sg.code !== "L" || t + 1 >= h1Bars.length) continue;
    const day = h1Bars[t].date.slice(0, 10), di = u.dayIdx.get(day);
    if (di == null || di + P.h2Hold >= u.bars.length || !u.elig[di] || day < P.h1IsFrom) continue;
    const j = dmap[t];
    const rr = Q.structureRrNowAt(h1Bars, h, h.swings.small, h.swings.large, t);
    const base = { symbol: u.symbol, t: di, h1t: t, date: day, di, entry: h1Bars[t + 1].open, dayStage: j >= 0 ? u.a.stage[j] : null, rr: rr ? r3(rr.rr) : null };
    out.push({ ...base, kind: "V1" });
    if (rr?.ok) out.push({ ...base, kind: "V2" });
  }
  return { events: out, pool: h1Bars.map((b, t) => ({ day: b.date.slice(0, 10), entry: h1Bars[t + 1]?.open })).filter((x) => x.entry > 0) };
}

export function runStructureValidationV2({ daily, h1 = {}, onProgress = () => {} }) {
  const t0 = Date.now();
  const vni = prepareIndex(daily.VNINDEX);
  const syms = Object.keys(daily).filter((s) => s !== "VNINDEX" && daily[s].length >= 300);
  const uni = [];
  for (const s of syms) { uni.push(prepareSymbol(s, daily[s], vni)); onProgress(`chuẩn bị ${uni.length}/${syms.length}`); }
  const uniBy = new Map(uni.map((u) => [u.symbol, u]));
  const bench = Object.fromEntries([5, 10, 20, 40].map((h) => [h, benchmark(uni, h)]));

  // ---- V3 / V4 / V5 + mẫu đáy theo vị trí (khung ngày)
  let evs = [];
  for (const u of uni) evs.push(...dailyEventsV2(u));
  evs = dedupBy(evs, P.dedupBars);
  const withX = (kind, h, fee) => evs.filter((e) => e.kind === kind).map((e) => ({ ...e, seg: seg(e.date), x: excess(uniBy.get(e.symbol), bench, e.t, h, fee) }));
  const V3 = withX("V3", P.horizon, P.feePct), V4 = withX("V4", P.horizon, P.feePct), V5 = withX("V5", P.horizon, 0);
  const v3 = splitStats(V3, 1), v4 = splitStats(V4, 1), v5 = splitStats(V5, -1);

  // ---- V1 / V2 (khung 1 giờ, VN30): vào mở cửa nến 1 giờ kế tiếp, ra đóng cửa ngày thứ 10, trừ TB VN30 cùng kỳ và phí
  onProgress("V1/V2: khung 1 giờ");
  const vn30 = Object.keys(h1).filter((s) => uniBy.has(s));
  const b10 = new Map();
  {
    const acc = new Map();
    for (const s of vn30) {
      const u = uniBy.get(s);
      for (let t = 0; t + P.h2Hold < u.bars.length; t++) {
        if (!u.elig[t]) continue;
        const v = u.bars[t + P.h2Hold].close / u.bars[t].close - 1, d = u.bars[t].date, a = acc.get(d) ?? [0, 0];
        a[0] += v; a[1]++; acc.set(d, a);
      }
    }
    for (const [d, [s, n]] of acc) b10.set(d, s / n);
  }
  const h1x = (u, di, entry) => {
    const b = b10.get(u.bars[di].date);
    return Number.isFinite(b) && entry > 0 ? (u.bars[di + P.h2Hold].close / entry - 1 - b) * 100 - P.feePct : null;
  };
  let hev = [];
  const pools = new Map();
  for (const s of vn30) {
    const { events, pool } = h1EventsV2(uniBy.get(s), h1[s]);
    hev.push(...events); pools.set(s, pool);
    onProgress(`V1 ${s}`);
  }
  hev = dedupBy(hev, P.dedupH2).map((e) => ({ ...e, seg: seg(e.date), x: h1x(uniBy.get(e.symbol), e.di, e.entry) }));
  const hOf = (kind) => hev.filter((e) => e.kind === kind && e.x != null);
  const v1 = splitStats(hOf("V1"), 1), v2 = splitStats(hOf("V2"), 1);
  const h1Placebo = (rows, seed) => {
    const real = mean(rows.map((e) => e.x));
    if (real == null) return null;
    const r = rng(seed), byMonth = new Map();
    for (const [sym, pool] of pools) for (const x of pool) { const k = `${sym}|${x.day.slice(0, 7)}`; if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(x); }
    let hit = 0;
    for (let k = 0; k < P.placeboReps; k++) {
      const xs = [];
      for (const e of rows) {
        const pool = byMonth.get(`${e.symbol}|${e.date.slice(0, 7)}`) ?? [];
        if (!pool.length) continue;
        const pk = pool[Math.floor(r() * pool.length)], u = uniBy.get(e.symbol), di = u.dayIdx.get(pk.day);
        if (di == null || di + P.h2Hold >= u.bars.length || !u.elig[di]) continue;
        const x = h1x(u, di, pk.entry); if (x != null) xs.push(x);
      }
      if ((mean(xs) ?? 0) >= real) hit++;
    }
    return { realMean: r3(real), p: r3(hit / P.placeboReps) };
  };

  // ---- kết luận + BH-FDR
  const raw = { V1: verdictMean(v1, 1), V2: verdictMean(v2, 1), V3: verdictMean(v3, 1), V4: verdictMean(v4, 1), V5: verdictMean(v5, -1) };
  const ps = [v1.OOS.p ?? null, v2.OOS.p ?? null, v3.OOS.p ?? null, v4.OOS.p ?? null, v5.OOS.p ?? null];
  const qs = bhQ(ps);
  const final = Object.fromEntries(Object.entries(raw).map(([k, v], i) => [k, v === "PASS" && qs[i] != null && qs[i] <= P.fdrQ ? "PASS" : v === "PASS" ? "FAIL_FDR" : v]));

  // ---- mô tả
  onProgress("mô tả: placebo, bảng giai đoạn");
  const oos = (rows) => rows.filter((r) => r.seg === "OOS");
  const placebos = {
    V1: h1Placebo(oos(hOf("V1")), 41), V2: h1Placebo(oos(hOf("V2")), 43),
    V3: placebo(oos(V3), uniBy, bench, P.horizon, P.feePct, 1), V4: placebo(oos(V4), uniBy, bench, P.horizon, P.feePct, 1),
    V5: placebo(oos(V5), uniBy, bench, P.horizon, 0, -1),
  };
  const stageTable = {}, extRows = { on: [], off: [] };
  for (const st of STAGES) {
    const rows = [];
    for (const u of uni) {
      const lastT = u.bars.length - 1 - P.endBuffer;
      for (let t = 259; t <= lastT; t++) {
        if (!u.elig[t] || u.a.stage[t] !== st) continue;
        const r = { date: u.bars[t].date, seg: seg(u.bars[t].date), x: excess(u, bench, t, P.horizon, 0) };
        rows.push(r);
        if (st === "UP" || st === "B") (u.a.ext[t] > 0 ? extRows.on : extRows.off).push(r);
      }
    }
    stageTable[st] = splitStats(rows, 1);
  }
  const bySplit = (rows, f) => ({ yes: splitStats(rows.filter(f), 1), no: splitStats(rows.filter((r) => !f(r)), 1) });
  const v1Rows = hOf("V1");
  const descriptive = {
    stageTable,
    ext: { on: splitStats(extRows.on, 1), off: splitStats(extRows.off, 1), note: "Giai đoạn UP / B; lợi suất vượt trội 20 phiên, không trừ phí; cờ quá đà = lệch ≥ 3 ATR trên MA đang lên." },
    patternContext: { reaccum: splitStats(withX("PAT_REACCUM", P.horizon, P.feePct), 1), reversal: splitStats(withX("PAT_REVERSAL", P.horizon, P.feePct), 1) },
    v1ByDayStage: bySplit(v1Rows, (r) => r.dayStage === "UP" || r.dayStage === "B" || r.dayStage === "A"),
    v1RrDistribution: { n: v1Rows.length, ok: v1Rows.filter((r) => r.rr != null && r.rr >= 1).length, median: r3([...v1Rows.map((r) => r.rr).filter((x) => x != null)].sort((a, b) => a - b)[Math.floor(v1Rows.filter((r) => r.rr != null).length / 2)]) },
    extraHorizons: Object.fromEntries(P.extraHorizons.map((h) => [h, { V3: splitStats(withX("V3", h, P.feePct), 1), V4: splitStats(withX("V4", h, P.feePct), 1), V5: splitStats(withX("V5", h, 0), -1) }])),
  };
  // H1 / H5 của v1 trên engine v2 (chỉ mô tả)
  {
    let old = [];
    for (const u of uni) old.push(...dailyEvents(u));
    old = dedupBy(old, P.dedupBars);
    const ox = (kind, fee) => old.filter((e) => e.kind === kind).map((e) => ({ ...e, seg: seg(e.date), x: excess(uniBy.get(e.symbol), bench, e.t, P.horizon, fee) }));
    descriptive.v1HypothesesOnV2 = { H1: splitStats(ox("H1", P.feePct), 1), H5: splitStats(ox("H5", 0), -1) };
    onProgress("M: meta-labeling");
    descriptive.meta = runMeta(old.filter((e) => e.kind === "H1" || e.kind === "H4" || e.kind === "G3"), uniBy);
  }
  onProgress("Q: nón CQR");
  const cqr = runCqr(uni);
  onProgress("T3: HMM");
  const hmm = runHmm(uni);

  return {
    prereg: P, engine: Q.MTF_STRUCTURE_VERSION, generatedAt: new Date().toISOString(), ms: Date.now() - t0,
    universe: { daily: uni.length, h1: vn30.length, from: uni[0]?.bars[0]?.date, to: uni[0]?.bars.at(-1)?.date },
    verdicts: { raw, pValues: ps, qValues: qs, final },
    V1: { ...v1, placebo: placebos.V1 }, V2: { ...v2, placebo: placebos.V2 }, V3: { ...v3, placebo: placebos.V3 },
    V4: { ...v4, placebo: placebos.V4 }, V5: { ...v5, placebo: placebos.V5 },
    descriptive, meta: descriptive.meta, cqr, hmm,
  };
}
