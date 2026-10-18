// Elite 10 E1 (2026-10-17) — dịch vụ BẢNG TÍN HIỆU: gom kết quả các tab sau phiên, chuẩn hoá qua signalRegistry và lưu KV theo
// ngày (point-in-time: bản ghi phiên d chỉ chứa dữ liệu có sẵn lúc dựng, không sửa về sau). Đây là đầu vào của engine bằng chứng
// (E2) và engine quyết định (E3).
//
// Lịch: sau chuỗi job cuối phiên của Gateway (đồng bộ giá 15:20 → Siêu quét 15:40 → bộ lọc 15:45 → nghiên cứu 16:00–16:40),
// server.js kiểm tra 10 phút/lần và dựng bảng cho phiên vừa đóng từ 17:00 giờ VN (khởi động lại giữa chừng vẫn dựng bù).
// Nguồn Project A (Chất xúc tác, Cổ tức) qua route công khai có giới hạn thời gian — lỗi thì cột tương ứng = null và ghi rõ.
import { KV as SCANNER_KV } from "../scanner/scannerJobs.js";
import { ALPHA_KV } from "../alpha/alphaService.js";
import { strategyKvKey } from "../strategies/technicalFilters.js";
import { T as RESEARCH_T } from "../research/researchJobs.js";
import { buildSignalRows, ELITE_PANEL_VERSION, SIGNAL_SPECS } from "./signalRegistry.js";
import { noteStoreError } from "./storeHealth.js";

export const ELITE_KV = {
  index: "elite:panel:index",
  panel: (date) => `elite:panel:${date}`,
};
const KEEP_DAYS = 400;
const PANEL_STRATEGIES = ["sepa", "patterns", "convergence", "base-breakout"];

async function getJson(fetchImpl, url, timeoutMs) {
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ store: any, wsStrategy: () => Promise<any>, rrgDoc: () => Promise<any>, taxonomy: () => Promise<any>,
 *   fetchImpl?: typeof fetch, projectABase?: string, now?: () => number, log?: { warn: Function } }} deps
 */
export function createElitePanelService({ store, wsStrategy, rrgDoc, taxonomy, fetchImpl = globalThis.fetch, projectABase, now = Date.now, log = console }) {
  const base = (projectABase ?? process.env.LEGACY_MARKET_API_BASE ?? "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, "");
  let memo = null; // { date, doc }
  let building = null;

  const kv = async (key) => {
    try { return (await store.getKv(key))?.value ?? null; } catch (e) { noteStoreError(e); return null; }
  };

  async function latestFeatures(date) {
    if (!date) return null;
    try {
      const rows = await store.selectRows(RESEARCH_T.flow, { select: "symbol,trading_date,features", eq: { trading_date: date } });
      if (!rows?.length) return null;
      return new Map(rows.filter((r) => r.features).map((r) => [String(r.symbol).toUpperCase(), r.features]));
    } catch (e) {
      log.warn?.(`[elite] features: ${e.message}`);
      return null;
    }
  }

  async function gather(scannerDoc) {
    const scanner = scannerDoc === undefined ? await kv(SCANNER_KV.latest) : scannerDoc;
    const date = scanner?.dataAsOf ?? null;
    const [features, top20, rrg, tax, ws, catalyst, cotuc, ...strats] = await Promise.all([
      latestFeatures(date),
      kv(ALPHA_KV.top20),
      rrgDoc().catch(() => null),
      taxonomy().catch(() => null),
      wsStrategy().catch((e) => { log.warn?.(`[elite] worldStrategy: ${e.message}`); return null; }),
      getJson(fetchImpl, `${base}/api/catalysts/latest`, 20_000),
      getJson(fetchImpl, `${base}/api/cotuc/decision-states`, 20_000),
      ...PANEL_STRATEGIES.map((id) => kv(strategyKvKey(id))),
    ]);
    const strategies = Object.fromEntries(PANEL_STRATEGIES.map((id, i) => [id, strats[i]]));
    return {
      date,
      src: { scanner, features, top20, strategies, wsStrategy: ws, rrg, taxonomy: tax, catalyst, cotuc },
      asOf: {
        scanner: date, top20: top20?.dataAsOf ?? null, wsStrategy: ws?.vnLast ?? null, rrg: rrg?.dataAsOf ?? null,
        catalyst: catalyst?.scannedAt ?? null, catalystStale: catalyst?.isStale ?? null, cotuc: cotuc?.asOf ?? null,
        strategies: Object.fromEntries(PANEL_STRATEGIES.map((id, i) => [id, strats[i]?.dataAsOf ?? null])),
      },
    };
  }

  async function readIndex() {
    const v = await kv(ELITE_KV.index);
    return Array.isArray(v?.dates) ? v.dates : [];
  }

  /** Dựng & lưu bảng cho phiên mới nhất của Siêu quét. Đã có bản cho phiên đó thì giữ nguyên (point-in-time) trừ khi force. */
  async function build({ force = false } = {}) {
    if (building) return building;
    building = (async () => {
      // Ngày phiên lấy từ Siêu quét TRƯỚC: đã có bảng cho phiên đó thì không đọc các nguồn còn lại (tiết kiệm egress).
      const scanner = await kv(SCANNER_KV.latest);
      const date = scanner?.dataAsOf ?? null;
      if (!date) throw new Error("Siêu quét chưa có kết quả — chưa dựng được bảng tín hiệu.");
      const dates = await readIndex();
      if (!force && dates.includes(date)) {
        const existing = memo?.date === date ? memo.doc : await kv(ELITE_KV.panel(date));
        if (existing) { memo = { date, doc: existing }; return existing; }
      }
      const g = await gather(scanner);
      const { rows, coverage, missingSources } = buildSignalRows(g.src);
      const doc = {
        version: ELITE_PANEL_VERSION, date: g.date, builtAt: new Date(now()).toISOString(), asOf: g.asOf,
        universe: rows.length, coverage, missingSources,
        signals: SIGNAL_SPECS.map(({ id, tab, labelVi, unit, level, tier }) => ({ id, tab, labelVi, unit, level, tier })),
        rows,
      };
      await store.setKv(ELITE_KV.panel(g.date), doc);
      const next = [...new Set([...dates, g.date])].sort().slice(-KEEP_DAYS);
      await store.setKv(ELITE_KV.index, { dates: next, updatedAt: doc.builtAt });
      memo = { date: g.date, doc };
      return doc;
    })().finally(() => { building = null; });
    return building;
  }

  /** Bảng của một phiên (mặc định phiên mới nhất đã dựng). */
  async function panel(date = null) {
    if (!date && memo) return memo.doc;
    const dates = await readIndex();
    const d = date ?? dates[dates.length - 1];
    if (!d) return null;
    if (memo?.date === d) return memo.doc;
    const doc = await kv(ELITE_KV.panel(d));
    if (doc && !date) memo = { date: d, doc };
    return doc;
  }

  return { build, panel, dates: readIndex, gather };
}

/** Giờ VN ≥ 17:00 của một ngày giao dịch thì bảng phiên đó đến hạn dựng. */
export function panelDue(nowMs, isTradingDay) {
  const vn = new Date(nowMs + 7 * 3_600_000);
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  return isTradingDay(new Date(nowMs)) && minutes >= 17 * 60;
}
