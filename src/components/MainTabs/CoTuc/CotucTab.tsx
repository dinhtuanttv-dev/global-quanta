
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Coins, TrendingUp, TrendingDown, Search, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Info, Star, Sparkles,
} from "lucide-react";
import {
  DIVIDEND_STOCKS, getTradePhase, calcDividendScore, calcCatalystScore,
  detectRiskFlags, calcDCF, filterAndSortStocks, getDaysUntil,
  fmtVND, fmtPct, DEFAULT_FILTER,
  type DividendFilter, type DividendStock,
} from "../../../lib/quant-cotuc";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useDividendFilterUrl } from "../../../hooks/useDividendFilterUrl";
import { usePinnedStocks } from "../../../hooks/usePinnedStocks";
import { useDividendEvents } from "../../../hooks/useDividendEvents";
import { ErrorBoundary } from "../../ErrorBoundary";
import EarningsQuarterPanel from "./EarningsQuarterPanel";

// ============================================================
// BADGE COMPONENTS
// ============================================================

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80
    ? "bg-emerald-950 text-emerald-300 border-emerald-700"
    : score >= 60
    ? "bg-amber-950 text-amber-300 border-amber-700"
    : "bg-slate-900 text-slate-400 border-slate-700";
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${color}`}>{score}/100</span>;
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
  if (isLoading) return <span className="text-slate-500 text-[9px] animate-pulse">...</span>;
  if (rs === null || rs === undefined) return <span className="text-slate-600 text-[9px]">-</span>;
  return (
    <span className={`text-[9px] font-bold flex items-center gap-0.5 ${rs >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
  return (
    <div className={`text-center px-2 py-1 rounded-lg border text-[10px] ${
      past ? "border-slate-700 text-slate-600"
      : urgent ? "border-rose-700 bg-rose-950 text-rose-400"
      : "border-slate-700 text-slate-400"}`}>
      <span className="block font-bold">{label}</span>
      <span className={`font-black ${urgent ? "animate-pulse" : ""}`}>
        {past ? "Đã qua" : d === 0 ? "Hôm nay!" : `${d}n`}
      </span>
    </div>
  );
}

// ============================================================
// STOCK DETAIL MODAL - VA LO HONG #3: Focus Trap + ESC to close
// ============================================================

function StockModal({ s, onClose, realRs }: {
  s: DividendStock; onClose: () => void; realRs?: number | null;
}) {
  const [modalTab, setModalTab] = useState<"overview" | "dcf" | "flags">("overview");
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const phase = getTradePhase(s);
  const score = calcDividendScore(s);
  const catalyst = calcCatalystScore(s);
  const flags = detectRiskFlags(s);
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
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 overflow-y-auto"
      role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="stock-modal-title"
        style={{ background:"linear-gradient(165deg,#0e1626 0%,#0a1020 100%)", border:"1px solid rgba(148,163,184,0.15)" }}
        className="w-full max-w-2xl rounded-2xl shadow-2xl my-4">

        <div className="flex items-center justify-between p-5 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <span id="stock-modal-title" className="text-2xl font-black text-amber-400">{s.ticker}</span>
            <div>
              <p className="text-xs font-bold text-slate-200">{s.name}</p>
              <p className="text-[10px] text-slate-500">{s.sector} · {s.marketCap}-Cap</p>
            </div>
            <ScoreBadge score={score} />
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Đóng cửa sổ chi tiết"
            className="text-slate-500 hover:text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500">
            ✕ Đóng
          </button>
        </div>

        <div className="flex gap-2 p-4 border-b border-slate-800/60 flex-wrap">
          <DaysChip dateStr={s.agmDate} label="ĐHCĐ" />
          <DaysChip dateStr={s.exDividendDate} label="GDKHQ" />
          <DaysChip dateStr={s.paymentDate} label="Nhận tiền" />
          <div className="flex-1 min-w-[140px] bg-slate-900/60 rounded-lg p-2 border border-slate-700">
            <p className="text-[9px] text-slate-500 font-bold uppercase">Cổ tức / CP</p>
            <p className="text-sm font-black text-emerald-400">{fmtVND(s.dividendAmount)}</p>
            <p className="text-[9px] text-slate-400">Yield: {fmtPct(s.dividendYield)}</p>
          </div>
          <div style={{ border:"1px solid rgba(148,163,184,0.1)" }} className={`flex-1 min-w-[140px] rounded-lg p-2 ${phase.color}`}>
            <p className="text-[9px] font-bold uppercase opacity-70">Vị thế</p>
            <p className="text-xs font-black">{phase.icon} {phase.action}</p>
            <p className="text-[9px] opacity-70">{phase.safety}</p>
          </div>
        </div>

        <div className="flex border-b border-slate-800/60 px-4" role="tablist">
          {(["overview","dcf","flags"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={modalTab === t} onClick={() => setModalTab(t)}
              className={`px-4 py-2.5 text-[10px] font-bold border-b-2 transition-all focus:outline-none
                ${modalTab === t ? "border-amber-500 text-amber-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
              {t === "overview" ? "📊 Tổng Quan" : t === "dcf" ? "💵 DCF 3 Kịch Bản" : "⚠️ Rủi Ro"}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[55vh] overflow-y-auto space-y-3">
          {modalTab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["P/E", s.pe + "x"], ["ROE", fmtPct(s.roe)],
                  ["Tăng trưởng EPS", (s.growth > 0 ? "+" : "") + s.growth + "%"],
                  ["F-Score", s.fscore + "/9"], ["Payout Ratio", fmtPct(s.payoutRatio)],
                  ["Debt/Equity", s.debtEquity + "x"], ["RSI", String(s.rsi)],
                  ["Catalyst", catalyst + "/10"],
                  ["RS 3T (Yahoo)", realRs !== null && realRs !== undefined ? (realRs >= 0 ? "+" : "") + realRs + "%" : "Chưa có"],
                  ["Institutional", s.institutionalHold + "%"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-2.5">
                    <p className="text-[9px] text-slate-500 font-bold uppercase">{label}</p>
                    <p className="text-xs font-black text-slate-200 mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              <div style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">📝 Nghị Quyết ĐHCĐ</p>
                <p className="text-xs text-slate-300">{s.agmAgenda}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)" }} className="rounded-lg p-2.5">
                  <p className="text-[9px] text-emerald-400 font-bold uppercase mb-1">✅ Ưu điểm</p>
                  {s.pros.map((p, i) => <p key={i} className="text-[10px] text-slate-300">• {p}</p>)}
                </div>
                <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)" }} className="rounded-lg p-2.5">
                  <p className="text-[9px] text-red-400 font-bold uppercase mb-1">❌ Nhược điểm</p>
                  {s.cons.map((c, i) => <p key={i} className="text-[10px] text-slate-300">• {c}</p>)}
                </div>
              </div>
            </>
          )}

          {modalTab === "dcf" && (
            <div className="space-y-3">
              {/* VA LO HONG #4: banner canh bao DCF dung EPS proxy, khong phai FCF that */}
              <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)" }} className="rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-300"><b>Lưu ý quan trọng:</b> DCF này dùng EPS làm proxy thay cho Free Cash Flow thật — kết quả chỉ mang tính tham khảo ước lượng nhanh, KHÔNG phải định giá chính xác. Với mã có Capex cao, sai lệch có thể đáng kể.</p>
              </div>
              {([["bear","🐻 Xấu",dcfBear],["base","⚖️ Cơ Sở",dcfBase],["bull","🐂 Tốt",dcfBull]] as const).map(([sc, label, val]) => {
                const pct = ((val - s.price) / s.price * 100);
                const gRate = s.growth * (sc === "bear" ? 0.4 : sc === "bull" ? 1.6 : 1);
                return (
                  <div key={sc} style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-200">{label}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">g = {gRate.toFixed(1)}%/năm</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${sc === "bull" ? "text-emerald-400" : sc === "base" ? "text-amber-400" : "text-red-400"}`}>{fmtVND(val)}</p>
                      <p className={`text-[10px] font-bold ${pct > 0 ? "text-emerald-400" : "text-red-400"}`}>{pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs thị giá</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {modalTab === "flags" && (
            <div className="space-y-3">
              {flags.length === 0 ? (
                <div style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)" }} className="rounded-xl p-4 flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /><span className="text-xs font-bold">Sạch rủi ro tài chính!</span>
                </div>
              ) : flags.map((f, i) => (
                <div key={i} style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.25)" }} className="rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">{f}</p>
                </div>
              ))}
            </div>
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

function CotucTabInner({ realRsMap = {}, isRealRsLoading = false }: CotucTabProps) {
  const [subTab, setSubTab] = useState<"screener" | "calendar" | "earnings">("screener");
  const [filter, setFilterRaw] = useState<DividendFilter>(DEFAULT_FILTER);
  const [sortField, setSortField] = useState<string>("dividendYield");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<DividendStock | null>(null);
  const [showFilter, setShowFilter] = useState(true);

  // VA LO HONG #7: dong bo filter voi URL - F5 khong mat, chia se link duoc
  const setFilter = useCallback((f: DividendFilter) => setFilterRaw(f), []);
  useDividendFilterUrl(filter, setFilter);

  // VA LO HONG #5: debounce o tim kiem 300ms truoc khi loc
  const debouncedSearchQ = useDebouncedValue(filter.searchQ, 300);
  const effectiveFilter = useMemo(() => ({ ...filter, searchQ: debouncedSearchQ }), [filter, debouncedSearchQ]);

  const { pinned, togglePin, isPinned } = usePinnedStocks();
  const { realDatesMap, isLoading: eventsLoading } = useDividendEvents();

  // Merge du lieu tinh voi ngay THAT tu VCI Events (neu co) - uu tien du lieu that
  const mergedStocks = useMemo(() => {
    return DIVIDEND_STOCKS.map((s) => {
      const real = realDatesMap[s.ticker];
      if (!real) return s;
      return {
        ...s,
        exDividendDate: real.exDate ? isoToVnDate(real.exDate) : s.exDividendDate,
        agmDate: real.agmDate ? isoToVnDate(real.agmDate) : s.agmDate,
      };
    });
  }, [realDatesMap]);

  const filtered = useMemo(() =>
    filterAndSortStocks(
      mergedStocks, effectiveFilter,
      sortField as keyof DividendStock | "score" | "catalyst",
      sortAsc, realRsMap
    ), [mergedStocks, effectiveFilter, sortField, sortAsc, realRsMap]
  );

  // Danh sach da ghim luon hien dau, khong phu thuoc bo loc
  const pinnedStocks = useMemo(() => mergedStocks.filter((s) => pinned.includes(s.ticker)), [mergedStocks, pinned]);

  const stats = useMemo(() => {
    const yieldAvg = mergedStocks.reduce((s, x) => s + x.dividendYield, 0) / mergedStocks.length;
    const highYield = mergedStocks.filter((x) => x.dividendYield >= 5).length;
    const upcoming = mergedStocks.filter((x) => {
      const d = getDaysUntil(x.exDividendDate);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const upcomingAGM = mergedStocks.filter((x) => {
      const d = getDaysUntil(x.agmDate);
      return d !== null && d >= 0 && d <= 14;
    });
    return { yieldAvg, highYield, upcoming, upcomingAGM };
  }, [mergedStocks]);

  const calendarList = useMemo(() =>
    [...mergedStocks].sort((a, b) => {
      const da = getDaysUntil(a.exDividendDate) ?? 9999;
      const db = getDaysUntil(b.exDividendDate) ?? 9999;
      return da - db;
    }), [mergedStocks]
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

      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/60">
        <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-amber-400" /> Phân Tích Cổ Tức & ĐHCĐ
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(realDatesMap).length > 0
            ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />GDKHQ/ĐHCĐ: Thực (VCI)</span>
            : eventsLoading
            ? <span className="text-[10px] text-slate-500 animate-pulse">Đang tải sự kiện thực...</span>
            : <span className="text-[10px] text-amber-400 italic">Dùng data mẫu (VCI tạm lỗi)</span>}
        </div>
      </div>

      {pinnedStocks.length > 0 && (
        <div style={{ background:"rgba(245,158,11,0.05)", border:"1px solid rgba(245,158,11,0.15)" }} className="rounded-xl p-3">
          <p className="text-[9px] font-bold text-amber-400 uppercase mb-2 flex items-center gap-1"><Star className="w-3 h-3" fill="currentColor" /> Đã ghim ({pinnedStocks.length})</p>
          <div className="flex flex-wrap gap-2">
            {pinnedStocks.map((s) => (
              <button key={s.ticker} onClick={() => setSelected(s)}
                className="text-[10px] font-black text-amber-400 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-amber-800/40">
                {s.ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Yield TB Universe", value:fmtPct(stats.yieldAvg), color:"text-emerald-400", sub:`${mergedStocks.length} mã theo dõi` },
          { label:"Yield > 5%", value:String(stats.highYield), color:"text-amber-400", sub:"mã trong universe" },
          { label:"Sắp GDKHQ (30n)", value:String(stats.upcoming), color:"text-sky-400", sub:"mã trong 30 ngày tới" },
          { label:"Sắp ĐHCĐ (14n)", value:String(stats.upcomingAGM.length), color:stats.upcomingAGM.length > 0 ? "text-purple-400" : "text-slate-400", sub:stats.upcomingAGM.map((s) => s.ticker).join(", ") || "Không có" },
        ].map((item) => (
          <div key={item.label} style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">{item.label}</p>
            <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ background:"rgba(2,6,15,0.7)", border:"1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-xl">
        {[
          { id:"screener" as const, label:"📋 Bộ Lọc Cổ Phiếu", count:filtered.length },
          { id:"calendar" as const, label:"📅 Lịch GDKHQ & ĐHCĐ", count:calendarList.length },
          { id:"earnings" as const, label:"📈 KQKD Theo Quý", count: null },
        ].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={subTab === t.id ? { background:"linear-gradient(135deg,#fbbf24,#f59e0b)" } : {}}
            className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black transition-all
              ${subTab === t.id ? "text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>
            {t.label}{t.count !== null && <span className={`ml-1 ${subTab === t.id ? "text-slate-800" : "text-amber-400"}`}>({t.count})</span>}
          </button>
        ))}
      </div>

      {subTab === "screener" && (
        <div className="space-y-3">
          <div style={{ background:"rgba(2,6,15,0.6)", border:"1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={filter.searchQ} onChange={(e) => setFilter({ ...filter, searchQ:e.target.value })}
                  placeholder="Tìm mã hoặc tên..."
                  style={{ background:"rgba(2,6,15,0.7)", border:"1px solid rgba(148,163,184,0.15)" }}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500" />
              </div>
              <button onClick={() => setShowFilter(!showFilter)} className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1">
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
                      <label className="text-[9px] text-slate-400 font-bold block mb-1">{f.label}</label>
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
                      className="text-[10px] font-bold text-amber-400 px-2 py-1 rounded-lg hover:brightness-110 transition">
                      {preset.label}
                    </button>
                  ))}
                  <label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer ml-auto">
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
                <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                  <th className="pb-2 w-6"></th>
                  <th className="pb-2 cursor-pointer hover:text-slate-200" onClick={() => handleSort("ticker")}>Mã <SortIcon field="ticker" /></th>
                  <th className="pb-2 cursor-pointer hover:text-amber-400" onClick={() => handleSort("dividendYield")}>Yield <SortIcon field="dividendYield" /></th>
                  <th className="pb-2 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort("score")}>Score <SortIcon field="score" /></th>
                  <th className="pb-2 text-center">RS 3T</th>
                  <th className="pb-2">Vị Thế</th>
                  <th className="pb-2">GDKHQ</th>
                  <th className="pb-2">ĐHCĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-500 text-xs italic">Không có mã nào phù hợp. Hãy nới lỏng bộ lọc.</td></tr>
                )}
                {filtered.map((s) => {
                  const gdkhqDays = getDaysUntil(s.exDividendDate);
                  const agmDays = getDaysUntil(s.agmDate);
                  const rs = realRsMap[s.ticker];
                  return (
                    <tr key={s.ticker} className="hover:bg-slate-800/30 transition">
                      <td className="py-3">
                        <button onClick={(e) => { e.stopPropagation(); togglePin(s.ticker); }}
                          className={isPinned(s.ticker) ? "text-amber-400" : "text-slate-700 hover:text-slate-500"}>
                          <Star className="w-3.5 h-3.5" fill={isPinned(s.ticker) ? "currentColor" : "none"} />
                        </button>
                      </td>
                      <td onClick={() => setSelected(s)} className="py-3 cursor-pointer">
                        <span className="font-black text-amber-400">{s.ticker}</span>
                        <span className="text-[9px] text-slate-500 block">{s.sector}</span>
                      </td>
                      <td onClick={() => setSelected(s)} className="py-3 cursor-pointer">
                        <span className="text-emerald-400 font-black">{fmtPct(s.dividendYield)}</span>
                        <span className="text-[9px] text-slate-500 block">{fmtVND(s.dividendAmount)}/cp</span>
                      </td>
                      <td className="py-3 text-right"><ScoreBadge score={calcDividendScore(s)} /></td>
                      <td className="py-3 text-center"><RsBadge rs={rs} isLoading={isRealRsLoading} /></td>
                      <td className="py-3"><PhaseBadge s={s} /></td>
                      <td className="py-3">
                        <span className={`text-[10px] font-mono ${gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= 7 ? "text-rose-400 font-black animate-pulse" : "text-slate-400"}`}>{s.exDividendDate}</span>
                        {gdkhqDays !== null && gdkhqDays >= 0 && <span className="text-[9px] text-slate-500 block">còn {gdkhqDays}n</span>}
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-mono ${agmDays !== null && agmDays >= 0 && agmDays <= 7 ? "text-purple-400 font-black animate-pulse" : "text-slate-500"}`}>{s.agmDate}</span>
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
              <div key={s.ticker} onClick={() => setSelected(s)}
                style={urgent ? { background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)" } : past ? { background:"rgba(2,6,15,0.3)", opacity:0.6 } : { background:"rgba(2,6,15,0.5)", border:"1px solid rgba(148,163,184,0.08)" }}
                className="rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:brightness-110 transition">
                <div className={`w-14 text-center shrink-0 p-2 rounded-xl border ${urgent ? "border-rose-700 bg-rose-950" : "border-slate-700 bg-slate-900/60"}`}>
                  {past ? <span className="text-xs text-slate-500 font-bold">Đã qua</span> : <span className={`text-lg font-black block ${urgent ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>{gdkhqDays}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-black text-amber-400">{s.ticker}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{s.name}</span>
                  <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 mt-1">
                    <span>📅 GDKHQ: <b className="text-amber-400">{s.exDividendDate}</b></span>
                    <span>💵 <b className="text-emerald-400">{fmtVND(s.dividendAmount)}/cp</b></span>
                  </div>
                </div>
                <ScoreBadge score={calcDividendScore(s)} />
              </div>
            );
          })}
        </div>
      )}

      {subTab === "earnings" && (
        <ErrorBoundary fallbackLabel="Không hiển thị được bảng KQKD">
          <EarningsQuarterPanel onSelectTicker={(t) => { const s = mergedStocks.find((x) => x.ticker === t); if (s) setSelected(s); }} />
        </ErrorBoundary>
      )}

      {selected && <StockModal s={selected} onClose={() => setSelected(null)} realRs={realRsMap[selected.ticker]} />}
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
  return (
    <ErrorBoundary fallbackLabel="Tab Cổ Tức gặp lỗi khi hiển thị">
      <CotucTabInner {...props} />
    </ErrorBoundary>
  );
}
