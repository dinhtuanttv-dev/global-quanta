// 13/11/2026 — kho chuỗi giá của các bộ lọc: mã thiếu lịch sử giá danh nghĩa (market_adjusted_series) phải lấy giá danh nghĩa dự phòng
// (kho VNDirect) để vẫn dựng được chuỗi ĐIỀU CHỈNH CỘNG DỒN, thay vì rơi về SSI_LATEST_EVENT_ADJUSTED còn nguyên bước nhảy ngày quyền.
import test from "node:test";
import assert from "node:assert/strict";
import { createScreenerSeries, resetScreenerSeriesMemo, setNominalFallback, vndNominalMap } from "../src/market/strategies/screenerSeries.js";

const DATES = [];
for (let d = Date.UTC(2026, 6, 1); DATES.length < 80; d += 86_400_000) { const wd = new Date(d).getUTCDay(); if (wd !== 0 && wd !== 6) DATES.push(new Date(d).toISOString().slice(0, 10)); }
const EX = DATES[60]; // ngày không hưởng quyền: thưởng cổ phiếu 25% (giá danh nghĩa 50.000 -> 40.000)
const nominalClose = (i) => (i < 60 ? 50000 : 40000);
// SSI DailyOhlc: mọi nến lịch sử bị nhân hệ số của đợt quyền GẦN NHẤT (0,8) — kể cả các phiên trước ngày quyền.
const ssiBars = DATES.slice(0, 78).map((date, i) => { const c = i < 60 ? 40000 : 40000; return { date, open: c, high: c + 400, low: c - 400, close: c, volume: 1000, value: c * 1000 }; });
const daily = DATES.slice(76).map((date) => ({ symbol: "SPL", date, open: 40000, high: 40400, low: 39600, close: 40000, volume: 1000, value: 4e7 }));
const events = [{ exDate: EX, cash: 0, ratio: 0.25, label: "Thưởng cổ phiếu 25%" }];

const mkStore = (adjBars) => ({
  getMarketDailyDates: async () => DATES,
  getMarketDailyRange: async () => daily,
  getBars: async (_s, from, to) => ssiBars.filter((b) => b.date >= from && b.date <= to),
  selectRows: async () => (adjBars ? [{ bars: adjBars }] : []),
});
const corporateActions = { get: async () => ({ events }), prefetch: async () => {} };
const vndRows = DATES.slice(0, 78).map((d, i) => [d, 40, 1e9, nominalClose(i) / 1000]);
const load = async (store) => (await createScreenerSeries({ store, corporateActions, historyDays: 400 }).prepare(["SPL"]))("SPL");

test("vndNominalMap: giá đóng cửa danh nghĩa (nghìn đồng -> đồng), bỏ dòng thiếu", () => {
  const m = vndNominalMap([["2026-01-02", 38.6, 1e9, 46.6], ["2026-01-05", 38.9, 1e9, null], ["2026-01-06", 37.4, 1e9, 37.4]]);
  assert.deepEqual([...m], [["2026-01-02", 46600], ["2026-01-06", 37400]]);
  assert.equal(vndNominalMap([]), null); assert.equal(vndNominalMap(null), null);
});

test("thiếu lịch sử danh nghĩa: không có nguồn dự phòng -> SSI_LATEST_EVENT_ADJUSTED; có nguồn dự phòng -> chuỗi điều chỉnh cộng dồn", async () => {
  setNominalFallback(null); resetScreenerSeriesMemo();
  const bad = await load(mkStore(null));
  assert.equal(bad.priceBasis, "SSI_LATEST_EVENT_ADJUSTED"); assert.equal(bad.nominalSource, "GATEWAY"); assert.equal(bad.nominalCoverage, 0);

  setNominalFallback((t) => (t === "SPL" ? vndNominalMap(vndRows) : null)); resetScreenerSeriesMemo();
  const ok = await load(mkStore(null));
  assert.equal(ok.priceBasis, "ADJUSTED_CUMULATIVE"); assert.equal(ok.nominalSource, "VNDIRECT"); assert.equal(ok.nominalCoverage, 1);
  // Chuỗi điều chỉnh liền mạch qua ngày quyền: không có phiên nào lệch quá 2% so với phiên trước.
  const jumps = ok.bars.slice(1).filter((b, i) => Math.abs(b.close / ok.bars[i].close - 1) > 0.02);
  assert.equal(jumps.length, 0, `còn bước nhảy: ${jumps.map((b) => b.date).join(", ")}`);
  assert.equal(ok.bars.at(-1).close, 40000);
  assert.ok(Math.abs(ok.bars[0].close - 40000) < 1, "phiên trước ngày quyền được điều chỉnh lùi 50.000 × 0,8");
  setNominalFallback(null); resetScreenerSeriesMemo();
});

test("kho Gateway đủ lịch sử: không đụng tới nguồn dự phòng; kho thiếu một phần: bù bằng VNDirect, bản Gateway thắng ở ngày trùng", async () => {
  let called = 0;
  setNominalFallback(() => { called++; return vndNominalMap(vndRows); }); resetScreenerSeriesMemo();
  const full = await load(mkStore(DATES.slice(0, 78).map((d, i) => [d, nominalClose(i)])));
  assert.equal(full.priceBasis, "ADJUSTED_CUMULATIVE"); assert.equal(full.nominalSource, "GATEWAY"); assert.equal(called, 0);
  resetScreenerSeriesMemo();
  const part = await load(mkStore(DATES.slice(50, 78).map((d, i) => [d, nominalClose(i + 50)])));
  assert.equal(part.priceBasis, "ADJUSTED_CUMULATIVE"); assert.equal(part.nominalSource, "GATEWAY+VNDIRECT"); assert.equal(called, 1); assert.equal(part.nominalCoverage, 1);
  setNominalFallback(null); resetScreenerSeriesMemo();
});
