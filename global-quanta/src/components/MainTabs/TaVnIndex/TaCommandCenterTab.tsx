"use client";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useTaSeries, PRICE_BASIS_LABEL } from "../../../hooks/useTaSeries";
import ProvenanceBadge from "./ProvenanceBadge";
import TVChartPanel from "./TVChartPanel";
import { TA_INDICES } from "./TickerSelector";
import type { PatternMatch } from "../../../lib/ta-command-center/types";

interface Props {
  ticker: string;
  onRequestTickerChange?: (ticker: string) => void;
  // ĐÃ THÊM — truyền xuyên qua tới TVChartPanel, để tầng cha
  // (TaVnIndexTab.tsx) có thể ra lệnh khoanh vùng ngày trên biểu đồ khi
  // người dùng chọn 1 pattern ở Pattern Scanner (nay chỉ còn 1 instance
  // duy nhất, không còn nhân bản).
  highlightPattern?: PatternMatch | null;
}

export default function TaCommandCenterTab({ ticker, onRequestTickerChange, highlightPattern }: Props) {
  const { bars, isLoading, error, priceBasis, corporateActions, warnings } = useTaSeries(ticker);
  // VN-Index cho so sánh sức mạnh tương đối (Wyckoff W2); SWR dùng chung cache khi đã xem VN-Index.
  const benchmark = useTaSeries(TA_INDICES.some((x) => x.symbol === ticker) ? null : "VNINDEX");

  if (isLoading) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-slate-400">
      <RefreshCw className="w-4 h-4 animate-spin" /> Đang tải dữ liệu {ticker}…
    </div>
  );
  if (error) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-red-300">
      <AlertCircle className="w-4 h-4" /> Không có dữ liệu cho {ticker}.
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-[9px] text-slate-500" data-testid="price-basis">
        <span className="flex items-center gap-1">
          {/* Điểm chỉ số = dữ liệu sàn; giá điều chỉnh = tính từ giá danh nghĩa + sự kiện quyền */}
          <ProvenanceBadge kind={priceBasis === "INDEX_POINTS" ? "HARD" : "DERIVED"} className="" />
          <span className={priceBasis === "ADJUSTED_CUMULATIVE" || priceBasis === "INDEX_POINTS" ? "text-slate-300" : "text-amber-400"}>
            {PRICE_BASIS_LABEL[priceBasis]}
          </span>
        </span>
        <span className="font-mono">{bars.length} phiên D · {bars[0]?.date ?? "—"} → {bars[bars.length - 1]?.date ?? "—"}</span>
        {priceBasis === "ADJUSTED_CUMULATIVE" && (
          <span title={corporateActions.map((c) => `${c.date} ${c.label} (hệ số ${c.factor})`).join("\n")}>
            {corporateActions.length} sự kiện quyền đã điều chỉnh (bật lớp "Sự kiện quyền" để thấy ■)
          </span>
        )}
        {warnings.map((w) => <span key={w} className="text-amber-400">⚠ {w}</span>)}
      </div>
      <TVChartPanel bars={bars} ticker={ticker} onRequestTickerChange={onRequestTickerChange} highlightPattern={highlightPattern} corporateActions={corporateActions} benchmarkBars={benchmark.bars.length ? benchmark.bars : null} />
    </>
  );
}
