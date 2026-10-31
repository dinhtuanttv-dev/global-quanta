import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import { ScannerEvidence } from "./ScannerEvidence";
import { useMarketQuotesStream } from "../../../hooks/useMarketQuotesStream";
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
import TradingMatrixPanel from "./TradingMatrix/TradingMatrixPanel";
import ScannerTable, { SCANNER_COLUMNS } from "./ScannerTable";
import { boardSession, nextSort, sortItems, useIsNarrow, useTableFit, useViewPrefs, type SortKey, type SortState } from "./scannerView";
import "./ScannerTables.css";


/** Khối kỹ thuật + khối Impulse/dòng tiền lấy thêm giá đóng cửa và Market Intelligence từ tổng quan nghiên cứu (SWR dùng chung). */
function TechnicalConnected({ state }: { state: ReturnType<typeof useSieuQuetScanner>["indexState"] }) {
  const { data } = useResearchOverview();
  return <TechnicalTiles state={state} close={data?.index?.current.close ?? null} />;
}
function ImpulseConnected({ score }: { score: number | null }) {
  const { data } = useResearchOverview();
  return <ImpulseFlowPanel score={score} intel={data?.intel} />;
}

/** Dòng phụ: chỉ cuộn vào tầm nhìn MỘT lần khi vừa mở (không cuộn lại mỗi lần giá realtime cập nhật). */
function DetailRow({ ticker, colSpan = SCANNER_COLUMNS }: { ticker: string; colSpan?: number }) {
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => rowRef.current?.previousElementSibling?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <tr ref={rowRef} className="border-b border-cyan-900/40" style={{ scrollMarginTop: 110 }}>
      <td colSpan={colSpan} className="p-0">
        {isMarketGatewayEnabled()
          ? <VolumeAnalysisPanel symbol={ticker} />
          : <div className="p-3 text-[10px] text-slate-400 font-sans">Phân tích khối lượng cần Market Gateway (đang tắt bằng VITE_MARKET_GATEWAY_ENABLED=false).</div>}
      </td>
    </tr>
  );
}

export default function SieuQuetAiTab() {
  const { indexState, items, isLoading, error, dataAsOf, generatedAt, usedSource, universeSize, validation } = useSieuQuetScanner();
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
    }, { rootMargin: "200px 0px" });
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
  const [view, setView] = useViewPrefs();
  const narrow = useIsNarrow();
  const [showSources, setShowSources] = useState(false);
  // Sắp xếp riêng từng bảng; mặc định null = giữ thứ tự máy quét. Bảng giá chỉ sắp theo mã và Smart vì giá realtime chỉ có ở dòng đang hiển thị.
  const [scanSort, setScanSort] = useState<SortState | null>(null);
  const [boardSort, setBoardSort] = useState<SortState | null>(null);
  const onScanSort = useCallback((k: SortKey) => setScanSort((cur) => nextSort(cur, k)), []);
  const onBoardSort = useCallback((k: SortKey) => setBoardSort((cur) => nextSort(cur, k)), []);

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
  const activeSort = mode === "board" ? boardSort : scanSort;
  const filteredItems = useMemo(() => {
    const list = industries.size ? basketData.items.filter((i) => industries.has(industryOf(i))) : basketData.items;
    if (activeSort) return sortItems(list, activeSort);
    // Danh mục: mã đã ghim lên đầu (giữ thứ tự Siêu Quét trong từng phần).
    return effectiveBasket === "WATCHLIST" && pinnedSet.size
      ? [...list.filter((i) => pinnedSet.has(i.ticker)), ...list.filter((i) => !pinnedSet.has(i.ticker))]
      : list;
  }, [basketData.items, industries, effectiveBasket, pinnedSet, activeSort]);

  // Tìm mã trên thanh trên -> đưa mã vào tầm nhìn: nếu đang bị lọc thì về "Tất cả"; mã ngoài danh sách quét CHỈ được
  // thêm vào danh mục khi người dùng chọn rõ "＋ Thêm vào ★ Danh mục" (TOPBAR T3); rồi mở phân tích khối lượng của mã.
  const scannerFocus = useAppStore((s) => s.scannerFocus);
  const handledFocus = useRef<number | null>(null);
  useEffect(() => {
    if (!scannerFocus || handledFocus.current === scannerFocus.nonce || isLoading) return;
    handledFocus.current = scannerFocus.nonce;
    const t = scannerFocus.ticker;
    if (!filteredItems.some((i) => i.ticker === t)) {
      setIndustries(new Set());
      if (items.some((i) => i.ticker === t)) setBasket("ALL");
      else if (scannerFocus.addToWatchlist) { watchlists.add([t]); setBasket("WATCHLIST"); }
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
  const { fit, overflow } = useTableFit(scrollRef, mode, `${narrow}|${view.levels}|${isLoading}|${Boolean(error)}`);
  const session = useMemo(() => (mode === "board" ? boardSession(board.quotes) : null), [mode, board.quotes]);
  const emptyText = effectiveBasket === "WATCHLIST" && watchlists.active.tickers.length === 0 ? "Danh mục trống — thêm mã ở ô phía trên." : "Không có mã nào khớp bộ lọc.";
  const renderDetail = useCallback((ticker: string, colSpan: number) => <DetailRow ticker={ticker} colSpan={colSpan} />, []);
  const basketTitle = effectiveBasket === "VN30" ? "Rổ VN30" : effectiveBasket === "WATCHLIST" ? `★ ${watchlists.active.name}` : "Bộ lọc ngành";

  if (isLoading) return <div className="p-6 text-center text-slate-500 text-sm">Đang tải dữ liệu Siêu Quét AI...</div>;
  // Bảng quét lỗi không được làm mất Trading Matrix (nguồn độc lập, spec §2.4).
  if (error) return (
    <div className="tw-scope flex flex-col gap-4 py-1">
      <TradingMatrixPanel />
      <div className="p-6 text-center text-rose-400 text-sm" role="alert">Không tải được bảng Siêu Quét: {String(error)}</div>
    </div>
  );

  return (
    <div className="tw-scope flex flex-col gap-4 py-1">
      {/* DẢI VN-INDEX (thu gọn được) — nhường toàn bộ bề ngang cho bảng */}
      {!view.focus && <VnIndexBand
        indexState={indexState}
        technical={<TechnicalConnected state={indexState} />}
        impulse={<ImpulseConnected score={indexState?.impulseScore ?? null} />}
        aiPanel={researchUiOn ? <VnIndexAiPanel /> : null}
        toggle={<ResearchUiToggle />}
      />}

      {/* TRADING MATRIX (M1–M2) — trạng thái thị trường đa nguồn; heatmap ngành lọc CÙNG state ngành của bảng, bấm mã chọn toàn trang */}
      {!view.focus && <TradingMatrixPanel activeIndustries={industries} onSelectTicker={onSelect}
        onIndustry={(name) => setIndustries(name ? new Set([name]) : new Set())} />}

      {/* BẢNG SIÊU QUÉT / BẢNG GIÁ — RỘNG TOÀN BỘ */}
      <section className="flex flex-col gap-4 min-w-0">
        <div style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} className={`scan-panel rounded-xl p-4 flex-1 ${narrow ? "scan-narrow" : ""}`} data-density={view.density} data-testid="scan-panel">
          <div className="scan-cmd" data-testid="scan-cmd">
            <div role="tablist" aria-label="Chế độ hiển thị" className="scan-seg">
              {([["scanner", "Siêu Quét AI"], ["board", "Bảng giá"]] as const).map(([m, label]) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{label}</button>
              ))}
            </div>
            <span className="scan-count">{filteredItems.length} mã{effectiveBasket !== "ALL" && <span> · {basketTitle}</span>}</span>
            <ScannerToolbar basket={effectiveBasket} onBasket={setBasket} watchlistCount={watchlists.active.tickers.length} gatewayReady={gatewayReady}
              items={basketData.items} industries={industries} onIndustries={setIndustries} groupBy={groupBy} onGroupBy={setGroupBy} />
            <div className="scan-tools">
              {!narrow && <div className="scan-seg" role="group" aria-label="Mật độ dòng">
                <button type="button" aria-pressed={view.density === "compact"} onClick={() => setView({ density: "compact" })}>Gọn</button>
                <button type="button" aria-pressed={view.density === "comfortable"} onClick={() => setView({ density: "comfortable" })}>Thoáng</button>
              </div>}
              {mode === "board" && !narrow && <div className="scan-seg" role="group" aria-label="Số bước giá">
                <button type="button" aria-pressed={view.levels === 3} onClick={() => setView({ levels: 3 })} title="Hiện đủ 3 bước giá mua và bán">3 bước</button>
                <button type="button" aria-pressed={view.levels === 1} onClick={() => setView({ levels: 1 })} title="Chỉ hiện bước giá tốt nhất">1 bước</button>
              </div>}
              <button type="button" className="scan-tool" aria-pressed={view.focus} onClick={() => setView({ focus: !view.focus })} data-testid="scan-focus"
                title={view.focus ? "Hiện lại dải VN-Index và Trading Matrix" : "Thu dải VN-Index và Trading Matrix để bảng chiếm gần hết màn hình"}>
                {view.focus ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}{view.focus ? "Thoát tập trung" : "Tập trung"}
              </button>
            </div>
          </div>
          <div className="scan-status" data-testid="scan-status">
            {mode === "board" && session && <span className={`scan-chip ${session.live ? "live" : "off"}`} data-testid="board-session">{session.label}</span>}
            {(dataAsOf || generatedAt) && <span>{usedSource === "gateway" ? <>SSI · điểm số phiên {dataAsOf} · cập nhật {generatedAt ? new Date(generatedAt).toLocaleString("vi-VN") : "—"}</> : <>Điểm số từ Project A, thời điểm tính theo từng mã</>}</span>}
            {mode === "board" && !narrow && <span className="scan-legend" aria-label="Chú giải màu">
              <span><i style={{ background: "#e879f9" }} />Trần</span><span><i style={{ background: "#22d3ee" }} />Sàn</span><span><i style={{ background: "#facc15" }} />TC</span><span><i style={{ background: "#22c55e" }} />Tăng</span><span><i style={{ background: "#f43f5e" }} />Giảm</span>
            </span>}
            <button type="button" className="scan-info" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)} data-testid="scan-info">Nguồn và cách đọc</button>
          </div>
          {showSources && <div className="scan-infobox" data-testid="scan-infobox">
            {usedSource === "gateway" && <ScannerEvidence validation={validation} />}
            <p>{gatewayEnabled
              ? <>Giá: SSI realtime qua Market Gateway (● = giá SSI). Điểm số TA/FA, VN-Index đa tầng: quét định kỳ (Yahoo + VCI + VNDirect) cho {items.length} mã.</>
              : <>Dữ liệu: VN-Index thật (VNDirect), TA/FA thật (Yahoo + VCI) cho {items.length} mã theo dõi.</>}
              {" "}Sự kiện đã xác nhận (AI Discovery trên Project A) vẫn vào Smart Score. Nghiên cứu sự kiện, ESA và tin vĩ mô: trang PHÂN TÍCH VĨ MÔ › Event Radar.</p>
            <p>Giá hiển thị theo nghìn đồng (148.70 = 148.700đ), khối lượng theo cổ phiếu. Bấm một dòng để chọn mã; bấm › hoặc nhấn đúp để xem phân tích khối lượng; ↑↓ chuyển dòng. Bấm tiêu đề cột để sắp xếp, bấm lần ba để về thứ tự mặc định.{mode === "board" ? " Bảng giá sắp xếp theo mã hoặc Smart vì giá realtime chỉ tải cho các dòng đang hiển thị." : " Điểm số không đổi khi giá realtime nhảy, nên thứ tự theo giá dùng giá lúc quét."}</p>
            <p>Khối lượng có thể rút gọn trên màn hình hẹp (1.13M); rê chuột vào ô để xem số đầy đủ. Thanh nền trong ô KL so sánh các bước giá trong cùng một dòng.</p>
          </div>}
          {effectiveBasket === "WATCHLIST" && (
            <WatchlistBar notFound={basketData.notFound} insufficient={basketData.insufficient} loading={basketData.loading} gatewayReady={gatewayReady} />
          )}
          {(effectiveBasket !== "ALL" || industries.size > 0) && <BasketSummary items={filteredItems} title={basketTitle} />}
          {effectiveBasket === "VN30" && basketData.loading && <div className="text-[10px] text-slate-500 mb-2">Đang tải rổ VN30…</div>}
          {basketData.customError ? <div className="text-[10px] text-rose-400 mb-2">Không chấm điểm được mã ngoài universe: {basketData.customError instanceof Error ? basketData.customError.message : String(basketData.customError)}</div> : null}
          <div ref={scrollRef} className={`scan-frame ${overflow ? "is-overflow" : ""}`} data-fit={fit} data-testid="scan-frame">
            {mode === "board" ? (
              <PricingBoard
                sections={sections ?? [["", filteredItems]]} grouped={Boolean(sections)}
                quotes={board.quotes} flash={board.flash} now={board.now}
                expandedTicker={expandedTicker} starred={starredSet} onToggle={toggleRow} onStar={onStar} observe={observe}
                selectedTicker={selectedTicker} onSelect={onSelect} renderDetail={renderDetail} emptyText={emptyText}
                fit={fit} levels={narrow ? 3 : view.levels} narrow={narrow} sort={boardSort} onSort={onBoardSort}
              />
            ) : (
              <ScannerTable sections={sections ?? [["", filteredItems]]} grouped={Boolean(sections)} liveQuotes={liveQuotes} expandedTicker={expandedTicker}
                starred={starredSet} selectedTicker={selectedTicker} onToggle={toggleRow} onStar={onStar} onSelect={onSelect} observe={observe}
                sort={scanSort} onSort={onScanSort} narrow={narrow} renderDetail={renderDetail}
                emptyText={filteredItems.length === 0 && !basketData.loading ? emptyText : null} />
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
