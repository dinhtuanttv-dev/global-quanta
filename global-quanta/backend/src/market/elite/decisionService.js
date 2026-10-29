// Elite 10 E3 (2026-10-17) — dịch vụ quyết định: Điểm Elite + danh mục Elite 10 mỗi phiên (E3-prereg.md) và SỔ THEO DÕI TIẾN.
// Danh mục được khoá lúc dựng (sau bảng E1 + bằng chứng E2 của phiên d) và không sửa; kết quả chấm khi đủ d+1+h phiên.
// Một lần đọc giá mỗi ngày (khoảng 95 phiên × vũ trụ, chỉ cột symbol/ngày/close_adj/value) phục vụ cả dựng lẫn chấm sổ.
import { buildCandidates, buildDecision, E3_VERSION, evaluateEntry, LEDGER_HORIZONS, summarizeLedger } from "./decisionCore.js";
import { noteStoreError } from "./storeHealth.js";

export const DECISION_KV = { index: "elite:decision:index", decision: (d) => `elite:decision:${d}`, ledger: "elite:ledger" };
const CAL_SYMBOLS = ["VNM", "FPT", "HPG", "VCB", "MWG"];
const PRICE_DAYS = 140;
const isoMinusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/**
 * @param {{ store: any, panel: { panel: (d?: string|null) => Promise<any> }, evidence: { evidence: () => Promise<any> },
 *   vnIndex: () => Promise<[string, number][]>, now?: () => number, log?: any }} deps
 */
export function createDecisionService({ store, panel, evidence, vnIndex, now = Date.now, log = console }) {
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
      let ledger = (await kv(DECISION_KV.ledger)) ?? { version: E3_VERSION, entries: [] };
      // Đổi phiên bản E3 (sửa đổi đăng ký trước): lưu trữ sổ cũ nguyên vẹn, sổ mới bắt đầu lại; quyết định phiên hiện tại dựng lại.
      let versionChanged = false;
      if (ledger.version !== E3_VERSION) {
        await store.setKv(`elite:ledger:archive:${String(ledger.version).split(" ")[0]}`, { ...ledger, archivedAt: new Date(now()).toISOString() });
        ledger = { version: E3_VERSION, entries: [], previous: ledger.version };
        versionChanged = true;
      }
      const exists = index.includes(p.date) && !force && !versionChanged;
      const pendingEntries = ledger.entries.filter((e) => e.universe && LEDGER_HORIZONS.some((h) => !e.results?.[h]));
      if (exists && !pendingEntries.length) { memo ??= await kv(DECISION_KV.decision(p.date)); return memo; }

      const ev = await evidence.evidence();
      if (!ev) throw new Error("Chưa có kết quả engine bằng chứng E2.");
      const symbols = [...new Set([...p.rows.map((r) => r.ticker), ...CAL_SYMBOLS, ...pendingEntries.flatMap((e) => e.universe)])];
      const prices = await loadPrices(symbols, p.date);
      const cal = [...new Set(CAL_SYMBOLS.flatMap((s) => (prices.get(s) ?? []).map((r) => r.date)))].sort();

      let doc = exists ? await kv(DECISION_KV.decision(p.date)) : null;
      if (!doc) {
        // E3-v3: vùng đệm giữ mã — danh mục đã khoá của phiên liền trước trong sổ cùng phiên bản.
        const prev = [...ledger.entries].filter((e) => e.date < p.date).sort((x, y) => x.date.localeCompare(y.date)).pop();
        doc = { ...buildDecision({ panel: p, evidence: ev, prices, cal, prevHoldings: prev?.holdings ?? [] }), builtAt: new Date(now()).toISOString(), evidenceVersion: ev.version, panelVersion: p.version };
        await store.setKv(DECISION_KV.decision(p.date), doc);
        await store.setKv(DECISION_KV.index, { dates: [...new Set([...index, p.date])].sort().slice(-400) });
        if (!ledger.entries.some((e) => e.date === p.date)) {
          const eligible = doc.scores.filter((x) => x.eligible);
          ledger.entries.push({
            date: p.date, lockedAt: doc.builtAt,
            holdings: doc.portfolio.map((x) => ({ ticker: x.ticker, weight: Math.round(x.weight * 1e4) / 1e4 })),
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
      for (const e of ledger.entries) {
        for (const h of LEDGER_HORIZONS) {
          if (e.results?.[h]) continue;
          const r = evaluateEntry(e, h, px, cal, vn);
          if (r) (e.results ??= {})[h] = r;
        }
        if (LEDGER_HORIZONS.every((h) => e.results?.[h]) && e.universe) { // đã chấm đủ -> bỏ Z và danh sách vũ trụ để sổ gọn
          e.universeSize = e.universe.length;
          delete e.z;
          delete e.universe;
        }
      }
      ledger.version = E3_VERSION;
      ledger.summary = summarizeLedger(ledger.entries);
      ledger.updatedAt = new Date(now()).toISOString();
      await store.setKv(DECISION_KV.ledger, ledger);
      memo = { ...doc, ledgerSummary: ledger.summary };
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
      const ledger = await kv(DECISION_KV.ledger);
      memo = { ...doc, candidates: buildCandidates(doc), ledgerSummary: ledger?.summary ?? null };
      return memo;
    }
    return doc ? { ...doc, candidates: buildCandidates(doc) } : doc;
  }

  async function ledger() {
    const l = await kv(DECISION_KV.ledger);
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
    const docs = (await Promise.all(idx.slice(-n).map((d) => kv(DECISION_KV.decision(d))))).filter((d) => d?.portfolio);
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

  return { build, decision, ledger, rankHistory };
}

/** N5: mã danh mục Elite 10 của phiên quyết định gần nhất (đọc thẳng KV, không dựng lại) — cho job nạp sẵn nến phút trước giờ mở cửa. */
export async function eliteWarmTickers(store, limit = 12) {
  const idx = (await store.getKv(DECISION_KV.index).catch(() => null))?.value?.dates ?? [];
  const d = idx[idx.length - 1];
  const doc = d ? (await store.getKv(DECISION_KV.decision(d)).catch(() => null))?.value : null;
  return [...new Set((doc?.portfolio ?? []).map((p) => String(p.ticker ?? "").toUpperCase()).filter((t) => /^[A-Z][A-Z0-9]{2}$/.test(t)))].slice(0, limit);
}
