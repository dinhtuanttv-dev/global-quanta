// ARL-v1 (26/11/2026): sổ phán quyết Phòng họp AI + sửa vòng nền (429 chờ tăng dần, trần thử lại mỗi phiên).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createResearchRoom } from "../src/market/elite/researchRoom.js";
import { createResearchAutonomy } from "../src/market/elite/researchAutonomy.js";
import { ARL_KEY, createAiRoomLedger, ledgerEntry, scoreEntries, sideStats, summarize, upsert, wilson } from "../src/market/elite/aiRoomLedger.js";

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const decision = { ...json("./fixtures/elite-decision-20261023.json"), ...json("../../src/lib/elite10/__fixtures__/pulse-2026-11-20.json").decision };
const date = decision.date, clock = Date.parse(date + "T15:05:00+07:00");
const bar = { date, open: 44000, high: 47000, low: 43000, close: 46000, volume: 2500 };

function fixtureRoom() {
  return createResearchRoom({ store: createMemoryStore(), now: () => clock + 3_600_000, load: (ticker) => ({
    decision: async () => decision, price: async () => ({ bars: [bar], priceBasis: "ADJUSTED_CUMULATIVE" }),
    instrument: async () => ({ ticker, exchange: "HOSE" }),
  }) });
}
function sourcedClaim(projection, side) {
  const ref = projection.snap.refs.find((r) => r.domain === "decision");
  return JSON.stringify({ schemaVersion: "claims-1.0", snapshotId: projection.snap.snapshotId, limitations: [], claims: [{
    id: "c1", side, ticker: projection.snap.ticker, asOf: ref.asOf, text: "Có nguồn quyết định để đối chiếu.", classification: "FACT", refs: [ref.id],
    supports: [], invalidates: [], numericAssertions: [], horizon: null, uncertainty: "HIGH", invalidation: null, missingData: [] }] });
}
function harness(inferImpl, extra = {}) {
  const room = fixtureRoom(), store = createMemoryStore(), snapshots = new Map(), calls = [];
  const clockRef = { now: clock };
  const doc = { date, portfolio: [{ ticker: "FPT" }] };
  const deps = { store, configured: () => ({ claude: true, gemini: true }), now: () => clockRef.now, log: {},
    session: async () => ({ decisionSession: date, expectedClosedSession: date, stage: "PUBLISHED", publication: "v1" }),
    decision: async () => doc,
    capture: async (ticker) => { const p = await room.capture(ticker, date); snapshots.set(p.snap.snapshotId, p); return p; },
    infer: async (side, message) => { calls.push(side); return inferImpl(side, message, snapshots, clockRef.now); }, ...extra };
  return { worker: createResearchAutonomy(deps), store, calls, clockRef, doc };
}
const circuit = async (store, provider) => (await store.getKv("local:ai-room:provider:v1:" + provider))?.value ?? null;

test("A2: Gemini 429 chờ tăng dần 1 → 2 → 4 phút (trước đây cố định 60 s); thành công thì xoá bộ đếm", async () => {
  let ok = false;
  const h = harness((side, message, snaps) => {
    if (side === "BEAR" && !ok) throw Object.assign(new Error("Too Many Requests"), { status: 429 });
    const id = [...snaps.keys()].find((k) => message.includes(k)); return sourcedClaim(snaps.get(id), side);
  });
  await h.worker.tick();
  let c = await circuit(h.store, "gemini");
  assert.equal(c.strikes, 1); assert.equal(c.retryAt, h.clockRef.now + 60_000);
  h.clockRef.now = c.retryAt + 1; await h.worker.tick();
  c = await circuit(h.store, "gemini"); assert.equal(c.strikes, 2); assert.equal(c.retryAt, h.clockRef.now + 120_000);
  h.clockRef.now = c.retryAt + 1; await h.worker.tick();
  c = await circuit(h.store, "gemini"); assert.equal(c.strikes, 3); assert.equal(c.retryAt, h.clockRef.now + 240_000);
  const bearCalls = h.calls.filter((s) => s === "BEAR").length;
  await h.worker.tick(); // chưa tới hạn -> không gọi thêm
  assert.equal(h.calls.filter((s) => s === "BEAR").length, bearCalls);
  ok = true; h.clockRef.now = c.retryAt + 1; await h.worker.tick();
  assert.equal(await circuit(h.store, "gemini"), null, "thành công -> xoá bộ đếm 429");
  assert.equal((await h.worker.health(h.doc)).ready, 1);
});

test("A2: tôn trọng Retry-After của nhà cung cấp (trần 1 giờ)", async () => {
  const h = harness((side, message, snaps) => {
    if (side === "BEAR") throw Object.assign(new Error("Too Many Requests"), { status: 429, headers: { "retry-after": "600" } });
    const id = [...snaps.keys()].find((k) => message.includes(k)); return sourcedClaim(snaps.get(id), side);
  });
  await h.worker.tick();
  assert.equal((await circuit(h.store, "gemini")).retryAt, h.clockRef.now + 600_000);
});

test("A3: lỗi kiểm luận điểm có trần 4 lần mỗi phiên; đạt trần -> vai dừng, bản ghi PARTIAL, không gọi thêm", async () => {
  const h = harness((side, message, snaps) => {
    if (side === "BEAR") return "không phải JSON";
    const id = [...snaps.keys()].find((k) => message.includes(k)); return sourcedClaim(snaps.get(id), side);
  });
  for (let i = 0; i < 8; i++) { await h.worker.tick(); h.clockRef.now += 3_600_001; }
  assert.equal(h.calls.filter((s) => s === "BEAR").length, 4);
  const rec = await h.worker.read("FPT");
  assert.equal(rec.failures.BEAR.exhausted, true); assert.equal(rec.failures.BEAR.retryAt, null);
  assert.equal(rec.state, "PARTIAL");
  assert.ok(rec.roles.BULL, "phe còn lại vẫn hoàn tất");
});

test("vòng nền ghi sổ phán quyết khi có kết quả; bản READY có cán cân bằng chứng", async () => {
  const ledgerStore = createMemoryStore();
  const ledger = createAiRoomLedger({ store: ledgerStore, vnIndex: async () => [] });
  const h = harness((side, message, snaps) => { const id = [...snaps.keys()].find((k) => message.includes(k)); return sourcedClaim(snaps.get(id), side); }, { ledger });
  await h.worker.tick();
  await new Promise((r) => setTimeout(r, 20));
  const doc = (await ledgerStore.getKv(ARL_KEY)).value;
  assert.equal(doc.entries.length, 1);
  const e = doc.entries[0];
  assert.equal(e.id, `FPT|${date}`); assert.equal(e.state, "READY");
  assert.equal(e.sides.BULL.matched + e.sides.BULL.structural >= 0, true);
  assert.equal(typeof e.balance, "number");
  assert.equal(JSON.stringify(e).includes("Có nguồn quyết định"), false, "sổ không giữ lời văn AI");
});

test("sổ: thống kê vai, cán cân chỉ khi đủ hai phe, không sửa bản đã chấm", () => {
  const claims = (v) => ({ claims: v.map((x) => ({ validation: x, uncertainty: "LOW", classification: "FACT" })) });
  assert.deepEqual(sideStats(claims(["REFS_MATCHED", "UNSUPPORTED", "STRUCTURAL_ONLY"])).matched, 1);
  const rec = (roles) => ({ session: "2026-11-20", state: "READY", projection: { snap: { snapshotId: "s", funnel: { membership: { state: "PORTFOLIO_CORE", rank: 3 } } } }, roles });
  assert.equal(ledgerEntry("HPG", rec({ BULL: claims(["REFS_MATCHED", "REFS_MATCHED"]), BEAR: claims(["REFS_MATCHED"]) })).balance, 1);
  assert.equal(ledgerEntry("HPG", rec({ BULL: claims(["REFS_MATCHED"]) })).balance, null);
  const scored = { ...ledgerEntry("HPG", rec({})), results: { 5: { excess: 0.01 } } };
  assert.equal(upsert([scored], { ...scored, balance: 9, results: {} })[0].balance, scored.balance);
});

test("chấm: vào ở d+1, ra ở d+1+h, trừ VN-Index; phiên vào tăng sát trần bị loại; tổng hợp có đường cơ sở và Wilson", () => {
  const cal = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"];
  const vn = cal.map((d, i) => [d, 1000 + i * 10]);
  const series = new Map([
    ["AAA", cal.map((d, i) => ({ date: d, closeAdj: 100 + i * 2 }))],
    ["BBB", cal.map((d, i) => ({ date: d, closeAdj: i === 1 ? 110 : 100 - i }))],
  ]);
  const e = (t, b) => ({ id: `${t}|2026-11-02`, ticker: t, session: "2026-11-02", balance: b, state: "READY", results: {} });
  const out = scoreEntries([e("AAA", 2), e("BBB", -1)], series, vn, { horizons: [5], entryLag: 1, limitUp: 0.067 });
  const a = out[0].results[5];
  assert.equal(a.entry, "2026-11-03"); assert.equal(a.exit, "2026-11-10");
  assert.ok(Math.abs(a.excess - ((112 / 102 - 1) - (1060 / 1010 - 1))) < 1e-6);
  assert.equal(out[1].results[5].limitUp, true, "BBB tăng 10% ở phiên vào -> không khớp lệnh mua");
  const sum = summarize(out, { horizons: [5], minScored: 30 });
  assert.equal(sum.horizons[5].n, 1); assert.equal(sum.horizons[5].hitRate, 1);
  assert.equal(sum.label, "CHƯA ĐỦ MẪU");
  const [lo, hi] = wilson(8, 10); assert.ok(lo > 0.5 && hi < 1 && lo < 0.8);
});

test("dịch vụ: chấm theo giá điều chỉnh (có giới hạn tần suất) và đọc theo mã", async () => {
  const store = createMemoryStore();
  const cal = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"];
  let calls = 0;
  const ledger = createAiRoomLedger({ store, now: () => clock, log: {}, rules: { horizons: [5], entryLag: 1, limitUp: 0.067, maxEntries: 100, minScored: 30, scoreEveryMs: 1000 },
    vnIndex: async () => { calls++; return cal.map((d, i) => [d, 1000 + i]); },
    adjustedCloses: async (symbols) => new Map(symbols.map((s) => [s, cal.map((d, i) => [d, 50 + i, 1])])) });
  const rec = { session: "2026-11-02", state: "READY", publication: "p", projection: { snap: { snapshotId: "s1", funnel: { membership: { state: "PORTFOLIO_CORE", rank: 1 } } } },
    roles: { BULL: { claims: [{ validation: "REFS_MATCHED" }] }, BEAR: { claims: [] } } };
  await ledger.record("HPG", rec);
  const s = await ledger.score({ force: true });
  assert.equal(s.horizons[5].n, 1); assert.equal(calls, 1);
  assert.equal(await ledger.score(), null, "trong khoảng giới hạn tần suất -> không chấm lại");
  const r = await ledger.read({ ticker: "HPG" });
  assert.equal(r.entries[0].results[5].entry, "2026-11-03");
  assert.deepEqual((await ledger.read({ ticker: "FPT" })).entries, []);
});
