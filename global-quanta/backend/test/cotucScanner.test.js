process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { createCotucScanner, cotucScanConfig, inSeasonalityWindow, lastSlotAt, COTUC_SCAN_KV } from "../src/market/cotuc/cotucScanner.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

// Thứ Sáu 02/10/2026 (ngày giao dịch). Giờ VN = UTC+7.
const at = (hhmm, day = "2026-10-02") => Date.parse(`${day}T${hhmm}:00+07:00`);
const config = { ...cotucScanConfig({ PROJECT_A_CRON_SECRET: "s3cret" }), base: "https://pa.test" };

function fakeProjectA({ total = 60, fail = () => false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, offset: Number(u.searchParams.get("offset")), phase: u.searchParams.get("phase"), auth: init.headers.authorization });
    if (fail(u)) return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const limit = Number(u.searchParams.get("limit") ?? 0);
    const nextOffset = offset + limit >= total ? 0 : offset + limit;
    if (u.pathname.endsWith("timing-signals-scan")) {
      return new Response(JSON.stringify({ offset, nextOffset, totalTickers: total, processedInThisCall: limit, decisionCount: limit, levels: { AVOID: limit }, regime: "RISK_OFF", intraday: { quotes: limit }, errors: [] }));
    }
    if (u.searchParams.get("phase") === "finalize") return new Response(JSON.stringify({ finalized: total }));
    return new Response(JSON.stringify({ collected: [{ ticker: "A", ok: true }], offset, nextOffset, totalTickers: total }));
  };
  return { calls, fetchImpl };
}

test("cotucScanConfig: không có secret -> tắt, không lộ secret trong status", () => {
  assert.equal(cotucScanConfig({}).enabled, false);
  assert.equal(cotucScanConfig({ PROJECT_A_CRON_SECRET: "x", MARKET_COTUC_SCAN_ENABLED: "false" }).enabled, false);
  const s = createCotucScanner({ config: cotucScanConfig({}) }).status();
  assert.equal(s.enabled, false);
  assert.match(s.reason, /PROJECT_A_CRON_SECRET/);
  assert.ok(!JSON.stringify(createCotucScanner({ config }).status()).includes("s3cret"));
});

test("N1 trong phiên: một vòng liền mạch (các lô nối nhau mỗi nhịp) rồi nghỉ tới 60 phút sau", async () => {
  let t = at("10:00");
  const pa = fakeProjectA({ total: 60 });
  const sc = createCotucScanner({ store: createMemoryStore(), fetchImpl: pa.fetchImpl, now: () => t, config });
  assert.equal(await sc.tick(), "timing");
  t += 30_000; assert.equal(await sc.tick(), "timing");
  t += 30_000; assert.equal(await sc.tick(), "timing");
  assert.deepEqual(pa.calls.map((c) => c.offset), [0, 25, 50]);
  assert.equal(pa.calls[0].auth, "Bearer s3cret");
  let st = sc.status();
  assert.equal(st.mode, "SESSION");
  assert.equal(st.timing.passes, 1);
  assert.equal(st.timingPassActive, false);
  assert.equal(st.timing.lastResult.liveQuotes, 25);
  for (let i = 0; i < 20; i++) { t += 120_000; assert.equal(await sc.tick(), null, "Neon được nghỉ giữa hai vòng"); }
  t = at("11:00"); assert.equal(await sc.tick(), "timing", "đủ 60 phút -> vòng mới");
  assert.equal(pa.calls.length, 4);
  st = sc.status();
  assert.equal(st.intervals.sessionMs, 3_600_000);
  assert.deepEqual(st.intervals.offHoursSlotsVn, ["08:00", "15:05"]);
});

test("N1 ngoài phiên: chỉ chạy ở mốc 15:05 và 08:00; mùa vụ KQKD nối liền trong khung 05:00–08:45 rồi finalize", async () => {
  let t = at("15:05");
  const pa = fakeProjectA({ total: 6 });
  const sc = createCotucScanner({ store: createMemoryStore(), fetchImpl: pa.fetchImpl, now: () => t, config });
  assert.equal(await sc.tick(), "timing", "mốc 15:05");
  for (const hhmm of ["15:30", "18:00", "20:00", "23:59"]) { t = at(hhmm); assert.equal(await sc.tick(), null, `${hhmm}: nghỉ`); }
  t = at("05:00", "2026-10-03"); assert.equal(await sc.tick(), "seasonality");
  t += 30_000; assert.equal(await sc.tick(), "seasonality");
  const st = sc.status();
  assert.equal(st.seasonality.passes, 1);
  assert.ok(st.seasonality.lastFinalizeAt);
  assert.equal(pa.calls.filter((c) => c.phase === "finalize").length, 1);
  t += 30_000; assert.equal(await sc.tick(), null, "vòng mùa vụ vừa xong -> không chạy lại");
  t = at("08:00", "2026-10-03"); assert.equal(await sc.tick(), "timing", "mốc 08:00");
  t = at("08:30", "2026-10-03"); assert.equal(await sc.tick(), null);
});

test("lỗi lặp lại 3 lần cùng lô -> bỏ qua lô để vòng quét không kẹt", async () => {
  let t = at("10:00");
  const pa = fakeProjectA({ total: 60, fail: (u) => u.searchParams.get("offset") === "25" });
  const sc = createCotucScanner({ store: createMemoryStore(), fetchImpl: pa.fetchImpl, now: () => t, config });
  await sc.tick();
  for (let i = 0; i < 3; i++) { t += 30_000; await sc.tick(); }
  const st = sc.status();
  assert.equal(st.timing.offset, 50);
  assert.deepEqual(st.timing.skippedOffsets, [25]);
  assert.match(st.timing.lastError.message, /HTTP 500/);
});

test("offset lưu KV và nạp lại sau khởi động", async () => {
  const store = createMemoryStore();
  let t = at("10:00");
  const pa = fakeProjectA({ total: 60 });
  await createCotucScanner({ store, fetchImpl: pa.fetchImpl, now: () => t, config }).tick();
  assert.equal((await store.getKv(COTUC_SCAN_KV)).value.timing.offset, 25);
  const again = createCotucScanner({ store, fetchImpl: pa.fetchImpl, now: () => t, config });
  await again.tick();
  assert.equal(pa.calls.at(-1).offset, 25);
});

test("inSeasonalityWindow: mặc định 05:00–08:45 giờ VN, hỗ trợ khung qua nửa đêm; lastSlotAt xét cả hôm qua", () => {
  assert.equal(inSeasonalityWindow(new Date(at("05:00"))), true);
  assert.equal(inSeasonalityWindow(new Date(at("08:44"))), true);
  assert.equal(inSeasonalityWindow(new Date(at("08:45"))), false);
  assert.equal(inSeasonalityWindow(new Date(at("23:00")), [22 * 60, 2 * 60]), true);
  assert.equal(inSeasonalityWindow(new Date(at("12:00")), [22 * 60, 2 * 60]), false);
  assert.equal(lastSlotAt(at("07:00"), [8 * 60, 15 * 60 + 5]), at("15:05", "2026-10-01"));
  assert.equal(lastSlotAt(at("09:00"), [8 * 60, 15 * 60 + 5]), at("08:00"));
});
