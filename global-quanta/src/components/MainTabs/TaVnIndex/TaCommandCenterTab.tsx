"use client";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useOhlcvData } from "../../../hooks/useOhlcvData";
import TVChartPanel from "./TVChartPanel";
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
  const { bars, isLoading, error } = useOhlcvData(ticker, "1y", 250);

  if (isLoading) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-slate-400">
      <RefreshCw className="w-4 h-4 animate-spin" /> Dang tai du lieu cho {ticker}...
    </div>
  );
  if (error) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-red-300">
      <AlertCircle className="w-4 h-4" /> Khong co du lieu cho {ticker}.
    </div>
  );

  return <TVChartPanel bars={bars} ticker={ticker} onRequestTickerChange={onRequestTickerChange} highlightPattern={highlightPattern} />;
}
