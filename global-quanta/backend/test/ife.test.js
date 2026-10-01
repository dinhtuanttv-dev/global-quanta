import test from "node:test";
import assert from "node:assert/strict";
import {
  normCdf, autocorr, hurstRS, bvcMinutes, bucketFlags, forwardFilter, describePosterior, INTENT_STATES,
  buildIntentFootprint, trailingZ, clipRegularity, samePriceClusters,
} from "../src/market/scanner/ife.js";
import { validateIntentStates, tripleBarrier, benjaminiHochberg } from "../src/market/scanner/ifeValidation.js";
import { groupSessions } from "../src/market/scanner/intradayService.js";
import { addDays } from "../src/market/util.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CONT = [...Array.from({ length: 134 }, (_, i) => 9 * 60 + 16 + i), ...Array.from({ length: 90 }, (_, i) => 13 * 60 + i)];

/**
 * Phiên giả lập. mode "normal": ngẫu nhiên cân bằng. mode "stealth": các phút KL lớn (tay to)
 * luôn khớp ở nhịp tăng giá, các phút KL nhỏ (tay nhỏ) khớp ở nhịp giảm -> giá gần như đứng yên.
 */
function makeSession(r, date, ref, mode = "normal") {
  const bars = [{ date: `${date}T09:15:00+07:00`, open: ref, high: ref, low: ref, close: ref, volume: 30_000 }];
  let price = ref;
  for (const m of CONT) {
    let up, vol;
    if (mode === "stealth") {
      const big = r() < 0.15;
      up = big;
      vol = big ? 20_000 + r() * 5_000 : 800 + r() * 400;
      price *= big ? 1.0012 : 0.99979;
    } else {
      up = r() < 0.5;
      vol = 1_000 + r() * 2_000;
      price *= up ? 1.001 : 0.999;
    }
    bars.push({ date: `${date}T${hhmm(m)}:00+07:00`, open: price, high: price * 1.0005, low: price * 0.9995, close: price, volume: Math.round(vol) });
  }
  bars.push({ date: `${date}T14:45:00+07:00`, open: price, high: price, low: price, close: price, volume: 40_000 });
  return bars;
}

function makeHistory(n, { seed = 1, stealthLast = 0 } = {}) {
  const r = rng(seed);
  const bars = [];
  let ref = 30_000, date = "2026-03-02";
  for (let i = 0; i < n; i++) {
    const s = makeSession(r, date, ref, i >= n - stealthLast ? "stealth" : "normal");
    bars.push(...s);
    ref = s.at(-1).close;
    date = addDays(date, 1);
  }
  return groupSessions(bars);
}

test("ife: tiện ích thống kê — Φ, tự tương quan, Hurst phân biệt bền bỉ/đảo chiều", () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6 && Math.abs(normCdf(1.96) - 0.975) < 1e-3 && Math.abs(normCdf(-1.96) - 0.025) < 1e-3);
  const alt = Array.from({ length: 64 }, (_, i) => (i % 2 ? 1 : -1));
  assert.ok(autocorr(alt) < -0.9);
  const r = rng(3);
  let x = 0;
  const trend = Array.from({ length: 128 }, () => (x += 0.6 + (r() - 0.5)));
  const persistent = trend.map((v, i) => (i ? v - trend[i - 1] : 0)).map((v, i, a) => (i ? v + 0.9 * a[i - 1] : v));
  assert.ok(hurstRS(persistent) > hurstRS(alt));
  assert.equal(hurstRS([1, 2, 3]), null);
});

test("ife: BVC — nhịp tăng cho delta dương, giảm cho delta âm; ATO/ATC không tính vào khớp liên tục", () => {
  const mk = (t, c, v) => ({ date: `2026-10-01T${t}:00+07:00`, open: c, high: c, low: c, close: c, volume: v });
  const bars = [mk("09:15", 100, 9_999), mk("09:16", 101, 1000), mk("09:17", 102, 1000), mk("09:18", 101, 1000), mk("14:45", 101, 9_999)];
  const m = bvcMinutes(bars, 100);
  assert.equal(m.length, 3);
  assert.ok(m[0].delta > 0 && m[1].delta > 0 && m[2].delta < 0);
  assert.ok(m.every((x) => Math.abs(x.delta) <= x.volume));
});

test("ife: cờ hấp thụ / đẩy giá / cạn kiệt / thủng thanh khoản theo ngưỡng công khai", () => {
  assert.deepEqual(bucketFlags(-2, 0.1, 1), ["absorbSelling"]);
  assert.deepEqual(bucketFlags(2, -0.2, 1), ["absorbBuying"]);
  assert.deepEqual(bucketFlags(2, 1.5, 1), ["initiativeBuy"]);
  assert.deepEqual(bucketFlags(-2, -1.5, 1), ["initiativeSell"]);
  assert.deepEqual(bucketFlags(0, 0.1, 0.3), ["dryUp"]);
  assert.deepEqual(bucketFlags(0.2, 2.5, 1), ["liquidityHole"]);
  assert.deepEqual(bucketFlags(0.3, 0.3, 1), []);
});

test("ife: HMM lọc tiến — chuỗi đẩy giá mua -> 'Gom chủ động'; chuỗi yên -> 'Trung tính'; chỉ dùng quá khứ", () => {
  const buy = forwardFilter(Array(6).fill([1.8, 1.2, 1.6]));
  assert.equal(describePosterior(buy.at(-1)).top.id, "ACC_ACTIVE");
  const quiet = forwardFilter(Array(6).fill([0.1, -0.1, 0]));
  assert.equal(describePosterior(quiet.at(-1)).top.id, "NEUTRAL");
  const absorb = forwardFilter(Array(6).fill([-1.4, 0.3, 0]));
  assert.equal(describePosterior(absorb.at(-1)).top.id, "ACC_PASSIVE");
  // Không nhìn tương lai: thêm quan sát sau t không đổi xác suất tại t.
  const a = forwardFilter([[1.8, 1.2, 1.6], [0, 0, 0]]), b = forwardFilter([[1.8, 1.2, 1.6], [-3, -3, -3], [-3, -3, -3]]);
  assert.deepEqual(a[0], b[0]);
  for (const p of buy) assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.equal(INTENT_STATES.length, 5);
});

test("ife: z-score trượt không dùng dữ liệu tương lai", () => {
  const arr = Array.from({ length: 40 }, (_, i) => i % 3);
  const z1 = trailingZ(arr), z2 = trailingZ([...arr, 1000, -1000]);
  assert.deepEqual(z1, z2.slice(0, 40));
  assert.equal(z1[5], null);
});

test("ife: kịch bản GOM ÂM THẦM — tay to mua, tay nhỏ bán, giá đứng -> phân kỳ + stealth dương", () => {
  const sessions = makeHistory(80, { seed: 5, stealthLast: 6 });
  const history = sessions.slice(0, -1), today = sessions.at(-1);
  const out = buildIntentFootprint({ history, today });
  assert.equal(out.ready, true);
  assert.equal(out.method, "BVC");
  assert.ok(out.bigSmall.cumLarge > 0 && out.bigSmall.cumSmall < 0, JSON.stringify(out.bigSmall).slice(0, 200));
  assert.equal(out.bigSmall.divergent, true);
  assert.match(out.bigSmall.reading, /Tay to gom/);
  assert.ok(out.stealth.s5.z > 1, `s5=${JSON.stringify(out.stealth.s5)}`);
  assert.ok(Math.abs(out.stealth.s5.ret) < 3, "giá gần như đứng yên");
  assert.equal(out.today.buckets.length, 17);
  assert.equal(out.today.buckets[0].delta, null, "ATO không có delta (khớp định kỳ)");
  assert.equal(out.dailyIntent.length, 20);
  const probs = out.intent.probs.reduce((s, p) => s + p.p, 0);
  assert.ok(Math.abs(probs - 1) < 0.01);
});

test("ife: kịch bản bình thường — không báo gom/xả âm thầm", () => {
  const sessions = makeHistory(80, { seed: 9 });
  const out = buildIntentFootprint({ history: sessions.slice(0, -1), today: sessions.at(-1) });
  assert.equal(out.bigSmall.divergent, false);
  assert.ok(Math.abs(out.stealth.s5.z) < 1.5, `s5=${out.stealth.s5.z}`);
  assert.equal(buildIntentFootprint({ history: sessions.slice(0, 10), today: null }).ready, false);
});

test("ife: dùng Lee–Ready khi tick phủ ≥ 60% KL liên tục, ngược lại BVC", () => {
  const sessions = makeHistory(50, { seed: 11 });
  const today = sessions.at(-1);
  const contBars = today.bars.filter((b) => b.date.slice(11, 16) > "09:15" && b.date.slice(11, 16) < "14:30");
  const full = { date: today.date, classifiedVolume: contBars.reduce((s, b) => s + b.volume, 0),
    minutes: contBars.map((b) => { const m = Number(b.date.slice(11, 13)) * 60 + Number(b.date.slice(14, 16)); return { minute: m, buy: b.volume, sell: 0, unknown: 0, prints: 3, sizes: { 500: 2, [b.volume - 1000]: 1 } }; }) };
  const lr = buildIntentFootprint({ history: sessions.slice(0, -1), today, tickFlow: full });
  assert.equal(lr.method, "LEE_READY");
  assert.ok(lr.today.delta > 0 && lr.today.deltaPct > 99);
  const partial = { ...full, classifiedVolume: full.classifiedVolume * 0.3 };
  assert.equal(buildIntentFootprint({ history: sessions.slice(0, -1), today, tickFlow: partial }).method, "BVC");
});

test("ife: phiên lịch sử dùng Lee–Ready đã lưu khi phủ đủ, còn lại BVC", () => {
  const sessions = makeHistory(50, { seed: 13 });
  const history = sessions.slice(0, -1);
  const toFlow = (s, share) => {
    const cont = s.bars.filter((b) => b.date.slice(11, 16) > "09:15" && b.date.slice(11, 16) < "14:30");
    const minutes = cont.map((b) => ({ minute: Number(b.date.slice(11, 13)) * 60 + Number(b.date.slice(14, 16)), buy: 0, sell: b.volume * share, unknown: 0, prints: 1, sizes: {} }));
    return { date: s.date, classifiedVolume: minutes.reduce((a, m) => a + m.sell, 0), minutes };
  };
  const tickHistory = new Map([
    [history.at(-1).date, toFlow(history.at(-1), 1)],
    [history.at(-2).date, toFlow(history.at(-2), 1)],
    [history.at(-3).date, toFlow(history.at(-3), 0.2)], // phủ 20% -> giữ BVC
  ]);
  const base = buildIntentFootprint({ history, today: sessions.at(-1) });
  const out = buildIntentFootprint({ history, today: sessions.at(-1), tickHistory });
  assert.deepEqual(base.historyMethod, { LEE_READY: 0, BVC: history.length });
  assert.deepEqual(out.historyMethod, { LEE_READY: 2, BVC: history.length - 2 });
  const d = (r, date) => r.dailyIntent.find((x) => x.date === date).deltaPctAdv;
  assert.ok(d(out, history.at(-1).date) < -50, "phiên LR toàn bán chủ động -> delta âm mạnh");
  assert.equal(d(out, history.at(-3).date), d(base, history.at(-3).date));
  // Phiên đang xem cũng lấy từ lịch sử tick nếu không có tick trong bộ nhớ.
  const viewed = buildIntentFootprint({ history: history.slice(0, -1), today: history.at(-1), tickHistory });
  assert.equal(viewed.method, "LEE_READY");
});

test("ife: lặp kích thước lệnh và cụm khớp cùng giá", () => {
  const minutes = Array.from({ length: 30 }, (_, i) => ({ minute: 600 + i, sizes: { 500: 3, 1000: 1, [700 + i]: 1 } }));
  const clip = clipRegularity(minutes);
  assert.ok(clip.share > 0.6 && clip.topSizes[0].size === 500);
  assert.equal(clipRegularity([{ sizes: { 500: 3 } }]), null, "ít lệnh -> không kết luận");
  const cl = samePriceClusters([{ minute: 630, high: 10, low: 10, close: 10, volume: 6000, delta: 5000 }, { minute: 631, high: 11, low: 10, close: 10, volume: 9000, delta: 1 }], 1000);
  assert.deepEqual(cl.map((c) => [c.time, c.side]), [["10:30", "mua"]]);
});

// ---------- Kiểm chứng ----------

function dailyRows(n, r, { predictive = false } = {}) {
  const rows = [];
  let close = 20_000, drift = 0, date = "2025-06-02";
  for (let i = 0; i < n; i++) {
    const shock = (r() - 0.5) * 0.03;
    const initiative = r() < 0.08;
    const ret = (initiative ? 0.04 : shock) + drift;
    drift = predictive && initiative ? 0.012 : drift * 0.5;
    close *= 1 + ret;
    const vol = initiative ? 4e6 : 1e6 * (0.8 + r() * 0.4);
    rows.push({ date, close, closeAdj: close, high: close * 1.01, low: close * 0.99, volume: vol });
    date = addDays(date, 1);
  }
  return rows;
}

test("kiểm chứng: ba rào chắn & Benjamini–Hochberg", () => {
  const rows = [100, 100, 103, 99].map((c, i) => ({ date: `d${i}`, close: c, closeAdj: c, high: c, low: c }));
  assert.equal(tripleBarrier(rows, 0, 3, 1, 0.02), 1);
  assert.equal(tripleBarrier(rows, 0, 5, 1, 0.02), null, "thiếu dữ liệu tương lai");
  assert.deepEqual(benjaminiHochberg([0.001, 0.2, 0.03, 0.9], 0.1), [true, false, true, false]);
});

test("kiểm chứng: có quan hệ dự báo thật -> 'Gom chủ động' được công nhận; dữ liệu ngẫu nhiên -> không trạng thái nào", () => {
  const r = rng(77);
  const predictive = new Map(Array.from({ length: 60 }, (_, i) => [`P${i}`, dailyRows(250, r, { predictive: true })]));
  const v = validateIntentStates(predictive);
  const acc = v.states.find((s) => s.id === "ACC_ACTIVE");
  assert.ok(acc.n >= 100 && acc.liftUp > 0 && acc.validated, JSON.stringify(acc));

  const r2 = rng(78);
  const noise = new Map(Array.from({ length: 60 }, (_, i) => [`N${i}`, dailyRows(250, r2)]));
  const v2 = validateIntentStates(noise);
  const falsePositives = v2.states.filter((s) => s.validated && s.id !== "ACC_ACTIVE" && s.id !== "DIST_ACTIVE");
  assert.equal(falsePositives.length, 0, JSON.stringify(v2.states.map((s) => [s.id, s.verdict])));
  assert.ok(!v2.states.find((s) => s.id === "ACC_ACTIVE").verdict.includes("TRÊN"), "không có xu hướng sau cú đẩy giá khi dữ liệu là ngẫu nhiên");
});

test("ife: z theo thứ hạng vững với phân phối dồn về 0 (lỗi MAD≈0 đã bắt được)", async () => {
  const { rankZ, normInv } = await import("../src/market/scanner/ife.js");
  assert.ok(Math.abs(normInv(0.975) - 1.96) < 0.01 && Math.abs(normInv(0.5)) < 1e-9);
  const hist = [...Array(80).fill(0), ...Array.from({ length: 20 }, (_, i) => -0.001 * (i + 1))];
  assert.ok(Math.abs(rankZ(-0.0005, hist)) < 1.5, "giá trị bình thường không bị phóng đại");
  assert.ok(rankZ(-0.05, hist) < -1.5 && rankZ(0.05, hist) > 1.5);
});

test("ife: tách 'cả phiên' và 'khung gần nhất' — phiên bán ròng kết thúc bằng một cú mua không được gọi là gom cả phiên", () => {
  const sessions = makeHistory(80, { seed: 15 });
  const today = sessions.at(-1);
  // Bóp méo phiên hôm nay: cả ngày giảm đều (bán chủ động), riêng khung cuối 14:15 tăng mạnh.
  let price = today.refPrice;
  today.bars = today.bars.map((b) => {
    const t = b.date.slice(11, 16);
    if (t <= "09:15" || t >= "14:45") return b;
    price *= t >= "14:15" ? 1.004 : 0.9992;
    return { ...b, open: price, high: price, low: price, close: price, volume: t >= "14:15" ? b.volume * 3 : b.volume };
  });
  const out = buildIntentFootprint({ history: sessions.slice(0, -1), today });
  assert.ok(out.today.delta < 0, "cả phiên bán ròng");
  assert.equal(out.intentBucket, "14:15");
  assert.notEqual(out.sessionIntent.top.id, "ACC_ACTIVE", JSON.stringify(out.sessionIntent.top));
  assert.equal(out.sessionIntent.date, today.date);
});
