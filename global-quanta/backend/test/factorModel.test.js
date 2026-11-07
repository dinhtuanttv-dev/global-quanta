import test from "node:test";
import assert from "node:assert/strict";
import { pitFeatures, quarterAvailable, rankScores, scoreCrossSection } from "../src/market/events/factorModel.js";

const Q = (fiscal, created, v) => ({ fiscal, created, v });
function rec({ npat = 100, eps = 1000, cfo = 120, divs = [40, 45, 50, 55, 60, 66, 70], tpl = "corp" } = {}) {
  const quarters = []; for (let y = 2023; y <= 2026; y++) for (const m of ["03-31", "06-30", "09-30", "12-31"]) { const f = `${y}-${m}`; quarters.push(Q(f, new Date(Date.parse(f) + 25 * 864e5).toISOString().slice(0, 10), { npatParent: npat * (y === 2026 ? 1.2 : 1), eps, cfo, equity: 2000, assets: 5000 })); }
  return { tpl, quarters, annual: divs.map((d, i) => ({ year: 2019 + i, v: { npatParent: 400, divPaid: -d, cfo: 480, capex: -100 } })) };
}
const px = (n = 400, start = 50) => Array.from({ length: n }, (_, i) => [new Date(Date.parse("2025-01-01") + i * 864e5).toISOString().slice(0, 10), start * (1 + 0.0005 * i), start * (1 + 0.0005 * i)]);

test("FM-v1 point-in-time: chỉ dùng BCTC quý đã công bố, BCTC năm từ 01/04 năm sau", () => {
  assert.equal(quarterAvailable({ fiscal: "2026-09-30", created: "2026-10-29" }), "2026-10-29");
  assert.equal(quarterAvailable({ fiscal: "2015-09-30", created: "2019-01-10" }), "2015-11-14"); // ngày nhập liệu hàng loạt -> cuối quý + 45
  const r = rec(), p = px();
  const a = pitFeatures(r, p, "2026-03-15"), b = pitFeatures(r, p, "2026-04-02");
  assert.equal(a._lastFy, 2024); assert.equal(b._lastFy, 2025); // BCTC năm 2024 chỉ dùng được từ 01/04/2025 … năm 2025 từ 01/04/2026
  assert.ok(b.yield > 0 && b.streak > 0 && b.payout5 > 0);
  assert.equal(pitFeatures(r, p, "2024-06-01"), null); // chưa có giá
});
test("FM-v1 chấm mặt cắt: z theo ngành, chiều biến đúng, cần ≥ 4 nhóm; xếp hạng ngũ phân vị", () => {
  const items = [];
  for (let i = 0; i < 10; i++) items.push({ t: `S${i}`, sector: "A", f: { yield: 0.02 + 0.01 * i, payout5: 0.5, fcfCover5: 1 + 0.1 * i, streak: 5, cuts10: 0, divCagr3: 0.05, npatGrowth: 0.1, roe: 0.1 + 0.01 * i, cfoToNpat: 1, accrual: 0.02, earningsYield: 0.08, bookYield: 0.5, vol1y: 0.4 - 0.02 * i, mdd1y: -0.3 } });
  items.push({ t: "THIN", sector: "B", f: { yield: 0.05 } });
  const sc = scoreCrossSection(items);
  assert.ok(sc.get("S9").score > sc.get("S0").score); // lợi suất, FCF, ROE cao hơn, biến động thấp hơn
  assert.ok(sc.get("S9").groups.R > sc.get("S0").groups.R); // biến động thấp = tốt
  assert.equal(sc.get("THIN").score, null); // chỉ 1 nhóm
  const rk = rankScores(sc);
  assert.equal(rk.get("S9").rank, 1); assert.equal(rk.get("S9").quintile, 5); assert.equal(rk.get("S0").quintile, 1); assert.equal(rk.has("THIN"), false);
});

test("BL-L1 sổ theo dõi tiến: ghi 1 lần/tháng, chấm sau 12 tháng theo ngũ phân vị", async () => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path"), zlib = await import("node:zlib");
  const { createFmLedger } = await import("../src/market/events/factorModel.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fml-")); fs.mkdirSync(path.join(dir, "px"));
  const rows = [];
  for (let i = 0; i < 40; i++) { const t = `T${i}`; rows.push({ t, fm: { score: i, quintile: Math.min(5, Math.floor(i / 8) + 1) } });
    fs.writeFileSync(path.join(dir, "px", `${t}.json.gz`), zlib.gzipSync(JSON.stringify({ rows: [["2026-11-01", 10], ["2027-11-10", 10 * (1 + i / 100)]] }))); }
  let clock = Date.parse("2026-11-07T05:00:00Z");
  const L = createFmLedger({ dir, getRows: async () => rows, now: () => clock, log: { log() {} } });
  assert.deepEqual(await L.tick(), { added: 40, scored: 0, cohorts: 1 });
  assert.deepEqual(await L.tick(), { added: 0, scored: 0, cohorts: 1 }); // không ghi trùng tháng
  clock = Date.parse("2027-11-09T05:00:00Z");
  const r = await L.tick();
  assert.equal(r.scored, 1);
  const c = L.summary().cohorts[0];
  assert.ok(c.result.spread > 0); assert.equal(c.result.n, 40);
  fs.rmSync(dir, { recursive: true, force: true });
});
