import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidence, checkSector, checkSentence, createWorldBrief, MANUAL_COOLDOWN_MS, numberMatches, numbersIn, verifyBrief } from "../src/market/world/worldBrief.js";

const NOW = Date.parse("2026-11-02T01:00:00Z"); // 08:00 thứ Hai giờ Việt Nam
const monitor = { items: [
  { id: "BRENT", nameVi: "Dầu Brent", unit: "USD/thùng", available: true, stale: false, value: 112.33, change: -2.22, changeIn: "pct", z: -1.29, rangePct: 90, date: "2026-10-30", sourceVi: "Yahoo" },
  { id: "OLD", nameVi: "Cũ", unit: "x", available: true, stale: true, value: 1, change: 9, z: 9, date: "2026-01-01", sourceVi: "Yahoo" },
] };
const news = { items: [
  { title: "OPEC cuts output by 2 million barrels", sourceLabel: "CNBC", url: "https://cnbc.com/a", verification: "single", publishedAt: "2026-11-01T10:00:00Z" },
  { title: "Very old news", sourceLabel: "BBC", url: "https://bbc.com/b", verification: "single", publishedAt: "2026-10-01T10:00:00Z" },
] };
const strategy = { vnLast: "2026-10-30", short: { rows: [{ icb: "0500", nameVi: "Dầu khí", zx: 1.2, alphaBps: 4.5, stance: "overweight", pOutperform: 0.507 }, { icb: "9500", nameVi: "Công nghệ", zx: -2.01, alphaBps: -5.3, stance: "underweight", pOutperform: 0.484 }] }, medium: [] };
const ev = buildEvidence({ monitor, news, strategy, nowMs: NOW });
const byRef = new Map(ev.map((e) => [e.ref, e]));

test("bằng chứng bỏ dòng giá cũ và tin quá 72 giờ", () => {
  assert.deepEqual(ev.map((e) => e.ref), ["M:BRENT", "N:1", "S:0500", "S:9500"]);
});

test("đọc số: dấu thập phân Việt, dấu nghìn", () => {
  assert.ok(numbersIn("giảm 2,22%")[0].includes(2.22));
  assert.ok(numbersIn("mức 7.580")[0].includes(7580));
  assert.ok(numbersIn("mức 7,580")[0].includes(7580));
  assert.equal(numberMatches([2.22], [[-2.22]]), true);
  assert.equal(numberMatches([3.5], [[-2.22, 112.33]]), false);
  assert.equal(numberMatches([112], [[112.33]]), true);
  assert.equal(numberMatches([115], [[112.33]]), false);
});

test("câu đạt khi số có trong đúng bằng chứng trích dẫn", () => {
  assert.equal(checkSentence("Dầu Brent giảm 2,22% về 112,33 USD/thùng.", ["M:BRENT"], byRef), null);
  assert.equal(checkSentence("Theo CNBC, OPEC cắt 2 triệu thùng.", ["N:1"], byRef), null);
});

test("câu bị loại: không trích dẫn, trích dẫn giả, số bịa, số từ bằng chứng khác", () => {
  assert.match(checkSentence("Dầu giảm.", [], byRef), /không có trích dẫn/);
  assert.match(checkSentence("Dầu giảm.", ["M:GIA"], byRef), /không có thật/);
  assert.match(checkSentence("Dầu Brent giảm 7,5%.", ["M:BRENT"], byRef), /con số/);
  assert.match(checkSentence("OPEC làm giá giảm 2,22%.", ["N:1"], byRef), /con số/);
  assert.match(checkSentence("", ["M:BRENT"], byRef), /rỗng/);
});

test("ngày tháng không bị coi là số liệu", () => {
  assert.equal(checkSentence("Phiên 30/10 dầu Brent giảm 2,22%.", ["M:BRENT"], byRef), null);
  assert.equal(checkSentence("Năm 2026 dầu Brent giảm 2,22%.", ["M:BRENT"], byRef), null);
});

test("ngành: phải trích bằng chứng ngành, không trái chiều điểm định lượng", () => {
  assert.equal(checkSector({ icb: "0500", direction: "bullish", text: "Dầu khí thuận gió, z 1,2.", refs: ["S:0500"] }, byRef), null);
  assert.match(checkSector({ icb: "9500", direction: "bullish", text: "Công nghệ tốt.", refs: ["S:9500"] }, byRef), /trái chiều/);
  assert.match(checkSector({ icb: "0500", direction: "bearish", text: "Dầu khí xấu.", refs: ["S:0500"] }, byRef), /trái chiều/);
  assert.match(checkSector({ icb: "0500", direction: "bullish", text: "Tốt.", refs: ["M:BRENT"] }, byRef), /chưa trích/);
  assert.match(checkSector({ icb: "1111", direction: "bullish", text: "x", refs: ["S:1111"] }, byRef), /không có/);
  assert.match(checkSector({ icb: "0500", direction: "up", text: "x", refs: ["S:0500"] }, byRef), /không hợp lệ/);
});

test("verifyBrief giữ câu đạt, loại câu sai, không trả độ tin cậy của AI", () => {
  const r = verifyBrief({
    summary: [{ text: "Dầu Brent giảm 2,22%.", refs: ["M:BRENT"] }, { text: "Vàng tăng 9%.", refs: ["M:BRENT"] }],
    sectors: [{ icb: "0500", direction: "bullish", confidence: 0.9, text: "Dầu khí z 1,2.", refs: ["S:0500", "N:1"] }, { icb: "9500", direction: "bullish", text: "x", refs: ["S:9500"] }],
  }, ev);
  assert.equal(r.summary.length, 1);
  assert.equal(r.sectors.length, 1);
  assert.equal(r.rejected.length, 2);
  assert.equal(r.sectors[0].confidence, undefined);
  assert.equal(r.sectors[0].citations.find((c) => c.ref === "N:1").url, "https://cnbc.com/a");
  assert.equal(verifyBrief(null, ev).summary.length, 0);
});

function setup(t0 = NOW) {
  const kv = new Map();
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); } };
  const clock = { t: t0 };
  let calls = 0;
  const callModel = async () => { calls++; return { modelUsed: "m", json: { summary: [{ text: "Dầu Brent giảm 2,22%.", refs: ["M:BRENT"] }], sectors: [] } }; };
  const svc = createWorldBrief({ store, getMonitor: async () => monitor, getNews: async () => news, getStrategy: async () => strategy, callModel, now: () => clock.t, log: {} });
  return { svc, clock, calls: () => calls, store };
}
const settle = () => new Promise((r) => setTimeout(r, 5));

test("chạy tay có giãn cách, lưu lịch sử, đọc lại được", async () => {
  const { svc, clock, calls, store } = setup();
  assert.equal((await svc.runManual()).status, "started");
  await settle();
  assert.equal(calls(), 1);
  const d = await svc.get();
  assert.equal(d.latest.summary.length, 1);
  assert.equal((await svc.runManual()).status, "cooldown");
  clock.t += MANUAL_COOLDOWN_MS + 1000;
  assert.equal((await svc.runManual()).status, "started");
  await settle();
  assert.equal(calls(), 2);
  assert.equal((await svc.get()).runs.length, 2);
  const again = createWorldBrief({ store, getMonitor: async () => monitor, getNews: async () => news, getStrategy: async () => strategy, callModel: async () => ({}), now: () => clock.t, log: {} });
  assert.equal((await again.get()).runs.length, 2);
});

test("lịch tự động: mỗi khung giờ một lần, bỏ cuối tuần, trước giờ không chạy", async () => {
  const { svc, clock, calls } = setup(Date.parse("2026-11-02T00:30:00Z")); // 07:30 VN
  assert.equal(await svc.tick(), false);
  clock.t = Date.parse("2026-11-02T00:50:00Z"); // 07:50 VN
  assert.equal(await svc.tick(), true);
  assert.equal(await svc.tick(), false);
  clock.t = Date.parse("2026-11-02T08:35:00Z"); // 15:35 VN
  assert.equal(await svc.tick(), true);
  assert.equal(calls(), 2);
  const sat = setup(Date.parse("2026-11-07T01:00:00Z"));
  assert.equal(await sat.svc.tick(), false);
});

test("AI lỗi: báo lỗi thật, không tạo bản giả", async () => {
  const svc = createWorldBrief({ getMonitor: async () => monitor, getNews: async () => news, getStrategy: async () => strategy, callModel: async () => { throw new Error("hết hạn mức"); }, now: () => NOW, log: {} });
  await svc.runManual();
  await settle();
  const d = await svc.get();
  assert.equal(d.latest, null);
  assert.match(d.lastError.message, /hết hạn mức/);
});
