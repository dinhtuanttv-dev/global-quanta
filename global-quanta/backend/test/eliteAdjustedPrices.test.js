// 13/11/2026 — LS-v1 của phiên và engine quyết định phải dùng giá ĐIỀU CHỈNH CỘNG DỒN: close_adj của market_daily còn nguyên bước
// nhảy ở ngày giao dịch không hưởng quyền, làm mã chia cổ phiếu bị coi là sụt giá.
import test from "node:test";
import assert from "node:assert/strict";
import { createLeadershipService } from "../src/market/elite/leadershipService.js";
import { createDecisionService, DECISION_KV } from "../src/market/elite/decisionService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

/** 60 mã × 330 phiên. Mã i tăng đều (i − 30) × 0,02%/phiên. "SPL" mạnh nhất nhưng giá THÔ giảm 20% ở phiên 300 (chia cổ phiếu). */
function world(split = 300) {
  const cal = [];
  for (let d = Date.UTC(2025, 6, 1); cal.length < 330; d += 86_400_000) { const wd = new Date(d).getUTCDay(); if (wd !== 0 && wd !== 6) cal.push(new Date(d).toISOString().slice(0, 10)); }
  const names = [...Array.from({ length: 59 }, (_, i) => `T${String(i).padStart(2, "0")}`), "SPL"];
  const adj = new Map(), raw = [];
  names.forEach((t, i) => {
    const g = t === "SPL" ? 0.004 : (i - 30) * 0.0002; let p = 20000; const rows = [];
    cal.forEach((d, k) => { p *= 1 + g + ((k * (i + 3)) % 7 - 3) * 0.0008; rows.push([d, p, 5e9 + i * 1e8]); raw.push({ symbol: t, date: d, closeAdj: t === "SPL" && k < split ? p * 1.25 : p, value: 5e9 + i * 1e8 }); });
    adj.set(t, rows);
  });
  const idx = cal.map((d, k) => ({ date: d, close: 1000 + k }));
  return { cal, names, adj, raw, idx };
}
const fakeStore = (raw, kv = new Map()) => ({
  getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); },
  getMarketDailyRange: async ({ from, to, symbols }) => { const s = new Set(symbols); return raw.filter((r) => s.has(r.symbol) && r.date >= from && r.date <= to); },
});

test("LS-v1 của phiên: dùng giá điều chỉnh cộng dồn — mã chia cổ phiếu không bị tụt hạng; bản cũ cùng phiên được tính lại", async () => {
  const w = world(), date = w.cal.at(-1), kv = new Map();
  const mk = (adjustedCloses) => createLeadershipService({ store: fakeStore(w.raw, kv), pricesOf: () => null, universe: async () => w.names, vnIndexBars: async () => w.idx, adjustedCloses, log: { warn() {} } });
  const rankOf = (lv, t) => Object.entries(lv.rows).sort((a, b) => b[1].ls - a[1].ls).findIndex(([x]) => x === t) + 1;
  const old = await mk(null).live(date);
  assert.equal(old.priceBasis, "SSI_CLOSE_ADJ_LATEST_EVENT");
  assert.ok(rankOf(old, "SPL") > 10, `giá thô: SPL bị kéo xuống hạng ${rankOf(old, "SPL")}`);
  const fixed = await mk(async () => w.adj).live(date); // KV đang giữ bản tính trên giá thô của cùng phiên -> phải tính lại
  assert.equal(fixed.priceBasis, "ADJUSTED_CUMULATIVE");
  assert.ok(rankOf(fixed, "SPL") <= 3 && rankOf(fixed, "SPL") < rankOf(old, "SPL"), `giá điều chỉnh: SPL trở lại nhóm dẫn dắt (hạng ${rankOf(fixed, "SPL")})`);
  assert.equal(kv.get("elite:ls:live").priceBasis, "ADJUSTED_CUMULATIVE");
});

test("LS-v1 của phiên: nguồn điều chỉnh lỗi -> lùi về close_adj có ghi rõ; mã thiếu chuỗi cộng dồn lấy close_adj riêng mã đó", async () => {
  const w = world(), date = w.cal.at(-1);
  const failing = createLeadershipService({ store: fakeStore(w.raw), pricesOf: () => null, universe: async () => w.names, vnIndexBars: async () => w.idx, adjustedCloses: async () => { throw new Error("kho lỗi"); }, log: { warn() {} } });
  assert.equal((await failing.live(date)).priceBasis, "SSI_CLOSE_ADJ_LATEST_EVENT");
  const partial = new Map([...w.adj].filter(([t]) => t !== "T05"));
  const svc = createLeadershipService({ store: fakeStore(w.raw), pricesOf: () => null, universe: async () => w.names, vnIndexBars: async () => w.idx, adjustedCloses: async () => partial, log: { warn() {} } });
  const lv = await svc.live(date);
  assert.equal(lv.priceBasis, "ADJUSTED_CUMULATIVE"); assert.ok(lv.rows.T05, "mã thiếu chuỗi cộng dồn vẫn có LS-v1");
});

test("Engine quyết định: σ20 và giá đóng cửa của bảng điểm lấy từ giá điều chỉnh cộng dồn; mã thiếu chuỗi vẫn có giá", async () => {
  const w = world(320), date = w.cal.at(-1), store = createMemoryStore();
  await store.upsertMarketDaily(w.raw.map((r) => ({ ...r, close: r.closeAdj })));
  const rows = w.names.map((t, i) => ({ ticker: t, icb: { l2: `S${i % 8}` }, values: { stealth20: i, ls_v1: i, structure_score: 3, rrg_quadrant: 2 } }));
  const evidence = { version: "E2-v1", signals: [{ id: "stealth20", tier: "A", mainH: 5, byH: { 5: { n: 200, mean: 0.016 } } }] };
  const partial = new Map([...w.adj].filter(([t]) => t !== "T05"));
  const mk = (adjustedCloses) => createDecisionService({ store, panel: { panel: async () => ({ date, version: "E1", rows }) }, evidence: { evidence: async () => evidence }, vnIndex: async () => w.idx.map((b) => [b.date, b.close]), adjustedCloses, log: { warn() {} } });
  const rawDoc = await mk(null).build({ force: true });
  const fixDoc = await mk(async () => partial).build({ force: true });
  const s = (doc, t) => doc.scores.find((x) => x.ticker === t);
  assert.ok(s(rawDoc, "SPL").sigma20 > 0.03, "giá thô: bước nhảy −20% làm σ20 của SPL phình ra");
  assert.ok(s(fixDoc, "SPL").sigma20 < 0.01, "giá điều chỉnh: σ20 của SPL trở lại bình thường");
  assert.ok(s(fixDoc, "T05").close > 0, "mã thiếu chuỗi cộng dồn vẫn có giá (close_adj riêng mã đó)");
  assert.ok((await store.getKv(DECISION_KV.ledger)).value.entries.length >= 1);
});
