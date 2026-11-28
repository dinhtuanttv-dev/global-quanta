// C11 — gom cảnh báo về một nơi: loại giá / hình vẽ / chỉ báo dùng chung kho cảnh báo Elliott (cùng bảng, dữ liệu cũ giữ nguyên).
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { conditionMet, createElliottAlertEvaluator, listUserAlerts, maValueToday, MAX_ALERTS, sanitizeAlerts, saveUserAlerts } from "../src/market/watchlists/userElliottAlerts.js";

const ma = (id, over = {}) => ({ id, symbol: "FPT", kind: "indicator", label: "Giá cắt EMA 20", condition: { type: "ma", ma: "ema", period: 20, side: "below" }, ...over });

test("chuẩn hoá: loại price / drawing / indicator; điều kiện EMA / SMA 2–400 phiên chỉ khung ngày; đường hình vẽ khung ngày hoặc tuần", () => {
  const out = sanitizeAlerts([
    ma("a"), ma("b", { condition: { type: "ma", ma: "wma", period: 20, side: "below" } }), ma("c", { condition: { type: "ma", ma: "sma", period: 1, side: "above" } }),
    ma("d", { timeframe: "W" }),
    { id: "e", symbol: "FPT", kind: "drawing", timeframe: "W", condition: { type: "line", a: { date: "2026-09-07", price: 90 }, b: { date: "2026-10-05", price: 100 }, side: "above" } },
    { id: "f", symbol: "FPT", kind: "drawing", timeframe: "1H", condition: { type: "line", a: { date: "2026-09-07", price: 90 }, b: { date: "2026-10-05", price: 100 }, side: "above" } },
    { id: "g", symbol: "FPT", kind: "price", condition: { type: "level", price: 120, side: "above" } },
  ]);
  assert.deepEqual(out.map((a) => [a.id, a.kind]), [["a", "indicator"], ["e", "drawing"], ["g", "price"]]);
  assert.equal(out[1].timeframe, "W");
  assert.equal(MAX_ALERTS, 100);
});

test("EMA / SMA hôm nay = phiên trước + giá hiện tại (cùng công thức chart: EMA khởi tạo bằng SMA)", () => {
  const prev = [10, 11, 12, 13, 14];
  assert.equal(maValueToday({ ma: "sma", period: 3 }, prev, 15), (13 + 14 + 15) / 3);
  // EMA 3: khởi tạo SMA(10,11,12)=11, rồi 13 -> 12, 14 -> 13; hôm nay 15 -> 14
  assert.equal(maValueToday({ ma: "ema", period: 3 }, prev, 15), 14);
  assert.equal(maValueToday({ ma: "ema", period: 30 }, prev, 15), null); // thiếu dữ liệu -> không báo
  const c = { type: "ma", ma: "ema", period: 3, side: "below" };
  assert.equal(conditionMet(c, 13, "2026-10-23", { maValue: 14 }).met, true);
  assert.match(conditionMet(c, 13, "2026-10-23", { maValue: 14 }).text, /thủng xuống dưới EMA 3/);
  assert.equal(conditionMet(c, 13, "2026-10-23").met, false);
});

test("bộ kiểm tra: cảnh báo chỉ báo đọc giá đóng cửa điều chỉnh phiên trước (bộ đệm theo ngày); lời báo 'Cảnh báo' + ghi chú chung", async () => {
  const store = createMemoryStore();
  await saveUserAlerts(store, "u1", { alerts: [ma("a", { channels: { telegram: true } }), { id: "p", symbol: "FPT", kind: "price", label: "", condition: { type: "level", price: 50, side: "above" } }] }, { allowTelegram: true });
  const t = new Date("2026-10-23T03:00:00Z");
  const calls = [];
  const bars = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, close: 100 })).concat([{ date: "2026-10-23", close: 1 }]);
  const service = {
    getQuotes: async (s) => ({ quotes: Object.fromEntries(s.map((x) => [x, { price: 90 }])) }),
    getOhlcv: async (p) => { calls.push(p); return { bars }; },
  };
  const sent = [];
  const ev = createElliottAlertEvaluator({ store, service, send: (m) => sent.push(m), now: () => t, log: { warn() {} } });
  assert.deepEqual(await ev.tick(), { checked: 2, fired: 2 });
  assert.equal(calls.length, 1); assert.equal(calls[0].adjusted, "true");
  const l = await listUserAlerts(store, "u1");
  const msg = l.events.find((e) => e.alertId === "a").message;
  assert.match(msg, /^Cảnh báo FPT: giá 90 thủng xuống dưới EMA 20 \(≈ 99\)/); // phiên hôm nay (close 1) bị bỏ; EMA phiên trước = 100, cập nhật bằng giá 90 -> 100·19/21 + 90·2/21 ≈ 99
  assert.match(l.events.find((e) => e.alertId === "p").message, /^Cảnh báo FPT: giá 90 chạm\/vượt mức 50/);
  assert.match(sent[0], /Cảnh báo do bạn đặt/);
  assert.match(l.userDisclaimer, /không phải khuyến nghị/);
});
