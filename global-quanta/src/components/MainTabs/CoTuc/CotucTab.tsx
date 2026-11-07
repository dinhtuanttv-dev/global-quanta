
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import "./cotuc-theme.css";
import EarningsQualityPanel from "./EarningsQualityPanel";
import { GROUP_OF, GROUPS, readView, VIEW_KEY, VIEWS, type CotucGroup, type SubView } from "./cotucNav";
import {
  Coins, Search, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Info, Star, Sparkles,
} from "lucide-react";
import {
  DIVIDEND_STOCKS, getTradePhase,
  detectRiskFlags, riskDataReady, PRICE_TREND_LABEL, filterAndSortStocks, getDaysUntil,
  fmtVND, fmtPct, DEFAULT_FILTER, explainFilter, UPCOMING_WINDOW_DAYS, PE_NO_LIMIT,
  type DividendFilter, type DividendStock,
} from "../../../lib/quant-cotuc";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useDividendFilterUrl } from "../../../hooks/useDividendFilterUrl";
import { usePinnedStocks } from "../../../hooks/usePinnedStocks";
import { useDividendEvents } from "../../../hooks/useDividendEvents";
import EventsCalendar from "./events/EventsCalendar";
import DividendQualityPanel from "./screener/DividendQualityPanel";
import FactorPanel, { FmBadge } from "./screener/FactorPanel";
import { ScreenerToolbar } from "./screener/ScreenerToolbar";
import { FmLedgerCard } from "./screener/FmLedgerCard";
import { TickerEventsBody } from "./events/EventViews";
import { useScreenerPrefs } from "../../../hooks/useScreenerPrefs";
import { SCREENER_COLUMNS, savedToFilter } from "../../../lib/cotuc/screenerPrefs";
import { useUniverseScores } from "../../../hooks/useUniverseScores";
import { useRealRsData } from "../../../hooks/useRealRsData";
import { useUniverseSearch } from "../../../hooks/useUniverseSearch";
import { useRequestedTickers } from "../../../hooks/useRequestedTickers";
import { ErrorBoundary } from "../../ErrorBoundary";
import KqkdCenter from "./kqkd/KqkdCenter";
import EarningsCalendar from "./kqkd/EarningsCalendar";
import SeasonalityView from "./seasonality/SeasonalityView";
import TimingCenter from "./to/TimingCenter";
import type { ToRadarRow } from "../../../lib/cotuc/to";
import { CotucScanStatusBar } from "./live/CotucScanStatusBar";
import { TimelineModes } from "./timeline/TimelineModes";
import { DecisionRanking } from "./ranking/DecisionRanking";
import { useBuyTimeline } from "../../../hooks/useBuyTimeline";
import { useCotucUniverse } from "../../../hooks/useCotucUniverse";
import { useCorpEvents, useDividendScreener, useToOverview } from "../../../hooks/useCorpEvents";
import { useBoardQuotes } from "../../../hooks/useBoardQuotes";
import { isSpecialDividend, yieldAnomaly } from "../../../lib/cotuc/universe-stocks";
import { dsToStock } from "../../../lib/cotuc/dsStocks";
import { DividendScreenerTable, type SortField } from "./screener/DividendScreenerTable";
import { useAppStore } from "../../../store/useAppStore";

// ============================================================
// BADGE COMPONENTS
// ============================================================

function DaysChip({ dateStr, label }: { dateStr: string; label: string }) {
  const d = getDaysUntil(dateStr);
  if (d === null) return null;
  const past = d < 0;
  const urgent = d >= 0 && d <= 7;
  // Cai tien: phan biet "da qua GAN DAY" (binh thuong, dang cho tien ve/
  // ke tiep) voi "DOT CU" (da qua QUA LAU >60 ngay - nghia la CHUA CO dot
  // moi duoc VCI cong bo, khong phai loi he thong khong cap nhat).
  const isStale = past && Math.abs(d) > 60;
  return (
    <div className={`text-center px-2 py-1 rounded-lg border text-[10px] ${
      past ? "border-cf-border-strong text-cf-tertiary"
      : urgent ? "border-rose-700 bg-rose-950 text-rose-400"
      : "border-cf-border-strong text-cf-secondary"}`}
      title={isStale ? "Đã qua hơn 60 ngày - chưa có đợt mới được công bố (không phải lỗi hệ thống)" : undefined}>
      <span className="block font-bold">{label}</span>
      <span className={`font-black ${urgent ? "animate-pulse" : ""}`}>
        {isStale ? "Đợt cũ" : past ? "Đã qua" : d === 0 ? "Hôm nay!" : `${d}n`}
      </span>
    </div>
  );
}

// ============================================================
// STOCK DETAIL MODAL - VA LO HONG #3: Focus Trap + ESC to close
// ============================================================

function StockModal({ s, onClose, realRs, livePrice }: {
  s: DividendStock; onClose: () => void; realRs?: number | null; livePrice?: number;
}) {
  // BL5 (07/11/2026): hồ sơ mã CHỈ dùng dữ liệu thật qua Gateway — đã gỡ Vòng đời cổ tức / Xác suất giải ngân / Optimal Timing /
  // tín hiệu KQKD / ưu–nhược điểm và điểm xúc tác AI (đều từ Project A). Sự kiện & cổ tức: kho sự kiện VNDirect + nghiên cứu GDKHQ XD-v1.
  const [modalTab, setModalTab] = useState<"overview" | "flags" | "events" | "seasonality">("overview");
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const phase = getTradePhase(s);
  const flags = detectRiskFlags(s);

  // ESC de dong modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus Trap: khoa Tab bo vong quanh trong modal, khong roi ra ngoai
  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleTabKey);
    return () => window.removeEventListener("keydown", handleTabKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-cf-base/90 flex items-center justify-center p-4 overflow-y-auto"
      role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="stock-modal-title" data-testid="stock-modal"
        className="cf-surface-gradient-strong w-full max-w-2xl rounded-2xl shadow-2xl my-4">

        <div className="flex items-center justify-between p-5 border-b border-cf-border/60">
          <div className="flex items-center gap-3">
            <span id="stock-modal-title" className="text-2xl font-black text-cf-gold">{s.ticker}</span>
            <div>
              <p className="text-xs font-bold text-cf-primary">{s.name}</p>
              <p className="text-[10px] text-cf-tertiary">{s.sector}</p>
            </div>
            <FmBadge fm={s.fm} />
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Đóng cửa sổ chi tiết"
            className="text-cf-tertiary hover:text-cf-primary text-xs px-3 py-1.5 rounded-lg border border-cf-border-strong focus:outline-none focus:ring-2 focus:ring-amber-500">
            ✕ Đóng
          </button>
        </div>

        <div className="flex gap-2 p-4 border-b border-cf-border/60 flex-wrap">
          <DaysChip dateStr={s.agmDate} label="ĐHCĐ" />
          <DaysChip dateStr={s.exDividendDate} label="GDKHQ" />
          <DaysChip dateStr={s.paymentDate} label="Thanh toán" />
          <div className="flex-1 min-w-[140px] bg-cf-base/60 rounded-lg p-2 border border-cf-border-strong">
            <p className="text-[10px] text-cf-tertiary font-bold uppercase">Cổ tức / CP</p>
            <p className="text-sm font-black text-cf-positive">{fmtVND(s.dividendAmount)}</p>
            <p className="text-[10px] text-cf-secondary">Yield: {fmtPct(s.dividendYield)}</p>
          </div>
          <div className={`cf-box-hairline flex-1 min-w-[140px] rounded-lg p-2 ${phase.color}`}>
            <p className="text-[10px] font-bold uppercase opacity-70">Vị thế</p>
            <p className="text-xs font-black">{phase.icon} {phase.action}</p>
            <p className="text-[10px] opacity-70">{phase.safety}</p>
          </div>
        </div>

        <div className="flex border-b border-cf-border/60 px-4" role="tablist">
          {(["overview", "flags", "events", "seasonality"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={modalTab === t} onClick={() => setModalTab(t)} data-testid={`modal-tab-${t}`}
              className={`px-4 py-2.5 text-[10px] font-bold border-b-2 transition-all focus:outline-none
                ${modalTab === t ? "border-amber-500 text-cf-gold" : "border-transparent text-cf-secondary hover:text-cf-primary"}`}>
              {t === "overview" ? "📊 Tổng Quan" : t === "flags" ? "⚠️ Rủi Ro" : t === "events" ? "📅 Sự kiện & cổ tức" : "📊 Mùa vụ KQKD"}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[55vh] overflow-y-auto space-y-3">
          {modalTab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["P/E", s.fundamentalsReal ? s.pe.toFixed(1) + "x" : null],
                  ["ROE", s.fundamentalsReal ? fmtPct(s.roe) : null],
                  ["Tăng trưởng LNST 12T", s.growthReal ? (s.growth > 0 ? "+" : "") + s.growth.toFixed(1) + "%" : null],
                  ["F-Score", s.fscore > 0 ? s.fscore + "/9" : null],
                  ["Tỷ lệ chi trả", s.payoutReal ? fmtPct(s.payoutRatio) : null],
                  ["Nợ / VCSH", s.fundamentalsReal ? s.debtEquity.toFixed(2) + "x" : null],
                  ["RSI 14", s.rsi > 0 ? s.rsi.toFixed(1) : null],
                  ["Xu hướng giá", s.priceTrend ? PRICE_TREND_LABEL[s.priceTrend] : null],
                  ["RS 3T (VN-Index)", realRs !== null && realRs !== undefined ? (realRs >= 0 ? "+" : "") + realRs + "%" : null],
                ] as [string, string | null][]).map(([label, val]) => (
                  <div key={label} className="cf-panel rounded-lg p-2.5">
                    <p className="text-[10px] text-cf-tertiary font-bold uppercase">{label}</p>
                    <p className={`text-xs font-black mt-0.5 ${val == null ? "text-cf-tertiary" : "text-cf-primary"}`}>{val ?? "chưa có"}</p>
                  </div>
                ))}
              </div>
              <FactorPanel fm={s.fm} />
              <DividendQualityPanel dq={s.dq} />
            </>
          )}

          {modalTab === "flags" && (
            <div className="space-y-3">
              {flags.length === 0 && !riskDataReady(s) ? (
                <div className="cf-banner-neutral rounded-xl p-4 text-[11px] text-cf-tertiary">Chưa đủ dữ liệu tài chính thật (P/E, Nợ / VCSH, tỷ lệ chi trả, tăng trưởng) để đánh giá rủi ro.</div>
              ) : flags.length === 0 ? (
                <div className="cf-banner-positive rounded-xl p-4 flex items-center gap-2 text-cf-positive">
                  <CheckCircle2 className="w-4 h-4" /><span className="text-xs font-bold">Sạch rủi ro tài chính!</span>
                </div>
              ) : flags.map((f, i) => (
                <div key={i} className="cf-banner-warning-soft rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-cf-gold shrink-0 mt-0.5" />
                  <p className="text-xs text-cf-gold-bright">{f}</p>
                </div>
              ))}
              {s.dq?.trap?.length ? (
                <div className="cf-banner-warning-soft rounded-xl p-3 text-xs text-cf-gold-bright">🪤 Dấu hiệu bẫy lợi suất: {s.dq.trap.join("; ")}</div>
              ) : null}
            </div>
          )}

          {modalTab === "events" && (
            <ErrorBoundary fallbackLabel="Không hiển thị được sự kiện & cổ tức">
              <TickerEventsBody ticker={s.ticker} price={livePrice ?? (s.price > 0 ? s.price : undefined)} />
            </ErrorBoundary>
          )}
          {modalTab === "seasonality" && (
            <ErrorBoundary fallbackLabel="Không hiển thị được Mùa vụ KQKD">
              {/* BL5: cùng màn Mùa vụ KQKD của tab Kết quả kinh doanh (Gateway, SD-v1) — giữ nguyên công thức / thiết kế, chỉ khoá vào mã đang xem. */}
              <SeasonalityView tickers={[s.ticker]} value={s.ticker} onChange={() => {}} />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface CotucTabProps {
  realRsMap?: Record<string, number | null>;
  isRealRsLoading?: boolean;
}

/** Gia Trinh Timing v3 (Giai doan 5): dung khi ticker CHUA co trong
 * response /api/cotuc/timing-signals (VD ma vua duoc them vao Universe,
 * chua kip tinh o lan cron gan nhat) - KHONG duoc de o trong/crash. */

function CotucTabInner({ realRsMap = {}, isRealRsLoading = false, onNeedRs }: CotucTabProps & { onNeedRs?: () => void }) {
  // F1 (06/11/2026): 3 tab con — Kết quả kinh doanh · Cổ tức · Timeline điểm mua. Mọi mục cũ giữ nguyên logic, chỉ đổi chỗ.
  // Mặc định mở "Timeline điểm mua" — câu hỏi chính của tab: mã nào sắp/đang vào vùng mua có cơ sở thống kê.
  const [subTab, setSubTabRaw] = useState<SubView>(() => readView().view);
  const lastOf = useRef<Record<CotucGroup, SubView>>(readView().last);
  const setSubTab = useCallback((v: SubView) => {
    setSubTabRaw(v);
    lastOf.current = { ...lastOf.current, [GROUP_OF[v]]: v };
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view: v, last: lastOf.current })); } catch { /* không có storage */ }
  }, []);
  const group = GROUP_OF[subTab];
  // F4 (06/11/2026): tải theo nhu cầu — dữ liệu chỉ phục vụ Bộ lọc / hồ sơ mã / lịch chưa tải khi đang ở Timeline.
  const [need, setNeed] = useState({ screener: group === "cotuc" });
  // "🗂 Bản cũ": Lịch GDKHQ v1 và Xếp hạng v2 (engine cũ, 17 mã) — giữ để đối chiếu, không xoá chức năng.
  const buyTimeline = useBuyTimeline();
  // Giai Trinh Timing v3 (Giai doan 4): sub-tab moi RIENG, ngang hang
  // Screener/Lich/KQKD/Timing cu, can TU CHON ma truoc (OptimalTimingTab
  // can du lieu 1 ma cu the, khac cac sub-tab khac hien thi danh sach).
  const [timingV3Ticker, setTimingV3Ticker] = useState<string | null>(null);
  // Giai Trinh Timing v3 (Giai doan 5): mot request cho CA vu tru (khong
  // goi optimizeDividendTiming rieng cho tung dong Screener - 70-100+
  // lenh goi mang). byTicker dung de tra cuu O(1) trong bang chinh (DividendScreenerTable).
  // TO-v1: đợt cổ tức tiền đang diễn ra theo mã (Radar Săn cổ tức, Gateway) cho các cột Săn cổ tức / Kỳ vọng nhóm / Cảnh báo của Bộ lọc.
  const { data: toDoc } = useToOverview(need.screener);
  const toByTicker = useMemo(() => { const m = new Map<string, ToRadarRow>(); for (const r of toDoc?.radar.rows ?? []) { const cur = m.get(r.t); if (!cur || (r.lastCumDate ?? r.ex) < (cur.lastCumDate ?? cur.ex)) m.set(r.t, r); } return m; }, [toDoc]);
  const [filter, setFilterRaw] = useState<DividendFilter>(DEFAULT_FILTER);
  useEffect(() => {
    const screener = group === "cotuc";
    if (screener && !need.screener) setNeed((n) => ({ ...n, screener: true }));
    if (screener) onNeedRs?.();
  }, [group, need.screener, onNeedRs]);
  const [sortField, setSortField] = useState<string>("dividendYield");
  const [sortAsc, setSortAsc] = useState(false);
  // FIX (2026-09-12): truoc day luu SNAPSHOT object vao state -> neu bam
  // vao 1 ma TRUOC KHI /api/cotuc/fundamentals kip tra ve (mat vai giay),
  // Modal "dong bang" mai theo du lieu mau cu, KHONG tu cap nhat lai du
  // mergedStocks sau do da co du lieu that (da xac nhan qua debug that:
  // backend tra dung so, nhung Modal van hien so mau). Sua: chi luu
  // TICKER (string), Modal LUON tu tinh lai tu mergedStocks moi nhat.
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(true);

  // PHUONG AN B: noi vao useAppStore de lien ket cheo Sidebar/Radar, dung
  // convention da co san trong Global-Quanta-Data-Sharing-Guide.md muc 2.3.
  // Chi dong bo 1 chieu ra ngoai (click trong tab -> cap nhat selection toan
  // cuc) + highlight hang tuong ung khi selection toan cuc trung voi 1 ma
  // trong DIVIDEND_STOCKS. KHONG tu dong mo Modal khi selection thay doi tu
  // noi khac (VD chon ma o Sidebar) de tranh UX bat ngo (modal tu bat ra).
  const globalSelectedTicker = useAppStore((s) => s.selectedTicker);
  const selectTickerGlobal = useAppStore((s) => s.selectTicker);
  const handleSelect = useCallback((s: DividendStock) => {
    setSelectedTicker(s.ticker);
    selectTickerGlobal(s.ticker);
  }, [selectTickerGlobal]);
  // Mở StockModal theo mã (cả danh mục ~300 mã — modal tự tra trong allStocksWithUniverse).
  const openTicker = useCallback((t: string) => { setSelectedTicker(t); selectTickerGlobal(t); }, [selectTickerGlobal]);

  // PHUONG AN D: mo rong universe qua /api/universe. Ma them vao KHONG duoc
  // trung voi 17 ma da co trong DIVIDEND_STOCKS.
  const { universe, isLoading: universeLoading } = useUniverseSearch();
  const { requested, addRequested, removeRequested } = useRequestedTickers();
  const [expandQuery, setExpandQuery] = useState("");
  const existingTickers = useState(() => new Set(DIVIDEND_STOCKS.map((s) => s.ticker)))[0];
  const expandResults = useMemo(() => {
    const q = expandQuery.trim().toUpperCase();
    if (!q) return [];
    return universe
      .filter((u) => u.ticker.toUpperCase().includes(q) && !existingTickers.has(u.ticker) && !requested.includes(u.ticker))
      .slice(0, 8);
  }, [expandQuery, universe, existingTickers, requested]);

  // VA LO HONG #7: dong bo filter voi URL - F5 khong mat, chia se link duoc
  const setFilter = useCallback((f: DividendFilter) => setFilterRaw(f), []);
  useDividendFilterUrl(filter, setFilter);

  // VA LO HONG #5: debounce o tim kiem 300ms truoc khi loc
  const debouncedSearchQ = useDebouncedValue(filter.searchQ, 300);
  const effectiveFilter = useMemo(() => ({ ...filter, searchQ: debouncedSearchQ }), [filter, debouncedSearchQ]);

  const { pinned, togglePin, isPinned } = usePinnedStocks();
  const { lifecycleEventsMap, isLoading: eventsLoading } = useDividendEvents();
  // BL4: bộ lọc đã lưu + cột hiển thị theo tài khoản (Gateway /api/market/screener-prefs).
  const screenerPrefs = useScreenerPrefs();
  const hiddenCols = useMemo(() => new Set(SCREENER_COLUMNS.filter((c) => screenerPrefs.prefs.columns[c] === false)), [screenerPrefs.prefs.columns]);
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !screenerPrefs.loaded) return;
    defaultApplied.current = true;
    const def = screenerPrefs.prefs.screens.find((x) => x.name === screenerPrefs.prefs.defaultScreen);
    // Link chia sẻ có tham số lọc trên URL thì ưu tiên link (không ghi đè bằng bộ lọc mặc định).
    const urlHasFilter = [...new URLSearchParams(window.location.search).keys()].some((k) => k in DEFAULT_FILTER);
    if (!def || urlHasFilter) return;
    setFilterRaw({ ...savedToFilter(def.filter) });
    if (def.sort) { setSortField(def.sort.field); setSortAsc(def.sort.asc); }
  }, [screenerPrefs.loaded, screenerPrefs.prefs]);

  // BL1 (07/11/2026): MỘT nguồn thật duy nhất cho Bộ lọc — Gateway DS-v1 (/api/corp-events/screener): giá, xu hướng, RSI (bản quét),
  // cổ tức (sự kiện VNDirect), P/E, ROE, nợ, tỷ lệ chi trả, tăng trưởng, F-Score (KQKD 4 quý). Thay ghép 5 API Project A + số mẫu.
  // BL3: điểm xếp hạng = mô hình nhân tố FM-v1 (DS-v2) — đã gỡ Dividend Quality Score của Project A.
  const { data: dsDoc, error: dsError, isLoading: dsLoading } = useDividendScreener(true);
  const { rows: gatewayUniverse } = useCotucUniverse();
  const liveSymbols = useMemo(() => [...new Set([...(dsDoc?.rows ?? []).map((r) => r.t), ...gatewayUniverse.map((u) => u.ticker)])], [dsDoc, gatewayUniverse]);
  const board = useBoardQuotes(liveSymbols, { flushMs: 1000 });
  const livePrices = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [t, q] of Object.entries(board.quotes)) if (q?.price && q.price > 0) out[t] = q.price;
    return out;
  }, [board.quotes]);
  const liveChangePct = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [t, q] of Object.entries(board.quotes)) out[t] = q?.changePct ?? null;
    return out;
  }, [board.quotes]);
  const todayIso = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  const allStocksWithUniverse = useMemo(() => (dsDoc?.rows ?? []).map((row) => {
    const s = dsToStock(row, livePrices[row.t]);
    const ev = lifecycleEventsMap[row.t];
    return {
      ...s,
      // Cờ chỉ cảnh báo (không đổi số): đợt chi lớn bất thường / tỷ suất 12 tháng bất thường — từ lịch sử sự kiện.
      specialDividend: isSpecialDividend(ev, todayIso), yieldAnomaly: yieldAnomaly(ev, s.dividendYield, todayIso),
    };
  }), [dsDoc, livePrices, lifecycleEventsMap, todayIso]);

  // FIX: derive "selected" TU allStocksWithUniverse moi nhat (khong luu
  // snapshot tinh) - Modal luon hien dung du lieu that ngay khi fetch
  // xong, ke ca neu nguoi dung bam vao ma TRUOC KHI fundamentals kip tra
  // ve. Bao gom ca ma tu Universe (goi chung 1 bang theo yeu cau).
  const seasonalityTickers = useMemo(() => allStocksWithUniverse.map((s) => s.ticker), [allStocksWithUniverse]);
  // S1: nút "📊 Mùa vụ" trong ngăn KQKD / Lịch công bố -> mở mục Mùa vụ KQKD của mã.
  const openSeasonality = useCallback((t: string) => { setTimingV3Ticker(t); setSubTab("seasonality"); }, [setSubTab]);
  const sectorByTicker = useMemo(() => new Map(allStocksWithUniverse.map((s) => [s.ticker, s.sector ?? null])), [allStocksWithUniverse]);
  const selected = useMemo(
    () => (selectedTicker ? allStocksWithUniverse.find((s) => s.ticker === selectedTicker) ?? null : null),
    [selectedTicker, allStocksWithUniverse]
  );
  // F4: hồ sơ một mã (mở từ bất kỳ tab con nào, kể cả Timeline) cần RS / AI / tín hiệu thời điểm -> bật tải.
  useEffect(() => {
    if (!selectedTicker) return;
    if (!need.screener) setNeed((n) => ({ ...n, screener: true }));
    onNeedRs?.();
  }, [selectedTicker, need.screener, onNeedRs]);

  const filtered = useMemo(() =>
    filterAndSortStocks(
      allStocksWithUniverse, effectiveFilter,
      sortField as keyof DividendStock | "score" | "catalyst",
      sortAsc, realRsMap
    ), [allStocksWithUniverse, effectiveFilter, sortField, sortAsc, realRsMap]
  );

  const filterStats = useMemo(() => explainFilter(allStocksWithUniverse, effectiveFilter), [allStocksWithUniverse, effectiveFilter]);

  // Danh sach da ghim luon hien dau, khong phu thuoc bo loc
  const pinnedStocks = useMemo(() => allStocksWithUniverse.filter((s) => pinned.includes(s.ticker)), [allStocksWithUniverse, pinned]);

  // LSK7: "Sắp GDKHQ / Sắp ĐHCĐ" lấy từ kho sự kiện Gateway (mọi sự kiện, cùng nguồn với Lịch sự kiện) thay vì 1 ngày gần nhất mỗi mã.
  const { data: corpEvents } = useCorpEvents(true);
  const stats = useMemo(() => {
    const yieldAvg = allStocksWithUniverse.reduce((s, x) => s + x.dividendYield, 0) / allStocksWithUniverse.length;
    const highYield = allStocksWithUniverse.filter((x) => x.dividendYield >= 5).length;
    const lim = new Date(Date.parse(`${todayIso}T00:00:00Z`) + UPCOMING_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
    const evs = corpEvents?.events ?? [];
    const exT = new Set(evs.filter((e) => ["CASH", "STOCK", "BONUS"].includes(e.cat) && e.ex && e.ex >= todayIso && e.ex <= lim).map((e) => e.t));
    const agm = [...new Set(evs.filter((e) => e.cat === "AGM" && e.meeting && e.meeting >= todayIso && e.meeting <= lim).sort((a, b) => a.meeting!.localeCompare(b.meeting!)).map((e) => e.t))];
    return { yieldAvg, highYield, upcoming: exT.size, upcomingAGM: agm.map((ticker) => ({ ticker })) };
  }, [allStocksWithUniverse, corpEvents, todayIso]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };


  return (
    <div className="cf-surface-gradient rounded-2xl p-5 shadow-xl space-y-4">

      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-cf-border/60">
        <h3 className="text-sm font-bold uppercase text-cf-primary flex items-center gap-1.5 font-display">
          <Coins className="w-4 h-4 text-cf-gold" /> Phân Tích Cơ Bản <span className="ml-1 text-[11px] font-semibold normal-case text-cf-tertiary">Kết quả kinh doanh · Cổ tức · Timeline điểm mua</span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {dsDoc
            ? <span className="flex items-center gap-1 text-[10px] text-cf-positive" title={`Bản quét ${dsDoc.asOf.scannerData ?? "—"} · KQKD ${dsDoc.asOf.kqkd ?? "—"} · sự kiện ${(dsDoc.asOf.events ?? "").slice(0, 16)}`}><CheckCircle2 className="w-3 h-3" />Dữ liệu thật · Gateway ({dsDoc.count} mã)</span>
            : dsLoading || eventsLoading
            ? <span className="text-[10px] text-cf-tertiary animate-pulse">Đang tải dữ liệu…</span>
            : <span className="text-[10px] text-amber-300">Nguồn dữ liệu Bộ lọc tạm lỗi{dsError ? ` (${dsError.slice(0, 60)})` : ""}</span>}
        </div>
      </div>

      {/* BL6: nguồn dữ liệu Bộ lọc — mọi số từ Gateway (VNDirect, SSI); hạng = mô hình nhân tố FM-v1 (MÔ TẢ). */}
      <div className="cf-banner-neutral rounded-xl p-2.5 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-cf-secondary shrink-0 mt-0.5" />
        <p className="text-[10px] text-cf-secondary leading-relaxed">
          <b className="text-cf-primary">Về dữ liệu:</b> <b>Ngày GDKHQ/ĐHCĐ</b>, <b>KQKD theo quý</b>,
          <b> giá, P/E, ROE, Nợ/Vốn chủ sở hữu, RSI, Tỷ lệ chi trả, Tăng trưởng LNST</b>, <b>xu hướng giá (MA50 / MA200)</b> và
          <b> hạng mô hình nhân tố FM-v1</b> đều là dữ liệu thật (VNDirect, SSI qua Gateway). Hạng FM-v1 là <b>MÔ TẢ</b>: kiểm định đặt trước chưa đạt đủ tiêu chí.
          <b> F-Score</b> tính được <b>6/9 tiêu chí Piotroski</b>.
          Bộ lọc không còn số liệu mẫu: trường chưa có dữ liệu thật được ghi rõ và tách riêng khi lọc.
        </p>
      </div>


      {/* PHUONG AN D: tim/them ma ngoai 17 ma co san. Ket qua duoc luu vao
          "yeu cau bo sung" rieng (localStorage), KHONG dua vao bang
          Score/DCF chinh vi thieu du lieu day du. */}
      <div className="cf-panel-soft rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-cf-tertiary" />
          <input
            value={expandQuery}
            onChange={(e) => setExpandQuery(e.target.value)}
            placeholder="Tìm mã khác trong VN30+VN100 để yêu cầu bổ sung dữ liệu cổ tức..."
            className="flex-1 bg-transparent text-[10px] text-cf-primary placeholder:text-cf-tertiary outline-none"
          />
          {universeLoading && <RefreshCw className="w-3 h-3 text-cf-tertiary animate-spin" />}
        </div>
        {expandResults.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {expandResults.map((u) => (
              <button key={u.ticker} onClick={() => { addRequested(u.ticker); setExpandQuery(""); }}
                className="text-[10px] font-bold text-cf-primary bg-cf-base/60 hover:bg-cf-surface-2 px-2 py-1 rounded-lg border border-cf-border-strong flex items-center gap-1">
                + {u.ticker}{u.sector ? <span className="text-cf-tertiary font-normal">· {u.sector}</span> : null}
              </button>
            ))}
          </div>
        )}
        {requested.length > 0 && (
          <div className="pt-1 border-t border-cf-border/60">
            <p className="text-[10px] text-cf-tertiary mb-1.5">
              📋 Đã yêu cầu bổ sung ({requested.length}) — <i>chưa có dữ liệu P/E/ROE/DCF, chỉ là danh sách theo dõi</i>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {requested.map((t) => (
                <span key={t} className="text-[10px] font-bold text-cf-gold/80 bg-amber-950/20 px-2 py-1 rounded-lg border border-amber-800/30 flex items-center gap-1.5">
                  {t}
                  <button onClick={() => removeRequested(t)} aria-label={`Bỏ yêu cầu ${t}`} className="text-cf-tertiary hover:text-cf-negative">✕</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {pinnedStocks.length > 0 && (
        <div className="cf-banner-gold-soft rounded-xl p-3">
          <p className="text-[10px] font-bold text-cf-gold uppercase mb-2 flex items-center gap-1"><Star className="w-3 h-3" fill="currentColor" /> Đã ghim ({pinnedStocks.length})</p>
          <div className="flex flex-wrap gap-2">
            {pinnedStocks.map((s) => (
              <button key={s.ticker} onClick={() => handleSelect(s)}
                className="text-[10px] font-black text-cf-gold bg-cf-base/60 px-2.5 py-1 rounded-lg border border-amber-800/40">
                {s.ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      <CotucScanStatusBar universeCount={allStocksWithUniverse.length} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Yield TB Universe", value:fmtPct(stats.yieldAvg), color:"text-cf-positive", sub:`${allStocksWithUniverse.length} mã theo dõi` },
          { label:"Yield > 5%", value:String(stats.highYield), color:"text-cf-gold", sub:"mã trong universe" },
          { label:`Sắp GDKHQ (${UPCOMING_WINDOW_DAYS}n)`, value:String(stats.upcoming), color:"text-sky-400", sub:"mã trong 30 ngày tới" },
          { label:`Sắp ĐHCĐ (${UPCOMING_WINDOW_DAYS}n)`, value:String(stats.upcomingAGM.length), color:stats.upcomingAGM.length > 0 ? "text-purple-400" : "text-cf-secondary", sub:stats.upcomingAGM.map((s) => s.ticker).join(", ") || "Không có" },
        ].map((item) => (
          <div key={item.label} className="cf-panel rounded-xl p-3">
            <p className="text-[10px] text-cf-tertiary font-bold uppercase mb-1">{item.label}</p>
            <p className={`text-xl font-black num ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-cf-tertiary mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      <nav className="cotuc-nav" aria-label="Phân tích cơ bản">
        <div className="cotuc-groups" role="tablist" aria-label="Chọn tab con">
          {GROUPS.map((g) => {
            const on = group === g.id;
            const count = g.id === "timeline" ? (buyTimeline.data ? buyTimeline.data.counts.inWindow + buyTimeline.data.counts.upcoming : null) : g.id === "cotuc" ? filtered.length : null;
            return (
              <button key={g.id} type="button" role="tab" id={`cotuc-group-${g.id}`} aria-selected={on} data-testid={`cotuc-group-${g.id}`}
                onClick={() => setSubTab(on ? subTab : lastOf.current[g.id])}
                className={`cotuc-group${on ? " is-active" : ""}`}>
                <span className="cotuc-group-title">{g.label}{count !== null && <span className="num cotuc-count">{count}</span>}</span>
                <span className="cotuc-group-sub">{g.sub}</span>
              </button>
            );
          })}
        </div>
        {group !== "timeline" && (
          <div className="cotuc-views" role="tablist" aria-label={`Mục trong ${GROUPS.find((g) => g.id === group)?.label ?? ""}`}>
            {VIEWS.filter((v) => GROUP_OF[v.id] === group).map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={subTab === v.id} data-testid={`cotuc-view-${v.id}`}
                onClick={() => setSubTab(v.id)} className={`cotuc-view${subTab === v.id ? " is-active" : ""}`}>{v.label}</button>
            ))}
          </div>
        )}
      </nav>

      {subTab === "timeline" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được Timeline điểm mua">
          <TimelineModes onSelectTicker={openTicker} />
        </ErrorBoundary>
      )}

      {subTab === "screener" && (
        <div className="space-y-3">
          <div className="cf-panel rounded-xl p-3">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-cf-tertiary" />
                <input value={filter.searchQ} onChange={(e) => setFilter({ ...filter, searchQ:e.target.value })}
                  placeholder="Tìm mã hoặc tên..."
                  className="cf-panel-input w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-cf-primary focus:outline-none focus:border-amber-500" />
              </div>
              <button onClick={() => setShowFilter(!showFilter)} className="text-[10px] text-cf-secondary hover:text-cf-primary flex items-center gap-1">
                {showFilter ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Bộ lọc
              </button>
            </div>

            {showFilter && (
              <div className="space-y-3">
                <ScreenerToolbar stocks={allStocksWithUniverse} filter={filter} setFilter={setFilter}
                  sort={{ field: sortField, asc: sortAsc }} setSort={(x) => { setSortField(x.field); setSortAsc(x.asc); }}
                  prefs={screenerPrefs.prefs} updatePrefs={screenerPrefs.update} cloud={screenerPrefs.cloud} notice={screenerPrefs.notice}
                  shown={filtered.length} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label:`Yield ≥ ${fmtPct(filter.minYield)}`, key:"minYield", min:0, max:15, step:0.5, val:filter.minYield },
                    { label:`ROE ≥ ${fmtPct(filter.minRoe)}`, key:"minRoe", min:0, max:30, step:1, val:filter.minRoe },
                    { label: filter.maxPe >= PE_NO_LIMIT ? "P/E: không giới hạn" : `P/E ≤ ${filter.maxPe}x`, key:"maxPe", min:5, max:PE_NO_LIMIT, step:0.5, val:filter.maxPe },
                    { label:`F-Score ≥ ${filter.minFscore}/9`, key:"minFscore", min:0, max:9, step:1, val:filter.minFscore },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] text-cf-secondary font-bold block mb-1">{f.label}</label>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={f.val}
                        onChange={(e) => setFilter({ ...filter, [f.key]:parseFloat(e.target.value) })}
                        className="w-full h-1.5 accent-amber-500" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <label className="flex items-center gap-1 text-[10px] text-cf-secondary" title="Ngũ phân vị mô hình nhân tố FM-v1 (MÔ TẢ — chưa qua kiểm định dự báo)">
                    Hạng NT
                    <select value={filter.minQuintile ?? 0} onChange={(e) => setFilter({ ...filter, minQuintile: Number(e.target.value) })} data-testid="filter-quintile"
                      className="cf-panel-input rounded-md px-1.5 py-0.5 text-[10px] text-cf-primary">
                      <option value={0}>Tất cả</option>
                      <option value={3}>Q3 trở lên</option>
                      <option value={4}>Q4 trở lên</option>
                      <option value={5}>Chỉ Q5</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-cf-secondary">
                    Xu hướng giá
                    <select value={filter.trend} onChange={(e) => setFilter({ ...filter, trend: e.target.value as typeof filter.trend })} data-testid="filter-trend"
                      className="cf-panel-input rounded-md px-1.5 py-0.5 text-[10px] text-cf-primary" title="Theo MA50 / MA200 của giá điều chỉnh (Gateway)">
                      <option value="All">Tất cả</option>
                      {(Object.keys(PRICE_TREND_LABEL) as (keyof typeof PRICE_TREND_LABEL)[]).map((k) => <option key={k} value={k}>{PRICE_TREND_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-cf-secondary cursor-pointer">
                    <input type="checkbox" checked={!filter.hideStaleEvents}
                      onChange={(e) => setFilter({ ...filter, hideStaleEvents: !e.target.checked })}
                      className="accent-amber-500" />
                    🕓 Hiện cả mã chưa có lịch cổ tức mới
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-cf-secondary cursor-pointer ml-auto">
                    <input type="checkbox" checked={filter.hideRiskFlags}
                      onChange={(e) => setFilter({ ...filter, hideRiskFlags:e.target.checked })}
                      className="accent-amber-500" />
                    🛡️ Ẩn Red Flag
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-cf-secondary cursor-pointer" title="Ẩn mã lợi suất ≥ 8% kèm giá giảm > 30% / chi trả vượt lợi nhuận / dòng tiền tự do < 50% cổ tức / LNST giảm > 30%">
                    <input type="checkbox" checked={!!filter.hideTraps} onChange={(e) => setFilter({ ...filter, hideTraps: e.target.checked })} className="accent-amber-500" data-testid="filter-hide-traps" />
                    🪤 Ẩn bẫy lợi suất
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Minh bạch bộ lọc: ghi rõ đang ẩn bao nhiêu mã và vì sao (không ẩn lặng lẽ). */}
          <div data-testid="filter-explain" className="tw-scope flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10.5px] text-slate-500">
            <span>Hiển thị <span className="font-mono tabular-nums text-slate-200">{filtered.length}</span>/<span className="font-mono tabular-nums">{allStocksWithUniverse.length}</span> mã</span>
            {filterStats.stale > 0 && (
              <button type="button" onClick={() => setFilter({ ...filter, hideStaleEvents: false })} className="text-slate-400 hover:text-cyan-300 underline decoration-dotted">
                ẩn {filterStats.stale} mã chưa có lịch cổ tức mới — hiện
              </button>
            )}
            {filterStats.missingData > 0 && (
              <span title="Ngưỡng ROE / P/E / Nợ / F-Score đang bật nhưng mã chưa có số liệu thật cho trường đó — không tính là đạt">
                ẩn {filterStats.missingData} mã thiếu số liệu cho ngưỡng đang bật
              </span>
            )}
            <span className="ml-auto">Giá SSI trực tiếp · chỉ số cơ bản VNDirect · bấm tiêu đề cột để sắp xếp</span>
          </div>
          <DividendScreenerTable
            rows={filtered}
            sortField={sortField}
            sortAsc={sortAsc}
            onSort={(f: SortField) => handleSort(f)}
            onSelect={handleSelect}
            isPinned={isPinned}
            onTogglePin={togglePin}
            selectedTicker={globalSelectedTicker}
            realRsMap={realRsMap}
            toByTicker={toByTicker}
            livePrices={livePrices}
            liveChangePct={liveChangePct}
            flash={board.flash}
            now={board.now}
            hidden={hiddenCols}
          />
          <FmLedgerCard />
        </div>
      )}


      {subTab === "earnings" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được KQKD theo quý">
          <KqkdCenter onSelectTicker={openTicker} sectorOf={(t) => sectorByTicker.get(t) ?? null} onOpenSeasonality={openSeasonality} />
        </ErrorBoundary>
      )}

      {subTab === "ranking" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được bảng xếp hạng xác suất">
          <DecisionRanking onSelectTicker={openTicker} />
        </ErrorBoundary>
      )}


      {subTab === "timing-v3" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được Thời điểm tối ưu (Săn cổ tức)">
          {/* TO-v1 (07/11/2026): thay engine W1–W5 / bộ máy quyết định của Project A bằng "Săn cổ tức trước GDKHQ" trên Gateway. */}
          <TimingCenter onSelectTicker={openTicker} />
        </ErrorBoundary>
      )}

      {subTab === "quality" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được Chất lượng KQKD">
          <EarningsQualityPanel onSelectTicker={openTicker} sectorOf={(t) => sectorByTicker.get(t) ?? null} />
        </ErrorBoundary>
      )}

      {subTab === "seasonality" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được Mùa vụ KQKD">
          <div className="cf-panel rounded-xl p-4">
            <SeasonalityView tickers={seasonalityTickers} value={timingV3Ticker} onChange={setTimingV3Ticker} />
          </div>
        </ErrorBoundary>
      )}

      {subTab === "kqkd-calendar" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được Lịch công bố KQKD">
          <EarningsCalendar onSelectTicker={openTicker} sectorOf={(t) => sectorByTicker.get(t) ?? null} onOpenSeasonality={openSeasonality} />
        </ErrorBoundary>
      )}

      {subTab === "calendar-v3" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được Lịch sự kiện">
          <div className="cf-panel rounded-xl p-4">
            <EventsCalendar livePrices={livePrices} onSelectTicker={openTicker} pinned={pinned} />
          </div>
        </ErrorBoundary>
      )}

      {selected && <StockModal s={selected} onClose={() => setSelectedTicker(null)} realRs={realRsMap[selected.ticker]} livePrice={livePrices[selected.ticker]} />}
    </div>
  );
}

// Boc ErrorBoundary o ngoai cung - vas lo hong #8
export default function CotucTab(props: CotucTabProps) {
  // PHUONG AN C: goi hook RS o day (component chi mount khi tab active) thay
  // vi o MainTabs.tsx, tranh goi 18 request /api/ohlcv ngay ca khi nguoi
  // dung chua mo tab Co tuc. Neu caller (MainTabs) da tu truyen realRsMap
  // rieng (VD tuong lai dung chung 1 nguon RS cho ca app), uu tien prop
  // truyen vao thay vi ghi de bang hook noi bo.
  // FIX: goi them useUniverseScores() O DAY (SWR tu dedupe voi lan goi o
  // CotucTabInner, khong ton them request that) de lay danh sach ma
  // Universe, mo rong RS tinh cho CA 71 ma nay (truoc chi tinh cho 17 ma).
  const { universeStocks } = useUniverseScores();
  // F4: RS (~90 lệnh nến) chỉ tải khi tab con Cổ tức hoặc hồ sơ một mã cần (bật một lần thì giữ).
  const [needRs, setNeedRs] = useState(false);
  const onNeedRs = useCallback(() => setNeedRs(true), []);
  const { realRsMap: fetchedRsMap, isRealRsLoading: fetchedLoading } = useRealRsData(universeStocks.map((s) => s.ticker), needRs);
  const realRsMap = props.realRsMap ?? fetchedRsMap;
  const isRealRsLoading = props.isRealRsLoading ?? fetchedLoading;

  return (
    <ErrorBoundary fallbackLabel="Tab Cổ Tức gặp lỗi khi hiển thị">
      <CotucTabInner {...props} realRsMap={realRsMap} isRealRsLoading={isRealRsLoading} onNeedRs={onNeedRs} />
    </ErrorBoundary>
  );
}
