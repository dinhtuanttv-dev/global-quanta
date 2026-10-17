// Elite 10 E0 (2026-10-17) — dựng dữ liệu phân tích kỹ thuật THẬT cho Elite 10 từ nến Gateway, cùng engine quant-core với tab
// TA VN-Index (cấu trúc thị trường, Order Block, FVG, VSA, Elliott GET). Thay route mô phỏng ta-vn-index/analyze của Project A,
// nơi SMC/VSA/Wyckoff/Elliott/ADX/RSI/MACD/Hội tụ là hằng số giống hệt nhau cho mọi mã (ADX 24,5 · RSI 58,3 · MACD 120 · 72).
// Phần chưa có engine thật thì để trống và ghi rõ (MISSING) — không bao giờ điền số mẫu.
import type { OhlcvBar } from "../ta-command-center/types";
import type { ChartEvent, OhlcBar, PriceZone, TaVnIndexResponse, Timeframe } from "../../types/taVnIndex";
import { computeStructure } from "../quant-core/structure";
import { detectFVG, detectOrderBlocks } from "../quant-core/zones";
import { detectVsa, type VsaType } from "../quant-core/vsa";
import { elliottState } from "../quant-core/elliott";
import { computeIndicatorBars } from "./indicators";

export const ELITE_TIMEFRAMES: Timeframe[] = ["D", "W"];

const VSA_VI: Record<VsaType, string> = {
  "Selling Climax": "Cao trào bán", "Buying Climax": "Cao trào mua", "Stopping Volume": "Khối lượng chặn đà giảm", Upthrust: "Upthrust (bẫy tăng)",
  Shakeout: "Rũ bỏ", "No Supply": "Không có cung", "No Demand": "Không có cầu", Absorption: "Hấp thụ",
};

/** Gộp nến ngày thành nến tuần (tuần ISO bắt đầu thứ Hai; ngày của nến tuần = phiên cuối tuần). */
export function toWeekly(bars: OhlcBar[]): OhlcBar[] {
  const out: OhlcBar[] = [];
  let key = "";
  for (const b of bars) {
    const d = new Date(`${b.time}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    const last = out[out.length - 1];
    if (monday !== key || !last) {
      out.push({ ...b });
      key = monday;
    } else {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
      last.time = b.time;
    }
  }
  return out;
}

export function buildEliteAnalysis(ticker: string, timeframe: Timeframe, daily: OhlcvBar[], opts: { priceBasis?: string; isIndex?: boolean } = {}): TaVnIndexResponse | null {
  const dailyBars: OhlcBar[] = daily
    .filter((b) => [b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0))
    .map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
  const priceSeries = timeframe === "W" ? toWeekly(dailyBars) : dailyBars;
  if (priceSeries.length < 30) return null;

  const qb = priceSeries.map((b) => ({ date: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const computedIndicators = computeIndicatorBars(priceSeries);
  const last = computedIndicators[computedIndicators.length - 1];

  // SMC — cùng engine quant-core với tab TA VN-Index: chỉ vùng còn hiệu lực.
  const structure = computeStructure(qb);
  const obs = detectOrderBlocks(qb, structure.events, structure.atr);
  const fvgs = detectFVG(qb, structure.atr, { isIndex: !!opts.isIndex });
  const lastDate = priceSeries[priceSeries.length - 1].time;
  const activeObs = obs.filter((o) => o.status === "ACTIVE");
  const openFvgs = fvgs.filter((f) => f.state === "OPEN" || f.state === "PARTIAL");
  const lastClose = priceSeries[priceSeries.length - 1].close;
  const zones: PriceZone[] = [
    ...activeObs.slice(-6).map((o, i): PriceZone => ({
      id: `ob-${o.index}-${i}`, kind: o.dir === "bullish" ? "order_block_bullish" : "order_block_bearish",
      priceTop: o.top, priceBottom: o.bottom, timeFrom: o.date, timeTo: lastDate,
      label: `${o.dir === "bullish" ? "OB tăng" : "OB giảm"} (${o.kind}) · chạm ${o.tests} lần`,
    })),
    ...openFvgs.slice(-4).map((f, i): PriceZone => ({
      id: `fvg-${f.index}-${i}`, kind: "fvg", priceTop: f.top, priceBottom: f.bottom, timeFrom: f.startDate, timeTo: lastDate,
      label: `FVG ${f.dir === "bullish" ? "tăng" : "giảm"} · lấp ${Math.round(f.filledPct * 100)}%`,
    })),
  ];
  const bearAbove = activeObs.filter((o) => o.dir === "bearish" && o.bottom >= lastClose).sort((a, b) => a.bottom - b.bottom)[0];
  const bosCount = structure.events.filter((e) => e.kind === "BOS" && e.index >= priceSeries.length - 120).length;

  // VSA — tín hiệu gần nhất trong 10 nến cuối.
  const vsaSignals = detectVsa(qb);
  const lastVsa = [...vsaSignals].reverse().find((s) => s.index >= priceSeries.length - 10);

  // Elliott — engine GET (E6) dùng chung với biểu đồ và tab TA VN-Index.
  const ell = elliottState(qb);

  const events: ChartEvent[] = [];
  const asOfDate = lastDate;
  const rsiV = last?.rsi14 ?? null, adxV = last?.adx ?? null, pdi = last?.plusDi ?? null, mdi = last?.minusDi ?? null;
  const ml = last?.macdLine ?? null, ms = last?.macdSignal ?? null, mh = last?.macdHistogram ?? null;
  const hv = (v: number | null) => (v == null ? { value: 0, source: "MISSING" as const } : { value: v, source: "HARD_DATA" as const });

  return {
    ticker, timeframe, asOfDate, priceSeries, computedIndicators,
    analysisIsMock: false, isMock: false,
    trendline: [],
    events,
    smc: {
      orderBlockCount: activeObs.length, fvgCount: openFvgs.length, bosCount,
      nearestBearishOb: bearAbove ? { priceLow: bearAbove.bottom, priceHigh: bearAbove.top } : null,
      zones, source: "HARD_DATA",
    },
    vsa: lastVsa
      ? { pattern: VSA_VI[lastVsa.type], detail: `Phiên ${lastVsa.date}: khối lượng ${lastVsa.volumeRatio.toFixed(1)}× TB, biên độ ${lastVsa.spreadRatio.toFixed(1)}× TB`, source: "HARD_DATA" }
      : { pattern: "Không có tín hiệu", detail: "Không có tín hiệu VSA trong 10 nến gần nhất.", source: "HARD_DATA" },
    // Wyckoff thật đến từ engine SMC/Wyckoff (/api/elite10/smc) — ở đây để trống, không điền pha mẫu.
    wyckoff: { phase: null, confidence: null, regimeGated: false, detail: "Chưa có kết quả Wyckoff cho khung này." },
    elliott: ell
      ? { waveLabel: ell.label, confidence: { value: ell.weight != null ? ell.weight * 100 : 0, source: ell.weight != null ? "ESTIMATED" : "MISSING" }, alternateCounts: 1 + ell.alternatives.length, regimeGated: false }
      : { waveLabel: "Chưa nhận diện được cấu trúc sóng còn hiệu lực", confidence: { value: 0, source: "MISSING" }, alternateCounts: 0, regimeGated: false },
    adx: { adx: hv(adxV), plusDi: hv(pdi), minusDi: hv(mdi), dominant: pdi == null || mdi == null ? "neutral" : pdi > mdi ? "plus" : mdi > pdi ? "minus" : "neutral" },
    rsi: { value: hv(rsiV), label: rsiV == null ? "Chưa đủ dữ liệu" : rsiV >= 70 ? "Quá mua" : rsiV <= 30 ? "Quá bán" : "Trung tính" },
    macd: { macd: hv(ml), signal: hv(ms), histogram: hv(mh), label: mh == null ? "Chưa đủ dữ liệu" : mh > 0 ? "Tích cực" : mh < 0 ? "Tiêu cực" : "Trung tính" },
    patternScanner: [],
    conflicts: [],
    formationCounters: [],
    // Hội tụ chỉ hiển thị khi engine thật trả về (useConfluenceEngine) — không có số dự phòng.
    confluence: null as unknown as TaVnIndexResponse["confluence"],
    ...(opts.priceBasis ? { priceDataSource: opts.priceBasis } : {}),
  } as TaVnIndexResponse;
}

