import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crossCheck, datesInTitle, diffEvents, keyDate, normalize, shiftSession } from "../src/market/events/corpEvents.js";
import { createCorpEvents } from "../src/market/events/corpEventsService.js";

const wk = (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const VNM = { id: "126210.VN", code: "VNM", type: "DIVIDEND", note: "Trả cổ tức đợt 1/2026 (2500 đ/cp)", dividend: 2500, ratio: 25, divPeriod: 1, divYear: 2026, disclosureDate: "2026-10-28", effectiveDate: "2026-11-11", expiredDate: "2026-11-26", actualDate: "2026-11-26" };

test("LSK1 chuẩn hoá: GDKHQ / ĐKCC / thanh toán / họp theo từng loại sự kiện VNDirect", () => {
  const c = normalize(VNM, wk);
  assert.deepEqual([c.cat, c.group, c.ex, c.record, c.pay, c.cash], ["CASH", "DIVIDEND", "2026-11-11", "2026-11-12", "2026-11-26", 2500]);
  assert.equal(normalize({ ...VNM, effectiveDate: "2026-11-13" }, wk).record, "2026-11-16"); // thứ 6 -> ĐKCC thứ 2
  const s = normalize({ id: "s", code: "HPG", type: "STOCKDIV", effectiveDate: "2024-05-10", expiredDate: "2024-05-13", ratio: 29 }, wk);
  assert.deepEqual([s.cat, s.ex, s.record, s.ratio], ["STOCK", "2024-05-10", "2024-05-13", 29]);
  const m = normalize({ id: "m", code: "GVR", type: "meetingRight", effectiveDate: "2026-11-26", actualDate: "2026-12-29" }, wk);
  assert.deepEqual([m.cat, m.record, m.ex, m.meeting, keyDate(m)], ["AGM_RECORD", "2026-11-26", "2026-11-25", "2026-12-29", "2026-11-25"]);
  assert.equal(normalize({ id: "x", code: "A", type: "DIVIDEND", effectiveDate: "2026-01-05", prevDate: "2026-01-02" }, wk).changed, "2026-01-02");
  assert.equal(normalize({ id: "x", code: "A", type: "UNKNOWN", effectiveDate: "2026-01-05" }, wk), null);
  assert.equal(shiftSession("2026-11-13", 1, (d) => wk(d) && d !== "2026-11-16"), "2026-11-17"); // bỏ qua ngày nghỉ
});

test("LSK1 nhật ký: mới công bố, đổi ngày, huỷ (chỉ sự kiện chưa qua)", () => {
  const a = normalize(VNM, wk), b = { ...a, ex: "2026-11-12", date: "2026-11-12" };
  const ch = diffEvents(new Map([[a.id, a], ["old", { ...a, id: "old", ex: "2020-01-01", date: "2020-01-01" }], ["gone", { ...a, id: "gone" }]]), new Map([[b.id, b], ["new", { ...a, id: "new" }], ["old", { ...a, id: "old", ex: "2020-01-01", date: "2020-01-01" }]]), "2026-11-07T00:00:00Z");
  assert.deepEqual(ch.map((c) => `${c.kind}:${c.id}:${c.field ?? ""}`).sort(), ["CHANGED:126210.VN:date", "CHANGED:126210.VN:ex", "NEW:new:", "REMOVED:gone:"]);
  assert.deepEqual(diffEvents(null, new Map([[a.id, a]]), "x"), []); // lần nạp đầu không tạo "mới"
});

test("LSK1 kiểm chéo CafeF: trùng ngày / có tin doanh nghiệp / lệch / một nguồn", () => {
  assert.deepEqual(datesInTitle("FPT: 21.7.2025, ngày GDKHQ thưởng cp (tỷ lệ 20:3)"), ["2025-07-21"]);
  const e = normalize(VNM, wk);
  assert.equal(crossCheck(e, [["2026-10-29", "VNM: 11/11/2026, ngày GDKHQ trả cổ tức đợt 1/2026 bằng tiền"]]).level, "CONFIRMED_2");
  assert.equal(crossCheck(e, [["2026-11-02", "VNM: Thông báo ngày ĐKCC tạm ứng cổ tức đợt 1 năm 2026 bằng tiền mặt"]]).level, "ANNOUNCED_2");
  assert.equal(crossCheck(e, [["2026-10-29", "VNM: 13/11/2026, ngày GDKHQ trả cổ tức bằng tiền"]]).level, "CONFLICT");
  assert.equal(crossCheck(e, [["2026-10-29", "Vinamilk lãi quý 3 tăng"]]).level, "SINGLE");
  assert.equal(crossCheck(e, null).level, "SINGLE");
  // Sự kiện HỌP không bị coi là lệch bởi tin "ngày GDKHQ tham dự ĐHĐCĐ" (ngày đó thuộc sự kiện chốt quyền)
  const meet = normalize({ id: "m", code: "TLG", type: "MEETING", effectiveDate: "2026-12-07", disclosureDate: "2026-10-27" }, wk);
  assert.equal(crossCheck(meet, [["2026-10-28", "TLG: 10.11.2026, ngày GDKHQ tham dự ĐHĐCĐ bất thường năm 2026"]]).level, "SINGLE");
  const rec = normalize({ id: "r", code: "TLG", type: "meetingRight", effectiveDate: "2026-11-11", actualDate: "2026-12-07", disclosureDate: "2026-10-27" }, wk);
  assert.equal(crossCheck(rec, [["2026-10-28", "TLG: 10.11.2026, ngày GDKHQ tham dự ĐHĐCĐ bất thường năm 2026"]]).level, "CONFIRMED_2");
});

test("LSK1 dịch vụ: nạp theo lô mã, phân trang, cửa sổ ngày + nhóm, kiểm chéo sự kiện sắp tới, nhật ký giữa hai lần nạp", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-"));
  let round = 0; const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const ex = round === 0 ? "2026-11-11" : "2026-11-12";
    return { ok: true, json: async () => ({ data: url.includes("VNM") ? [{ ...VNM, effectiveDate: ex }, { id: "m1", code: "VNM", type: "MEETING", effectiveDate: "2026-12-20" }, { id: "w1", code: "VNM", type: "alert", effectiveDate: "2026-11-20" }] : [] }) };
  };
  const ce = createCorpEvents({ dir, universe: async () => ["VNM", "FPT"], isTradingDay: wk, fetchImpl, now: () => Date.parse("2026-11-07T01:00:00Z"), log: { log() {} }, cafefNews: () => [["2026-11-02", "VNM: Thông báo ngày ĐKCC tạm ứng cổ tức đợt 1 năm 2026 bằng tiền mặt"]], chunk: 1 });
  assert.equal((await ce.refresh()).events, 3);
  assert.equal(calls.length, 2); // 2 lô (chunk 1)
  const w = ce.window({ groups: ["DIVIDEND", "MEETING"] });
  assert.deepEqual(w.events.map((e) => e.cat), ["CASH", "AGM"]);
  assert.equal(w.events[0].check.level, "ANNOUNCED_2");
  round = 1; await ce.refresh();
  assert.ok(ce.window({}).changes.some((c) => c.kind === "CHANGED" && c.field === "ex" && c.to === "2026-11-12"));
  assert.equal(ce.ticker("VNM").events.length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("LSK2 DF-v1: gom đợt trả theo ngày-trong-năm, bỏ đợt đã trả kỳ này, point-in-time theo ngày công bố; nếp lịch sử (MÔ TẢ)", async () => {
  const { forecastTicker, payClusters, naiveForecast } = await import("../src/market/events/divForecast.js");
  const ev = [2022, 2023, 2024, 2025].flatMap((y) => [{ ex: `${y}-06-1${y % 3}`, disclosed: `${y}-05-25` }, { ex: `${y}-11-1${y % 3}`, disclosed: `${y}-10-28` }]);
  const c = payClusters(ev, "2026-01-05");
  assert.equal(c.clusters.length, 2);
  assert.ok(c.clusters.every((x) => x.paidYears === 4 && x.sigma >= 5));
  const f = forecastTicker(ev, "2026-01-05", 0.5);
  assert.deepEqual(f.map((x) => x.date.slice(5, 7)), ["06", "11"]);
  assert.ok(f[0].lo < f[0].date && f[0].hi > f[0].date && f[0].p > 0.8);
  // đợt tháng 6/2026 đã công bố (trước asOf) -> không dự báo lại
  const f2 = forecastTicker([...ev, { ex: "2026-06-12", disclosed: "2026-05-28" }], "2026-06-01", 0.5);
  assert.equal(f2[0].date.slice(0, 7), "2026-11");
  // chưa công bố tại asOf thì chưa được dùng (không nhìn trước)
  assert.equal(payClusters([{ ex: "2025-06-10", disclosed: "2025-06-01" }], "2025-05-01").clusters.length, 0);
  assert.deepEqual(naiveForecast([{ ex: "2025-06-10", disclosed: "2025-05-20" }], "2026-05-01"), ["2026-06-10"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-"));
  const raw = ev.map((e, i) => ({ id: `d${i}`, code: "BMP", type: "DIVIDEND", effectiveDate: e.ex, disclosureDate: e.disclosed, dividend: 5000 }));
  const ce = createCorpEvents({ dir, universe: async () => ["BMP"], isTradingDay: wk, fetchImpl: async () => ({ ok: true, json: async () => ({ data: raw }) }), now: () => Date.parse("2026-10-20T01:00:00Z"), log: { log() {} } });
  await ce.refresh();
  const h = ce.habits({ days: 60 });
  assert.equal(h.label, "MÔ TẢ"); assert.equal(h.rows.length, 1);
  assert.deepEqual([h.rows[0].t, h.rows[0].usual.slice(0, 7), h.rows[0].paidYears, h.rows[0].lastCash], ["BMP", "2026-11", 4, 5000]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("LSK3 tin phương án cổ tức: phân loại thông qua / trình–dự kiến / chốt quyền; % phải gắn với cổ tức; bỏ % lợi nhuận", async () => {
  const { dividendPlanNews } = await import("../src/market/events/corpEvents.js");
  const rows = [
    ["2026-05-06", "ĐHĐCĐ Gemadept: Đổi tên, công bố chiến lược hàng hải mới, chốt cổ tức 22% và bài toán ứng phó"],
    ["2025-03-12", "ACB đặt mục tiêu lợi nhuận 23.000 tỷ đồng, chia cổ tức tỷ lệ 25%"],
    ["2026-06-04", "ACB chốt quyền chia cổ tức 20%, trả tiền mặt từ 23/6"],
    ["2026-05-05", "HPG: 11.5.2026, ngày GDKHQ chi trả cổ tức năm 2025 bằng tiền (500 đ/cp)"],
    ["2025-11-17", "FPT báo lãi ròng 10 tháng tăng trưởng hơn 19%, cổ đông chuẩn bị nhận cổ tức"],
    ["2026-04-02", "Vinamilk lên kế hoạch doanh thu 2026 cao kỷ lục, trả cổ tức tối thiểu 50% lợi nhuận"],
    ["2021-07-02", "MWG thông qua phương án chia cổ tức bằng tiền và cổ phiếu tổng tỷ lệ 60%"],
  ];
  const r = dividendPlanNews(rows, "2024-01-01");
  const by = Object.fromEntries(r.map((x) => [x.date, x]));
  assert.equal(by["2026-05-06"].status, "APPROVED"); assert.equal(by["2026-05-06"].pct, 22);
  assert.equal(by["2025-03-12"].status, "PROPOSED"); assert.equal(by["2025-03-12"].pct, 25);
  assert.equal(by["2026-06-04"].status, "RECORD"); assert.equal(by["2026-06-04"].kind, "CASH");
  assert.equal(by["2026-05-05"].dps, 500); assert.equal(by["2026-05-05"].yearInTitle, 2025);
  assert.equal(by["2025-11-17"], undefined); // 19% là tăng trưởng lãi, không phải cổ tức
  assert.equal(by["2026-04-02"], undefined); // "50% lợi nhuận" không phải % mệnh giá
  assert.equal(by["2021-07-02"], undefined); // trước mốc thời gian
});
