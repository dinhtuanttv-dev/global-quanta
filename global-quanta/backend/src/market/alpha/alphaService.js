// Top 20 v2 (T2/T5) — production của mô hình đã chọn ở T3 (M1, cấu hình chốt t3-config.json).
//   Hằng ngày (16:10): chuỗi điều chỉnh cộng dồn cả universe + VNDirect (BCTC, khối ngoại, vốn hoá) -> 18 yếu tố -> chuẩn hoá
//   -> trọng số M1 từ LỊCH SỬ IC (hạt giống T3 + IC thực tế nối thêm hằng ngày) -> Top 20 (≤ 4 mã / ngành) -> KV alpha:top20.
//   Sổ theo dõi (T5): mỗi ngày một bản chụp (điểm + z của mọi mã); đủ 21 phiên -> chấm: IC từng yếu tố (nối vào lịch sử IC),
//   lợi suất vượt VN-Index 20 phiên của Top 20 so universe. Nhãn bằng chứng: ALPHA_VALIDATION (T3 KHÔNG ĐẠT -> EXPERIMENTAL).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { factorRows, FACTORS, K, normalizeRows, prepareAlpha } from "./factors.js";
import { pickTop, spearman } from "./validate.js";
import { ALPHA_VALIDATION } from "./validation.js";
import { fetchVndRecent } from "./vndirectData.js";
import { loadAdjustedUniverse } from "../universeSeries.js";

export const ALPHA_ENGINE = "alpha/M1";
export const ALPHA_KV = { top20: "alpha:top20", vnd: "alpha:vnd", ic: "alpha:ic", snapIndex: "alpha:snap:index", snap: (d) => `alpha:snap:${d}` };
const readJson = (f) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"));
const CONFIG = readJson("./t3-config.json");
const SEED = readJson("./ic-history-seed.json");
const RULES = CONFIG.rules;
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(Math.expm1(x) * 10000) / 100);

/** Trọng số M1 tại ngày lịch ce: IC các ngày đã có kết quả (idx + 21 < ce) trong 756 phiên trước; < 20 ngày -> đều. */
export function liveM1Weights(icHistory, cal, ce) {
  const firstDate = cal.dates[0], todayMs = Date.parse(cal.dates[ce]);
  const lookFrom = ce - RULES.m1.lookback >= 0 ? cal.dates[ce - RULES.m1.lookback] : new Date(todayMs - 1100 * 864e5).toISOString().slice(0, 10);
  const past = icHistory.filter((x) => {
    if (x.date < lookFrom) return false;
    const idx = cal.calOf.get(x.date);
    return idx != null ? idx + 21 < ce : x.date < firstDate;
  }).map((x) => x.ic);
  if (past.length < RULES.m1.minHistory) return { weights: new Array(K).fill(1 / K), days: past.length, ic: null };
  const ic = Array.from({ length: K }, (_, k) => past.reduce((a, v) => a + (v[k] ?? 0), 0) / past.length);
  const s = ic.reduce((a, b) => a + Math.abs(b), 0) || 1;
  return { weights: ic.map((x) => RULES.m1.shrink * (x / s) + (1 - RULES.m1.shrink) * (1 / K)), days: past.length, ic };
}

/** Đầu vào VNDirect (KV) -> Map như kiểm định. */
export function vndMaps(vnd) {
  const fundOf = new Map(Object.entries(vnd?.fund ?? {}));
  const foreignOf = new Map(Object.entries(vnd?.foreign ?? {}).map(([t, rows]) => [t, new Map(rows)]));
  const mcapOf = new Map(Object.entries(vnd?.mcap ?? {}).map(([t, rows]) => [t, [...rows].sort((a, b) => a[0].localeCompare(b[0]))]));
  return { fundOf, foreignOf, mcapOf };
}

/** Dựng Top 20 v2 cho phiên cuối cùng có dữ liệu. Hàm thuần. */
export function buildLiveTop20({ seriesOf, benchBars, sectorOf, vnd, icHistory, sectorNames = new Map(), now = Date.now }) {
  const data = prepareAlpha({ seriesOf, benchBars, sectorOf, ...vndMaps(vnd) });
  const ce = data.cal.dates.length - 1;
  const rows = normalizeRows(factorRows(data, ce, { withOutcomes: false }));
  const { weights, days, ic } = liveM1Weights(icHistory, data.cal, ce);
  for (const r of rows) r.score = r.z.reduce((s, z, k) => s + z * weights[k], 0);
  const top = pickTop(rows, (r) => r.score, { topN: RULES.topN, maxPerSector: RULES.maxPerSector });
  const rankOf = new Map([...rows].sort((a, b) => b.score - a.score).map((r, i) => [r.ticker, i + 1]));
  const detail = (r) => ({
    ticker: r.ticker, sector: r.sector, sectorName: sectorNames.get(r.sector) ?? null, score: r3(r.score), rank: rankOf.get(r.ticker),
    avgValue60: Math.round(r.avgValue60),
    factors: FACTORS.map((f, k) => ({ key: f.key, group: f.group, raw: r4(r.raw[k]), z: r3(r.z[k]), weight: r4(weights[k]), contribution: r4(r.z[k] * weights[k]) })),
    groups: Object.fromEntries(["price", "flow", "fund", "sector"].map((g) => [g, r3(FACTORS.reduce((s, f, k) => (f.group === g ? s + r.z[k] * weights[k] : s), 0))])),
  });
  const doc = {
    engine: ALPHA_ENGINE, model: CONFIG.chosen, configSha256: CONFIG.sha256, dataAsOf: data.cal.dates[ce], builtAt: new Date(now()).toISOString(),
    universe: data.items.length, liquid: rows.length, minValue: RULES.minValue,
    weights: FACTORS.map((f, k) => ({ key: f.key, name: f.name, group: f.group, weight: r4(weights[k]), ic36m: ic ? r4(ic[k]) : null })),
    icHistoryDays: days, evidence: ALPHA_VALIDATION,
    vnd: { fetchedAt: vnd?.fetchedAt ?? null, tickers: Object.keys(vnd?.fund ?? {}).length, failed: vnd?.failed?.length ?? null },
    top20: top.map(detail),
    others: [...rows].sort((a, b) => b.score - a.score).slice(0, 120).map((r) => ({ ticker: r.ticker, sector: r.sector, score: r3(r.score), rank: rankOf.get(r.ticker) })),
  };
  const snapshot = { date: doc.dataAsOf, model: CONFIG.chosen, top: top.map((r) => r.ticker), rows: rows.map((r) => [r.ticker, r3(r.score), Array.from(r.z, (z) => r3(z))]) };
  return { doc, snapshot, data };
}

/** Chấm một bản chụp đã đủ 21 phiên: IC từng yếu tố & điểm, lợi suất vượt VN-Index 20 phiên của Top 20 so universe. */
export function scoreSnapshot(snap, data) {
  const ce0 = data.cal.calOf.get(snap.date);
  if (ce0 == null || ce0 + 21 >= data.cal.dates.length) return null;
  const itemOf = new Map(data.items.map((x) => [x.ticker, x]));
  const ys = [], zs = [], scores = [], top = new Set(snap.top);
  let topSum = 0, topN = 0, uniSum = 0, uniN = 0;
  for (const [t, score, z] of snap.rows) {
    const it = itemOf.get(t); if (!it) continue;
    const e = it.pos.get(ce0); if (e == null || e + 21 >= it.c.length) continue;
    const y = Math.log(it.c[e + 21] / it.c[e + 1]) - Math.log(data.cal.closes[it.cal[e + 21]] / data.cal.closes[it.cal[e + 1]]);
    ys.push(y); zs.push(z); scores.push(score); uniSum += y; uniN++;
    if (top.has(t)) { topSum += y; topN++; }
  }
  if (ys.length < RULES.minPerDate) return null;
  const ic = Array.from({ length: K }, (_, k) => r4(spearman(zs.map((z) => z[k] ?? 0), ys) ?? 0));
  return { date: snap.date, ic, scoreIc: r4(spearman(scores, ys)), top20ExcessPct: pct(topN ? topSum / topN : null), universeExcessPct: pct(uniN ? uniSum / uniN : null), spreadPct: pct(topN && uniN ? topSum / topN - uniSum / uniN : null), n: ys.length };
}

/** Tóm tắt sổ theo dõi từ các bản chụp đã chấm. */
export function ledgerSummary(scored) {
  const s = scored.filter(Boolean);
  const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
  const ics = s.map((x) => x.scoreIc).filter((x) => x != null), spreads = s.map((x) => x.spreadPct).filter((x) => x != null);
  return {
    maturedDates: s.length, meanScoreIc: r4(mean(ics)), positiveIcShare: ics.length ? r3(ics.filter((x) => x > 0).length / ics.length) : null,
    meanSpreadPct: r3(mean(spreads)), beatUniverseShare: spreads.length ? r3(spreads.filter((x) => x > 0).length / spreads.length) : null,
    recent: s.slice(-12).map(({ date, scoreIc, top20ExcessPct, universeExcessPct, spreadPct, n }) => ({ date, scoreIc, top20ExcessPct, universeExcessPct, spreadPct, n })),
  };
}

export function createAlphaService({ service, corporateActions, taSeries = null, fetchImpl = globalThis.fetch, now = Date.now }) {
  const store = service.store;
  let inflight = null;
  async function loadIcHistory() {
    const v = (await store.getKv(ALPHA_KV.ic))?.value;
    return v?.dates?.length ? v : { version: SEED.version, dates: SEED.dates, appended: [] };
  }
  async function refreshVnd(tickers) {
    const vnd = await fetchVndRecent(tickers, { fetchImpl, now });
    await store.setKv(ALPHA_KV.vnd, vnd);
    return vnd;
  }
  async function build() {
    const { seriesOf, benchBars, sectorOf, icb } = await loadAdjustedUniverse({ store, corporateActions, taSeries, historyDays: 460 });
    let vnd = (await store.getKv(ALPHA_KV.vnd))?.value ?? null;
    if (!vnd || now() - Date.parse(vnd.fetchedAt) > 20 * 3600e3) vnd = await refreshVnd([...seriesOf.keys()]);
    const icHist = await loadIcHistory();
    const sectorNames = new Map((icb?.levels?.[2] ?? []).map((s) => [s.code, s.name]));
    const { doc, snapshot, data } = buildLiveTop20({ seriesOf, benchBars, sectorOf, vnd, icHistory: icHist.dates, sectorNames, now });
    // ---- sổ theo dõi: chấm các bản chụp đã đủ 21 phiên, nối IC vào lịch sử (một lần / bản chụp)
    const idx = (await store.getKv(ALPHA_KV.snapIndex))?.value ?? { dates: [], scored: {} };
    const known = new Set(icHist.dates.map((x) => x.date));
    for (const d of idx.dates) {
      if (idx.scored[d]) continue;
      const snap = (await store.getKv(ALPHA_KV.snap(d)))?.value; if (!snap) continue;
      const sc = scoreSnapshot(snap, data); if (!sc) continue;
      idx.scored[d] = sc;
      // giữ đúng nhịp 5 phiên của lịch sử IC đã kiểm định (T3) — không dồn trọng số vào giai đoạn gần đây
      const lastIc = icHist.dates.reduce((m, x) => (x.date > m ? x.date : m), "");
      const gap = (data.cal.calOf.get(d) ?? -1) - (data.cal.calOf.get(lastIc) ?? -Infinity);
      if (!known.has(d) && d > lastIc && gap >= RULES.step) { icHist.dates.push({ date: d, ic: sc.ic }); icHist.appended = [...(icHist.appended ?? []), d]; known.add(d); }
    }
    icHist.dates.sort((a, b) => a.date.localeCompare(b.date));
    if (!idx.dates.includes(snapshot.date)) { await store.setKv(ALPHA_KV.snap(snapshot.date), snapshot); idx.dates = [...idx.dates, snapshot.date].sort().slice(-400); }
    await store.setKv(ALPHA_KV.snapIndex, idx);
    await store.setKv(ALPHA_KV.ic, icHist);
    const full = { ...doc, ledger: { snapshots: idx.dates.length, firstDate: idx.dates[0] ?? null, ...ledgerSummary(idx.dates.map((d) => idx.scored[d])) } };
    await store.setKv(ALPHA_KV.top20, full);
    return full;
  }
  const run = () => (inflight ??= build().finally(() => { inflight = null; }));
  return {
    jobs: {
      buildAlphaTop20: async () => { const d = await run(); return { dataAsOf: d.dataAsOf, liquid: d.liquid, top: d.top20.map((x) => x.ticker).join(","), ledger: d.ledger.snapshots }; },
      refreshAlphaVnd: async () => { const tickers = ((await store.getKv("scanner:universe"))?.value?.tickers ?? []).map((u) => u.ticker); const v = await refreshVnd(tickers); return { tickers: Object.keys(v.fund).length, failed: v.failed.length }; },
    },
    async top20() { return (await store.getKv(ALPHA_KV.top20))?.value ?? run(); },
  };
}

export const ALPHA_SCHEDULE = [
  { name: "refreshAlphaVnd", at: "02:40", tradingDayOnly: false },
  { name: "buildAlphaTop20", at: "16:10", tradingDayOnly: true },
];
