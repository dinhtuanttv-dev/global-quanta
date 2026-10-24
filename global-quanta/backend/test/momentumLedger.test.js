// Sổ "đà tăng tiếp diễn" (MTF-momentum-prereg M1): ghi không sửa, chấm đúng công thức, kết luận theo tiêu chí đặt trước.
import test from "node:test";
import assert from "node:assert/strict";
import { MOMENTUM_PREREG, blockBootstrapCi, createMomentumLedger, emptyMomentumState, momentumStats, recordDay, scoreDays } from "../src/market/structure/momentumLedger.js";

const day = (i) => new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10);
/** Chuỗi giá: mỗi mã tăng `drift` %/phiên (mở cửa = đóng cửa phiên trước). */
function series(drifts, n) {
  const out = {};
  for (const [t, g] of Object.entries(drifts)) {
    const close = [], open = []; let p = 10_000;
    for (let i = 0; i < n; i++) { open.push(p); p *= 1 + g / 100; close.push(p); }
    out[t] = { open, close, idx: new Map(Array.from({ length: n }, (_, i) => [day(i), i])) };
  }
  return (t) => out[t] ?? null;
}
const rows = [
  ...["A1", "A2", "A3"].map((t) => ({ t, st: "UP", ext: 1, elig: true })),
  ...["B1", "B2", "B3"].map((t) => ({ t, st: "B", ext: 0, elig: true })),
  { t: "C1", st: "DOWN", ext: 0, elig: true }, { t: "X1", st: "UP", ext: 1, elig: false },
];

test("ghi phiên: nhóm BẬT / TẮT chỉ trong UP / B đủ điều kiện; ghi lại cùng phiên không đổi sổ", () => {
  let s = recordDay(emptyMomentumState(), day(0), rows);
  assert.deepEqual(s.days[day(0)].on, ["A1", "A2", "A3"]);
  assert.deepEqual(s.days[day(0)].off, ["B1", "B2", "B3"]);
  assert.equal(s.days[day(0)].all.length, 7);
  const again = recordDay(s, day(0), rows.map((r) => ({ ...r, ext: 0 })));
  assert.deepEqual(again.days[day(0)].on, ["A1", "A2", "A3"], "sổ không sửa về sau");
  s = recordDay(s, day(1), rows);
  assert.equal(s.firstDay, day(0));
});

test("chấm: chưa đủ nến d+20 thì chờ; đủ thì S = vượt trội BẬT − TẮT (mở cửa d+1 -> đóng cửa d+20), L = BẬT − phí", () => {
  const s0 = recordDay(emptyMomentumState(), day(0), rows);
  assert.deepEqual(scoreDays(s0, series({ A1: 1, A2: 1, A3: 1, B1: 0, B2: 0, B3: 0, C1: 0 }, 15)).scored, {});
  const sc = scoreDays(s0, series({ A1: 1, A2: 1, A3: 1, B1: 0, B2: 0, B3: 0, C1: 0 }, 25)).scored[day(0)];
  const up = (1.01 ** 20 - 1) * 100, bench = (3 * up) / 7;
  assert.equal(sc.nOn, 3); assert.equal(sc.nOff, 3);
  assert.ok(Math.abs(sc.S - up) < 1e-2, `${sc.S} ≈ ${up}`);
  assert.ok(Math.abs(sc.L - (up - bench - MOMENTUM_PREREG.feePct)) < 1e-2);
});

test("kết luận: < 120 phiên = ĐANG TÍCH LŨY; ≥ 120 phiên S dương ổn định = ĐẠT; S quanh 0 = KHÔNG ĐẠT", () => {
  const mk = (f) => {
    const s = emptyMomentumState();
    for (let i = 0; i < 130; i++) { s.days[day(i)] = { on: [], off: [], all: [] }; s.scored[day(i)] = { nOn: 5, nOff: 5, on: 1, off: 0, S: f(i), L: f(i) - 0.6 }; }
    return momentumStats(s);
  };
  const s = emptyMomentumState();
  for (let i = 0; i < 50; i++) { s.days[day(i)] = { on: [], off: [], all: [] }; s.scored[day(i)] = { nOn: 5, nOff: 5, on: 2, off: 0, S: 2, L: 1.4 }; }
  assert.equal(momentumStats(s).verdict, "PENDING");
  assert.equal(momentumStats(s).label, "ĐANG TÍCH LŨY MẪU");
  const pass = mk((i) => 2 + Math.sin(i));
  assert.equal(pass.verdict, "PASS"); assert.ok(pass.ciS[0] > 0);
  const fail = mk((i) => Math.sin(i / 3) * 3);
  assert.equal(fail.verdict, "FAIL");
  assert.equal(mk(() => 0.3).verdict, "FAIL", "S > 0 nhưng sau phí L âm -> không đạt");
});

test("bootstrap khối: tái lập (seed cố định), KTC chứa TB", () => {
  const xs = Array.from({ length: 60 }, (_, i) => Math.sin(i) + 0.5);
  const a = blockBootstrapCi(xs), b = blockBootstrapCi(xs);
  assert.deepEqual(a, b);
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(a[0] <= m && m <= a[1]);
});

test("lưu đĩa: cập nhật hằng ngày, đọc lại trạng thái", async () => {
  const files = new Map();
  const disk = { async readJson(k) { return files.has(k) ? structuredClone(files.get(k)) : null; }, async writeJson(k, v) { files.set(k, structuredClone(v)); return true; } };
  const L = createMomentumLedger({ disk, now: () => Date.parse("2026-10-24T09:00:00Z") });
  const st = await L.update(day(0), rows, series({ A1: 1 }, 5));
  assert.equal(st.recordedDays, 1); assert.equal(st.scoredDays, 0); assert.equal(st.verdict, "PENDING");
  const L2 = createMomentumLedger({ disk });
  assert.equal((await L2.stats()).recordedDays, 1);
  assert.deepEqual((await L2.latestOn()).on, ["A1", "A2", "A3"]);
});

test("chỉ ghi từ phiên đầu tiên sau triển khai (26/10/2026): phiên trước đó không vào sổ", () => {
  const s = recordDay(emptyMomentumState(), "2026-10-23", rows);
  assert.deepEqual(s.days, {});
  assert.ok(recordDay(s, "2026-10-26", rows).days["2026-10-26"]);
});
