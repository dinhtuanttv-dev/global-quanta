import test from "node:test";
import assert from "node:assert/strict";
import { clusterLevels, handleConfluence, zigzagRange } from "../src/market/strategies/handleConfluence.js";
import { detectCupHandle, prepareCs } from "../src/market/strategies/canSlimV2.js";

const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

/** Đà tăng, cốc U 120 phiên (140k → 105k → 139k, cạnh phải có nhịp 1-2-3), tay cầm A-B-C về ~38% cạnh phải. */
function bars() {
  const closes = [];
  for (let i = 0; i < 100; i++) closes.push(100_000 + (40_000 * i) / 99);
  for (let i = 1; i <= 60; i++) closes.push(140_000 - 35_000 * Math.sin((Math.PI * i) / 120));     // trái → đáy 105k
  const path = [[0, 105_000], [20, 122_000], [32, 114_000], [60, 139_000]];                           // 0-1-2-3 cạnh phải
  for (let i = 1; i <= 60; i++) {
    let k = 1; while (i > path[k][0]) k++;
    const [i0, p0] = path[k - 1], [i1, p1] = path[k];
    closes.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0));
  }
  const handle = [137_000, 135_000, 133_000, 131_500, 133_500, 135_000, 133_000, 131_000, 129_800, 131_000]; // A 131,5k · B 135k · C ~129,8k
  closes.push(...handle, 141_000);
  return closes.map((c, i) => ({ date: day(i), open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1_000_000 }));
}

test("cạnh phải đếm 0-1-2-3, tay cầm A-B-C, các mức Fib và cụm hợp lưu nằm trong nửa trên cốc", () => {
  const b = bars();
  const S = prepareCs(b);
  const t = S.n - 1;
  const p = detectCupHandle(S, t);
  assert.ok(p, "phải có cốc tay cầm");
  const h = handleConfluence(S, p, t);
  assert.ok(h.retracePct > 25 && h.retracePct < 40, `hồi ${h.retracePct}`);
  assert.deepEqual(h.fib.map((x) => x.ratio), [0.236, 0.382, 0.5]);
  assert.ok(h.wave, "đếm được sóng trong cạnh phải");
  assert.ok(Math.abs(h.wave.points[2].price - 114_000 * 0.998) < 500, "đáy sóng 2 ~114k");
  assert.ok(h.wave.wave4Zone[0].price > h.wave.overlapLimit, "vùng sóng 4 không chồng lấn sóng 1");
  assert.ok(h.abc && Math.abs(h.abc.A.price - 131_500 * 0.998) < 300, "A của tay cầm");
  assert.ok(h.best && h.best.sources.length >= 2, "có cụm hợp lưu ≥ 2 nguồn");
  assert.ok(h.best.low >= p.cupLow + 0.5 * (p.leftLip - p.cupLow) && h.best.high <= p.rightLip);
  assert.ok(h.earlyEntry.stop < h.earlyEntry.price && h.earlyEntry.riskPct < 8);
});

test("không nhìn trước: hợp lưu tại t trên bars[0..t] = trên toàn chuỗi", () => {
  const b = [...bars(), ...Array.from({ length: 10 }, (_, k) => ({ date: day(400 + k), open: 142_000, high: 143_000, low: 141_000, close: 142_000, volume: 1e6 }))];
  const t = bars().length - 1;
  const a = handleConfluence(prepareCs(b), detectCupHandle(prepareCs(b), t), t);
  const c = handleConfluence(prepareCs(b.slice(0, t + 1)), detectCupHandle(prepareCs(b.slice(0, t + 1)), t), t);
  assert.deepEqual(a, c);
});

test("zigzag có chỉ số xác nhận; gom cụm theo dung sai", () => {
  const H = [10, 12, 11, 9, 13, 12].map((x) => x * 1.001), L = [10, 12, 11, 9, 13, 12].map((x) => x * 0.999);
  const z = zigzagRange(H, L, 0, 5, 0.05);
  assert.ok(z.filter((x) => x.ci != null).every((x) => x.ci > x.i));
  const c = clusterLevels([{ label: "a", price: 100, weight: 1 }, { label: "b", price: 101, weight: 1 }, { label: "c", price: 110, weight: 0.5 }]);
  assert.equal(c[0].sources.length, 2);
  assert.ok(Math.abs(c[0].price - 100.5) < 1e-9);
});
