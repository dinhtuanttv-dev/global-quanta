process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { combinations, deflatedSharpe, expectedMaxSharpe, moments, pboCscv, sharpe } from "../src/market/elite/overfit.js";
import { E7V3, GRID, PRIMARY, runRetroV3 } from "../src/market/elite/retroV3.js";
import { constructPortfolio } from "../src/market/elite/decisionCore.js";

function rng(seed = 11) {
  let s = seed;
  const u = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

test("E7-v3 DSR: chuẩn hoá đúng; nhiều phép thử -> SR₀ lớn hơn -> DSR nhỏ hơn; chuỗi không kỹ năng không đạt", () => {
  const g = rng(5);
  const good = Array.from({ length: 500 }, () => 0.002 + 0.01 * g());
  const m = moments(good);
  assert.ok(Math.abs(m.kurt - 3) < 0.6, `kurt ${m.kurt}`);
  assert.ok(expectedMaxSharpe(24, 0.01) > expectedMaxSharpe(12, 0.01));
  assert.equal(expectedMaxSharpe(1, 0.01), 0);
  const trials = [0.2, 0.05, -0.02, 0.1, 0.0, 0.08];
  const d6 = deflatedSharpe(good, trials), d24 = deflatedSharpe(good, trials, 24);
  assert.ok(d6.dsr > 0.95, `dsr ${d6.dsr}`);
  assert.ok(d24.dsr <= d6.dsr && d24.sr0 > d6.sr0);
  const noise = Array.from({ length: 200 }, () => 0.01 * g());
  assert.ok(deflatedSharpe(noise, [sharpe(noise), 0.1, -0.1, 0.05]).dsr < 0.95);
});

test("E7-v3 PBO (CSCV): một cấu hình trội thật -> PBO ≈ 0; mọi cấu hình là nhiễu -> PBO ≈ 0,5", () => {
  assert.equal(combinations(10, 5).length, 252);
  const g = rng(7), T = 400;
  const dominant = [Array.from({ length: T }, () => 0.003 + 0.01 * g()), ...Array.from({ length: 5 }, () => Array.from({ length: T }, () => 0.01 * g()))];
  const a = pboCscv(dominant, 10);
  assert.equal(a.splits, 252);
  assert.ok(a.pbo < 0.1, `pbo ${a.pbo}`);
  const noise = Array.from({ length: 12 }, () => Array.from({ length: T }, () => 0.01 * g()));
  const b = pboCscv(noise, 10);
  assert.ok(b.pbo > 0.25 && b.pbo < 0.8, `pbo ${b.pbo}`);
  assert.ok(b.meanOosMinusIs < 0, "chọn theo trong mẫu -> ngoài mẫu kém hơn khi chỉ có nhiễu");
});

test("E7-v3 lưới: 12 cấu hình cố định, cấu hình chính = 10 mã / đệm 20 / ERC; constructPortfolio theo cấu hình", () => {
  assert.equal(GRID.length, 12);
  assert.equal(GRID[0].id, PRIMARY);
  assert.deepEqual(GRID.find((g) => g.id === PRIMARY), { id: PRIMARY, size: 10, bufferRank: 20, weighting: "erc" });
  const scores = Array.from({ length: 30 }, (_, i) => ({ ticker: `T${i}`, Z: 3 - i * 0.1, rank: i + 1, eligible: true, sigma20: 0.02, sectorKey: `G${i % 10}`, close: 10000, alpha5Pct: 0, pOutperform: 0.5 }));
  const p5 = constructPortfolio({ scores, prices: new Map(), date: "2026-01-01", config: { size: 5, bufferRank: 0, weighting: "inverse-vol" } });
  assert.equal(p5.portfolio.length, 5);
  assert.equal(p5.construction.method, "inverse-vol");
  // không vùng đệm: mã cũ hạng 15 KHÔNG được giữ
  const kept = constructPortfolio({ scores, prices: new Map(), date: "2026-01-01", prevHoldings: [{ ticker: "T14", weight: 1 }], config: { size: 10, bufferRank: 0, weighting: "inverse-vol" } });
  assert.ok(!kept.portfolio.some((p) => p.ticker === "T14"));
  const keptB = constructPortfolio({ scores, prices: new Map(), date: "2026-01-01", prevHoldings: [{ ticker: "T14", weight: 1 }], config: { size: 10, bufferRank: 20, weighting: "inverse-vol" } });
  assert.ok(keptB.portfolio.some((p) => p.ticker === "T14"));
});

function world() {
  const g = rng(11);
  const cal = [];
  for (let d = Date.UTC(2025, 0, 1); cal.length < 220; d += 86_400_000) { const wd = new Date(d).getUTCDay(); if (wd !== 0 && wd !== 6) cal.push(new Date(d).toISOString().slice(0, 10)); }
  const N = 40, prices = new Map(), flow = new Map(), sectors = new Map();
  const drift = Array.from({ length: N }, (_, i) => ((i * 37) % N) / N - 0.5);
  for (let i = 0; i < N; i++) {
    const t = `S${String(i).padStart(2, "0")}`;
    sectors.set(t, `G${i % 8}`);
    let p = 20000; const rows = [];
    cal.forEach((date) => { p *= 1 + 0.004 * drift[i] + 0.018 * g(); rows.push({ date, closeAdj: p, value: 3e10 }); });
    prices.set(t, rows);
  }
  for (const s of ["VNM", "FPT", "HPG", "VCB", "MWG"]) prices.set(s, cal.map((date) => ({ date, closeAdj: 10, value: 1e11 })));
  cal.forEach((date, k) => {
    if (k < 60) return;
    const m = new Map();
    for (let i = 0; i < N; i++) m.set(`S${String(i).padStart(2, "0")}`, { stealth20: drift[i] + 0.3 * g(), stealth5: 0.5 * g(), logRvol: g(), netIntent: 0.2 * g(), mom5Atr: g() });
    flow.set(date, m);
  });
  return { cal, prices, flow, sectors, vnIndex: new Map(cal.map((d, k) => [d, 1000 + k])) };
}

test("E7-v3 walk-forward: khoảng đệm 5 phiên, chuỗi ngày cho mọi cấu hình (6 cấu hình nghịch biến động trong test), tín hiệu thật -> IC dương; kết quả có đủ DSR/PBO", () => {
  const w = world();
  const grid = GRID.filter((g) => g.weighting === "inverse-vol"); // ERC chậm trong test: kiểm cơ chế với 6 cấu hình
  const r = runRetroV3({ ...w, grid: [{ ...GRID[0], weighting: "inverse-vol", id: PRIMARY }, ...grid.filter((g) => g.id !== "10-b-iv")] });
  assert.ok(r.period.sessions > 100);
  assert.ok(r.horizons[5].ic.mean > 0, `IC ${r.horizons[5].ic.mean}`);
  assert.equal(r.grid.length, 6);
  assert.ok(r.grid.every((g) => Number.isFinite(g.sharpeDaily)));
  assert.ok(r.deflatedSharpe.dsr >= 0 && r.deflatedSharpe.dsr <= 1);
  assert.ok(r.deflatedSharpe.sensitivityN24 <= r.deflatedSharpe.dsr + 1e-12);
  assert.equal(r.pbo.splits, 252);
  assert.ok(["EVIDENCE_RETRO", "EXPERIMENTAL"].includes(r.label));
  assert.equal(E7V3.embargo, 5);
});
