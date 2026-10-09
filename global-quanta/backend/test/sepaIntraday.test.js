// SEPA SP6 — cảnh báo phá vỡ trong phiên: phút giao dịch HOSE, ngoại suy KL (s.270), trạng thái so với pivot (s.265).
import test from "node:test";
import assert from "node:assert/strict";
import { HOSE_SESSION_MINUTES, hoseMinutesElapsed, intradayBreakout } from "../src/market/strategies/sepa/intraday.js";
import { buildSepaIntraday, sepaIntradayCandidates } from "../src/market/strategies/sepaIntraday.js";

test("phút giao dịch HOSE: 9:00–11:30 + 13:00–14:45 = 255 phút; nghỉ trưa không tính", () => {
  assert.equal(HOSE_SESSION_MINUTES, 255);
  assert.equal(hoseMinutesElapsed(8 * 60 + 50), 0);
  assert.equal(hoseMinutesElapsed(10 * 60), 60);
  assert.equal(hoseMinutesElapsed(12 * 60), 150);
  assert.equal(hoseMinutesElapsed(13 * 60 + 30), 180);
  assert.equal(hoseMinutesElapsed(15 * 60), 255);
});

test("trạng thái: phá vỡ đạt KL dự phóng ≥ 1,4× TB50, KL yếu, quá vùng mua +5%, gần pivot, dưới pivot", () => {
  const base = { pivot: 100, vol50: 1_000_000, minutesElapsed: 120 };
  // 120/255 phút với 700k cp -> dự phóng ~1,49tr = 1,49× TB50
  const bo = intradayBreakout({ ...base, price: 101, totalVolume: 700_000 });
  assert.equal(bo.state, "BREAKOUT");
  assert.ok(Math.abs(bo.projRatio - (700_000 * 255) / 120 / 1e6) < 1e-9);
  assert.equal(intradayBreakout({ ...base, price: 101, totalVolume: 300_000 }).state, "BREAKOUT_LOW_VOL");
  assert.equal(intradayBreakout({ ...base, price: 105.5, totalVolume: 900_000 }).state, "EXTENDED");
  assert.equal(intradayBreakout({ ...base, price: 98, totalVolume: 900_000 }).state, "NEAR");
  assert.equal(intradayBreakout({ ...base, price: 90, totalVolume: 900_000 }).state, "BELOW");
  assert.equal(intradayBreakout({ ...base, minutesElapsed: 10, price: 101, totalVolume: 100_000 }).reliable, false);
  assert.equal(intradayBreakout({ ...base, pivot: 0, price: 1, totalVolume: 1 }), null);
});

const doc = {
  dataAsOf: "2026-10-09",
  results: [
    { ticker: "AAA", list: "CẢNH BÁO MUA", status: "NEAR_PIVOT", metrics: { pivot: 100, vol50: 1e6, pattern: "VCP", footprint: "8W 20/4 3T", stopPct: 6 } },
    { ticker: "BBB", list: "THEO DÕI", status: "FORMING", metrics: { pivot: 50, vol50: 2e6 } },
    { ticker: "CCC", list: "SẴN SÀNG MUA", status: "BREAKOUT", metrics: { pivot: 20, vol50: 1e6 } }, // đã phá vỡ ở phiên quét
    { ticker: "DDD", list: "LOẠI", status: "NEAR_PIVOT", metrics: { pivot: 10, vol50: 1e6 } },
    { ticker: "EEE", list: "CẢNH BÁO MUA", status: "SQUAT", metrics: { pivot: 30, vol50: 5e5 } },
  ],
};

test("ứng viên: chỉ 3 danh sách, có pivot + TB50, CHƯA phá vỡ ở phiên quét (đang hình thành / gần pivot / squat)", () => {
  assert.deepEqual(sepaIntradayCandidates(doc).map((r) => r.ticker), ["AAA", "BBB", "EEE"]);
});

test("bảng trong phiên: xếp phá vỡ trước; giữ thời điểm đầu tiên thấy phá vỡ trong ngày; báo mã thiếu giá", () => {
  const now = new Date("2026-10-12T03:00:00Z"); // 10:00 giờ VN, thứ Hai
  const firstSeen = new Map();
  const quotes = {
    AAA: { price: 101, totalVolume: 600_000, time: "2026-10-12T09:59:00+07:00" }, // 60 phút -> dự phóng 2,55× -> BREAKOUT
    BBB: { price: 49, totalVolume: 100_000, time: "2026-10-12T09:59:00+07:00" },
  };
  const r = buildSepaIntraday({ doc, quotes, now, firstSeen });
  assert.equal(r.session, "LO");
  assert.equal(r.minutesElapsed, 60);
  assert.equal(r.rows[0].ticker, "AAA");
  assert.equal(r.rows[0].state, "BREAKOUT");
  assert.equal(r.counts.breakout, 1);
  assert.equal(r.rows.find((x) => x.ticker === "BBB").state, "NEAR");
  assert.equal(r.rows.find((x) => x.ticker === "EEE").reason, "NO_QUOTE");
  const since = r.rows[0].since;
  const later = buildSepaIntraday({ doc, quotes, now: new Date("2026-10-12T03:30:00Z"), firstSeen });
  assert.equal(later.rows[0].since, since, "giữ thời điểm phát hiện đầu tiên");
  // giá cũ (không phải hôm nay) -> không ngoại suy khối lượng
  const stale = buildSepaIntraday({ doc, quotes: { AAA: { ...quotes.AAA, time: "2026-10-09T14:45:00+07:00" } }, now });
  assert.equal(stale.rows.find((x) => x.ticker === "AAA").projRatio, null);
});
