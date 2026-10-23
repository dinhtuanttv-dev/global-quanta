import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { isLocalOnlyTable } from "../src/market/store/localFirstStore.js";
import { ALERT_EVENTS_TABLE, ALERTS_TABLE, conditionMet, createElliottAlertEvaluator, lineValueAt, listUserAlerts, markEventsRead, sanitizeAlerts, saveUserAlerts, sessionsBetween } from "../src/market/watchlists/userElliottAlerts.js";

const lvl = (id, price, side = "below", over = {}) => ({ id, symbol: "FPT", kind: "invalidation", label: "Vô hiệu", condition: { type: "level", price, side }, ...over });

test("chuẩn hoá: bỏ điều kiện sai / mã sai / id trùng; Telegram chỉ khi được phép; thời gian chờ trong [30, 1440] phút", () => {
  const out = sanitizeAlerts([
    lvl("a", 100), lvl("a", 90), { id: "b", symbol: "x", condition: { type: "level", price: 1, side: "below" } },
    { id: "c", symbol: "FPT", condition: { type: "zone", low: 120, high: 110 } },
    { id: "d", symbol: "FPT", condition: { type: "line", a: { date: "2026-10-05", price: 100 }, b: { date: "2026-10-01", price: 110 }, side: "above" } },
    lvl("e", 100, "below", { channels: { telegram: true }, cooldownMin: 1 }),
  ]);
  assert.deepEqual(out.map((a) => a.id), ["a", "c", "e"]);
  assert.deepEqual(out[1].condition, { type: "zone", low: 110, high: 120 });
  assert.equal(out[2].channels.telegram, false); assert.equal(out[2].cooldownMin, 30);
  assert.equal(sanitizeAlerts([lvl("e", 100, "below", { channels: { telegram: true } })], { allowTelegram: true })[0].channels.telegram, true);
  assert.throws(() => sanitizeAlerts("x"), (e) => e.statusCode === 400);
});

test("điều kiện: mức / vùng / đường kênh nội suy theo số phiên giao dịch (bỏ cuối tuần)", () => {
  assert.equal(conditionMet({ type: "level", price: 100, side: "below" }, 99.5).met, true);
  assert.equal(conditionMet({ type: "level", price: 100, side: "above" }, 99.5).met, false);
  assert.equal(conditionMet({ type: "zone", low: 90, high: 95 }, 93).met, true);
  // Thứ 6 02/10/2026 -> Thứ 2 05/10/2026 = 1 phiên
  assert.equal(sessionsBetween("2026-10-02", "2026-10-05"), 1);
  assert.equal(sessionsBetween("2026-10-05", "2026-10-02"), -1);
  const line = { type: "line", a: { date: "2026-10-01", price: 100 }, b: { date: "2026-10-05", price: 104 }, side: "above" }; // 2 phiên: 02, 05
  assert.equal(lineValueAt(line, "2026-10-06"), 106);
  assert.equal(conditionMet(line, 107, "2026-10-06").met, true);
  assert.equal(conditionMet(line, 105, "2026-10-06").met, false);
});

test("bộ kiểm tra: báo khi chạm mức, ghi lần báo + Telegram (nếu bật), tự tắt (oneShot), tôn trọng thời gian chờ; ngoài phiên bỏ qua", async () => {
  const store = createMemoryStore();
  await saveUserAlerts(store, "u1", { alerts: [lvl("a", 100), lvl("b", 80, "below", { oneShot: false, channels: { telegram: true } })] }, { allowTelegram: true });
  let price = 99;
  const sent = [];
  const t0 = new Date("2026-10-23T03:00:00Z"); // 10:00 VN, thứ Sáu — trong phiên
  let t = t0;
  const ev = createElliottAlertEvaluator({ store, service: { getQuotes: async (s) => ({ quotes: Object.fromEntries(s.map((x) => [x, { price }])) }) }, send: (m) => sent.push(m), now: () => t, log: { warn() {} } });
  assert.deepEqual(await ev.tick(), { checked: 2, fired: 1 });
  const l1 = await listUserAlerts(store, "u1");
  assert.equal(l1.unread, 1); assert.match(l1.events[0].message, /FPT: giá 99 chạm\/thủng mức 100/);
  assert.equal(l1.alerts.find((a) => a.id === "a").enabled, false);
  assert.equal(sent.length, 0); // cảnh báo "a" không bật Telegram
  price = 79; t = new Date(t0.getTime() + 60_000);
  await ev.tick();
  assert.equal(sent.length, 1); assert.match(sent[0], /không phải khuyến nghị/);
  t = new Date(t0.getTime() + 5 * 60_000);
  assert.deepEqual(await ev.tick(), { checked: 1, fired: 0 }); // trong thời gian chờ 240 phút
  t = new Date("2026-10-24T03:00:00Z"); // thứ Bảy
  assert.deepEqual(await ev.tick(), { skipped: true });
  const after = await markEventsRead(store, "u1");
  assert.equal(after.unread, 0);
  assert.deepEqual((await listUserAlerts(store, "u2")).alerts, []);
});

test("bảng chỉ ở kho cục bộ", () => {
  assert.equal(isLocalOnlyTable(ALERTS_TABLE), true);
  assert.equal(isLocalOnlyTable(ALERT_EVENTS_TABLE), true);
});
