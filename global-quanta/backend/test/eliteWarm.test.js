import test from "node:test";
import assert from "node:assert/strict";
import { eliteWarmTickers, DECISION_KV } from "../src/market/elite/decisionService.js";

test("N5: mã Elite 10 để nạp sẵn nến phút = danh mục của phiên quyết định gần nhất (lọc mã không hợp lệ, không trùng)", async () => {
  const kv = new Map([
    [DECISION_KV.index, { dates: ["2026-10-28", "2026-10-29"] }],
    [DECISION_KV.decision("2026-10-28"), { portfolio: [{ ticker: "AAA" }] }],
    [DECISION_KV.decision("2026-10-29"), { portfolio: [{ ticker: "vpi" }, { ticker: "FPT" }, { ticker: "FPT" }, { ticker: "VNINDEX" }, { ticker: null }] }],
  ]);
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null) };
  assert.deepEqual(await eliteWarmTickers(store), ["VPI", "FPT"]);
  assert.deepEqual(await eliteWarmTickers({ getKv: async () => null }), []);
  assert.deepEqual(await eliteWarmTickers({ getKv: async () => { throw new Error("kho lỗi"); } }), []);
});

test("N5: khoá đệm lịch sử nến phút giống nhau trước giờ mở cửa và trong phiên (kể cả thứ Hai)", async () => {
  const { getIntradaySessions } = await import("../src/market/scanner/intradayService.js");
  const keys = [];
  const service = {
    router: { providers: { ssiFcV2: { isConfigured: () => true, getIntradayRange: async () => [], getIntradayOhlcv: async () => [] } } },
    cache: { wrap: async (k, _ttl, fn) => { keys.push(k); return fn(); } },
  };
  // thứ Hai 02/11/2026: 08:40 (chưa mở) và 10:00 (đang giao dịch)
  await getIntradaySessions(service, "FPT", { now: () => Date.parse("2026-11-02T01:40:00Z") });
  await getIntradaySessions(service, "FPT", { now: () => Date.parse("2026-11-02T03:00:00Z") });
  const hist = keys.filter((k) => k.startsWith("intraday-cycle-hist:"));
  assert.equal(hist.length, 2);
  assert.equal(hist[0], hist[1]);
  assert.match(hist[0], /2026-10-30$/); // thứ Sáu
});

test("Radar danh mục: rankHistory gọn — N phiên gần nhất, danh mục + hạng/Z toàn vũ trụ của mọi mã từng vào danh mục", async () => {
  const { createDecisionService, DECISION_KV: K } = await import("../src/market/elite/decisionService.js");
  const doc = (date, pf, scores) => ({ date, portfolio: pf, scores });
  const kv = new Map([
    [K.index, { dates: ["2026-10-27", "2026-10-28", "2026-10-29"] }],
    [K.decision("2026-10-27"), doc("2026-10-27", [{ ticker: "AAA", rank: 1, Z: 2.5, weight: 0.5 }], [{ ticker: "AAA", rank: 1, Z: 2.5 }, { ticker: "BBB", rank: 9, Z: 1.1 }, { ticker: "ZZZ", rank: 200, Z: -1 }])],
    [K.decision("2026-10-28"), doc("2026-10-28", [{ ticker: "AAA", rank: 2, Z: 2.2, weight: 0.5 }, { ticker: "BBB", rank: 3, Z: 2.0, weight: 0.5, retained: true }], [{ ticker: "AAA", rank: 2, Z: 2.2 }, { ticker: "BBB", rank: 3, Z: 2.0 }])],
    [K.decision("2026-10-29"), doc("2026-10-29", [{ ticker: "BBB", rank: 1, Z: 2.7, weight: 1 }], [{ ticker: "AAA", rank: 30, Z: 0.9 }, { ticker: "BBB", rank: 1, Z: 2.7 }])],
  ]);
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null) };
  const svc = createDecisionService({ store, panel: {}, evidence: {}, vnIndex: {} });
  const h = await svc.rankHistory(2);
  assert.deepEqual(h.dates, ["2026-10-28", "2026-10-29"]);
  assert.deepEqual(h.sessions[1].portfolio, [{ ticker: "BBB", rank: 1, Z: 2.7, weight: 1, retained: false }]);
  assert.deepEqual(h.sessions[1].ranks.AAA, { rank: 30, Z: 0.9 }); // AAA đã ra khỏi danh mục nhưng vẫn có hạng vũ trụ
  assert.equal(h.sessions[0].ranks.ZZZ, undefined); // mã chưa từng vào danh mục không gửi
  assert.equal((await svc.rankHistory(99)).dates.length, 3);
});
