"use client";
import type { ReactNode } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useTaSeries, PRICE_BASIS_LABEL } from "../../../hooks/useTaSeries";
import TVChartPanel, { type ChartHighlight } from "./TVChartPanel";
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
  /** Super Chart SC4: khoanh vùng mẫu hình được chọn ở Pattern Scanner v2. */
  highlight?: ChartHighlight | null;
  /** Super Chart SC1: ô chọn mã nằm trong thanh đầu của workspace (cả khi đang tải / lỗi). */
  tickerSlot?: ReactNode;
}

export default function TaCommandCenterTab({ ticker, onRequestTickerChange, highlightPattern, highlight, tickerSlot }: Props) {
  const { bars, isLoading, error, priceBasis, corporateActions, warnings } = useTaSeries(ticker);
  // VN-Index cho so sánh sức mạnh tương đối (Wyckoff W2); SWR dùng chung cache khi đã xem VN-Index.
  const benchmark = useTaSeries(TA_INDICES.some((x) => x.symbol === ticker) ? null : "VNINDEX");

  if (isLoading || error) return (
    <div className="space-y-2">
      {tickerSlot && <div className="ws-bar ws-head">{tickerSlot}</div>}
      <div className={`h-64 flex items-center justify-center gap-2 text-xs ${error ? "text-red-300" : "text-slate-400"}`}>
        {error ? <><AlertCircle className="w-4 h-4" /> Không có dữ liệu cho {ticker}.</> : <><RefreshCw className="w-4 h-4 animate-spin" /> Đang tải dữ liệu {ticker}…</>}
      </div>
    </div>
  );

  return (
    <TVChartPanel bars={bars} ticker={ticker} onRequestTickerChange={onRequestTickerChange} highlightPattern={highlightPattern} highlight={highlight}
      corporateActions={corporateActions} benchmarkBars={benchmark.bars.length ? benchmark.bars : null} tickerSlot={tickerSlot}
      dataContext={{ priceBasis, label: PRICE_BASIS_LABEL[priceBasis], warnings }} />
  );
}
