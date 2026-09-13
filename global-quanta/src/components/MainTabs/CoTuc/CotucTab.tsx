
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import "./cotuc-theme.css";
import {
  Coins, TrendingUp, TrendingDown, Search, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Info, Star, Sparkles,
} from "lucide-react";
import {
  DIVIDEND_STOCKS, getTradePhase, calcDividendScore, calcRealDividendQualityScore, isQualityScoreReal, calcCatalystScore,
  detectRiskFlags, calcDCF, filterAndSortStocks, getDaysUntil,
  fmtVND, fmtPct, DEFAULT_FILTER,
  type DividendFilter, type DividendStock,
} from "../../../lib/quant-cotuc";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useDividendFilterUrl } from "../../../hooks/useDividendFilterUrl";
import { usePinnedStocks } from "../../../hooks/usePinnedStocks";
import { useDividendEvents } from "../../../hooks/useDividendEvents";
import type { DividendLifecycleEvent } from "../../../hooks/useDividendEvents";
import { DividendTimelinePanel } from "./DividendTimelinePanel";
import { CycleTimingPanel } from "./CycleTimingPanel";
import { CycleRankingPanel } from "./CycleRankingPanel";
import { useFundamentalsData } from "../../../hooks/useFundamentalsData";
import { useQualityScore } from "../../../hooks/useQualityScore";
import { useUniverseScores, mapUniverseEntryToLifecycleEvent } from "../../../hooks/useUniverseScores";
import { useAiAnalysis } from "../../../hooks/useAiAnalysis";
import { useRealRsData } from "../../../hooks/useRealRsData";
import { useUniverseSearch } from "../../../hooks/useUniverseSearch";
import { useRequestedTickers } from "../../../hooks/useRequestedTickers";
import { ErrorBoundary } from "../../ErrorBoundary";
import EarningsQuarterPanel from "./EarningsQuarterPanel";
import { useAppStore } from "../../../store/useAppStore";

// ============================================================
// BADGE COMPONENTS
// ============================================================

function ScoreBadge({ score, isReal = true }: { score: number; isReal?: boolean }) {
  const color = score >= 80
    ? "bg-emerald-950 text-cf-positive border-emerald-700"
    : score >= 60
    ? "bg-amber-950 text-cf-gold-bright border-amber-700"
    : "bg-cf-base text-cf-secondary border-cf-border-strong";
  return (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${color}`}
      title={isReal ? "Dividend Quality Score - dữ liệu thời gian thực" : "Đang tải dữ liệu thật... (số tạm thời, sẽ tự cập nhật)"}>
      {score}/100{!isReal && <span className="ml-1 opacity-60">⏳</span>}
    </span>
  );
}

function PhaseBadge({ s }: { s: DividendStock }) {
  const phase = getTradePhase(s);
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg border flex items-center gap-0.5 w-fit ${phase.color}`}>
      {phase.icon} {phase.label}
    </span>
  );
}

// VA LO HONG #6: phan biet ro "dang tai" (...) vs "khong co du lieu" (-)
// thay vi ca 2 truong hop deu hien "-" giong het nhau nhu ban truoc.
function RsBadge({ rs, isLoading }: { rs: number | null | undefined; isLoading?: boolean }) {
  if (isLoading) return <span className="text-cf-tertiary text-[9px] animate-pulse">...</span>;
  if (rs === null || rs === undefined) return <span className="text-cf-tertiary text-[9px]">-</span>;
  return (
    <span className={`text-[9px] font-bold flex items-center gap-0.5 ${rs >= 0 ? "text-cf-positive" : "text-cf-negative"}`}>
      {rs >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {rs >= 0 ? "+" : ""}{rs}%
    </span>
  );
}

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

function StockModal({ s, onClose, realRs, lifecycleEvents }: {
  s: DividendStock; onClose: () => void; realRs?: number | null;
  lifecycleEvents?: DividendLifecycleEvent[];
}) {
  const [modalTab, setModalTab] = useState<"overview" | "dcf" | "flags" | "timeline" | "timing">("overview");
  // FIX: neu Modal DANG MO tab "dcf" va nguoi dung chuyen sang xem 1 ma
  // KHAC (khong dong Modal truoc) ma ma moi la Universe (khong co tab
  // dcf), reset ve "overview" - tranh hien noi dung DCF vo nghia (EPS=0)
  // du nut bam da an.
  useEffect(() => {
    if (s.isUniverseOnly && modalTab === "dcf") setModalTab("overview");
  }, [s.ticker, s.isUniverseOnly, modalTab]);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const phase = getTradePhase(s);
  const flags = detectRiskFlags(s);
  const score = calcRealDividendQualityScore(s, realRs, flags.length);
  const catalyst = calcCatalystScore(s);
  const dcfBear = calcDCF(s, "bear");
  const dcfBase = calcDCF(s, "base");
  const dcfBull = calcDCF(s, "bull");

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
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="stock-modal-title"
        style={{ background:"linear-gradient(165deg,#0e1626 0%,#0a1020 100%)", border:"1px solid rgba(148,163,184,0.15)" }}
        className="w-full max-w-2xl rounded-2xl shadow-2xl my-4">

        <div className="flex items-center justify-between p-5 border-b border-cf-border/60">
          <div className="flex items-center gap-3">
            <span id="stock-modal-title" className="text-2xl font-black text-cf-gold">{s.ticker}</span>
            <div>
              <p className="text-xs font-bold text-cf-primary">{s.name}</p>
              <p className="text-[10px] text-cf-tertiary">{s.sector} · {s.marketCap}-Cap</p>
            </div>
            <ScoreBadge score={score} isReal={isQualityScoreReal(s)} />
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Đóng cửa sổ chi tiết"
            className="text-cf-tertiary hover:text-cf-primary text-xs px-3 py-1.5 rounded-lg border border-cf-border-strong focus:outline-none focus:ring-2 focus:ring-amber-500">
            ✕ Đóng
          </button>
        </div>

        {s.isUniverseOnly && (
          <div style={{ background: "rgba(56,189,248,0.06)", borderBottom: "1px solid rgba(56,189,248,0.2)" }} className="px-5 py-2 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-sky-300">
              Mã thuộc <b>Universe mở rộng</b> (VN30+VN100, quét tự động) — Dividend Quality Score, P/E, Nợ/VCSH, RSI là dữ liệu thời gian thực. Chưa có F-Score/DCF/phân tích định tính chi tiết như 17 mã theo dõi chính.
            </p>
          </div>
        )}

        <div className="flex gap-2 p-4 border-b border-cf-border/60 flex-wrap">
          <DaysChip dateStr={s.agmDate} label="ĐHCĐ" />
          <DaysChip dateStr={s.exDividendDate} label="GDKHQ" />
          <DaysChip dateStr={s.paymentDate} label="Nhận tiền" />
          <div className="flex-1 min-w-[140px] bg-cf-base/60 rounded-lg p-2 border border-cf-border-strong">
            <p className="text-[9px] text-cf-tertiary font-bold uppercase">Cổ tức / CP</p>
            <p className="text-sm font-black text-cf-positive">{fmtVND(s.dividendAmount)}</p>
            <p className="text-[9px] text-cf-secondary">Yield: {fmtPct(s.dividendYield)}</p>
          </div>
          <div style={{ border:"1px solid rgba(148,163,184,0.1)" }} className={`flex-1 min-w-[140px] rounded-lg p-2 ${phase.color}`}>
            <p className="text-[9px] font-bold uppercase opacity-70">Vị thế</p>
            <p className="text-xs font-black">{phase.icon} {phase.action}</p>
            <p className="text-[9px] opacity-70">{phase.safety}</p>
          </div>
        </div>

        <div className="flex border-b border-cf-border/60 px-4" role="tablist">
          {(["overview","dcf","flags","timeline","timing"] as const)
            .filter((t) => !(t === "dcf" && s.isUniverseOnly)) // DCF dung EPS - vo nghia voi ma Universe (eps=0, khong co du lieu that)
            .map((t) => (
            <button key={t} role="tab" aria-selected={modalTab === t} onClick={() => setModalTab(t)}
              className={`px-4 py-2.5 text-[10px] font-bold border-b-2 transition-all focus:outline-none
                ${modalTab === t ? "border-amber-500 text-cf-gold" : "border-transparent text-cf-secondary hover:text-cf-primary"}`}>
              {t === "overview" ? "📊 Tổng Quan" : t === "dcf" ? "💵 DCF 3 Kịch Bản" : t === "flags" ? "⚠️ Rủi Ro" : t === "timeline" ? "📅 Vòng Đời Cổ Tức" : "🎯 Xác Suất Giải Ngân"}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[55vh] overflow-y-auto space-y-3">
          {modalTab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["P/E", (s.isUniverseOnly && !isQualityScoreReal(s)) ? "Đang tải..." : s.pe.toFixed(1) + "x", true],
                  ["ROE", (s.isUniverseOnly && !isQualityScoreReal(s)) ? "Đang tải..." : fmtPct(s.roe), true],
                  ["Tăng trưởng EPS", !isQualityScoreReal(s) ? "Đang tải..." : (s.growth > 0 ? "+" : "") + s.growth.toFixed(1) + "%", false],
                  ["F-Score (6 tiêu chí)", !isQualityScoreReal(s) ? "Đang tải..." : s.fscore + "/6", false], ["Payout Ratio", !isQualityScoreReal(s) ? "Đang tải..." : fmtPct(s.payoutRatio), false],
                  ["Debt/Equity", (s.isUniverseOnly && !isQualityScoreReal(s)) ? "Đang tải..." : s.debtEquity.toFixed(2) + "x", true], ["RSI", (s.isUniverseOnly && !isQualityScoreReal(s)) ? "Đang tải..." : s.rsi.toFixed(1), true],
                  ["Catalyst", catalyst + "/10", true],
                  // RS 3T se het "MAU" khi Phuong an C noi xong realRs that (khong con undefined)
                  ["RS 3T (VN-Index)", realRs !== null && realRs !== undefined ? (realRs >= 0 ? "+" : "") + realRs + "%" : "Đang tải...", realRs === null || realRs === undefined],
                  ["Institutional", s.institutionalHold + "%", true],
                ].map(([label, val, isMock]) => (
                  <div key={label as string} style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-2.5">
                    <p className="text-[9px] text-cf-tertiary font-bold uppercase flex items-center gap-1">
                      {label}
                      {/* PHUONG AN A: cham vang nho danh dau field du lieu mau, khong phai loi */}
                      {isMock && <span title="Dữ liệu mẫu, chưa cập nhật thời gian thực" className="w-1 h-1 rounded-full bg-amber-500 inline-block" />}
                    </p>
                    <p className="text-xs font-black text-cf-primary mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              {s.agmAgenda && (
                <div style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-3">
                  <p className="text-[9px] text-cf-tertiary font-bold uppercase mb-1">📝 Nghị Quyết ĐHCĐ</p>
                  <p className="text-xs text-cf-primary">{s.agmAgenda}</p>
                </div>
              )}
              {(s.pros.length > 0 || s.cons.length > 0) ? (
                <div className="grid grid-cols-2 gap-2">
                  <div style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)" }} className="rounded-lg p-2.5">
                    <p className="text-[9px] text-cf-positive font-bold uppercase mb-1">✅ Ưu điểm</p>
                    {s.pros.map((p, i) => <p key={i} className="text-[10px] text-cf-primary">• {p}</p>)}
                  </div>
                  <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)" }} className="rounded-lg p-2.5">
                    <p className="text-[9px] text-cf-negative font-bold uppercase mb-1">❌ Nhược điểm</p>
                    {s.cons.map((c, i) => <p key={i} className="text-[10px] text-cf-primary">• {c}</p>)}
                  </div>
                </div>
              ) : s.isUniverseOnly ? (
                <div style={{ background:"rgba(148,163,184,0.05)", border:"1px solid rgba(148,163,184,0.15)" }} className="rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-cf-tertiary italic">Mã thuộc Universe mở rộng — chưa có phân tích định tính (ưu/nhược điểm) như 17 mã theo dõi chính.</p>
                </div>
              ) : null}
            </>
          )}

          {modalTab === "dcf" && (
            <div className="space-y-3">
              {/* VA LO HONG #4: banner canh bao DCF dung EPS proxy, khong phai FCF that */}
              <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)" }} className="rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-cf-gold shrink-0 mt-0.5" />
                <p className="text-[10px] text-cf-gold-bright"><b>Lưu ý quan trọng:</b> DCF này dùng EPS làm proxy thay cho Free Cash Flow thật — kết quả chỉ mang tính tham khảo ước lượng nhanh, KHÔNG phải định giá chính xác. Với mã có Capex cao, sai lệch có thể đáng kể. <b>Giá thị trường dùng để so sánh (% vs thị giá) cũng là số liệu mẫu tĩnh</b>, không phải giá khớp lệnh hiện tại — chênh lệch % dưới đây chỉ mang tính minh họa.</p>
              </div>
              {([["bear","🐻 Xấu",dcfBear],["base","⚖️ Cơ Sở",dcfBase],["bull","🐂 Tốt",dcfBull]] as const).map(([sc, label, val]) => {
                const pct = ((val - s.price) / s.price * 100);
                const gRate = s.growth * (sc === "bear" ? 0.4 : sc === "bull" ? 1.6 : 1);
                return (
                  <div key={sc} style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-cf-primary">{label}</p>
                      <p className="text-[9px] text-cf-tertiary mt-0.5">g = {gRate.toFixed(1)}%/năm</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${sc === "bull" ? "text-cf-positive" : sc === "base" ? "text-cf-gold" : "text-cf-negative"}`}>{fmtVND(val)}</p>
                      <p className={`text-[10px] font-bold ${pct > 0 ? "text-cf-positive" : "text-cf-negative"}`}>{pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs thị giá</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {modalTab === "flags" && (
            <div className="space-y-3">
              {flags.length === 0 ? (
                <div style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)" }} className="rounded-xl p-4 flex items-center gap-2 text-cf-positive">
                  <CheckCircle2 className="w-4 h-4" /><span className="text-xs font-bold">Sạch rủi ro tài chính!</span>
                </div>
              ) : flags.map((f, i) => (
                <div key={i} style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.25)" }} className="rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-cf-gold shrink-0 mt-0.5" />
                  <p className="text-xs text-cf-gold-bright">{f}</p>
                </div>
              ))}
            </div>
          )}

          {modalTab === "timeline" && <DividendTimelinePanel events={lifecycleEvents} />}
          {modalTab === "timing" && <CycleTimingPanel ticker={s.ticker} />}
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

function CotucTabInner({ realRsMap = {}, isRealRsLoading = false }: CotucTabProps) {
  const [subTab, setSubTab] = useState<"screener" | "calendar" | "earnings" | "timing">("screener");
  const [filter, setFilterRaw] = useState<DividendFilter>(DEFAULT_FILTER);
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
  const { realDatesMap, lifecycleEventsMap, isLoading: eventsLoading } = useDividendEvents();
  const { fundamentalsMap, isLoading: fundamentalsLoading } = useFundamentalsData();
  const { qualityScoreMap, isLoading: qualityScoreLoading } = useQualityScore();
  const { universeStocks, entries: universeEntries } = useUniverseScores();
  // FIX: tab Timeline can DividendLifecycleEvent[] day du - lifecycleEventsMap
  // (tu useDividendEvents) CHI CO 17 ma theo doi goc, ma Universe se
  // undefined neu dung nham nguon do. Tao map RIENG tu universeEntries
  // (chua bi rut gon qua mapUniverseEntryToStock).
  const universeLifecycleMap = useMemo(() => {
    const map: Record<string, DividendLifecycleEvent[]> = {};
    universeEntries.forEach((e) => {
      const event = mapUniverseEntryToLifecycleEvent(e);
      if (event) map[e.ticker] = [event];
    });
    return map;
  }, [universeEntries]);

  // Merge du lieu tinh voi ngay THAT tu VCI Events (neu co) - uu tien du lieu that
  const mergedStocks = useMemo(() => {
    return DIVIDEND_STOCKS.map((s) => {
      const real = realDatesMap[s.ticker];
      const fund = fundamentalsMap[s.ticker];
      const qs = qualityScoreMap[s.ticker];
      let merged = s;
      if (real) {
        merged = {
          ...merged,
          exDividendDate: real.exDate ? isoToVnDate(real.exDate) : merged.exDividendDate,
          agmDate: real.agmDate ? isoToVnDate(real.agmDate) : merged.agmDate,
        };
      }
      // P0: thay du lieu mau tinh (gia/P-E/ROE/No-VCSH/RSI) bang du lieu
      // THAT tu VCI + Yahoo Finance - CHI GHI DE khi co gia tri that (!=
      // null), giu nguyen du lieu mau neu 1 ma nao do chua lay duoc.
      if (fund) {
        merged = {
          ...merged,
          price: fund.price ?? merged.price,
          pe: fund.peRatio ?? merged.pe,
          roe: fund.roe ?? merged.roe,
          debtEquity: fund.debtEquity ?? merged.debtEquity,
          rsi: fund.rsi14 ?? merged.rsi,
        };
      }
      // P2: merge Tier 1-3 cua Dividend Quality Score (Tang 4 tinh rieng
      // luc dung Score, xem calcRealDividendQualityScore).
      // FIX: dong bo payoutRatio/growth THAT (da co san trong qs.details,
      // truoc day khong merge - 17 ma van hien MAU trong khi Universe da
      // co that, gay KHONG DONG BO). Details la Record<string,unknown>,
      // can kiem tra kieu number truoc khi dung.
      if (qs) {
        const payoutRatioReal = typeof qs.details.payoutRatioPct === "number" ? qs.details.payoutRatioPct : null;
        const growthReal = typeof qs.details.profitGrowthYoY === "number" ? qs.details.profitGrowthYoY : null;
        const fScoreReal = typeof qs.details.fScore === "number" ? qs.details.fScore : null;
        merged = {
          ...merged,
          qsTier1: qs.tier1, qsTier2: qs.tier2, qsTier3: qs.tier3,
          payoutRatio: payoutRatioReal ?? merged.payoutRatio,
          growth: growthReal ?? merged.growth,
          fscore: fScoreReal ?? merged.fscore,
        };
      }
      return merged;
    });
  }, [realDatesMap, fundamentalsMap, qualityScoreMap]);

  // "Gop chung 1 bang" theo yeu cau: them ma tu Universe (VN30+VN100,
  // 71 ma da loc su kien) VAO CUNG danh sach voi 17 ma theo doi goc.
  // UU TIEN GIU 17 MA GOC (day du F-Score/DCF/pros-cons that) - CHI
  // THEM ma Universe KHONG TRUNG voi 17 ma da co, tranh ghi de du lieu
  // day du bang du lieu rut gon.
  const { aiAnalysisMap } = useAiAnalysis();

  const allStocksWithUniverse = useMemo(() => {
    const existingTickerSet = new Set(mergedStocks.map((s) => s.ticker));
    const newFromUniverse = universeStocks.filter((s) => !existingTickerSet.has(s.ticker));
    const combined = [...mergedStocks, ...newFromUniverse];
    // P2 (Nhom B): merge Pros/Cons/Catalyst Score THAT (AI, dua tren so
    // lieu dinh luong) cho CA 17 ma va Universe - CHI GHI DE khi da co
    // ket qua AI (con lai giu mau/mac dinh trong luc cho vong xoay).
    return combined.map((s) => {
      const ai = aiAnalysisMap[s.ticker];
      if (!ai) return s;
      return {
        ...s,
        pros: ai.pros.length > 0 ? ai.pros : s.pros,
        cons: ai.cons.length > 0 ? ai.cons : s.cons,
        catalystScore: ai.catalystScore ?? s.catalystScore,
      };
    });
  }, [mergedStocks, universeStocks, aiAnalysisMap]);

  // FIX: derive "selected" TU allStocksWithUniverse moi nhat (khong luu
  // snapshot tinh) - Modal luon hien dung du lieu that ngay khi fetch
  // xong, ke ca neu nguoi dung bam vao ma TRUOC KHI fundamentals kip tra
  // ve. Bao gom ca ma tu Universe (goi chung 1 bang theo yeu cau).
  const selected = useMemo(
    () => (selectedTicker ? allStocksWithUniverse.find((s) => s.ticker === selectedTicker) ?? null : null),
    [selectedTicker, allStocksWithUniverse]
  );

  const filtered = useMemo(() =>
    filterAndSortStocks(
      allStocksWithUniverse, effectiveFilter,
      sortField as keyof DividendStock | "score" | "catalyst",
      sortAsc, realRsMap
    ), [allStocksWithUniverse, effectiveFilter, sortField, sortAsc, realRsMap]
  );

  // Danh sach da ghim luon hien dau, khong phu thuoc bo loc
  const pinnedStocks = useMemo(() => allStocksWithUniverse.filter((s) => pinned.includes(s.ticker)), [allStocksWithUniverse, pinned]);

  const stats = useMemo(() => {
    const yieldAvg = allStocksWithUniverse.reduce((s, x) => s + x.dividendYield, 0) / allStocksWithUniverse.length;
    const highYield = allStocksWithUniverse.filter((x) => x.dividendYield >= 5).length;
    const upcoming = allStocksWithUniverse.filter((x) => {
      const d = getDaysUntil(x.exDividendDate);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const upcomingAGM = allStocksWithUniverse.filter((x) => {
      const d = getDaysUntil(x.agmDate);
      return d !== null && d >= 0 && d <= 14;
    });
    return { yieldAvg, highYield, upcoming, upcomingAGM };
  }, [allStocksWithUniverse]);

  const calendarList = useMemo(() =>
    [...allStocksWithUniverse].sort((a, b) => {
      const da = getDaysUntil(a.exDividendDate) ?? 9999;
      const db = getDaysUntil(b.exDividendDate) ?? 9999;
      return da - db;
    }), [allStocksWithUniverse]
  );

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: string }) =>
    sortField === field
      ? (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)
      : null;

  return (
    <div style={{ background:"linear-gradient(165deg,#0e1626 0%,#0a1020 100%)", border:"1px solid rgba(148,163,184,0.1)" }}
      className="rounded-2xl p-5 shadow-xl space-y-4">

      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-cf-border/60">
        <h3 className="text-sm font-bold uppercase text-cf-primary flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-cf-gold" /> Phân Tích Cổ Tức & ĐHCĐ
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(realDatesMap).length > 0
            ? <span className="flex items-center gap-1 text-[10px] text-cf-positive"><CheckCircle2 className="w-3 h-3" />GDKHQ/ĐHCĐ: Thực (VCI)</span>
            : eventsLoading
            ? <span className="text-[10px] text-cf-tertiary animate-pulse">Đang tải sự kiện thực...</span>
            : <span className="text-[10px] text-cf-gold italic">Dùng data mẫu (VCI tạm lỗi)</span>}
        </div>
      </div>

      {/* P2 (2026-09-12): Dividend Quality Score (hien thi dau moi the/
          trong Modal) GIO DA la du lieu THAT (4 tang: Chat luong co tuc/
          Tang truong/Dinh gia/Ky thuat) khi API co du du lieu, fallback
          ve mau chi khi dang tai/loi. LUU Y: field payoutRatio/growth/
          fscore RIENG LE hien thi trong tab "Tong Quan" cua Modal (khac
          voi Score tong hop) VAN la mau - se lam o buoc sau. */}
      <div style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.15)" }}
        className="rounded-xl p-2.5 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-cf-secondary shrink-0 mt-0.5" />
        <p className="text-[9px] text-cf-secondary leading-relaxed">
          <b className="text-cf-primary">Về dữ liệu:</b> <b>Ngày GDKHQ/ĐHCĐ</b>, <b>KQKD theo quý</b>,
          <b> giá, P/E, ROE, Nợ/Vốn chủ sở hữu, RSI, Tỷ lệ chi trả (Payout Ratio), Tăng trưởng EPS</b>, và
          <b> Dividend Quality Score</b> (4 tầng) hiện là dữ liệu thời gian thực (VCI + Yahoo Finance).
          <b> F-Score</b> hiện tính được <b>6/9 tiêu chí Piotroski</b> (thiếu Dòng tiền HĐKD và Số cổ phiếu
          lưu hành — chưa xác nhận đủ tin cậy). Riêng <b>DCF, biên lợi nhuận gộp, tỷ lệ sở hữu tổ chức,
          ưu/nhược điểm</b> vẫn là số liệu mẫu cố định, sẽ được thay bằng dữ liệu thật ở các bước tiếp theo.
        </p>
      </div>


      {/* PHUONG AN D: tim/them ma ngoai 17 ma co san. Ket qua duoc luu vao
          "yeu cau bo sung" rieng (localStorage), KHONG dua vao bang
          Score/DCF chinh vi thieu du lieu day du. */}
      <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 space-y-2">
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
            <p className="text-[9px] text-cf-tertiary mb-1.5">
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
        <div style={{ background:"rgba(245,158,11,0.05)", border:"1px solid rgba(245,158,11,0.15)" }} className="rounded-xl p-3">
          <p className="text-[9px] font-bold text-cf-gold uppercase mb-2 flex items-center gap-1"><Star className="w-3 h-3" fill="currentColor" /> Đã ghim ({pinnedStocks.length})</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Yield TB Universe", value:fmtPct(stats.yieldAvg), color:"text-cf-positive", sub:`${mergedStocks.length} mã theo dõi` },
          { label:"Yield > 5%", value:String(stats.highYield), color:"text-cf-gold", sub:"mã trong universe" },
          { label:"Sắp GDKHQ (30n)", value:String(stats.upcoming), color:"text-sky-400", sub:"mã trong 30 ngày tới" },
          { label:"Sắp ĐHCĐ (14n)", value:String(stats.upcomingAGM.length), color:stats.upcomingAGM.length > 0 ? "text-purple-400" : "text-cf-secondary", sub:stats.upcomingAGM.map((s) => s.ticker).join(", ") || "Không có" },
        ].map((item) => (
          <div key={item.label} style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
            <p className="text-[10px] text-cf-tertiary font-bold uppercase mb-1">{item.label}</p>
            <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
            <p className="text-[9px] text-cf-tertiary mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ background:"rgba(2,6,15,0.7)", border:"1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-xl">
        {[
          { id:"screener" as const, label:"📋 Bộ Lọc Cổ Phiếu", count:filtered.length },
          { id:"calendar" as const, label:"📅 Lịch GDKHQ & ĐHCĐ", count:calendarList.length },
          { id:"earnings" as const, label:"📈 KQKD Theo Quý", count: null },
          { id:"timing" as const, label:"🎯 Xếp Hạng Xác Suất", count: null },
        ].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={subTab === t.id ? { background:"linear-gradient(135deg,#fbbf24,#f59e0b)" } : {}}
            className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black transition-all
              ${subTab === t.id ? "text-cf-primary" : "text-cf-secondary hover:text-cf-primary"}`}>
            {t.label}{t.count !== null && <span className={`ml-1 ${subTab === t.id ? "text-cf-tertiary" : "text-cf-gold"}`}>({t.count})</span>}
          </button>
        ))}
      </div>

      {subTab === "screener" && (
        <div className="space-y-3">
          <div style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-cf-tertiary" />
                <input value={filter.searchQ} onChange={(e) => setFilter({ ...filter, searchQ:e.target.value })}
                  placeholder="Tìm mã hoặc tên..."
                  style={{ background:"rgba(2,6,15,0.7)", border:"1px solid rgba(148,163,184,0.15)" }}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-cf-primary focus:outline-none focus:border-amber-500" />
              </div>
              <button onClick={() => setShowFilter(!showFilter)} className="text-[10px] text-cf-secondary hover:text-cf-primary flex items-center gap-1">
                {showFilter ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Bộ lọc
              </button>
            </div>

            {showFilter && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label:`Yield ≥ ${fmtPct(filter.minYield)}`, key:"minYield", min:0, max:15, step:0.5, val:filter.minYield },
                    { label:`ROE ≥ ${fmtPct(filter.minRoe)}`, key:"minRoe", min:0, max:30, step:1, val:filter.minRoe },
                    { label:`P/E ≤ ${filter.maxPe}x`, key:"maxPe", min:5, max:25, step:0.5, val:filter.maxPe },
                    { label:`F-Score ≥ ${filter.minFscore}/9`, key:"minFscore", min:0, max:9, step:1, val:filter.minFscore },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-[9px] text-cf-secondary font-bold block mb-1">{f.label}</label>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={f.val}
                        onChange={(e) => setFilter({ ...filter, [f.key]:parseFloat(e.target.value) })}
                        className="w-full h-1.5 accent-amber-500" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {[
                    { label:"👑 Siêu Cổ Tức", f:{ minYield:7, minRoe:12, maxPe:15, maxDebt:0.5, minFscore:6, hideRiskFlags:true } },
                    { label:"💎 Kim Cương", f:{ minYield:3, minRoe:20, maxPe:20, maxDebt:0.7, minFscore:7 } },
                    { label:"📅 Sắp GDKHQ", f:{ upcomingGDKHQ:true } },
                    { label:"📋 Sắp ĐHCĐ", f:{ upcomingAGM:true } },
                    { label:"🔄 Xóa lọc", f:DEFAULT_FILTER },
                  ].map((preset) => (
                    <button key={preset.label} onClick={() => setFilter({ ...DEFAULT_FILTER, ...preset.f })}
                      style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)" }}
                      className="text-[10px] font-bold text-cf-gold px-2 py-1 rounded-lg hover:brightness-110 transition">
                      {preset.label}
                    </button>
                  ))}
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
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-cf-border/60 text-cf-secondary text-[10px] uppercase">
                  <th className="pb-2 w-6"></th>
                  <th className="pb-2 cursor-pointer hover:text-cf-primary" onClick={() => handleSort("ticker")}>Mã <SortIcon field="ticker" /></th>
                  <th className="pb-2 cursor-pointer hover:text-cf-gold" onClick={() => handleSort("dividendYield")}>Yield <SortIcon field="dividendYield" /></th>
                  <th className="pb-2 text-right cursor-pointer hover:text-cf-primary" onClick={() => handleSort("score")} title="Dividend Quality Score - 4 tầng (Chất lượng cổ tức/Tăng trưởng/Định giá/Kỹ thuật), dữ liệu thời gian thực khi có đủ">Score <SortIcon field="score" /></th>
                  <th className="pb-2 text-center">RS 3T</th>
                  <th className="pb-2">Vị Thế</th>
                  <th className="pb-2">GDKHQ</th>
                  <th className="pb-2">ĐHCĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-cf-tertiary text-xs italic">Không có mã nào phù hợp. Hãy nới lỏng bộ lọc.</td></tr>
                )}
                {filtered.map((s) => {
                  const gdkhqDays = getDaysUntil(s.exDividendDate);
                  const agmDays = getDaysUntil(s.agmDate);
                  const rs = realRsMap[s.ticker];
                  return (
                    <tr key={s.ticker}
                      className={`hover:bg-cf-surface-2/30 transition ${s.ticker === globalSelectedTicker ? "bg-amber-950/20 ring-1 ring-inset ring-amber-700/40" : ""}`}>
                      <td className="py-3">
                        <button onClick={(e) => { e.stopPropagation(); togglePin(s.ticker); }}
                          className={isPinned(s.ticker) ? "text-cf-gold" : "text-cf-tertiary hover:text-cf-tertiary"}>
                          <Star className="w-3.5 h-3.5" fill={isPinned(s.ticker) ? "currentColor" : "none"} />
                        </button>
                      </td>
                      <td onClick={() => handleSelect(s)} className="py-3 cursor-pointer">
                        <span className="font-black text-cf-gold">{s.ticker}</span>
                        <span className="text-[9px] text-cf-tertiary block">{s.sector}</span>
                      </td>
                      <td onClick={() => handleSelect(s)} className="py-3 cursor-pointer">
                        <span className="text-cf-positive font-black">{fmtPct(s.dividendYield)}</span>
                        <span className="text-[9px] text-cf-tertiary block">{fmtVND(s.dividendAmount)}/cp</span>
                      </td>
                      <td className="py-3 text-right"><ScoreBadge score={calcRealDividendQualityScore(s, rs, detectRiskFlags(s).length)} isReal={isQualityScoreReal(s)} /></td>
                      <td className="py-3 text-center"><RsBadge rs={rs} isLoading={isRealRsLoading} /></td>
                      <td className="py-3"><PhaseBadge s={s} /></td>
                      <td className="py-3">
                        <span className={`text-[10px] font-mono ${gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= 7 ? "text-rose-400 font-black animate-pulse" : "text-cf-secondary"}`}>{s.exDividendDate}</span>
                        {gdkhqDays !== null && gdkhqDays >= 0 && <span className="text-[9px] text-cf-tertiary block">còn {gdkhqDays}n</span>}
                        {gdkhqDays !== null && gdkhqDays < -60 && (
                          <span className="text-[9px] text-cf-tertiary block italic" title="Đã qua hơn 60 ngày - chưa có đợt mới được công bố (không phải lỗi hệ thống)">Đợt cũ, chưa có lịch mới</span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-mono ${agmDays !== null && agmDays >= 0 && agmDays <= 7 ? "text-purple-400 font-black animate-pulse" : "text-cf-tertiary"}`}>{s.agmDate}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "calendar" && (
        <div className="space-y-2">
          {calendarList.map((s) => {
            const gdkhqDays = getDaysUntil(s.exDividendDate);
            const past = gdkhqDays !== null && gdkhqDays < 0;
            const urgent = gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= 7;
            return (
              <div key={s.ticker} onClick={() => handleSelect(s)}
                style={urgent ? { background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)" } : past ? { background:"rgba(2,6,15,0.3)", opacity:0.6 } : { background:"rgba(2,6,15,0.5)", border:"1px solid rgba(148,163,184,0.08)" }}
                className="rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:brightness-110 transition">
                <div className={`w-14 text-center shrink-0 p-2 rounded-xl border ${urgent ? "border-rose-700 bg-rose-950" : "border-cf-border-strong bg-cf-base/60"}`}>
                  {past ? <span className="text-xs text-cf-tertiary font-bold">Đã qua</span> : <span className={`text-lg font-black block ${urgent ? "text-rose-400 animate-pulse" : "text-cf-gold"}`}>{gdkhqDays}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-black text-cf-gold">{s.ticker}</span>
                  <span className="text-[10px] text-cf-secondary ml-2">{s.name}</span>
                  <div className="flex flex-wrap gap-3 text-[10px] text-cf-secondary mt-1">
                    <span>📅 GDKHQ: <b className="text-cf-gold">{s.exDividendDate}</b></span>
                    <span>💵 <b className="text-cf-positive">{fmtVND(s.dividendAmount)}/cp</b></span>
                  </div>
                </div>
                <ScoreBadge score={calcRealDividendQualityScore(s, realRsMap[s.ticker], detectRiskFlags(s).length)} isReal={isQualityScoreReal(s)} />
              </div>
            );
          })}
        </div>
      )}

      {subTab === "earnings" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được bảng KQKD">
          <EarningsQuarterPanel onSelectTicker={(t) => { const s = mergedStocks.find((x) => x.ticker === t); if (s) handleSelect(s); }} />
        </ErrorBoundary>
      )}

      {subTab === "timing" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được bảng xếp hạng xác suất">
          <CycleRankingPanel onSelectTicker={(t) => { const s = mergedStocks.find((x) => x.ticker === t) ?? universeStocks.find((x) => x.ticker === t); if (s) handleSelect(s); }} />
        </ErrorBoundary>
      )}

      {selected && <StockModal s={selected} onClose={() => setSelectedTicker(null)} realRs={realRsMap[selected.ticker]} lifecycleEvents={selected.isUniverseOnly ? universeLifecycleMap[selected.ticker] : lifecycleEventsMap[selected.ticker]} />}
    </div>
  );
}

/** Chuyen "YYYY-MM-DD" (VCI) sang "DD/MM/YYYY" (format noi bo cua quant-cotuc.ts) */
function isoToVnDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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
  const { realRsMap: fetchedRsMap, isRealRsLoading: fetchedLoading } = useRealRsData(universeStocks.map((s) => s.ticker));
  const realRsMap = props.realRsMap ?? fetchedRsMap;
  const isRealRsLoading = props.isRealRsLoading ?? fetchedLoading;

  return (
    <ErrorBoundary fallbackLabel="Tab Cổ Tức gặp lỗi khi hiển thị">
      <CotucTabInner {...props} realRsMap={realRsMap} isRealRsLoading={isRealRsLoading} />
    </ErrorBoundary>
  );
}
