// V0 (19/11/2026) — dữ liệu sạch cho Trung tâm vĩ mô, kiểm trên SỐ LIỆU THẬT đo ở production trước khi sửa:
//   - nến VN-Index ngày của SSI FC v2 lệch thang ×100 (16/07/2019 – 09/01/2020)
//   - chuỗi tháng VN-Index ×100 (07–12/2019), VN100 ×100 (cả 2019), tỷ giá Yahoo VND=X ÷10.000 (5 tháng) + thiếu tháng
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairIndexScale } from "../src/market/indexScaleGuard.js";
import { scaleOutliers, quarantineScale } from "../src/market/macro/scaleCheck.js";
import { fillFromDaily, missingPeriods, fetchGlobalFeeds } from "../src/market/macro/macroGlobalFeeds.js";
import { createMacroCore, isLevelSeries } from "../src/market/macro/macroCore.js";
import { fomcEvents, fomcCoverage, FOMC_DECISION_DATES } from "../src/market/macro/catalystEvents.js";

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const SERIES = fx("macro-series-2026-11-19.json").series;
const pts = (id) => SERIES[id].map(([period, value]) => ({ period, value }));

test("nến VN-Index ngày: đưa 126 phiên ×100 về đúng thang, ghi rõ provenance; phiên thật không đổi", () => {
  const bars = fx("vnindex-daily-2019h2.json").bars.map(([date, close]) => ({ date, open: close, high: close, low: close, close }));
  const { bars: out, repaired } = repairIndexScale(bars);
  assert.deepEqual(repaired, { kind: "scale-x100", sessions: 126, from: "2019-07-16", to: "2020-01-09" });
  const at = (d) => out.find((b) => b.date === d).close;
  assert.equal(at("2019-07-15"), 972.53);
  assert.equal(at("2019-07-16"), 982.11);
  assert.equal(at("2020-01-10"), 968.54);
  assert.ok(out.every((b) => b.close > 800 && b.close < 1100), "cả giai đoạn nằm trong vùng điểm thật của VN-Index");
});

test("nến chỉ số bình thường (không lỗi) giữ nguyên tuyệt đối, kể cả xu hướng mạnh", () => {
  const bars = Array.from({ length: 300 }, (_, i) => ({ date: `d${String(i).padStart(3, "0")}`, close: 500 * Math.exp(i / 150) }));
  const r = repairIndexScale(bars);
  assert.equal(r.repaired, null);
  assert.equal(r.bars, bars);
});

test("chuỗi tháng: bắt đúng VN-Index 07–12/2019, VN100 cả năm 2019, EX 5 tháng; không bắt nhầm điểm thật", () => {
  assert.deepEqual([...scaleOutliers(pts("VNINDEX")).keys()], ["2019-07", "2019-08", "2019-09", "2019-10", "2019-11", "2019-12"]);
  assert.deepEqual([...scaleOutliers(pts("VN100")).keys()], ["2019-01", "2019-02", "2019-03", "2019-04", "2019-05", "2019-06", "2019-07", "2019-08", "2019-09", "2019-10", "2019-11", "2019-12"]);
  assert.deepEqual([...scaleOutliers(pts("EX")).keys()], ["2016-01", "2016-06", "2016-12", "2017-03", "2017-08"]);
  // Brent 2026 dao động 71 -> 127 -> 70 -> 120 là biến động thật của nguồn, không phải lỗi thang
  assert.equal(scaleOutliers(pts("OIL")).size, 0);
  assert.equal(scaleOutliers(pts("DXY")).size, 0);
});

test("cách ly: bỏ mọi vintage của kỳ lỗi, chỉ áp cho chuỗi mức; trả danh sách có lý do", () => {
  const list = [
    ...pts("EX").map((p) => ({ seriesId: "EX", ...p, asOf: "2026-01-01", source: "Yahoo:VND=X" })),
    { seriesId: "CPI", period: "2026-09", value: 5.08, asOf: "2026-10-06" },
    { seriesId: "CPI", period: "2026-08", value: 0.01, asOf: "2026-09-06" },
  ];
  const { keep, held } = quarantineScale(list, isLevelSeries);
  assert.equal(held.length, 5);
  assert.match(held[0].reason, /÷\d+ so với trung vị/);
  assert.equal(held[0].source, "Yahoo:VND=X");
  assert.equal(keep.filter((o) => o.seriesId === "CPI").length, 2, "chuỗi tỷ lệ (CPI %) không bị kiểm theo tỷ số");
  assert.equal(keep.length, list.length - 5);
});

test("engine không thấy điểm lỗi; /source công bố danh sách cách ly", () => {
  const today = () => "2026-11-19";
  const obs = (id, asOfOf = (p) => `${p}-28`) => pts(id).map((p) => ({ seriesId: id, ...p, asOf: asOfOf(p.period), source: "test" }));
  const core = createMacroCore({ today });
  const s = core.setReal([...obs("VNINDEX"), ...obs("EX"), ...obs("DXY")]);
  assert.equal(s.quarantined.filter((q) => q.seriesId === "VNINDEX").length, 6);
  assert.equal(s.quarantined.filter((q) => q.seriesId === "EX").length, 5);
  const vni = s.series.find((x) => x.id === "VNINDEX");
  assert.equal(vni.n, SERIES.VNINDEX.length - 6);
});

test("EX: điền tháng thiếu / thay tháng lệch thang bằng giá cuối tháng từ nến ngày; nến ngày lỗi thì để trống", () => {
  const months = pts("EX").map((p) => ({ ...p, asOf: "x" }));
  const miss = missingPeriods(months);
  assert.ok(miss.includes("2025-10"), "tháng 10/2025 đang thiếu");
  const need = [...miss, ...scaleOutliers(months).keys()];
  const daily = need.map((period) => ({ period, value: period === "2017-03" ? 2.29 /* nến ngày cũng lỗi */ : 22000 }));
  const { months: out, filled } = fillFromDaily(months, daily, need);
  assert.ok(filled.includes("2025-10") && filled.includes("2016-01"));
  assert.ok(!filled.includes("2017-03"), "giá ngày lỗi thang không được dùng");
  assert.equal(out.find((m) => m.period === "2017-03"), undefined, "kỳ không dựng được bị bỏ, không nội suy");
  assert.equal(out.find((m) => m.period === "2016-01").daily, true);
  assert.equal(scaleOutliers(out).size, 0);
});

test("fetchGlobalFeeds: Yahoo thiếu tháng -> gọi thêm nến ngày, nguồn ghi rõ '· nến ngày'", async () => {
  const ts = (iso) => Date.parse(`${iso}T00:00:00Z`) / 1000;
  const monthly = ["2026-05-01", "2026-06-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-04-01", "2026-03-01", "2026-02-01"].sort();
  const daily = ["2026-07-30", "2026-07-31"];
  const chart = (dates, v) => JSON.stringify({ chart: { result: [{ timestamp: dates.map(ts), indicators: { quote: [{ close: dates.map(() => v) }] } }] } });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, text: async () => (url.includes("interval=1d") ? chart(daily, 26100) : chart(monthly, 26000)) };
  };
  const feeds = [{ seriesId: "EX", source: "Yahoo:VND=X (thị trường)", kind: "yahoo", id: "VND=X" }];
  const { observations, report } = await fetchGlobalFeeds({ todayIso: "2026-11-19", fetchImpl, feeds });
  assert.equal(calls.length, 2);
  const jul = observations.find((o) => o.period === "2026-07");
  assert.equal(jul.value, 26100);
  assert.equal(jul.source, "Yahoo:VND=X (thị trường) · nến ngày");
  assert.equal("daily" in jul, false);
  assert.deepEqual(report.EX.filledFromDaily, ["2026-07"]);
});

test("FOMC: có lịch 2027 (8 cuộc họp, Fed ghi dự kiến) + 01/2028; cảnh báo khi lịch sắp hết", () => {
  assert.equal(FOMC_DECISION_DATES.filter((d) => d.startsWith("2027")).length, 8);
  const ev = fomcEvents("2026-11-19", 120);
  assert.deepEqual(ev.map((e) => [e.date, !!e.tentative]), [["2026-12-09", false], ["2027-01-27", true], ["2027-03-17", true]]);
  assert.match(ev[1].title, /lịch dự kiến của Fed/);
  assert.equal(fomcCoverage("2026-11-19").warning, null);
  assert.match(fomcCoverage("2027-11-01").warning, /cần nhập lịch năm sau/);
});

test("nến chỉ số: cửa sổ bắt đầu hoặc kết thúc GIỮA đoạn lỗi vẫn sửa đúng phía lỗi", () => {
  const bars = fx("vnindex-daily-2019h2.json").bars.map(([date, close]) => ({ date, close }));
  const tail = bars.filter((b) => b.date >= "2019-12-01");
  const r1 = repairIndexScale(tail);
  assert.equal(r1.repaired.to, "2020-01-09");
  assert.ok(r1.bars.every((b) => b.close < 1100));
  const head = bars.filter((b) => b.date <= "2019-08-30");
  const r2 = repairIndexScale(head);
  assert.equal(r2.repaired.from, "2019-07-16");
  assert.ok(r2.bars.every((b) => b.close < 1100));
});

test("Yahoo theo múi giờ sàn: nến tháng 10 của VND=X (mốc 30/09 23:00 UTC, giờ London) thuộc tháng 10, không đè lên tháng 9", async () => {
  const { parseYahooMonthly, toClosedMonths } = await import("../src/market/macro/macroGlobalFeeds.js");
  // dấu thời gian GỐC của Yahoo VND=X (range=2y, interval=1mo), đọc 19/11/2026
  const raw = [["2025-08-31T23:00:00Z", 26414], ["2025-09-30T23:00:00Z", 26315], ["2025-11-01T00:00:00Z", 26372], ["2026-02-01T00:00:00Z", 26030], ["2026-03-01T00:00:00Z", 26335], ["2026-03-31T23:00:00Z", 26355]];
  const json = { chart: { result: [{ meta: { exchangeTimezoneName: "Europe/London" }, timestamp: raw.map(([d]) => Date.parse(d) / 1000), indicators: { quote: [{ close: raw.map(([, v]) => v) }] } }] } };
  const m = Object.fromEntries(toClosedMonths(parseYahooMonthly(json), "2026-11-19").map((x) => [x.period, x.value]));
  assert.deepEqual(m, { "2025-09": 26414, "2025-10": 26315, "2025-11": 26372, "2026-02": 26030, "2026-03": 26335, "2026-04": 26355 });
  // không có meta múi giờ -> giữ cách đọc UTC như cũ (tương thích)
  delete json.chart.result[0].meta;
  assert.equal(parseYahooMonthly(json)[1].date, "2025-09-30");
});
