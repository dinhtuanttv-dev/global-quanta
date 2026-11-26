// pa-book-2 (26/11/2026) — Hồ sơ 360° · Doanh nghiệp: "Price Action × Khối lượng · xác nhận kỹ thuật".
// Engine src/lib/price-action (định nghĩa mẫu hình theo sách, vùng/xu hướng không nhìn trước, cổng lời/lỗ ≥ 1,5, khối lượng ở phiên kích hoạt).
// Sàn / bước giá tra ở danh sách đủ mã (/api/market/securities) khi mã không thuộc /api/market/universe (chỉ ~100 mã chỉ số) —
// trước đây mọi mã ngoài 100 mã (VD NAF trong danh mục Elite HL) không bao giờ xác nhận được.
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { useAdjustedDaily } from "../../../hooks/elite10/useAdjustedDaily";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { analyzePriceAction, PATTERN_VI, SETUP_VI, summarizeBuy, PRICE_ACTION_ENGINE_VERSION, type Bar, type PASetup, type TrendState } from "../../../lib/price-action/index.ts";
import { PA_VOL_R1 } from "../../../lib/price-action/validation.ts";
import type { PriceActionEvidence } from "../../../lib/evidenceBrain/snapshot";
import { observeResearchPrice } from "../../../lib/evidenceBrain/priceObservation";

interface Instrument { ticker: string; exchange?: string | null; name?: string | null }
interface UniverseResponse { tickers: Instrument[] }
type Venue = "HOSE" | "HNX" | "UPCOM";
const INDICES = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX", "VN100"]);

/** Danh sách mã: universe (có tên, ngành) trước, bổ sung mọi mã còn lại từ danh sách chứng khoán đầy đủ (có sàn). */
export async function loadInstruments(): Promise<UniverseResponse> {
  const [u, s] = await Promise.allSettled([
    fetchMarketJson<UniverseResponse>("/api/market/universe"),
    fetchMarketJson<{ securities?: { symbol: string; exchange?: string | null; name?: string | null }[] }>("/api/market/securities"),
  ]);
  const map = new Map<string, Instrument>();
  if (s.status === "fulfilled") for (const r of s.value?.securities ?? []) map.set(r.symbol.toUpperCase(), { ticker: r.symbol, exchange: r.exchange, name: r.name });
  if (u.status === "fulfilled") for (const r of u.value?.tickers ?? []) {
    const k = r.ticker.toUpperCase(), prev = map.get(k);
    map.set(k, { ...prev, ...r, exchange: r.exchange ?? prev?.exchange ?? null, name: r.name ?? prev?.name ?? null });
  }
  if (!map.size && u.status === "rejected" && s.status === "rejected") throw u.reason;
  return { tickers: [...map.values()] };
}

function normalizeVenue(exchange: string | null | undefined): Venue | null {
  const value = (exchange ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (value === "HOSE" || value === "HSX") return "HOSE";
  if (value === "HNX") return "HNX";
  if (value === "UPCOM" || value === "UPCO") return "UPCOM";
  return null;
}
const tickSize = (venue: Venue, price: number) => (venue === "HOSE" ? (price < 10_000 ? 10 : price < 50_000 ? 50 : 100) : 100);
const limitPct = (venue: Venue) => (venue === "HOSE" ? 0.07 : venue === "HNX" ? 0.1 : 0.15);

function isClosed(date: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === name)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (date < today) return true;
  if (date > today) return false;
  return Number(part("hour")) > 15 || (Number(part("hour")) === 15 && Number(part("minute")) >= 15);
}

const TREND_LABEL: Record<TrendState, string> = { bullish: "Tăng (HH + HL)", bearish: "Giảm (LH + LL)", mixed: "Hỗn hợp", undetermined: "Chưa xác định" };
const dateLabel = (date?: string | null) => (date ? date.slice(0, 10).split("-").reverse().join("/") : "—");
const px = (price: number | null | undefined) => (price == null || !Number.isFinite(price) ? "—" : price.toLocaleString("vi-VN", { maximumFractionDigits: price >= 1000 ? 0 : 2 }));
const x2 = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`);
const ok = (b: boolean | null | undefined) => (b == null ? "text-slate-400" : b ? "text-emerald-300" : "text-amber-300");

function SetupCard({ setup, lastIndex }: { setup: PASetup; lastIndex: number }) {
  const ago = setup.state === "triggered" ? lastIndex - setup.stateIndex : null;
  const v = setup.volume, target = setup.targetReferences[0];
  return (
    <div className="mt-2 rounded border border-white/10 p-2 text-[11px]" data-testid="pa-setup">
      <p className="font-semibold text-slate-100">
        {SETUP_VI[setup.kind]} · {PATTERN_VI[setup.patternId]} · mẫu hình {dateLabel(setup.confirmedDate)}
        <span className="ml-1 font-normal text-slate-400">
          {setup.state === "triggered" ? (ago === 0 ? "· kích hoạt hôm nay" : `· kích hoạt ${ago} phiên trước (${dateLabel(setup.stateDate)})`) : "· chờ giá đóng cửa vượt mức kích hoạt"}
        </span>
      </p>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 md:grid-cols-4">
        <span>Kích hoạt <b className="text-slate-100">{px(setup.entryReference)}</b></span>
        <span>Cắt lỗ <b className="text-slate-100">{px(setup.invalidationLevel)}</b></span>
        <span title={target?.basis}>Mục tiêu <b className="text-slate-100">{px(target?.price)}</b>{target ? "" : " (chưa có kháng cự phía trên)"}</span>
        <span>Lời : lỗ <b className={ok(setup.rewardRiskOk)}>{setup.rewardRisk == null ? "—" : `${x2(setup.rewardRisk, 1)} : 1`}</b>
          {setup.rewardRiskOk === false && <span className="text-amber-300"> · dưới 1,5 — sách khuyên bỏ qua</span>}</span>
      </div>
      <p className="mt-1 text-slate-300" data-testid="pa-volume">
        Khối lượng: RVOL phiên mẫu hình <b>{x2(v.patternRvol)}×</b>
        {setup.state === "triggered" && <> · phiên kích hoạt <b className={ok(v.triggerRvol == null ? null : v.triggerRvol >= 1.5)}>{x2(v.triggerRvol)}×</b>
          {" "}· KL phiên tăng / giảm 20 phiên <b className={ok(v.upDownRatio == null ? null : v.upDownRatio >= 1)}>{x2(v.upDownRatio)}</b>
          {" "}→ <b className={ok(v.confirmed)}>{v.confirmed == null ? "thiếu dữ liệu khối lượng" : v.confirmed ? "khối lượng xác nhận" : "khối lượng CHƯA xác nhận"}</b></>}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-500">{setup.evidence.map((e) => e.split(":")[1] || e).join(" · ")} · {setup.stateReason}</p>
    </div>
  );
}

export default function PriceActionConfirmation({ ticker, onEvidence, evidenceOnly = false }: {
  ticker: string; onEvidence?: (evidence: PriceActionEvidence) => void; evidenceOnly?: boolean;
}) {
  const { bars: rawBars, priceBasis, isLoading, error, warnings, gapRepairs } = useAdjustedDaily(ticker, evidenceOnly);
  const { data: universe, error: universeError, isLoading: universeLoading } = useSWR<UniverseResponse>("market-universe-price-action", loadInstruments, {
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
  const bars = useMemo<Bar[]>(() => validBars.map((bar) => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume })), [validBars]);
  const isIndex = INDICES.has(ticker.toUpperCase());
  const result = useMemo(() => {
    if (evidenceOnly || !bars.length || isIndex) return null;
    return analyzePriceAction(bars, {
      symbol: ticker.toUpperCase(), timeframe: "D", priceBasis: priceBasis ?? "unknown",
      source: "Market Gateway /api/market/ta-series", asOf: lastBar?.date ?? "unknown",
      isIndex: false, limitPct: venue ? limitPct(venue) : null, isClosed: closed,
      ...(venue ? { tickSize: (price: number) => tickSize(venue, price) } : {}),
    });
  }, [bars, closed, lastBar?.date, priceBasis, ticker, venue, evidenceOnly, isIndex]);

  const buy = useMemo(() => summarizeBuy(result), [result]);
  const latestDate = buy.latestDate;
  const confirmed = Boolean(buy.confirmed && venue && priceBasis && !error && !universeError);
  const patterns = result?.patterns.filter((p) => p.confirmedDate === latestDate && p.role !== "context").map((p) => PATTERN_VI[p.id]).slice(0, 3) ?? [];
  const lastVol = result?.volumeFeatures[result.trend.asOfIndex] ?? null;
  const blockers = [
    !venue && !universeLoading ? "Chưa xác định sàn; không phát xác nhận theo bước giá" : null,
    !priceBasis ? "Thiếu cơ sở giá" : null,
    !closed && lastBar ? "Nến ngày cuối chưa đóng; chỉ phân tích các nến hoàn tất" : null,
    error ? "Không tải được chuỗi giá điều chỉnh" : null,
    universeError ? "Không xác minh được mã với danh sách thị trường" : null,
  ].filter((item): item is string => Boolean(item));
  const evidence = useMemo<PriceActionEvidence>(() => {
    const setup = buy.setup;
    const state: PriceActionEvidence["state"] = isIndex ? "NOT_APPLICABLE"
      : isLoading || universeLoading || (!universe && !universeError) ? "LOADING"
        : !result || result.status !== "ready" || error || universeError ? "INSUFFICIENT"
          : confirmed ? "TRIGGERED" : buy.triggeredToday ? "INSUFFICIENT" : buy.pending ? "FORMING"
            : result.setups.some((item) => item.direction === "bullish" && item.state === "invalidated") ? "INVALIDATED"
              : result.setups.some((item) => item.direction === "bullish" && item.state === "expired") ? "EXPIRED" : "UNKNOWN";
    return {
      ticker: ticker.toUpperCase(), state, trend: result?.trend.state ?? null, asOf: latestDate ?? lastBar?.date ?? null,
      priceBasis, venue, barClosed: lastBar ? closed : null, confirmed,
      setup: setup ? { id: setup.id, kind: setup.kind, stateDate: setup.stateDate, entryReference: setup.entryReference, invalidationLevel: setup.invalidationLevel,
        target: setup.targetReferences[0]?.price ?? null, patternId: setup.patternId, state: setup.state, rewardRisk: setup.rewardRisk, rewardRiskOk: setup.rewardRiskOk, volume: setup.volume } : null,
      patterns, blockers, source: "Market Gateway /api/market/ta-series", methodVersion: PRICE_ACTION_ENGINE_VERSION,
      loading: !isIndex && (isLoading || universeLoading), error: error ? String(error) : universeError ? String(universeError) : null,
      tickerVerified: Boolean(instrument), instrumentName: instrument?.name ?? null,
    };
  }, [ticker, isIndex, isLoading, universeLoading, universe, result, buy, latestDate, lastBar?.date, priceBasis, venue, closed, confirmed, patterns.join("|"), blockers.join("|"), error, universeError, instrument]);
  const roomEvidence = useMemo(() => evidenceOnly ? observeResearchPrice({
    ticker: ticker.toUpperCase(), rawBars, priceBasis, instrument: instrument ?? null, observedAt: new Date().toISOString(),
    loading: Boolean(isLoading || universeLoading || (!universe && !universeError)),
    priceError: error ? String(error) : null, instrumentError: universeError ? String(universeError) : null,
    warnings, repairDates: (gapRepairs ?? []).map((entry) => entry.date),
  }).evidence : evidence, [evidenceOnly, ticker, rawBars, priceBasis, instrument, isLoading, universeLoading, universe, universeError, error, warnings, gapRepairs, evidence]);
  useEffect(() => { onEvidence?.(roomEvidence); }, [roomEvidence, onEvidence]);
  if (evidenceOnly) return null;
  if (isIndex) return <div className="mt-2 rounded border border-white/10 p-2 text-[10px] text-slate-500" data-testid="pa-confirmation">Price Action xác nhận mua cổ phiếu không áp dụng cho chỉ số {ticker}.</div>;
  const label = isLoading || universeLoading ? "Đang tải dữ liệu" : error || universeError || !result || result.status !== "ready" ? "Chưa đủ dữ liệu tin cậy"
    : buy.triggeredToday ? "Kích hoạt nhưng chưa đủ điều kiện" : buy.pending ? "Chờ kích hoạt" : buy.recent ? "Vừa kích hoạt" : "Chưa có setup mua";

  return (
    <div className="mt-3 rounded-md border border-cyan-500/20 bg-slate-950/50 p-2.5 text-slate-200" data-testid="pa-confirmation">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Price Action × Khối lượng · xác nhận kỹ thuật</p>
          <p className="text-[10px] text-slate-500">OHLCV ngày điều chỉnh · {priceBasis ?? "chưa rõ cơ sở giá"} · đến {dateLabel(latestDate ?? lastBar?.date)} · {PRICE_ACTION_ENGINE_VERSION}</p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${confirmed ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300" : "border-white/15 text-slate-300"}`} data-testid="pa-status">
          {confirmed ? (buy.volumeConfirmed ? "XÁC NHẬN KỸ THUẬT + KHỐI LƯỢNG" : "XÁC NHẬN KỸ THUẬT") : label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <div className="rounded border border-white/10 p-1.5"><p className="text-[10px] text-slate-500">Cấu trúc ngày</p>
          <p className="text-[11px] font-semibold">{result ? TREND_LABEL[result.trend.state] : "—"}</p>
          {result?.trend.broken && <p className="text-[10px] text-amber-300">Giá đã đóng cửa phá đỉnh/đáy cấu trúc gần nhất</p>}</div>
        <div className="rounded border border-white/10 p-1.5"><p className="text-[10px] text-slate-500">Mẫu nến phiên cuối</p><p className="text-[11px] font-semibold">{patterns.length ? patterns.join(" · ") : "Không có"}</p></div>
        <div className="rounded border border-white/10 p-1.5"><p className="text-[10px] text-slate-500">Khối lượng phiên cuối</p>
          <p className="text-[11px] font-semibold" data-testid="pa-last-volume">RVOL {x2(lastVol?.rvol)}× · tăng/giảm {x2(lastVol?.upDownRatio)}</p></div>
        <div className="rounded border border-white/10 p-1.5"><p className="text-[10px] text-slate-500">Sàn / bước giá</p><p className="text-[11px] font-semibold">{venue ? `${venue} · ${venue === "HOSE" ? "10/50/100 đ" : "100 đ"}` : "Chưa xác định"}</p></div>
      </div>
      {buy.setup && result && <SetupCard setup={buy.setup} lastIndex={result.trend.asOfIndex} />}
      {blockers.length > 0 && <p className="mt-2 text-[10px] leading-relaxed text-amber-200/90">{blockers.join(" · ")}</p>}
      <p className={`mt-2 rounded border px-2 py-1 text-[10px] leading-relaxed ${PA_VOL_R1.verdict === "ĐẠT" ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200"}`} data-testid="pa-validation">
        <b>{PA_VOL_R1.test} · {PA_VOL_R1.verdict}</b> — {PA_VOL_R1.summaryVi}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        Theo sách: xu hướng → vùng hỗ trợ/kháng cự → mẫu hình → vào khi giá đóng cửa phá mức kích hoạt → cắt lỗ dưới mẫu hình → chốt tại kháng cự gần nhất, bỏ qua nếu lời : lỗ &lt; 1,5;
        khối lượng phải đồng thuận xu hướng và tăng vọt khi phá vỡ. Không cộng Điểm Elite, không thay kiểm tra thanh khoản / quản trị rủi ro, không tự đặt lệnh.
      </p>
    </div>
  );
}
