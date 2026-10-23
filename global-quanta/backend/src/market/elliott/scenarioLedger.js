// EP2 (24/10/2026) — SỔ THEO DÕI KỊCH BẢN ELLIOTT (thời gian thực, không nhìn trước).
//   Mỗi phiên sau giờ đóng cửa (job elliottLedger): với từng mã của universe Siêu Quét + VNINDEX, dựng cây sóng v3 trên chuỗi nến
//   TA (cùng nguồn /ta-series của biểu đồ), lấy kịch bản CHÍNH + PHỤ đã xác nhận (không "tạm") và:
//     - ghi sổ kịch bản MỚI (id = mã + mẫu + bậc + điểm neo) với loggedAt = ngày ghi sổ;
//     - cập nhật vòng đời các kịch bản đang mở CHỈ bằng nến SAU ngày ghi sổ (sự kiện trước đó không được tính điểm).
//   Chấm điểm (đăng ký trước EP2_PREREG): kịch bản đã kích hoạt và đã kết thúc — đạt MT1 trước vô hiệu so với chuẩn ngẫu nhiên.
// Bảng market_elliott_ledger chỉ ở kho cục bộ (Railway Volume).
import { buildWaveTree, EP2_PREREG, evaluateLifecycle, scenariosFromTree, scoreLedger, SCENARIO_ENGINE_VERSION, WAVE_TREE_VERSION } from "../vendor/quantCore.mjs";
import { vnDate } from "../calendar.js";

export const LEDGER_TABLE = "market_elliott_ledger";
export const LEDGER_KV_LAST = "elliott:ledger:lastRun";
const TERMINAL = new Set(["target2", "invalidated", "expired"]);

/** Kết quả cho chấm điểm: "hit" = đạt MT1 trước vô hiệu; "miss" = vô hiệu sau khi kích hoạt (chưa tới MT1); null = chưa kết thúc. */
export function outcomeOf(events) {
  const trig = events.findIndex((e) => e.type === "triggered");
  if (trig < 0) return null;
  for (const e of events.slice(trig + 1)) {
    if (e.type === "target1") return "hit";
    if (e.type === "invalidated") return "miss";
  }
  return null;
}

const toCandles = (bars) => bars.filter((b) => b.close > 0).map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));

export function createElliottLedger({ store, taSeries, now = () => new Date(), log = console, concurrency = 3 }) {
  async function universe() {
    const u = (await store.getKv("scanner:universe").catch(() => null))?.value?.tickers ?? [];
    return ["VNINDEX", ...u.map((t) => t.ticker).filter((t) => t !== "VNINDEX")];
  }

  /** Cập nhật một mã: ghi kịch bản mới + vòng đời kịch bản đang mở. */
  async function updateSymbol(symbol, today, open) {
    const s = await taSeries.get({ symbol, range: "5y", limit: 750 });
    const candles = toCandles(s?.bars ?? []);
    if (candles.length < 120) return { symbol, skipped: "thiếu nến" };
    // Góc nhìn ĐÃ XÁC NHẬN: bỏ chặng cuối đang chạy -> mọi điểm neo đã xác nhận (kịch bản không "tạm").
    const fresh = scenariosFromTree(buildWaveTree(candles, { confirmedOnly: true }), candles, symbol).filter((x) => !x.provisional && x.role !== "alternate");
    const rows = [];
    const known = new Set(open.map((r) => r.id));
    for (const sc of fresh) {
      if (known.has(sc.id)) continue;
      const existing = (await store.selectRows(LEDGER_TABLE, { eq: { id: sc.id }, limit: 1 }))[0];
      if (existing) continue; // đã từng ghi (kể cả đã kết thúc) -> không ghi lại
      rows.push({ id: sc.id, symbol, doc: { scenario: sc, loggedAt: today, engine: { tree: WAVE_TREE_VERSION, scenario: SCENARIO_ENGINE_VERSION },
        state: "waiting", events: [], triggerPrice: null, outcome: null, closedAt: null, updatedAt: today } });
    }
    for (const r of open) {
      // Chỉ nến SAU ngày ghi sổ (forward); kịch bản tồn tại từ createdAt ≤ loggedAt.
      const lc = evaluateLifecycle(r.doc.scenario, candles, r.doc.loggedAt);
      const outcome = outcomeOf(lc.events);
      rows.push({ ...r, doc: { ...r.doc, state: lc.state, events: lc.events, triggerPrice: lc.triggerPrice, outcome,
        closedAt: TERMINAL.has(lc.state) ? (lc.events[lc.events.length - 1]?.time ?? today) : null, updatedAt: today } });
    }
    if (rows.length) await store.upsertRows(LEDGER_TABLE, rows, "id");
    return { symbol, added: rows.length - open.length, updated: open.length };
  }

  async function run() {
    const today = vnDate(now());
    const all = await store.selectRows(LEDGER_TABLE, {});
    const openBy = new Map();
    for (const r of all) if (!TERMINAL.has(r.doc?.state)) openBy.set(r.symbol, [...(openBy.get(r.symbol) ?? []), r]);
    const syms = await universe();
    let added = 0, updated = 0, failed = 0, i = 0;
    const worker = async () => {
      while (i < syms.length) {
        const sym = syms[i++];
        try { const r = await updateSymbol(sym, today, openBy.get(sym) ?? []); added += r.added ?? 0; updated += r.updated ?? 0; }
        catch (e) { failed++; log.warn?.(`[elliott-ledger] ${sym}: ${e.message}`); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    const res = { date: today, symbols: syms.length, added, updated, failed };
    await store.setKv(LEDGER_KV_LAST, res).catch(() => {});
    return res;
  }

  async function summary() {
    const rows = (await store.selectRows(LEDGER_TABLE, {})).map((r) => r.doc).filter(Boolean);
    const byState = {}, byTemplate = {};
    for (const d of rows) {
      byState[d.state] = (byState[d.state] ?? 0) + 1;
      const t = d.scenario.template;
      byTemplate[t] ??= { logged: 0, triggered: 0, hit: 0, miss: 0 };
      byTemplate[t].logged++;
      if (d.triggerPrice != null) byTemplate[t].triggered++;
      if (d.outcome === "hit") byTemplate[t].hit++;
      if (d.outcome === "miss") byTemplate[t].miss++;
    }
    const score = scoreLedger(rows.map((d) => ({ triggerPrice: d.triggerPrice, target1: d.scenario.targets[0].price, invalidation: d.scenario.invalidation.price, outcome: d.outcome })));
    const firstLogged = rows.reduce((m, d) => (!m || d.loggedAt < m ? d.loggedAt : m), null);
    const last = (await store.getKv(LEDGER_KV_LAST).catch(() => null))?.value ?? null;
    return { total: rows.length, byState, byTemplate, score, prereg: EP2_PREREG, firstLogged, lastRun: last,
      verdict: score.n < EP2_PREREG.minN ? "chưa đủ mẫu" : score.pass ? "ĐẠT" : "KHÔNG ĐẠT" };
  }

  async function forSymbol(symbol) {
    const rows = await store.selectRows(LEDGER_TABLE, { eq: { symbol } });
    return rows.map((r) => r.doc).filter(Boolean).sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1)).slice(0, 50);
  }

  return { run, summary, forSymbol, updateSymbol };
}
