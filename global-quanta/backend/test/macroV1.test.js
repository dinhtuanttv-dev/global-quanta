// V1 (19/11/2026) — kho vintage đúng nghĩa, nối mã chỉ số đổi tên, hạn công bố, lệch nguồn, cảnh báo biến động có sàn.
process.env.MARKET_ALERTS_ENABLED = "false";
import { test } from "node:test";
import assert from "node:assert/strict";
import { latestPerPeriod, mergeObservations, vintageCounts, createMacroCore } from "../src/market/macro/macroCore.js";
import { createMacroService, HOSE_TARGETS, releaseStatus, REVISABLE_SOURCE, sourceConflicts, stitchBars } from "../src/market/macro/macroService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { isIndexSymbol } from "../src/market/normalizer.js";
import { checkQuality, catalogById, VN_CATALOG } from "../src/market/macro/vendor/macroEngine.mjs";

const rev = { revisable: (o) => REVISABLE_SOURCE.test(o.source ?? "csv"), todayIso: "2026-11-19" };
const CPI = (period, value, asOf, source = "IMF:CPI VNM (TCTK)") => ({ seriesId: "CPI", period, value, asOf, source });

test("vintage: nguồn công bố lại -> thêm bản mới asOf = hôm nay, GIỮ bản cũ; lần nạp sau cùng số thì không thêm nữa", () => {
  const base = [CPI("2026-08", 4.88, "2026-09-06"), CPI("2026-09", 5.08, "2026-10-06")];
  const r1 = mergeObservations(base, [CPI("2026-09", 5.12, "2026-10-06"), CPI("2026-10", 5.21, "2026-11-06")], rev);
  assert.deepEqual([r1.added, r1.changed, r1.revised], [1, 0, 1]);
  const sep = r1.list.filter((o) => o.period === "2026-09").map((o) => [o.asOf, o.value]);
  assert.deepEqual(sep, [["2026-10-06", 5.08], ["2026-11-19", 5.12]]);
  const r2 = mergeObservations(r1.list, [CPI("2026-09", 5.12, "2026-10-06")], rev);
  assert.deepEqual([r2.added, r2.changed, r2.revised], [0, 0, 0]);
  assert.deepEqual(vintageCounts(r1.list), { CPI: 1 });
  assert.deepEqual(latestPerPeriod(r1.list).filter((o) => o.period === "2026-09").map((o) => o.value), [5.12]);
});

test("giá thị trường đổi giá trị = sửa lỗi dữ liệu -> ghi đè, KHÔNG giữ bản sai làm vintage", () => {
  const bad = [{ seriesId: "VNINDEX", period: "2019-07", value: 99166, asOf: "2019-08-01", source: "gateway-hose" }];
  const r = mergeObservations(bad, [{ seriesId: "VNINDEX", period: "2019-07", value: 991.66, asOf: "2019-08-01", source: "gateway-hose" }], rev);
  assert.deepEqual([r.changed, r.revised], [1, 0]);
  assert.deepEqual(r.list.map((o) => o.value), [991.66]);
});

test("engine theo thời điểm: asOf trước ngày công bố lại thấy số cũ, sau đó thấy số mới", async () => {
  const core = createMacroCore({ today: () => "2026-11-19" });
  const { list } = mergeObservations([CPI("2026-09", 5.08, "2026-10-06")], [CPI("2026-09", 5.12, "2026-10-06")], rev);
  core.setReal(list);
  const at = async (asOf) => (await core.handle({ method: "GET", path: "/api/macro/series", query: { tail: "1", asOf } })).body.series.find((s) => s.id === "CPI").points?.at(-1)?.value;
  assert.equal(await at("2026-11-01"), 5.08);
  assert.equal(await at("2026-11-19"), 5.12);
});

test("mã chỉ số đổi tên 06/05/2025: nối VNMID + VNMIDCAP (mã mới ưu tiên khi trùng ngày); mã mới là chỉ số hợp lệ", async () => {
  assert.deepEqual(HOSE_TARGETS.VNMIDCAP, ["VNMID", "VNMIDCAP"]);
  assert.ok(isIndexSymbol("VNMIDCAP") && isIndexSymbol("VNSMALLCAP"));
  const old = [{ date: "2025-04-28", close: 1753.27 }, { date: "2025-04-29", close: 1755.42 }];
  const nw = [{ date: "2025-04-29", close: 1755.5 }, { date: "2025-05-06", close: 1787.57 }];
  assert.deepEqual(stitchBars([old, nw]).map((b) => [b.date, b.close]), [["2025-04-28", 1753.27], ["2025-04-29", 1755.5], ["2025-05-06", 1787.57]]);
  // dịch vụ: lấy lịch sử của cả hai mã rồi gộp tháng
  const asked = [];
  const history = { get: async (sym) => { asked.push(sym); return { bars: sym === "VNMID" ? [{ date: "2025-03-31", close: 1700 }, { date: "2025-04-29", close: 1755.42 }] : sym === "VNMIDCAP" ? [{ date: "2025-05-30", close: 1790 }, { date: "2025-06-30", close: 1810 }] : [] }; } };
  const svc = createMacroService({ store: createMemoryStore(), history, globalFeeds: null, inline: true, now: () => Date.parse("2026-11-19T03:00:00Z"), log: { warn() {} } });
  const r = await svc.refreshAutoFeeds({ force: true });
  assert.ok(asked.includes("VNMID") && asked.includes("VNMIDCAP"));
  assert.deepEqual([r.report.VNMIDCAP.first, r.report.VNMIDCAP.last, r.report.VNMIDCAP.months], ["2025-03", "2025-06", 4]);
  svc.close();
});

test("hạn công bố: CPI tháng 9 có rồi -> kỳ 10 dự kiến 06/11, ngày 19/11 quá hạn 10 ngày (ân hạn 3); chuỗi thị trường không quá hạn", () => {
  const meta = catalogById(VN_CATALOG);
  assert.deepEqual(releaseStatus(meta.CPI, "2026-09", "2026-11-19"), { nextPeriod: "2026-10", expected: "2026-11-06", overdueDays: 10 });
  assert.deepEqual(releaseStatus(meta.EX, "2026-10", "2026-11-19"), { nextPeriod: "2026-11", expected: "2026-12-01", overdueDays: 0 });
  assert.equal(releaseStatus(meta.M2, null, "2026-11-19"), null);
});

test("lệch nguồn: CPI nạp tay khác IMF quá 0,05 điểm % -> báo; trong ngưỡng -> không", () => {
  const list = [CPI("2026-09", 5.08, "2026-10-06"), CPI("2026-09", 5.2, "2026-10-06", "csv:TCTK"), CPI("2026-08", 4.88, "2026-09-06"), CPI("2026-08", 4.9, "2026-09-06", "csv:TCTK")];
  const c = sourceConflicts(list);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { seriesId: "CPI", period: "2026-09", values: { "IMF:CPI VNM (TCTK)": 5.08, "csv:TCTK": 5.2 } });
});

test("CSV: mặc định 'công bố lại' giữ vintage; 'correction' ghi đè; /source có vintages, conflicts, release; observations() một bản/kỳ", async () => {
  const svc = createMacroService({ store: createMemoryStore(), history: null, globalFeeds: null, inline: true, now: () => Date.parse("2026-11-19T03:00:00Z"), log: { warn() {} } });
  const csv1 = "period,value\n2026-08,4.88\n2026-09,5.08\n";
  await svc.importCsv({ seriesId: "CPI", csv: csv1, asOf: "2026-10-06", force: true });
  const r = await svc.importCsv({ seriesId: "CPI", csv: "period,value\n2026-09,5.12\n", asOf: "2026-10-06", force: true });
  assert.equal(r.mode, "revision"); assert.equal(r.revised, 1);
  const c = await svc.importCsv({ seriesId: "CPI", csv: "period,value\n2026-08,4.9\n", asOf: "2026-09-06", force: true, mode: "correction" });
  assert.equal(c.mode, "correction"); assert.equal(c.changed, 1); assert.equal(c.revised, 0); assert.equal(c.added, 0);
  const obs = await svc.observations();
  assert.deepEqual(obs.filter((o) => o.seriesId === "CPI").map((o) => [o.period, o.value]), [["2026-08", 4.9], ["2026-09", 5.12]]);
  const src = await svc.source();
  assert.deepEqual(src.vintages, { CPI: 1 });
  assert.deepEqual(src.conflicts, []);
  assert.deepEqual(src.series.find((s) => s.id === "CPI").release, { nextPeriod: "2026-10", expected: "2026-11-06", overdueDays: 10 });
  assert.equal(src.series.find((s) => s.id === "M2").release, null);
  svc.close();
});

test("cảnh báo biến động có sàn: lãi suất Fed tăng 0,25 điểm % không còn bị coi là bất thường; cú cắt 1,5 điểm % vẫn bị nêu", () => {
  const meta = catalogById(VN_CATALOG).FED;
  const pts = [];
  let v = 3.64;
  for (let i = 0; i < 60; i++) {
    const y = 2021 + Math.floor(i / 12), m = String((i % 12) + 1).padStart(2, "0");
    v += i === 30 ? 0.25 : i === 45 ? -1.5 : (i % 2 ? 0.01 : -0.01);
    pts.push({ period: `${y}-${m}`, value: Math.round(v * 100) / 100 });
  }
  const out = checkQuality("FED", pts, meta).filter((x) => x.code === "outlier").map((x) => x.period);
  assert.deepEqual(out, [pts[45].period]);
});
