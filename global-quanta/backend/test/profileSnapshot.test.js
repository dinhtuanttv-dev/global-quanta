// HS360-v3 H3 (27/11/2026): ảnh chụp Hồ sơ 360° — một lần gọi, chỉ đọc, dấu bằng chứng chép từ sổ, câu chữ không lời khuyên.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildProfileSnapshot, createProfileSnapshot, FORBIDDEN_WORDS, percentileOf, PRICE_BARS } from "../src/market/elite/profileSnapshot.js";
import { createEliteRouter } from "../src/routes/elite.js";

const spec = (id, tab, unit, tier) => ({ id, tab, labelVi: id, unit, level: "stock", tier });
const row = (ticker, l2, values) => ({ ticker, icb: { l2 }, sector: l2 === "3500" ? "Thực phẩm" : "Ngân hàng", values });
const rows = [
  row("NAF", "3500", { ls_v1: 2.03, stealth20: null, kq_nowcast: 0.728, camslim_cup: 2, rrg_quadrant: 2, ws_sector_alpha: -4.26, net_intent: 0.9, structure_stage: 0, log_rvol: 0.4 }),
  ...Array.from({ length: 9 }, (_, i) => row(`F${i}`, "3500", { ls_v1: i / 10, kq_nowcast: i / 50, camslim_cup: 0, rrg_quadrant: 2, ws_sector_alpha: 1, net_intent: i / 20 })),
  ...Array.from({ length: 10 }, (_, i) => row(`B${i}`, "8300", { ls_v1: -i / 10, kq_nowcast: -i / 50, camslim_cup: 0, rrg_quadrant: -1, ws_sector_alpha: 2, net_intent: i / 30 })),
];
const panel = {
  date: "2026-11-30", generatedAt: "2026-11-30T10:05:00Z", missingSources: ["researchFeatures"], rows,
  signals: [spec("ls_v1", "Siêu quét AI", "z", "C"), spec("stealth20", "Siêu quét AI", "z", "A"), spec("kq_nowcast", "Cơ bản", "tỷ lệ", "B"), spec("camslim_cup", "TA VN-Index", "bậc", "B"),
    spec("rrg_quadrant", "Lọc ngành", "bậc", "C"), spec("ws_sector_alpha", "Kết nối thế giới", "đcb/phiên", "A"), spec("net_intent", "Siêu quét AI", "xác suất", "C")],
};
const decision = {
  date: "2026-11-30", builtAt: "2026-11-30T10:06:00Z", universe: { panel: 20 },
  scores: rows.map((r, i) => ({ ticker: r.ticker, rank: i + 1, Z: 1 - i / 10, alpha5Pct: 0.05, pOutperform: 0.51, close: 51100, advBn: 15, liq: { tier: i === 0 ? "L2" : "L4" }, contributions: [{ id: "kq_nowcast", contribution: 0.12 }, { id: "stealth20", contribution: 0 }] })),
  portfolio: [{ ticker: "NAF", weight: 0.1074, stop: 46529, hl: { rank: 1, cls: "CONFLUENCE", taCount: 1, rrg: -1, exitBufferLs: 6, pz: { state: "BUY_ZONE", lane: "CORE", pivot: 48700, zoneLow: 47239, zoneHigh: 51135, stopRef: 48034 } } }],
  hl: { rule: { exitLsPct: 60, warnLsPct: 70, exitTaMin: 1 }, queue: [{ ticker: "F1", hlRank: 3, code: "wait", reasonVi: "Chờ phiên cân bằng" }], queueIlliquid: [], against: [{ ticker: "B2", rrgVi: "Suy yếu" }] },
};
const evidence = { calendarLast: "2026-11-30", signals: [{ id: "stealth20", tier: "A", change: "none" }, { id: "ls_v1", tier: "C", change: "none" }, { id: "kq_nowcast", tier: "B", change: "none" }] };
const evolution = { generatedAt: "x", currentRegime: "DOWNTREND", signals: [
  { id: "stealth20", sqs: 96, trendTag: "PROVEN_LEADER", regimeIc: { DOWNTREND: { n: 69, mean: 0.043, t: 2 } } },
  { id: "net_intent", sqs: 42, trendTag: "INVERTED", regimeIc: { DOWNTREND: { n: 70, mean: -0.02, t: -2 } } },
] };
const registry = { entries: [{ id: "HL", verdict: "MỘT PHẦN" }, { id: "PZ", verdict: "KHÔNG ĐẠT" }, { id: "LQ", verdict: "CHƯA KIỂM ĐỊNH" }], impact: [{ id: "WS-v1", seal: "MỘT PHẦN" }] };
const fa = { asOf: "2026-11-30", warnings: [{ level: "warn", text: "Beneish M −1,60 > −1,78 — cần soát", source: "KQKD Q3/2026" }],
  calendar: { next: { date: null, expected: "2027-02-01" } }, events: { upcoming: [{ date: "2026-12-10", label: "Cổ tức tiền" }] } };
const ai = { updatedAt: "y", summary: { label: "CHƯA ĐỦ MẪU" }, entries: [{ results: {} }, { results: { 5: {} } }] };
const bars = Array.from({ length: 120 }, (_, i) => [`2026-0${1 + Math.floor(i / 30)}-${String(1 + (i % 28)).padStart(2, "0")}`, 40000 + i * 90]);

test("percentileOf: hạng trung bình, null khi không có giá trị", () => {
  assert.equal(percentileOf([1, 2, 3, 4], 3), 62.5);
  assert.equal(percentileOf([], 3), null); assert.equal(percentileOf([1], null), null);
});

test("ảnh chụp mã đang giữ: vị thế, tín hiệu (SQS, chế độ, ngành, lý do ô trống), lớp + dấu từ sổ, luận điểm, giá 90 phiên", () => {
  const d = buildProfileSnapshot({ ticker: "NAF", panel, decision, evidence, evolution, registry, fa, ai, bars, now: () => Date.parse("2026-11-30T11:00:00Z") });
  assert.equal(d.session, "2026-11-30");
  assert.deepEqual(d.missing, ["researchFeatures"]);
  assert.equal(d.header.hl.held, true); assert.equal(d.header.hl.lane, "CORE"); assert.equal(d.header.sector, "Thực phẩm");
  const sig = Object.fromEntries(d.signals.map((s) => [s.id, s]));
  assert.equal(sig.stealth20.value, null); assert.equal(sig.stealth20.nullReason, "SOURCE_MISSING");
  assert.equal(sig.stealth20.sqs, 96); assert.deepEqual(sig.stealth20.icRegimeNow, { regime: "DOWNTREND", n: 69, mean: 0.043 });
  assert.equal(sig.kq_nowcast.contribution, 0.12); assert.ok(sig.kq_nowcast.pctSector != null, "≥ 5 mã cùng ngành -> có phân vị ngành");
  assert.equal(sig.stealth20.contribution, null, "đóng góp 0 -> null");
  const L = Object.fromEntries(d.layers.map((l) => [l.id, l]));
  assert.equal(L.FLOW.direction, null); assert.match(L.FLOW.stateVi, /thiếu dòng tiền/); assert.equal(L.FLOW.seal, "ĐẠT");
  assert.equal(L.TECHNICAL.seal, "MỘT PHẦN"); assert.match(L.TECHNICAL.stateVi, /CAN SLIM phá vỡ pivot/);
  assert.equal(L.TIMING.seal, "KHÔNG ĐẠT"); assert.equal(L.TIMING.direction, 1);
  assert.equal(L.WORLD_CATALYST.seal, "MỘT PHẦN"); assert.equal(L.AI.seal, "ĐANG TÍCH LUỸ");
  assert.match(L.FUNDAMENTAL.stateVi, /\+72,8%.*1 cảnh báo/);
  // Luận điểm: điểm mạnh chỉ từ lớp có dấu ĐẠT / MỘT PHẦN và chiều ủng hộ; rủi ro theo quy tắc bán + cảnh báo + tín hiệu ngược chiều.
  assert.ok(d.thesis.strengths.every((s) => ["ĐẠT", "MỘT PHẦN"].includes(s.seal)));
  assert.ok(d.thesis.strengths.length <= 3 && d.thesis.risks.length <= 3);
  assert.deepEqual(d.thesis.risks.map((r) => r.kind), ["EXIT_NEAR", "EXIT_NEAR", "EXIT_NEAR"]);
  assert.deepEqual(d.thesis.nextEvent, { date: "2026-12-10", kindVi: "Cổ tức tiền", source: "PFA sự kiện đã công bố" });
  assert.equal(d.price.bars.length, PRICE_BARS); assert.equal(d.price.pivot, 48700); assert.deepEqual(d.price.zone, [47239, 51135]); assert.equal(d.price.stop, 46529);
  assert.equal(d.eliteScore.flowMissing, true); assert.deepEqual(d.outsideE2, { structure_stage: 0, log_rvol: 0.4 });
  const text = JSON.stringify(d).toLowerCase();
  for (const w of FORBIDDEN_WORDS) assert.ok(!text.includes(w), `từ cấm: ${w}`);
  assert.ok(JSON.stringify(d).length < 40_000);
});

test("mã ngoài danh mục: hàng chờ / ngành phản đối; không có giá vị trí; rủi ro tín hiệu ngược chiều khi phân vị cao", () => {
  const q = buildProfileSnapshot({ ticker: "F1", panel, decision, evidence, evolution, registry });
  assert.deepEqual(q.header.hl.queue, { hlRank: 3, code: "wait", reasonVi: "Chờ phiên cân bằng" });
  assert.equal(q.layers.find((l) => l.id === "TIMING").direction, null);
  const a = buildProfileSnapshot({ ticker: "B2", panel, decision, evidence, evolution, registry });
  assert.deepEqual(a.header.hl.against, { rrgVi: "Suy yếu" });
  const hi = buildProfileSnapshot({ ticker: "F8", panel, decision, evidence, evolution, registry });
  assert.ok(hi.thesis.risks.some((r) => r.kind === "INVERTED_SIGNAL" && /net_intent.*ngược chiều/.test(r.textVi)));
  assert.equal(hi.price, null, "không có chuỗi giá -> null");
});

test("dịch vụ: bộ đệm theo mã × phiên × bản quyết định; nguồn phụ lỗi -> missing, vẫn trả; mã ngoài vũ trụ -> notFound", async () => {
  let t = 0, faCalls = 0;
  const svc = createProfileSnapshot({
    getPanel: () => ({ panel: async () => panel }), getDecision: () => ({ decision: async () => decision }),
    getEvidence: () => ({ evidence: async () => evidence }), getEvolution: () => ({ get: async () => { throw new Error("hỏng"); } }), registry: () => registry,
    getProfileFa: () => ({ ticker: async () => { faCalls++; return fa; } }), getAiLedger: () => ({ read: async () => ai }),
    adjustedCloses: async () => new Map([["NAF", bars]]), now: () => t, log: { warn() {} },
  });
  const d = await svc.get("NAF");
  assert.ok(d.missing.includes("evolution")); assert.equal(d.signals.find((s) => s.id === "stealth20").sqs, null);
  assert.equal(d.price.bars.length, PRICE_BARS);
  t += 60_000; await svc.get("NAF"); assert.equal(faCalls, 1, "trong 5 phút dùng bộ đệm");
  t += 5 * 60_000; await svc.get("NAF"); assert.equal(faCalls, 2);
  assert.deepEqual(await svc.get("ZZZ"), { notFound: true, session: "2026-11-30" });
  const none = createProfileSnapshot({ getPanel: () => ({ panel: async () => null }), getDecision: () => ({ decision: async () => null }) });
  assert.equal(await none.get("NAF"), null);
});

test("route GET /api/elite/profile/:ticker: 200 + cache; 400 mã sai; 404 ngoài vũ trụ; 503 chưa bật", async () => {
  const docs = { NAF: { version: "HS360-v3", ticker: "NAF" }, ZZZ: { notFound: true, session: "2026-11-30" } };
  const app = express(); app.use("/api/elite", createEliteRouter({ getPanel: () => null, getProfile: () => ({ get: async (t) => docs[t] ?? null }) }));
  const off = express(); off.use("/api/elite", createEliteRouter({ getPanel: () => null }));
  const s = app.listen(0), s2 = off.listen(0);
  const u = (sv, p) => `http://127.0.0.1:${sv.address().port}${p}`;
  try {
    const ok = await fetch(u(s, "/api/elite/profile/naf"));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "public, max-age=300"); assert.equal((await ok.json()).ticker, "NAF");
    assert.equal((await fetch(u(s, "/api/elite/profile/a$"))).status, 400);
    assert.equal((await fetch(u(s, "/api/elite/profile/ZZZ"))).status, 404);
    assert.equal((await fetch(u(s2, "/api/elite/profile/NAF"))).status, 503);
  } finally { s.close(); s2.close(); }
});
