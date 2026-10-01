// Job vận hành Siêu Quét AI trên Gateway:
//   syncMarketDaily   15:20 ngày giao dịch — dữ liệu ngày toàn thị trường (+ phát hiện sự kiện quyền)
//   scanUniverse      15:40 ngày giao dịch — quét toàn universe, lưu kết quả
//   buildUniverse     Chủ nhật           — top N theo GT khớp bình quân 20 phiên
//   refreshFundamentals Thứ Bảy          — BCTC VCI lưu đệm (mã quá 7 ngày)
//   backfillMarketDaily (admin / 02:00) — nạp lịch sử, chạy tiếp được nếu bị ngắt

import { fetchMarketDay } from "./marketDaily.js";
import {
  universeConfig, rankByLiquidity, buildUniverse, fetchTradingViewSectors, fetchProjectASectors,
  mergeSectors, DIVIDEND_STOCKS,
} from "./universe.js";
import { fetchQuarterlyIncome, fetchQuarterlyBalance } from "./vciFinancials.js";
import { runScan, topForeignNetBuy } from "./scanEngine.js";
import { isTradingDay, lastCompletedSessionDate } from "../calendar.js";
import { addDays, fetchJson, mapLimit, sleep } from "../util.js";
import { notifyOps } from "../alerts.js";

export const KV = {
  latest: "scanner:latest",
  universe: "scanner:universe",
  emptyDates: "scanner:empty-dates",
};

const projectABase = () => (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, "");
const ADJ_EPSILON = 0.0005;
const HISTORY_SESSIONS = 260; // ~1 năm như bản gốc (Yahoo "1y"), đủ MA200 + RS 64 phiên

/** Các ngày giao dịch (theo lịch) lùi từ `end`, tối đa `count` ngày. */
export function tradingDatesBack(end, count) {
  const out = [];
  let d = end;
  for (let i = 0; out.length < count && i < count * 3; i++) {
    if (isTradingDay(new Date(`${d}T05:00:00Z`))) out.push(d);
    d = addDays(d, -1);
  }
  return out.reverse();
}

export function createScannerJobs(service, { now = Date.now, fetchDay = fetchMarketDay, fetchImpl = globalThis.fetch, pauseMs = 300 } = {}) {
  const store = service.store;

  async function emptyDates() {
    return new Set((await store.getKv(KV.emptyDates))?.value ?? []);
  }

  /** Đồng bộ một phiên; nếu phiên trước đã có trong kho thì đối chiếu giá điều chỉnh để phát hiện sự kiện quyền. */
  async function syncDay(date, { detectAdjustments = true } = {}) {
    const today = await fetchDay(date);
    if (!today.rows.length) return { date, rows: 0, requests: today.requests, empty: true };

    let adjusted = 0;
    let requests = today.requests;
    if (detectAdjustments) {
      const dates = (await store.getMarketDailyDates()).filter((d) => d < date);
      const prevDate = dates.at(-1);
      if (prevDate) {
        const prevFresh = await fetchDay(prevDate);
        requests += prevFresh.requests;
        const stored = new Map((await store.getMarketDailyByDate(prevDate)).map((r) => [r.symbol, r]));
        for (const fresh of prevFresh.rows) {
          const old = stored.get(fresh.symbol);
          if (!old?.closeAdj || !fresh.closeAdj) continue;
          const factor = fresh.closeAdj / old.closeAdj;
          if (Math.abs(factor - 1) > ADJ_EPSILON) {
            await store.applyAdjustment(fresh.symbol, prevDate, factor);
            adjusted++;
          }
        }
      }
    }
    await store.upsertMarketDaily(today.rows);
    return { date, rows: today.rows.length, requests, adjustedSymbols: adjusted };
  }

  const jobs = {
    async syncMarketDaily() {
      const date = lastCompletedSessionDate(new Date(now()));
      return syncDay(date);
    },

    /** Nạp lịch sử HISTORY_SESSIONS phiên; bỏ qua phiên đã có; tối đa `maxDays` phiên mỗi lần chạy. */
    async backfillMarketDaily({ sessions = HISTORY_SESSIONS, maxDays = Number(process.env.SCANNER_BACKFILL_MAX_DAYS) || 300 } = {}) {
      const end = lastCompletedSessionDate(new Date(now()));
      const have = new Set(await store.getMarketDailyDates());
      const empty = await emptyDates();
      const todo = tradingDatesBack(end, sessions).filter((d) => !have.has(d) && !empty.has(d)).reverse();
      let done = 0, requests = 0, rows = 0;
      const newlyEmpty = [];
      for (const date of todo.slice(0, maxDays)) {
        const r = await syncDay(date, { detectAdjustments: false });
        requests += r.requests;
        rows += r.rows;
        if (r.empty) newlyEmpty.push(date); else done++;
        if (pauseMs) await sleep(pauseMs);
      }
      if (newlyEmpty.length) await store.setKv(KV.emptyDates, [...empty, ...newlyEmpty].sort());
      return { pending: Math.max(0, todo.length - maxDays), sessionsLoaded: done, emptyDates: newlyEmpty, rows, requests };
    },

    async buildUniverse() {
      const { size, minValue, sessions } = universeConfig();
      const dates = (await store.getMarketDailyDates()).slice(-sessions);
      if (dates.length < sessions) throw new Error(`Cần ${sessions} phiên dữ liệu ngày, mới có ${dates.length}. Chạy backfillMarketDaily trước.`);
      const rows = await store.getMarketDailyRange({ from: dates[0], to: dates.at(-1) });
      const ranked = rankByLiquidity(rows, dates.length);

      const [pa, tv] = await Promise.allSettled([fetchProjectASectors(projectABase(), fetchImpl), fetchTradingViewSectors(fetchImpl)]);
      const projectA = pa.status === "fulfilled" ? pa.value : { scannerSectors: new Map(), universeSectors: new Map(), universeTickers: [] };
      const tradingView = tv.status === "fulfilled" ? tv.value : { sectors: new Map(), names: new Map() };
      const previous = (await store.getKv(KV.universe))?.value;
      const pinned = [...new Set([...DIVIDEND_STOCKS.map(([t]) => t), ...projectA.universeTickers, ...(projectA.universeTickers.length ? [] : previous?.pinned ?? [])])];
      const sectors = mergeSectors({ tradingView: tradingView.sectors, scanner: projectA.scannerSectors, universe: projectA.universeSectors });

      const tickers = buildUniverse({ ranked, pinned, sectors, names: tradingView.names, size, minValue });
      const value = {
        builtAt: new Date(now()).toISOString(),
        criteria: { size, minAvgValue: minValue, sessions, from: dates[0], to: dates.at(-1) },
        pinned,
        sectorSources: { projectA: pa.status === "fulfilled", tradingView: tv.status === "fulfilled" },
        tickers,
      };
      await store.setKv(KV.universe, value);
      return {
        total: tickers.length,
        byLiquidity: tickers.filter((t) => !t.pinned || t.avgValue20 >= minValue).length,
        pinnedOnly: tickers.filter((t) => t.pinned && t.avgValue20 < minValue).length,
        cutoff: ranked[Math.min(size, ranked.length) - 1]?.avgValue ?? null,
        sectorSources: value.sectorSources,
      };
    },

    async refreshFundamentals({ maxAgeDays = 7, limit = Number(process.env.SCANNER_FA_MAX_PER_RUN) || 400 } = {}) {
      const universe = (await store.getKv(KV.universe))?.value?.tickers ?? [];
      const tickers = universe.map((u) => u.ticker);
      const existing = await store.getFundamentals(tickers);
      const cutoff = now() - maxAgeDays * 86_400_000;
      const due = tickers.filter((t) => !existing.get(t) || Date.parse(existing.get(t).fetchedAt) < cutoff).slice(0, limit);
      let ok = 0, failed = 0;
      const results = await mapLimit(due, 2, async (ticker) => {
        const [income, balance] = await Promise.all([fetchQuarterlyIncome(ticker, fetchImpl), fetchQuarterlyBalance(ticker, fetchImpl)]);
        if (pauseMs) await sleep(pauseMs);
        // VCI lỗi tạm thời: giữ bản cũ thay vì ghi đè bằng "không có dữ liệu".
        if (!income.available && !balance.available && existing.get(ticker)) { failed++; return null; }
        income.available || balance.available ? ok++ : failed++;
        return { ticker, income: { ...income, quarters: income.quarters.slice(0, 6) }, balance: { ...balance, quarters: balance.quarters.slice(0, 6) } };
      });
      const entries = results.filter(Boolean);
      if (entries.length) await store.upsertFundamentals(entries);
      return { due: due.length, ok, failed, remaining: tickers.filter((t) => !existing.get(t)).length - entries.length };
    },

    async scanUniverse() {
      const universeDoc = (await store.getKv(KV.universe))?.value;
      if (!universeDoc?.tickers?.length) throw new Error("Chưa có universe. Chạy buildUniverse trước.");
      const universe = universeDoc.tickers;
      const dates = (await store.getMarketDailyDates()).slice(-HISTORY_SESSIONS);
      if (!dates.length) throw new Error("Chưa có dữ liệu ngày. Chạy backfillMarketDaily trước.");
      const rows = await store.getMarketDailyRange({ from: dates[0], to: dates.at(-1), symbols: universe.map((u) => u.ticker) });
      const barsByTicker = new Map();
      for (const r of rows) {
        if (!barsByTicker.has(r.symbol)) barsByTicker.set(r.symbol, []);
        barsByTicker.get(r.symbol).push(r);
      }
      const fundamentals = await store.getFundamentals(universe.map((u) => u.ticker));
      const index = await service.getOhlcv({ symbol: "VNINDEX", limit: 250 });
      const indexBars = index.bars.filter((b) => !b.partial);

      let events = [];
      let eventsOk = true;
      try {
        const headers = process.env.INTERNAL_HISTORICAL_API_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.INTERNAL_HISTORICAL_API_BYPASS_SECRET } : {};
        events = (await fetchJson(`${projectABase()}/api/sieu-quet-ai/events`, { headers, fetchImpl, timeoutMs: 20_000 }))?.events ?? [];
      } catch (error) {
        eventsOk = false;
        console.warn(`[scanner] Không đọc được sự kiện từ Project A: ${error.message}`);
      }
      const latestRows = await store.getMarketDailyByDate(dates.at(-1));
      const foreignNetBuySet = topForeignNetBuy(latestRows);

      const result = runScan({ universe, barsByTicker, fundamentals, indexBars, events, foreignNetBuySet, now: new Date(now()) });
      const doc = {
        generatedAt: new Date(now()).toISOString(),
        dataAsOf: dates.at(-1),
        source: "SSI",
        indexState: result.indexState,
        items: result.items,
        totalCount: result.items.length,
        meta: {
          universeSize: universe.length,
          universeBuiltAt: universeDoc.builtAt,
          skipped: result.skipped,
          fundamentalsCoverage: fundamentals.size,
          eventsLoaded: eventsOk ? events.length : null,
          indexSource: index.provenance?.source ?? null,
        },
      };
      await store.setKv(KV.latest, doc);
      if (result.skipped.length > universe.length * 0.2) {
        void notifyOps("scanner:skipped", `Siêu Quét bỏ qua ${result.skipped.length}/${universe.length} mã vì thiếu dữ liệu.`);
      }
      return { scanned: result.items.length, skipped: result.skipped.length, dataAsOf: doc.dataAsOf, eventsLoaded: doc.meta.eventsLoaded };
    },
  };

  return jobs;
}

/** Lịch chạy các job Siêu Quét (bổ sung vào scheduler). */
export const SCANNER_SCHEDULE = [
  { name: "syncMarketDaily", at: "15:20", tradingDayOnly: true },
  { name: "scanUniverse", at: "15:40", tradingDayOnly: true },
  { name: "refreshFundamentals", at: "09:00", weekdays: [6] },
  { name: "buildUniverse", at: "20:00", weekdays: [0] },
  { name: "backfillMarketDaily", at: "02:30", tradingDayOnly: false },
];

