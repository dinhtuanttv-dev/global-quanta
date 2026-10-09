// SEPA SP1 — đối chiếu bản JS với chuẩn Python (sepa_screener) trên dữ liệu giả lập + ví dụ, tại nhiều phiên t.
// Tạo lại chuẩn: python -I test/fixtures/sepa/oracle.py <thư mục sepa_screener> test/fixtures/sepa/oracle.json.gz
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { SEPA, evaluateBreakout, postBreakoutMonitor, prepareSepa, rsRatings, rsRawScore, sepaTechnical } from "../src/market/strategies/sepa/index.js";

const ORACLE = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/sepa/oracle.json.gz", import.meta.url))).toString("utf8"));
const CFG = { ...SEPA, risk: { ...SEPA.risk, riskPerTrade: 0.0125 } }; // mặc định của gói Python
const PREP = new Map();
const prep = (name) => {
  if (!PREP.has(name)) {
    const s = ORACLE.series[name];
    PREP.set(name, prepareSepa(s.date.map((date, i) => ({ date, open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.volume[i] }))));
  }
  return PREP.get(name);
};

/** So sánh sâu: số theo sai số tương đối 1e-9; null của Python = NaN; "Infinity" = Infinity. */
function diff(exp, act, path, out) {
  if (out.length > 30) return;
  if (exp === null) { if (!(act === null || act === undefined || Number.isNaN(act))) out.push(`${path}: kỳ vọng null, có ${JSON.stringify(act)}`); return; }
  if (exp === "Infinity" || exp === "-Infinity") { if (act !== (exp === "Infinity" ? Infinity : -Infinity)) out.push(`${path}: kỳ vọng ${exp}, có ${act}`); return; }
  if (typeof exp === "number") {
    if (typeof act !== "number" || !(Math.abs(exp - act) <= 1e-9 * Math.max(1, Math.abs(exp)))) out.push(`${path}: kỳ vọng ${exp}, có ${act}`);
    return;
  }
  if (Array.isArray(exp)) {
    if (!Array.isArray(act) || act.length !== exp.length) { out.push(`${path}: độ dài ${exp.length} ≠ ${act?.length} (${JSON.stringify(act)?.slice(0, 120)})`); return; }
    exp.forEach((e, i) => diff(e, act[i], `${path}[${i}]`, out));
    return;
  }
  if (typeof exp === "object") {
    if (!act || typeof act !== "object") { out.push(`${path}: kỳ vọng object, có ${JSON.stringify(act)}`); return; }
    for (const k of new Set([...Object.keys(exp), ...Object.keys(act)])) diff(exp[k] ?? null, act[k], `${path}.${k}`, out);
    return;
  }
  if (exp !== act) out.push(`${path}: kỳ vọng ${JSON.stringify(exp)}, có ${JSON.stringify(act)}`);
}

const patJs = (p) => ({
  name: p.name, detected: p.detected, status: p.status, pivot: p.pivot, base_start: p.baseStart, base_end: p.baseEnd, base_weeks: p.baseWeeks,
  depth: p.depth, footprint: p.footprint, stop_ref: p.stopRef, score: p.score, details: p.details, notes: p.notes, reasons_failed: p.reasonsFailed, breakout: p.breakout,
});
const planJs = (p) => p && ({
  entry: p.entry, stop: p.stop, stop_pct: p.stopPct, structural_stop: p.structuralStop, stop_too_wide: p.stopTooWide, target_2r: p.target2r, target_3r: p.target3r,
  breakeven_trigger: p.breakevenTrigger, shares: p.shares, position_value: p.positionValue, position_pct: p.positionPct, risk_amount: p.riskAmount,
  risk_pct_equity: p.riskPctEquity, notes: p.notes,
});

test(`chuẩn đối chiếu có đủ trường hợp (${ORACLE.cases.length} phiên, ${Object.keys(ORACLE.series).length} chuỗi)`, () => {
  assert.ok(ORACLE.cases.length >= 150);
  const st = new Set(ORACLE.cases.flatMap((c) => c.patterns.filter((p) => p.detected).map((p) => p.status)));
  for (const s of ["FORMING", "NEAR_PIVOT", "BREAKOUT", "EXTENDED", "SQUAT"]) assert.ok(st.has(s), `thiếu trạng thái ${s}`);
  const bst = new Set(ORACLE.breakouts.map((b) => b.breakout.status));
  assert.ok(bst.has("FAILED") && bst.has("SQUAT"));
});

for (const section of ["trend", "stage", "patterns", "plan"]) {
  test(`khớp Python — ${section} (mọi chuỗi, mọi phiên t)`, () => {
    const errs = [];
    for (const c of ORACLE.cases) {
      const S = prep(c.series);
      const r = sepaTechnical(S, c.t, { rs: 85, listingDate: ORACLE.series[c.series].listing_date, equity: 1e9, cfg: CFG });
      const where = `${c.series}@${c.t}`;
      if (section === "trend") diff(c.trend, r.trend, `${where}.trend`, errs);
      if (section === "stage") diff(c.stage, { stage: r.stage.stage, label: r.stage.label, confidence: r.stage.confidence, evidence: r.stage.evidence, stage2_start: r.stage.stage2Start, base_count: r.stage.baseCount, bases: r.stage.bases, warnings: r.stage.warnings }, `${where}.stage`, errs);
      if (section === "patterns") { diff(c.patterns, r.patterns.map(patJs), `${where}.patterns`, errs); diff(c.best, r.best?.name ?? null, `${where}.best`, errs); }
      if (section === "plan") { diff(c.plan, planJs(r.plan), `${where}.plan`, errs); diff(c.monitor, r.monitor, `${where}.monitor`, errs); }
      if (errs.length > 30) break;
    }
    assert.deepEqual(errs, []);
  });
}

test("khớp Python — phá vỡ với pivot cố định (FAILED / SQUAT / EXTENDED) + theo dõi sau phá vỡ", () => {
  const errs = [];
  for (const b of ORACLE.breakouts) {
    const S = prep(b.series);
    diff(b.breakout, evaluateBreakout(S, b.t, b.pivot, 338, b.stop_ref, SEPA.vcp.breakoutVolRatio, SEPA.vcp.maxChasePct), `${b.series}@${b.t}.breakout`, errs);
    if (b.monitor) diff(b.monitor, postBreakoutMonitor(S, b.t, b.breakout.ngay_pha_vo, b.pivot, b.stop_ref), `${b.series}@${b.t}.monitor`, errs);
  }
  assert.deepEqual(errs, []);
});

test("khớp Python — RS Rating phân vị (hạng trung bình, làm tròn nửa-về-chẵn)", () => {
  const raw = {};
  for (const [k, s] of Object.entries(ORACLE.series)) raw[k] = rsRawScore(Float64Array.from(s.close), s.close.length - 1, SEPA.lead.rsPeriods, SEPA.lead.rsWeights);
  assert.deepEqual(rsRatings(raw), ORACLE.rs);
});
