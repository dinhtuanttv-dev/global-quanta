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
