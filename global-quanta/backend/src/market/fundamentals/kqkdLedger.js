// KQ-L1 (06/11/2026) — sổ theo dõi TIẾN cho "tăng trưởng ước tính LNST cả năm" (KQ-r1 H3 ĐẠT -> THĂM DÒ). Hàm thuần.
// Ghi một lần, không sửa: mỗi (mã, quý Q1–Q3) ghi ước tính khi hôm nay ≥ ngày vào theo KQ-r1 = max(kết thúc quý + 45 ngày, ngày công bố).
// Chấm: lợi suất 60 phiên từ phiên đầu tiên SAU ngày ghi, vượt bình quân đều của chính lứa; IC Spearman + Q5−Q1 trừ 1%.
// Độ chính xác: khi đã có đủ 4 quý của năm -> sai số tuyệt đối % và có nằm trong dải P10–P90 không.
// Khác KQ-r1 (ghi rõ trên API): chuẩn so sánh là bình quân đều của lứa (không phải cả universe), không lọc thanh khoản.
import { spearman } from "../alpha/validate.js";
import { KQ_PREREG } from "./kqkdValidate.js";

export const LEDGER_VERSION = "KQ-L1 (2026-11-06)";
const DAY = 864e5;
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export function entryDate(fiscal, created) {
  const dl = iso(Date.parse(`${fiscal}T00:00:00Z`) + KQ_PREREG.deadlineDays * DAY);
  return created && created > dl ? created : dl;
}

/** Thêm dòng mới vào sổ (không sửa dòng cũ). rows: dòng bảng toàn thị trường. Trả số dòng thêm. */
export function recordLedger(ledger, rows, today) {
  const have = new Set(ledger.entries.map((e) => `${e.t}|${e.fiscal}`));
  let added = 0;
  for (const r of rows) {
    if (!r.current || !r.nowcast || !fin(r.nowcast.growth) || have.has(`${r.t}|${r.fiscal}`)) continue;
    if (today < entryDate(r.fiscal, r.created)) continue;
    ledger.entries.push({ t: r.t, tpl: r.tpl, fiscal: r.fiscal, quarter: r.quarter, recordedAt: today, growth: r.nowcast.growth, est: r.nowcast.est, lo: r.nowcast.lo, hi: r.nowcast.hi });
    added += 1;
  }
  return added;
}

/** Chấm sổ. closesOf(t) -> [{date, close}] (giá điều chỉnh); fyOf(t, year) -> LNST mẹ cả năm thực tế | null. */
export function scoreLedger(ledger, { closesOf, fyOf, horizon = KQ_PREREG.horizon, cost = KQ_PREREG.cost }) {
  const byQ = new Map();
  for (const e of ledger.entries) (byQ.get(e.quarter) ?? byQ.set(e.quarter, []).get(e.quarter)).push(e);
  const cohorts = [];
  for (const [quarter, es] of byQ) {
    const scored = es.map((e) => {
      const bars = closesOf(e.t) ?? [];
      const i0 = bars.findIndex((b) => b.date > e.recordedAt);
      const ret = i0 >= 0 && i0 + horizon < bars.length && bars[i0].close > 0 ? bars[i0 + horizon].close / bars[i0].close - 1 : null;
      const actual = fyOf(e.t, Number(e.fiscal.slice(0, 4)));
      return { ...e, ret, actual, ape: fin(actual) && actual > 0 ? Math.abs(e.est / actual - 1) : null, inBand: fin(actual) ? actual >= e.lo && actual <= e.hi : null };
    });
    const withRet = scored.filter((x) => fin(x.ret));
    const done = withRet.length >= Math.max(KQ_PREREG.minCohort, Math.ceil(es.length * 0.8));
    let ic = null, spread = null;
    if (done) {
      const m = mean(withRet.map((x) => x.ret));
      const ex = withRet.map((x) => ({ g: x.growth, x: x.ret - m }));
      ic = spearman(ex.map((x) => x.g), ex.map((x) => x.x));
      const s = [...ex].sort((a, b) => a.g - b.g), q = Math.floor(s.length / 5);
      spread = q ? mean(s.slice(-q).map((x) => x.x)) - mean(s.slice(0, q).map((x) => x.x)) - cost : null;
    }
    const acc = scored.filter((x) => fin(x.ape));
    cohorts.push({ quarter, recorded: es.length, recordedFrom: es.map((e) => e.recordedAt).sort()[0], status: done ? "SCORED" : "PENDING",
      withReturn: withRet.length, ic: r4(ic), spread: r4(spread),
      accuracy: acc.length ? { n: acc.length, medianApe: r4([...acc.map((x) => x.ape)].sort((a, b) => a - b)[acc.length >> 1]), coverage: r4(acc.filter((x) => x.inBand).length / acc.length) } : null });
  }
  cohorts.sort((a, b) => a.recordedFrom.localeCompare(b.recordedFrom));
  const sc = cohorts.filter((c) => c.status === "SCORED");
  return { version: LEDGER_VERSION, entries: ledger.entries.length, startedAt: ledger.startedAt, cohorts, scoredCohorts: sc.length, meanIc: r4(mean(sc.map((c) => c.ic))), meanSpread: r4(mean(sc.map((c) => c.spread))),
    rule: `Ghi khi hôm nay ≥ max(kết thúc quý + ${KQ_PREREG.deadlineDays} ngày, ngày công bố); lợi suất ${horizon} phiên từ phiên sau ngày ghi, vượt bình quân đều của lứa; Q5−Q1 trừ ${cost * 100}%. Chuẩn so sánh khác KQ-r1 (lứa thay vì cả universe, không lọc thanh khoản).` };
}
