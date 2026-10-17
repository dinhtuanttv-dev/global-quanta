process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { runRetro, E7_VERSION } from "../src/market/elite/retroCore.js";

function rng(seed = 11) {
  let s = seed;
  const u = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/**
 * 50 mã, 220 phiên. Mỗi mã có xu hướng riêng d_i; stealth20 = d_i + nhiễu (dự báo thật), log_rvol = nhiễu thuần.
 * Đặc trưng dòng tiền chỉ có từ phiên `flowStart` -> phiên walk-forward đầu tiên chưa có IC nào chín.
 */
function world({ predictive = true, flowStart = 60 } = {}) {
  const g = rng(predictive ? 11 : 99);
  const cal = [];
  for (let d = Date.UTC(2025, 0, 1); cal.length < 220; d += 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) cal.push(new Date(d).toISOString().slice(0, 10));
  }
  const N = 50, prices = new Map(), flow = new Map(), sectors = new Map();
  const drift = Array.from({ length: N }, (_, i) => ((i * 37) % N) / N - 0.5);
  for (let i = 0; i < N; i++) {
    const t = `S${String(i).padStart(2, "0")}`;
    sectors.set(t, `G${i % 8}`);
    let p = 20000;
    const rows = [];
    cal.forEach((date) => { p *= 1 + 0.004 * drift[i] * (predictive ? 1 : 0) + 0.018 * g(); rows.push({ date, closeAdj: p, value: 3e10 }); });
    prices.set(t, rows);
  }
  for (const s of ["VNM", "FPT", "HPG", "VCB", "MWG"]) prices.set(s, cal.map((date) => ({ date, closeAdj: 10, value: 1e11 })));
  cal.forEach((date, k) => {
    if (k < flowStart) return;
    const m = new Map();
    for (let i = 0; i < N; i++) m.set(`S${String(i).padStart(2, "0")}`, { stealth20: drift[i] + 0.3 * g(), stealth5: 0.5 * g(), logRvol: g(), netIntent: 0.2 * g(), mom5Atr: g() });
    flow.set(date, m);
  });
  const vnIndex = new Map(cal.map((d, k) => [d, 1000 + k]));
  return { cal, prices, flow, sectors, vnIndex };
}

test("E7 walk-forward: không nhìn trước (phiên đầu chỉ có tiên nghiệm), tín hiệu dự báo thật -> IC và lợi suất vượt dương", () => {
  const r = runRetro(world());
  assert.equal(r.version, E7_VERSION);
  assert.ok(r.period.sessions > 100, `${r.period.sessions} phiên`);
  const ic5 = r.horizons[5].ic;
  assert.ok(ic5.mean > 0.05 && ic5.t > 2, `IC ${ic5.mean} t ${ic5.t}`);
  assert.ok(r.horizons[10].meanExcess > 0);
  assert.equal(r.criteria.icPass, true);
  assert.ok(r.descriptive.tierDays.stealth20.A > 0);
  assert.ok(r.descriptive.dailyTurnover >= 0 && r.descriptive.dailyTurnover <= 1);
  assert.equal(r.recent.length, 20);
  assert.ok(r.lastWeights.every((w) => ["A", "B"].includes(w.tier)), "chỉ bậc A/B có trọng số");
});

test("E7 walk-forward: phiên đầu dùng đúng tiên nghiệm; không có tín hiệu thật -> không đạt", () => {
  const first = runRetro({ ...world(), flow: new Map([...world().flow].slice(0, 1)) });
  assert.equal(first.period.sessions, 1);
  assert.ok(first.lastWeights.filter((w) => w.tier === "A").every((w) => w.icPost === 0.02), "chưa có IC chín -> IC hậu nghiệm = tiên nghiệm 0,02");
  const noise = runRetro(world({ predictive: false }));
  assert.equal(noise.label, "EXPERIMENTAL");
  assert.match(noise.verdictVi, /KHÔNG ĐẠT/);
});
