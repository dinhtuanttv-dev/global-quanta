import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { attainment, pickDocument, quoteHasNumber, toVnd, unflatten, unitFactor, verifyPlan } from "../src/market/fundamentals/agmPlans.js";
import { createAgmPlansService, priorFromStatements, ytdFromStatements } from "../src/market/fundamentals/agmPlansService.js";

const B = 1e9;

test("AGM đơn vị: tỷ / triệu / nghìn tỷ / đồng; % không quy đổi", () => {
  assert.equal(unitFactor("tỷ đồng"), 1e9);
  assert.equal(unitFactor("Đơn vị: tỷ VNĐ"), 1e9);
  assert.equal(unitFactor("Triệu đồng"), 1e6);
  assert.equal(unitFactor("nghìn tỷ đồng"), 1e12);
  assert.equal(unitFactor("%"), null);
  assert.equal(toVnd({ value: 13.4, unit: "nghìn tỷ đồng" }), 13.4e12);
});

test("AGM con số trong văn bản: mọi kiểu phân cách, không nhận số khác", () => {
  assert.ok(quoteHasNumber("Tổng cộng: Năm 2025: 10.113, Năm 2026: 11.629", 11629));
  assert.ok(quoteHasNumber("LNTT 1.234,5 tỷ đồng", 1234.5));
  assert.ok(!quoteHasNumber("LNTT 11.629 tỷ", 11692));
});

// Bảng kiểu FPT 2026 (đơn vị ở dòng tiêu đề, cột năm trước in cạnh).
const T1 = { page: 2, unitLine: "Đơn vị: tỷ VNĐ", approved: true, text: "3. Kế hoạch kinh doanh năm 2026:\nDoanh thu: Tổng cộng: Năm 2025: 50.606, Năm 2026: 58.580\nLợi nhuận trước thuế: Tổng cộng: Năm 2025: 10.113, Năm 2026: 11.629" };
const T2 = { page: 2, unitLine: "Đơn vị: tỷ VNĐ", approved: true, text: "Kế hoạch 2026 — Tổng cộng: Doanh thu 2025: 50.606, Doanh thu 2026: 58.580; LNTT 2025: 10.113, LNTT 2026: 11.629" };
const EXT = { revenue: { value: 58580, unit: "tỷ VNĐ", basis: "consolidated", rowLabel: "Tổng cộng", priorValue: 50606 }, pbt: { value: 11629, unit: "", basis: "unknown", rowLabel: "Tổng cộng", priorValue: 10113 }, npat: null };

test("AGM kiểm bằng code: số có trong CẢ HAI bản chép + đơn vị từ dòng tiêu đề + hợp lý -> ĐÃ KIỂM; số năm trước lệch BCTC -> cờ", () => {
  const r = verifyPlan(EXT, T1, T2, { year: 2026, priorOf: (k) => (k === "pbt" ? 13044 * B : k === "top" ? 70113 * B : null) });
  assert.equal(r.items.pbt.status, "VERIFIED");
  assert.equal(r.items.pbt.vnd, 11629 * B); // đơn vị lấy từ dòng tiêu đề
  assert.equal(r.items.pbt.priorCheck.match, false); // bảng in 10.113 ≠ BCTC 13.044: phạm vi khác -> chỉ gắn cờ
  assert.equal(r.items.revenue.status, "VERIFIED");
  assert.match(r.items.pbt.quote, /11\.629/);
  assert.equal(r.items.npat.status, "ABSENT");
  assert.equal(r.approved, true);
  // Bản chép thứ hai không có con số (một mô hình đọc khác) -> CẦN SOÁT.
  const bad = verifyPlan(EXT, T1, { ...T2, text: "LNTT 2026: 11.692" }, { year: 2026 });
  assert.equal(bad.items.pbt.status, "REVIEW");
  assert.match(bad.items.pbt.reason, /bản chép độc lập thứ hai/);
  // Gấp > 5 lần năm trước -> CẦN SOÁT; tờ trình -> không coi là đã thông qua.
  assert.equal(verifyPlan(EXT, T1, T2, { year: 2026, priorOf: (k) => (k === "pbt" ? 1000 * B : null) }).items.pbt.status, "REVIEW");
  assert.equal(verifyPlan(EXT, T1, T2, { year: 2026, draft: true }).approved, false);
  assert.equal(verifyPlan(EXT, { ...T1, text: T1.text.replace(/2026/g, "") }, { ...T2, text: T2.text.replace(/2026/g, "") }, { year: 2026 }).items.pbt.status, "REVIEW"); // không bản chép nào, không tiêu đề nào ghi năm
});

test("AGM tiến độ: lũy kế / kế hoạch, so mùa vụ, ước cả năm / kế hoạch; LNTT khi không có LNST", () => {
  const plan = { items: { npat: { status: "VERIFIED", vnd: 10000 * B, basis: "parent", ratioPrior: 1.1 }, pbt: { status: "VERIFIED", vnd: 12000 * B, basis: "consolidated", ratioPrior: 1.2 } } };
  const a = attainment(plan, { ytd: { npat: 8000 * B, npatParent: 7800 * B, pbt: 9500 * B }, through: 3, cumShare: 0.72, nowcastEst: 10700 * B });
  assert.deepEqual([a.metric, a.done, a.pace, a.nowcastVsPlan], ["npat", 0.78, 1.0833, 1.07]);
  const onlyPbt = attainment({ items: { npat: { status: "REVIEW" }, pbt: plan.items.pbt } }, { ytd: { pbt: 6000 * B }, through: 2 });
  assert.deepEqual([onlyPbt.metric, onlyPbt.done, onlyPbt.nowcastVsPlan], ["pbt", 0.5, null]);
  assert.equal(attainment({ items: { npat: { status: "REVIEW" } } }, { ytd: {}, through: 1 }), null);
  // Khác phạm vi: bảng in số năm trước lệch BCTC, hoặc kế hoạch ngoài 0,5–2,5 lần năm trước -> không tính tiến độ.
  assert.equal(attainment({ items: { npat: { status: "VERIFIED", vnd: 1320 * B, basis: "consolidated", ratioPrior: 0.47 } } }, { ytd: { npat: 2656 * B }, through: 3 }), null);
  assert.equal(attainment({ items: { pbt: { status: "VERIFIED", vnd: 11629 * B, basis: "consolidated", ratioPrior: 0.89, priorCheck: { match: false } } } }, { ytd: { pbt: 9000 * B }, through: 3 }), null);
});

test("AGM chọn văn bản: nghị quyết thường niên đúng năm; không có -> tài liệu họp (dự thảo); bỏ đại hội bất thường", () => {
  const news = [
    { newsDate: "2026-04-20", newsType: "resolutions", newsTitle: "FPT: Nghị quyết và Biên bản họp ĐHĐCĐ thường niên 2026", attachments: [{ url: "https://x/a.pdf" }] },
    { newsDate: "2026-09-10", newsType: "resolutions", newsTitle: "FPT: Nghị quyết ĐHĐCĐ bất thường năm 2026", attachments: [{ url: "https://x/b.pdf" }] },
    { newsDate: "2026-03-20", newsType: "meeting", newsTitle: "FPT: Tài liệu họp ĐHĐCĐ thường niên năm 2026", attachments: [{ url: "https://x/c.pdf" }] },
  ];
  assert.equal(pickDocument(news, 2026).url, "https://x/a.pdf");
  assert.equal(pickDocument(news.slice(2), 2026).draft, true);
  assert.equal(pickDocument(news, 2025), null);
});

const rec = { ticker: "FPT", tpl: "corp", quarters: [
  ...[3, 6, 9, 12].map((m) => ({ fiscal: `2025-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`, v: { revenue: 17000 * B, pbt: 3200 * B, npat: 2700 * B, npatParent: 2400 * B } })),
  ...[3, 6, 9].map((m) => ({ fiscal: `2026-${String(m).padStart(2, "0")}-30`, v: { revenue: 14000 * B, pbt: 3000 * B, npat: 2600 * B, npatParent: 2500 * B } })),
] };

test("AGM số năm trước & lũy kế lấy đúng chỉ tiêu từ BCTC (LNST mẹ khi kế hoạch là LNST mẹ)", () => {
  const p = priorFromStatements(rec, 2025);
  assert.equal(p("pbt"), 12800 * B);
  assert.equal(p("npat", "parent"), 9600 * B);
  assert.equal(p("npat", "consolidated"), 10800 * B);
  assert.deepEqual(ytdFromStatements(rec, 2026), { through: 3, npat: 7800 * B, npatParent: 7500 * B, pbt: 9000 * B });
});

test("AGM dịch vụ: chỉ tải PDF từ vndirect.com.vn, 2 mô hình khác nhau chép, lưu kết quả, không thử quá 3 lần", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agm-"));
  const pdf = Buffer.from("%PDF-1.4 fake");
  const news = { data: [{ newsDate: "2026-04-20", newsType: "resolutions", newsTitle: "FPT: Nghị quyết và Biên bản họp ĐHĐCĐ thường niên 2026", attachments: [{ url: "https://www.vndirect.com.vn/x.pdf" }] }] };
  const evil = { data: [{ newsDate: "2026-04-20", newsType: "resolutions", newsTitle: "BAD: Nghị quyết ĐHĐCĐ thường niên 2026", attachments: [{ url: "https://evil.example/x.pdf" }] }] };
  const fetchImpl = async (url) => {
    if (String(url).includes("tagCodes:FPT")) return { ok: true, json: async () => news };
    if (String(url).includes("tagCodes:BAD")) return { ok: true, json: async () => evil };
    if (String(url).endsWith(".pdf")) return { ok: true, url, headers: new Map([["content-length", String(pdf.length)]]), arrayBuffer: async () => pdf };
    throw new Error("unexpected " + url);
  };
  const models = [];
  const FLAT = { revenueValue: 58580, revenueUnit: "tỷ VNĐ", revenueBasis: "consolidated", revenueRowLabel: "Tổng cộng", revenuePriorValue: 50606, pbtValue: 11629, pbtUnit: "", pbtBasis: "unknown", pbtRowLabel: "Tổng cộng", pbtPriorValue: 10113, npatValue: null, npatUnit: null, npatBasis: null, npatRowLabel: null, npatPriorValue: null };
  assert.deepEqual(unflatten(FLAT), EXT);
  const callModel = async ({ models: chain, generationConfig }) => { const m = chain[0]; models.push(m); return { json: generationConfig.responseSchema.properties.text ? (models.length === 1 ? T1 : T2) : FLAT, modelUsed: m, usage: { totalTokenCount: 100 } }; };
  const svc = createAgmPlansService({ dir, callModel, fetchImpl, readStatements: () => rec, universe: async () => ["FPT", "BAD"], now: () => Date.parse("2026-11-06T05:00:00Z"), log: { warn() {} } });
  const r = await svc.run({ year: 2026 });
  assert.deepEqual(r.failed, ["BAD"]); // host ngoài danh sách
  assert.equal(new Set(models.slice(0, 2)).size, 2); // hai mô hình khác nhau
  assert.deepEqual(svc.planOf("FPT", 2026).models, models.slice(0, 2));
  const p = svc.planOf("FPT", 2026);
  assert.equal(p.plan.items.pbt.status, "VERIFIED");
  assert.equal(svc.status().years["2026"].verified.pbt, 1);
  await svc.run({ year: 2026 }); await svc.run({ year: 2026 });
  let clock = Date.parse("2026-11-06T05:00:00Z");
  const later = createAgmPlansService({ dir, callModel, fetchImpl, readStatements: () => rec, universe: async () => ["BAD"], now: () => clock, log: { warn() {} } });
  for (let i = 0; i < 5; i++) { clock += 21 * 3600e3; await later.run({ year: 2026 }); } // mỗi lượt cách ≥ 20 giờ
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "agm-plans.json"), "utf8")).tried["2026|BAD"].n, 3);
  // Lỗi tạm thời (429): không tính vào số lần thử, dừng lượt.
  const busy = async () => { const e = new Error("quá tải"); e.attempts = [{ status: 429 }]; throw e; };
  const svc3 = createAgmPlansService({ dir, callModel: busy, fetchImpl, readStatements: () => rec, universe: async () => ["FPT"], now: () => Date.parse("2026-11-20T05:00:00Z"), log: { warn() {} } });
  const r3 = await svc3.run({ year: 2026, force: true });
  assert.equal(r3.processed, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "agm-plans.json"), "utf8")).tried["2026|FPT"], undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("AGM số theo cách viết Việt Nam: code đọc giá trị trên văn bản (66.477 tỷ = 66.477 tỷ, không phải 66,477); ô bảng cạnh nhau là hai số", async () => {
  const { parseVnNumber, valueInText, numberTokens } = await import("../src/market/fundamentals/agmPlans.js");
  assert.equal(parseVnNumber("66.477"), 66477);
  assert.equal(parseVnNumber("1.234,5"), 1234.5);
  assert.equal(parseVnNumber("48.660.134"), 48660134);
  assert.deepEqual(numberTokens("Doanh thu 35.410.590 48.660.134 +37%"), ["35.410.590", "48.660.134", "37"]);
  assert.equal(valueInText("Tổng doanh thu 66.477 63.724", 66.477), 66477);
  const t = { page: 3, unitLine: "HỢP NHẤT (Tỷ đồng)", approved: true, text: "Tổng doanh thu 66.477 63.724 2.753 4,3%\nLợi nhuận sau thuế 9.828 9.414 414 4,4%" };
  const r = verifyPlan({ revenue: null, pbt: null, npat: { value: 9.828, unit: "Tỷ đồng", basis: "consolidated", rowLabel: "Lợi nhuận sau thuế", priorValue: 9.414 } }, t, t, { year: 2026, docTitle: "VNM: Nghị quyết ĐHĐCĐ thường niên 2026", priorOf: () => 9414 * 1e9 });
  assert.equal(r.items.npat.status, "VERIFIED");
  assert.equal(r.items.npat.vnd, 9828e9);
  assert.equal(r.items.npat.priorCheck.match, true);
  // Bản chép nói kế hoạch của năm khác -> CẦN SOÁT dù tiêu đề đúng năm.
  const other = verifyPlan({ npat: { value: 9.828, unit: "Tỷ đồng", basis: "consolidated" } }, { ...t, text: "Kế hoạch 2027: Lợi nhuận sau thuế 9.828" }, t, { year: 2026, docTitle: "2026" });
  assert.equal(other.items.npat.status, "REVIEW");
});
