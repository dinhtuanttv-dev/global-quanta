// Elite 10 E2 (2026-10-17) — ENGINE BẰNG CHỨNG: đo IC hạng của từng tín hiệu trong sổ E1 theo đúng E2-prereg.md và quyết định
// bậc A/B/C cho Điểm Elite (E3).
//
// Chạy TĂNG DẦN (egress Supabase gói miễn phí): chuỗi IC đã tính lưu trong KV `elite:ic`; mỗi lần chỉ tính các cặp
// (ngày, kỳ hạn) vừa đủ thời gian chờ. Giá trị tín hiệu của các ngày còn chờ kỳ hạn dài được đệm gọn trong cùng tài liệu, nên
// mỗi đêm chỉ đọc đặc trưng dòng tiền của phiên mới + giá đóng cửa điều chỉnh của khoảng ~25 phiên. Lần chạy đầu đọc hồi cứu
// toàn bộ `market_flow_daily` (một lần).
import { T as RESEARCH_T } from "../research/researchJobs.js";
import { SIGNAL_SPECS } from "./signalRegistry.js";
import { bhQ, dailyIc, decideTier, E2_VERSION, HORIZONS, MIN_DAYS_FDR, summarize } from "./icCore.js";
import { noteStoreError } from "./storeHealth.js";

export const EVIDENCE_KV = { ic: "elite:ic", evidence: "elite:evidence" };

/** Tín hiệu có lịch sử point-in-time trong market_flow_daily: id sổ E1 -> khoá trong features. */
export const FLOW_SIGNALS = { stealth5: "stealth5", stealth20: "stealth20", net_intent: "netIntent", mom5_atr: "mom5Atr", log_rvol: "logRvol" };
const CAL_SYMBOLS = ["VNM", "FPT", "HPG", "VCB", "MWG"];
const MAX_H = Math.max(...HORIZONS);
const LOOKBACK_DAYS = 420;

const isoMinusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/**
 * @param {{ store: any, panel: { panel: (date?: string|null) => Promise<any>, dates: () => Promise<string[]> }, now?: () => number, log?: any }} deps
 */
export function createEvidenceEngine({ store, panel, now = Date.now, log = console }) {
  let running = null;
  let memo = null;

  const kv = async (key) => {
    try { return (await store.getKv(key))?.value ?? null; } catch (e) { noteStoreError(e); return null; }
  };

  async function sessionCalendar(lastDate) {
    const rows = await store.getMarketDailyRange({ from: isoMinusDays(lastDate, LOOKBACK_DAYS), to: lastDate, symbols: CAL_SYMBOLS, columns: "symbol,trading_date,close_adj" });
    return [...new Set(rows.filter((r) => r.closeAdj > 0).map((r) => r.date))].sort();
  }

  async function flowValues(dates) {
    if (!dates.length) return new Map();
    const out = new Map();
    // Theo lô ngày để URL ngắn; mỗi dòng chỉ lấy symbol, ngày, features.
    for (let i = 0; i < dates.length; i += 20) {
      const chunk = dates.slice(i, i + 20);
      const rows = await store.selectRows(RESEARCH_T.flow, { select: "symbol,trading_date,features", in: { trading_date: chunk } });
      for (const r of rows ?? []) {
        if (!r.features) continue;
        const d = r.trading_date;
        if (!out.has(d)) out.set(d, {});
        const day = out.get(d);
        for (const [sig, key] of Object.entries(FLOW_SIGNALS)) {
          const v = Number(r.features[key]);
          if (Number.isFinite(v)) (day[sig] ??= {})[String(r.symbol).toUpperCase()] = v;
        }
      }
    }
    return out;
  }

  async function panelValues(date) {
    const doc = await panel.panel(date);
    if (!doc?.rows) return null;
    const day = {};
    for (const r of doc.rows) for (const [sig, v] of Object.entries(r.values)) if (v != null && !(sig in FLOW_SIGNALS)) (day[sig] ??= {})[r.ticker] = v;
    return day;
  }

  /** Tính phần còn thiếu của chuỗi IC. Trả tài liệu IC đã cập nhật. */
  async function updateIc() {
    const doc = (await kv(EVIDENCE_KV.ic)) ?? { version: E2_VERSION, series: {}, pending: {}, flowFrom: null };
    if (doc.version !== E2_VERSION) { doc.version = E2_VERSION; doc.series = {}; doc.pending = {}; }
    const panelDates = await panel.dates();
    const lastPanel = panelDates[panelDates.length - 1];
    if (!lastPanel) return doc;
    const cal = await sessionCalendar(lastPanel);
    const pos = new Map(cal.map((d, i) => [d, i]));
    const last = cal.length - 1;
    const done = (sig, h, d) => Boolean(doc.series?.[sig]?.[h]?.[d]);
    const matured = (d, h) => pos.has(d) && pos.get(d) + 1 + h <= last;

    // Ngày cần tính: lịch dòng tiền (hồi cứu) + ngày có bảng E1.
    const flowDates = cal.filter((d) => HORIZONS.some((h) => matured(d, h) && Object.keys(FLOW_SIGNALS).some((s) => !done(s, h, d))));
    const panelSigs = SIGNAL_SPECS.map((s) => s.id).filter((id) => !(id in FLOW_SIGNALS));
    const pDates = panelDates.filter((d) => HORIZONS.some((h) => matured(d, h) && panelSigs.some((s) => !done(s, h, d))));

    // Giá trị tín hiệu: ưu tiên đệm `pending`, thiếu thì đọc (dòng tiền theo lô ngày, bảng E1 theo ngày).
    const values = new Map(Object.entries(doc.pending ?? {}));
    const needFlow = flowDates.filter((d) => !values.get(d) || !Object.keys(FLOW_SIGNALS).some((s) => values.get(d)?.[s]));
    const fetched = await flowValues(needFlow);
    for (const [d, day] of fetched) values.set(d, { ...(values.get(d) ?? {}), ...day });
    // Ngày không có dữ liệu nguồn (VD trước khi bảng dòng tiền bắt đầu): ghi "không đo được" để không đọc lại mỗi đêm.
    const markEmpty = (d, sigs) => {
      for (const h of HORIZONS) if (matured(d, h)) for (const sig of sigs) ((doc.series[sig] ??= {})[h] ??= {})[d] ??= [null, 0];
    };
    for (const d of needFlow) if (!fetched.has(d)) markEmpty(d, Object.keys(FLOW_SIGNALS));
    for (const d of pDates) {
      if (values.get(d) && panelSigs.some((s) => values.get(d)[s])) continue;
      const day = await panelValues(d);
      if (day) values.set(d, { ...(values.get(d) ?? {}), ...day });
      else markEmpty(d, panelSigs);
    }

    // Giá đóng cửa điều chỉnh cho mọi ngày vào (d+1) và ra (d+1+h) cần dùng.
    const work = [...new Set([...flowDates, ...pDates])].sort();
    if (work.length) {
      const symbols = new Set();
      for (const d of work) for (const m of Object.values(values.get(d) ?? {})) for (const t of Object.keys(m)) symbols.add(t);
      const from = cal[pos.get(work[0]) + 1];
      const to = cal[Math.min(last, pos.get(work[work.length - 1]) + 1 + MAX_H)];
      const px = new Map();
      if (from && to && symbols.size) {
        const rows = await store.getMarketDailyRange({ from, to, symbols: [...symbols], columns: "symbol,trading_date,close_adj" });
        for (const r of rows) if (r.closeAdj > 0) px.set(`${r.symbol}|${r.date}`, r.closeAdj);
      }
      for (const d of work) {
        const day = values.get(d);
        if (!day) continue;
        for (const h of HORIZONS) {
          if (!matured(d, h)) continue;
          const entry = cal[pos.get(d) + 1], exit = cal[pos.get(d) + 1 + h];
          for (const [sig, byTicker] of Object.entries(day)) {
            if (done(sig, h, d)) continue;
            const pairs = [];
            for (const [t, v] of Object.entries(byTicker)) {
              const a = px.get(`${t}|${entry}`), b = px.get(`${t}|${exit}`);
              if (a && b) pairs.push([v, b / a - 1]);
            }
            const r = dailyIc(pairs);
            ((doc.series[sig] ??= {})[h] ??= {})[d] = r ? [Math.round(r.ic * 1e5) / 1e5, r.n] : [null, pairs.length];
          }
        }
      }
    }

    // Đệm: giữ giá trị các ngày còn chờ kỳ hạn dài nhất.
    doc.pending = Object.fromEntries([...values].filter(([d]) => pos.has(d) && pos.get(d) + 1 + MAX_H > last));
    doc.flowFrom ??= flowDates[0] ?? null;
    doc.updatedAt = new Date(now()).toISOString();
    doc.calendarLast = cal[last];
    await store.setKv(EVIDENCE_KV.ic, doc);
    return doc;
  }

  /** Tổng hợp chuỗi IC -> bậc bằng chứng theo luật prereg. */
  function evaluate(icDoc) {
    const rows = [];
    for (const spec of SIGNAL_SPECS) {
      const byH = {};
      for (const h of HORIZONS) {
        const m = icDoc.series?.[spec.id]?.[h] ?? {};
        const dates = Object.keys(m).sort();
        const s = summarize(dates.map((d) => m[d]?.[0]).filter((v) => v != null), h);
        byH[h] = { ...s, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
      }
      rows.push({ spec, byH });
    }
    const tests = [];
    for (const r of rows) for (const h of HORIZONS) if (r.byH[h].n >= MIN_DAYS_FDR && r.byH[h].pPos != null) tests.push([r, h]);
    const q = bhQ(tests.map(([r, h]) => r.byH[h].pPos));
    tests.forEach(([r, h], i) => { r.byH[h].q = q[i]; });
    const signals = rows.map(({ spec, byH }) => {
      const mainH = spec.id === "ws_sector_alpha" ? 1 : 5;
      const d = decideTier(spec.tier, byH, mainH);
      const r4 = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4);
      return {
        id: spec.id, tab: spec.tab, labelVi: spec.labelVi, priorTier: spec.tier, priorEvidenceVi: spec.evidenceVi,
        tier: d.tier, change: d.change, reasonVi: d.reasonVi, mainH,
        source: spec.id in FLOW_SIGNALS ? "hồi cứu point-in-time (market_flow_daily)" : "tiến từ bảng E1",
        byH: Object.fromEntries(HORIZONS.map((h) => {
          const s = byH[h];
          return [h, { n: s.n, mean: r4(s.mean), t: r4(s.t), pPos: r4(s.pPos), q: r4(s.q ?? null), stable: s.stable, halves: s.halves?.map(r4) ?? null, from: s.from, to: s.to }];
        })),
      };
    });
    return {
      version: E2_VERSION, prereg: "backend/src/market/elite/E2-prereg.md", generatedAt: new Date(now()).toISOString(),
      calendarLast: icDoc.calendarLast ?? null, tests: tests.length,
      counts: { A: signals.filter((s) => s.tier === "A").length, B: signals.filter((s) => s.tier === "B").length, C: signals.filter((s) => s.tier === "C").length },
      signals,
    };
  }

  async function update() {
    if (running) return running;
    running = (async () => {
      const icDoc = await updateIc();
      const ev = evaluate(icDoc);
      await store.setKv(EVIDENCE_KV.evidence, ev);
      memo = ev;
      return ev;
    })().finally(() => { running = null; });
    return running;
  }

  async function evidence() {
    if (memo) return memo;
    memo = await kv(EVIDENCE_KV.evidence);
    return memo;
  }

  return { update, evidence, evaluate, updateIc };
}

