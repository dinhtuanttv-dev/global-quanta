import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAcbs, parseBvsc, parseDetail, parseKbsv, parseSsi, wanted } from "../src/market/brokerViews/brokerSources.js";
import { compact, locateQuote, verifyExtract } from "../src/market/brokerViews/brokerExtract.js";
import { buildConsensus, sectorConsensus, scoreLedger, targetStats, viewChanges, viewConsensus } from "../src/market/brokerViews/brokerConsensus.js";
import { allowedUrl, createBrokerViews } from "../src/market/brokerViews/brokerViewsService.js";

const NOW = Date.parse("2026-10-31T00:00:00Z");
const rep = (broker, publishedAt, o = {}) => ({ id: `${broker}${publishedAt}`, broker, title: "t", publishedAt, url: "u", topics: [], sectors: [], targets: [], ...o });
const mv = (stance) => ({ stance, quote: "q", page: 1 });

test("đọc danh sách từng CTCK", () => {
  const k = parseKbsv(`<div class='item'> <h3 class='reset'> <a onclick='x' href='http://www.kbsec.com.vn/pic/Service/A.pdf' title='Triển vọng TTCK 4Q2026' target='_blank'>x</a> </h3> <span class='date'> 07/10/2026 11:27 </span></div>`, "https://www.kbsec.com.vn/vi/x.htm");
  assert.deepEqual([k[0].title, k[0].publishedAt], ["Triển vọng TTCK 4Q2026", "2026-10-07"]);
  const long = "Khuyến nghị thị trường ".repeat(6);
  const s = parseSsi(`<a href="javascript:void(0)">Báo cáo Chiến lược Tháng 9/2026</a><div>${long}</div><div class="chart__content__item__time"><p><span>08/09/2026</span></p><a href="https://www.ssi.com.vn/analysis-center/report/download/a"></a>`, "https://www.ssi.com.vn/p");
  assert.equal(s[0].publishedAt, "2026-09-08");
  assert.ok(s[0].summary.includes("Khuyến nghị"));
  assert.equal(s[0].pdfUrl, null);
  assert.equal(parseAcbs(`<a href="https://acbs.com.vn/trung-tam-phan-tich/chi-tiet/a">Cập nhật Vĩ mô tháng 9/2026</a>`, "https://acbs.com.vn/")[0].pageUrl, "https://acbs.com.vn/trung-tam-phan-tich/chi-tiet/a");
  assert.equal(parseBvsc(`<a class="contentNewArticle_Title" href="/danhsachbaiviet/a/">B&#xE1;o c&#xE1;o v&#x129; m&#xF4;</a><label class="time__detail">30/10/2026</label>`, "https://bvsc.com.vn/x")[0].title, "Báo cáo vĩ mô");
  assert.equal(parseDetail(`<a href="/m/a.pdf">x</a><meta property="article:published_time" content="2026-10-09T15:05:54">`, "https://acbs.com.vn/x").pdfUrl, "https://acbs.com.vn/m/a.pdf");
  assert.equal(wanted("Bản tin chứng khoán 30.10.2026"), false);
  assert.equal(wanted("Cập nhật Vĩ mô tháng 9"), true);
});

test("chỉ tải từ host trong danh sách", () => {
  assert.equal(allowedUrl("https://acbs.com.vn/a.pdf"), true);
  assert.equal(allowedUrl("https://evil.example/a.pdf"), false);
  assert.equal(allowedUrl("http://169.254.169.254/"), false);
});

test("câu trích phải có thật; chịu được PDF tách chữ; tự sửa số trang; từ chối câu quá dài", () => {
  const pages = ["", compact("T ổng mức bán lẻ tăng 14,12% so với cùng kỳ năm trước"), compact("Trang hai không liên quan gì đến nội dung")];
  assert.equal(locateQuote("Tổng mức bán lẻ tăng 14,12% so với cùng kỳ", 1, pages), 1);
  assert.equal(locateQuote("Tổng mức bán lẻ tăng 14,12% so với cùng kỳ", 2, pages), 1);
  assert.equal(locateQuote("Tổng mức bán lẻ tăng 99,99% so với cùng kỳ", 1, pages), null);
  assert.equal(locateQuote("ngắn", 1, pages), null);
  assert.equal(locateQuote("từ ".repeat(50), 1, pages), null);
});

test("kiểm chứng loại nhận định bịa, mục tiêu không có trong câu trích, ngành lạ", () => {
  const pages = ["", compact("Chúng tôi giữ quan điểm tích cực với thị trường. Mục tiêu VN-Index cuối năm 1.920 điểm. Ngân hàng được ưu tiên nhờ tăng trưởng tín dụng.")];
  const r = verifyExtract({
    marketView: { stance: "positive", quote: "Chúng tôi giữ quan điểm tích cực với thị trường", page: 1 },
    targets: [{ value: 1920, scenario: "base", horizonEnd: "2026-12", quote: "Mục tiêu VN-Index cuối năm 1.920 điểm", page: 1 }, { value: 2500, scenario: "bull", quote: "Mục tiêu VN-Index cuối năm 1.920 điểm", page: 1 }],
    topics: [{ topic: "rates", stance: "negative", quote: "Lãi suất sẽ tăng mạnh trong quý tới", page: 1 }],
    sectors: [{ icb: "8300", stance: "positive", quote: "Ngân hàng được ưu tiên nhờ tăng trưởng tín dụng", page: 1 }, { icb: "9999", stance: "positive", quote: "Ngân hàng được ưu tiên nhờ tăng trưởng tín dụng", page: 1 }],
  }, pages, new Set(["8300"]));
  assert.equal(r.marketView.stance, "positive");
  assert.deepEqual(r.targets.map((t) => t.value), [1920]);
  assert.equal(r.topics.length, 0);
  assert.deepEqual(r.sectors.map((s) => s.icb), ["8300"]);
  assert.equal(r.rejected.length, 2);
  // Câu thật nhưng không nói điều được gán thì vẫn loại.
  const wrong = verifyExtract({ marketView: { stance: "cautious", quote: "Chúng tôi giữ quan điểm tích cực với thị trường", page: 1 }, sectors: [{ icb: "2300", stance: "negative", quote: "Ngân hàng được ưu tiên nhờ tăng trưởng tín dụng", page: 1 }] }, pages, new Set(["2300"]));
  assert.equal(wrong.marketView, null);
  assert.deepEqual(wrong.sectors, []);
  assert.equal(wrong.rejected.length, 2);
});

test("điểm đồng thuận, bất đồng và số nguồn hiệu dụng đúng công thức", () => {
  const same = viewConsensus([rep("A", "2026-10-31", { marketView: mv("positive") }), rep("B", "2026-10-31", { marketView: mv("positive") })], NOW);
  assert.equal(same.score, 1);
  assert.equal(same.disagreement, 0);
  assert.equal(same.nEff, 2);
  const split = viewConsensus([rep("A", "2026-10-31", { marketView: mv("positive") }), rep("B", "2026-10-31", { marketView: mv("neutral") }), rep("C", "2026-10-31", { marketView: mv("negative") })], NOW);
  assert.equal(split.score, 0);
  assert.equal(split.disagreement, 1);
  // Báo cáo 30 ngày tuổi có trọng số một nửa: (1·1 + 0,5·(−1)) / 1,5 = 0,33.
  assert.equal(viewConsensus([rep("A", "2026-10-31", { marketView: mv("positive") }), rep("B", "2026-10-01", { marketView: mv("negative") })], NOW).score, 0.33);
  // Mỗi CTCK chỉ tính báo cáo mới nhất; báo cáo quá 120 ngày bị bỏ.
  const one = viewConsensus([rep("A", "2026-10-30", { marketView: mv("negative") }), rep("A", "2026-09-01", { marketView: mv("positive") }), rep("Z", "2026-01-01", { marketView: mv("positive") })], NOW);
  assert.equal(one.n, 1);
  assert.equal(one.score, -1);
  assert.equal(viewConsensus([], NOW).score, null);
});

test("mục tiêu chỉ gộp kịch bản cơ sở cùng kỳ", () => {
  const t = (value, scenario, horizonEnd) => ({ value, scenario, horizonEnd, quote: "q", page: 1 });
  const s = targetStats([rep("A", "2026-10-30", { targets: [t(1900, "base", "2026-12"), t(2200, "bull", "2026-12")] }), rep("B", "2026-10-29", { targets: [t(2000, "base", "2026-12")] }), rep("C", "2026-10-28", { targets: [t(3000, "base", "2027-12")] })], NOW, 1800);
  assert.equal(s.horizon, "2026-12");
  assert.equal(s.median, 1950);
  assert.equal(s.upsidePct, 8.3);
  assert.equal(s.items.length, 4);
  const single = targetStats([rep("C", "2026-10-28", { targets: [t(1800, "base", "2026-12")] })], NOW, 1700);
  assert.deepEqual([single.median, single.upsidePct, single.items.length], [null, null, 1]);
});

test("ngành lệch mô hình chỉ khi có từ 2 CTCK và hai bên ngược chiều rõ", () => {
  const s = (stance) => ({ icb: "8300", stance, quote: "q", page: 1 });
  const rows = sectorConsensus([rep("A", "2026-10-30", { sectors: [s("positive")] }), rep("B", "2026-10-30", { sectors: [s("positive")] })], NOW, new Map([["8300", { nameVi: "Ngân hàng", z: -1 }]]));
  assert.equal(rows[0].diverges, true);
  assert.equal(rows[0].net, 1);
  assert.equal(sectorConsensus([rep("A", "2026-10-30", { sectors: [s("positive")] })], NOW, new Map([["8300", { z: -1 }]]))[0].diverges, false);
});

test("đổi quan điểm và sổ chấm điểm không xếp hạng khi chưa đủ mẫu", () => {
  const ch = viewChanges([rep("A", "2026-10-30", { marketView: mv("negative") }), rep("A", "2026-10-01", { marketView: mv("positive") })], NOW);
  assert.deepEqual([ch[0].from, ch[0].to], ["positive", "negative"]);
  const bars = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), close: 100 + i }));
  const few = scoreLedger([rep("A", "2026-01-05", { marketView: mv("positive") }), rep("A", "2026-01-06", { marketView: mv("negative") }), rep("A", "2026-02-25", { marketView: mv("positive") })], bars);
  assert.deepEqual([few.brokers.A.n, few.brokers.A.hits, few.brokers.A.pending, few.brokers.A.ready, few.brokers.A.shrunkHit], [2, 1, 1, false, null]);
  const many = scoreLedger(Array.from({ length: 12 }, (_, i) => rep("A", `2026-01-${String(i + 1).padStart(2, "0")}`, { marketView: mv("positive") })), bars);
  assert.equal(many.brokers.A.ready, true);
  assert.ok(many.brokers.A.shrunkHit <= 1 && many.brokers.A.hits === 12);
  assert.ok(buildConsensus({ reports: [], nowMs: NOW }).view);
});

test("dịch vụ: quét, bỏ báo cáo không có chữ, lỗi tải được thử lại có giới hạn, không gọi lại báo cáo đã đọc, tôn trọng trần token", async () => {
  const kv = new Map();
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, structuredClone(v)); } };
  const pdf = (b) => ({ ok: true, url: "https://acbs.com.vn/a.pdf", headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode(b).buffer, text: async () => b });
  let calls = 0, listing = [{ title: "Cập nhật Vĩ mô tháng 9", pdfUrl: "https://acbs.com.vn/ok.pdf", publishedAt: "2026-10-20", pageUrl: "https://acbs.com.vn/ok.pdf" }, { title: "Vĩ mô scan", pdfUrl: "https://acbs.com.vn/scan.pdf", publishedAt: "2026-10-19", pageUrl: "https://acbs.com.vn/scan.pdf" }, { title: "Vĩ mô hỏng", pdfUrl: "https://acbs.com.vn/bad.pdf", publishedAt: "2026-10-18", pageUrl: "https://acbs.com.vn/bad.pdf" }];
  const sources = [{ id: "T", broker: "ACBS", type: "macro", url: "https://acbs.com.vn/list", parse: () => listing }];
  const svc = createBrokerViews({
    store, sources, pauseMs: 0, now: () => NOW, log: {}, getQuant: async () => [{ icb: "8300", nameVi: "Ngân hàng", z: 1 }],
    fetchImpl: async (u) => (u.includes("bad") ? { ok: false, status: 500, url: u } : pdf("%PDF-x")),
    readPdf: async () => ({ numPages: 1, pages: ["", compact("Chúng tôi giữ quan điểm tích cực với thị trường năm nay")], chars: calls === 0 && !svc.__scan ? 900 : 900 }),
    callModel: async () => { calls++; return { json: { marketView: { stance: "positive", quote: "Chúng tôi giữ quan điểm tích cực với thị trường", page: 1 }, targets: [], topics: [], sectors: [] }, modelUsed: "m", usage: { totalTokenCount: 200_000 } }; },
  });
  await svc.get();
  const r = await svc.runOnce();
  assert.equal(r.todo, 3);
  // Báo cáo thứ 3 lỗi HTTP chứ không tốn Gemini; hai báo cáo đầu làm vượt trần 300.000 token nên lượt sau dừng.
  assert.equal(calls, 2);
  const d = await svc.get();
  assert.equal(d.view.items[0].stance, "positive");
  listing = [...listing, { title: "Vĩ mô mới", pdfUrl: "https://acbs.com.vn/new.pdf", publishedAt: "2026-10-30", pageUrl: "https://acbs.com.vn/new.pdf" }];
  await svc.runOnce();
  assert.equal(calls, 2, "đã vượt trần token trong ngày thì không gọi Gemini");
});
