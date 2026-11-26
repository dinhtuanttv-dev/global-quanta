// 26/11/2026 — "nến ma" ngày nghỉ: nguồn ngày ghi dòng 24/11/2026 (không có phiên) với khối lượng 0 cho nhiều mã.
import test from "node:test";
import assert from "node:assert/strict";
import { isPhantomSessionRow, isSessionDate, setHolidayProvider } from "../src/market/calendar.js";
import { createLocalFirstStore } from "../src/market/store/localFirstStore.js";
import { liquidityStats, liquiditySeries } from "../src/market/elite/liquidity.js";

const HOL = new Set(["2026-11-24"]);
test("ngày không có phiên mà không khớp lệnh -> nến ma; có khớp lệnh thì giữ (dữ liệu thật thắng lịch)", () => {
  setHolidayProvider((d) => HOL.has(d));
  try {
    assert.equal(isSessionDate("2026-11-24"), false);
    assert.equal(isSessionDate("2026-11-28"), false); // thứ Bảy
    assert.equal(isSessionDate("2026-11-25"), true);
    assert.equal(isPhantomSessionRow({ date: "2026-11-24", volume: 0, value: null }), true);
    assert.equal(isPhantomSessionRow({ date: "2026-11-24", volume: 1200, value: 5e9 }), false);
    assert.equal(isPhantomSessionRow({ date: "2026-11-25", volume: 0, value: 0 }), false); // mã ngừng giao dịch trong ngày có phiên: giữ
  } finally { setHolidayProvider(null); }
});

test("kho ưu tiên cục bộ lọc nến ma ở mọi lượt đọc ngày; số đo thanh khoản không còn GTGD 0 giả", async () => {
  setHolidayProvider((d) => HOL.has(d));
  try {
    const days = ["2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"];
    const rows = days.map((date, i) => ({ symbol: "HPG", date, close: 20000 + i * 10, closeAdj: 20000 + i * 10, volume: date === "2026-11-24" ? 0 : 1e6, value: date === "2026-11-24" ? 0 : 2e10 }));
    const local = {
      getMarketDailyDates: async () => days,
      getMarketDailyByDate: async (d) => rows.filter((r) => r.date === d),
      getMarketDailyRange: async () => rows,
      coverage: async () => true,
      getBars: async () => rows.map((r) => ({ ...r, open: r.close, high: r.close, low: r.close })),
    };
    const store = createLocalFirstStore({ local, inner: {} });
    assert.deepEqual(await store.getMarketDailyDates(), days.filter((d) => d !== "2026-11-24"));
    assert.equal((await store.getMarketDailyRange({})).some((r) => r.date === "2026-11-24"), false);
    assert.equal((await store.getMarketDailyByDate("2026-11-24")).length, 0);
    assert.equal((await store.getBars("HPG", "2026-11-01", "2026-11-30")).length, 5);
    const clean = (await store.getMarketDailyRange({}));
    assert.equal(liquiditySeries(clean).some((p) => p.v === 0), false);
    assert.equal(liquidityStats(clean).n20, 4); // 5 phiên thật, phiên đầu chỉ làm giá trước
  } finally { setHolidayProvider(null); }
});
