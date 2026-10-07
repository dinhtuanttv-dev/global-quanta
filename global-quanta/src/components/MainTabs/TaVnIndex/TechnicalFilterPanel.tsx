import { AlertCircle, Activity, Info, RefreshCw } from "lucide-react";
import { useTechnicalFilter, type TechnicalFilterStrategy } from "../../../hooks/useTechnicalFilter";

interface Props {
  strategy: TechnicalFilterStrategy;
  onSelectTicker: (ticker: string) => void;
}

const LABELS: Record<TechnicalFilterStrategy, string> = {
  camslim: "CAMSLIM Cup & Handle",
  "base-breakout": "Base Breakout",
};

const formatPrice = (value?: number) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);

const formatPct = (value?: number) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;

export default function TechnicalFilterPanel({ strategy, onSelectTicker }: Props) {
  const { data, error, isLoading, refresh } = useTechnicalFilter(strategy);
  const isCamSlim = strategy === "camslim";

  return (
    <section
      style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(56,189,248,0.2)" }}
      className="rounded-xl p-3 space-y-2.5"
      aria-label={LABELS[strategy]}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-cyan-400" />
          {LABELS[strategy]}
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label={`Làm mới ${LABELS[strategy]}`}
          className="text-slate-400 hover:text-slate-200"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <p className="text-[9px] text-slate-500 leading-relaxed flex items-start gap-1">
        <Info className="w-3 h-3 shrink-0 mt-px" />
        {data?.disclaimer ?? "Bộ lọc kỹ thuật tham khảo; tín hiệu chưa được xác nhận là có lợi thế sinh lời."}
        {data && (
          <span className="ml-auto whitespace-nowrap">
            SSI · {data.dataAsOf} · Đã quét {data.scannedCount}/{data.universeCount}
          </span>
        )}
      </p>

      {error && (
        <div role="alert" className="flex items-center gap-1.5 text-[10px] text-red-300 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Không tải được bộ lọc: {error.message}
        </div>
      )}
      {isLoading && !data && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-5">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Đang quét universe theo dữ liệu Gateway…
        </div>
      )}
      {data && data.results.length === 0 && (
        <p className="text-[10px] text-slate-500 italic py-4 text-center">
          Không có mã nào đạt điều kiện {LABELS[strategy]} trong phiên dữ liệu này.
        </p>
      )}

      {!!data?.results.length && (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-950/95">
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Tín hiệu</th>
                {isCamSlim ? (
                  <>
                    <th className="py-1.5 text-right">Độ sâu cốc</th>
                    <th className="py-1.5 text-right">Pivot</th>
                    <th className="py-1.5 text-right">Handle</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 text-right">Base</th>
                    <th className="py-1.5 text-right">Vol × TB</th>
                    <th className="py-1.5 text-right">Stop</th>
                    <th className="py-1.5 text-right">Rủi ro</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {data.results.map((result) => (
                <tr key={result.ticker} className="hover:bg-slate-800/30 transition">
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectTicker(result.ticker)}
                      className="font-black text-amber-400 hover:text-amber-300"
                      title={`Mở ${result.ticker} trên biểu đồ TA`}
                    >
                      {result.ticker}
                    </button>
                    <span className="block text-[8px] text-slate-600">{result.date}</span>
                  </td>
                  <td className="py-1.5">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                      result.status === "BREAKOUT"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-sky-500/10 text-sky-400"
                    }`}>
                      {result.status === "BREAKOUT" ? "Breakout" : "Setup"}
                    </span>
                  </td>
                  {isCamSlim ? (
                    <>
                      <td className="py-1.5 text-right text-slate-300">{formatPct(result.metrics.depthPct)}</td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{formatPrice(result.metrics.pivot)}</td>
                      <td className="py-1.5 text-right text-slate-300">{result.metrics.handleBars ?? "—"} phiên</td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 text-right font-mono text-slate-300">{formatPrice(result.metrics.basePivot)}</td>
                      <td className="py-1.5 text-right text-slate-300">
                        {result.metrics.volRatio == null ? "—" : `${result.metrics.volRatio.toFixed(2)}×`}
                      </td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{formatPrice(result.metrics.plan?.stop)}</td>
                      <td className="py-1.5 text-right text-slate-300">{formatPct(result.metrics.plan?.riskPct)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.skipped.length > 0 && (
        <details className="text-[9px] text-slate-500">
          <summary className="cursor-pointer">Bỏ qua {data.skipped.length} mã (thiếu dữ liệu hoặc lỗi dữ liệu)</summary>
          <p className="pt-1 break-words">
            {data.skipped.map((item) => `${item.ticker}: ${item.reason}${item.bars == null ? "" : ` (${item.bars} phiên)`}`).join(" · ")}
          </p>
        </details>
      )}
    </section>
  );
}
