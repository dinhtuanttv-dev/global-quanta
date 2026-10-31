import { test } from "node:test";
import assert from "node:assert/strict";
import { createScannerJobs } from "../src/market/scanner/scannerJobs.js";
import { buildStateSeries, panelByDate } from "../src/market/tradingMatrix/marketState.js";

const day = (date, net) => Array.from({ length: 60 }, (_, i) => ({ symbol: `S${i}`, date, close: 10, closeAdj: 7, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: i === 0 && net > 0 ? net : 0, foreignSellVal: i === 0 && net < 0 ? -net : 0 }));

test("nạp lại khối ngoại cho phiên lưu 0, không đụng giá đã điều chỉnh và phiên đã có số", async () => {
  const db = new Map([["2026-10-27", day("2026-10-27", -5)], ["2026-10-28", day("2026-10-28", 0)], ["2026-10-29", day("2026-10-29", 0)]]);
  const asked = [];
  const store = { getMarketDailyDates: async () => [...db.keys()], getMarketDailyByDate: async (d) => db.get(d), upsertMarketDaily: async (rows) => db.set(rows[0].date, rows) };
  const fetchDay = async (date) => { asked.push(date); return { rows: day(date, date === "2026-10-28" ? -273 : 0).map((r) => ({ ...r, closeAdj: 9 })), requests: 1 }; };
  const r = await createScannerJobs({ store }, { fetchDay }).repairForeign();
  assert.deepEqual(r.repaired, ["2026-10-28"]);
  assert.deepEqual(asked, ["2026-10-28", "2026-10-29"]);
  assert.equal(db.get("2026-10-28")[0].foreignSellVal, 273);
  assert.equal(db.get("2026-10-28")[0].closeAdj, 7);
});

test("phiên thiếu khối ngoại là thiếu dữ liệu: không kéo tỷ lệ 5 phiên về 0, thiếu quá nhiều thì không tính", () => {
  const dates = Array.from({ length: 8 }, (_, i) => `2026-01-0${i + 1}`);
  const rows = dates.map((date, i) => ({ symbol: "A", date, close: 10, closeAdj: 10, value: 100, foreignBuyVal: 0, foreignSellVal: [2, 3, 5].includes(i) ? 0 : 10 }));
  const panel = panelByDate(new Map([["A", rows]]), dates);
  assert.equal(panel[2].foreign, null);
  assert.equal(panel[0].fgnTop.s, "A");
  const bars = dates.map((date, i) => ({ date, open: 100, high: 101, low: 99, close: 100 + i }));
  const s = buildStateSeries({ panel, indexBars: bars });
  assert.equal(s[2].fnr1, null);
  assert.equal(s[7].fnr5, -10);
  const gaps = panelByDate(new Map([["A", rows.map((r, i) => (i >= 3 && i <= 5 ? { ...r, foreignSellVal: 0 } : r))]]), dates);
  assert.equal(buildStateSeries({ panel: gaps, indexBars: bars })[5].fnr5, null);
});
