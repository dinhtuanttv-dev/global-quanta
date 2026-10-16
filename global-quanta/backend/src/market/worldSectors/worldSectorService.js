// Dữ liệu ngành thế giới ↔ ngành Việt Nam (M1). Yahoo qua Gateway — một nguồn, mỗi số kèm ngày phiên:
//   lịch sử ngày 5 năm / mã: bộ nhớ đệm 6 giờ, tải song song tối đa 4 (không lưu KV — ~1,8 MB, tránh egress Supabase);
//   giá mới nhất: endpoint spark theo lô 20 mã, bộ nhớ đệm 5 phút, ghép vào cuối lịch sử nếu mới hơn.
// Ngành VN: chỉ số ICB của Lọc ngành (sectorIndices — KV đã dựng, không gọi SSI).
import { quality } from "../commodities/commodityAnalytics.js";
import { yahooDailyBars } from "../commodities/commodityService.js";
import { COMMODITY_DRIVERS, instrumentsFor, MATCH_LABEL_VI, MATCH_WEIGHT, REGIONS, VN_SECTORS, WORLD_SECTOR_INSTRUMENTS } from "./catalog.js";
import { sectorEvidence, WS_EVIDENCE } from "./wsEvidence.js";
import { alignPairs, dailyVol, labelOf, pearson, rebase, relation, sectorScores, zMove } from "./worldSectorAnalytics.js";

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

/**
 * Tín hiệu tổng hợp thế giới theo phiên VN (dùng cho beta cổ phiếu): với mỗi phiên VN d, trung bình đều giữa khu vực của trung bình
 * có trọng số mức khớp của (lợi suất phiên TRƯỚC d / σ của mã). Đơn vị: độ lệch chuẩn.
 */
export function compositeSeries(vnPts, inst) {
  const perRegion = {};
  for (const i of inst) {
    const s = dailyVol(i.points);
    if (!s) continue;
    const w = MATCH_WEIGHT[i.match] ?? 0;
    const m = (perRegion[i.region] ??= new Map());
    for (const p of alignPairs(vnPts, i.points, i.session, true)) {
      const r = m.get(p[0]) ?? { sw: 0, swx: 0 };
      r.sw += w; r.swx += (w * p[1]) / s; m.set(p[0], r);
    }
  }
  const dates = new Set(Object.values(perRegion).flatMap((m) => [...m.keys()]));
  return [...dates].sort().map((d) => {
    const vals = Object.values(perRegion).map((m) => m.get(d)).filter((r) => r && r.sw > 0).map((r) => r.swx / r.sw);
    return [d, vals.reduce((a, b) => a + b, 0) / vals.length];
  });
}

export function createWorldSectorService({ sectorIndices = null, commoditySeries = null, taSeries = null, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const stockCache = new Map();
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

  async function driversFor(icb) {
    const out = [];
    for (const [id, sign] of COMMODITY_DRIVERS[icb] ?? []) {
      try { const c = commoditySeries ? await commoditySeries(id) : null; if (c?.points?.length > 3) out.push({ ...c, sign }); } catch { /* bỏ qua hàng hoá lỗi */ }
    }
    return out;
  }

  const instFor = (icb, ser) => instrumentsFor(icb).map((x) => ({ ...x, points: ser.get(x.symbol)?.points ?? [] })).filter((x) => x.points.length > 30);

  /** Điểm thuận/ngược gió 22 ngành VN + bản đồ nhiệt + xếp hạng (THĂM DÒ cho tới khi qua M3). */
  async function scores() {
    const [ser, vn] = await Promise.all([series(), vnSeries()]);
    const rows = [];
    for (const s of VN_SECTORS) {
      const v = vn.get(s.icb);
      if (v.points.length < 60) { rows.push({ icb: s.icb, nameVi: v.name, available: false }); continue; }
      const inst = instFor(s.icb, ser);
      const sc = sectorScores(v.points, inst, await driversFor(s.icb));
      const heat = {};
      for (const r of Object.keys(REGIONS)) {
        const ci = sc.components.filter((c) => c.region === r);
        if (!ci.length) continue;
        const agg = (k) => {
          const xs = ci.filter((c) => c[k]?.z != null);
          const w = xs.reduce((a, c) => a + MATCH_WEIGHT[c.match], 0);
          return w ? Math.round((xs.reduce((a, c) => a + MATCH_WEIGHT[c.match] * Math.max(-3, Math.min(3, c[k].z)), 0) / w) * 1000) / 1000 : null;
        };
        heat[r] = { new: agg("new"), w1: agg("w1"), m1: agg("m1"), m3: agg("m3"), n: ci.length, best: ci[0].match };
      }
      // thành phần (kỳ tái cân bằng gần nhất, tối đa 8 mã theo tỷ trọng) — cho Radar và AI
      const reb = v.rebalances.at(-1);
      const constituents = reb ? Object.entries(reb.weights).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([ticker, weight]) => ({ ticker, weight })) : [];
      rows.push({ icb: s.icb, nameVi: v.name, parent: s.parent ?? null, available: true, members: v.members, vnLast: sc.vnLast, constituents, short: { ...sc.short, evidence: sectorEvidence(s.icb) }, medium: sc.medium, heat,
        drivers: sc.commodities.map((c) => ({ id: c.id, nameVi: c.nameVi, sign: c.sign, short: c.short, medium: c.medium })) });
    }
    const ok = rows.filter((r) => r.available);
    const rank = (key, dir) => ok.filter((r) => r[key].score != null && labelOf(r[key].score) === dir)
      .sort((a, b) => (dir === "tailwind" ? b[key].score - a[key].score : a[key].score - b[key].score))
      .map((r) => ({ icb: r.icb, nameVi: r.nameVi, score: r[key].score }));
    return {
      generatedAt: new Date(now()).toISOString(),
      evidence: {
        version: WS_EVIDENCE.version, sample: WS_EVIDENCE.sample,
        short: { label: WS_EVIDENCE.shortList.pass ? "EVIDENCE" : "EXPERIMENTAL", ...WS_EVIDENCE.shortList },
        medium: { label: WS_EVIDENCE.mediumList.pass ? "EVIDENCE" : "EXPERIMENTAL", ...WS_EVIDENCE.mediumList },
        reasonVi: "Kiểm định đặt trước WS-v1: xếp hạng ngắn hạn ĐẠT (IC ≈ 0,02 — nhỏ); trung hạn KHÔNG ĐẠT; riêng Dầu khí đạt ở cấp ngành.",
      },
      method: {
        vi: "z = biến động / (σ ngày 250 phiên × √số phiên). Trong khu vực: trung bình theo mức khớp (chuẩn 1 · gần 0,75 · một phần 0,4); giữa khu vực: trung bình đều. Ngắn hạn = thông tin mới sau phiên VN gần nhất; trung hạn = 3 tháng. Có hàng hoá dẫn dắt: 70% ngành thế giới + 30% hàng hoá. Ngưỡng thuận/ngược gió ±0,5. |z| của từng mã chặn ở 3 khi gộp; khu vực chưa có phiên mới không tính.",
      },
      regions: REGIONS, rows,
      rankings: { short: { tailwind: rank("short", "tailwind"), headwind: rank("short", "headwind") }, medium: { tailwind: rank("medium", "tailwind"), headwind: rank("medium", "headwind") } },
    };
  }

  async function stockSeries(symbol) {
    const hit = stockCache.get(symbol);
    if (hit && now() - hit.at < 6 * 3600_000) return hit.value;
    const r = await taSeries.get({ symbol, range: "3y", limit: 800 });
    const value = { points: (r.bars ?? []).filter((b) => b.close > 0 && !b.partial).map((b) => [b.date, b.close]), priceBasis: r.priceBasis };
    stockCache.set(symbol, { at: now(), value });
    return value;
  }

  /** Bảng phụ một ngành VN: biểu đồ so sánh, quan hệ từng mã, hàng hoá, cổ phiếu thành phần (beta với tín hiệu thế giới). */
  async function detail(icb, range = "3y") {
    const sec = VN_SECTORS.find((s) => s.icb === icb);
    if (!sec) return { status: 404, body: { error: `Không có ngành ${icb}.` } };
    if (!["1y", "3y", "5y"].includes(range)) return { status: 400, body: { error: "range phải là 1y, 3y hoặc 5y." } };
    const [ser, vn] = await Promise.all([series(), vnSeries()]);
    const v = vn.get(icb);
    if (v.points.length < 60) return { status: 200, body: { icb, nameVi: v.name, available: false, reasonVi: "Chỉ số ngành VN chưa đủ lịch sử." } };
    const inst = instFor(icb, ser);
    const sc = sectorScores(v.points, inst, await driversFor(icb));
    const relations = inst.map((i) => ({ symbol: i.symbol, region: i.region, regionVi: REGIONS[i.region].nameVi, nameVi: i.nameVi, match: i.match, matchVi: MATCH_LABEL_VI[i.match], session: i.session,
      ...(relation(v.points, i.points, i.session) ?? { unavailable: true }) }));
    // biểu đồ: ngành VN + mã đại diện tốt nhất của Mỹ, châu Âu, châu Á (theo mức khớp, rồi |tương quan|)
    const ord = { exact: 0, close: 1, partial: 2 };
    const best = (regs) => relations.filter((r) => regs.includes(r.region) && !r.unavailable).sort((a, b) => ord[a.match] - ord[b.match] || Math.abs(b.corr ?? 0) - Math.abs(a.corr ?? 0))[0];
    const picks = [best(["US"]), best(["EU"]), best(["JP", "KR", "TW", "CN"])].filter(Boolean);
    const years = { "1y": 1, "3y": 3, "5y": 5 }[range];
    const lastD = v.points.at(-1)[0];
    const from = `${Number(lastD.slice(0, 4)) - years}${lastD.slice(4)}`;
    const chart = [
      { key: "vn", labelVi: `${v.name} (ICB ${icb}, Việt Nam)`, rebased: rebase(v.points, from) },
      ...picks.map((p) => ({ key: p.symbol, labelVi: `${p.nameVi} — ${p.regionVi}`, region: p.region, rebased: rebase(ser.get(p.symbol).points, from) })),
    ];
    // cổ phiếu thành phần theo trọng số kỳ tái cân bằng gần nhất; tối đa 8 mã được tính beta (tải giá theo yêu cầu, đệm 6 giờ)
    const lastReb = v.rebalances.at(-1);
    const members = lastReb ? Object.entries(lastReb.weights).sort((a, b) => b[1] - a[1]).slice(0, 10) : [];
    const comp = compositeSeries(v.points, inst);
    const stocks = [];
    let priced = 0;
    for (const [sym, w] of members) {
      const row = { symbol: sym, weight: w };
      if (taSeries && priced < 8) {
        priced++;
        try {
          const st = await stockSeries(sym);
          const lr = new Map();
          for (let k = 1; k < st.points.length; k++) lr.set(st.points[k][0], Math.log(st.points[k][1] / st.points[k - 1][1]));
          const pairs = comp.filter(([d]) => lr.has(d)).slice(-250).map(([d, x]) => [x, lr.get(d)]);
          const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
          const mx = xs.reduce((a, b) => a + b, 0) / (xs.length || 1), my = ys.reduce((a, b) => a + b, 0) / (ys.length || 1);
          const vx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), cv = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
          const ok = pairs.length >= 60;
          Object.assign(row, {
            n: pairs.length, corr: ok ? Math.round(pearson(xs, ys) * 1000) / 1000 : null,
            // beta: % lợi suất cổ phiếu cho 1 độ lệch chuẩn của tín hiệu thế giới
            beta: ok && vx > 0 ? Math.round((cv / vx) * 1e5) / 1e3 : null,
            d1: zMove(st.points, 1)?.pct ?? null, m1: zMove(st.points, 21)?.pct ?? null, m3: zMove(st.points, 63)?.pct ?? null,
            lastDate: st.points.at(-1)?.[0] ?? null, priceBasis: st.priceBasis,
          });
        } catch (e) { row.error = e.message; }
      }
      stocks.push(row);
    }
    return {
      status: 200,
      body: {
        icb, nameVi: v.name, available: true, range, from, vnLast: sc.vnLast, members: v.members,
        evidence: { short: sectorEvidence(icb), medium: { label: "EXPERIMENTAL", labelVi: WS_EVIDENCE.mediumList.labelVi }, relationsVi: "Tương quan / beta / độ trễ là mô tả (thăm dò).", version: WS_EVIDENCE.version },
        scores: { short: sc.short, medium: sc.medium }, components: sc.components, drivers: sc.commodities,
        chart, relations, stocks, rebalanceDate: lastReb?.date ?? null,
        stocksNoteVi: "Beta = % lợi suất phiên của cổ phiếu cho 1 độ lệch chuẩn của tín hiệu tổng hợp ngành thế giới (phiên nước ngoài TRƯỚC phiên VN), 250 phiên gần nhất; giá điều chỉnh theo sự kiện quyền (ta-series).",
      },
    };
  }

  return { snapshot, series, vnSeries, scores, detail };
}
