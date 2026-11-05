// Hồi quy 05/11/2026: /api/scan chỉ dùng nến thật, không còn số giả (mock giá kiểu Bitcoin, Math.random, nến sinh ra).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = (p) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

test("không còn mã sinh số giả trong đường /api/scan và trong engine vĩ mô / thế giới", () => {
  const files = ["services/aiVisionService.js", "services/featureExtraction.js", "services/historicalDataProvider.js", "routes/scan.js", "services/patternBacktest.js", "market/macro/macroCore.js", "market/world/worldCore.js"];
  for (const f of files) {
    const s = fs.readFileSync(SRC(f), "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(s, /Math\.random\(|mockVisionAnalysis\(|generateMockHistoricalCandles\(|makeSyntheticStore\(|makeSyntheticWorld\(|62800|69000/, f);
  }
  assert.equal(fs.existsSync(SRC("services/aiSynthesis.js")), false, "mô-đun tổng hợp có mock đã xoá");
});

test("khung thời gian: daily / 1d / D đều là nến ngày; khung khác bị từ chối", async () => {
  const { normalizeTimeframe } = await import("../src/services/historicalDataProvider.js");
  for (const t of ["daily", "Daily", "1d", "D", "1D", undefined]) assert.equal(normalizeTimeframe(t), "D", String(t));
  for (const t of ["weekly", "1h", "4h"]) assert.equal(normalizeTimeframe(t), null, t);
});

test("nguồn Gateway: trả nến thật, bỏ nến đang hình thành; thiếu nến hoặc khung khác thì báo lỗi cấu hình, không lấp số", async () => {
  const saved = { s: process.env.HISTORICAL_DATA_SOURCE, u: process.env.MARKET_GATEWAY_URL, f: globalThis.fetch };
  process.env.HISTORICAL_DATA_SOURCE = "market_gateway";
  process.env.MARKET_GATEWAY_URL = "http://gw.test";
  const calls = [];
  const bars = Array.from({ length: 300 }, (_, i) => ({ date: `2025-${String(1 + Math.floor(i / 28) % 12).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, open: 10, high: 11, low: 9, close: 10 + i / 100, volume: 1000 }));
  globalThis.fetch = async (url) => { calls.push(String(url)); return { ok: true, json: async () => ({ bars: [...bars, { date: "x", partial: true, open: 1, high: 1, low: 1, close: 1, volume: 1 }], provenance: { source: "SSI" } }) }; };
  try {
    const { fetchHistoricalCandles, HistoricalDataConfigError } = await import(`../src/services/historicalDataProvider.js?gw=${Date.now()}`);
    const r = await fetchHistoricalCandles("FPT", { timeframe: "daily" });
    assert.equal(r.isMock, false);
    assert.equal(r.source, "market:SSI");
    assert.equal(r.candles.length, 300);
    assert.match(calls[0], /^http:\/\/gw\.test\/api\/market\/ohlcv\?symbol=FPT/);
    await assert.rejects(() => fetchHistoricalCandles("FPT", { timeframe: "weekly" }), HistoricalDataConfigError);
    await assert.rejects(() => fetchHistoricalCandles("FPT", { timeframe: "D", minBars: 1000 }), /Chỉ nhận được 300 nến/);
  } finally {
    process.env.HISTORICAL_DATA_SOURCE = saved.s ?? ""; process.env.MARKET_GATEWAY_URL = saved.u ?? ""; globalThis.fetch = saved.f;
    if (saved.s === undefined) delete process.env.HISTORICAL_DATA_SOURCE;
    if (saved.u === undefined) delete process.env.MARKET_GATEWAY_URL;
  }
});

test("chưa cấu hình nguồn thì báo lỗi rõ, không rơi về nến giả", async () => {
  const saved = process.env.HISTORICAL_DATA_SOURCE;
  delete process.env.HISTORICAL_DATA_SOURCE;
  try {
    const { fetchHistoricalCandles } = await import(`../src/services/historicalDataProvider.js?none=${Date.now()}`);
    await assert.rejects(() => fetchHistoricalCandles("FPT", { timeframe: "D" }), /Chưa cấu hình HISTORICAL_DATA_SOURCE/);
  } finally { if (saved !== undefined) process.env.HISTORICAL_DATA_SOURCE = saved; }
});

test("AI Vision thiếu khoá thì báo lỗi cấu hình, không trả phân tích giả", async () => {
  const saved = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY;
  try {
    const { analyzeChartsWithAI } = await import("../src/services/aiVisionService.js");
    await assert.rejects(() => analyzeChartsWithAI({ images: [], timeframes: ["daily"], symbol: "FPT" }), (e) => e.code === "NO_AI_KEY");
  } finally {
    if (saved.a !== undefined) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.g !== undefined) process.env.GEMINI_API_KEY = saved.g;
  }
});

test("lớp định lượng: POC tính từ nến thật; chỉ số chưa có nguồn để trống, không ngẫu nhiên", async () => {
  const { extractQuantFeatures, volumeProfilePoc } = await import("../src/services/featureExtraction.js");
  // 30 nến quanh 100 (khối lượng lớn) và 30 nến quanh 120 (khối lượng nhỏ) -> POC gần 100.
  const c = [...Array.from({ length: 30 }, () => ({ open: 100, high: 101, low: 99, close: 100, volume: 10_000 })), ...Array.from({ length: 30 }, () => ({ open: 120, high: 121, low: 119, close: 120, volume: 100 }))];
  const poc = volumeProfilePoc(c);
  assert.ok(poc > 98.5 && poc < 101.5, String(poc));
  assert.equal(volumeProfilePoc(c.slice(0, 5)), null, "thiếu nến -> null");
  const q1 = extractQuantFeatures(c), q2 = extractQuantFeatures(c);
  assert.deepEqual(q1, q2, "tất định");
  assert.equal(q1.order_flow_bias, null); assert.equal(q1.liquidity_pools, null); assert.equal(q1.correlation_flag, null);
  assert.match(q1.source, /chưa có nguồn/);
});
