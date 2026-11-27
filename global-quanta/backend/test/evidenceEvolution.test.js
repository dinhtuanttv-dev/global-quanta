// EV-4 (27/11/2026): tiến hoá bằng chứng tab 4 — SQS, nhãn xu hướng, IC theo chế độ thị trường, độ phủ, đề xuất. Chỉ mô tả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvolution, createEvidenceEvolution, evolveSignal, proposals, regimeByDate, regimeIc, sqsParts, trendTag, EV4, icSeriesAt } from "../src/market/elite/evidenceEvolution.js";

const H = (n, mean, t, extra = {}) => ({ n, mean, t, pPos: null, q: null, stable: false, halves: null, ...extra });
const sig = (o) => ({ id: "x", tab: "Siêu quét AI", labelVi: "X", priorTier: "C", tier: "C", mainH: 5, byH: { 1: H(0, null, null), 5: H(0, null, null), 10: H(0, null, null), 20: H(0, null, null) }, ...o });
const days = (n, start = "2026-01-01") => Array.from({ length: n }, (_, i) => new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10));

test("SQS: đúng công thức Blueprint §2.1 và nằm trong [0, 100]", () => {
  const byH = { 1: H(200, 0.02, 2.5), 5: H(229, 0.0252, 3.0152, { halves: [0.0248, 0.0256] }), 10: H(224, 0.02, 1.2), 20: H(214, -0.01, -0.5) };
  const p = sqsParts({ byH, mainH: 5, rolling20: 0.0252, coverageRatio: 0.88 });
  // stat = 40 · 1 · (0,35 + 0,65 · 229/259) ; ổn định = 15 + 5 ; kỳ hạn = 3 × 5 ; phủ = 15 · 0,88
  const stat = 40 * (0.35 + 0.65 * 229 / 259);
  assert.equal(p.sqs, Math.round(stat + 20 + 15 + 13.2));
  assert.equal(p.breakdown.horizon, 15);
  const worst = sqsParts({ byH: { 5: H(5, -0.1, -4, { halves: [-1, -1] }) }, mainH: 5, rolling20: null, coverageRatio: 0 });
  assert.equal(worst.sqs, 5, "chỉ còn 5 điểm trung tính của rolling khi chưa đủ 20 ngày");
  const roll = sqsParts({ byH: { 5: H(100, 0.02, 1) }, mainH: 5, rolling20: -0.5, coverageRatio: 1 });
  assert.equal(roll.breakdown.stability, 0, "IC gần đây sụt mạnh -> rolling bị chặn ở 0");
});

test("trendTag: LOW_COVERAGE xét trước; INVERTED; DECAYING; PROVEN_LEADER; EMERGING chỉ cấp mã", () => {
  const cov = (ratio, expected = 19) => ({ ratio, expected, measured: Math.round(ratio * expected) });
  // foreign_net_buy thật: 6/19 ngày đo, t 1,70 -> LOW_COVERAGE (không phải EMERGING).
  assert.equal(trendTag({ signal: sig({ byH: { 5: H(6, 0.0225, 1.7, { halves: [-0.0068, 0.0519] }) } }), level: "stock", sqs: 30, rolling20: null, coverage: cov(6 / 19) }), "LOW_COVERAGE");
  assert.equal(trendTag({ signal: sig({ byH: { 1: H(40, -0.02, -2.4), 5: H(40, -0.01, -1) } }), level: "stock", sqs: 10, rolling20: null, coverage: cov(1, 40) }), "INVERTED");
  // stealth5 thật: bậc khởi điểm A, q 0,29 -> DECAYING.
  assert.equal(trendTag({ signal: sig({ priorTier: "A", tier: "A", byH: { 5: H(244, 0.0094, 1.31, { q: 0.2866, halves: [0.0066, 0.0122] }) } }), level: "stock", sqs: 55, rolling20: 0.01, coverage: cov(0.89, 275) }), "DECAYING");
  // stealth20 thật: A, q 0,015, SQS cao -> PROVEN_LEADER.
  assert.equal(trendTag({ signal: sig({ priorTier: "A", tier: "A", byH: { 5: H(229, 0.0252, 3.02, { q: 0.0154, halves: [0.0248, 0.0256] }) } }), level: "stock", sqs: 82, rolling20: 0.025, coverage: cov(0.88, 260) }), "PROVEN_LEADER");
  const emerging = sig({ byH: { 5: H(19, 0.0435, 2.46, { halves: [0.036, 0.0502] }) } });
  assert.equal(trendTag({ signal: emerging, level: "stock", sqs: 50, rolling20: null, coverage: cov(1) }), "EMERGING");
  assert.equal(trendTag({ signal: emerging, level: "sector", sqs: 50, rolling20: null, coverage: cov(1) }), "NEUTRAL", "tín hiệu cấp ngành bị cụm -> không gắn EMERGING");
  assert.equal(trendTag({ signal: sig({ byH: { 5: H(19, 0.03, 2.5, { halves: [-0.01, 0.07] }) } }), level: "stock", sqs: 40, rolling20: null, coverage: cov(1) }), "NEUTRAL", "một nửa âm -> không mới nổi");
});

test("icSeriesAt + độ phủ: ngày [null, n] tính vào kỳ vọng, không tính vào đã đo", () => {
  const ds = days(19);
  const m = Object.fromEntries(ds.map((d, i) => [d, i % 3 === 0 ? [0.02, 120] : [null, 110]]));
  const icDoc = { series: { foreign_net_buy: { 5: m } } };
  const s = icSeriesAt(icDoc, "foreign_net_buy", 5);
  assert.equal(s.attempted, 19); assert.equal(s.values.length, 7);
  const row = evolveSignal(sig({ id: "foreign_net_buy", byH: { 1: H(7, 0.02, 1.7), 5: H(7, 0.02, 1.7, { halves: [0.01, 0.03] }), 10: H(0, null, null), 20: H(0, null, null) } }), icDoc, new Map());
  assert.equal(row.trendTag, "LOW_COVERAGE"); assert.equal(row.expected, 19); assert.equal(row.measured, 7);
  assert.equal(row.level, "stock");
});

test("IC theo chế độ thị trường: nhóm theo chế độ point-in-time của ngày tín hiệu; spread chỉ tính nhóm ≥ 10 ngày", () => {
  const ds = days(30);
  const regimes = new Map(ds.map((d, i) => [d, i < 15 ? "UPTREND" : "DOWNTREND"]));
  const series = { dates: ds, values: ds.map((_, i) => (i < 15 ? 0.04 : -0.02)) };
  const r = regimeIc(series, regimes, 5);
  assert.equal(r.byRegime.UPTREND.n, 15); assert.equal(r.byRegime.UPTREND.mean, 0.04); assert.equal(r.byRegime.SIDEWAY.n, 0);
  assert.equal(r.spread, 0.06);
  // regimeByDate dùng đúng regimeSeries của Cổng tiền mặt: chuỗi tăng đều đủ dài -> UPTREND ở cuối.
  const bars = days(80).map((date, i) => ({ date, close: 1000 + i * 5 }));
  const rb = regimeByDate(bars);
  assert.equal(rb.get(bars[79].date), "UPTREND"); assert.equal(rb.get(bars[0].date), "SIDEWAY");
});

test("buildEvolution: bảng điểm, hàng chờ, đề xuất cần duyệt; không có Challenger khi chưa đăng ký trước; không có BSS", () => {
  const evidence = { version: "E2-v1", calendarLast: "2026-11-27", signals: [
    sig({ id: "stealth20", labelVi: "Stealth 20", priorTier: "A", tier: "A", byH: { 1: H(233, 0.02, 2.5), 5: H(229, 0.0252, 3.02, { q: 0.0154, halves: [0.0248, 0.0256] }), 10: H(224, 0.02, 2), 20: H(214, 0.01, 1.1) } }),
    sig({ id: "foreign_net_buy", labelVi: "Khối ngoại mua ròng", byH: { 1: H(6, 0.02, 1.7), 5: H(6, 0.0225, 1.7, { halves: [-0.0068, 0.0519] }), 10: H(5, 0, 0), 20: H(2, 0, 0) } }),
  ] };
  const icDoc = { series: { foreign_net_buy: { 5: Object.fromEntries(days(19).map((d, i) => [d, i < 6 ? [0.02, 100] : [null, 100]])) } } };
  const doc = buildEvolution({ evidence, icDoc, vnBars: days(80).map((date, i) => ({ date, close: 1000 + i })),
    ledgerHl: { version: "E4-HL v1.1", entries: [1, 2, 3, 4], summary: { horizons: { 5: { n: 0 }, 10: { n: 0, meanExcess: null } } } },
    aiLedger: { summary: { version: "ARL-v1", label: "CHƯA ĐỦ MẪU", total: 18, horizons: { 5: { n: 0, positive: { n: 0, meanExcess: null } } } } },
    now: () => Date.parse("2026-11-27T10:00:00Z") });
  assert.equal(doc.currentRegime, "UPTREND");
  assert.equal(doc.scorecard.signalHealth.totalSignals, 2);
  assert.equal(doc.scorecard.signalHealth.lowCoverageCount, 1);
  assert.equal(doc.scorecard.liveAlpha.sessionsRecorded, 4);
  assert.equal(doc.scorecard.aiSkill.bss, null); assert.match(doc.scorecard.aiSkill.bssNoteVi, /không lưu xác suất/);
  assert.deepEqual(doc.challengers, []); assert.match(doc.challengersNoteVi, /đăng ký trước/);
  const fix = doc.proposals.find((p) => p.kind === "DATA_FIX");
  assert.equal(fix.id, "fix-foreign_net_buy"); assert.equal(fix.priority, "HIGH"); assert.match(fix.suggestedActionVi, /tín hiệu MỚI bậc C/);
  assert.ok(doc.scorecard.readinessQueue.some((r) => r.id === "E2:foreign_net_buy" && r.targetSamples === 60));
  for (const p of doc.proposals) assert.notEqual(p.kind, "CHALLENGER_WIN");
});

test("proposals: đủ mẫu sổ AI / sổ HL -> STUDY_READY; sắp xếp theo mức ưu tiên", () => {
  const ps = proposals([], { ai: { scored5: 31 }, hl: { settled10: 30 } });
  assert.deepEqual(ps.map((p) => p.id).sort(), ["ready-arl", "ready-hl"]);
  assert.ok(ps.every((p) => p.kind === "STUDY_READY"));
  assert.equal(EV4.tierDecisionN, 60);
});

test("dịch vụ: nhớ 10 phút, ghi KV; nguồn phụ lỗi không làm hỏng tài liệu; chưa có E2 -> null", async () => {
  let t = 0, builds = 0;
  const kv = new Map();
  const store = { setKv: async (k, v) => kv.set(k, v), getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null) };
  const evidence = { signals: [sig({ id: "stealth20" })], calendarLast: "2026-11-27" };
  const eng = { evidence: async () => { builds++; return evidence; }, icDocument: async () => ({ series: {} }) };
  const svc = createEvidenceEvolution({ store, getEvidence: () => eng, getDecision: () => ({ ledger: async () => { throw new Error("hỏng"); } }), now: () => t, log: { warn() {} } });
  const a = await svc.get();
  assert.equal(a.signals.length, 1); assert.equal(kv.has("elite:evidence:evolution"), true);
  t += 5 * 60_000; await svc.get(); assert.equal(builds, 1);
  t += 6 * 60_000; await svc.get(); assert.equal(builds, 2);
  const none = createEvidenceEvolution({ store, getEvidence: () => ({ evidence: async () => null }), now: () => 0 });
  assert.equal(await none.get(), null);
});
