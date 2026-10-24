// A2 (C-07) — dữ liệu người dùng có phiên bản do máy chủ cấp: lưu kèm phiên bản gốc khác bản đang giữ -> 409 + bản hiện tại;
// không gửi phiên bản gốc -> ghi như trước (máy khách cũ); hai lần lưu cùng mili-giây vẫn có phiên bản khác nhau.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { saveUserChartState } from "../src/market/watchlists/userChartState.js";
import { saveUserWorkspace } from "../src/market/watchlists/userWorkspace.js";
import { saveUserElliottCounts } from "../src/market/watchlists/userElliottCounts.js";
import { nextRevision } from "../src/market/watchlists/revision.js";

const T = new Date("2026-10-25T03:00:00.000Z");
const line = (id) => ({ id, toolType: "trendline", p1: { date: "2026-01-05", price: 10 }, p2: { date: "2026-01-20", price: 12 }, createdAt: 1 });

test("hình vẽ: thiết bị B lưu sau thiết bị A với phiên bản gốc cũ -> 409 kèm bản của A; đúng phiên bản -> ghi được", async () => {
  const store = createMemoryStore();
  const a = await saveUserChartState(store, "u1", "FPT", { primitives: [line("a")], baseUpdatedAt: null }, T);
  await assert.rejects(saveUserChartState(store, "u1", "FPT", { primitives: [line("b")], baseUpdatedAt: null }, T),
    (e) => e.statusCode === 409 && e.current.primitives[0].id === "a" && e.current.updatedAt === a.updatedAt);
  const b = await saveUserChartState(store, "u1", "FPT", { primitives: [line("a"), line("b")], baseUpdatedAt: a.updatedAt }, T);
  assert.ok(b.updatedAt > a.updatedAt, "cùng mili-giây vẫn tăng phiên bản");
  // Máy khách cũ (không gửi baseUpdatedAt) vẫn ghi được.
  await saveUserChartState(store, "u1", "FPT", { primitives: [] }, T);
});

test("bố cục và cách đếm Elliott cũng có kiểm tra phiên bản", async () => {
  const store = createMemoryStore();
  const w = await saveUserWorkspace(store, "u1", { workspace: { preset: "clean" }, baseUpdatedAt: null }, T);
  await assert.rejects(saveUserWorkspace(store, "u1", { workspace: { preset: "momentum" }, baseUpdatedAt: null }, T), (e) => e.statusCode === 409 && e.current.workspace.preset === "clean");
  await saveUserWorkspace(store, "u1", { workspace: { preset: "momentum" }, baseUpdatedAt: w.updatedAt }, T);
  const k = { symbol: "FPT", timeframe: "D" };
  const c = await saveUserElliottCounts(store, "u1", k, { activeId: null, versions: [], baseUpdatedAt: null }, T);
  await assert.rejects(saveUserElliottCounts(store, "u1", k, { activeId: null, versions: [], baseUpdatedAt: "2020-01-01T00:00:00.000Z" }, T), (e) => e.statusCode === 409);
  await saveUserElliottCounts(store, "u1", k, { activeId: null, versions: [], baseUpdatedAt: c.updatedAt }, T);
});

test("nextRevision tăng nghiêm ngặt", () => {
  assert.equal(nextRevision(T, null), T.toISOString());
  assert.equal(nextRevision(T, T.toISOString()), "2026-10-25T03:00:00.001Z");
  assert.equal(nextRevision(new Date("2026-10-25T04:00:00Z"), T.toISOString()), "2026-10-25T04:00:00.000Z");
});

test("A3 intradayQuality: nến 1 phút thật vs ảnh chụp 15 phút phẳng (như DGC 24/10) -> độ phân giải thực tế", async () => {
  const { intradayQuality } = await import("../src/market/adjusted/taIntraday.js");
  const mk = (stepMin, n, flat) => Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.parse("2026-10-23T09:15:00+07:00") + i * stepMin * 60_000).toISOString();
    const c = 100 + (i % 3);
    return { date: t, open: c, high: flat ? c : c + 1, low: flat ? c : c - 1, close: c, volume: 10 };
  });
  const real = intradayQuality(mk(1, 220, false));
  assert.equal(real.effectiveResolution, "1m"); assert.equal(real.coarse, false); assert.equal(real.flatPct, 0);
  const snap = intradayQuality(mk(15, 17, true));
  assert.deepEqual([snap.effectiveResolution, snap.coarse, snap.flatPct, snap.barsPerSession], ["15m", true, 100, 17]);
  assert.equal(intradayQuality([]).effectiveResolution, null);
});
