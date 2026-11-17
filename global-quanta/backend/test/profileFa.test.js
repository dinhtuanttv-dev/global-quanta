// PFA-v1 — Hồ sơ 360° · Doanh nghiệp & Sự kiện: read-model ghép engine có sẵn, khoá theo phiên, không nhìn trước, tài chính = không áp dụng.
import test from "node:test";
import assert from "node:assert/strict";
import { buildProfileFa, createProfileFa, earningsBlock, eventsBlock, pfaWarnings, weekdaysBetween, PFA_KV, PFA_KEEP } from "../src/market/elite/profileFa.js";

const corp = {
  t: "AAA", tpl: "corp", quarter: "Q3/2026", fiscal: "2026-09-30", created: "2026-10-30", npatYoY: { value: 0.2, status: "NORMAL" }, ttmGrowth: { value: 0.15, status: "NORMAL" },
  netMarginTtm: 0.1, roe: 0.18, accrual: 0.14, cfoToNpat: -0.3, f: 3, m: -1.2, mFlag: true, z: 0.9, zZone: "DISTRESS", sueNpat: 0.5, sueCore: 0.2,
  nowcast: { growth: 0.05, est: 1e12, lo: 8e11, hi: 1.2e12, cumShare: 0.75 }, flags: ["HIGH_ACCRUAL", "NEG_CFO", "M_FLAG", "Z_DISTRESS", "AUDIT_DIFF"],
  ttm: { npat: 1.2e12, top: 9e12, eps: 3000 }, kpi: { debtToEquity: 1.1 },
};
const detail = { latest: { published: "2026-10-29", publishedSource: "DISCLOSURE" }, quality: { piotroski: { score: 3, of: 9, tests: [{ id: "roa", label: "ROA dương", pass: true }] } },
  evidence: { prereg: "KQ-r1", nowcast: { pass: true, label: "THĂM DÒ", ic: 0.047, p: 0.0005 }, sueCore: { pass: false, label: "MÔ TẢ", ic: 0.04, p: 0.075 } } };

test("weekdaysBetween: bỏ thứ Bảy / Chủ nhật, không tính ngày đầu", () => {
  assert.equal(weekdaysBetween("2026-11-13", "2026-11-17"), 2); // Thứ Sáu -> Thứ Ba: Thứ Hai, Thứ Ba
  assert.equal(weekdaysBetween("2026-11-17", "2026-11-17"), 0);
  assert.equal(weekdaysBetween("2026-11-17", "2026-11-10"), null);
});

test("earningsBlock: quý công bố SAU phiên bị ẩn số (không nhìn trước); ngày công bố thật lấy từ chi tiết", () => {
  const ok = earningsBlock(corp, detail, "2026-11-17");
  assert.equal(ok.available, true); assert.equal(ok.published, "2026-10-29"); assert.equal(ok.publishedSource, "DISCLOSURE");
  assert.deepEqual(ok.piotroski, { score: 3, of: 9, tests: [{ id: "roa", label: "ROA dương", pass: true }] });
  assert.deepEqual(ok.beneish, { m: -1.2, flag: true }); assert.equal(ok.altman.zone, "DISTRESS"); assert.equal(ok.evidence.nowcast.pass, true);
  const late = earningsBlock(corp, detail, "2026-10-28");
  assert.equal(late.available, false); assert.match(late.reasonVi, /sau phiên 2026-10-28/); assert.equal(late.npatTtm, undefined, "không lộ số của quý chưa công bố");
  assert.equal(earningsBlock(null, null, "2026-11-17").available, false);
});

test("earningsBlock: tổ chức tài chính — dòng tiền / Piotroski / Beneish / Altman KHÔNG ÁP DỤNG, cờ dòng tiền bị bỏ", () => {
  const sec = earningsBlock({ ...corp, tpl: "sec" }, detail, "2026-11-17");
  assert.equal(sec.financial, true);
  assert.equal(sec.piotroski, null); assert.equal(sec.beneish, null); assert.equal(sec.altman, null); assert.equal(sec.accrual, null); assert.equal(sec.cfoToNpat, null);
  assert.deepEqual(sec.flags, ["AUDIT_DIFF"]); assert.deepEqual(sec.na, ["piotroski", "beneish", "altman", "accrual", "cfoToNpat"]);
  assert.equal(pfaWarnings({ asOf: "2026-11-17", earnings: sec, events: { upcoming: [], status: [] }, calendar: {} }).filter((w) => w.level === "warn").length, 0);
});

test("eventsBlock: chỉ sự kiện đã công bố tới phiên; sắp tới / gần đây / trạng thái; số phiên còn lại", () => {
  const ev = [
    { t: "AAA", cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", disclosed: "2026-11-10", ex: "2026-11-24", pay: "2026-12-15", cash: 1500 },
    { t: "AAA", cat: "STOCK", group: "DIVIDEND", label: "Cổ tức cổ phiếu", disclosed: "2026-11-20", ex: "2026-12-01", ratio: 20 }, // công bố SAU phiên
    { t: "AAA", cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", disclosed: "2026-08-01", ex: "2026-08-20", cash: 1000 },
    { t: "AAA", cat: "WARNING", group: "STATUS", label: "Diện cảnh báo", date: "2026-09-01" },
  ];
  const b = eventsBlock(ev, "2026-11-17");
  assert.deepEqual(b.upcoming.map((x) => [x.cat, x.ex, x.sessionsAway, x.leadDays]), [["CASH", "2026-11-24", 5, 14]]);
  assert.deepEqual(b.recent.map((x) => x.ex), ["2026-08-20"], "trạng thái không lặp lại ở mục gần đây");
  assert.deepEqual(b.status.map((x) => x.cat), ["WARNING"]);
});

test("pfaWarnings: đủ loại cảnh báo mô tả, đúng mức; cổ tức cổ phiếu sắp GDKHQ cảnh báo phần cổ phiếu chưa bán được", () => {
  const doc = buildProfileFa({
    ticker: "AAA", asOf: "2026-11-17", kq: corp, detail,
    cal: { next: { status: "UPCOMING", band: ["2026-11-25", "2026-12-10"] } },
    events: [
      { cat: "STOCK", group: "DIVIDEND", label: "Cổ tức cổ phiếu", disclosed: "2026-11-12", ex: "2026-11-26", ratio: 20 },
      { cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", disclosed: "2026-11-12", ex: "2026-11-20", cash: 800 },
      { cat: "CONTROL", group: "STATUS", label: "Diện kiểm soát", date: "2026-10-01" },
    ],
  });
  const ids = doc.warnings.map((w) => `${w.id}:${w.level}`);
  for (const id of ["PIOTROSKI_LOW:warn", "BENEISH:warn", "ALTMAN:warn", "ACCRUAL:warn", "NEG_CFO:warn", "AUDIT_DIFF:info", "STATUS_CONTROL:warn", "STOCK_EX_SOON:warn", "CASH_EX_SOON:info", "KQKD_SOON:info"]) assert.ok(ids.includes(id), `thiếu ${id} trong ${ids.join(", ")}`);
  assert.ok(!ids.includes("LOSS_TTM:warn"));
  assert.match(doc.warnings.find((w) => w.id === "STOCK_EX_SOON").text, /cổ phiếu mới chưa bán được/);
  const loss = buildProfileFa({ ticker: "B", asOf: "2026-11-17", kq: { ...corp, ttm: { npat: -5e10 }, flags: [] }, detail: null });
  assert.equal(loss.warnings.find((w) => w.id === "LOSS_TTM")?.level, "warn");
  assert.equal(loss.dividend.available, false); assert.equal(loss.to.available, false);
});

test("dịch vụ: dựng một lần cho phiên E1, khoá khoá local:, phiên cũ chỉ đọc bản đã lưu, giữ tối đa PFA_KEEP phiên", async () => {
  const kv = new Map(); const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); } };
  let date = "2026-11-17", detailCalls = 0;
  const svc = createProfileFa({
    store, panel: { panel: async () => ({ date, rows: [{ ticker: "AAA" }, { ticker: "ZZZ" }] }) },
    kqkd: { summary: async () => ({ rows: [corp], latestQuarter: "Q3/2026" }), detail: async (t) => { detailCalls++; return t === "AAA" ? detail : null; }, calendar: async () => ({ asOf: date, current: { rows: [] }, next: { rows: [] } }) },
    dividendScreener: { get: async () => ({ asOf: {}, rows: [{ t: "AAA", price: 30000, yieldGross: 0.05, div: { ttmCash: 1500, streak: 6 }, fund: { payout: 0.5 } }] }) },
    corpEvents: { doc: () => ({ fetchedAt: "x", events: [] }) }, log: { info() {} },
  });
  const d = await svc.doc();
  assert.equal(d.asOf, "2026-11-17"); assert.deepEqual(d.coverage, { tickers: 2, earnings: 1, detail: 1, dividend: 1 });
  assert.ok(kv.has(PFA_KV.doc("2026-11-17")) && PFA_KV.doc("x").startsWith("local:"), "chỉ lưu trên ổ Gateway");
  await svc.doc(); assert.equal(detailCalls, 2, "cùng phiên -> không dựng lại");
  const a = await svc.ticker("AAA"); assert.equal(a.dividend.yieldGross, 0.05); assert.equal(a.earnings.piotroski.score, 3);
  assert.equal((await svc.ticker("ZZZ")).earnings.available, false); assert.equal((await svc.ticker("QQQ")).missing, true);
  assert.deepEqual(Object.keys((await svc.warnings()).tickers).sort(), ["AAA", "ZZZ"]);
  assert.equal(await svc.doc("2026-11-10"), null, "phiên chưa từng dựng -> không dựng bù bằng dữ liệu hôm nay");
  // Giữ tối đa PFA_KEEP phiên.
  kv.set(PFA_KV.index, { dates: Array.from({ length: PFA_KEEP }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`) });
  date = "2026-11-18"; await svc.doc();
  assert.equal(kv.get(PFA_KV.index).dates.length, PFA_KEEP); assert.equal(kv.get(PFA_KV.doc("2026-09-01")), null);
});
