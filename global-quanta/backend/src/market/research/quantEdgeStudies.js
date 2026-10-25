import { MarketDataError } from "../errors.js";

// Các nghiên cứu Quant Edge dạng mô tả. Không phát khuyến nghị hay xác suất giao dịch.

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d = 4) => finite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;
const closeOf = (r) => Number(r?.closeAdj ?? r?.close);

function median(values) {
  const x = values.filter(finite).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = x.length >> 1;
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}

function pctChange(a, b) {
  return a > 0 && b > 0 ? b / a - 1 : null;
}

/**
 * Event reaction/absorption proxy/drift around one user-supplied event date.
 * Daily OHLCV cannot establish true order-book absorption; tick imbalance is shown separately.
 */
export function buildEventReactionStudy({ symbol, eventDate, eventLabel, stockBars, benchmarkBars, tickFlow = null, source = null, priceBasis = null, fallbackReason = null, eventTimestamp = null, eventTimeSource = null, sourceEventDate = null, timeMappingReason = null }) {
  const bars = [...stockBars].filter((b) => !b.partial).sort((a, b) => a.date.localeCompare(b.date));
  const benchmark = new Map(benchmarkBars.filter((b) => !b.partial).map((b) => [b.date, b]));
  const i = bars.findIndex((b) => b.date === eventDate);
  if (i < 20) throw new MarketDataError("Cần tối thiểu 20 phiên trước sự kiện và phải có đúng ngày giao dịch sự kiện trong chuỗi giá.", { kind: "client", statusCode: 422 });
  if (!benchmark.has(eventDate)) throw new MarketDataError("Thiếu dữ liệu VN-Index tại ngày sự kiện.", { kind: "client", statusCode: 422 });

  const day = bars[i], prev = bars[i - 1], bDay = benchmark.get(eventDate), bPrev = benchmark.get(bars[i - 1].date);
  const stockEventReturn = pctChange(closeOf(prev), closeOf(day));
  const benchmarkEventReturn = bPrev ? pctChange(closeOf(bPrev), closeOf(bDay)) : null;
  const priorVolumes = bars.slice(i - 20, i).map((b) => Number(b.volume)).filter((v) => v > 0);
  const typicalVolume = median(priorVolumes);
  const volumeRatio = typicalVolume > 0 && Number(day.volume) > 0 ? Number(day.volume) / typicalVolume : null;
  const range = Number(day.high) - Number(day.low);
  const closeLocation = range > 0 ? (Number(day.close) - Number(day.low)) / range : null;

  const drift = [3, 5, 10, 20].map((horizon) => {
    const end = bars[i + horizon];
    const b0 = benchmark.get(eventDate), b1 = end && benchmark.get(end.date);
    if (!end || !b1) return { horizon, status: "insufficient_data", stockReturn: null, benchmarkReturn: null, excessReturn: null };
    const stockReturn = pctChange(closeOf(day), closeOf(end));
    const benchmarkReturn = pctChange(closeOf(b0), closeOf(b1));
    return { horizon, status: stockReturn === null || benchmarkReturn === null ? "insufficient_data" : "descriptive", stockReturn: round(stockReturn), benchmarkReturn: round(benchmarkReturn), excessReturn: round(stockReturn - benchmarkReturn) };
  });

  let tick = null;
  if (tickFlow?.minutes?.length) {
    const buy = tickFlow.minutes.reduce((s, m) => s + Number(m.buy || 0), 0);
    const sell = tickFlow.minutes.reduce((s, m) => s + Number(m.sell || 0), 0);
    const unknown = tickFlow.minutes.reduce((s, m) => s + Number(m.unknown || 0), 0);
    const classified = buy + sell;
    const total = classified + unknown;
    tick = {
      minutes: tickFlow.minutes.length, buy, sell, unknown,
      classifiedShare: total > 0 ? round(classified / total) : null,
      signedImbalance: classified > 0 ? round((buy - sell) / classified) : null,
      method: "Lee–Ready tick classification; proxy, not participant identity",
    };
  }

  const warnings = [];
  if (eventTimeSource === "date_only_legacy") warnings.push("Chỉ có ngày sự kiện, không có timestamp phát hành; không thể xác định chính xác phiên đầu tiên thị trường biết tin.");
  if (timeMappingReason === "next_full_session_daily_data") warnings.push("Tin được ghi nhận sau khi phiên bắt đầu; do chỉ có dữ liệu ngày, nghiên cứu dùng phiên đầy đủ kế tiếp và không đo phản ứng intraday.");
  if (priorVolumes.length < 15) warnings.push("Mẫu khối lượng nền dưới 15 phiên.");
  if (!tick) warnings.push("Không có tick-flow đã lưu cho ngày sự kiện; hấp thụ chỉ có thể xem qua proxy OHLCV.");
  if (priceBasis) warnings.push(`Cơ sở giá: ${priceBasis}. Kiểm tra cảnh báo điều chỉnh giá từ nguồn.`);
  if (fallbackReason) warnings.push(`Nguồn dữ liệu báo fallback: ${fallbackReason}.`);

  return {
    kind: "reaction_study", symbol, eventDate, eventLabel, status: "descriptive_only",
    source, priceBasis,
    event: {
      stockReturn: round(stockEventReturn), benchmarkReturn: round(benchmarkEventReturn),
      excessReturn: stockEventReturn !== null && benchmarkEventReturn !== null ? round(stockEventReturn - benchmarkEventReturn) : null,
      volume: Number(day.volume) || null, priorMedianVolume20: typicalVolume, abnormalVolumeRatio: round(volumeRatio),
      intradayRangePct: Number(day.close) > 0 ? round(range / Number(day.close)) : null,
      closeLocation: round(closeLocation), tickFlow: tick,
      absorptionInterpretation: tick ? "Hiển thị imbalance và phản ứng giá như hai quan sát; không suy luận hấp thụ nếu thiếu dữ liệu sổ lệnh/chuỗi thời gian khớp lệnh." : "Chỉ có proxy OHLCV; không thể xác nhận hấp thụ cung/cầu.",
    },
    drift,
    meta: {
      asOf: bars.at(-1)?.date ?? null, receivedAt: new Date().toISOString(),
      sessionsBefore: i, sessionsAfter: bars.length - i - 1, benchmark: "VNINDEX",
      eventTimestamp, eventTimeSource, sourceEventDate, eventSessionDate: eventDate,
      timeMappingReason, methodVersion: "qe-reaction-v2-daily-session-map", warnings,
    },
  };
}

function medianValue(rows, valueFn) {
  return median(rows.map(valueFn).filter(finite));
}

/**
 * Current-universe descriptive leadership persistence. Sector labels are current labels,
 * so output must not be treated as a point-in-time backtest or calibrated forecast.
 */
export function buildLeadershipStudy({ marketRows, universe, indexBars, regimeRows, lookback = 63, horizon = 20 }) {
  const sectorBySymbol = new Map(universe.map((x) => [String(x.ticker).toUpperCase(), x.sector || "Khác"]));
  const benchmark = [...indexBars].filter((b) => !b.partial).sort((a, b) => a.date.localeCompare(b.date));
  const dates = benchmark.map((b) => b.date);
  const benchAt = new Map(benchmark.map((b) => [b.date, closeOf(b)]));
  const regimeAt = new Map(regimeRows.map((r) => [String(r.trading_date ?? r.date).slice(0, 10), r.regime]));
  const bySymbol = new Map();
  for (const row of marketRows) {
    const symbol = String(row.symbol ?? row.ticker ?? "").toUpperCase();
    if (!sectorBySymbol.has(symbol)) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Map());
    bySymbol.get(symbol).set(String(row.date ?? row.trading_date).slice(0, 10), closeOf(row));
  }

  const dailyRanks = [];
  const first = Math.max(horizon, dates.length - Math.max(lookback, 1));
  for (let j = first; j < dates.length; j++) {
    const date = dates[j], priorDate = dates[j - horizon];
    const b0 = benchAt.get(priorDate), b1 = benchAt.get(date);
    if (!(b0 > 0) || !(b1 > 0)) continue;
    const buckets = new Map();
    for (const [symbol, series] of bySymbol) {
      const p0 = series.get(priorDate), p1 = series.get(date);
      if (!(p0 > 0) || !(p1 > 0)) continue;
      const excess = (p1 / p0 - 1) - (b1 / b0 - 1);
      const sector = sectorBySymbol.get(symbol);
      if (!buckets.has(sector)) buckets.set(sector, []);
      buckets.get(sector).push({ symbol, excess });
    }
    const sectors = [...buckets.entries()]
      .filter(([, rows]) => rows.length >= 3)
      .map(([sector, rows]) => ({ sector, excess: medianValue(rows, (x) => x.excess), n: rows.length, stocks: rows }))
      .filter((x) => x.excess !== null)
      .sort((a, b) => b.excess - a.excess);
    if (sectors.length < 2) continue;
    const topCut = Math.max(1, Math.ceil(sectors.length * 0.25));
    sectors.forEach((s, rank) => { s.rank = rank + 1; s.topQuartile = rank < topCut; });
    dailyRanks.push({ date, regime: regimeAt.get(date) ?? "UNKNOWN", sectors });
  }

  const current = dailyRanks.at(-1);
  if (!current) return { status: "insufficient_data", reason: "Chưa đủ dữ liệu đồng bộ cho benchmark, mã và ngành.", meta: { lookback, horizon, rows: marketRows.length } };
  const regimes = ["UPTREND", "SIDEWAY", "DOWNTREND", "UNKNOWN"];
  const summaries = current.sectors.map((s) => {
    const perRegime = {};
    for (const regime of regimes) {
      const sample = dailyRanks.filter((d) => d.regime === regime).slice(-lookback);
      const hits = sample.filter((d) => d.sectors.find((x) => x.sector === s.sector)?.topQuartile).length;
      const available = sample.filter((d) => d.sectors.some((x) => x.sector === s.sector)).length;
      perRegime[regime] = { topQuartileRate: available ? round(hits / available) : null, sessions: available };
    }
    const history = dailyRanks.slice(-lookback);
    const hits = history.filter((d) => d.sectors.find((x) => x.sector === s.sector)?.topQuartile).length;
    const available = history.filter((d) => d.sectors.some((x) => x.sector === s.sector)).length;
    return {
      sector: s.sector, rank: s.rank, sectorCount: current.sectors.length,
      excessReturn20: round(s.excess), sampleStocks: s.n,
      topQuartileRate: available ? round(hits / available) : null,
      persistenceSessions: available, byRegime: perRegime,
      leaders: [...s.stocks].sort((a, b) => b.excess - a.excess).slice(0, 3).map((x) => ({ symbol: x.symbol, excessReturn20: round(x.excess) })),
    };
  });
  return {
    status: "descriptive_only", asOf: current.date, currentRegime: current.regime,
    horizonSessions: horizon, observationSessions: dailyRanks.length,
    sectors: summaries,
    meta: {
      universe: "Current configured universe", sectorMap: "Current sector classification",
      benchmark: "VNINDEX", methodVersion: "qe-leadership-v1",
      warnings: ["Phân loại ngành và universe hiện tại được áp ngược cho lịch sử; kết quả mô tả, chưa phải kiểm định point-in-time hoặc dự báo.", "Lợi suất chưa trừ phí, trượt giá hoặc giới hạn thanh khoản."],
      dataCoverage: { marketRows: marketRows.length, universeSymbols: universe.length, dates: dailyRanks.length, firstDate: dailyRanks[0]?.date ?? null, lastDate: current.date },
    },
  };
}

