import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import express from "express";
import { createScheduler } from "../src/market/scheduler.js";
import { createJobs } from "../src/market/jobs.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createResearchRoom } from "../src/market/elite/researchRoom.js";
import { createResearchAutonomy, selectSessionProjection } from "../src/market/elite/researchAutonomy.js";
import { fetchVndirectClose } from "../src/market/providers/vndirectClose.js";
import { createResearchRoomRouter } from "../src/routes/researchRoom.js";

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const decision = { ...json("./fixtures/elite-decision-20261023.json"), ...json("../../src/lib/elite10/__fixtures__/pulse-2026-11-20.json").decision };
const date = decision.date, clock = Date.parse(date + "T15:05:00+07:00");
const bar = { date, open: 44000, high: 47000, low: 43000, close: 46000, volume: 2500 };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const noop = async () => {};
const jobs = { syncSecurities: noop, syncPriceLimits: noop, reconcile: noop, backfill: noop };

test("15:05 EOD proceeds while an already-running batch owns its queue", async () => {
  let release, ran = false;
  const scheduler = createScheduler({ ...jobs, backfill: () => new Promise((r) => { release = r; }), syncEod: async () => { ran = true; } }, { now: () => clock });
  const batch = scheduler.run("backfill");
  await flush();
  scheduler.tick(); await flush();
  assert.equal(ran, true);
  assert.equal(scheduler.status().find((j) => j.name === "syncEod").queue, "EOD_PRIORITY_QUEUE");
  release(); await batch;
});

test("stale SSI bars cannot satisfy coverage; 30s/60s retries reach exactly 95% using verified VNDirect", async () => {
  let now = clock, tries = 0;
  const store = createMemoryStore();
  const core = Array.from({ length: 20 }, (_, i) => "A" + String(i).padStart(2, "0"));
  const service = { store, cache: { clear() {} }, getEodUniverse: async () => core,
    router: { run: async () => ({ data: [{ ...bar, date: "2026-11-19" }], source: "SSI_FC_V2" }) } };
  const fallbackDay = (day) => {
    tries++;
    const rows = core.slice(0, tries === 3 ? 19 : 18).map((code) => ({ type: "STOCK", code, date: day, open: 44, high: 47, low: 43, close: 46, nmVolume: 2500 }));
    rows.push({ ...rows[0], code: core[19], nmVolume: null });
    return fetchVndirectClose(day, async () => ({ ok: true, json: async () => ({ data: rows }) }));
  };
  const { syncEod } = createJobs(service, { now: () => now, fallbackDay, pauseMs: 0 });
  const scheduler = createScheduler({ ...jobs, syncEod }, { now: () => now });
  for (const [i, delay] of [30_000, 60_000, null].entries()) {
    scheduler.tick();
    const result = await scheduler.run("syncEod");
    const job = scheduler.status().find((j) => j.name === "syncEod");
    assert.equal(result.confirmedCore, i < 2 ? 18 : 19);
    assert.equal(result.awaitingData, i < 2);
    assert.equal(job.last.ok, i === 2);
    if (delay) { assert.equal(job.retry.at - now, delay); now += delay; }
    else assert.equal(job.retry, null);
  }
  const stored = (await store.getBars(core[0], date, date))[0];
  assert.equal(stored.source, "vndirect"); assert.equal(stored.close, 46000);
  assert.equal((await store.getKv("local:eod:coverage:" + date)).value.expected, 20);
});

function fixtureRoom() {
  return createResearchRoom({ store: createMemoryStore(), now: () => clock + 3_600_000, load: (ticker) => ({
    decision: async () => decision, price: async () => ({ bars: [bar], priceBasis: "ADJUSTED_CUMULATIVE" }),
    instrument: async () => ({ ticker, exchange: "HOSE" }),
  }) });
}

test("pending T0 selects the prior sealed projection without mutating its evidence or issuer", async () => {
  const room = fixtureRoom(), base = await room.capture("FPT", date);
  const status = { expectedClosedSession: "2026-11-23", decisionSession: date, stage: "EOD" };
  const selected = await selectSessionProjection("FPT", () => assert.fail("unnecessary new capture"), status, async () => ({ session: date, projection: base }));
  assert.equal(selected.snap.snapshotId, base.snap.snapshotId);
  assert.deepEqual(selected.fallback, { session: date, expectedSession: "2026-11-23" });
  assert.equal(base.fallback, undefined);
  const mixed = { ...base, data: { ...base.data, volume: { asOf: "2026-11-23" } } };
  await assert.rejects(selectSessionProjection("FPT", async () => mixed, status, async () => null), { statusCode: 409 });
});

function sourcedClaim(projection, side) {
  const ref = projection.snap.refs.find((r) => r.domain === "decision");
  return JSON.stringify({ schemaVersion: "claims-1.0", snapshotId: projection.snap.snapshotId, limitations: [], claims: [{
    id: "c1", side, ticker: projection.snap.ticker, asOf: ref.asOf, text: "Có nguồn quyết định để đối chiếu.", classification: "FACT", refs: [ref.id],
    supports: [], invalidates: [], numericAssertions: [], horizon: null, uncertainty: "HIGH", invalidation: null, missingData: [] }] });
}

test("Claude billing failure is shared across Core, Gemini completes, and only the missing roles resume", async () => {
  const room = fixtureRoom(), store = createMemoryStore(), snapshots = new Map(), calls = [];
  let now = clock;
  const doc = { date, portfolio: [{ ticker: "FPT" }, { ticker: "MSH" }] };
  const deps = { store, configured: () => ({ claude: true, gemini: true }), now: () => now, log: {},
    session: async () => ({ decisionSession: date, expectedClosedSession: date, stage: "PUBLISHED", publication: "v1" }),
    decision: async () => doc, capture: async (ticker) => {
      const projection = await room.capture(ticker, date);
      snapshots.set(projection.snap.snapshotId, projection); return projection;
    },
    infer: async (side, message) => {
      calls.push(side);
      if (side === "BULL" && now === clock) throw Object.assign(new Error("Your credit balance is too low"), { status: 400 });
      const id = [...snapshots.keys()].find((id) => message.includes(id));
      return sourcedClaim(snapshots.get(id), side);
    } };
  const first = createResearchAutonomy(deps);
  await first.tick();
  const health = await first.health(doc);
  assert.equal(health.ready, 0); assert.equal(health.bear, 2);
  assert.deepEqual(health.blocked, [{ provider: "claude", reason: "BILLING", retryAt: clock + 900_000 }]);
  const restarted = createResearchAutonomy(deps);
  await restarted.tick();
  assert.deepEqual(calls.slice().sort(), ["BEAR", "BEAR", "BULL"]);
  now += 900_001;
  await restarted.tick();
  assert.equal((await restarted.health(doc)).ready, 2);
  assert.deepEqual(calls.slice(3), ["BULL", "JUDGE", "BULL", "JUDGE"]);
});

test("the three-role worker resumes checkpoints and serves an authenticated hot HTTP read in under 200ms", async (t) => {
  const room = fixtureRoom(), projection = await room.capture("FPT", date), store = createMemoryStore();
  const calls = [];
  let now = clock, failOnce = true;
  const deps = { store, configured: () => true, now: () => now, log: {},
    session: async () => ({ decisionSession: date, expectedClosedSession: date, stage: "PUBLISHED", publication: "v1" }),
    decision: async () => ({ date, portfolio: [{ ticker: "FPT", hl: { rank: 1, pz: { lane: "CORE" } } }, { ticker: "MSH", hl: { pz: { lane: "RUNNER" } } }] }),
    capture: async (ticker) => { assert.equal(ticker, "FPT"); return projection; },
    infer: async (side, message) => {
      calls.push(side);
      if (side === "BEAR" && failOnce) { failOnce = false; throw new Error("offline"); }
      if (side === "JUDGE") assert.match(message, /Luận điểm đối chiếu/);
      return sourcedClaim(projection, side);
    } };
  const first = createResearchAutonomy(deps);
  await Promise.all([first.tick(), first.tick()]);
  assert.equal((await first.read("FPT")).state, "RETRY");
  now += 30_001;
  const restarted = createResearchAutonomy(deps);
  await restarted.tick(); await restarted.tick();
  assert.deepEqual(calls, ["BULL", "BEAR", "BEAR", "JUDGE"]);
  const app = express();
  app.use(createResearchRoomRouter({ getRoom: () => room, verifyUser: async (auth) => auth === "Bearer test" ? "fixture" : null, precomputed: restarted.read }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = "http://127.0.0.1:" + server.address().port + "/precomputed?ticker=FPT";
  assert.equal((await fetch(url)).status, 401);
  const start = performance.now(), response = await fetch(url, { headers: { authorization: "Bearer test" } }), body = await response.json();
  const elapsed = performance.now() - start;
  assert.equal(response.status, 200); assert.equal(body.state, "READY"); assert.equal(body.projection.snap.snapshotId, projection.snap.snapshotId);
  assert.equal(body.roles.JUDGE.claims[0].side, "JUDGE"); assert.equal(calls.length, 4);
  t.diagnostic("authenticated local HTTP + JSON " + elapsed.toFixed(1) + " ms"); assert.ok(elapsed < 200);
});
