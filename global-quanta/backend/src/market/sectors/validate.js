// Lọc ngành (L3) — kiểm định ĐẶT TRƯỚC sự kiện "ngành ICB cấp 2 chuyển vào góc Cải thiện" (người dùng duyệt 2026-10-10).
//   Sự kiện: tuần đã đóng mà góc phần tư ĐÃ LỌC NHIỄU chuyển vào IMPROVING (RRG tuần JdK, sector-rrg/L1).
//   Đo: lợi suất vượt trội của chỉ số ngành so VN-Index từ đóng cửa phiên ĐẦU TIÊN SAU tuần sự kiện tới h phiên sau đó
//       (h chính = 20), gộp mọi ngành. Không phí (mức chỉ số).
//   Ngoài mẫu (OOS): ~30% thời gian cuối của dải ngày sự kiện. KTC 95%: bootstrap theo cụm TUẦN sự kiện.
//   ĐẠT khi OOS n ≥ 30, TB > 0, cận dưới KTC > 0, và TB trong mẫu > 0. Không đạt -> EXPERIMENTAL.
//   Mô tả thêm (không đổi kết luận): placebo (tuần ngẫu nhiên cùng ngành), lọc nhiễu so với góc thô, kỳ hạn 10/40/60.
// Hàm thuần — dữ liệu đọc từ Gateway (/api/market/sectors/:code/history, VN-Index) bằng scripts/sector-validate.mjs.

export const SECTOR_PREREG = Object.freeze({
  version: "locnganh/L3-prereg-2026-10-10", horizon: 20, extraHorizons: [10, 40, 60], oosFraction: 0.3, minOosN: 30,
  bootstrapIters: 2000, placeboReps: 500, level: 2,
});
const P = SECTOR_PREREG;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** Sự kiện chuyển vào IMPROVING theo trường góc `field` ("quadrant" đã lọc nhiễu | "quadrantRaw"), chỉ tuần ≤ closedThrough. */
export function improvingEvents(rrg, closedThrough, field = "quadrant") {
  const rows = rrg.filter((r) => !closedThrough || r.week <= closedThrough), out = [];
  for (let i = 1; i < rows.length; i++) if (rows[i][field] === "IMPROVING" && rows[i - 1][field] !== "IMPROVING") out.push({ week: rows[i].week, date: rows[i].date });
  return out;
}

/** Lợi suất vượt trội (%) từ đóng cửa phiên đầu tiên SAU `date` tới h phiên sau đó (null nếu thiếu dữ liệu). */
export function excessAfter(date, h, sectorByDate, benchDates, benchByDate) {
  const k = benchDates.findIndex((d) => d > date);
  if (k < 0 || k + h >= benchDates.length) return null;
  const d0 = benchDates[k], d1 = benchDates[k + h];
  const s0 = sectorByDate.get(d0), s1 = sectorByDate.get(d1), b0 = benchByDate.get(d0), b1 = benchByDate.get(d1);
  if (!(s0 > 0 && s1 > 0 && b0 > 0 && b1 > 0)) return null;
  return ((s1 / s0) - (b1 / b0)) * 100;
}

/** Thống kê + KTC bootstrap theo cụm tuần sự kiện. */
export function stat(rows, iters = P.bootstrapIters, seed = 7) {
  const xs = rows.map((r) => r.x);
  if (!xs.length) return { n: 0 };
  const by = new Map(); for (const r of rows) { if (!by.has(r.week)) by.set(r.week, []); by.get(r.week).push(r.x); }
  const cl = [...by.values()], rand = rng(seed), ms = [];
  if (xs.length >= 5) for (let b = 0; b < iters; b++) { let s = 0, n = 0; for (let c = 0; c < cl.length; c++) for (const v of cl[Math.floor(rand() * cl.length)]) { s += v; n++; } ms.push(s / n); }
  ms.sort((a, b) => a - b);
  return { n: xs.length, weeks: cl.length, mean: r2(mean(xs)), hit: r2((xs.filter((v) => v > 0).length / xs.length) * 100),
    ci: ms.length ? [r2(ms[Math.floor(0.025 * ms.length)]), r2(ms[Math.floor(0.975 * ms.length)])] : null };
}

export function verdict(isS, oosS) {
  if ((oosS.n ?? 0) < P.minOosN) return { verdict: "INSUFFICIENT", reason: `OOS n = ${oosS.n ?? 0} < ${P.minOosN}` };
  return { verdict: oosS.mean > 0 && oosS.ci && oosS.ci[0] > 0 && isS.mean > 0 ? "PASS" : "FAIL" };
}

/**
 * @param sectors [{ code, name, level, rrg, index: [date, close, n][] }]
 * @param bench   [{ date, close }] VN-Index
 * @param closedThrough tuần đã đóng gần nhất
 */
export function runSectorValidation(sectors, bench, closedThrough) {
  const benchDates = bench.map((b) => b.date), benchByDate = new Map(bench.map((b) => [b.date, b.close]));
  const L = sectors.filter((s) => s.level === P.level);
  const collect = (field, h) => {
    const rows = [];
    for (const s of L) {
      const sb = new Map(s.index.map(([d, c]) => [d, c]));
      for (const e of improvingEvents(s.rrg, closedThrough, field)) { const x = excessAfter(e.date, h, sb, benchDates, benchByDate); if (x != null) rows.push({ code: s.code, week: e.week, date: e.date, x }); }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  };
  const main = collect("quadrant", P.horizon);
  if (!main.length) return { prereg: P, label: "EXPERIMENTAL", verdict: "INSUFFICIENT", reason: "không có sự kiện" };
  // mốc OOS: 30% cuối dải ngày sự kiện (theo lịch)
  const t0 = Date.parse(main[0].date), t1 = Date.parse(main.at(-1).date);
  const oosFrom = new Date(t0 + (1 - P.oosFraction) * (t1 - t0)).toISOString().slice(0, 10);
  const split = (rows) => ({ is: rows.filter((r) => r.date < oosFrom), oos: rows.filter((r) => r.date >= oosFrom) });
  const sp = split(main), isS = stat(sp.is), oosS = stat(sp.oos), v = verdict(isS, oosS);
  // placebo: mỗi sự kiện thay bằng một tuần đã đóng ngẫu nhiên của CÙNG ngành (cùng giai đoạn IS/OOS), cùng cách đo
  const placebo = (rows, reps = P.placeboReps, seed = 23) => {
    if (rows.length < 5) return null;
    const rand = rng(seed), obs = mean(rows.map((r) => r.x)), pools = new Map();
    for (const s of L) {
      const sb = new Map(s.index.map(([d, c]) => [d, c]));
      const wk = s.rrg.filter((r) => !closedThrough || r.week <= closedThrough).map((r) => ({ week: r.week, date: r.date, x: excessAfter(r.date, P.horizon, sb, benchDates, benchByDate) })).filter((r) => r.x != null);
      pools.set(s.code, wk);
    }
    let ge = 0; const ms = [];
    for (let k = 0; k < reps; k++) {
      const xs = [];
      for (const r of rows) { const pool = pools.get(r.code).filter((w) => (r.date < oosFrom) === (w.date < oosFrom)); if (pool.length) xs.push(pool[Math.floor(rand() * pool.length)].x); }
      const m = mean(xs); ms.push(m); if (m >= obs) ge++;
    }
    ms.sort((a, b) => a - b);
    return { observed: r2(obs), placeboMean: r2(mean(ms)), placebo95: [r2(ms[Math.floor(0.025 * reps)]), r2(ms[Math.floor(0.975 * reps)])], p: Math.round((ge / reps) * 1000) / 1000 };
  };
  const raw = collect("quadrantRaw", P.horizon), spr = split(raw);
  return {
    prereg: P, ranAt: new Date().toISOString(), oosFrom,
    period: { from: main[0].date, to: main.at(-1).date, sectors: L.length },
    label: v.verdict === "PASS" ? "VALIDATED" : "EXPERIMENTAL",
    main: { is: isS, oos: oosS, ...v },
    descriptive: {
      placebo: { all: placebo(main), oos: placebo(sp.oos) },
      rawQuadrant: { is: stat(spr.is), oos: stat(spr.oos), eventsRaw: raw.length, eventsFiltered: main.length },
      horizons: Object.fromEntries(P.extraHorizons.map((h) => { const s2 = split(collect("quadrant", h)); return [h, { is: stat(s2.is), oos: stat(s2.oos) }]; })),
      bySector: Object.fromEntries(L.map((s) => [s.code, { name: s.name, ...stat(main.filter((r) => r.code === s.code), 500) }])),
    },
  };
}
