import test from "node:test";
import assert from "node:assert/strict";
import {
  BUCKETS, BUCKET_COUNT, bucketIndexOfMinute, sessionToBuckets, buildProfile, stateBefore, outcomeOf,
  smoothed, walkForward, buildTransitions, probabilityWithin, buildIntradayCycle, CELLS, rollingProfiles,
} from "../src/market/scanner/intradayModel.js";
import { groupSessions } from "../src/market/scanner/intradayService.js";
import { buildVolumeAnalysis, computeForeign } from "../src/market/scanner/volumeAnalysis.js";
import { addDays } from "../src/market/util.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Phiên giả lập: KL hình chữ U (ATO/ATC lớn), có "quy luật": sau khi giá tăng ≥2% thì khung kế tiếp bùng nổ KL. */
function makeSession(r, date, ref, { pattern = true, randomSurge = 0 } = {}) {
  const bars = [];
  let price = ref;
  let boost = 1;
  const minutes = [9 * 60 + 15, ...Array.from({ length: 135 }, (_, i) => 9 * 60 + 16 + i), ...Array.from({ length: 90 }, (_, i) => 13 * 60 + i), 14 * 60 + 45];
  for (const m of minutes) {
    const b = bucketIndexOfMinute(m);
    if (pattern && b > 0 && m === BUCKETS[b].start) boost = (price / ref - 1) * 100 >= 2 ? 3 : 1;
    if (!pattern && b > 0 && m === BUCKETS[b].start) boost = r() < randomSurge ? 3 : 1; // bùng nổ ngẫu nhiên, KHÔNG phụ thuộc trạng thái
    const drift = r() < 0.5 ? 0.0015 : -0.0012;
    price *= 1 + drift;
    const base = m === 9 * 60 + 15 || m === 14 * 60 + 45 ? 50_000 : 2_000;
    bars.push({ date: `${date}T${hhmm(m)}:00+07:00`, open: price, high: price * 1.001, low: price * 0.999, close: price, volume: Math.round(base * boost * (0.6 + r() * 0.8)) });
  }
  return bars;
}

function makeHistory(n, seed = 3, opts) {
  const r = rng(seed);
  const bars = [];
  let ref = 50_000;
  let date = "2026-04-01";
  for (let i = 0; i < n; i++) {
    const s = makeSession(r, date, ref, opts);
    bars.push(...s);
    ref = s.at(-1).close;
    date = addDays(date, 1);
  }
  return groupSessions(bars);
}

test("cycle: 17 khung, ATO/ATC tách riêng, nghỉ trưa không thuộc khung nào", () => {
  assert.equal(BUCKET_COUNT, 17);
  assert.equal(bucketIndexOfMinute(9 * 60 + 15), 0); // nến ATO 09:15
  assert.equal(BUCKETS[bucketIndexOfMinute(9 * 60 + 16)].label, "09:15");
  assert.equal(BUCKETS[bucketIndexOfMinute(11 * 60 + 30)].label, "11:15");
  assert.equal(bucketIndexOfMinute(12 * 60), -1);
  assert.equal(BUCKETS[bucketIndexOfMinute(14 * 60 + 29)].label, "14:15");
  assert.equal(BUCKETS[bucketIndexOfMinute(14 * 60 + 45)].label, "ATC");
  const b = sessionToBuckets([
    { date: "2026-10-01T09:15:00+07:00", open: 10, high: 10, low: 10, close: 10, volume: 100 },
    { date: "2026-10-01T09:20:00+07:00", open: 10, high: 12, low: 9, close: 11, volume: 50 },
    { date: "2026-10-01T09:25:00+07:00", open: 11, high: 11, low: 10, close: 10.5, volume: 50 },
  ]);
  assert.equal(b[0].volume, 100);
  assert.deepEqual([b[1].open, b[1].high, b[1].low, b[1].close, b[1].volume], [10, 12, 9, 10.5, 100]);
});

test("cycle: hồ sơ điển hình — ATO/ATC lớn hơn khung giữa phiên, tỷ trọng lũy kế tăng dần tới 100%", () => {
  const sessions = makeHistory(40, 5, { pattern: false });
  const prof = buildProfile(sessions);
  assert.ok(prof[0].median > 35_000 && prof[0].median < 65_000, `ATO=${prof[0].median}`); // 1 nến ATO ~50k
  assert.ok(prof[5].median > 20_000 && prof[5].median < 40_000, `10:15=${prof[5].median}`); // 15 nến × ~2k
  for (let i = 1; i < 17; i++) assert.ok(prof[i].cumShare >= prof[i - 1].cumShare);
  assert.ok(Math.abs(prof[16].cumShare - 1) < 1e-9);
  assert.ok(prof[5].p25 <= prof[5].median && prof[5].median <= prof[5].p75);
});

test("cycle: xác suất làm mượt — ít mẫu thì kéo về nền, nhiều mẫu thì theo dữ liệu, có khoảng tin cậy", () => {
  const few = smoothed(3, 3, 0.1);
  assert.ok(few.p < 0.4 && !few.enough);
  const many = smoothed(150, 200, 0.1);
  assert.ok(Math.abs(many.p - 0.7) < 0.05 && many.enough);
  assert.ok(many.low < many.p && many.p < many.high && many.high - many.low < 0.15);
});

test("cycle: walk-forward phát hiện được quy luật thật (Brier skill > 0) và không 'ảo' khi không có quy luật", () => {
  const withPattern = makeHistory(120, 7, { pattern: true });
  const wf = walkForward(withPattern, rollingProfiles(withPattern));
  assert.ok(wf.surge.brierSkill > 0.05, `skill=${wf.surge.brierSkill}`);
  assert.ok(wf.calibration.length > 0);
  // Không có sự kiện nào -> không đủ cơ sở kiểm định (null), không được báo skill ảo.
  const quiet = makeHistory(120, 8, { pattern: false });
  assert.equal(walkForward(quiet, rollingProfiles(quiet)).surge.brierSkill, null);
  // Có bùng nổ nhưng NGẪU NHIÊN (không phụ thuộc trạng thái) -> skill không được dương đáng kể.
  const noise = makeHistory(150, 21, { pattern: false, randomSurge: 0.2 });
  const wf2 = walkForward(noise, rollingProfiles(noise));
  assert.ok(wf2.surge.events >= 20, `events=${wf2.surge.events}`);
  assert.ok(wf2.surge.brierSkill !== null && wf2.surge.brierSkill < 0.03, `skill khi không có quy luật=${wf2.surge.brierSkill}`);
});

test("cycle: trạng thái chỉ dùng dữ liệu TRƯỚC khung (không nhìn trộm tương lai)", () => {
  const sessions = makeHistory(30, 9);
  const prof = buildProfile(sessions);
  const s = sessions[10];
  const st = stateBefore(s.buckets, 5, s.refPrice, prof);
  const mutated = s.buckets.map((b, i) => (i >= 5 && b ? { ...b, close: b.close * 2, volume: b.volume * 10 } : b));
  assert.deepEqual(stateBefore(mutated, 5, s.refPrice, prof), st);
  assert.equal(outcomeOf(s.buckets, 5, prof, s.refPrice).volRegime !== undefined, true);
});

test("cycle: ma trận chuyển — mỗi hàng có tổng xác suất = 1; xác suất chạm ô trong 2 khung ≥ 1 khung", () => {
  const sessions = makeHistory(60, 11);
  const m = buildTransitions(sessions, rollingProfiles(sessions));
  for (const from of CELLS) {
    const sum = CELLS.reduce((a, to) => a + m[from].to[to].p, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${from}: ${sum}`);
  }
  const one = probabilityWithin(m, "up:norm", "up:high", 1);
  const two = probabilityWithin(m, "up:norm", "up:high", 2);
  assert.ok(Math.abs(one - m["up:norm"].to["up:high"].p) < 1e-9);
  assert.ok(two >= one && two <= 1);
});

test("cycle: kết quả cho phiên đang chạy — khung kế tiếp, RVOL theo thời điểm, dự phóng cuối phiên", () => {
  const sessions = makeHistory(100, 13);
  const r = rng(99);
  const todayBars = makeSession(r, "2026-10-01", sessions.at(-1).buckets.at(-1).close).filter((b) => b.date < "2026-10-01T10:05");
  const today = groupSessions(todayBars)[0];
  today.refPrice = sessions.at(-1).buckets.at(-1).close;
  const out = buildIntradayCycle({ sessions, today, nowMinute: 10 * 60 + 4 });
  assert.equal(out.ready, true);
  assert.equal(out.sessions, 100);
  assert.equal(out.current.lastBucket, 4); // khung 10:00 đang chạy
  assert.equal(out.current.inProgress, true);
  assert.equal(out.current.next.label, "10:15");
  assert.ok(out.current.timeAdjustedRvol > 0.3 && out.current.timeAdjustedRvol < 3, `rvol=${out.current.timeAdjustedRvol}`);
  assert.ok(out.current.projectedVolume > out.current.cumVolume);
  assert.ok(out.current.next.surge.p >= 0 && out.current.next.surge.p <= 1);
  assert.ok(typeof out.validation.validated.surge === "boolean");
  assert.equal(buildIntradayCycle({ sessions: sessions.slice(0, 10) }).ready, false);
});

// ---------- 3 lỗi đã sửa ở dòng phụ ----------

function dailyRows(n, { partialToday = false } = {}) {
  let date = "2026-08-01";
  const rows = Array.from({ length: n }, (_, i) => {
    const row = { symbol: "AAA", date, open: 100, high: 101, low: 99, close: 100 + i * 0.1, closeAdj: 100 + i * 0.1, volume: 1_000_000, value: 1e11, dealVolume: 0, dealValue: 0,
      foreignBuyVol: 1e4, foreignSellVol: 5e3, foreignBuyVal: 2e9, foreignSellVal: 1e9, foreignRoom: 1e6 };
    date = addDays(date, 1);
    return row;
  });
  if (partialToday) rows.push({ ...rows.at(-1), date: addDays(date, 1), volume: 300_000, foreignBuyVal: 0, foreignSellVal: 0, foreignBuyVol: 0, foreignSellVol: 0, partial: true });
  return rows;
}

test("lỗi #1/#3: trong phiên, RVOL so với cùng thời điểm (không so với KL cả ngày) và nhận định dùng RVOL đó", () => {
  const mk = (t, v) => ({ date: `2026-10-02T${t}:00+07:00`, open: 1, high: 1, low: 1, close: 1, volume: v });
  const past = [[mk("09:15", 100_000), mk("09:40", 50_000)], [mk("09:15", 100_000), mk("09:40", 50_000)]];
  const a = buildVolumeAnalysis({ symbol: "AAA", daily: dailyRows(30, { partialToday: true }), intradayToday: [mk("09:15", 200_000), mk("09:40", 100_000)], intradayPast: past });
  assert.equal(a.today.rvolMode, "intraday");
  assert.equal(a.today.rvol20, null, "không còn RVOL so với cả ngày trong phiên (300k/1tr = 0,3× là thấp giả)");
  assert.equal(a.today.rvolTimeAdjusted, 2);
  assert.ok(a.insights.some((s) => s.includes("2× cùng thời điểm")));
  assert.ok(!a.insights.some((s) => s.includes("Khối lượng thấp")));
});

test("lỗi #2: khối ngoại trong phiên là 'chưa có', không phải 0; lũy kế chỉ tính phiên đã chốt", () => {
  const f = computeForeign(dailyRows(25, { partialToday: true }));
  assert.equal(f.pendingToday, true);
  assert.equal(f.today, null);
  assert.equal(f.buySharePct, null);
  assert.equal(f.net5Val, 5 * 1e9);
  assert.equal(f.streak.sessions, 25);
  const settled = computeForeign(dailyRows(25));
  assert.equal(settled.pendingToday, false);
  assert.equal(settled.today.netVal, 1e9);
});

test("service: dựng chu kỳ cho một mã từ nến phút SSI (giả lập provider), phiên đã đóng", async () => {
  const { getIntradayCycle } = await import("../src/market/scanner/intradayService.js");
  const { TtlCache } = await import("../src/market/util.js");
  const r = rng(31);
  const calls = [];
  const provider = {
    isConfigured: () => true,
    async getIntradayRange(symbol, from, to) {
      calls.push([from, to]);
      const bars = [];
      let ref = 30_000;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
        if (wd === 0 || wd === 6) continue;
        const s = makeSession(r, d, ref);
        bars.push(...s);
        ref = s.at(-1).close;
      }
      return bars;
    },
    async getIntradayOhlcv() { return []; },
  };
  const service = { cache: new TtlCache(), router: { providers: { ssiFcV2: provider } } };
  const now = () => Date.parse("2026-10-01T12:00:00Z"); // 19:00 giờ VN, phiên đã đóng
  const out = await getIntradayCycle(service, "fpt", { now });
  assert.equal(out.symbol, "FPT");
  assert.equal(out.live, false);
  assert.equal(out.viewDate, "2026-10-01");
  assert.equal(out.ready, true);
  assert.equal(out.current.sessionDone, true);
  assert.ok(out.sessions >= 100);
  await getIntradayCycle(service, "FPT", { now });
  assert.equal(calls.length, 1, "lịch sử được lưu đệm, không gọi SSI lại");
  await assert.rejects(getIntradayCycle(service, "VNINDEX", { now }), (e) => e.statusCode === 400);
});

test("cycle: hồ sơ trượt chỉ dùng các phiên TRƯỚC đó và thích nghi khi KL đổi nhịp", () => {
  const r = rng(41);
  const bars = [];
  let ref = 40_000, date = "2026-04-01";
  for (let i = 0; i < 60; i++) {
    const s = makeSession(r, date, ref, { pattern: false });
    // 30 phiên đầu KL gấp 3 lần 30 phiên sau (thị trường hạ nhiệt)
    bars.push(...s.map((b) => ({ ...b, volume: i < 30 ? b.volume * 3 : b.volume })));
    ref = s.at(-1).close;
    date = addDays(date, 1);
  }
  const sessions = groupSessions(bars);
  const profs = rollingProfiles(sessions, 20, 10);
  assert.equal(profs[5], null);
  assert.ok(profs[29][5].median > profs[59][5].median * 2.5, "hồ sơ phiên 59 phản ánh nhịp thấp mới");
  // Không còn "dự báo quá cao" do nhịp cũ: ở giai đoạn sau, tỷ lệ cạn KL dự báo không bị đẩy lên bởi nhịp cũ.
  const wf = walkForward(sessions, profs, { warmup: 40 });
  assert.ok(wf.calibration.every((c) => Math.abs(c.predicted - c.observed) < 0.25));
});
