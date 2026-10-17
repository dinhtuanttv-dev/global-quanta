process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { averageRanks, bhQ, dailyIc, decideTier, normCdf, summarize } from "../src/market/elite/icCore.js";
import { createEvidenceEngine, EVIDENCE_KV } from "../src/market/elite/evidenceEngine.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

test("E2 icCore: hạng trung bình, Spearman, ngưỡng mẫu", () => {
  assert.deepEqual(averageRanks([10, 20, 20, 5]), [2, 3.5, 3.5, 1]);
  const mono = Array.from({ length: 40 }, (_, i) => [i, i * i]);
  assert.equal(dailyIc(mono).ic, 1);
  assert.equal(dailyIc(mono.map(([a, b]) => [a, -b])).ic, -1);
  assert.equal(dailyIc(mono.slice(0, 29)), null, "n < 30 -> không đo");
  assert.equal(dailyIc(mono.map(([, b]) => [1, b])), null, "tín hiệu hằng -> không đo");
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
});

test("E2 icCore: Newey–West nới SE khi chuỗi tự tương quan; ổn định hai nửa; BH", () => {
  const iid = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.05 : -0.01));
  const s0 = summarize(iid, 0);
  assert.ok(Math.abs(s0.mean - 0.02) < 1e-12);
  assert.ok(s0.stable);
  const smooth = Array.from({ length: 100 }, (_, i) => 0.02 + 0.03 * Math.sin(i / 8));
  assert.ok(summarize(smooth, 10).se > summarize(smooth, 0).se, "lag dương làm SE lớn hơn với chuỗi trơn");
  const half = [...Array(50).fill(0.05), ...Array(50).fill(-0.01)];
  assert.equal(summarize(half, 0).stable, false);
  const q = bhQ([0.01, 0.04, 0.03, 0.5]);
  assert.deepEqual(q.map((v) => Math.round(v * 1e4) / 1e4), [0.04, 0.0533, 0.0533, 0.5]);
});

test("E2 decideTier: giáng trước, thăng một bậc, giữ khi chưa đủ ngày", () => {
  const good = { n: 130, mean: 0.03, pPos: 0.001, pNeg: 0.999, stable: true, q: 0.01 };
  const bad = { n: 70, mean: -0.02, pPos: 0.97, pNeg: 0.03, stable: false, q: 0.9 };
  assert.equal(decideTier("A", { 5: bad }, 5).tier, "B");
  assert.equal(decideTier("C", { 5: bad }, 5).tier, "C");
  assert.equal(decideTier("C", { 5: good }, 5).tier, "B", "C chỉ lên B dù đạt mức A");
  assert.equal(decideTier("B", { 10: good, 5: { ...good, mean: 0.001 } }, 5).tier, "A");
  assert.equal(decideTier("B", { 5: { ...good, n: 100 } }, 5).tier, "B", "A cần ≥ 120 ngày");
  assert.equal(decideTier("C", { 5: { ...good, stable: false } }, 5).tier, "C", "không ổn định hai nửa -> không thăng");
  assert.match(decideTier("A", { 5: { n: 10, mean: 0.1 } }, 5).reasonVi, /10 ngày/);
});

/** 90 phiên, 40 mã. Tín hiệu `stealth5` dự báo đúng lợi suất 5 phiên tới; `log_rvol` là nhiễu xác định. */
function fixture() {
  const store = createMemoryStore();
  const syms = Array.from({ length: 40 }, (_, i) => `S${String(i).padStart(2, "0")}`);
  const cal = [];
  for (let i = 0, d = Date.UTC(2026, 3, 1); cal.length < 90; i++, d += 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) cal.push(new Date(d).toISOString().slice(0, 10));
  }
  const drift = (s) => ((s * 37) % 40) / 40 - 0.5; // xu hướng riêng từng mã, cố định
  const daily = [], flow = [];
  syms.forEach((sym, s) => {
    let p = 100;
    cal.forEach((date, i) => {
      p *= 1 + 0.004 * drift(s) + 0.002 * Math.sin(i * 1.3 + s);
      daily.push({ symbol: sym, date, closeAdj: p });
      flow.push({ symbol: sym, trading_date: date, method: "x", features: { stealth5: drift(s) + 0.01 * Math.cos(i + s), logRvol: Math.sin(i * 7.7 + s * 3.1), stealth20: 0, netIntent: null, mom5Atr: 0.1 } });
    });
  });
  // lịch phiên dùng các mã lịch chuẩn
  for (const date of cal) for (const sym of ["VNM", "FPT", "HPG", "VCB", "MWG"]) daily.push({ symbol: sym, date, closeAdj: 10 });
  return { store, syms, cal, daily, flow };
}

test("E2 engine: đo hồi cứu dòng tiền + tiến từ bảng E1, tăng dần không đọc lại, bậc theo luật", async () => {
  const { store, cal, daily, flow } = fixture();
  await store.upsertMarketDaily(daily);
  await store.upsertRows("market_flow_daily", flow, "symbol,trading_date");
  const lastDates = cal.slice(-8);
  const panels = new Map(lastDates.map((d) => [d, { date: d, rows: Array.from({ length: 40 }, (_, s) => ({ ticker: `S${String(s).padStart(2, "0")}`, values: { smart_score: 50 + s, stealth5: 999 } })) }]));
  let flowReads = 0;
  const realSelect = store.selectRows.bind(store);
  store.selectRows = async (t, q) => { if (t === "market_flow_daily") flowReads++; return realSelect(t, q); };
  const panel = { dates: async () => [...panels.keys()], panel: async (d) => panels.get(d ?? lastDates[lastDates.length - 1]) ?? null };
  const eng = createEvidenceEngine({ store, panel, now: () => Date.parse("2026-08-10T12:00:00Z"), log: { warn() {} } });

  const ev = await eng.update();
  const s5 = ev.signals.find((s) => s.id === "stealth5");
  assert.equal(s5.source, "hồi cứu point-in-time (market_flow_daily)");
  assert.ok(s5.byH[5].n >= 80, `n=${s5.byH[5].n}`);
  assert.ok(s5.byH[5].mean > 0.5, `IC=${s5.byH[5].mean}`);
  assert.ok(s5.byH[5].q != null && s5.byH[5].q < 0.01);
  assert.equal(s5.tier, "A", "đã là A và không bị giáng");
  const rv = ev.signals.find((s) => s.id === "log_rvol");
  assert.ok(Math.abs(rv.byH[5].mean) < 0.2, `nhiễu IC=${rv.byH[5].mean}`);
  const ss = ev.signals.find((s) => s.id === "smart_score");
  assert.equal(ss.source, "tiến từ bảng E1");
  assert.ok(ss.byH[1].n >= 1 && ss.byH[1].n <= 8);
  assert.equal(ss.tier, "C");
  assert.match(ss.reasonVi, /cần ≥ 60/);
  assert.ok(ev.signals.find((s) => s.id === "stealth5").byH[5].n > 0, "giá trị 999 trong bảng E1 KHÔNG ghi đè đặc trưng hồi cứu");

  const ic = (await store.getKv(EVIDENCE_KV.ic)).value;
  assert.ok(Object.keys(ic.pending).length <= 21, "đệm chỉ giữ các ngày còn chờ kỳ hạn dài");
  const reads = flowReads;
  await eng.update();
  assert.equal(flowReads, reads, "lần chạy lại không có ngày mới -> không đọc lại market_flow_daily");
  assert.deepEqual((await eng.evidence()).counts, ev.counts);
});
