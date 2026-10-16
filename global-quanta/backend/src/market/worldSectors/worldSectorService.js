// Dữ liệu ngành thế giới ↔ ngành Việt Nam (M1). Yahoo qua Gateway — một nguồn, mỗi số kèm ngày phiên:
//   lịch sử ngày 5 năm / mã: bộ nhớ đệm 6 giờ, tải song song tối đa 4 (không lưu KV — ~1,8 MB, tránh egress Supabase);
//   giá mới nhất: endpoint spark theo lô 20 mã, bộ nhớ đệm 5 phút, ghép vào cuối lịch sử nếu mới hơn.
// Ngành VN: chỉ số ICB của Lọc ngành (sectorIndices — KV đã dựng, không gọi SSI).
import { quality } from "../commodities/commodityAnalytics.js";
import { yahooDailyBars } from "../commodities/commodityService.js";
import { REGIONS, VN_SECTORS, WORLD_SECTOR_INSTRUMENTS } from "./catalog.js";

const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
const HISTORY_TTL = 6 * 3600_000;
const QUOTE_TTL = 5 * 60_000;
const CONCURRENCY = 4;
export const HORIZONS = { d1: 1, w1: 5, m1: 21, m3: 63, m6: 126 };

const pct = (a, b) => (a > 0 && b > 0 ? Math.round((b / a - 1) * 1e6) / 1e4 : null);

/** Lợi suất % theo số phiên lùi lại từ điểm cuối. */
export function horizonReturns(points) {
  const out = {};
  const n = points.length;
  for (const [k, h] of Object.entries(HORIZONS)) out[k] = n > h ? pct(points[n - 1 - h][1], points[n - 1][1]) : null;
  return out;
}

/** JSON spark Yahoo -> Map(symbol -> [["YYYY-MM-DD", close]]). */
export function parseSpark(json) {
  const out = new Map();
  for (const r of json?.spark?.result ?? []) {
    const q = r.response?.[0];
    const ts = q?.timestamp ?? [], c = q?.indicators?.quote?.[0]?.close ?? [];
    const by = new Map();
    ts.forEach((t, i) => { if (Number.isFinite(c[i]) && c[i] > 0) by.set(new Date(t * 1000).toISOString().slice(0, 10), c[i]); });
    out.set(r.symbol, [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return out;
}

/** Ghép giá mới (spark) vào cuối lịch sử: ghi đè ngày trùng, thêm ngày mới. */
export function mergeTail(hist, tail) {
  if (!tail?.length) return hist;
  const m = new Map(hist);
  for (const [d, v] of tail) m.set(d, v);
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export function createWorldSectorService({ sectorIndices = null, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const hist = new Map(); // symbol -> { at, points }
  let quotes = null, quotesInflight = null, histInflight = null;

  async function fetchHistory(symbol) {
    const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`, { headers: UA, signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return yahooDailyBars(await r.json());
  }

  async function histories() {
    // mã lỗi thử lại sau 30 phút, mã tốt làm mới sau 6 giờ
    const stale = WORLD_SECTOR_INSTRUMENTS.filter((i) => { const h = hist.get(i.symbol); return !(h && now() - h.at < (h.error ? 30 * 60_000 : HISTORY_TTL)); });
    if (stale.length) {
      histInflight ??= mapLimit(stale, CONCURRENCY, async (i) => {
        try { hist.set(i.symbol, { at: now(), points: await fetchHistory(i.symbol), error: null }); }
        catch (e) { const old = hist.get(i.symbol); hist.set(i.symbol, { at: now(), points: old?.points ?? [], error: e.message }); }
      }).finally(() => { histInflight = null; });
      await histInflight;
    }
    return hist;
  }

  async function latest() {
    if (quotes && now() - quotes.at < QUOTE_TTL) return quotes.map;
    quotesInflight ??= (async () => {
      const map = new Map();
      const syms = WORLD_SECTOR_INSTRUMENTS.map((i) => i.symbol);
      for (let k = 0; k < syms.length; k += 20) {
        try {
          const r = await fetchImpl(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${syms.slice(k, k + 20).map(encodeURIComponent).join(",")}&range=5d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(20_000) });
          if (r.ok) for (const [s, p] of parseSpark(await r.json())) map.set(s, p);
        } catch (e) { log.warn?.(`[world-sectors] spark lỗi: ${e.message}`); }
      }
      quotes = { at: now(), map };
      return map;
    })().finally(() => { quotesInflight = null; });
    return quotesInflight;
  }

  /** Chuỗi giá đã ghép (lịch sử + giá mới) của mọi mã: Map(symbol -> { points, error }). */
  async function series() {
    const [h, q] = await Promise.all([histories(), latest()]);
    return new Map(WORLD_SECTOR_INSTRUMENTS.map((i) => [i.symbol, { points: mergeTail(h.get(i.symbol)?.points ?? [], q.get(i.symbol)), error: h.get(i.symbol)?.error ?? null }]));
  }

  async function vnSeries() {
    let doc = null;
    try { doc = sectorIndices ? await sectorIndices() : null; } catch (e) { log.warn?.(`[world-sectors] đọc ICB lỗi: ${e.message}`); }
    return new Map(VN_SECTORS.map((s) => {
      const sec = doc?.[s.icb];
      return [s.icb, { name: sec?.name ?? s.nameVi, points: (sec?.index ?? []).filter((r) => r[1] > 0).map((r) => [r[0], r[1]]), members: sec?.index?.at(-1)?.[2] ?? null, rebalances: sec?.rebalances ?? [] }];
    }));
  }

  async function snapshot() {
    const [ser, vn] = await Promise.all([series(), vnSeries()]);
    const today = new Date(now()).toISOString().slice(0, 10);
    const instruments = WORLD_SECTOR_INSTRUMENTS.map((i) => {
      const s = ser.get(i.symbol);
      const pts = s.points;
      const last = pts.at(-1)?.[0] ?? null;
      const staleDays = last ? Math.floor((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
      return {
        symbol: i.symbol, region: i.region, regionVi: REGIONS[i.region].nameVi, nameVi: i.nameVi, session: i.session, maps: i.maps,
        available: pts.length > 1, last: pts.at(-1)?.[1] ?? null, lastDate: last, returns: horizonReturns(pts),
        quality: quality(pts, "day"), stale: staleDays != null && staleDays > 5, error: s.error, source: `Yahoo:${i.symbol}`,
      };
    });
    const vnOut = VN_SECTORS.map((s) => {
      const v = vn.get(s.icb);
      return { icb: s.icb, nameVi: v.name, parent: s.parent ?? null, available: v.points.length > 1, lastDate: v.points.at(-1)?.[0] ?? null, members: v.members, returns: horizonReturns(v.points), source: "Gateway: chỉ số ngành ICB (Lọc ngành)" };
    });
    return {
      generatedAt: new Date(now()).toISOString(), regions: REGIONS, vn: vnOut, instruments,
      missing: instruments.filter((i) => !i.available).map((i) => i.symbol),
      notes: ["Trung Quốc: chỉ số ngành CSI trên Yahoo không có lịch sử — chỉ dùng ETF niêm yết Mỹ (KWEB, CQQQ, CHIQ) và Hang Seng TECH."],
    };
  }

  return { snapshot, series, vnSeries };
}
