import { test } from "node:test";
import assert from "node:assert/strict";
import { factorPressure, icFor, mediumTermContext, normCdf, relativeVol, riskRegime, shortTermStrategy } from "../src/market/worldSectors/strategy.js";
import { createWorldStrategyService } from "../src/market/worldSectors/worldStrategyService.js";

const days = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
const walk = (d, f) => { let p = 100; return d.map((x, i) => [x, (p *= Math.exp(f(i)))]); };
const EV = { shortList: { pass: true, ic: 0.02 }, mediumList: { pass: false }, sectors: { "0500": { pass: true, ic: 0.18 } } };

test("icFor: chỉ IC đã đạt; ngành đạt riêng co về IC danh sách; danh sách không đạt -> 0", () => {
  assert.equal(icFor("8300", EV).ic, 0.02);
  assert.equal(icFor("0500", EV).ic, 0.1);
  assert.equal(icFor("8300", { shortList: { pass: false, ic: 0.05 } }).ic, 0);
});

test("shortTermStrategy: z cắt ngang trung bình 0 / độ lệch 1; α = IC·σ·z; P = Φ(α/σ); nhãn theo |z| ≥ 1", () => {
  const d = days(300);
  const vn = walk(d, (i) => Math.sin(i) * 0.01);
  const rows = ["0500", "8300", "9500", "8600"].map((icb, k) => ({ icb, nameVi: icb, available: true, short: { score: [1.5, 0.5, -0.5, -1.5][k], sectors: { byRegion: {} } } }));
  const series = Object.fromEntries(rows.map((r, k) => [r.icb, walk(d, (i) => Math.sin(i) * 0.01 + Math.cos(i * (k + 2)) * 0.01)]));
  const s = shortTermStrategy(rows, series, vn, EV);
  const zs = s.rows.map((r) => r.zx);
  assert.ok(Math.abs(zs.reduce((a, b) => a + b, 0)) < 1e-6);
  const oil = s.rows.find((r) => r.icb === "0500");
  assert.ok(Math.abs(oil.alphaBps - oil.ic * oil.sigmaBps * oil.zx) < 0.05);
  assert.ok(oil.pOutperform > 0.5);
  assert.equal(oil.stance, "overweight");
  assert.equal(s.rows.find((r) => r.icb === "8600").stance, "underweight");
  assert.equal(s.rows[0].icb, "0500"); // xếp theo α
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6);
  assert.equal(relativeVol(series["0500"].slice(0, 10), vn), null);
});

test("mediumTermContext: bỏ phiếu 3 nguồn; kịch bản |ước tính| > 50% bị gắn cờ không tin cậy", () => {
  const rows = [
    { icb: "8300", nameVi: "NH", available: true, medium: { score: 0.8, label: "tailwind" } },
    { icb: "8600", nameVi: "BĐS", available: true, medium: { score: -0.8, label: "headwind" } },
    { icb: "4500", nameVi: "YT", available: true, medium: { score: 0.1, label: "neutral" } },
  ];
  const rrg = { "8300": { liveQuadrant: "IMPROVING" }, "8600": { quadrant: "LAGGING" }, "4500": { quadrant: "LEADING" } };
  const world = {
    cells: [{ factor: "FED", sector: "S_BANK", tier: "B", beta: -1, lag: 1 }, { factor: "DXY", sector: "S_BANK", tier: "C", beta: 1 }],
    pulse: [{ id: "FED", z: -1 }],
    confirm: [{ id: "P4", factor: "FED", sector: "S_BANK", confirmed: false, signOk: true, q: 1 }],
    scenarios: [{ id: "oil-spike", nameVi: "Dầu", sectors: [{ sector: "S_BANK", est: -127, lo: -200, hi: -30, conclusive: true }, { sector: "S_RE", est: -3, lo: -8, hi: 2, conclusive: false }] }],
  };
  const m = mediumTermContext(rows, rrg, world);
  const bank = m.find((x) => x.icb === "8300");
  assert.equal(bank.stance, "supportive"); // ws +, rrg +, áp lực Fed giảm (β<0 × z −1 = +1)
  assert.equal(bank.factorPressure.score, 1);
  assert.equal(bank.factorPressure.links.length, 1); // bậc C bị bỏ
  assert.equal(bank.scenarios[0].unreliable, true);
  assert.equal(bank.scenarios[0].conclusive, false);
  assert.equal(m.find((x) => x.icb === "8600").stance, "adverse");
  assert.equal(m.find((x) => x.icb === "4500").stance, "mixed");
  assert.equal(m[0].icb, "8300");
  assert.equal(factorPressure([], [], "S_X").score, null);
});

test("riskRegime + dịch vụ: ghép nguồn, đệm 10 phút, nguồn lỗi không làm hỏng", async () => {
  assert.equal(riskRegime({ quotes: { vix: { value: 22, changePct: 3 } } }).stressed, true);
  assert.equal(riskRegime({ quotes: { vix: { value: 14, changePct: 2 } } }).stressed, false);
  const d = days(300);
  let calls = 0;
  const svc = createWorldStrategyService({
    worldSectors: { scores: async () => { calls++; return { rows: [{ icb: "8300", nameVi: "NH", available: true, vnLast: d.at(-1), short: { score: 1, sectors: { byRegion: {} } }, medium: { score: 0, label: "neutral" } }, { icb: "0500", nameVi: "DK", available: true, short: { score: -1, sectors: { byRegion: {} } }, medium: { score: 0, label: "neutral" } }] }; },
      vnSeries: async () => new Map([["8300", { points: walk(d, (i) => Math.sin(i) * 0.01) }], ["0500", { points: walk(d, (i) => Math.cos(i) * 0.01) }]]) },
    worldService: { handle: async () => { throw new Error("worker down"); } },
    vnIndex: async () => walk(d, (i) => Math.sin(i * 2) * 0.005), log: { warn() {} },
  });
  const s = await svc.strategy();
  assert.equal(s.short.rows.length, 2);
  assert.equal(s.sources.matrix, false);
  assert.equal(s.evidence.medium.label, "EXPERIMENTAL");
  await svc.strategy();
  assert.equal(calls, 1);
});

test("S2 sổ theo dõi: ghi tới 09:00 VN phiên kế tiếp rồi khoá; chấm IC với phiên VN kế tiếp", async () => {
  const { nextOpenMs, updateLedger, evaluateLedger } = await import("../src/market/worldSectors/strategy.js");
  assert.equal(new Date(nextOpenMs("2026-10-16")).toISOString(), "2026-10-19T02:00:00.000Z"); // T6 -> T2
  const rows = Array.from({ length: 12 }, (_, k) => ({ icb: String(1000 + k), zx: k - 5.5 }));
  let L = updateLedger([], "2026-10-16", rows, Date.parse("2026-10-17T00:00:00Z"));
  assert.equal(L.length, 1);
  assert.equal(L[0].frozen, false);
  const later = updateLedger(L, "2026-10-16", rows.map((r) => ({ ...r, zx: -r.zx })), Date.parse("2026-10-19T03:00:00Z"));
  assert.equal(later[0].frozen, true);
  assert.equal(later[0].z["1000"], -5.5); // không bị ghi đè sau khi khoá
  // phiên kế tiếp: ngành z cao tăng hơn -> IC = 1
  const vn = [["2026-10-16", 100], ["2026-10-19", 100]];
  const series = Object.fromEntries(rows.map((r) => [r.icb, [["2026-10-16", 100], ["2026-10-19", 100 + r.zx]]]));
  const ev = evaluateLedger(later, series, vn);
  assert.equal(ev.evaluated, 1);
  assert.equal(ev.days[0].ic, 1);
  assert.ok(ev.cumSpreadPct > 0);
  assert.match(ev.statusVi, /Đang tích luỹ mẫu/);
});
