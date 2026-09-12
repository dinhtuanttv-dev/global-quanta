import { TrendingUp, TrendingDown, RefreshCw, CheckCircle2, AlertCircle, Star, Calendar } from "lucide-react";
import { useEarningsData } from "../../../hooks/useEarningsData";
import { usePinnedStocks } from "../../../hooks/usePinnedStocks";

function GrowthCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-cf-tertiary text-[10px]">-</span>;
  return (
    <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 justify-end ${value >= 0 ? "text-cf-positive" : "text-cf-negative"}`}>
      {value >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {value >= 0 ? "+" : ""}{value}%
    </span>
  );
}

export default function EarningsQuarterPanel({ onSelectTicker }: { onSelectTicker?: (ticker: string) => void }) {
  const { earningsData, isLoading, error, refresh } = useEarningsData();
  const { isPinned, togglePin } = usePinnedStocks();

  return (
    <div style={{ background: "linear-gradient(165deg,#0e1626 0%,#0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
      className="rounded-2xl p-5 space-y-4">

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase text-cf-primary flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-cf-positive" /> Bộ Lọc KQKD Theo Quý
          </h3>
          <p className="text-[10px] text-cf-tertiary mt-0.5">Tăng trưởng Doanh thu/LNST QoQ + YoY thật từ BCTC (VCI), xếp hạng mã tốt nhất</p>
        </div>
        <div className="flex items-center gap-2">
          {earningsData && <span className="flex items-center gap-1 text-[10px] text-cf-positive"><CheckCircle2 className="w-3 h-3" />HARD_DATA ({earningsData.totalAvailable}/{earningsData.totalRequested} mã)</span>}
          <button onClick={() => refresh()} className="text-cf-secondary hover:text-cf-primary">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Han cong bo BCTC quy hien tai */}
      {earningsData?.deadline && (
        <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] text-sky-400 font-bold">Hạn công bố BCTC {earningsData.deadline.quarterLabel} <span className="text-cf-tertiary font-normal">(ước tính theo quy định, không phải ngày công ty tự công bố)</span></p>
            <div className="flex gap-4 mt-1">
              <span className="text-[10px] text-cf-primary">Riêng lẻ: <b className="text-cf-primary">{earningsData.deadline.deadlineStandalone}</b> (còn {earningsData.deadline.daysUntilStandalone}n)</span>
              <span className="text-[10px] text-cf-primary">Hợp nhất: <b className="text-cf-primary">{earningsData.deadline.deadlineConsolidated}</b> (còn {earningsData.deadline.daysUntilConsolidated}n)</span>
            </div>
          </div>
        </div>
      )}

      {isLoading && !earningsData && (
        <div className="flex items-center gap-2 text-xs text-cf-secondary py-8 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Đang tải KQKD theo quý từ VCI...
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-cf-negative py-4 justify-center">
          <AlertCircle className="w-4 h-4" /> Không tải được dữ liệu KQKD lúc này.
        </div>
      )}
      {earningsData?.failedTickers?.length > 0 && (
        <div className="rounded-lg p-2.5 space-y-1" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <p className="text-[9px] text-cf-gold/80 italic">
            ⚠ {earningsData.failedTickers.length}/{earningsData.totalRequested} mã không lấy được BCTC — endpoint VCI có thể tạm lỗi hoặc đổi cấu trúc.
          </p>
          {/* Chan doan chi tiet: doc mang errors[] tra ve tu route (them 2026-08-25) -
              neu tat ca ma cung 1 ly do giong het nhau -> nhieu kha nang la loi tham
              so chung (VD sai gia tri enum), khong phai loi tung ma rieng le. */}
          {earningsData.errors?.length > 0 && (
            <details className="text-[9px] text-cf-tertiary">
              <summary className="cursor-pointer hover:text-cf-primary">Xem lý do chi tiết ({earningsData.errors.length} mã)</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {earningsData.errors.slice(0, 5).map((e: { ticker: string; reason: string }) => (
                  <li key={e.ticker}>{e.ticker}: {e.reason}</li>
                ))}
                {earningsData.errors.length > 5 && <li>... và {earningsData.errors.length - 5} mã khác cùng lỗi tương tự</li>}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-cf-border/60 text-cf-secondary text-[10px] uppercase">
              <th className="pb-2 w-6"></th>
              <th className="pb-2">Mã</th>
              <th className="pb-2">Quý gần nhất</th>
              <th className="pb-2 text-right">DT QoQ</th>
              <th className="pb-2 text-right">DT YoY</th>
              <th className="pb-2 text-right">LNST QoQ</th>
              <th className="pb-2 text-right">LNST YoY</th>
              <th className="pb-2 text-right">Điểm KQKD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {earningsData?.rankedTop20?.length === 0 && !isLoading && (
              <tr><td colSpan={8} className="py-8 text-center text-cf-tertiary text-xs italic">Chưa có dữ liệu KQKD khả dụng.</td></tr>
            )}
            {earningsData?.rankedTop20?.map((r: any, i: number) => (
              <tr key={i} className="hover:bg-cf-surface-2/30 transition">
                <td className="py-2.5">
                  <button onClick={(e) => { e.stopPropagation(); togglePin(r.ticker); }}
                    className={isPinned(r.ticker) ? "text-cf-gold" : "text-cf-tertiary hover:text-cf-tertiary"}>
                    <Star className="w-3.5 h-3.5" fill={isPinned(r.ticker) ? "currentColor" : "none"} />
                  </button>
                </td>
                <td onClick={() => onSelectTicker?.(r.ticker)} className="py-2.5 font-black text-cf-gold cursor-pointer">{r.ticker}</td>
                <td className="py-2.5 text-[10px] text-cf-secondary">{r.latestQuarter.periodLabel}</td>
                <td className="py-2.5"><GrowthCell value={r.revenueGrowthQoQ} /></td>
                <td className="py-2.5"><GrowthCell value={r.revenueGrowthYoY} /></td>
                <td className="py-2.5"><GrowthCell value={r.profitGrowthQoQ} /></td>
                <td className="py-2.5"><GrowthCell value={r.profitGrowthYoY} /></td>
                <td className="py-2.5 text-right">
                  <span style={{ background: r.earningsScore >= 70 ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", color: r.earningsScore >= 70 ? "#34d399" : "#fbbf24" }}
                    className="font-black font-mono px-2 py-0.5 rounded-full text-[10px]">{r.earningsScore}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] text-cf-tertiary">Điểm KQKD: YoY Doanh thu(30%) + YoY LNST(30%) + QoQ Doanh thu(20%) + QoQ LNST(20%) — ưu tiên YoY để loại trừ tính mùa vụ.</p>
    </div>
  );
}
