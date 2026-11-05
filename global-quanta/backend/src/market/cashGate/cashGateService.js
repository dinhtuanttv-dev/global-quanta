// CG-r1 (05/11/2026) — trạng thái Cổng tiền mặt mỗi phiên + kết quả kiểm định đăng ký trước + sổ tiến bóng.
// Kiểm định KHÔNG ĐẠT (cg-r1-report.json) -> tỷ lệ cổ phiếu chính thức của Elite 10 giữ 100%; trạng thái cổng chỉ để MÔ TẢ.
// Sổ tiến bóng: mỗi phiên đã đóng ghi một lần trạng thái và tỷ lệ của cả 4 quy tắc (KV chỉ-cục-bộ, không sửa về sau).
import fs from "node:fs";
import { alignPrev, CG, CG_VERSION, RULES, targets } from "./cashGateCore.js";

export const CASH_GATE_LEDGER_KV = "local:elite:cash-gate:ledger";
const TTL_MS = 30 * 60_000;

function loadReport() {
  try { return JSON.parse(fs.readFileSync(new URL("./cg-r1-report.json", import.meta.url), "utf8")); } catch { return null; }
}

/** Gọn kết quả kiểm định cho giao diện. */
export function holdoutSummary(report) {
  if (!report) return null;
  const pick = (m) => ({ cagr: m.cagr, mdd: m.mdd, sharpe: m.sharpe });
  return {
    version: report.version, ranAt: report.ranAt, prereg: report.prereg, period: report.main.period, summaryVi: report.summaryVi,
    base: pick(report.main.base),
    rules: Object.fromEntries(RULES.map((id) => [id, { ...pick(report.main.rules[id]), deltaSharpe: report.main.rules[id].deltaSharpe, pHolm: report.verdict[id].pHolm, pctReduced: report.main.rules[id].pctReduced, episodes: report.main.rules[id].episodes, criteria: { C1: report.verdict[id].C1, C2: report.verdict[id].C2, C3: report.verdict[id].C3, C4: report.verdict[id].C4 }, pass: report.verdict[id].pass }])),
    passed: RULES.filter((id) => report.verdict[id].pass),
  };
}

/** Trạng thái tại phiên đã đóng cuối cùng của chuỗi VN-Index. */
export function gateState({ dates, closes, vix, vix3m }) {
  const v = alignPrev(dates, vix), v3 = alignPrev(dates, vix3m);
  const t = targets({ closes, vix: v, vix3m: v3 });
  const i = dates.length - 1;
  const hist = t.vol.slice(Math.max(0, i - CG.volWindow + 1), i + 1).filter((x) => x != null).sort((a, b) => a - b);
  const volTarget = hist.length ? hist[hist.length >> 1] : null;
  return {
    asOf: dates[i],
    inputs: {
      regime: t.regime[i], vix: v[i], vix3m: v3[i], volSlope: v[i] != null && v3[i] > 0 ? v[i] / v3[i] - 1 : null,
      volAnnual: t.vol[i] != null ? t.vol[i] * Math.sqrt(252) : null, volTargetAnnual: volTarget != null ? volTarget * Math.sqrt(252) : null,
    },
    rules: Object.fromEntries(RULES.map((id) => [id, { target: t[id][i], active: t[id][i] < 1 }])),
  };
}

async function yahooSeries(fetchImpl, symbol) {
  const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const j = (await r.json())?.chart?.result?.[0];
  return (j?.timestamp ?? []).map((ts, k) => [new Date(ts * 1000).toISOString().slice(0, 10), j.indicators.quote[0].close[k]]).filter(([, c]) => c > 0);
}

export function createCashGateService({ store, vnIndexBars, fetchImpl = fetch, now = Date.now, report = loadReport() }) {
  let memo = null;
  const holdout = holdoutSummary(report);

  async function ledger() {
    try { return (await store.getKv(CASH_GATE_LEDGER_KV))?.value ?? { version: CG_VERSION, entries: [] }; } catch { return { version: CG_VERSION, entries: [] }; }
  }

  /** Ghi phiên đã đóng mới nhất vào sổ bóng (một lần mỗi phiên, không sửa). */
  async function record(state) {
    const l = await ledger();
    if (l.entries.some((e) => e.date === state.asOf)) return false;
    l.entries.push({ date: state.asOf, recordedAt: new Date(now()).toISOString(), regime: state.inputs.regime, vix: state.inputs.vix, vix3m: state.inputs.vix3m, targets: Object.fromEntries(RULES.map((id) => [id, state.rules[id].target])) });
    l.entries.sort((a, b) => a.date.localeCompare(b.date));
    await store.setKv(CASH_GATE_LEDGER_KV, l);
    return true;
  }

  async function status({ refresh = false, recordLedger = false } = {}) {
    if (!refresh && memo && now() - memo.at < TTL_MS) return memo.doc;
    const bars = await vnIndexBars();
    const dates = bars.map((b) => b.date), closes = bars.map((b) => b.close);
    const [vix, vix3m] = await Promise.all([yahooSeries(fetchImpl, "^VIX"), yahooSeries(fetchImpl, "^VIX3M")]);
    const state = gateState({ dates, closes, vix, vix3m });
    if (recordLedger) await record(state);
    const l = await ledger();
    const doc = {
      version: CG_VERSION, generatedAt: new Date(now()).toISOString(), ...state,
      official: {
        equityShare: 1,
        reasonVi: holdout?.passed?.length
          ? `Quy tắc ${holdout.passed.join(", ")} đạt kiểm định đăng ký trước; đưa vào danh mục chính thức cần phiên bản E3 mới do người dùng quyết định.`
          : "100%: Cổng tiền mặt KHÔNG ĐẠT kiểm định đăng ký trước CG-r1, nên chưa đề xuất tỷ lệ tiền mặt. Trạng thái cổng bên dưới chỉ để mô tả.",
      },
      holdout,
      ledger: { entries: l.entries.length, first: l.entries[0]?.date ?? null, last: l.entries.at(-1)?.date ?? null },
    };
    memo = { at: now(), doc };
    return doc;
  }

  return { status, record, ledger };
}
