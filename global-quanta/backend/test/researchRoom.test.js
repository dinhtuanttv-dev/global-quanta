import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createResearchRoom } from "../src/market/elite/researchRoom.js";
import { getVolumeAnalysis } from "../src/market/scanner/volumeService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { makeResearchRun } from "../src/market/vendor/evidenceRoom.mjs";

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
