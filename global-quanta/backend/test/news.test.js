process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { classifyEvent, extractTickers, sentiment, stripHtml, jaccard, titleTokens } from "../src/market/news/newsNlp.js";
import { parseRss, enrichAndDedupe, priceReaction, importance, insightOf, toIso, getNewsForTickers, parseTickers } from "../src/market/news/newsService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { TtlCache } from "../src/market/util.js";

const SYMBOLS = new Set(["TTF", "DBC", "HPG", "FPT", "VCB", "PNJ", "CEO"]);

test("news NLP: nhận diện mã (dạng sàn: mã, từ in hoa có niêm yết), loại từ viết tắt", () => {
  assert.deepEqual(extractTickers("HOSE quyết định đưa cổ phiếu CTCP Kỹ nghệ Gỗ Trường Thành (HOSE: TTF) vào diện kiểm soát", SYMBOLS), ["TTF"]);
  assert.deepEqual(extractTickers("Lãnh đạo Dabaco đăng ký mua 2 triệu cổ phiếu DBC; CEO nói USD tăng", SYMBOLS), ["DBC"]);
  assert.deepEqual(extractTickers("HPGX không phải mã, xHPG cũng không", SYMBOLS), []);
});

test("news NLP: phân loại sự kiện và cảm xúc có dấu (không nhầm lãi/lại, lỗ/lo, gom/gồm), xử lý phủ định", () => {
  assert.equal(classifyEvent("TTF vào diện kiểm soát sau nhiều lần bị cảnh báo").id, "LEGAL");
  assert.equal(classifyEvent("Hòa Phát báo lãi quý 3 vượt kế hoạch").id, "EARNINGS");
  assert.equal(classifyEvent("Con trai tỷ phú đăng ký mua 50 triệu cổ phiếu").id, "INSIDER");
  assert.equal(classifyEvent("VOS chốt quyền trả cổ tức bằng tiền").id, "DIVIDEND");
  assert.equal(classifyEvent("Công ty tổ chức hội thảo thường niên").id, "OTHER");
  assert.ok(sentiment("TTF vào diện kiểm soát sau nhiều lần bị cảnh báo").score <= -0.6);
  assert.ok(sentiment("Lợi nhuận kỷ lục, vượt kế hoạch năm").score >= 0.9);
  assert.equal(sentiment("Khách hàng nhận tiền lại, sản phẩm gồm nhẫn và dây chuyền").score, 0, "lại ≠ lãi, gồm ≠ gom");
  assert.ok(sentiment("Doanh nghiệp giảm lỗ mạnh").score > 0, "giảm lỗ là tích cực");
  const neg = sentiment("Lợi nhuận không tăng như kỳ vọng");
  assert.ok(neg.score < 0 && neg.hits.includes("¬tăng"));
  assert.equal(stripHtml("&lt;img src='x'/&gt;Bà A &amp; ông B<br/> mua"), "Bà A & ông B mua");
  assert.ok(jaccard(titleTokens("Lãnh đạo Dabaco đăng ký mua 2 triệu cổ phiếu DBC"), titleTokens("Lãnh đạo Dabaco đăng ký mua 2 triệu cp DBC")) >= 0.6);
});

const RSS = `<?xml version="1.0"?><rss><channel><title>Cổ phiếu</title>
<item><title>TTF vào diện kiểm soát sau nhiều lần bị cảnh báo</title><link>https://vietstock.vn/a-1.htm</link>
<description>&lt;img src='x.jpg'/&gt;HOSE quyết định đưa cổ phiếu (HOSE: TTF) vào diện kiểm soát</description><pubDate>Fri, 02 Oct 2026 08:15:00 +0700</pubDate></item>
<item><title>Lãnh đạo Dabaco đăng ký mua 2 triệu cổ phiếu DBC</title><link>https://vietstock.vn/a-2.htm</link><description>Bà Hương đăng ký mua.</description><pubDate>Fri, 02 Oct 2026 07:00:00 +0700</pubDate></item>
<item><title>Thị trường chung khởi sắc</title><link>https://vietstock.vn/a-3.htm</link><description>Không nhắc mã nào.</description><pubDate>Fri, 02 Oct 2026 06:00:00 +0700</pubDate></item>
</channel></rss>`;

test("news: đọc RSS, gắn mã, chỉ giữ mã trong danh mục, khử trùng giữa nguồn và đếm xác nhận chéo", () => {
  const feed = { id: "VIETSTOCK", label: "Vietstock" };
  const rss = parseRss(RSS, feed);
  assert.equal(rss.length, 3);
  assert.equal(rss[0].publishedAt, "2026-10-02T01:15:00.000Z");
  const disclosure = { id: "vnd-1", title: "DBC: Thông báo giao dịch cổ phiếu của người nội bộ", summary: "", url: null, attachment: null,
    publishedAt: "2026-10-02T00:00:00+07:00", source: "DISCLOSURE", sourceLabel: "Công bố HOSE", tickers: ["DBC"] };
  const cafef = { ...rss[1], id: "cafef-x", source: "CAFEF", sourceLabel: "CafeF", title: "Lãnh đạo Dabaco đăng ký mua 2 triệu cp DBC" };
  const out = enrichAndDedupe([...rss, disclosure, cafef], { wanted: new Set(["TTF", "DBC"]), symbols: SYMBOLS });
  assert.deepEqual(out.map((i) => i.tickers.join()).sort(), ["DBC", "DBC", "TTF"]);
  const dbcNews = out.filter((i) => i.tickers.includes("DBC") && i.source !== "DISCLOSURE");
  assert.equal(dbcNews.length, 1, "Vietstock + CafeF cùng tin -> gộp");
  assert.equal(dbcNews[0].corroboration, 2);
  assert.equal(out.find((i) => i.tickers.includes("TTF")).eventType, "LEGAL");
  assert.ok(!out.some((i) => i.title === "Thị trường chung khởi sắc"));
});

test("news: phản ứng giá so VN-Index tính từ phiên trước tin; tin sau 15h lấy chính phiên đó; nhận định đã/chưa phản ánh", () => {
  const rows = [
    { date: "2026-09-28", close: 100, closeAdj: 100, volume: 1000 }, { date: "2026-09-29", close: 100, closeAdj: 100, volume: 1000 },
    { date: "2026-09-30", close: 100, closeAdj: 100, volume: 1000 }, { date: "2026-10-01", close: 104, closeAdj: 104, volume: 3000 },
    { date: "2026-10-02", close: 106, closeAdj: 106, volume: 2000 },
  ];
  const daily = new Map([["DBC", rows]]);
  const index = new Map(rows.map((r) => [r.date, 1000 + (r.date === "2026-10-02" ? 10 : 0)]));
  const morning = priceReaction({ publishedAt: "2026-10-01T09:30:00+07:00" }, "DBC", daily, index);
  assert.deepEqual([morning.from, morning.to, morning.sessions, morning.ret, morning.excess, morning.volumeRatio], ["2026-09-30", "2026-10-02", 2, 0.06, 0.05, 3]);
  const evening = priceReaction({ publishedAt: "2026-10-01T16:16:00+07:00" }, "DBC", daily, index);
  assert.equal(evening.from, "2026-10-01");
  assert.equal(priceReaction({ publishedAt: "2026-10-02T16:00:00+07:00" }, "DBC", daily, index).sessions, 0);
  assert.equal(insightOf({ sentiment: 0.5 }, { excess: -0.01 }).tone, "watch");
  assert.match(insightOf({ sentiment: -0.6 }, { excess: -0.04 }).text, /đã phản ánh -4.0%/);
  const now = Date.parse("2026-10-02T10:00:00+07:00");
  const fresh = importance({ eventWeight: 1, source: "DISCLOSURE", sentiment: -1, corroboration: 2, direct: true, publishedAt: "2026-10-02T08:00:00+07:00" }, now, morning);
  const old = importance({ eventWeight: 1, source: "DISCLOSURE", sentiment: -1, corroboration: 2, direct: true, publishedAt: "2026-09-22T08:00:00+07:00" }, now, morning);
  assert.ok(fresh <= 100 && old < fresh / 4, `${fresh} ${old}`); // bán rã 3 ngày
  assert.equal(toIso("2026-10-01 16:16:19"), "2026-10-01T16:16:19+07:00");
});

test("news: dịch vụ đầu-cuối — nguồn lỗi độc lập không làm hỏng bảng tin; kiểm tra đầu vào", async () => {
  const store = createMemoryStore();
  await store.setSecurities([...SYMBOLS].map((s) => ({ symbol: s })), "T");
  const fetchImpl = async (url) => {
    if (String(url).includes("vndirect")) {
      return new Response(JSON.stringify({ data: [{ newsId: 7, newsGroup: "disclosure", newsType: "x", tagCodes: "TTF", newsTitle: "TTF: Quyết định đưa cổ phiếu vào diện kiểm soát", newsAbstract: "", newsContent: "", attachments: [], newsDate: "2026-10-01 17:00:00", newsSource: "HOSE" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("cafef")) return new Response("lỗi", { status: 503 });
    return new Response(RSS, { status: 200 });
  };
  const r = await getNewsForTickers({ store, cache: new TtlCache() }, ["ttf", "DBC"], { fetchImpl, now: () => Date.parse("2026-10-02T10:00:00+07:00") });
  assert.deepEqual(r.tickers, ["TTF", "DBC"]);
  assert.equal(r.sources.VNDIRECT.ok, true);
  assert.equal(r.sources["https://cafef.vn/thi-truong-chung-khoan.rss"].ok, false);
  assert.ok(r.items.length >= 3);
  assert.equal(r.items[0].tickers[0], "TTF");
  assert.equal(r.perTicker.TTF.count, 2);
  assert.ok(r.perTicker.TTF.avgSentiment < 0);
  assert.throws(() => parseTickers(""), /ít nhất 1 mã/);
  assert.throws(() => parseTickers("VNINDEX"), /không hợp lệ/);
});

test("news: loại sự kiện ưu tiên tiêu đề, tóm tắt chỉ dùng khi tiêu đề không rõ", () => {
  const base = { id: "x", url: null, attachment: null, publishedAt: "2026-10-02T08:00:00+07:00", source: "CAFEF", sourceLabel: "CafeF", tickers: ["PNJ"] };
  const [a] = enrichAndDedupe([{ ...base, title: "Vốn hóa PNJ giảm hơn 5.000 tỷ đồng chỉ vài ngày", summary: "Khối ngoại bán ra mạnh" }], { wanted: new Set(["PNJ"]), symbols: SYMBOLS });
  assert.equal(a.eventType, "OTHER");
  const [b] = enrichAndDedupe([{ ...base, id: "y", title: "PNJ: tin mới", summary: "Công ty báo lãi quý 3 vượt kế hoạch" }], { wanted: new Set(["PNJ"]), symbols: SYMBOLS });
  assert.equal(b.eventType, "EARNINGS");
});
