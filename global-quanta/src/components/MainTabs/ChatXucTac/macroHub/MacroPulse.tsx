import useSWR from "swr";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { buildPulseTiles, factorCoverage, fmtDelta, fmtPeriod, fmtValue, sparkPath, type MacroSeriesResponse, type PulseTile } from "./macroHubData";

function Tile({ t }: { t: PulseTile }) {
  const path = sparkPath(t.points);
  return (
    <article className="min-w-0 rounded-lg border border-white/10 bg-white/[0.025] p-3" data-testid={`pulse-${t.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-[11px] font-semibold text-slate-200">{t.label}</h4>
        <span className="shrink-0 text-[9px] text-slate-500">{t.sub}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-slate-50">{fmtValue(t.value, t.digits)}{t.unit && <span className="ml-0.5 text-xs font-normal text-slate-400">{t.unit}</span>}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] tabular-nums">
        <span className="text-slate-300" title="So với tháng trước">{fmtDelta(t.delta, t.deltaUnit)}</span>
        <span className={t.stale ? "rounded bg-amber-950/60 px-1 text-amber-200" : "text-slate-500"}>{t.stale ? `cũ · ${fmtPeriod(t.period)}` : fmtPeriod(t.period)}</span>
      </div>
      {path && <svg viewBox="0 0 120 32" preserveAspectRatio="none" className="mt-2 h-8 w-full" role="img" aria-label={`${t.label}: ${t.points.length} tháng gần nhất`}>
        <polyline points={path} fill="none" stroke="#67e8f9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>}
    </article>
  );
}

/** Nhịp vĩ mô: giá trị tháng đã đóng của các biến có số liệu thật + 24 tháng gần nhất. Tô màu trung tính: tăng/giảm tự nó không phải tốt/xấu. */
export default function MacroPulse() {
  const { data, error, isLoading } = useSWR<MacroSeriesResponse>(["macro-pulse"], () => fetchMarketJson<MacroSeriesResponse>("/api/macro/series", { tail: 25 }), {
    revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 30 * 60_000, keepPreviousData: true,
  });
  const tiles = buildPulseTiles(data);
  const cover = factorCoverage(data);
  return (
    <section aria-labelledby="mh-pulse" className="scroll-mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mh-pulse" className="text-xs font-semibold text-amber-300">Nhịp vĩ mô</h3>
        {data && <span className="text-[10px] text-slate-500" data-testid="pulse-coverage">Có số liệu tự động {cover.have}/{cover.total} biến · tháng đã đóng</span>}
      </div>
      {error && <p role="alert" className="text-[11px] text-rose-300">Không tải được số liệu vĩ mô: {error.message}</p>}
      {isLoading && !data && <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-white/[0.04]" />)}</div>}
      {tiles.length > 0 && <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">{tiles.map((t) => <Tile key={t.id} t={t} />)}</div>}
      {cover.missing.length > 0 && <p className="mt-2 text-[10px] leading-relaxed text-slate-500" data-testid="pulse-missing">Chưa có nguồn mở cập nhật tự động: {cover.missing.join(", ")}. Các biến này không được ước lượng thay thế.</p>}
    </section>
  );
}
