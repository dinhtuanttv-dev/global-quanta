// E4-HL v1.1 — lớp nâng cấp U0–U4 bọc ngoài buildHlPortfolio: hàm gốc không đổi, chỉ biến đổi bản sao đầu vào và ghi chú đầu ra.
import test from "node:test";
import assert from "node:assert/strict";
import { buildHlPortfolio, HL_PF } from "../src/market/elite/eliteHl.js";
import { buildHlPortfolioV11, halfWeek, isRebalanceV11, legalStatus, rrgLaggingConfirmed, HL_V11_VERSION } from "../src/market/elite/eliteHlUpgrade.js";

const CFG = { ...HL_PF, guardMinShare: 0 };
const TA2 = { sepa_state: 2, base_breakout: 3 };
const T = (i) => `T${String(i).padStart(2, "0")}`;
/** 40 mã: 8 mã đầu bảng (T32–T39) đạt tầng 1; ngành theo `sec`, RRG theo `rrg`. */
function world({ rrg = () => 2, sec = (i) => `S${i % 5}`, ls = (i) => i } = {}) {
  const ids = Array.from({ length: 40 }, (_, i) => i);
  const panelRows = ids.map((i) => ({ ticker: T(i), values: { ls_v1: ls(i), ...(i >= 30 ? TA2 : {}), rrg_quadrant: rrg(i) } }));
  const scores = ids.map((i) => ({ ticker: T(i), Z: i / 10, rank: 40 - i, close: 20000, advBn: 50, sigma20: 0.02, sectorKey: sec(i), alpha5Pct: 0.1, pOutperform: 0.5 }));
  const symbols = Object.fromEntries(ids.map((i) => [T(i), { l1: "1000", l2: sec(i) }]));
  return { panelRows, scores, taxonomy: { symbols } };
}
const tail = (...qs) => qs.map((q, k) => ({ date: `2026-11-${String(6 + 7 * k).padStart(2, "0")}`, quadrant: q }));
const strip = (H) => H.portfolio.map((x) => `${x.ticker}:${x.weight}`).sort().join(" ");

test("U0 nhịp 2,5–3 phiên: nửa tuần A (thứ Hai–Tư) và B (thứ Năm–Sáu); nghỉ lễ thứ Hai -> thứ Ba", () => {
  assert.equal(halfWeek("2026-11-16"), "2026-W47-A"); assert.equal(halfWeek("2026-11-18"), "2026-W47-A");
  assert.equal(halfWeek("2026-11-19"), "2026-W47-B"); assert.equal(halfWeek("2026-11-20"), "2026-W47-B");
  const e = [{ date: "2026-11-16", rebalance: true }];
  assert.equal(isRebalanceV11("2026-11-17", e), false);
  assert.equal(isRebalanceV11("2026-11-19", e), true, "thứ Năm là phiên cân bằng thứ hai của tuần");
  assert.equal(isRebalanceV11("2026-11-20", [...e, { date: "2026-11-19", rebalance: true }]), false);
  assert.equal(isRebalanceV11("2026-11-17", []), true, "thứ Hai nghỉ -> thứ Ba");
  assert.equal(isRebalanceV11("2026-11-17", [{ date: "2026-11-16", rebalance: false, frozen: true }]), true, "phiên bị chốt dữ liệu không tính");
});

test("không có sự kiện nào của U1–U3: danh mục trùng hàm gốc, chỉ đổi chuỗi phiên bản", () => {
  const w = world();
  const args = { panelRows: w.panelRows, scores: w.scores, date: "2026-11-16", cfg: CFG, rebalance: true };
  const A = buildHlPortfolio(args), B = buildHlPortfolioV11(args, { entries: [], taxonomy: w.taxonomy, rrg: { sectors: [] }, events: [] });
  assert.equal(strip(B), strip(A));
  assert.deepEqual(B.hl.queue, A.hl.queue);
  assert.deepEqual(B.hl.changes, A.hl.changes);
  assert.equal(B.hl.version, HL_V11_VERSION);
  assert.deepEqual(B.hl.upgrade.v1Diff.onlyV1, []); assert.deepEqual(B.hl.upgrade.v1Diff.onlyV11, []);
});

test("U1: Tụt hậu chưa đủ 2 tuần đã đóng -> giữ mã (cảnh báo); đủ 2 tuần -> bán theo ngành như luật gốc", () => {
  const w = world({ rrg: (i) => (i % 5 === 0 ? -2 : 2) }); // ngành S0 Tụt hậu (tuần đang chạy)
  const prev = [{ ticker: "T35", weight: 0.1, since: "2026-11-12" }]; // T35 thuộc S0
  const args = { panelRows: w.panelRows, scores: w.scores, prev, date: "2026-11-17", cfg: CFG, rebalance: false };
  assert.equal(buildHlPortfolio(args).hl.changes.exits[0]?.code, "rrg", "luật gốc bán ngay");
  const once = buildHlPortfolioV11(args, { taxonomy: w.taxonomy, rrg: { sectors: [{ code: "S0", tail: tail("IMPROVING", "LAGGING") }] }, entries: [{ date: "2026-11-16", rebalance: true }] });
  assert.equal(once.hl.changes.exits.length, 0);
  const h = once.portfolio.find((x) => x.ticker === "T35");
  assert.equal(h.hl.rrg, -2, "hiển thị góc RRG thật");
  assert.ok(h.hl.warnings.some((s) => /chưa đủ 2 tuần/.test(s)));
  assert.ok(!h.hl.warnings.includes("Ngành chuyển sang Suy yếu"));
  assert.deepEqual(once.hl.upgrade.rrgPending, ["S0"]);
  const twice = buildHlPortfolioV11(args, { taxonomy: w.taxonomy, rrg: { sectors: [{ code: "S0", tail: tail("LAGGING", "LAGGING") }] }, entries: [{ date: "2026-11-16", rebalance: true }] });
  assert.equal(twice.hl.changes.exits[0]?.code, "rrg");
  assert.equal(rrgLaggingConfirmed({ tail: tail("IMPROVING", "LAGGING", "LAGGING") }, "2026-11-17"), false, "point-in-time: tuần 20/11 chưa đóng ở phiên 17/11");
  assert.equal(rrgLaggingConfirmed({ tail: tail("IMPROVING", "LAGGING", "LAGGING") }, "2026-11-20"), true);
  assert.equal(rrgLaggingConfirmed({ tail: tail("LAGGING") }, "2026-11-17"), null, "không đủ tuần -> giữ luật gốc");
});

test("U1 không đổi chiều mua: ngành Tụt hậu chưa xác nhận vẫn không được mua", () => {
  const w = world({ rrg: (i) => (i % 5 === 0 ? -2 : 2) });
  const args = { panelRows: w.panelRows, scores: w.scores, date: "2026-11-16", cfg: CFG, rebalance: true };
  const A = buildHlPortfolio(args), B = buildHlPortfolioV11(args, { taxonomy: w.taxonomy, rrg: { sectors: [{ code: "S0", tail: tail("IMPROVING", "LAGGING") }] }, entries: [] });
  assert.equal(strip(B), strip(A));
  assert.ok(!B.portfolio.some((x) => x.ticker === "T35"));
});

test("U2: phiên thường có lệnh bán -> mua bù đúng số ô vừa trống; không có lệnh bán -> không mua", () => {
  const w = world({ ls: (i) => (i === 39 ? 1 : i) }); // T39 rơi LS -> bán
  const prev = ["T39", "T38", "T37"].map((t) => ({ ticker: t, weight: 0.1, since: "2026-11-16" }));
  const args = { panelRows: w.panelRows, scores: w.scores, prev, date: "2026-11-17", cfg: CFG, rebalance: false };
  const H = buildHlPortfolioV11(args, { entries: [{ date: "2026-11-16", rebalance: true }] });
  assert.deepEqual(H.hl.changes.exits.map((e) => e.ticker), ["T39"]);
  assert.equal(H.hl.changes.added.length, 1, "chỉ 1 ô vừa trống");
  assert.equal(H.portfolio.length, 3);
  assert.equal(H.hl.upgrade.cadence.refill.bought, 1);
  assert.equal(H.hl.rebalance, true, "phiên có mua bù được đánh dấu là phiên vào lệnh");
  assert.ok(H.hl.queue.every((q) => q.code !== "full"));
  const quiet = buildHlPortfolioV11({ ...args, panelRows: world().panelRows }, { entries: [{ date: "2026-11-16", rebalance: true }] });
  assert.equal(quiet.hl.changes.added.length, 0); assert.equal(quiet.hl.rebalance, false);
});

test("U3: sự kiện pháp lý chính thức chặn mua mới, không tự bán mã đang giữ; ký quỹ trở lại thì hết cảnh báo", () => {
  const w = world();
  const events = [
    { t: "T39", group: "STATUS", cat: "CONTROL", label: "Diện kiểm soát", date: "2026-11-10" },
    { t: "T38", group: "STATUS", cat: "WARNING", label: "Diện cảnh báo", date: "2026-11-11" },
    { t: "T37", group: "STATUS", cat: "NO_MARGIN", label: "Không đủ điều kiện ký quỹ", date: "2026-10-01" },
    { t: "T37", group: "STATUS", cat: "MARGIN_OK", label: "Đủ điều kiện ký quỹ trở lại", date: "2026-11-01" },
    { t: "T36", group: "STATUS", cat: "HALT", label: "Tạm ngừng", date: "2026-11-30" }, // sau phiên -> không tính
  ];
  const prev = [{ ticker: "T38", weight: 0.1, since: "2026-11-12" }];
  const H = buildHlPortfolioV11({ panelRows: w.panelRows, scores: w.scores, prev, date: "2026-11-16", cfg: CFG, rebalance: true }, { entries: [], events });
  assert.ok(!H.portfolio.some((x) => x.ticker === "T39"), "T39 không được mua");
  assert.equal(H.hl.queue.find((q) => q.ticker === "T39")?.code, "legal_block");
  const held = H.portfolio.find((x) => x.ticker === "T38");
  assert.ok(held, "T38 đang giữ không bị bán tự động");
  assert.equal(held.hl.legal.level, "red");
  assert.ok(held.hl.warnings.some((s) => /Sự kiện pháp lý/.test(s)));
  const L = legalStatus(events, "2026-11-16");
  assert.equal(L.has("T37"), false); assert.equal(L.has("T36"), false);
  // Không có sự kiện đỏ cho mã chưa giữ -> cổng PZ không bị bật.
  const plain = buildHlPortfolioV11({ panelRows: w.panelRows, scores: w.scores, prev, date: "2026-11-16", cfg: CFG, rebalance: true }, { entries: [], events: events.filter((e) => e.t !== "T39") });
  assert.equal(strip(plain), strip(buildHlPortfolio({ panelRows: w.panelRows, scores: w.scores, prev, date: "2026-11-16", cfg: CFG, rebalance: true })));
});

test("chốt dữ liệu: mọi nâng cấp mua tắt; U4 chạy lãi chỉ mô tả", () => {
  const w = world({ ls: (i) => (i === 39 ? 1 : i) });
  const prev = [{ ticker: "T39", weight: 0.1, since: "2026-11-12" }, { ticker: "T38", weight: 0.1, since: "2026-11-12", ref: 18000 }];
  const frozen = buildHlPortfolioV11({ panelRows: w.panelRows, scores: w.scores, prev, date: "2026-11-16", cfg: CFG, rebalance: true, missingSources: ["scanner"] }, { entries: [] });
  assert.equal(frozen.hl.dataGuard.frozen, true);
  assert.equal(frozen.hl.rebalance, false); assert.equal(frozen.hl.changes.added.length, 0); assert.equal(frozen.hl.changes.exits.length, 0);
  const ok = buildHlPortfolioV11({ panelRows: world().panelRows, scores: w.scores, prev, date: "2026-11-17", cfg: CFG, rebalance: false }, { entries: [{ date: "2026-11-16", rebalance: true }] });
  const t38 = ok.portfolio.find((x) => x.ticker === "T38");
  assert.ok(t38.hl.runner && t38.hl.runner.sinceRet >= 0.08, "20.000 / 18.000 − 1 = 11%");
  assert.equal(ok.portfolio.find((x) => x.ticker === "T39").hl.runner, undefined);
});
