import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createResearchRoom } from "../src/market/elite/researchRoom.js";
import { getVolumeAnalysis } from "../src/market/scanner/volumeService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { TtlCache } from "../src/market/util.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";
import { fetchMarketDay } from "../src/market/scanner/marketDaily.js";
import { SourceRouter } from "../src/market/sourceRouter.js";
import { closedResearchChart, evaluateConfirmation, makeResearchRun } from "../src/market/vendor/evidenceRoom.mjs";

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pulse = json("../../src/lib/elite10/__fixtures__/pulse-2026-11-20.json").decision;
const decision = { ...json("./fixtures/elite-decision-20261023.json"), ...pulse };
const day = decision.date;
const start = Date.parse(`${day}T09:30:00Z`);

test("a Gateway snapshot survives optional failures, is shared read-only within the debounce window and is scoped to its owner", async () => {
  let clock = start;
  let captures = 0;
  const selected = { ...decision };
  const room = createResearchRoom({ store: createMemoryStore(), now: () => clock,
    load: () => ({ decision: async () => { captures++; return selected; }, risk: async () => { throw new Error("Offline"); } }) });
  const [first, same] = await Promise.all([room.lock("alice", null), room.lock("alice", null)]);
  assert.equal(captures, 1);
  assert.equal(first.snap.snapshotId, same.snap.snapshotId);
  assert.equal(first.snap.sources.find((source) => source.key === "risk").state, "ERROR");
  assert.match(first.snap.limitations[0], /Gateway khóa/);
  const review = await room.reviewPrompt("alice", first.snap.snapshotId, "BULL");
  assert.ok(review.message.includes(first.snap.snapshotId));
  await assert.rejects(room.reviewPrompt("bob", first.snap.snapshotId, "BULL"), { statusCode: 404 });

  clock += 15_000;
  selected.version = "next";
  const later = await room.lock("alice", null);
  assert.notEqual(later.snap.snapshotId, first.snap.snapshotId);
  assert.equal((await room.reviewPrompt("alice", first.snap.snapshotId, "BULL")).message, review.message);
  clock += 31 * 60_000;
  await assert.rejects(room.reviewPrompt("alice", first.snap.snapshotId, "BULL"), { statusCode: 404 });
});

test("the account archive maintains checksummed sessions and a stable approval timestamp", async () => {
  let clock = start;
  const store = createMemoryStore();
  const createRoom = () => createResearchRoom({ store, now: () => clock, load: () => ({ decision: async () => decision }) });
  const room = createRoom();
  const run = await makeResearchRun("alice", await room.lock("alice", null), [], null);
  await assert.rejects(room.save("bob", run.id, run, false), { statusCode: 400 });
  await assert.rejects(room.save("alice", run.id, { ...run, confirmation: { ...run.confirmation, reason: "Tampered" } }, false), { statusCode: 400 });
  const saved = await room.save("alice", run.id, run, false);
  assert.equal(saved.approvedAt, null);
  const approved = await createRoom().save("alice", run.id, run, true);
  assert.equal(approved.approvedAt, new Date(clock).toISOString());
  clock += 60_000;
  assert.deepEqual(await createRoom().save("alice", run.id, run, true), approved);
  assert.deepEqual(await createRoom().list("alice", null), { records: [approved], nextOffset: null });
  assert.deepEqual(await createRoom().list("bob", null), { records: [], nextOffset: null });
  await assert.rejects(createRoom().get("bob", run.id), { statusCode: 404 });
});

test("daily volume summary produces coverage and never requests minute history", async () => {
  const service = {
    store: { getMarketDailyDates: async () => [day], getMarketDailyRange: async () => [{ symbol: "FPT", date: day, open: 100, high: 105, low: 97, close: 101, volume: 200, value: 20_200 }] },
    get router() { throw new Error("Must not access intraday router"); },
    get cache() { throw new Error("Must not warm intraday cache"); },
  };
  const result = await getVolumeAnalysis(service, "FPT", { now: () => start, detail: "summary" });
  assert.equal(result.today.volume, 200);
  assert.equal(result.partialToday, false);
  assert.equal(result.intraday, null);
  assert.deepEqual(result.coverage, { detail: "summary", lastClosedSession: day, expectedClosedSession: day });
});

test("timeline admits finalized closes only, even when the stream still has a partial bar after market close", () => {
  const bars = [{ date: "2026-11-23", close: 100 }, { date: "2026-11-24", close: 102, partial: true }];
  const chart = closedResearchChart(bars, "ADJUSTED_CUMULATIVE", [], "2026-11-24T09:00:00.000Z");
  assert.deepEqual(chart.bars, [{ date: "2026-11-23", close: 100 }]);
  const early = closedResearchChart([{ date: "2026-11-24", close: 102 }], "ADJUSTED_CUMULATIVE", [], "2026-11-24T07:00:00.000Z");
  assert.deepEqual(early.bars, []);
});

test("day ingest diagnoses stale, malformed and duplicate rows per exchange", async () => {
  const row = (symbol, date) => ({ Symbol: symbol, TradingDate: date, ClosePrice: 100, FloorPrice: 93, RefPrice: 100, CeilingPrice: 107 });
  const result = await fetchMarketDay("2026-11-24", { pauseMs: 0, call: async (_, { market }) => ({ data: market === "HOSE" ? [
    row("FPT", "2026-11-23"), row("FPT", "2026-11-24"), row("FPT", "2026-11-24"), row("ERR", "invalid"),
  ] : [] }) });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].date, "2026-11-24");
  assert.deepEqual(result.coverage.HOSE, { received: 4, accepted: 1, invalid: 1, wrongSession: 1, duplicate: 1 });
});

test("EOD accepts configured fallback with the target day and keeps provenance when all feeds are stale", async () => {
  const older = [{ date: "2026-11-23", close: 100 }], fresh = [{ date: "2026-11-24", close: 101 }];
  let rows = fresh;
  const router = new SourceRouter({
    ssiV3: { source: "SSI_V3", isConfigured: () => true, getDailyOhlcv: async () => older },
    ssiFcV2: { source: "SSI_FC_V2", isConfigured: () => true, getDailyOhlcv: async () => rows },
  });
  const target = { accept: (bars) => bars.some((bar) => bar.date === "2026-11-24") };
  const result = await router.run("ohlcvDaily", "getDailyOhlcv", [], target);
  assert.equal(result.source, "SSI_FC_V2");
  assert.equal(result.fallbackReason, "MISSING_TARGET_SESSION");
  rows = older;
  const exhausted = await router.run("ohlcvDaily", "getDailyOhlcv", [], target);
  assert.equal(exhausted.source, "SSI_V3");
  assert.deepEqual(exhausted.data, older);
  assert.equal(exhausted.attempts.length, 2);
});

test("research RVOL seals a verified same-minute sample and excludes the open minute", async () => {
  const currentDay = "2026-11-24", prior = "2026-11-23", observedAt = Date.parse(`${currentDay}T03:18:20Z`);
  const bar = (date, time, volume) => ({ date: `${date}T${time}:00+07:00`, open: 100, high: 102, low: 98, close: 101, volume });
  const baseline = tradingDatesBack(prior, 20);
  const service = { cache: new TtlCache(),
    store: { getMarketDailyDates: async () => [prior], getMarketDailyRange: async () => [{ ...bar(prior, "15:00", 2000), date: prior, closeAdj: 101, value: 202_000 }] },
    router: { providers: { ssiFcV2: { isConfigured: () => true,
      getIntradayRange: async (_symbol, from, to) => {
        assert.equal(from, baseline[0]); assert.equal(to, prior);
        return baseline.slice(-10).flatMap((date) => [bar(date, "09:10", 200), bar(date, "10:15", 300), bar(date, "15:00", 1000)]);
      },
      getIntradayOhlcv: async () => [bar(currentDay, "09:10", 400), bar(currentDay, "10:15", 800), bar(currentDay, "10:18", 9999)],
    } } },
  };
  const volume = await getVolumeAnalysis(service, "FPT", { now: () => observedAt, detail: "research" });
  assert.equal(volume.partialToday, true);
  assert.equal(volume.today.rvolTimeAdjusted, 2.4);
  assert.deepEqual(volume.intraday.sameTime, { asOfTime: "10:15", sessions: 10, ratio: 2.4, ticker: "FPT", session: currentDay,
    traded: 1200, median: 500, methodVersion: "rvol-same-minute-v1", source: "SSI_FC_V2" });
  const room = createResearchRoom({ store: createMemoryStore(), now: () => observedAt, expectedClosedSession: () => prior,
    load: () => ({ decision: async () => ({ ...decision, date: prior }), instrument: async () => ({ ticker: "FPT", exchange: "HOSE" }),
      price: async () => ({ priceBasis: "ADJUSTED_CUMULATIVE", bars: [{ ...bar(prior, "15:00", 2000), date: prior }] }), volume: async () => volume }) });
  const projection = await room.lock("alice", "FPT");
  const check = evaluateConfirmation(projection).checks.find((item) => item.id === "volume");
  assert.equal(check?.state, "WAIT");
  assert.ok(projection.snap.refs.some((ref) => ref.fieldPath === "rvolTimeAdjusted" && ref.value === 2.4 && ref.freshness === "CURRENT"));
  const invalid = structuredClone(projection);
  invalid.data.volume.intraday.sameTime.asOfTime = "10:18";
  assert.equal(evaluateConfirmation(invalid).checks.find((item) => item.id === "volume")?.state, "MISSING");
});
