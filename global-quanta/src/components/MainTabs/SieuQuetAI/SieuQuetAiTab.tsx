import { Fragment, useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import { EventPanel } from "./EventPanel";
import { useMarketQuotesStream, type LiveQuote } from "../../../hooks/useMarketQuotesStream";
import VolumeAnalysisPanel from "./VolumeAnalysisPanel";
import { isMarketGatewayEnabled } from "../../../services/marketDataClient";
import VnIndexAiPanel from "./VnIndexAiPanel";
import ResearchUiToggle from "./ResearchUiToggle";
import { useResearchUi } from "../../../hooks/useResearchUi";
import { useResearchOverview } from "../../../hooks/useResearch";
import { useWatchlists } from "../../../hooks/useWatchlists";
import { useScannerBasket, type Basket } from "../../../hooks/useScannerBasket";
import ScannerToolbar, { type GroupBy } from "./ScannerToolbar";
import WatchlistBar, { BasketSummary } from "./WatchlistBar";
import { GROUP_ORDER, groupOf, industryOf } from "./scannerTaxonomy";
import PricingBoard from "./PricingBoard";
import { useBoardQuotes } from "../../../hooks/useBoardQuotes";
import { useAppStore } from "../../../store/useAppStore";
import VnIndexBand from "./VnIndexBand";
import { ImpulseFlowPanel, TechnicalTiles } from "./MarketIntel";

const COLUMN_COUNT = 9;

// Mau sac theo statusCode Confluence - dung DUNG bang mau da duyet trong
// prototype HTML goc (frontend/index.html, bien CONF_COLOR).
const CONF_COLOR: Record<string, string> = {
  THUAN_XU_HUONG_MANH: "bg-emerald-950 text-emerald-400 border-emerald-700",
  THUAN_XU_HUONG: "bg-emerald-950/60 text-emerald-400 border-emerald-800",
  DONG_THUAN_TICH_LUY: "bg-cyan-950 text-cyan-400 border-cyan-700",
  PHONG_THU_CHUAN: "bg-blue-950 text-blue-400 border-blue-700",
  THUAN_PHONG_THU: "bg-blue-950/60 text-blue-400 border-blue-800",
  DAN_DAT_NGUOC_DONG: "bg-purple-950 text-purple-400 border-purple-700",
  TRUNG_LAP: "bg-slate-800 text-slate-400 border-slate-600",
  NGHICH_XU_HUONG: "bg-rose-950 text-rose-400 border-rose-700",
};

function fmt(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(d);
}

/** Khối kỹ thuật + khối Impulse/dòng tiền lấy thêm giá đóng cửa và Market Intelligence từ tổng quan nghiên cứu (SWR dùng chung). */
function TechnicalConnected({ state }: { state: ReturnType<typeof useSieuQuetScanner>["indexState"] }) {
  const { data } = useResearchOverview();
  return <TechnicalTiles state={state} close={data?.index?.current.close ?? null} />;
}
function ImpulseConnected({ score }: { score: number | null }) {
  const { data } = useResearchOverview();
  return <ImpulseFlowPanel score={score} intel={data?.intel} />;
}

function sourceLabel(source: string): string {
  if (source === "SSI_STREAM") return "SSI realtime";
  if (source.startsWith("SSI")) return "SSI";
  return "nguồn dự phòng";
}

/** Dòng phụ: chỉ cuộn vào tầm nhìn MỘT lần khi vừa mở (không cuộn lại mỗi lần giá realtime cập nhật). */
function DetailRow({ ticker, colSpan = COLUMN_COUNT }: { ticker: string; colSpan?: number }) {
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => rowRef.current?.previousElementSibling?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <tr ref={rowRef} className="border-b border-cyan-900/40" style={{ scrollMarginTop: 32 }}>
      <td colSpan={colSpan} className="p-0">
        {isMarketGatewayEnabled()
          ? <VolumeAnalysisPanel symbol={ticker} />
          : <div className="p-3 text-[10px] text-slate-400 font-sans">Phân tích khối lượng cần Market Gateway (đang tắt bằng VITE_MARKET_GATEWAY_ENABLED=false).</div>}
      </td>
    </tr>
  );
}

interface StockRowProps {
  item: SieuQuetStockItem;
  live?: LiveQuote;
  expanded: boolean;
  onToggle: (ticker: string) => void;
  observe: (el: HTMLTableRowElement | null, ticker: string) => void;
  starred: boolean;
  onStar: (ticker: string) => void;
  selected: boolean;
  onSelect: (ticker: string) => void;
}

// memo: khi giá realtime đổi, chỉ dòng của mã đó vẽ lại (bảng tới ~300 dòng).
const StockRow = memo(function StockRow({ item, live, expanded, onToggle, observe, starred, onStar, selected, onSelect }: StockRowProps) {
  // Giá/% ưu tiên SSI qua Market Gateway; điểm số vẫn là kết quả quét định kỳ của Project A.
  const price = live?.price ?? item.price;
  const changePct = live ? live.changePct : item.changePct;
  const priceTitle = live
    ? `Giá ${sourceLabel(live.source)}${live.asOf ? ` · ${live.asOf}` : ""}`
    : `Giá chốt lúc quét (${item.computedAt}) — Project A`;
  const confClass = (item.confluenceStatusCode && CONF_COLOR[item.confluenceStatusCode]) ?? "bg-slate-800 text-slate-400 border-slate-600";
  const excluded = item.piotroskiFScore !== null && item.piotroskiFScore <= Math.floor(item.fScoreMax * 3 / 9);

  return (
    <>
    <tr
      ref={(el) => observe(el, item.ticker)}
      data-ticker={item.ticker}
      style={{ scrollMarginTop: 32 }}
      className={`border-b border-white/5 hover:bg-white/5 cursor-pointer select-none ${excluded ? "opacity-40" : ""} ${expanded ? "bg-cyan-950/30" : ""} ${selected ? "shadow-[inset_3px_0_0_#f59e0b]" : ""}`}
      aria-selected={selected}
      onClick={() => onSelect(item.ticker)}
      tabIndex={0}
      aria-expanded={expanded}
      title="Bấm để chọn mã (Action Center, Radar…) · nhấn đúp (hoặc Enter) để xem phân tích khối lượng"
      onDoubleClick={() => onToggle(item.ticker)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onToggle(item.ticker); } }}
    >
      <td className="py-2 pr-3 text-slate-100 font-semibold whitespace-nowrap">
        <button type="button" aria-pressed={starred} aria-label={starred ? `Bỏ ${item.ticker} khỏi danh mục` : `Thêm ${item.ticker} vào danh mục`}
          title={starred ? "Bỏ khỏi danh mục đang chọn" : "Thêm vào danh mục đang chọn"}
          onClick={(e) => { e.stopPropagation(); onStar(item.ticker); }} onDoubleClick={(e) => e.stopPropagation()}
          className={`mr-1 font-sans ${starred ? "text-amber-400" : "text-slate-600 hover:text-amber-300"}`}>{starred ? "★" : "☆"}</button>
        {item.ticker}
        {item.inUniverse === false && <span className="ml-1 text-[8px] font-normal font-sans text-violet-300 border border-violet-500/40 rounded px-0.5" title="Ngoài universe: chấm theo cùng công thức và bối cảnh của lần quét">ngoài DS</span>}
        <div className="text-[9px] text-slate-500 font-sans font-normal" title={item.sectorGroup ? `${item.sectorGroup} › ${industryOf(item)}` : undefined}>{industryOf(item)}</div>
      </td>
      <td className="text-right pr-3" title={priceTitle}>
        {fmt(price, 0)}
        {live && live.source.startsWith("SSI") && <span className="ml-1 text-[8px] text-emerald-500">●</span>}
        <div className={`text-[9px] ${(changePct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {(changePct ?? 0) >= 0 ? "+" : ""}{fmt(changePct, 2)}%
        </div>
      </td>
      <td className="text-right pr-3 font-semibold text-amber-400">{fmt(item.smartScore, 1)}</td>
      <td className="text-right pr-3">{fmt(item.rsRating, 1)}</td>
      <td className="pr-3">
        <span className={`px-1.5 py-0.5 rounded border text-[9px] whitespace-nowrap ${confClass}`}>{item.confluenceStatusLabel ?? "—"}</span>
        {item.breakoutBoostBadge && <span className="ml-1 px-1 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-700 text-[9px]">⚡Breakout</span>}
        {item.foreignNetBuyFlag && <span className="ml-1 px-1 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-700 text-[9px]" title="Top 5 mã khối ngoại mua ròng mạnh nhất hôm nay (bản tin HOSE)">🌍NN mua ròng</span>}
      </td>
      <td className="pr-3 text-slate-300">{item.trendTag ?? "—"}</td>
      <td className="pr-3">
        <span className={`px-1.5 py-0.5 rounded border text-[9px] ${excluded ? "bg-rose-950 text-rose-400 border-rose-700" : "bg-emerald-950/40 text-emerald-400 border-emerald-800"}`}>
          F-Score {item.piotroskiFScore ?? "—"}/{item.fScoreMax}
        </span>
      </td>
      <td className="text-right pr-3">{item.riskRewardRatio !== null ? fmt(item.riskRewardRatio, 2) : "—"}</td>
      <td className="text-right pr-3">{fmt(item.riskAdjustedMomentum, 2)}</td>
    </tr>
    {expanded && <DetailRow ticker={item.ticker} />}
    </>
  );
});

export default function SieuQuetAiTab() {
  const { indexState, items, isLoading, error, dataAsOf, generatedAt, usedSource, universeSize } = useSieuQuetScanner();
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const toggleRow = useCallback((ticker: string) => setExpandedTicker((cur) => (cur === ticker ? null : ticker)), []);
  // Bảng là nơi chọn mã chính của trang: bấm một lần -> Action Center, Radar, tab CF… theo mã này.
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const selectTicker = useAppStore((s) => s.selectTicker);
  const onSelect = useCallback((ticker: string) => selectTicker(ticker), [selectTicker]);
  useEffect(() => {
    if (!expandedTicker) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpandedTicker(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandedTicker]);

  // Realtime chỉ cho các dòng đang hiển thị trong khung cuộn (giảm số mã đăng ký với SSI).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleSet = useRef(new Set<string>());
  const [visibleTickers, setVisibleTickers] = useState<string[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => setVisibleTickers([...visibleSet.current].sort()), 400);
  }, []);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    observerRef.current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const t = (e.target as HTMLElement).dataset.ticker;
        if (!t) continue;
        if (e.isIntersecting) visibleSet.current.add(t); else visibleSet.current.delete(t);
      }
      scheduleFlush();
    }, { root: scrollRef.current, rootMargin: "200px 0px" });
    // Các dòng có thể đã gắn vào DOM trước khi observer được tạo (dữ liệu từ cache).
    scrollRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-ticker]").forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, [scheduleFlush]);
  const observe = useCallback((el: HTMLTableRowElement | null, ticker: string) => {
    if (!el || !observerRef.current || el.dataset.ticker !== ticker) return;
    observerRef.current.observe(el);
  }, []);
  // Hai chế độ dùng CHUNG rổ / bộ lọc ngành / gom nhóm / danh mục: chỉ khác cách hiển thị.
  const [mode, setModeState] = useState<"scanner" | "board">(() => {
    try { return window.localStorage.getItem("gq.scannerMode") === "board" ? "board" : "scanner"; } catch { return "scanner"; }
  });
  const setMode = useCallback((m: "scanner" | "board") => {
    setModeState(m);
    visibleSet.current.clear();
    try { window.localStorage.setItem("gq.scannerMode", m); } catch { /* bỏ qua */ }
  }, []);
  const streamTickers = typeof IntersectionObserver === "undefined" ? items.map((i) => i.ticker) : visibleTickers;
  // Mỗi chế độ chỉ mở một luồng giá cho các dòng đang hiển thị (không đăng ký trùng với SSI).
  const { quotes: liveQuotes, enabled: gatewayEnabled } = useMarketQuotesStream(mode === "scanner" ? streamTickers : []);
  const board = useBoardQuotes(mode === "board" ? streamTickers : [], { enabled: mode === "board" });
  const [researchUiOn] = useResearchUi();

  // Rổ (Tất cả / VN30 / Danh mục), lọc ngành 2 cấp, gom nhóm — lựa chọn rổ nhớ theo trình duyệt.
  const [basket, setBasketState] = useState<Basket>(() => {
    try { const v = window.localStorage.getItem("gq.scannerBasket"); return v === "VN30" || v === "WATCHLIST" ? v : "ALL"; } catch { return "ALL"; }
  });
  const setBasket = useCallback((b: Basket) => {
    setBasketState(b);
    try { window.localStorage.setItem("gq.scannerBasket", b); } catch { /* bỏ qua */ }
  }, []);
  const [industries, setIndustries] = useState<Set<string>>(() => new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const watchlists = useWatchlists();
  const toggleStar = watchlists.toggle;
  const starredSet = useMemo(() => new Set(watchlists.active.tickers), [watchlists.active.tickers]);
  const onStar = useCallback((ticker: string) => toggleStar(ticker), [toggleStar]);
  const gatewayReady = usedSource === "gateway";
  // Nguồn dự phòng (Project A) không có rổ VN30 -> hiển thị Tất cả.
  const effectiveBasket: Basket = !gatewayReady && basket === "VN30" ? "ALL" : basket;
  const basketData = useScannerBasket(items, effectiveBasket, watchlists.active.tickers);
  const pinnedSet = useMemo(() => new Set(watchlists.active.pinned ?? []), [watchlists.active.pinned]);
  const filteredItems = useMemo(() => {
    const list = industries.size ? basketData.items.filter((i) => industries.has(industryOf(i))) : basketData.items;
    // Danh mục: mã đã ghim lên đầu (giữ thứ tự Siêu Quét trong từng phần).
    return effectiveBasket === "WATCHLIST" && pinnedSet.size
      ? [...list.filter((i) => pinnedSet.has(i.ticker)), ...list.filter((i) => !pinnedSet.has(i.ticker))]
      : list;
  }, [basketData.items, industries, effectiveBasket, pinnedSet]);

  // Tìm mã trên thanh trên -> đưa mã vào tầm nhìn: nếu đang bị lọc thì về "Tất cả"; nếu ngoài danh sách
  // quét thì thêm vào danh mục đang chọn (Gateway chấm điểm); rồi mở phân tích khối lượng của mã.
  const scannerFocus = useAppStore((s) => s.scannerFocus);
  const handledFocus = useRef<number | null>(null);
  useEffect(() => {
    if (!scannerFocus || handledFocus.current === scannerFocus.nonce || isLoading) return;
    handledFocus.current = scannerFocus.nonce;
    const t = scannerFocus.ticker;
    if (!filteredItems.some((i) => i.ticker === t)) {
      setIndustries(new Set());
      if (items.some((i) => i.ticker === t)) setBasket("ALL");
      else { watchlists.add([t]); setBasket("WATCHLIST"); }
    }
    setExpandedTicker(t);
    // Đưa dòng của mã lên đầu khung cuộn để thấy luôn phần phân tích khối lượng bên dưới.
    setTimeout(() => {
      scrollRef.current?.querySelector<HTMLElement>(`tr[data-ticker="${CSS.escape(t)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 150);
  }, [scannerFocus, isLoading, filteredItems, items, watchlists, setBasket]);
  // Gom nhóm: các đoạn theo nhóm ngành (thứ tự cố định) hoặc theo ngành (nhiều mã trước).
  const sections = useMemo(() => {
    if (groupBy === "none") return null;
    const key = groupBy === "group" ? groupOf : industryOf;
    const m = new Map<string, SieuQuetStockItem[]>();
    for (const it of filteredItems) { const k = key(it); if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    const rank = (k: string) => (GROUP_ORDER.indexOf(k) === -1 ? 99 : GROUP_ORDER.indexOf(k));
    return [...m].sort((a, b) => (groupBy === "group" ? rank(a[0]) - rank(b[0]) : b[1].length - a[1].length) || a[0].localeCompare(b[0], "vi"));
  }, [filteredItems, groupBy]);
  const basketTitle = effectiveBasket === "VN30" ? "Rổ VN30" : effectiveBasket === "WATCHLIST" ? `★ ${watchlists.active.name}` : "Bộ lọc ngành";

  if (isLoading) return <div className="p-6 text-center text-slate-500 text-sm">Đang tải dữ liệu Siêu Quét AI...</div>;
  if (error) return <div className="p-6 text-center text-rose-400 text-sm">Không tải được dữ liệu: {String(error)}</div>;

  return (
    <div className="tw-scope flex flex-col gap-4 py-1">
      {/* DẢI VN-INDEX (thu gọn được) — nhường toàn bộ bề ngang cho bảng */}
      <VnIndexBand
        indexState={indexState}
        technical={<TechnicalConnected state={indexState} />}
        impulse={<ImpulseConnected score={indexState?.impulseScore ?? null} />}
        aiPanel={researchUiOn ? <VnIndexAiPanel /> : null}
        toggle={<ResearchUiToggle />}
      />

      {/* BẢNG SIÊU QUÉT / BẢNG GIÁ — RỘNG TOÀN BỘ */}
      <section className="flex flex-col gap-4 min-w-0">
        <div style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} className="rounded-xl p-4 flex-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div role="tablist" aria-label="Chế độ hiển thị" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
                  {([["scanner", "Siêu Quét AI"], ["board", "Bảng giá"]] as const).map(([m, label]) => (
                    <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                      className={`px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${mode === m ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <h2 className="text-sm font-semibold text-cyan-400">
                  ({filteredItems.length} mã){effectiveBasket !== "ALL" && <span className="ml-1 text-[11px] text-cyan-200/80 font-normal">· {basketTitle}</span>}
                </h2>
              </div>
              {(dataAsOf || generatedAt) && (
                <div className="text-[9px] text-slate-500">
                  {usedSource === "gateway"
                    ? <>Điểm số tính trên dữ liệu SSI phiên {dataAsOf} · {universeSize ?? items.length} mã · cập nhật {generatedAt ? new Date(generatedAt).toLocaleString("vi-VN") : "—"}</>
                    : <>Điểm số từ Project A (mỗi mã có thời điểm tính riêng, xem tooltip cột Giá)</>}
                  {mode === "board"
                    ? " · Bảng giá: giá × 1.000đ, KL cổ phiếu, realtime SSI · nhấn đúp một dòng để xem phân tích khối lượng"
                    : " · nhấn đúp một dòng để xem phân tích khối lượng"}
                </div>
              )}
            </div>
            <ScannerToolbar basket={effectiveBasket} onBasket={setBasket} watchlistCount={watchlists.active.tickers.length} gatewayReady={gatewayReady}
              items={basketData.items} industries={industries} onIndustries={setIndustries} groupBy={groupBy} onGroupBy={setGroupBy} />
          </div>
          {effectiveBasket === "WATCHLIST" && (
            <WatchlistBar notFound={basketData.notFound} insufficient={basketData.insufficient} loading={basketData.loading} gatewayReady={gatewayReady} />
          )}
          {(effectiveBasket !== "ALL" || industries.size > 0) && <BasketSummary items={filteredItems} title={basketTitle} />}
          {effectiveBasket === "VN30" && basketData.loading && <div className="text-[10px] text-slate-500 mb-2">Đang tải rổ VN30…</div>}
          {basketData.customError ? <div className="text-[10px] text-rose-400 mb-2">Không chấm điểm được mã ngoài universe: {basketData.customError instanceof Error ? basketData.customError.message : String(basketData.customError)}</div> : null}
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[640px]">
            {mode === "board" ? (
              <PricingBoard
                sections={sections ?? [["", filteredItems]]} grouped={Boolean(sections)}
                quotes={board.quotes} flash={board.flash} now={board.now}
                expandedTicker={expandedTicker} starred={starredSet} onToggle={toggleRow} onStar={onStar} observe={observe}
                selectedTicker={selectedTicker} onSelect={onSelect}
                renderDetail={(ticker, colSpan) => <DetailRow ticker={ticker} colSpan={colSpan} />}
                emptyText={effectiveBasket === "WATCHLIST" && watchlists.active.tickers.length === 0 ? "Danh mục trống — thêm mã ở ô phía trên." : "Không có mã nào khớp bộ lọc."}
              />
            ) : (
            <table className="w-full text-[10px] font-mono">
              <thead className="text-slate-500 border-b border-white/10 sticky top-0 z-10" style={{ background: "#0f1420" }}>
                <tr>
                  <th className="text-left py-2 pr-3">Mã</th>
                  <th className="text-right pr-3">Giá</th>
                  <th className="text-right pr-3">Smart Score</th>
                  <th className="text-right pr-3">RS</th>
                  <th className="text-left pr-3">Đồng Thuận</th>
                  <th className="text-left pr-3">Trend</th>
                  <th className="text-left pr-3">Chất lượng BCTC</th>
                  <th className="text-right pr-3">R/R</th>
                  <th className="text-right pr-3">Risk-Adj Mom.</th>
                </tr>
              </thead>
              <tbody>
                {(sections ?? [["", filteredItems] as [string, SieuQuetStockItem[]]]).map(([name, list]) => (
                  <Fragment key={name || "all"}>
                    {sections && (
                      <tr className="bg-white/[0.03] border-b border-white/10">
                        <td colSpan={COLUMN_COUNT} className="py-1 px-1 font-sans text-[10px]">
                          <span className="text-cyan-200 font-semibold">{name}</span>
                          <span className="text-slate-400"> · {list.length} mã · Smart TB {(list.reduce((a, i) => a + (i.smartScore ?? 0), 0) / list.length).toFixed(1)} · ▲ {list.filter((i) => i.trendTag === "Up-Trend").length} Up-Trend</span>
                        </td>
                      </tr>
                    )}
                    {list.map((item) => (
                      <StockRow key={item.ticker} item={item} live={liveQuotes[item.ticker.toUpperCase()]}
                        expanded={expandedTicker === item.ticker} onToggle={toggleRow} observe={observe}
                        starred={starredSet.has(item.ticker)} onStar={onStar}
                        selected={selectedTicker === item.ticker} onSelect={onSelect} />
                    ))}
                  </Fragment>
                ))}
                {filteredItems.length === 0 && !basketData.loading && (
                  <tr><td colSpan={COLUMN_COUNT} className="py-6 text-center text-slate-500 font-sans text-[10px]">
                    {effectiveBasket === "WATCHLIST" && watchlists.active.tickers.length === 0 ? "Danh mục trống — thêm mã ở ô phía trên." : "Không có mã nào khớp bộ lọc."}
                  </td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </section>

      {/* SỰ KIỆN + NGUỒN DỮ LIỆU (chuyển từ cột trái cũ) */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2"><EventPanel /></div>
        <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-xl p-3 h-fit">
          <p className="text-[9px] text-sky-300">
            {gatewayEnabled
              ? <>Giá: SSI realtime qua Market Gateway (● = giá SSI). Điểm số TA/FA, VN-Index đa tầng: quét định kỳ (Yahoo + VCI + VNDirect) cho {items.length} mã.</>
              : <>Dữ liệu: VN-Index thật (VNDirect), TA/FA thật (Yahoo + VCI) cho {items.length} mã theo dõi.</>}
            Sự kiện: AI Discovery (Gemini + Google Search, 3 lần/ngày) + nhập tay, chỉ sự kiện đã xác nhận mới ảnh hưởng Smart Score.
          </p>
        </div>
      </section>
    </div>
  );
}
