import test from "node:test";
import assert from "node:assert/strict";
import { auditEventDates, createSeasonalityBundle, fiscalForEvent } from "../src/market/fundamentals/seasonalityBundle.js";

test("S3 quý tài chính của sự kiện: Q4 công bố tháng 1 -> năm trước; Q3 tháng 10 -> cùng năm", () => {
  assert.equal(fiscalForEvent("2026-01-26", 4), "2025-12-31");
  assert.equal(fiscalForEvent("2025-10-24", 3), "2025-09-30");
  assert.equal(fiscalForEvent("2025-04-23", 1), "2025-03-31");
});

test("S3 kiểm ngày làm mốc: so ngày Project A dùng với ngày tin BCTC chính thức, đếm phiên lệch", () => {
  const rec = { quarters: [{ fiscal: "2025-09-30", created: "2025-10-24" }, { fiscal: "2024-09-30", created: "2024-10-24" }] };
  const disc = [["2025-10-21", "FPT: Kết quả kinh doanh 9 tháng năm 2025"]];
  const days = ["2024-10-24", "2025-10-20", "2025-10-21", "2025-10-22", "2025-10-23", "2025-10-24"];
  const sessionsOf = (d) => { const i = days.indexOf(d); return i < 0 ? null : i; };
  const a = auditEventDates({ 3: { eventPaths: [{ exDate: "2024-10-24" }, { exDate: "2025-10-24" }] } }, rec, disc, sessionsOf);
  const r25 = a[3].rows.find((r) => r.fiscal === "2025-09-30");
  assert.deepEqual([r25.used, r25.precise, r25.source, r25.days, r25.sessions], ["2025-10-24", "2025-10-21", "DISCLOSURE", 3, 3]);
  const r24 = a[3].rows.find((r) => r.fiscal === "2024-09-30");
  assert.equal(r24.source, "DATA"); // không có tin chính thức -> không tính vào "đã kiểm"
  assert.deepEqual([a[3].checked, a[3].offBy2, a[3].maxOff], [1, 1, 3]);
  assert.deepEqual(a[1], { rows: [], checked: 0, offBy2: 0, maxOff: null });
});

test("S7 gói 9 API: song song, đệm 30 phút, 404 giữ nguyên nghĩa 'chưa có', lỗi tạm -> bản gần nhất (stale)", async () => {
  let clock = 0, calls = 0, fail = false;
  const fetchImpl = async (url) => {
    calls += 1;
    if (fail) return { ok: false, status: 503, json: async () => ({}) };
    if (url.includes("quarter=2") && url.includes("paths")) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ url }) };
  };
  const sb = createSeasonalityBundle({ base: "https://a.test", fetchImpl, now: () => clock });
  const d1 = await sb.get("FPT");
  assert.equal(calls, 9);
  assert.equal(Object.keys(d1.items).length, 9);
  assert.equal(d1.items["paths:2"].status, 404);
  assert.equal(d1.items.calendar.body.url, "https://a.test/api/cotuc/annual-earnings-calendar?ticker=FPT");
  await sb.get("FPT"); assert.equal(calls, 9); // trong 30 phút: đệm
  clock += 31 * 60_000; fail = true;
  const d3 = await sb.get("FPT");
  assert.equal(calls, 18);
  assert.equal(d3.stale, true);
  assert.equal(d3.items["stats:1"].status, 200); // giữ bản gần nhất
  assert.equal(d3.items["stats:1"].stale, true);
});
