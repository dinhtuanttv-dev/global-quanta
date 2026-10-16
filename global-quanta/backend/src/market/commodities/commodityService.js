// Dịch vụ hàng hoá của Gateway (C1): một nguồn cho mỗi mặt hàng (catalog.js), mỗi con số kèm kỳ/ngày + nguồn.
// Yahoo (ngày): bộ nhớ đệm theo (mã, khoảng). Pink Sheet (tháng): KV `commodities:pinksheet`, làm mới tối đa 12 giờ/lần,
// lỗi nguồn -> giữ bản cũ (ghi rõ thời điểm lấy).
import { parseQuote } from "../world/worldPulse.js";
import { COMMODITIES } from "./catalog.js";
import { fetchPinkSheet } from "./pinkSheet.js";

export const PINK_KV_KEY = "commodities:pinksheet";
const PINK_REFRESH_MS = 12 * 3600_000;
const YAHOO_TTL = { "1y": 10 * 60_000, "10y": 6 * 3600_000 };
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
export const SNAPSHOT_DAILY_POINTS = 60;
export const SNAPSHOT_MONTHLY_POINTS = 24;

/** JSON chart Yahoo -> nến ngày [["YYYY-MM-DD", close]] (bỏ ô trống, giữ nến cuối cùng mỗi ngày). */
export function yahooDailyBars(json) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp ?? [], c = r?.indicators?.quote?.[0]?.close ?? [];
  const by = new Map();
  ts.forEach((t, i) => { if (Number.isFinite(c[i]) && c[i] > 0) by.set(new Date(t * 1000).toISOString().slice(0, 10), c[i]); });
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

const pct = (a, b) => (a > 0 && b > 0 ? (b / a - 1) * 100 : null);

/** Mục snapshot cho chuỗi THÁNG (Pink Sheet). */
export function monthlySnapshot(points) {
  if (!points?.length) return null;
  const [period, value] = points.at(-1);
  const prev = points.at(-2)?.[1] ?? null;
  const [y, m] = period.split("-").map(Number);
  const yoy = points.find(([p]) => p === `${y - 1}-${String(m).padStart(2, "0")}`)?.[1] ?? null;
  return { value, period, change: { pct: pct(prev, value), basisVi: "so với tháng trước" }, yoyPct: pct(yoy, value), history: points.slice(-SNAPSHOT_MONTHLY_POINTS) };
}

/** Mục snapshot cho chuỗi NGÀY (Yahoo): giá hiện tại so với phiên trước (parseQuote của Nhịp đập). */
export function dailySnapshot(json) {
  const q = parseQuote(json);
  const bars = yahooDailyBars(json);
  if (!q || !bars.length) return null;
  return { value: q.value, period: q.date, time: q.time, change: { pct: q.changePct, basisVi: "so với phiên trước" }, history: bars.slice(-SNAPSHOT_DAILY_POINTS) };
}

export function createCommodityService({ store = null, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const yahooCache = new Map();
  let pink = null, pinkInflight = null, pinkLoaded = false;

  async function yahooJson(symbol, range) {
    const key = `${symbol}|${range}`;
    const hit = yahooCache.get(key);
    if (hit && now() - hit.at < (YAHOO_TTL[range] ?? 10 * 60_000)) return hit.json;
    const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
    const json = await r.json();
    yahooCache.set(key, { at: now(), json });
    return json;
  }

  async function pinkSheet() {
    if (!pinkLoaded) {
      pinkLoaded = true;
      try { pink = (await store?.getKv?.(PINK_KV_KEY))?.value ?? null; } catch (e) { log.warn?.(`[commodities] đọc KV lỗi: ${e.message}`); }
    }
    const fresh = pink && now() - Date.parse(pink.fetchedAt) < PINK_REFRESH_MS;
    if (fresh) return pink;
    pinkInflight ??= (async () => {
      try {
        const cols = COMMODITIES.filter((c) => c.source.kind === "wb").map((c) => c.source.column);
        const doc = { ...(await fetchPinkSheet(cols, fetchImpl)), fetchedAt: new Date(now()).toISOString() };
        pink = doc;
        try { await store?.setKv?.(PINK_KV_KEY, doc); } catch (e) { log.warn?.(`[commodities] ghi KV lỗi: ${e.message}`); }
      } catch (e) {
        log.warn?.(`[commodities] Pink Sheet lỗi, giữ bản cũ: ${e.message}`);
        if (pink) pink = { ...pink, lastError: e.message };
      }
      return pink;
    })().finally(() => { pinkInflight = null; });
    return pinkInflight;
  }

  async function snapshot() {
    const ps = await pinkSheet().catch(() => null);
    const items = await Promise.all(COMMODITIES.map(async (c) => {
      const base = { id: c.id, nameVi: c.nameVi, group: c.group, unit: c.unit, sectorKey: c.sectorKey ?? null, vnPrice: !!c.vnPrice, twoWayVi: c.twoWayVi ?? null, vnTickers: c.vn?.tickers ?? [] };
      if (c.source.kind === "none") return { ...base, available: false, freq: null, source: { kind: "none", labelVi: c.source.labelVi }, reasonVi: c.source.labelVi };
      if (c.source.kind === "wb") {
        const s = ps?.series?.[c.source.column];
        const snap = monthlySnapshot(s?.points);
        const source = { kind: "wb", labelVi: c.source.labelVi, column: c.source.column, updatedOn: ps?.updatedOn ?? null, fetchedAt: ps?.fetchedAt ?? null };
        return snap ? { ...base, available: true, freq: "month", source, ...snap } : { ...base, available: false, freq: "month", source, reasonVi: "Chưa đọc được Pink Sheet." };
      }
      try {
        const snap = dailySnapshot(await yahooJson(c.source.symbol, "1y"));
        const source = { kind: "yahoo", labelVi: c.source.labelVi, symbol: c.source.symbol };
        return snap ? { ...base, available: true, freq: "day", source, ...snap } : { ...base, available: false, freq: "day", source, reasonVi: "Yahoo không trả giá." };
      } catch (e) {
        return { ...base, available: false, freq: "day", source: { kind: "yahoo", labelVi: c.source.labelVi, symbol: c.source.symbol }, reasonVi: `Không lấy được giá (${e.message}).` };
      }
    }));
    return {
      generatedAt: new Date(now()).toISOString(),
      pinkSheet: ps ? { updatedOn: ps.updatedOn, lastPeriod: ps.lastPeriod, fetchedAt: ps.fetchedAt, url: ps.url, lastError: ps.lastError ?? null } : null,
      items,
    };
  }

  return { snapshot, pinkSheet, yahooJson };
}
