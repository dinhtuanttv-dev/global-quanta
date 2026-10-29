// "ELITE 10 · BỘ LỌC CỦA TÔI" (30/10/2026) — lưu bộ lọc theo tài khoản + sổ theo dõi TIẾN của danh mục dựng từ bộ lọc.
// Danh mục cá nhân dùng ĐÚNG thuật toán chính thức (constructPortfolio) trên tập mã đạt bộ lọc; KHÔNG đổi danh mục Elite 10 chính thức.
// Sổ cá nhân bắt đầu từ PHIÊN DỰNG KẾ TIẾP sau khi lưu (không hồi cứu -> không nhìn trước), chấm 5 / 10 phiên như sổ chính thức.
// Lưu khoá `local:` (chỉ Railway Volume).
import { evaluateEntry, LEDGER_HORIZONS, summarizeLedger, constructPortfolio } from "./decisionCore.js";
import { evaluateFilter, filterHash, sanitizeFilter } from "./filterEngine.js";

export const UF_KV = {
  index: "local:elite:user-filter:index",
  filter: (uid) => `local:elite:user-filter:${uid}`,
  ledger: (uid) => `local:elite:user-ledger:${uid}`,
};
const MAX_ENTRIES = 260;

export function createUserFilters({ store, now = Date.now }) {
  const kv = async (k) => { try { return (await store.getKv(k))?.value ?? null; } catch { return null; } };

  async function get(uid) {
    const doc = await kv(UF_KV.filter(uid));
    const ledger = await kv(UF_KV.ledger(uid));
    return { filter: doc?.filter ?? null, active: Boolean(doc?.active), savedAt: doc?.savedAt ?? null, hash: doc?.hash ?? null,
      ledger: ledger ? { startedAt: ledger.startedAt ?? null, summary: ledger.summary ?? null, entries: (ledger.entries ?? []).slice(-30) } : null };
  }

  async function save(uid, body, knownSignals) {
    const filter = sanitizeFilter(body?.filter ?? body, knownSignals);
    const active = body?.active !== false;
    const doc = { filter, active, hash: filterHash(filter), savedAt: new Date(now()).toISOString() };
    await store.setKv(UF_KV.filter(uid), doc);
    const idx = (await kv(UF_KV.index))?.users ?? [];
    if (!idx.includes(uid)) await store.setKv(UF_KV.index, { users: [...idx, uid].slice(-500) });
    return get(uid);
  }

  /** Danh mục từ bộ lọc trên bảng điểm phiên `doc` (cùng thuật toán chính thức). */
  function personal({ filter, panel, doc, prices, buyZone, prevHoldings = [] }) {
    const scoreBy = new Map(doc.scores.map((x) => [x.ticker, x]));
    const { pass, perCond } = evaluateFilter(filter, { rows: panel.rows, scores: scoreBy, buyZone });
    const passSet = new Set(pass);
    const { portfolio, construction } = constructPortfolio({ scores: doc.scores.filter((x) => passSet.has(x.ticker)), prices, date: doc.date, prevHoldings });
    return { pass, perCond, portfolio, construction };
  }

  /**
   * Gọi trong lần dựng quyết định hằng đêm (sau sổ chính thức): mỗi tài khoản có bộ lọc đang bật -> ghi danh mục phiên `doc.date`
   * (một lần / phiên) và chấm các bản ghi đủ kỳ hạn. `px`, `cal`, `vn` dùng chung với sổ chính thức.
   */
  async function updateLedgers({ panel, doc, prices, px, cal, vn, buyZone }) {
    const users = (await kv(UF_KV.index))?.users ?? [];
    const eligible = doc.scores.filter((x) => x.eligible).map((x) => x.ticker);
    let updated = 0;
    for (const uid of users) {
      const f = await kv(UF_KV.filter(uid));
      const ledger = (await kv(UF_KV.ledger(uid))) ?? { entries: [], startedAt: null };
      let changed = false;
      // Chỉ ghi khi bộ lọc được lưu TRƯỚC lần dựng phiên này (không hồi cứu -> không nhìn trước).
      if (f?.active && f.filter && !ledger.entries.some((e) => e.date === doc.date)) {
        if (!f.savedAt || Date.parse(f.savedAt) <= Date.parse(doc.builtAt ?? new Date(now()).toISOString())) {
          const prev = [...ledger.entries].filter((e) => e.date < doc.date).sort((a, b) => a.date.localeCompare(b.date)).pop();
          const r = personal({ filter: f.filter, panel, doc, prices, buyZone, prevHoldings: prev?.holdings ?? [] });
          ledger.entries.push({
            date: doc.date, hash: f.hash, passCount: r.pass.length,
            holdings: r.portfolio.map((x) => ({ ticker: x.ticker, weight: Math.round(x.weight * 1e4) / 1e4 })),
            universe: eligible, results: {},
          });
          ledger.startedAt ??= doc.date;
          changed = true;
        }
      }
      for (const e of ledger.entries) {
        for (const h of LEDGER_HORIZONS) {
          if (e.results?.[h] || !e.universe) continue;
          const res = evaluateEntry(e, h, px, cal, vn);
          if (res) { (e.results ??= {})[h] = res; changed = true; }
        }
        if (e.universe && LEDGER_HORIZONS.every((h) => e.results?.[h])) { e.universeSize = e.universe.length; delete e.universe; changed = true; }
      }
      if (changed) {
        ledger.entries = ledger.entries.slice(-MAX_ENTRIES);
        ledger.summary = summarizeLedger(ledger.entries);
        ledger.updatedAt = new Date(now()).toISOString();
        await store.setKv(UF_KV.ledger(uid), ledger);
        updated++;
      }
    }
    return { users: users.length, updated };
  }

  return { get, save, personal, updateLedgers };
}
