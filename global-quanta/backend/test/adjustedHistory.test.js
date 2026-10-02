process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { ADJUSTED_TABLE, createAdjustedHistory, maxOverlapDeviation } from "../src/market/adjusted/adjustedHistory.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { addDays } from "../src/market/util.js";

// Phiên giả lập: mỗi ngày lịch là một phiên (đủ cho logic kho; lịch thật do SSI quyết định).
function makeSsi() {
  const state = { factor: 1, calls: [], lastDate: "2026-10-01" };
  const priceOn = (date) => 100 + (Date.parse(date) / 86_400_000) % 50;
  const daysBetween = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const service = {
    router: {
      run: async (dataset, method, [symbol, from, to]) => {
        state.calls.push({ method, symbol, from, to });
        const end = to < state.lastDate ? to : state.lastDate;
        return { source: "SSI_FC_V2", data: daysBetween(from, end).map((date) => ({ date, close: priceOn(date) * state.factor, volume: 1000 })) };
      },
    },
    getOhlcv: async ({ symbol, from, to }) => ({
      bars: daysBetween(from, to < state.lastDate ? to : state.lastDate).map((date) => ({ date, close: symbol === "VNINDEX" ? 1700 : priceOn(date), volume: 1 })),
      provenance: { source: "SSI_FC_V2" },
    }),
  };
  return { state, service };
}

test("maxOverlapDeviation: so giá điều chỉnh trên các ngày trùng", () => {
  assert.equal(maxOverlapDeviation([{ date: "a", adjClose: 100 }], [{ date: "b", adjClose: 1 }]), null);
  assert.ok(Math.abs(maxOverlapDeviation([{ date: "a", adjClose: 100 }, { date: "b", adjClose: 50 }], [{ date: "a", adjClose: 100 }, { date: "b", adjClose: 49 }]) - 0.02) < 1e-12);
});

test("kho giá điều chỉnh SSI: FULL lần đầu -> CACHE trong 2 giờ -> APPEND ngày mới -> FULL khi hệ số điều chỉnh đổi", async () => {
  const store = createMemoryStore();
  const { state, service } = makeSsi();
  let t = Date.parse("2026-10-02T03:00:00Z"); // 10:00 VN 02/10 -> phiên đã đóng gần nhất 01/10
  const h = createAdjustedHistory({ service, store, now: () => t });

  const first = await h.get("vnm", { years: 1 });
  assert.equal(first.refresh, "FULL");
  assert.equal(first.symbol, "VNM");
  assert.equal(first.bars.at(-1).date, "2026-10-01");
  assert.ok(first.bars[0].date <= "2025-10-02");
  assert.ok(first.bars[0].adjClose > 0 && !("close" in first.bars[0]));
  const callsAfterFull = state.calls.length;

  t += 30 * 60_000;
  assert.equal((await h.get("VNM", { years: 1 })).refresh, "CACHE");
  assert.equal(state.calls.length, callsAfterFull, "trong 2 giờ: không gọi SSI");

  // Ngày hôm sau có phiên mới, hệ số không đổi -> chỉ tải đuôi và nối thêm.
  state.lastDate = "2026-10-02";
  t = Date.parse("2026-10-03T03:00:00Z");
  const appended = await h.get("VNM", { years: 1 });
  assert.equal(appended.refresh, "APPEND");
  assert.equal(appended.bars.at(-1).date, "2026-10-02");
  const tailCall = state.calls.at(-1);
  assert.ok(tailCall.from >= "2026-08-20", `chỉ tải đuôi, from=${tailCall.from}`);

  // GDKHQ: SSI điều chỉnh lại toàn bộ lịch sử (×0.95) -> phát hiện lệch phần trùng -> tải lại toàn chuỗi.
  state.factor = 0.95;
  state.lastDate = "2026-10-05";
  t = Date.parse("2026-10-06T03:00:00Z");
  const rebased = await h.get("VNM", { years: 1 });
  assert.equal(rebased.refresh, "FULL");
  assert.equal(rebased.basisChanged, true);
  const before = appended.bars.find((b) => b.date === "2026-01-15").adjClose;
  const sample = rebased.bars.find((b) => b.date === "2026-01-15");
  assert.ok(Math.abs(sample.adjClose / before - 0.95) < 1e-4, "cả chuỗi cùng gốc điều chỉnh mới");
  const [row] = await store.selectRows(ADJUSTED_TABLE, { eq: { symbol: "VNM" } });
  assert.equal(row.to_date, "2026-10-05");
});

test("giới hạn tải đầy đủ theo giờ -> 503; chỉ số dùng chuỗi ngày sẵn có, không điều chỉnh", async () => {
  const store = createMemoryStore();
  const { service } = makeSsi();
  const t = Date.parse("2026-10-02T03:00:00Z");
  const h = createAdjustedHistory({ service, store, now: () => t, fullRefetchPerHour: 1 });
  await h.get("AAA", { years: 1 });
  await assert.rejects(h.get("BBB", { years: 1 }), (e) => e.statusCode === 503);
  const idx = await h.get("VNINDEX", { years: 1 });
  assert.equal(idx.adjusted, false);
  assert.equal(idx.refresh, "INDEX");
  assert.equal(idx.bars[0].adjClose, 1700);
  await assert.rejects(h.get("<x>"), (e) => e.statusCode === 400);
});
