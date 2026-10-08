import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Activity, ChevronRight, Info, RefreshCw } from "lucide-react";
import { useTechnicalFilter, type TechnicalFilterResult, type TechnicalFilterStrategy } from "../../../hooks/useTechnicalFilter";
import EvidenceCard from "./EvidenceCard";
import CanSlimDots from "./CanSlimDots";
import ScreenerDeepPanel from "./ScreenerDeepPanel";

const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  B: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  C: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

/** Tooltip điểm: từng thành phần có tính điểm. */
const scoreTitle = (r: TechnicalFilterResult) =>
  (r.components ?? []).filter((c) => c.max > 0).map((c) => `${c.label}: ${c.points}/${c.max}`).join("\n");

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
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);

const formatPct = (value?: number) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;

const formatBillion = (value?: number) =>
  value == null || !Number.isFinite(value) ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1e9)} tỷ`;

const SKIP_LABELS: Record<string, string> = {
  INSUFFICIENT_BARS: "chưa đủ lịch sử",
  STALE: "tạm ngừng giao dịch",
  ILLIQUID: "thanh khoản thấp",
  LOW_PRICE: "giá thấp",
  LOAD_FAILED: "lỗi tải dữ liệu",
  INVALID_DATA: "lỗi dữ liệu",
};

function skippedSummary(skipped: { reason: string }[]) {
  const count = new Map<string, number>();
  for (const s of skipped) count.set(s.reason, (count.get(s.reason) ?? 0) + 1);
  return [...count].map(([reason, n]) => `${n} ${SKIP_LABELS[reason] ?? reason}`).join(" · ");
}

/** Dòng phụ phân tích chuyên sâu: cuộn vào tầm nhìn MỘT lần khi vừa mở (như dòng phụ của Siêu Quét). */
function DeepRow({ children, width }: { children: React.ReactNode; width: number | null }) {
  const ref = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.previousElementSibling?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <tr ref={ref} className="border-b border-cyan-900/40" data-testid="deep-row">
      <td colSpan={7} className="p-0">
        {/* Bảng có thể rộng hơn khung nhìn (cuộn ngang) -> bảng phụ bám theo bề rộng khung, dính mép trái. */}
        <div style={width ? { width, position: "sticky", left: 0 } : undefined}>{children}</div>
      </td>
    </tr>
  );
}

export default function TechnicalFilterPanel({ strategy, onSelectTicker }: Props) {
  const { data, error, isLoading, refresh } = useTechnicalFilter(strategy);
  const isCamSlim = strategy === "camslim";
  // Nhấn đúp / bấm mã -> mở bảng phụ phân tích chuyên sâu (không mở biểu đồ); nhấn đúp lại hoặc Esc -> đóng.
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);
  const toggle = useCallback((ticker: string) => setOpen((cur) => (cur === ticker ? null : ticker)), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      {data?.evidence && <EvidenceCard evidence={data.evidence} marketUp={data.market?.up} />}
      {isCamSlim && data?.market && (
        <p className="text-[9px] text-slate-500" data-testid="canslim-context">
          M: VN-Index {data.market.up ? "trên" : data.market.up === false ? "dưới" : "chưa rõ so với"} MA20 · {data.market.distributionDays ?? "—"} ngày phân phối / 25 phiên
          {data.fundamentalsCoverage && data.fundamentalsCoverage.with12Quarters < 0.8 * data.fundamentalsCoverage.withData && (
            <span className="text-amber-300/80"> · BCTC đủ 12 quý: {data.fundamentalsCoverage.with12Quarters}/{data.fundamentalsCoverage.withData} mã (đang bổ sung — yếu tố A chưa đủ)</span>
          )}
          {" "}· Tăng trưởng đo bằng LNST (EPS quý VCI chưa điều chỉnh theo cổ tức cổ phiếu)
        </p>
      )}
      {data?.criteria && (
        <p className="text-[9px] text-slate-500" data-testid="filter-criteria">
          Giá điều chỉnh cộng dồn · {data.criteria.range === "3y" ? "3 năm" : data.criteria.range} · Giá ≥ {formatPrice(data.criteria.minPrice)}đ · GTGD TB20 ≥ {formatBillion(data.criteria.minAvgValue20)}
        </p>
      )}

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
        <div ref={scrollRef} className={open ? "overflow-x-auto" : "max-h-64 overflow-auto"}>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="sticky top-0 bg-slate-950/95">
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Tín hiệu</th>
                {isCamSlim ? (
                  <>
                    <th className="py-1.5 text-right">Điểm</th>
                    <th className="py-1.5 pl-3">CAN SLIM</th>
                    <th className="py-1.5 text-right hidden sm:table-cell">Cốc</th>
                    <th className="py-1.5 text-right">Pivot</th>
                    <th className="py-1.5 text-right">RS</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 text-right">Điểm</th>
                    <th className="py-1.5 text-right">Pivot</th>
                    <th className="py-1.5 text-right hidden sm:table-cell">Vol × TB</th>
                    <th className="py-1.5 text-right">Stop</th>
                    <th className="py-1.5 text-right">Rủi ro</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {data.results.map((result) => (
                <Fragment key={result.ticker}>
                <tr
                  className={`transition cursor-pointer select-none ${open === result.ticker ? "bg-cyan-500/10" : "hover:bg-slate-800/30"}`}
                  onDoubleClick={() => toggle(result.ticker)}
                  aria-expanded={open === result.ticker}
                  data-testid="filter-row"
                >
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(result.ticker)}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 font-black text-amber-400 hover:text-amber-300"
                      title={`Phân tích chuyên sâu ${result.ticker} (nhấn đúp dòng hoặc Esc để đóng)`}
                      aria-label={`Phân tích chuyên sâu ${result.ticker}`}
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${open === result.ticker ? "rotate-90" : ""}`} />
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
                    {result.grade && (
                      <span className={`ml-1 text-[8px] px-1 py-0.5 rounded border font-black ${GRADE_STYLE[result.grade]}`} data-testid="grade">
                        {result.grade}
                      </span>
                    )}
                    {result.status === "SETUP" && result.metrics.belowPivotPct != null && (
                      <span className="block text-[8px] text-slate-500">cách pivot {formatPct(result.metrics.belowPivotPct)}</span>
                    )}
                  </td>
                  {isCamSlim ? (
                    <>
                      <td className="py-1.5 text-right font-mono font-bold text-slate-200" title={scoreTitle(result)}>{result.metrics.score ?? "—"}</td>
                      <td className="py-1.5 pl-3">{result.components ? <CanSlimDots components={result.components} /> : "—"}</td>
                      <td className="py-1.5 text-right text-slate-300 hidden sm:table-cell">
                        {result.pattern ? `${result.pattern.depthPct.toFixed(0)}% · ${result.pattern.cupBars}p` : formatPct(result.metrics.depthPct)}
                        {result.pattern && <span className="block text-[8px] text-slate-500">tay cầm {result.pattern.handleBars}p · {result.pattern.handleDepthPct.toFixed(0)}%</span>}
                      </td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{formatPrice(result.metrics.pivot)}</td>
                      <td className={`py-1.5 text-right font-mono ${(result.metrics.rs ?? 0) >= 80 ? "text-emerald-400" : "text-slate-300"}`}>{result.metrics.rs ?? "—"}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 text-right font-mono font-bold text-slate-200" title={scoreTitle(result)}>{result.metrics.score ?? "—"}</td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{formatPrice(result.metrics.basePivot)}</td>
                      <td className="py-1.5 text-right text-slate-300 hidden sm:table-cell">
                        {result.metrics.volRatio == null ? "—" : `${result.metrics.volRatio.toFixed(2)}×`}
                      </td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{formatPrice(result.plan?.stop ?? result.metrics.plan?.stop)}</td>
                      <td className="py-1.5 text-right text-slate-300">{formatPct(result.plan?.riskPct ?? result.metrics.plan?.riskPct)}</td>
                    </>
                  )}
                </tr>
                {open === result.ticker && (
                  <DeepRow width={frameW}>
                    <ScreenerDeepPanel strategy={strategy} result={result} doc={data} onClose={() => setOpen(null)} onOpenChart={onSelectTicker} />
                  </DeepRow>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.skipped.length > 0 && (
        <details className="text-[9px] text-slate-500">
          <summary className="cursor-pointer">Bỏ qua {data.skipped.length} mã: {skippedSummary(data.skipped)}</summary>
          <p className="pt-1 break-words">
            {data.skipped.map((item) => {
              const label = SKIP_LABELS[item.reason] ?? item.reason;
              const detail = item.bars != null ? ` ${item.bars} phiên` : item.avgValue20 != null ? ` ${formatBillion(item.avgValue20)}` : item.lastDate ? ` từ ${item.lastDate}` : "";
              return `${item.ticker}: ${label}${detail}`;
            }).join(" · ")}
          </p>
        </details>
      )}
    </section>
  );
}
