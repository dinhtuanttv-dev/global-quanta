"use client";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useOhlcvData } from "../../../hooks/useOhlcvData";
import TVChartPanel from "./TVChartPanel";

interface Props { ticker: string; onRequestTickerChange?: (ticker: string) => void; }

export default function TaCommandCenterTab({ ticker, onRequestTickerChange }: Props) {
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

  return <TVChartPanel bars={bars} ticker={ticker} onRequestTickerChange={onRequestTickerChange} />;
}
