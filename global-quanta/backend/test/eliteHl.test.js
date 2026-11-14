// E4-HL — danh mục Elite HL (quy tắc chọn HL-v1 + cấu trúc G2r): hàm thuần với dữ liệu giả.
import test from "node:test";
import assert from "node:assert/strict";
import { buildHlPortfolio as buildRaw, exitReason, hlTradable, isoWeek, isRebalanceSession, HL_PF } from "../src/market/elite/eliteHl.js";
// Dữ liệu giả không có cột cấu trúc xu hướng -> tắt riêng phần độ phủ đó của chốt dữ liệu (test N0 bật lại).
const buildHlPortfolio = (o) => buildRaw({ cfg: { ...HL_PF, guardMinShare: 0 }, ...o });

const TA2 = { sepa_state: 2, base_breakout: 3 };
/** 40 mã: T39 có LS cao nhất. 8 mã đầu bảng đạt tầng 1; ngành theo `sec`, RRG theo `rrg`. */
function world({ rrg = () => 2, sec = (i) => `S${i % 5}`, sigma = () => 0.02, adv = () => 50, ta = () => TA2 } = {}) {
  const ids = Array.from({ length: 40 }, (_, i) => i);
  const panelRows = ids.map((i) => ({ ticker: `T${String(i).padStart(2, "0")}`, values: { ls_v1: i, ...(i >= 30 ? ta(i) : {}), rrg_quadrant: rrg(i) } }));
  const scores = ids.map((i) => ({ ticker: `T${String(i).padStart(2, "0")}`, Z: i / 10, rank: 40 - i, close: 20000, advBn: adv(i), sigma20: sigma(i), sectorKey: sec(i), alpha5Pct: 0.1, pOutperform: 0.5 }));
  return { panelRows, scores };
}

test("tuần ISO và phiên cân bằng: phiên đầu của tuần mới (kể cả tuần nghỉ lễ đầu tuần)", () => {
  assert.equal(isoWeek("2026-11-12"), "2026-W46"); assert.equal(isoWeek("2026-11-16"), "2026-W47"); assert.equal(isoWeek("2027-01-01"), "2026-W53");
  assert.equal(isRebalanceSession("2026-11-12", null), true, "chưa có danh mục -> dựng lần đầu");
  assert.equal(isRebalanceSession("2026-11-13", "2026-11-12"), false);
  assert.equal(isRebalanceSession("2026-11-17", "2026-11-13"), true, "thứ Hai nghỉ -> thứ Ba là phiên cân bằng");
});

test("cổng giao dịch được: GTGD ≥ 5 tỷ, giá ≥ 5.000đ, giá không bị neo", () => {
  const ok = { close: 20000, advBn: 5, sigma20: 0.02 };
  assert.equal(hlTradable(ok), null);
  assert.match(hlTradable({ ...ok, advBn: 4.9 }), /GTGD/); assert.match(hlTradable({ ...ok, close: 4000 }), /giá </); assert.match(hlTradable({ ...ok, sigma20: 0.001 }), /neo/); assert.match(hlTradable(null), /không có giá/);
});

test("mua: theo thứ tự xếp hạng HL, tối đa 10 mã / 3 mã mỗi ngành, định cỡ theo rủi ro, ô trống là tiền mặt", () => {
  // Biến động: mã lẻ 4%/ngày, mã chẵn 2%/ngày (trung vị vũ trụ 2% hoặc 3%).
  const w = world({ sigma: (i) => (i % 2 ? 0.04 : 0.02) });
  const { portfolio, hl } = buildHlPortfolio({ ...w, prev: [], rebalance: true, date: "2026-11-16" });
  assert.equal(hl.funnel.tier1, 8); assert.equal(hl.funnel.selected, 8); assert.equal(portfolio.length, 8, "chỉ 8 mã đạt Hợp lưu -> không lấy mã khác cho đủ 10");
  assert.ok(portfolio.every((x) => x.hl.status === "NEW" && x.retained === false && x.hl.since === "2026-11-16"));
  const by = Object.fromEntries(portfolio.map((x) => [x.ticker, x]));
  assert.ok(by.T38.weight > by.T39.weight, "mã biến động thấp nhận tỷ trọng cao hơn");
  assert.ok(portfolio.every((x) => x.weight >= HL_PF.wMin - 1e-9 && x.weight <= HL_PF.wMax + 1e-9));
  assert.ok(Math.abs(hl.invested + hl.cash - 1) < 1e-3 && hl.cash >= 0.099, "4 × 15% + 4 × 7,5% = 90% -> 10% tiền mặt");
  assert.ok(Math.abs(portfolio.reduce((a, x) => a + x.riskContribution, 0) - 1) < 1e-9);
  assert.equal(hl.changes.added.length, 8); assert.ok(hl.changes.costEst > 0);
  // Một ngành duy nhất: tối đa 3 mã và ≤ 30% tỷ trọng; mã còn lại vào hàng chờ kèm lý do.
  const one = buildHlPortfolio({ ...world({ sec: () => "S0" }), prev: [], rebalance: true, date: "2026-11-16" });
  assert.equal(one.portfolio.length, 3); assert.ok(one.hl.sectors[0].weight <= 0.3 + 1e-9);
  assert.ok(one.hl.queue.length === 5 && one.hl.queue.every((q) => q.code === "sector_cap"));
});

test("RRG: Cải thiện + Dẫn dắt được mua; Suy yếu / Tụt hậu không được mua; kém thanh khoản vào hàng chờ", () => {
  const w = world({ rrg: (i) => (i === 39 ? 1 : i === 38 ? -1 : i === 37 ? -2 : 2), adv: (i) => (i === 36 ? 2 : 50) });
  const { portfolio, hl } = buildHlPortfolio({ ...w, prev: [], rebalance: true, date: "2026-11-16" });
  const t = portfolio.map((x) => x.ticker);
  assert.ok(t.includes("T39"), "ngành Cải thiện = ủng hộ"); assert.ok(!t.includes("T38") && !t.includes("T37")); assert.ok(!t.includes("T36"));
  assert.deepEqual(hl.queue.map((q) => [q.ticker, q.code]), [["T36", "illiquid"]]);
  assert.deepEqual(hl.against.map((x) => x.ticker).sort(), ["T37", "T38"]);
});

test("giữ / bán (G2r): bán chậm — LS < 60, hết TA, ngành Tụt hậu, mất dữ liệu; ngành Suy yếu chỉ cảnh báo; không cân lại tỷ trọng", () => {
  const prev = [{ ticker: "T39", weight: 0.12, since: "2026-11-02" }, { ticker: "T26", weight: 0.1, since: "2026-11-02" }, { ticker: "T20", weight: 0.1, since: "2026-11-02" },
    { ticker: "T35", weight: 0.08, since: "2026-11-09" }, { ticker: "T34", weight: 0.09, since: "2026-11-09" }, { ticker: "ZZZ", weight: 0.1, since: "2026-11-09", miss: 1 }];
  // T26: LS phân vị 66 nhưng không còn mô hình TA; T20: LS phân vị 51; T35: ngành Tụt hậu; T34: ngành Suy yếu (giữ, cảnh báo).
  const w = world({ rrg: (i) => (i === 35 ? -2 : i === 34 ? -1 : 2) });
  const { portfolio, hl } = buildHlPortfolio({ ...w, prev, rebalance: false, date: "2026-11-13" });
  assert.deepEqual(portfolio.map((x) => x.ticker).sort(), ["T34", "T39"]);
  assert.deepEqual(Object.fromEntries(hl.changes.exits.map((x) => [x.ticker, x.code])), { T26: "ta", T20: "ls", T35: "rrg", ZZZ: "no_data" });
  const t39 = portfolio.find((x) => x.ticker === "T39"), t34 = portfolio.find((x) => x.ticker === "T34");
  assert.equal(t39.weight, 0.12, "mã đang giữ không bị cân lại tỷ trọng"); assert.equal(t39.retained, true); assert.equal(t39.hl.since, "2026-11-02");
  assert.deepEqual(t34.hl.warnings, ["Ngành chuyển sang Suy yếu"]);
  assert.equal(hl.changes.added.length, 0, "không phải phiên cân bằng -> không mua mới");
  assert.ok(hl.queue.length > 0 && hl.queue.every((q) => q.code === "wait"));
  assert.ok(Math.abs(hl.changes.turnover - (0.1 + 0.1 + 0.08 + 0.1) / 2) < 1e-9);
  // Mã đã mất tầng 1 nhưng chưa chạm ngưỡng bán (LS phân vị 71, còn 2 mô hình TA) vẫn được giữ, kèm khoảng cách tới ngưỡng.
  const keep = buildHlPortfolio({ ...world({ ta: () => TA2 }), prev: [{ ticker: "T30", weight: 0.1, since: "2026-11-02" }], rebalance: false, date: "2026-11-13" });
  assert.equal(keep.portfolio[0].ticker, "T30"); assert.equal(keep.portfolio[0].hl.exitBufferLs, 16.25);
  assert.equal(exitReason({ lsPct: 59, taCount: 3, rrg: 2 }, { close: 1 }).code, "ls"); assert.equal(exitReason({ lsPct: 90, taCount: 1, rrg: -1 }, { close: 1 }), null);
});

test("phiên cân bằng: giữ mã cũ, lấp ô trống bằng mã Hợp lưu kế tiếp trong giới hạn tiền mặt", () => {
  const prev = Array.from({ length: 7 }, (_, k) => ({ ticker: `T${33 + k}`, weight: 0.141, since: "2026-11-02" })); // 98,7% đã đầu tư
  const { portfolio, hl } = buildHlPortfolio({ ...world(), prev, rebalance: true, date: "2026-11-16" });
  assert.equal(portfolio.length, 7, "còn 1,3% tiền mặt < mức tối thiểu 2% -> không mở vị thế vụn");
  assert.deepEqual(hl.queue.map((q) => [q.ticker, q.code, q.reasonVi]), [["T32", "no_room", "Hết tiền mặt"]]);
  const more = buildHlPortfolio({ ...world(), prev: prev.slice(2).map((p) => ({ ...p, weight: 0.1 })), rebalance: true, date: "2026-11-16" });
  assert.equal(more.portfolio.length, 8); assert.deepEqual(more.hl.changes.added, ["T34", "T33", "T32"], "mua theo thứ tự xếp hạng"); assert.equal(more.hl.changes.kept, 5);
  assert.ok(more.hl.invested <= 1 + 1e-9);
  assert.deepEqual(more.portfolio.map((x) => x.hl.rank), [...more.portfolio.map((x) => x.hl.rank)].sort((a, b) => a - b), "danh mục xếp theo hạng hợp lưu");
});

test("N0 chốt dữ liệu: thiếu LS-v1 / nguồn TA / nguồn bị báo thiếu -> danh mục giữ nguyên, không vào, không ra", async () => {
  const { hlDataGuard } = await import("../src/market/elite/eliteHl.js");
  const prev = [{ ticker: "T39", weight: 0.12, since: "2026-11-02" }, { ticker: "T20", weight: 0.1, since: "2026-11-02" }];
  const w = world(); // 40 mã -> hạ ngưỡng chốt cho dữ liệu giả
  const cfg = { ...HL_PF };
  w.panelRows = w.panelRows.map((r) => ({ ...r, values: { ...r.values, structure_score: 3 } }));
  const ok = buildHlPortfolio({ ...w, prev, rebalance: true, date: "2026-11-16", cfg });
  assert.equal(ok.hl.dataGuard.frozen, false); assert.equal(ok.hl.changes.exits.length, 1, "bình thường: T20 ra vì LS < 60");
  const noLs = { ...w, panelRows: w.panelRows.map((r) => ({ ...r, values: { ...r.values, ls_v1: null } })) };
  const a = buildHlPortfolio({ ...noLs, prev, rebalance: true, date: "2026-11-16", cfg });
  assert.equal(a.hl.dataGuard.frozen, true); assert.match(a.hl.dataGuard.reasonsVi[0], /LS-v1 chỉ có 0\/40 mã/);
  assert.deepEqual(a.portfolio.map((x) => [x.ticker, x.weight]).sort(), [["T20", 0.1], ["T39", 0.12]], "giữ nguyên cả mã lẽ ra đã ra");
  assert.equal(a.hl.changes.exits.length, 0); assert.equal(a.hl.changes.added.length, 0); assert.equal(a.hl.rebalance, false, "phiên bị chốt không tính là phiên cân bằng");
  assert.match(a.portfolio[0].hl.warnings[0], /Dữ liệu phiên không đủ/);
  const noTa = { ...w, panelRows: w.panelRows.map((r) => ({ ticker: r.ticker, values: { ls_v1: r.values.ls_v1, rrg_quadrant: 2, structure_score: 3, sepa_state: 0, base_breakout: 0 } })) };
  const b = buildHlPortfolio({ ...noTa, prev, rebalance: false, date: "2026-11-16", cfg });
  assert.equal(b.hl.dataGuard.frozen, true); assert.match(b.hl.dataGuard.reasonsVi.join(), /nghi nguồn TA rỗng/); assert.equal(b.portfolio.length, 2);
  const c = buildHlPortfolio({ ...w, prev, rebalance: true, date: "2026-11-16", cfg, missingSources: ["strategies:sepa", "catalyst"] });
  assert.deepEqual(c.hl.dataGuard.reasonsVi, ["Thiếu nguồn SEPA"], "nguồn tầng 3 thiếu không chốt danh mục"); assert.equal(c.portfolio.length, 2);
  assert.deepEqual(hlDataGuard({ panelRows: w.panelRows, missingSources: [], hl: ok.portfolio.map(() => ({ taCount: 2 })).concat(Array(5).fill({ taCount: 2 })) }, cfg), []);
});

test("N0 mã vắng mặt: phiên đầu giữ kèm cảnh báo, vắng 2 phiên liên tiếp mới ra; có lại dữ liệu thì xoá bộ đếm", () => {
  const cfg = { ...HL_PF, guardMinShare: 0 };
  const w = world();
  const d1 = buildHlPortfolio({ ...w, prev: [{ ticker: "ZZZ", weight: 0.1, since: "2026-11-02" }, { ticker: "T39", weight: 0.1, since: "2026-11-02" }], rebalance: false, date: "2026-11-13", cfg });
  const z1 = d1.portfolio.find((x) => x.ticker === "ZZZ");
  assert.ok(z1, "vắng lần 1 -> chưa ra"); assert.equal(z1.hl.miss, 1); assert.match(z1.hl.warnings[0], /lần 1\/2/); assert.equal(d1.hl.changes.exits.length, 0);
  const d2 = buildHlPortfolio({ ...w, prev: [{ ticker: "ZZZ", weight: 0.1, since: "2026-11-02", miss: 1 }, { ticker: "T39", weight: 0.1, since: "2026-11-02", miss: 1 }], rebalance: false, date: "2026-11-16", cfg });
  assert.deepEqual(d2.hl.changes.exits.map((x) => [x.ticker, x.code]), [["ZZZ", "no_data"]]);
  assert.equal(d2.portfolio.find((x) => x.ticker === "T39").hl.miss, 0, "có lại dữ liệu -> bộ đếm về 0");
});

// N0b (14/11/2026): mã có trong bảng, có giá, nhưng thiếu LS-v1 của RIÊNG nó — không được bán ngay như "LS < 60".
test("N0b thiếu LS-v1 của riêng một mã: phiên đầu giữ kèm cảnh báo, 2 phiên liên tiếp mới ra (no_data); có lại LS thì xoá bộ đếm; LS thấp thật vẫn bán ngay", () => {
  const cfg = { ...HL_PF, guardMinShare: 0 };
  const gapWorld = () => { const w = world(); w.panelRows.find((r) => r.ticker === "T38").values.ls_v1 = null; return w; };
  const prev = [{ ticker: "T38", weight: 0.1, since: "2026-11-02" }, { ticker: "T39", weight: 0.1, since: "2026-11-02" }];
  const d1 = buildHlPortfolio({ ...gapWorld(), prev, rebalance: false, date: "2026-11-13", cfg });
  assert.equal(d1.hl.dataGuard.frozen, false, "độ phủ cả bảng bình thường -> chốt dữ liệu toàn bảng không bật");
  assert.equal(d1.hl.changes.exits.length, 0, "thiếu LS lần 1 -> chưa ra");
  const t38 = d1.portfolio.find((x) => x.ticker === "T38");
  assert.equal(t38.hl.miss, 1); assert.equal(t38.weight, 0.1); assert.equal(t38.hl.lsPct, null); assert.equal(t38.hl.exitBufferLs, null);
  assert.match(t38.hl.warnings[0], /Không có điểm LS-v1 của mã phiên này \(lần 1\/2\)/);
  // Phiên kế vẫn thiếu -> ra, với lý do đúng (mất dữ liệu), không phải "xuống phân vị —".
  const d2 = buildHlPortfolio({ ...gapWorld(), prev: prev.map((p) => (p.ticker === "T38" ? { ...p, miss: 1 } : p)), rebalance: false, date: "2026-11-16", cfg });
  assert.deepEqual(d2.hl.changes.exits.map((x) => [x.ticker, x.code]), [["T38", "no_data"]]);
  assert.match(d2.hl.changes.exits[0].reasonVi, /Không có điểm LS-v1 của mã 2 phiên liên tiếp/);
  // Có lại LS-v1 ở phiên kế -> giữ, bộ đếm về 0, cảnh báo thường.
  const d3 = buildHlPortfolio({ ...world(), prev: prev.map((p) => (p.ticker === "T38" ? { ...p, miss: 1 } : p)), rebalance: false, date: "2026-11-16", cfg });
  assert.equal(d3.hl.changes.exits.length, 0); assert.equal(d3.portfolio.find((x) => x.ticker === "T38").hl.miss, 0);
  // Quy tắc bán theo LS không đổi: có LS và dưới ngưỡng -> bán ngay; mã thiếu LS không được mua mới.
  assert.equal(exitReason({ lsPct: 59, taCount: 3, rrg: 2 }, { close: 1 }).code, "ls");
  assert.equal(exitReason({ lsPct: null, taCount: 3, rrg: 2 }, { close: 1 }).code, "no_data");
  const buy = buildHlPortfolio({ ...gapWorld(), prev: [], rebalance: true, date: "2026-11-16", cfg });
  assert.ok(!buy.portfolio.some((x) => x.ticker === "T38"), "thiếu LS -> không đạt tầng 1 -> không mua");
});
