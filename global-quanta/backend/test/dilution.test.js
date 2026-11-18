// PX0 + PX-L — vòng đời đợt pha loãng: không nhìn trước, ghép niêm yết bổ sung, độ trễ của chính mã, sổ ghi trước khi có kết quả.
import test from "node:test";
import assert from "node:assert/strict";
import { dilutionHistory, dilutionPhase, linkListing, listingLags, marketListingLag, qtyOf, sessionClock } from "../src/market/elite/dilution.js";
import { createDilution, PXL_KV, pxLedgerSummary } from "../src/market/elite/dilutionService.js";

const HOL = new Set(["2026-12-31"]);
const clock = sessionClock((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !HOL.has(d));
const stock = (o) => ({ t: "ACB", cat: "STOCK", ratio: 15, title: "Trả cổ tức tỷ lệ 100:15", ...o });
const listed = (date, qty, o = {}) => ({ t: "ACB", cat: "ADD_LISTING", date, title: `Số lượng ${qty.toLocaleString("en-US")} CP`, ...o });
const hist = [
  stock({ id: "a", ex: "2024-05-31", disclosed: "2024-05-15" }), listed("2024-07-04", 554514846, { disclosed: "2024-06-20" }), listed("2024-07-10", 385542),
  stock({ id: "b", ex: "2025-05-23", disclosed: "2025-05-08" }), listed("2025-07-07", 637692067, { disclosed: "2025-06-25" }),
];

test("đồng hồ phiên bỏ cuối tuần + ngày nghỉ; đọc số lượng niêm yết", () => {
  assert.equal(clock.between("2026-11-20", "2026-11-23"), 1); // Thứ Sáu -> Thứ Hai
  assert.equal(clock.between("2026-12-30", "2027-01-04"), 2); // 31/12 nghỉ (bộ thử), 01/01 Thứ Sáu giao dịch, 02–03/01 cuối tuần, 04/01
  assert.equal(clock.shift("2026-11-20", 1), "2026-11-23");
  assert.equal(qtyOf("Số lượng 554,514,846 CP"), 554514846); assert.equal(qtyOf(""), null);
});

test("ghép niêm yết bổ sung: đợt lớn nhất trong 120 ngày (bỏ đợt ESOP lẻ); độ trễ lịch sử của mã", () => {
  assert.equal(linkListing(hist[0], hist, "2026-01-01").date, "2024-07-04");
  const lags = listingLags(hist, "2026-01-01", clock);
  assert.deepEqual(lags.map((x) => [x.ex, x.listing]), [["2024-05-31", "2024-07-04"], ["2025-05-23", "2025-07-07"]]);
  assert.ok(lags.every((x) => x.lag >= 24 && x.lag <= 32), JSON.stringify(lags));
});

test("SẮP GDKHQ / HẬU GDKHQ / hết cửa sổ; ngày niêm yết ước tính theo chính mã; cổ tức tiền và < 10% không tính; không nhìn trước", () => {
  const cur = [...hist, stock({ id: "c", ex: "2026-06-15", disclosed: "2026-05-29", ratio: 13 })];
  const pre = dilutionPhase({ asOf: "2026-06-08", events: cur, clock });
  assert.equal(pre.phase, "PRE_EX"); assert.equal(pre.sessionsTo, 5); assert.equal(pre.listingBasis, "ESTIMATED_OWN"); assert.equal(pre.nOwn, 2);
  assert.equal(dilutionPhase({ asOf: "2026-05-20", events: cur, clock }).phase, "NONE", "chưa công bố -> không biết");
  const post = dilutionPhase({ asOf: "2026-06-22", events: cur, clock });
  assert.equal(post.phase, "POST_EX"); assert.equal(post.day, 5); assert.equal(post.listed, false); assert.ok(post.until > post.listing);
  const withList = [...cur, listed("2026-07-21", 667765358, { disclosed: "2026-07-10" })];
  const p2 = dilutionPhase({ asOf: "2026-07-15", events: withList, clock });
  assert.equal(p2.listingBasis, "ANNOUNCED"); assert.equal(p2.listing, "2026-07-21"); assert.equal(p2.until, clock.shift("2026-07-21", 5));
  assert.equal(dilutionPhase({ asOf: "2026-08-10", events: withList, clock }).phase, "NONE", "sau niêm yết + 5 phiên");
  const cash = [{ t: "X", cat: "CASH", ex: "2026-06-15", disclosed: "2026-06-01", cash: 2000 }, stock({ t: "X", id: "s", ex: "2026-06-15", ratio: 9.9, disclosed: "2026-06-01" })];
  assert.equal(dilutionPhase({ asOf: "2026-06-16", events: cash, clock }).phase, "NONE");
  const m = dilutionPhase({ asOf: "2026-06-16", events: [stock({ t: "Y", id: "y", ex: "2026-06-15", disclosed: "2026-06-01" })], clock, marketLag: 22 });
  assert.equal(m.listingBasis, "ESTIMATED_MARKET"); assert.equal(m.lag, 22);
  assert.equal(marketListingLag(hist, "2026-01-01", clock).n, 2);
});

test("lịch sử đợt: phiên GDKHQ và ex+1 → +h so với VN-Index (giá điều chỉnh)", () => {
  const dates = []; for (let d = "2024-05-01"; dates.length < 80; d = clock.shift(d, 1)) dates.push(d);
  const px = dates.map((d, i) => [d, d < "2024-05-31" ? 10 : d === "2024-05-31" ? 10.3 : 10.3 * (1 + 0.001 * (i - 21))]);
  const mkt = new Map(dates.map((d) => [d, 1000]));
  const h = dilutionHistory(hist, "2024-09-30", px, mkt, clock);
  assert.equal(h.length, 1); assert.ok(Math.abs(h[0].exDay - Math.log(1.03)) < 1e-9); assert.ok(h[0].x10 > 0); assert.equal(h[0].listing, "2024-07-04");
});

test("sổ PX-L: chỉ ghi đợt từ 19/11/2026 và trước phiên vào; chấm 10 phiên so đối chứng cùng ngày; không ghi lại", async () => {
  const kv = new Map(); const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, structuredClone(v)); } };
  const events = [
    { id: "n1", t: "AAA", cat: "STOCK", ratio: 20, ex: "2026-11-25", disclosed: "2026-11-12" },
    { id: "old", t: "AAA", cat: "STOCK", ratio: 20, ex: "2026-11-11", disclosed: "2026-11-01" },
    { id: "late", t: "BBB", cat: "BONUS", ratio: 30, ex: "2026-11-19", disclosed: "2026-11-10" },
  ];
  let date = "2026-11-20";
  const tickers = ["AAA", "BBB", ...Array.from({ length: 60 }, (_, i) => `Z${i}`)];
  const days = []; for (let d = "2026-11-02"; days.length < 40; d = clock.shift(d, 1)) days.push(d);
  const series = (t) => days.map((d, i) => [d, t === "AAA" ? 100 * (1 - 0.002 * i) : 100, 1e10]);
  const svc = createDilution({ store, corpEvents: { doc: () => ({ events }) }, panel: { panel: async () => ({ date, rows: tickers.map((ticker) => ({ ticker })) }) },
    adjustedCloses: async (ts) => new Map(ts.map((t) => [t, series(t)])), isTradingDay: (d) => clock.isTrading(d) });
  await svc.tick();
  let led = kv.get(PXL_KV); assert.deepEqual(led.entries.map((e) => e.id).sort(), ["late", "n1"], "BBB ex 19/11 ghi ở ex+1 (chưa qua phiên vào); đợt 11/11 trước ngày bắt đầu");
  date = "2026-11-24"; await svc.tick(); assert.equal(kv.get(PXL_KV).entries.length, 2, "không ghi lại");
  date = clock.shift(clock.shift("2026-11-25", 1), 10); await svc.tick();
  led = kv.get(PXL_KV); const n1 = led.entries.find((e) => e.id === "n1");
  assert.ok(n1.x[10] < 0, `AAA giảm so với đối chứng: ${n1.x[10]}`); assert.equal(n1.x[30], undefined);
  const s = pxLedgerSummary(led.entries); assert.equal(s.registered, 2); assert.ok(s[10].n >= 1);
  const phases = svc.phases("2026-11-24", ["AAA", "BBB", "Z1"]);
  // AAA còn trong cửa sổ hậu GDKHQ của đợt 11/11 (đợt sớm nhất còn hiệu lực được ưu tiên); BBB hậu GDKHQ; Z1 không có đợt.
  assert.equal(phases.AAA.phase, "POST_EX"); assert.equal(phases.AAA.ex, "2026-11-11"); assert.equal(phases.BBB.phase, "POST_EX"); assert.equal(phases.Z1, undefined);
  assert.equal(svc.phases("2026-11-12", ["AAA"]).AAA.phase, "POST_EX");
  assert.equal(svc.phases("2026-11-05", ["AAA"]).AAA.phase, "PRE_EX");
});
