process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { ADJUSTED_TABLE, buildAdjustedFromNominal, createAdjustedHistory, hoseTick } from "../src/market/adjusted/adjustedHistory.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { addDays } from "../src/market/util.js";

const row = (date, close, ref, avg = close, volume = 1000) => ({ date, close, ref, avg, volume });

test("dựng chuỗi từ giá danh nghĩa + tham chiếu (HOSE): GDKHQ tiền mặt, làm tròn bước giá, dữ liệu lỗi", () => {
  // VNM thật: GDKHQ 26/06/2026 cổ tức 1.850đ: tham chiếu = 58.400 − 1.850 = 56.550.
  const rows = [
    row("2026-06-23", 58_300, 58_000), row("2026-06-24", 58_400, 58_300),
    row("2026-06-25", 58_400, 58_400), row("2026-06-26", 56_600, 56_550),
    row("2026-06-29", 56_700, 56_600),
  ];
  const r = buildAdjustedFromNominal(rows);
  assert.equal(r.base, "close");
  assert.deepEqual(r.events.map((e) => e.date), ["2026-06-26"]);
  const f = 56_550 / 58_400;
  assert.ok(Math.abs(r.bars[2].adjClose - 58_400 * f) < 1e-3);
  assert.equal(r.bars.at(-1).adjClose, 56_700, "phiên cuối = giá danh nghĩa");
  // Lợi suất ngày GDKHQ trên chuỗi điều chỉnh = 56.600 / 56.550 − 1 (không còn "lỗ" giả bằng cổ tức).
  assert.ok(Math.abs(r.bars[3].adjClose / r.bars[2].adjClose - 56_600 / 56_550) < 1e-9);

  // Tham chiếu lệch trong 1 bước giá (làm tròn) -> không phải sự kiện; tham chiếu > cơ sở -> lỗi dữ liệu.
  const noisy = buildAdjustedFromNominal([row("a1", 9_950, 9_900), row("a2", 9_990, 9_940), row("a3", 10_000, 12_000)]);
  assert.equal(noisy.events.length, 0);
  assert.equal(noisy.anomalies.length, 1);
  assert.equal(hoseTick(9_000), 10);
});

test("thưởng cổ phiếu 20%: hệ số = 1/1,2; HNX/UPCoM dùng giá bình quân phiên trước làm cơ sở", () => {
  const bonus = buildAdjustedFromNominal([row("b1", 132_000, 131_000), row("b2", 132_000, 132_000), row("b3", 111_000, 110_000)]);
  assert.ok(Math.abs(bonus.events[0].factor - 110_000 / 132_000) < 1e-4);
  // HNX: tham chiếu hằng ngày = giá bình quân phiên trước (khác giá đóng cửa).
  const hnx = buildAdjustedFromNominal([
    row("h1", 20_000, 19_900, 20_100), row("h2", 20_300, 20_100, 20_200), row("h3", 20_000, 20_200, 20_150),
    row("h4", 19_000, 19_150, 19_100), // GDKHQ 1.000đ: tham chiếu = 20.150 − 1.000
  ]);
  assert.equal(hnx.base, "avg");
  assert.deepEqual(hnx.events.map((e) => e.date), ["h4"]);
  assert.ok(Math.abs(hnx.events[0].factor - 19_150 / 20_150) < 1e-4);
});

// SSI giả lập: mỗi ngày lịch là một phiên.
function makeSsi() {
  const state = { calls: [], lastDate: "2026-10-01" };
  const days = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const service = {
    router: {
      run: async (dataset, method, [symbol, from, to]) => {
        state.calls.push({ method, symbol, from, to });
        const end = to < state.lastDate ? to : state.lastDate;
        return { source: "SSI_FC_V2", data: days(from, end).map((date) => row(date, 50_000, 50_000)) };
      },
    },
    getOhlcv: async ({ from, to }) => ({ bars: days(from, to < state.lastDate ? to : state.lastDate).map((date) => ({ date, close: 1700, volume: 1 })), provenance: { source: "SSI_FC_V2" } }),
  };
  return { state, service };
}

test("kho giá danh nghĩa: FULL -> CACHE (2 giờ) -> APPEND chỉ tải đuôi; giới hạn tải đầy đủ theo giờ; chỉ số", async () => {
  const store = createMemoryStore();
  const { state, service } = makeSsi();
  let t = Date.parse("2026-10-02T03:00:00Z");
  const h = createAdjustedHistory({ service, store, now: () => t });

  const first = await h.get("vnm", { years: 1 });
  assert.equal(first.refresh, "FULL");
  assert.equal(first.bars.at(-1).date, "2026-10-01");
  assert.deepEqual(Object.keys(first.bars[0]).sort(), ["close", "date", "ref", "volume"], "trả giá danh nghĩa, không trả giá điều chỉnh");
  assert.equal(state.calls[0].method, "getDailyStockPriceNominal");
  const n = state.calls.length;
  t += 30 * 60_000;
  assert.equal((await h.get("VNM", { years: 1 })).refresh, "CACHE");
  assert.equal(state.calls.length, n);

  state.lastDate = "2026-10-02";
  t = Date.parse("2026-10-03T03:00:00Z");
  const app = await h.get("VNM", { years: 1 });
  assert.equal(app.refresh, "APPEND");
  assert.equal(app.bars.at(-1).date, "2026-10-02");
  assert.ok(state.calls.at(-1).from >= "2026-09-20", "chỉ tải đuôi");
  const [stored] = await store.selectRows(ADJUSTED_TABLE, { eq: { symbol: "VNM" } });
  assert.equal(stored.bars.at(-1).length, 5, "lưu giá danh nghĩa [date, close, ref, avg, volume]");

  const limited = createAdjustedHistory({ service, store: createMemoryStore(), now: () => t, fullRefetchPerHour: 1 });
  await limited.get("AAA", { years: 1 });
  await assert.rejects(limited.get("BBB", { years: 1 }), (e) => e.statusCode === 503);
  const idx = await h.get("VNINDEX", { years: 1 });
  assert.equal(idx.index, true);
  assert.equal(idx.bars[0].close, 1700);
  await assert.rejects(h.get("<x>"), (e) => e.statusCode === 400);
});
