// MarketDataService: điểm vào duy nhất cho dữ liệu thị trường Việt Nam.
// Đọc kho (store) trước, thiếu thì lấy qua SourceRouter (SSI -> dự phòng),
// ghi lại vào kho, và luôn trả kèm provenance để UI biết nguồn/độ mới.

import { marketConfig } from "./config.js";
import { expectsLiveTicks, lastCompletedSessionDate, vnDate, currentSession } from "./calendar.js";
import { ValidationError } from "./errors.js";
import { canonicalSymbol, isIndexSymbol, isValidSymbol, provenance } from "./normalizer.js";
import { SourceRouter } from "./sourceRouter.js";
import { addDays, daysBetween, TtlCache } from "./util.js";
import { notifyOps } from "./alerts.js";

const RANGE_DAYS = { "1d": 5, "5d": 10, "1mo": 31, "3mo": 93, "6mo": 186, "1y": 366, "2y": 731, "5y": 1827, "10y": 3653, max: 7305 };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60_000;

function dominantSource(bars, fallback) {
  const counts = {};
  for (const b of bars) counts[b.source ?? fallback] = (counts[b.source ?? fallback] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { source: entries[0]?.[0] ?? fallback, sources: counts };
}

const stripSource = ({ source, ...bar }) => bar;

export function resolveDateRange({ from, to, range, limit, today }) {
  const end = to || today || vnDate();
  if (!ISO_DATE.test(end)) throw new ValidationError("to phải có dạng YYYY-MM-DD.");
  let start = from;
  if (!start) {
    if (range) {
      if (!RANGE_DAYS[range]) throw new ValidationError(`range không hợp lệ (${Object.keys(RANGE_DAYS).join(", ")}).`);
      start = addDays(end, -RANGE_DAYS[range]);
    } else {
      // limit phiên giao dịch ≈ limit * 1.45 ngày lịch (cuối tuần + nghỉ lễ).
      start = addDays(end, -Math.ceil((limit || 250) * 1.45) - 10);
    }
  }
  if (!ISO_DATE.test(start)) throw new ValidationError("from phải có dạng YYYY-MM-DD.");
  if (start > end) throw new ValidationError("from phải nhỏ hơn hoặc bằng to.");
  if (daysBetween(start, end) > RANGE_DAYS.max) throw new ValidationError("Khoảng ngày tối đa 20 năm.");
  return { from: start, to: end };
}

export function createMarketDataService({ providers, store, router, now = Date.now }) {
  const cache = new TtlCache({ now });
  const service = { store, hub: null, cache };

  service.router = router ?? new SourceRouter(providers, {
    now,
    onBreakerChange: (event) => {
      store.recordSourceEvent(event).catch(() => {});
      if (event.provider.startsWith("ssi") && (event.to === "OPEN" || (event.to === "CLOSED" && event.from !== "CLOSED"))) {
        const msg = event.to === "OPEN"
          ? `${event.provider} lỗi ở ${event.dataset} -> chuyển sang nguồn dự phòng. Lỗi: ${event.lastError ?? "?"}`
          : `${event.provider} đã ổn định lại ở ${event.dataset} -> dùng SSI làm nguồn chính.`;
        void notifyOps(`breaker:${event.provider}:${event.dataset}:${event.to}`, msg);
      }
    },
  });

  function normSymbol(raw) {
    const symbol = canonicalSymbol(raw);
    if (!symbol || !isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
    return symbol;
  }

  // ---------- OHLCV ----------

  async function dailyBars(symbol, from, to) {
    const index = isIndexSymbol(symbol);
    const dataset = index ? "indexDaily" : "ohlcvDaily";
    const method = index ? "getIndexDaily" : "getDailyOhlcv";
    const expectedLast = lastCompletedSessionDate(new Date(now()));
    const wantedLast = to < expectedLast ? to : expectedLast;

    let cached = [];
    try {
      cached = await store.getBars(symbol, from, to);
    } catch (error) {
      console.warn(`[market] Đọc kho lỗi (${symbol}): ${error.message}`);
    }
    const coversStart = cached.length && cached[0].date <= addDays(from, 7);
    const coversEnd = cached.length && cached.at(-1).date >= wantedLast;
    if (coversStart && coversEnd) {
      const repaired = index ? await repairFlatIndexBars(symbol, cached) : cached;
      return { bars: repaired, ...dominantSource(repaired, "STORE"), fallbackReason: null, attempts: [], fromStore: true };
    }

    // Chỉ thiếu phần đuôi -> lấy thêm từ vài ngày trước bản ghi cuối.
    const fetchFrom = coversStart ? addDays(cached.at(-1).date, -3) : from;
    const result = await service.router.run(dataset, method, [symbol, fetchFrom, to]);
    if (index) result.data = await enrichIndexOhl(symbol, result.data, fetchFrom, to);
    try {
      await store.upsertBars(symbol, result.data, result.source);
    } catch (error) {
      console.warn(`[market] Ghi kho lỗi (${symbol}): ${error.message}`);
    }
    const merged = new Map(cached.map((b) => [b.date, b]));
    for (const bar of result.data) merged.set(bar.date, { ...bar, source: result.source });
    const bars = [...merged.values()].filter((b) => b.date >= from && b.date <= to).sort((a, b) => a.date.localeCompare(b.date));
    return { bars, ...dominantSource(bars, result.source), fallbackReason: result.fallbackReason, attempts: result.attempts };
  }

  /**
   * SSI DailyIndex nhiều giai đoạn chỉ có giá đóng cửa. Bổ sung open/high/low cho đúng ngày đó từ nguồn tham chiếu,
   * CHỈ khi giá đóng cửa hai nguồn khớp nhau; giá đóng cửa, khối lượng, giá trị vẫn là của SSI.
   * Thứ tự: VNDirect finfo (lệch < 0,2%) -> nguồn cũ Project A (lệch < 1%).
   */
  const INDEX_OHL_SOURCES = [
    { key: "vndirectIndex", tolerance: 0.002 },
    { key: "legacy", tolerance: 0.01 },
  ];

  async function indexReferences(symbol, from, to) {
    const out = [];
    for (const { key, tolerance } of INDEX_OHL_SOURCES) {
      const p = providers[key];
      if (!p?.isConfigured?.()) continue;
      try {
        const rows = await cache.wrap(`${key}-index:${symbol}:${from}:${to}`, 10 * 60_000, () => p.getIndexDaily(symbol, from, to));
        out.push({ tolerance, byDate: new Map(rows.map((b) => [b.date, b])) });
      } catch (error) {
        console.warn(`[market] Không lấy được OHL tham chiếu (${key}) cho ${symbol}: ${error.message}`);
      }
    }
    return out;
  }

  async function enrichIndexOhl(symbol, bars, from, to) {
    if (!bars.some((b) => b.closeOnly)) return bars;
    const refs = await indexReferences(symbol, from, to);
    return bars.map(({ closeOnly, ...bar }) => {
      if (!closeOnly || !bar.close) return bar;
      for (const { tolerance, byDate } of refs) {
        const ref = byDate.get(bar.date);
        if (!ref || Math.abs(ref.close - bar.close) / bar.close >= tolerance) continue;
        return {
          ...bar,
          open: ref.open,
          high: Math.max(ref.high, bar.close, ref.open),
          low: Math.min(ref.low, bar.close, ref.open),
        };
      }
      return bar;
    });
  }

  /** Nến "dẹt" (O=H=L=C, có khối lượng) = SSI chỉ trả giá đóng cửa và chưa bổ sung được O/H/L lúc ghi kho. */
  const isFlatBar = (b) => b.open === b.close && b.high === b.close && b.low === b.close && (b.volume ?? 0) > 0;

  /**
   * Sửa nến chỉ số dẹt đã nằm sẵn trong kho (ghi từ trước khi có nguồn tham chiếu): bổ sung O/H/L rồi ghi đè kho.
   * Mỗi mã thử tối đa 1 lần / 30 phút để không gọi nguồn ngoài liên tục khi nguồn đó cũng thiếu dữ liệu.
   */
  async function repairFlatIndexBars(symbol, cached) {
    const flats = cached.filter(isFlatBar);
    if (!flats.length) return cached;
    const from = flats[0].date;
    const to = flats.at(-1).date;
    const fixed = await cache.wrap(`index-repair:${symbol}:${from}:${to}`, 30 * 60_000, async () => {
      const enriched = await enrichIndexOhl(symbol, flats.map((b) => ({ ...b, closeOnly: true })), from, to);
      const changed = enriched.filter((b) => !isFlatBar(b));
      if (changed.length) {
        const bySource = new Map();
        for (const b of changed) {
          const { source, ...bar } = b;
          const key = source ?? "SSI_FC_V2";
          if (!bySource.has(key)) bySource.set(key, []);
          bySource.get(key).push(bar);
        }
        for (const [source, list] of bySource) {
          try {
            await store.upsertBars(symbol, list, source);
          } catch (error) {
            console.warn(`[market] Ghi kho nến chỉ số đã sửa lỗi (${symbol}): ${error.message}`);
          }
        }
        console.log(`[market] Đã bổ sung O/H/L cho ${changed.length}/${flats.length} nến dẹt của ${symbol}.`);
      }
      return new Map(changed.map((b) => [b.date, b]));
    });
    return cached.map((b) => fixed.get(b.date) ?? b);
  }

  /** Nến hôm nay (chưa đóng) dựng từ quote stream, để biểu đồ thấy giá realtime. */
  function partialTodayBar(symbol, lastDate) {
    const today = vnDate(new Date(now()));
    if (lastDate >= today || !service.hub) return null;
    const session = currentSession(new Date(now()));
    if (["CLOSED", "PRE_OPEN"].includes(session) && lastCompletedSessionDate(new Date(now())) !== today) return null;
    const quote = service.hub.getFreshStreamQuote(symbol);
    if (!quote?.price || !String(quote.time ?? "").startsWith(today)) return null;
    return {
      date: today,
      open: quote.open ?? quote.price,
      high: quote.high ?? quote.price,
      low: quote.low ?? quote.price,
      close: quote.price,
      volume: quote.totalVolume ?? 0,
      value: quote.totalValue ?? null,
      partial: true,
    };
  }

  service.getOhlcv = async function getOhlcv(params) {
    const symbol = normSymbol(params.symbol ?? params.ticker);
    const resolution = String(params.resolution || "1D").toUpperCase();
    const limit = params.limit ? Math.min(Math.max(Number(params.limit) || 0, 1), 5000) : undefined;
    const cfg = marketConfig();

    if (resolution === "1M" || resolution === "1") {
      const date = params.to || vnDate(new Date(now()));
      if (!ISO_DATE.test(date)) throw new ValidationError("to phải có dạng YYYY-MM-DD.");
      const result = await cache.wrap(`intraday:${symbol}:${date}`, cfg.cacheTtlMs.ohlcvIntraday,
        () => service.router.run("ohlcvIntraday", "getIntradayOhlcv", [symbol, date]));
      const bars = limit ? result.data.slice(-limit) : result.data;
      return {
        symbol, ticker: symbol, resolution: "1m", adjusted: false, bars,
        provenance: provenance({ source: result.source, asOf: bars.at(-1)?.date ?? null, fallbackReason: result.fallbackReason, attempts: result.attempts }),
      };
    }
    if (resolution !== "1D" && resolution !== "D") throw new ValidationError("resolution hỗ trợ: 1D, 1m.");

    const { from, to } = resolveDateRange({ from: params.from, to: params.to, range: params.range, limit, today: vnDate(new Date(now())) });
    const adjusted = String(params.adjusted ?? "false") === "true";

    let out;
    let adjustedApplied = false;
    if (adjusted && !isIndexSymbol(symbol)) {
      try {
        const r = await cache.wrap(`adj:${symbol}:${from}:${to}`, cfg.cacheTtlMs.ohlcvDaily,
          () => service.router.run("ohlcvDaily", "getDailyOhlcvAdjusted", [symbol, from, to]));
        out = { bars: r.data, source: r.source, sources: { [r.source]: r.data.length }, fallbackReason: r.fallbackReason, attempts: r.attempts };
        adjustedApplied = true;
      } catch (error) {
        if (error?.kind === "client") throw error;
        out = null;
      }
    }
    if (!out) {
      out = await cache.wrap(`daily:${symbol}:${from}:${to}`, cfg.cacheTtlMs.ohlcvDaily, () => dailyBars(symbol, from, to));
    }

    let bars = out.bars.map(stripSource);
    const partial = !isIndexSymbol(symbol) && !params.from && !params.to ? partialTodayBar(symbol, bars.at(-1)?.date ?? "") : null;
    if (partial) bars.push(partial);
    if (limit) bars = bars.slice(-limit);

    const expectedLast = lastCompletedSessionDate(new Date(now()));
    const lastDate = bars.filter((b) => !b.partial).at(-1)?.date ?? null;
    // Cơ sở giá thật của chuỗi (xem adjusted/adjustedHistory.js): DailyOhlc của SSI KHÔNG phải giá danh nghĩa —
    // SSI chỉ áp hệ số của đợt quyền GẦN NHẤT cho toàn bộ lịch sử. Chuỗi điều chỉnh cộng dồn đúng: /api/market/ta-series.
    const priceBasis = isIndexSymbol(symbol) ? "INDEX_POINTS" : adjustedApplied ? "SSI_CLOSE_PRICE_ADJUSTED" : "SSI_LATEST_EVENT_ADJUSTED";
    return {
      symbol,
      ticker: symbol,
      resolution: "1D",
      adjusted: adjustedApplied,
      priceBasis,
      flatBars: isIndexSymbol(symbol) ? bars.filter(isFlatBar).length : undefined,
      bars,
      provenance: {
        ...provenance({
          source: out.source,
          asOf: lastDate,
          isStale: Boolean(lastDate && to >= expectedLast && lastDate < expectedLast),
          fallbackReason: out.fallbackReason ?? (adjusted && !adjustedApplied ? "ADJUSTED_UNAVAILABLE" : null),
          attempts: out.attempts ?? [],
        }),
        sources: out.sources,
        partialToday: Boolean(partial),
      },
    };
  };

  // ---------- Quote ----------

  service.fetchQuotesFromProviders = async function fetchQuotesFromProviders(symbols) {
    const result = await service.router.run("quotes", "getQuotes", [symbols]);
    return { quotes: result.data, source: result.source, fallbackReason: result.fallbackReason };
  };

  service.getQuotes = async function getQuotes(rawSymbols) {
    const symbols = [...new Set(rawSymbols.map(normSymbol))];
    if (!symbols.length || symbols.length > 200) throw new ValidationError("symbols cần 1–200 mã.");
    const quotes = {};
    const need = [];
    for (const symbol of symbols) {
      const live = service.hub?.getFreshStreamQuote(symbol);
      if (live) quotes[symbol] = live;
      else need.push(symbol);
    }
    let fallbackReason = null;
    if (need.length) {
      const key = `quotes:${need.sort().join(",")}`;
      try {
        const r = await cache.wrap(key, marketConfig().cacheTtlMs.quotes, () => service.router.run("quotes", "getQuotes", [need]));
        fallbackReason = r.fallbackReason;
        const isLive = expectsLiveTicks(new Date(now()));
        const today = vnDate(new Date(now()));
        for (const q of r.data) {
          quotes[q.symbol] = {
            ...q,
            provenance: provenance({
              source: r.source,
              asOf: q.time,
              isStale: isLive && !String(q.time ?? "").startsWith(today) && r.source !== "LEGACY",
              fallbackReason: r.fallbackReason,
            }),
          };
        }
      } catch (error) {
        if (error?.kind === "client") throw error;
        fallbackReason = "ALL_SOURCES_FAILED";
      }
    }
    return {
      quotes,
      missing: symbols.filter((s) => !quotes[s]),
      session: currentSession(new Date(now())),
      fallbackReason,
    };
  };

  // ---------- Chỉ số & độ rộng ----------

  service.fetchIndexFromProviders = async function fetchIndexFromProviders(code) {
    const r = await service.router.run("indexSnapshot", "getIndexSnapshot", [code]);
    return { snapshot: r.data, source: r.source, fallbackReason: r.fallbackReason };
  };

  service.getIndexSnapshot = async function getIndexSnapshot(rawCode) {
    const code = normSymbol(rawCode);
    const live = service.hub?.getFreshIndex(code);
    if (live) return live;
    const r = await cache.wrap(`index:${code}`, marketConfig().cacheTtlMs.indexSnapshot,
      () => service.router.run("indexSnapshot", "getIndexSnapshot", [code]));
    return {
      ...r.data,
      provenance: provenance({ source: r.source, asOf: r.data.time ?? r.data.date, fallbackReason: r.fallbackReason, attempts: r.attempts }),
    };
  };

  service.getBreadth = async function getBreadth(code = "VNINDEX") {
    const snap = await service.getIndexSnapshot(code);
    return {
      index: snap.code,
      advancers: snap.advances,
      decliners: snap.declines,
      noChanges: snap.noChanges,
      ceilings: snap.ceilings,
      floors: snap.floors,
      provenance: snap.provenance,
    };
  };

  // ---------- Danh mục mã ----------

  async function storedOrFetch({ cacheKey, ttlMs, readStore, writeStore, dataset, method, args = [] }) {
    return cache.wrap(cacheKey, ttlMs, async () => {
      try {
        const stored = await readStore();
        if (stored && now() - Date.parse(stored.updatedAt || 0) < DAY_MS) {
          return { data: stored.rows ?? stored.symbols, source: stored.source, fallbackReason: null, fromStore: true };
        }
      } catch (error) {
        console.warn(`[market] Đọc kho lỗi (${cacheKey}): ${error.message}`);
      }
      const r = await service.router.run(dataset, method, args);
      try {
        await writeStore(r.data, r.source);
      } catch (error) {
        console.warn(`[market] Ghi kho lỗi (${cacheKey}): ${error.message}`);
      }
      return r;
    });
  }

  service.getSecuritiesList = async function getSecuritiesList({ force = false } = {}) {
    if (force) cache.entries.delete("securities");
    return storedOrFetch({
      cacheKey: "securities",
      ttlMs: marketConfig().cacheTtlMs.securities,
      readStore: () => (force ? null : store.getSecurities()),
      writeStore: (rows, source) => store.setSecurities(rows, source),
      dataset: "securities",
      method: "getSecurities",
    });
  };

  service.getIndexComponents = async function getIndexComponents(rawCode, { force = false } = {}) {
    const code = normSymbol(rawCode);
    if (force) cache.entries.delete(`components:${code}`);
    const r = await storedOrFetch({
      cacheKey: `components:${code}`,
      ttlMs: marketConfig().cacheTtlMs.indexComponents,
      readStore: () => (force ? null : store.getIndexComponents(code)),
      writeStore: (symbols, source) => store.setIndexComponents(code, symbols, source),
      dataset: "indexComponents",
      method: "getIndexComponents",
      args: [code],
    });
    return { index: code, symbols: r.data, provenance: provenance({ source: r.source, fallbackReason: r.fallbackReason }) };
  };

  service.getSecurities = async function getSecurities({ exchange, index, q } = {}) {
    const [r, sectors] = await Promise.all([service.getSecuritiesList(), legacySectorMap()]);
    let rows = r.data.map((s) => (s.sector || !sectors.has(s.symbol) ? s : { ...s, sector: sectors.get(s.symbol) }));
    if (exchange) rows = rows.filter((s) => String(s.exchange || "").toUpperCase() === String(exchange).toUpperCase());
    if (index) {
      const members = new Set((await service.getIndexComponents(index)).symbols);
      rows = rows.filter((s) => members.has(s.symbol));
    }
    if (q) {
      const needle = String(q).toUpperCase();
      rows = rows.filter((s) => s.symbol.includes(needle) || String(s.name || "").toUpperCase().includes(needle));
    }
    return { securities: rows, provenance: provenance({ source: r.source, fallbackReason: r.fallbackReason }) };
  };

  /** Ngành từ nguồn cũ cho các mã mà SSI không có phân ngành (FC v2 không trả ICB). */
  async function legacySectorMap() {
    if (!providers.legacy?.isConfigured?.()) return new Map();
    try {
      const rows = await cache.wrap("legacy-sectors", 6 * 60 * 60_000, () => providers.legacy.getSecurities());
      return new Map(rows.filter((s) => s.sector).map((s) => [s.symbol, s.sector]));
    } catch {
      return new Map();
    }
  }

  /** Tương thích Project A GET /api/universe: { tickers: [{ ticker, sector, name }] } (VN30 + VN100). */
  service.getUniverse = async function getUniverse() {
    const cfg = marketConfig();
    const components = await Promise.allSettled(cfg.eodUniverseIndices.map((code) => service.getIndexComponents(code)));
    const symbols = new Set(cfg.eodExtraSymbols.map(canonicalSymbol));
    let source = null;
    for (const c of components) {
      if (c.status !== "fulfilled") continue;
      source ??= c.value.provenance.source;
      for (const s of c.value.symbols) symbols.add(s);
    }
    if (!symbols.size) {
      // Không lấy được thành phần chỉ số từ SSI: dùng nguyên universe của nguồn cũ.
      const legacy = await service.router.run("securities", "getSecurities", [], { only: ["legacy"] });
      return {
        tickers: legacy.data.map((s) => ({ ticker: s.symbol, sector: s.sector || "Khác", name: s.name ?? undefined })),
        provenance: provenance({ source: legacy.source, fallbackReason: "INDEX_COMPONENTS_UNAVAILABLE" }),
      };
    }
    const [securities, sectors] = await Promise.all([
      service.getSecuritiesList().then((r) => new Map(r.data.map((s) => [s.symbol, s]))).catch(() => new Map()),
      legacySectorMap(),
    ]);
    const tickers = [...symbols].sort().map((ticker) => {
      const info = securities.get(ticker);
      return { ticker, sector: info?.sector || sectors.get(ticker) || "Khác", name: info?.name ?? undefined, exchange: info?.exchange ?? undefined };
    });
    return { tickers, provenance: provenance({ source: source ?? "SSI" }) };
  };

  /** Tập mã đồng bộ EOD: VN30 + VN100 + mã cấu hình thêm + mã đang được theo dõi realtime. */
  service.getEodUniverse = async function getEodUniverse() {
    const { tickers } = await service.getUniverse();
    const set = new Set(tickers.map((t) => t.ticker));
    for (const s of service.hub?.trackedSymbols() ?? []) set.add(s);
    return [...set].sort();
  };

  service.getPriceLimits = async function getPriceLimits(date = vnDate(new Date(now()))) {
    if (!ISO_DATE.test(date)) throw new ValidationError("date phải có dạng YYYY-MM-DD.");
    return cache.wrap(`limits:${date}`, marketConfig().cacheTtlMs.priceLimits, async () => {
      const stored = await store.getPriceLimits(date).catch(() => null);
      if (stored?.rows?.length) return { date, limits: stored.rows, provenance: provenance({ source: stored.source }) };
      const r = await service.router.run("priceLimits", "getPriceLimits", [date]);
      await store.setPriceLimits(date, r.data, r.source).catch((e) => console.warn(`[market] Ghi kho giá trần/sàn lỗi: ${e.message}`));
      return { date, limits: r.data, provenance: provenance({ source: r.source, fallbackReason: r.fallbackReason }) };
    });
  };

  service.status = async function status() {
    return {
      time: new Date(now()).toISOString(),
      session: currentSession(new Date(now())),
      store: store.kind,
      sources: service.router.snapshot(),
      stream: service.hub?.status() ?? null,
      recentEvents: await store.getSourceEvents(20).catch(() => []),
    };
  };

  return service;
}
