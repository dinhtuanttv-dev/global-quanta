process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { createTopbarService, cumulativeTo, liquidityStats, liveStatus, sessionsAt, zoned, LIQ_VALUE_KV } from "../src/market/topbar/topbarService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";

// 2026-10-22 (thứ Năm) theo giờ VN = UTC+7
const vn = (hhmm, date = "2026-10-22") => new Date(`${date}T${hhmm}:00+07:00`);

test("liveStatus: ≤ 60 giây LIVE, ≤ 5 phút CHẬM, quá -> CŨ; ngoài phiên -> closed; asOf thiếu / tương lai không bao giờ live", () => {
  const now = Date.parse("2026-10-22T03:00:00Z");
  assert.equal(liveStatus({ asOf: "2026-10-22T02:59:30Z", nowMs: now, inSession: true }).status, "live");
  assert.equal(liveStatus({ asOf: "2026-10-22T02:57:00Z", nowMs: now, inSession: true }).status, "delayed");
  assert.equal(liveStatus({ asOf: "2026-10-22T02:50:00Z", nowMs: now, inSession: true }).status, "stale");
  assert.equal(liveStatus({ asOf: "2026-10-22T02:50:00Z", nowMs: now, inSession: false }).status, "closed");
  assert.equal(liveStatus({ asOf: null, nowMs: now, inSession: true }).status, "empty");
  assert.equal(liveStatus({ asOf: "2026-10-22T03:10:00Z", nowMs: now, inSession: true }).status, "stale");
  assert.equal(liveStatus({ asOf: "xyz", nowMs: now, inSession: true }).status, "error");
});

test("phiên VN: ATO / khớp liên tục / nghỉ trưa / ATC / đóng cửa / cuối tuần; lần chuyển kế tiếp đúng giờ", () => {
  const at = (t, d) => sessionsAt(vn(t, d)).VN;
  assert.deepEqual([at("09:05").phase, at("09:05").label], ["auction", "ATO"]);
  assert.equal(at("10:00").phase, "open");
  assert.equal(at("10:00").nextTransitionAt, vn("11:30").toISOString());
  assert.deepEqual([at("12:00").phase, at("12:00").label], ["break", "Nghỉ trưa"]);
  assert.deepEqual([at("14:35").phase, at("14:35").label], ["auction", "ATC"]);
  assert.equal(at("15:30").phase, "closed");
  assert.equal(at("15:30").nextTransitionAt, null);
  assert.deepEqual([at("10:00", "2026-10-24").phase, at("10:00", "2026-10-24").label], ["holiday", "Cuối tuần"]);
});

test("phiên HK / US theo múi giờ IANA: giờ mùa hè / mùa đông Mỹ tự đúng, HK có nghỉ trưa", () => {
  // NYSE mở 09:30 New York: mùa hè (EDT, UTC−4) = 13:30Z; mùa đông (EST, UTC−5) = 14:30Z.
  assert.equal(sessionsAt(new Date("2026-07-15T13:45:00Z")).US.phase, "open");
  assert.equal(sessionsAt(new Date("2026-12-15T13:45:00Z")).US.phase, "closed");
  assert.equal(sessionsAt(new Date("2026-12-15T14:45:00Z")).US.phase, "open");
  assert.equal(sessionsAt(new Date("2026-10-22T04:30:00Z")).HK.phase, "break"); // 12:30 HKT
  assert.equal(zoned(new Date("2026-03-09T13:45:00Z"), "America/New_York").minutes, 9 * 60 + 45);
});

test("lịch nghỉ: NYSE theo quy tắc sàn (Good Friday có, Columbus / Veterans không, nghỉ bù cuối tuần); HK từ lịch truyền vào", async () => {
  const { nyseHolidays, easter } = await import("../src/market/topbar/topbarService.js");
  assert.deepEqual(easter(2026), { month: 4, day: 5 });
  assert.deepEqual(easter(2027), { month: 3, day: 28 });
  assert.deepEqual([...nyseHolidays(2026)].sort(), ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
  // 2027: Juneteenth (T7) -> T6 18/6; Độc lập (CN) -> T2 5/7; Giáng sinh (T7) -> T6 24/12; Năm mới 2028 (T7) KHÔNG nghỉ bù 31/12/2027.
  const h27 = nyseHolidays(2027);
  for (const d of ["2027-01-01", "2027-03-26", "2027-06-18", "2027-07-05", "2027-12-24"]) assert.ok(h27.has(d), d);
  assert.ok(!nyseHolidays(2028).has("2027-12-31"));
  assert.ok(!nyseHolidays(2026).has("2026-10-12") && !nyseHolidays(2026).has("2026-11-11"));
  assert.equal(sessionsAt(new Date("2026-04-03T14:00:00Z")).US.phase, "holiday"); // Good Friday 10:00 NY
  assert.equal(sessionsAt(new Date("2026-10-12T14:00:00Z")).US.phase, "open");    // Columbus Day: NYSE mở
  const hk = new Set(["2026-10-19"]);
  assert.equal(sessionsAt(new Date("2026-10-19T02:00:00Z"), { hk }).HK.phase, "holiday");
  assert.equal(sessionsAt(new Date("2026-10-19T02:00:00Z"), { hk }).HK.note, null);
  assert.match(sessionsAt(new Date("2026-10-19T02:00:00Z")).HK.note, /lịch nghỉ lễ/);
});

test("thanh khoản: độ lệch chuẩn MẪU, z; thiếu lịch sử / std = 0 / chưa có số hiện tại -> null có lý do", () => {
  const h = [100, 110, 90, 105, 95, 100, 120, 80, 100, 100];
  const s = liquidityStats(130, h);
  const mean = 100, std = Math.sqrt(h.reduce((a, v) => a + (v - mean) ** 2, 0) / 9);
  assert.equal(s.n, 10);
  assert.ok(Math.abs(s.mean - mean) < 1e-9 && Math.abs(s.std - std) < 1e-9);
  assert.ok(Math.abs(s.z - 30 / std) < 1e-9 && Math.abs(s.deviationPct - 30) < 1e-9);
  assert.equal(liquidityStats(130, h.slice(0, 9)).z, null);
  assert.match(liquidityStats(130, h.slice(0, 9)).reason, /9\/10/);
  assert.equal(liquidityStats(130, Array(10).fill(100)).z, null);
  assert.equal(liquidityStats(null, h).z, null);
  assert.equal(cumulativeTo([{ date: "2026-10-22T09:15", volume: 10 }, { date: "2026-10-22 10:30", volume: 5 }, { date: "2026-10-22T10:31", volume: 99 }]), 15);
  assert.equal(cumulativeTo([]), null);
});

function fakes({ snap, quotes = {}, minuteVol = 1000 }) {
  const store = createMemoryStore();
  const daily = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, close: 1700 + i }));
  const service = {
    getIndexSnapshot: async () => { if (snap instanceof Error) throw snap; return snap; },
    getOhlcv: async (p) => (p.resolution === "1m" ? { bars: [{ date: `${p.to}T09:15`, volume: minuteVol }, { date: `${p.to}T10:00`, volume: minuteVol }, { date: `${p.to}T11:00`, volume: 5 }] } : { bars: daily }),
  };
  const fetchImpl = async (url) => {
    const sym = decodeURIComponent(url.match(/chart\/([^?]+)/)[1]);
    const q = quotes[sym];
    if (!q) return new Response("x", { status: 500 });
    const t = Math.floor(Date.parse(q.time) / 1000);
    return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: q.value, regularMarketTime: t }, timestamp: [t - 86400, t], indicators: { quote: [{ close: [q.prev, q.value] }] } }] } }));
  };
  return { store, service, fetchImpl };
}

test("snapshot: VN-Index + độ rộng cùng một snapshot SSI; giá trị THẬT; vĩ mô từ Yahoo; Risk-On MÔ TẢ; một nguồn hỏng không làm mất thanh", async () => {
  const now = vn("10:40");
  const snap = { value: 1760, change: 20, changePct: 1.15, totalVolume: 5e8, totalValue: 1.3e13, advances: 150, declines: 160, noChanges: 60, ceilings: 2, floors: 3,
    provenance: { source: "SSI_FC_V2", asOf: new Date(now.getTime() - 20_000).toISOString(), fallbackReason: null } };
  const quotes = {
    "DX-Y.NYB": { value: 101.6, prev: 101.7, time: new Date(now.getTime() - 30 * 60_000).toISOString() },
    "^TNX": { value: 4.95, prev: 5.1, time: new Date(now.getTime() - 3 * 3600_000).toISOString() },
    "^VIX": { value: 19, prev: 18, time: new Date(now.getTime() - 3 * 3600_000).toISOString() },
  };
  const f = fakes({ snap, quotes });
  const tb = createTopbarService({ ...f, now: () => now.getTime(), tradingDatesBack });
  const s = await tb.snapshot();
  assert.equal(s.index.meta.status, "live");
  assert.equal(s.index.data.valueVnd, 1.3e13);
  assert.equal(s.index.data.reference, 1729, "tham chiếu = đóng cửa phiên trước thật (không dùng trường Change lệch tỷ lệ của SSI)");
  assert.equal(s.index.data.change, 31);
  assert.equal(s.index.data.series.at(-1).value, 1760);
  assert.equal(s.breadth.data.total, 370);
  assert.equal(s.breadth.data.unchanged, 60);
  assert.equal(s.breadth.meta.asOf, s.index.meta.asOf, "cùng snapshot");
  assert.deepEqual(s.macro.map((m) => m.meta.status), ["delayed", "closed", "error"], "vàng lỗi -> chỉ thẻ vàng lỗi");
  assert.equal(s.macro[2].data, null);
  assert.equal(s.regime.data.label, "MÔ TẢ");
  assert.equal(s.regime.data.evidence.verdict, "FAIL");
  assert.equal(s.sessions.data.VN.phase, "open");
  // Thanh khoản: 10:40 > 10:30 -> có số hiện tại (khối lượng tới 10:30 = 2000), 20 phiên lịch sử.
  assert.equal(s.liquidity.data.measure, "volume");
  assert.equal(s.liquidity.data.current, 2000);
  assert.equal(s.liquidity.data.n, 20);
  assert.equal(s.liquidity.data.z, null, "std = 0 (lịch sử giống hệt) -> không có z giả");
  // SSI lỗi -> index / breadth error, phần còn lại vẫn có.
  const g = fakes({ snap: new Error("SSI down"), quotes });
  const s2 = await createTopbarService({ ...g, now: () => now.getTime(), tradingDatesBack }).snapshot();
  assert.equal(s2.index.meta.status, "error");
  assert.equal(s2.breadth.data, null);
  assert.equal(s2.macro[0].meta.status, "delayed");
  // Độ rộng 0/0 -> empty (không vẽ 100% một phía).
  const h = fakes({ snap: { ...snap, advances: 0, declines: 0, noChanges: 0 }, quotes });
  assert.equal((await createTopbarService({ ...h, now: () => now.getTime(), tradingDatesBack }).snapshot()).breadth.meta.status, "empty");
});

test("thanh khoản theo GIÁ TRỊ khi đã ghi đủ 10 phiên (job 10:31); trước đó ghi rõ đang đo khối lượng", async () => {
  const snap = { value: 1760, change: 20, changePct: 1.15, totalVolume: 2e8, totalValue: 6e12, advances: 1, declines: 1, noChanges: 1, provenance: { source: "SSI_FC_V2", asOf: vn("10:31").toISOString() } };
  const f = fakes({ snap });
  const days = tradingDatesBack("2026-10-21", 12);
  await f.store.setKv(LIQ_VALUE_KV, days.map((date, i) => ({ date, value: 5e12 + i * 1e11 })));
  let t = vn("10:31").getTime();
  const tb = createTopbarService({ ...f, now: () => t, tradingDatesBack });
  const rec = await tb.recordLiquidity1030();
  assert.equal(rec.value, 6e12);
  t = vn("11:00").getTime();
  const s = await tb.snapshot();
  assert.equal(s.liquidity.data.measure, "value");
  assert.equal(s.liquidity.data.current, 6e12);
  assert.equal(s.liquidity.data.n, 12);
  assert.ok(s.liquidity.data.z > 0);
  // Ngày nghỉ: job bỏ qua.
  t = vn("10:31", "2026-10-24").getTime();
  assert.ok((await tb.recordLiquidity1030()).skipped);
});

test("trong phiên SSI DailyIndex trả điểm = 0 (đo 23/10/2026): lấy điểm từ nến phút SSI; không có nến -> suy từ % có ghi rõ", async () => {
  const { resolveIndexNow } = await import("../src/market/topbar/topbarService.js");
  const snap = { value: 0, change: -0.045, changePct: -0.26, date: "2026-10-23", provenance: { source: "SSI_FC_V2", asOf: "2026-10-23T00:00:00+07:00", fetchedAt: "2026-10-23T04:51:58.314Z" } };
  const svc = (bars) => ({ getOhlcv: async () => ({ bars }) });
  const a = await resolveIndexNow({ service: svc([{ date: "2026-10-23T09:15:55+07:00", close: 1756.29 }, { date: "2026-10-23T11:30:05+07:00", close: 1756.13 }]), snap, today: "2026-10-23", prevClose: 1760.63, intraday: true });
  assert.equal(a.value, 1756.13);
  assert.equal(a.asOf, "2026-10-23T11:30:05+07:00");
  assert.equal(a.source, "SSI IntradayOhlc (nến phút)");
  assert.ok(Math.abs(a.change - (1756.13 - 1760.63)) < 1e-9);
  const b = await resolveIndexNow({ service: svc([]), snap, today: "2026-10-23", prevClose: 1760.63, intraday: true });
  assert.ok(Math.abs(b.value - 1760.63 * (1 - 0.0026)) < 1e-9);
  assert.match(b.derived, /suy ra/);
  assert.equal(b.asOf, "2026-10-23T04:51:58.314Z", "snapshot chỉ có NGÀY -> thời điểm lấy dữ liệu, không phải nửa đêm");
  const c = await resolveIndexNow({ service: svc([]), snap: { ...snap, changePct: null }, today: "2026-10-23", prevClose: 1760.63, intraday: true });
  assert.equal(c.value, null);
});
