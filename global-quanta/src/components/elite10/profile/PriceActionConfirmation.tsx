import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { useAdjustedDaily } from "../../../hooks/elite10/useAdjustedDaily";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { analyzePriceAction, type Bar, type PASetup, type TrendState } from "../../../lib/price-action/index.ts";
import type { PriceActionEvidence } from "../../../lib/evidenceBrain/snapshot";
import { observeResearchPrice } from "../../../lib/evidenceBrain/priceObservation";

interface UniverseResponse { tickers: { ticker: string; exchange?: string | null; name?: string | null }[] }
type Venue = "HOSE" | "HNX" | "UPCOM";
const INDICES = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX", "VN100"]);

function normalizeVenue(exchange: string | null | undefined): Venue | null {
  const value = (exchange ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (value === "HOSE" || value === "HSX") return "HOSE";
  if (value === "HNX") return "HNX";
  if (value === "UPCOM" || value === "UPCO") return "UPCOM";
  return null;
}

function tickSize(venue: Venue, price: number): number {
  return venue === "HOSE" ? price < 10_000 ? 10 : price < 50_000 ? 50 : 100 : 100;
}

function limitPct(venue: Venue): number {
  return venue === "HOSE" ? 0.07 : venue === "HNX" ? 0.1 : 0.15;
}

function isClosed(date: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === name)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (date < today) return true;
  if (date > today) return false;
  return Number(part("hour")) > 15 || (Number(part("hour")) === 15 && Number(part("minute")) >= 15);
}

const TREND_LABEL: Record<TrendState, string> = { bullish: "Tăng", bearish: "Giảm", mixed: "Hỗn hợp", undetermined: "Chưa xác định" };
const dateLabel = (date?: string | null) => date ? date.slice(0, 10).split("-").reverse().join("/") : "—";
const priceLabel = (price: number | null) => price == null ? "—" : price.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const setupLabel = (setup: PASetup) => setup.state === "triggered" ? "Đã vượt ngưỡng kích hoạt" : "Chờ giá đóng cửa vượt ngưỡng";

export default function PriceActionConfirmation({ ticker, onEvidence, evidenceOnly = false }: {
  ticker: string; onEvidence?: (evidence: PriceActionEvidence) => void; evidenceOnly?: boolean;
}) {
  const { bars: rawBars, priceBasis, isLoading, error, warnings, gapRepairs } = useAdjustedDaily(ticker, evidenceOnly);
  const { data: universe, error: universeError, isLoading: universeLoading } = useSWR<UniverseResponse>("market-universe-price-action", () => fetchMarketJson<UniverseResponse>("/api/market/universe"), {
    revalidateOnFocus: false, dedupingInterval: 300_000,
  });
  const instrument = useMemo(() => universe?.tickers.find((row) => row.ticker.toUpperCase() === ticker.toUpperCase()), [universe, ticker]);
  const venue = normalizeVenue(instrument?.exchange);
  const validBars = useMemo(() => rawBars.filter((bar): bar is typeof bar & { close: number } =>
    [bar.open, bar.high, bar.low, bar.close].every((value) => value != null && Number.isFinite(value) && value > 0)
      && bar.high >= Math.max(bar.open, bar.close ?? Infinity)
      && bar.low <= Math.min(bar.open, bar.close ?? -Infinity)
      && bar.high >= bar.low), [rawBars]);
  const lastBar = validBars[validBars.length - 1];
  const closed = lastBar ? isClosed(lastBar.date) : false;
  const bars = useMemo<Bar[]>(() => validBars.map((bar) => ({
    date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
  })), [validBars]);
  const result = useMemo(() => {
    if (evidenceOnly || !bars.length || INDICES.has(ticker.toUpperCase())) return null;
    return analyzePriceAction(bars, {
      symbol: ticker.toUpperCase(), timeframe: "D", priceBasis: priceBasis ?? "unknown",
      source: "Market Gateway /api/market/ta-series", asOf: lastBar?.date ?? "unknown",
      isIndex: false, limitPct: venue ? limitPct(venue) : null, isClosed: closed,
      ...(venue ? { tickSize: (price: number) => tickSize(venue, price) } : {}),
    });
  }, [bars, closed, lastBar?.date, priceBasis, ticker, venue, evidenceOnly]);

  const isIndex = INDICES.has(ticker.toUpperCase());

  const latestDate = result?.trend.asOfDate;
  const triggered = result?.setups.find((setup) => setup.direction === "bullish" && setup.state === "triggered" && setup.stateDate === latestDate) ?? null;
  const pending = result?.setups.filter((setup) => setup.direction === "bullish" && setup.state === "forming").sort((a, b) => b.confirmedIndex - a.confirmedIndex)[0] ?? null;
  const setup = triggered ?? pending;
  const confirmed = Boolean(result?.status === "ready" && triggered && result.trend.state === "bullish" && venue && priceBasis && !error && !universeError);
  const patterns = result?.patterns.filter((pattern) => pattern.confirmedDate === latestDate).map((pattern) => pattern.id.replace(/_/g, " ")).slice(0, 2) ?? [];
  const blockers = [
    !venue ? "Chưa xác định sàn; không phát xác nhận theo bước giá" : null,
    !priceBasis ? "Thiếu cơ sở giá" : null,
    !closed && lastBar ? "Nến ngày cuối chưa đóng; chỉ phân tích các nến hoàn tất" : null,
    error ? "Không tải được chuỗi giá điều chỉnh" : null,
    universeError ? "Không xác minh được mã với danh sách thị trường" : null,
  ].filter((item): item is string => Boolean(item));
  const evidence = useMemo<PriceActionEvidence>(() => {
    const state: PriceActionEvidence["state"] = isIndex ? "NOT_APPLICABLE"
      : isLoading || universeLoading || (!universe && !universeError) ? "LOADING"
        : !result || result.status !== "ready" || error || universeError ? "INSUFFICIENT"
          : confirmed ? "TRIGGERED" : triggered ? "INSUFFICIENT" : pending ? "FORMING" : result.setups.some((item) => item.direction === "bullish" && item.state === "invalidated") ? "INVALIDATED"
            : result.setups.some((item) => item.direction === "bullish" && item.state === "expired") ? "EXPIRED" : "UNKNOWN";
    return {
      ticker: ticker.toUpperCase(), state, trend: result?.trend.state ?? null, asOf: latestDate ?? lastBar?.date ?? null,
      priceBasis, venue, barClosed: lastBar ? closed : null, confirmed,
      setup: setup ? { kind: setup.kind, stateDate: setup.stateDate, entryReference: setup.entryReference, invalidationLevel: setup.invalidationLevel, target: setup.targetReferences[0]?.price ?? null } : null,
      patterns, blockers, source: "Market Gateway /api/market/ta-series", methodVersion: "price-action-core-v1",
      loading: !isIndex && (isLoading || universeLoading), error: error ? String(error) : universeError ? String(universeError) : null,
      tickerVerified: Boolean(instrument), instrumentName: instrument?.name ?? null,
    };
  }, [ticker, isIndex, isLoading, universeLoading, result, triggered, pending, latestDate, lastBar?.date, priceBasis, venue, closed, confirmed, setup, patterns.join("|"), blockers.join("|"), error, universeError, instrument]);
  const roomEvidence = useMemo(() => evidenceOnly ? observeResearchPrice({
    ticker: ticker.toUpperCase(), rawBars, priceBasis, instrument: instrument ?? null, observedAt: new Date().toISOString(),
    loading: Boolean(isLoading || universeLoading || (!universe && !universeError)),
    priceError: error ? String(error) : null, instrumentError: universeError ? String(universeError) : null,
    warnings, repairDates: (gapRepairs ?? []).map((entry) => entry.date),
  }).evidence : evidence, [evidenceOnly, ticker, rawBars, priceBasis, instrument, isLoading, universeLoading, universe, universeError, error, warnings, gapRepairs, evidence]);
  useEffect(() => { onEvidence?.(roomEvidence); }, [roomEvidence, onEvidence]);
  if (evidenceOnly) return null;
  if (isIndex) return <div className="mt-2 rounded border border-white/10 p-2 text-[10px] text-slate-500" data-testid="pa-confirmation">Price Action xác nhận mua cổ phiếu không áp dụng cho chỉ số {ticker}.</div>;
  const label = isLoading || universeLoading ? "Đang tải dữ liệu" : error || universeError || !result || result.status !== "ready" ? "Chưa đủ dữ liệu tin cậy" : "Theo dõi xác nhận";

  return (
    <div className="mt-3 rounded-md border border-cyan-500/20 bg-slate-950/50 p-2.5 text-slate-200" data-testid="pa-confirmation">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">Price Action · xác nhận kỹ thuật</p><p className="text-[9px] text-slate-500">OHLCV ngày điều chỉnh · {priceBasis ?? "chưa rõ cơ sở giá"} · đến {dateLabel(latestDate ?? lastBar?.date)}</p></div>
        <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${confirmed ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300" : "border-white/15 text-slate-300"}`} data-testid="pa-status">{confirmed ? "XÁC NHẬN KỸ THUẬT" : label}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <div className="rounded border border-white/10 p-1.5"><p className="text-[9px] text-slate-500">Cấu trúc ngày</p><p className="text-[10px] font-semibold">{result ? TREND_LABEL[result.trend.state] : "—"}</p></div>
        <div className="rounded border border-white/10 p-1.5"><p className="text-[9px] text-slate-500">Mẫu nến gần nhất</p><p className="text-[10px] font-semibold">{patterns.length ? patterns.join(" · ") : "Không có"}</p></div>
        <div className="rounded border border-white/10 p-1.5"><p className="text-[9px] text-slate-500">Sàn / bước giá</p><p className="text-[10px] font-semibold">{venue ? `${venue} · ${venue === "HOSE" ? "10/50/100 đ" : "100 đ"}` : "Chưa xác định"}</p></div>
        <div className="rounded border border-white/10 p-1.5"><p className="text-[9px] text-slate-500">Setup mua</p><p className="text-[10px] font-semibold">{setup ? setupLabel(setup) : "Chưa có setup"}</p></div>
      </div>
      {setup && <p className="mt-2 rounded border border-white/10 px-2 py-1 text-[9px]" data-testid="pa-setup">PIN REJECTION · {dateLabel(setup.stateDate)} · kích hoạt {priceLabel(setup.entryReference)} · vô hiệu hóa {priceLabel(setup.invalidationLevel)}{setup.targetReferences[0] ? ` · mục tiêu cấu trúc ${priceLabel(setup.targetReferences[0].price)}` : ""}</p>}
      {blockers.length > 0 && <p className="mt-2 text-[9px] leading-relaxed text-amber-200/90">{blockers.join(" · ")}</p>}
      <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Chỉ xác nhận khi pin bar tại vùng hỗ trợ được kích hoạt bằng giá đóng cửa, cấu trúc tăng, cơ sở giá và sàn đã biết. Không cộng Điểm Elite, không thay thế kiểm tra thanh khoản/quản trị rủi ro và không tự đặt lệnh.</p>
    </div>
  );
}
