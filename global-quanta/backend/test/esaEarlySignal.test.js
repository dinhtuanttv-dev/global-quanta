import test from "node:test";
import assert from "node:assert/strict";
import { buildEsaEarlySignal } from "../src/market/research/esaEarlySignal.js";

const trainingSessions = Array.from({ length: 24 }, (_, index) => ({
  date: `2026-09-${String(index + 1).padStart(2, "0")}`,
  bars: [
    { date: `2026-09-${String(index + 1).padStart(2, "0")}T09:15:00+07:00`, close: 100, volume: 100 },
    { date: `2026-09-${String(index + 1).padStart(2, "0")}T09:16:00+07:00`, close: 100, volume: 80 + (index % 9) * 5 },
  ],
}));

function liveSessions({ lastMinute = "09:16", currentMinuteVolume = 400 } = {}) {
  return {
    sessionLive: true,
    viewDate: "2026-10-27",
    trainSessions: trainingSessions,
    todaySession: {
      date: "2026-10-27",
      refPrice: 100,
      bars: [
        { date: "2026-10-27T09:15:00+07:00", close: 100, volume: 100 },
        { date: `2026-10-27T${lastMinute}:00+07:00`, close: 101, volume: currentMinuteVolume },
      ],
    },
  };
}

test("ESA phát hiện volume cùng giờ bất thường như anomaly nghiên cứu, không trả xác suất", () => {
  const result = buildEsaEarlySignal({
    symbol: "FPT",
    sessions: liveSessions(),
    now: new Date("2026-10-27T02:17:00.000Z"),
    events: [{ eventId: "evt_1", title: "Kết quả kinh doanh", sourceLabel: "Nguồn A", verificationStatus: "verified" }],
  });

  assert.equal(result.status, "research_only");
  assert.equal(result.alert.type, "volume_expansion_with_price_up");
  assert.equal(result.observation.sampleSize, 24);
  assert.equal(result.method.probabilityAvailable, false);
  assert.equal(result.eventContext.length, 1);
});

test("ESA không phát cảnh báo khi phiên đóng hoặc mẫu lịch sử chưa đủ", () => {
  const closed = buildEsaEarlySignal({ symbol: "FPT", sessions: { ...liveSessions(), sessionLive: false } });
  assert.equal(closed.status, "market_closed");
  assert.equal(closed.alert, null);

  const insufficient = buildEsaEarlySignal({
    symbol: "FPT",
    sessions: { ...liveSessions(), trainSessions: trainingSessions.slice(0, 5) },
  });
  assert.equal(insufficient.status, "insufficient_data");
  assert.equal(insufficient.alert, null);
});

test("ESA không phát cảnh báo từ nến stale", () => {
  const result = buildEsaEarlySignal({
    symbol: "FPT",
    sessions: liveSessions(),
    now: new Date("2026-10-27T02:25:00.000Z"),
  });
  assert.equal(result.status, "stale");
  assert.equal(result.alert, null);
});

test("ESA: chỉ coi là phiên đang mở khi ngày giao dịch, sau 9:00 và phiên chưa đóng (ngoài phiên route trả ngay market_closed)", async () => {
  const { isSessionLive } = await import("../src/market/scanner/intradayService.js");
  assert.equal(isSessionLive(new Date("2026-10-29T03:00:00Z")), true); // thứ Năm 10:00
  assert.equal(isSessionLive(new Date("2026-10-29T01:00:00Z")), false); // 8:00 chưa mở
  assert.equal(isSessionLive(new Date("2026-10-29T10:30:00Z")), false); // 17:30 đã đóng
  assert.equal(isSessionLive(new Date("2026-10-31T03:00:00Z")), false); // thứ Bảy
});
