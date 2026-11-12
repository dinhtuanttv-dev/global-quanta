// Elite 10 E3 (2026-10-17) — dịch vụ quyết định: Điểm Elite + danh mục Elite 10 mỗi phiên (E3-prereg.md) và SỔ THEO DÕI TIẾN.
// Danh mục được khoá lúc dựng (sau bảng E1 + bằng chứng E2 của phiên d) và không sửa; kết quả chấm khi đủ d+1+h phiên.
// Một lần đọc giá mỗi ngày (khoảng 95 phiên × vũ trụ, chỉ cột symbol/ngày/close_adj/value) phục vụ cả dựng lẫn chấm sổ.
import { buildCandidates, buildDecision, E3_V5, E3_VERSION, evaluateEntry, LEDGER_HORIZONS, summarizeLedger } from "./decisionCore.js";
import { realisticEntry, summarizeRealistic, VN_EXEC } from "./executionVN.js";
import { noteStoreError } from "./storeHealth.js";
import { buildHlPortfolio, hlTradable, HL_PF_VERSION, isRebalanceSession } from "./eliteHl.js";
import { REGIME_VI } from "./leadership.js";

export const DECISION_KV = { index: "elite:decision:index", decision: (d) => `elite:decision:${d}`, ledger: "elite:ledger", flowLedger: "elite:ledger:flow" };
// E4-HL: sổ chính thức chấm cả danh mục chưa đủ 10 mã (phần còn lại là tiền mặt) — chỉ cần ≥ 1 vị thế có giá.
const HL_MIN_WEIGHT = 0.04;
const CAL_SYMBOLS = ["VNM", "FPT", "HPG", "VCB", "MWG"];
const PRICE_DAYS = 140;
const isoMinusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/**
 * @param {{ store: any, panel: { panel: (d?: string|null) => Promise<any> }, evidence: { evidence: () => Promise<any> },
 *   vnIndex: () => Promise<[string, number][]>, now?: () => number, log?: any }} deps
 */
/** "Ứng viên tiếp theo" (C1) phát lại thuật toán E3 — với tài liệu E4-HL phải dùng danh mục dòng tiền, không phải danh mục HL. */
const flowView = (doc) => (doc?.flowPortfolio ? { ...doc, portfolio: doc.flowPortfolio } : doc);

export function createDecisionService({ store, panel, evidence, vnIndex, now = Date.now, log = console, userFilters = null, buyZone = null, leadership = null }) {
  let memo = null;
  let building = null;
  const kv = async (key) => { try { return (await store.getKv(key))?.value ?? null; } catch (e) { noteStoreError(e); return null; } };

  async function loadPrices(symbols, to) {
    const rows = await store.getMarketDailyRange({ from: isoMinusDays(to, PRICE_DAYS), to, symbols, columns: "symbol,trading_date,close_adj,value" });
    const prices = new Map();
    for (const r of rows) {
      if (!(r.closeAdj > 0)) continue;
      if (!prices.has(r.symbol)) prices.set(r.symbol, []);
      prices.get(r.symbol).push({ date: r.date, closeAdj: r.closeAdj, value: r.value ?? null });
    }
    for (const list of prices.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return prices;
  }

  /** Dựng quyết định cho phiên mới nhất của bảng E1 (đã có thì giữ nguyên — danh mục đã khoá) và chấm sổ theo dõi. */
  async function build({ force = false } = {}) {
    if (building) return building;
    building = (async () => {
      const p = await panel.panel();
      if (!p) throw new Error("Chưa có bảng tín hiệu E1.");
      const index = (await kv(DECISION_KV.index))?.dates ?? [];
      // LS-r1: E3-v5 (có điểm dẫn dắt) chỉ khi cổng H4 ĐẠT — bằng chứng E2 mang cờ gateLive.
      const ev0 = await evidence.evidence();
      const FLOW_VER = ev0?.signals?.some((x) => x.id === "ls_v1" && x.gateLive) ? E3_V5 : E3_VERSION;
      // E4-HL (12/11/2026): danh mục chính thức = Elite HL; danh mục E3 "dòng tiền" dựng song song (flowPortfolio) với sổ riêng tiếp nối sổ cũ.
      const VER = HL_PF_VERSION;
      let ledger = (await kv(DECISION_KV.ledger)) ?? { version: VER, entries: [] };
      let flow = await kv(DECISION_KV.flowLedger);
      if (!flow) flow = ledger.version !== VER ? JSON.parse(JSON.stringify(ledger)) : { version: FLOW_VER, entries: [] };
      // Đổi phiên bản E3 (sửa đổi đăng ký trước): lưu trữ sổ cũ nguyên vẹn, sổ mới bắt đầu lại; quyết định phiên hiện tại dựng lại.
      let versionChanged = false;
      if (ledger.version !== VER) {
        await store.setKv(`elite:ledger:archive:${String(ledger.version).split(" ")[0]}`, { ...ledger, archivedAt: new Date(now()).toISOString() });
        ledger = { version: VER, entries: [], previous: ledger.version };
        versionChanged = true;
      }
      const exists = index.includes(p.date) && !force && !versionChanged;
      const pendingEntries = [...ledger.entries, ...flow.entries].filter((e) => e.universe && LEDGER_HORIZONS.some((h) => !e.results?.[h]));
      if (exists && !pendingEntries.length) { memo ??= await kv(DECISION_KV.decision(p.date)); return memo; }

      const ev = ev0;
      if (!ev) throw new Error("Chưa có kết quả engine bằng chứng E2.");
      const symbols = [...new Set([...p.rows.map((r) => r.ticker), ...CAL_SYMBOLS, ...pendingEntries.flatMap((e) => e.universe)])];
      const prices = await loadPrices(symbols, p.date);
      const cal = [...new Set(CAL_SYMBOLS.flatMap((s) => (prices.get(s) ?? []).map((r) => r.date)))].sort();

      let doc = exists ? await kv(DECISION_KV.decision(p.date)) : null;
      if (!doc) {
        // E3-v3: vùng đệm giữ mã — danh mục đã khoá của phiên liền trước trong sổ cùng phiên bản.
        const lastBefore = (L) => [...L.entries].filter((e) => e.date < p.date).sort((x, y) => x.date.localeCompare(y.date)).pop();
        const flowPrev = lastBefore(flow), hlPrev = lastBefore(ledger);
        const base = buildDecision({ panel: p, evidence: ev, prices, cal, prevHoldings: flowPrev?.holdings ?? [], version: FLOW_VER });
        const H = buildHlPortfolio({ panelRows: p.rows, scores: base.scores, prev: hlPrev?.holdings ?? [], rebalance: isRebalanceSession(p.date, hlPrev?.date ?? null), date: p.date });
        let market = null;
        if (leadership) { try { const lv = await leadership.live(p.date); market = { regime: lv.regime, regimeVi: REGIME_VI[lv.regime] ?? null, bias: lv.bias, breadth: lv.breadth, guard: lv.guard }; } catch (e) { log.warn?.(`[elite] trạng thái thị trường LS: ${e.message}`); } }
        doc = {
          ...base, version: VER, flowVersion: FLOW_VER, flowPortfolio: base.portfolio, flowConstruction: base.construction,
          portfolio: H.portfolio, construction: { method: "hl-g2r", sessions: null, retained: H.hl.changes.kept, previous: hlPrev?.holdings?.length ?? 0, turnover: hlPrev ? H.hl.changes.turnover : null },
          hl: { ...H.hl, market, prevDate: hlPrev?.date ?? null },
          builtAt: new Date(now()).toISOString(), evidenceVersion: ev.version, panelVersion: p.version,
        };
        await store.setKv(DECISION_KV.decision(p.date), doc);
        await store.setKv(DECISION_KV.index, { dates: [...new Set([...index, p.date])].sort().slice(-400) });
        if (!ledger.entries.some((e) => e.date === p.date)) {
          // Sổ chính thức (Elite HL): vũ trụ so sánh = mã giao dịch được theo ngưỡng HL; danh mục rỗng (toàn tiền mặt) không cần chấm.
          const uni = doc.scores.filter((x) => !hlTradable(x)).map((x) => x.ticker);
          ledger.entries.push({
            date: p.date, lockedAt: doc.builtAt, cash: doc.hl.cash, rebalance: doc.hl.rebalance,
            holdings: doc.portfolio.map((x) => ({ ticker: x.ticker, weight: x.weight, since: x.hl.since })),
            ...(doc.portfolio.length ? { universe: uni } : { universeSize: uni.length, empty: true }), results: {},
          });
        }
        if (!flow.entries.some((e) => e.date === p.date)) {
          const eligible = doc.scores.filter((x) => x.eligible);
          flow.entries.push({
            date: p.date, lockedAt: doc.builtAt,
            holdings: doc.flowPortfolio.map((x) => ({ ticker: x.ticker, weight: Math.round(x.weight * 1e4) / 1e4 })),
            universe: eligible.map((x) => x.ticker),
            z: Object.fromEntries(eligible.map((x) => [x.ticker, Math.round(x.Z * 1e4) / 1e4])),
            results: {},
          });
        }
      }

      // Chấm sổ theo dõi: mọi bản ghi đủ kỳ hạn mà chưa chấm (giá d+1 và d+1+h đều đã có).
      const px = new Map();
      for (const [t, list] of prices) for (const r of list) px.set(`${t}|${r.date}`, r.closeAdj);
      let vn = new Map();
      try { vn = new Map(await vnIndex()); } catch (e) { log.warn?.(`[elite] vnIndex: ${e.message}`); }
      // R3: chấm thực tế kiểu Việt Nam (mô tả, song song) — sàn niêm yết theo universe Siêu Quét; thiếu -> HOSE.
      const uni = await kv("scanner:universe");
      const exch = new Map((uni?.tickers ?? []).map((x) => [x.ticker, x.exchange]));
      const exchangeOf = (t) => exch.get(t) ?? "HOSE";
      for (const [e, minW] of [...ledger.entries.map((x) => [x, HL_MIN_WEIGHT]), ...flow.entries.map((x) => [x, 0.5])]) {
        for (const h of LEDGER_HORIZONS) {
          if (!e.results?.[h] && e.universe) {
            const r = evaluateEntry(e, h, px, cal, vn, minW);
            if (r) (e.results ??= {})[h] = r;
          }
          const res = e.results?.[h];
          if (res && !res.realistic) {
            const real = {};
            for (const aum of VN_EXEC.aums) { const x = realisticEntry(e, h, aum, { series: prices, cal, exchangeOf, universeNet: res.universeNet }); if (x) real[String(aum)] = x; }
            if (Object.keys(real).length) res.realistic = real;
          }
        }
        if (LEDGER_HORIZONS.every((h) => e.results?.[h]) && e.universe) { // đã chấm đủ -> bỏ Z và danh sách vũ trụ để sổ gọn
          e.universeSize = e.universe.length;
          delete e.z;
          delete e.universe;
        }
      }
      // "Elite 10 · bộ lọc của tôi": sổ theo dõi tiến theo tài khoản (cùng giá / lịch / VN-Index với sổ chính thức).
      if (userFilters) {
        try { await userFilters.updateLedgers({ panel: p, doc, prices, px, cal, vn, buyZone: (await buyZone?.().catch(() => null)) ?? new Set() }); }
        catch (e) { log.warn?.(`[elite] sổ bộ lọc cá nhân: ${e.message}`); }
      }
      ledger.version = VER;
      ledger.summary = { ...summarizeLedger(ledger.entries), realistic: summarizeRealistic(ledger.entries) };
      ledger.updatedAt = new Date(now()).toISOString();
      await store.setKv(DECISION_KV.ledger, ledger);
      flow.version = FLOW_VER;
      flow.summary = { ...summarizeLedger(flow.entries), realistic: summarizeRealistic(flow.entries) };
      flow.updatedAt = ledger.updatedAt;
      await store.setKv(DECISION_KV.flowLedger, flow);
      memo = { ...doc, candidates: buildCandidates(flowView(doc)), ledgerSummary: ledger.summary, flowLedgerSummary: flow.summary };
      return memo;
    })().finally(() => { building = null; });
    return building;
  }

  async function decision(date = null) {
    if (!date && memo) return memo;
    const idx = (await kv(DECISION_KV.index))?.dates ?? [];
    const d = date ?? idx[idx.length - 1];
    if (!d) return null;
    const doc = await kv(DECISION_KV.decision(d));
    // C1: ứng viên tính khi trả (phát lại thuật toán trên tài liệu đã lưu) — đúng cả cho phiên đã dựng trước khi có tính năng này.
    if (doc && !date) {
      const [ledger, flow] = await Promise.all([kv(DECISION_KV.ledger), kv(DECISION_KV.flowLedger)]);
      memo = { ...doc, candidates: buildCandidates(flowView(doc)), ledgerSummary: ledger?.summary ?? null, flowLedgerSummary: flow?.summary ?? null };
      return memo;
    }
    return doc ? { ...doc, candidates: buildCandidates(flowView(doc)) } : doc;
  }

  async function ledger(book = null) {
    const l = await kv(book === "flow" ? DECISION_KV.flowLedger : DECISION_KV.ledger);
    if (!l) return null;
    return { version: l.version, updatedAt: l.updatedAt, summary: l.summary, entries: l.entries.map(({ z, universe, ...rest }) => ({ ...rest, universeSize: rest.universeSize ?? universe?.length ?? null })) };
  }

  // Radar danh mục Elite 10 (30/10/2026): lịch sử hạng GỌN của N phiên gần nhất — danh mục + hạng / Z toàn vũ trụ của mọi mã từng vào
  // danh mục trong cửa sổ (để vẽ vệt hạng / Z, mũi tên lên-xuống hạng, sự kiện vào-ra, tua lại). ~2 KB/phiên thay vì ~170 KB tài liệu đủ.
  let rhMemo = null;
  async function rankHistory(days = 6) {
    const n = Math.max(2, Math.min(15, Math.round(Number(days) || 6)));
    const idx = (await kv(DECISION_KV.index))?.dates ?? [];
    const key = `${idx[idx.length - 1] ?? ""}|${n}`;
    if (rhMemo?.key === key) return rhMemo.value;
    // E4-HL: radar hạng / Z thuộc về danh mục dòng tiền (xếp theo Z) -> dùng flowPortfolio khi tài liệu là bản E4-HL.
    const docs = (await Promise.all(idx.slice(-n).map((d) => kv(DECISION_KV.decision(d))))).filter((d) => d?.portfolio).map((d) => (d.flowPortfolio ? { ...d, portfolio: d.flowPortfolio } : d));
    const tickers = new Set(docs.flatMap((d) => d.portfolio.map((p) => p.ticker)));
    const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    const value = {
      dates: docs.map((d) => d.date),
      sessions: docs.map((d) => ({
        date: d.date,
        portfolio: d.portfolio.map((p) => ({ ticker: p.ticker, rank: p.rank ?? null, Z: r3(p.Z), weight: r3(p.weight), retained: Boolean(p.retained) })),
        ranks: Object.fromEntries((d.scores ?? []).filter((x) => tickers.has(x.ticker)).map((x) => [x.ticker, { rank: x.rank ?? null, Z: r3(x.Z) }])),
      })),
    };
    rhMemo = { key, value };
    return value;
  }

  /** Danh mục từ bộ lọc của một tài khoản trên phiên quyết định mới nhất (tính khi được hỏi; không ghi sổ). */
  async function personalPortfolio(filter, prevHoldings = []) {
    if (!userFilters) return null;
    const p = await panel.panel();
    const doc = await decision();
    if (!p || !doc) return null;
    const zone = (await buyZone?.().catch(() => null)) ?? new Set();
    const pre = userFilters.personal({ filter, panel: p, doc, prices: new Map(), buyZone: zone });
    const prices = await loadPrices([...new Set([...pre.pass, ...CAL_SYMBOLS])], doc.date);
    return { date: doc.date, ...userFilters.personal({ filter, panel: p, doc, prices, buyZone: zone, prevHoldings }) };
  }

  return { build, decision, ledger, rankHistory, personalPortfolio };
}

/** N5: mã danh mục Elite 10 của phiên quyết định gần nhất (đọc thẳng KV, không dựng lại) — cho job nạp sẵn nến phút trước giờ mở cửa. */
export async function eliteWarmTickers(store, limit = 12) {
  const idx = (await store.getKv(DECISION_KV.index).catch(() => null))?.value?.dates ?? [];
  const d = idx[idx.length - 1];
  const doc = d ? (await store.getKv(DECISION_KV.decision(d)).catch(() => null))?.value : null;
  return [...new Set((doc?.portfolio ?? []).map((p) => String(p.ticker ?? "").toUpperCase()).filter((t) => /^[A-Z][A-Z0-9]{2}$/.test(t)))].slice(0, limit);
}
