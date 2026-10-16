// Dịch vụ hàng hoá của Gateway (C1): một nguồn cho mỗi mặt hàng (catalog.js), mỗi con số kèm kỳ/ngày + nguồn.
// Yahoo (ngày): bộ nhớ đệm theo (mã, khoảng). Pink Sheet (tháng): KV `commodities:pinksheet`, làm mới tối đa 12 giờ/lần,
// lỗi nguồn -> giữ bản cũ (ghi rõ thời điểm lấy).
import { parseQuote } from "../world/worldPulse.js";
import { COMMODITIES, commodityById } from "./catalog.js";
import { describe, monthEnd, quality, rebase, relation, sliceRange, toVnd } from "./commodityAnalytics.js";
import { fetchPinkSheet } from "./pinkSheet.js";

export const PINK_KV_KEY = "commodities:pinksheet";
const PINK_REFRESH_MS = 12 * 3600_000;
const YAHOO_TTL = { "1y": 10 * 60_000, "10y": 6 * 3600_000 };
const VN_TICKER_TTL = 6 * 3600_000;
export const HISTORY_RANGES = ["1y", "3y", "5y", "10y"];
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

/**
 * sectorIndices: () => { [icb]: { name, index: [[date, close, n]] } } (KV Lọc ngành, không gọi SSI).
 * taSeries: { get({ symbol, range, limit }) } — giá cổ phiếu điều chỉnh cộng dồn theo sự kiện quyền (cùng cơ sở tab TA).
 */
export function createCommodityService({ store = null, fetchImpl = globalThis.fetch, now = Date.now, log = console, sectorIndices = null, taSeries = null } = {}) {
  const yahooCache = new Map();
  const vnTickerCache = new Map();
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

  async function vnTicker(symbol) {
    const hit = vnTickerCache.get(symbol);
    if (hit && now() - hit.at < VN_TICKER_TTL) return hit.value;
    const r = await taSeries.get({ symbol, range: "5y", limit: 1300 });
    const value = { points: (r.bars ?? []).filter((b) => b.close > 0 && !b.partial).map((b) => [b.date, b.close]), priceBasis: r.priceBasis, warnings: r.warnings ?? [] };
    vnTickerCache.set(symbol, { at: now(), value });
    return value;
  }

  /** Phân tích chuyên sâu một mặt hàng (C2). range: 1y | 3y | 5y | 10y (khung hiển thị; thống kê 5 năm luôn dùng đủ dữ liệu có). */
  async function history(id, range = "5y") {
    const c = commodityById(id);
    if (!c) return { status: 404, body: { error: `Không có mặt hàng ${id}.` } };
    if (!HISTORY_RANGES.includes(range)) return { status: 400, body: { error: `range phải là ${HISTORY_RANGES.join(", ")}.` } };
    const base = { id: c.id, nameVi: c.nameVi, unit: c.unit, group: c.group, worldFactor: c.worldFactor ?? null, vnPrice: !!c.vnPrice, twoWayVi: c.twoWayVi ?? null, range };
    if (c.source.kind === "none") return { status: 200, body: { ...base, available: false, source: c.source, reasonVi: c.source.labelVi } };
    const freq = c.source.kind === "wb" ? "month" : "day";
    let world = [], source;
    if (freq === "month") {
      const ps = await pinkSheet();
      world = ps?.series?.[c.source.column]?.points ?? [];
      source = { kind: "wb", labelVi: c.source.labelVi, column: c.source.column, updatedOn: ps?.updatedOn ?? null };
    } else {
      world = yahooDailyBars(await yahooJson(c.source.symbol, "10y"));
      source = { kind: "yahoo", labelVi: c.source.labelVi, symbol: c.source.symbol };
    }
    if (world.length < 3) return { status: 200, body: { ...base, available: false, freq, source, reasonVi: "Nguồn chưa có đủ lịch sử." } };
    const notes = [];
    let fx = [];
    try { fx = yahooDailyBars(await yahooJson("VND=X", "10y")); } catch (e) { notes.push(`Chưa lấy được USD/VND (${e.message}) — bỏ đường quy đổi VND.`); }
    const vnd = toVnd(world, fx, freq);
    // chuỗi phía Việt Nam: chỉ số ngành ICB (nếu có) + cổ phiếu đại diện đầu tiên (giá điều chỉnh theo sự kiện quyền)
    const vnSeries = [];
    if (c.vn?.icb && sectorIndices) {
      try {
        const sec = (await sectorIndices())?.[c.vn.icb];
        if (sec?.index?.length) vnSeries.push({ kind: "icb", code: c.vn.icb, labelVi: `Chỉ số ngành ICB ${c.vn.icb} ${sec.name ?? ""}`.trim(), priceBasis: "INDEX_POINTS", points: sec.index.filter((r) => r[1] > 0).map((r) => [r[0], r[1]]) });
      } catch (e) { notes.push(`Chưa đọc được chỉ số ngành ICB (${e.message}).`); }
    }
    const tk = c.vn?.tickers?.[0];
    if (tk && taSeries) {
      try {
        const t = await vnTicker(tk);
        if (t.points.length) vnSeries.push({ kind: "ticker", code: tk, labelVi: `Cổ phiếu ${tk} (heuristic — mã đại diện đặt tay)`, priceBasis: t.priceBasis, warnings: t.warnings, points: t.points });
      } catch (e) { notes.push(`Chưa lấy được giá ${tk} (${e.message}).`); }
    }
    if (!vnSeries.length && !c.vnPrice) notes.push("Chưa có chuỗi so sánh phía Việt Nam cho mặt hàng này (không có ngành ICB / mã đại diện đã xác nhận).");
    const compare = [];
    const cw = c.compareWith ? commodityById(c.compareWith) : null;
    if (cw?.source.kind === "wb" && freq === "month") {
      const pts = (await pinkSheet())?.series?.[cw.source.column]?.points ?? [];
      if (pts.length) compare.push({ key: `cmp:${cw.id}`, labelVi: `${cw.nameVi} (${cw.source.labelVi})`, points: pts });
    }
    const openPeriod = new Date(now()).toISOString().slice(0, 7);
    const vnForStats = (s) => (freq === "month" ? monthEnd(s.points, openPeriod) : s.points);
    const stats = describe(world, freq);
    const relations = vnSeries.map((s) => ({ kind: s.kind, code: s.code, labelVi: s.labelVi, ...(relation(world, vnForStats(s), freq) ?? { unavailable: true }) }));
    const shown = sliceRange(world, range);
    const from = shown[0][0];
    const chart = rebase([
      { key: "world", labelVi: `Giá thế giới (${c.unit})`, points: world },
      ...(vnd.length ? [{ key: "vnd", labelVi: `Quy đổi VND (giá thế giới × USD/VND — không phải giá nội địa)`, points: vnd }] : []),
      ...vnSeries.map((s) => ({ key: `vn:${s.code}`, labelVi: s.labelVi, points: freq === "month" ? vnForStats(s) : s.points })),
      ...compare,
    ], from).map(({ points, ...rest }) => rest);
    return {
      status: 200,
      body: {
        ...base, available: true, freq, source, from, to: world.at(-1)[0],
        world: shown,
        vnd: { labelVi: `VND/${c.unit.replace(/^USD\//, "")}`, source: "Yahoo:VND=X", points: sliceRange(vnd, range) },
        vnSeries: vnSeries.map(({ points, ...m }) => ({ ...m, first: points[0]?.[0] ?? null, last: points.at(-1)?.[0] ?? null })),
        quality: quality(world, freq),
        chart, stats: stats && { ...stats, volSeries: sliceRange(stats.volSeries, range), ddSeries: sliceRange(stats.ddSeries, range) },
        relations: relations.map((r) => (r.rolling ? { ...r, rolling: sliceRange(r.rolling, range) } : r)),
        notes,
      },
    };
  }

  /** Chuỗi giá một mặt hàng cho engine ngành (M2): { id, nameVi, freq, points } hoặc null. */
  async function seriesOf(id) {
    const c = commodityById(id);
    if (!c || c.source.kind === "none") return null;
    if (c.source.kind === "wb") return { id, nameVi: c.nameVi, freq: "month", points: (await pinkSheet())?.series?.[c.source.column]?.points ?? [] };
    return { id, nameVi: c.nameVi, freq: "day", points: yahooDailyBars(await yahooJson(c.source.symbol, "10y")) };
  }

  return { snapshot, pinkSheet, yahooJson, history, seriesOf };
}
