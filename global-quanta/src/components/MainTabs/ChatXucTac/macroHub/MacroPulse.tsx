import useSWR from "swr";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { buildPulseTiles, factorCoverage, fmtDay, fmtDelta, fmtPct, fmtPeriod, fmtValue, releaseNote, sparkPath, type MacroLiveResponse, type MacroLiveSeries, type MacroSeriesResponse, type PulseTile } from "./macroHubData";

function Tile({ t, l }: { t: PulseTile; l?: MacroLiveSeries }) {
  const path = sparkPath(t.points);
  const note = releaseNote(l);
  const live = l?.live && l.live.closedPeriod === t.period ? l.live : null;
  // MV-L1: chấm "hiện tại" ở mép phải đường (cùng thang min–max với chuỗi tháng)
  const vals = t.points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const liveY = live ? Math.min(30, Math.max(2, 32 - 2 - ((live.value - lo) / span) * 28)).toFixed(1) : null;
  return (
    <article className={`min-w-0 rounded-lg border bg-white/[0.025] p-3 ${note?.late ? "border-amber-400/35" : "border-white/10"}`} data-testid={`pulse-${t.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-[12px] font-semibold text-slate-100">{t.label}</h4>
        {note ? <span className={`shrink-0 rounded px-1.5 text-[10.5px] ${note.late ? "bg-amber-950/60 text-amber-200" : "text-slate-500"}`} title={note.title} data-testid={`pulse-release-${t.id}`}>{note.text}</span>
          : <span className="shrink-0 text-[10px] text-slate-500">{t.sub}</span>}
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-slate-50">{fmtValue(t.value, t.digits)}{t.unit && <span className="ml-0.5 text-xs font-normal text-slate-400">{t.unit}</span>}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] tabular-nums">
        <span className="text-slate-300" title="So với tháng trước">{fmtDelta(t.delta, t.deltaUnit)}</span>
        <span className={t.stale ? "rounded bg-amber-950/60 px-1 text-amber-200" : "text-slate-500"} title={`${t.sub} · tháng đã đóng`}>{t.stale ? `cũ · ${fmtPeriod(t.period)}` : fmtPeriod(t.period)}</span>
      </div>
      {live && <p className="mt-1 flex items-baseline justify-between gap-2 text-[11px] tabular-nums" data-testid={`pulse-live-${t.id}`} title={`${live.source} · so với cuối tháng ${fmtPeriod(live.closedPeriod)}`}>
        <span className="text-slate-400">Hiện tại <b className="font-mono font-semibold text-q-text">{fmtValue(live.value, t.digits)}</b> <span className="text-slate-500">· {fmtDay(live.date)}</span></span>
        <span className="font-mono text-slate-300">{fmtPct(live.vsClosePct)}</span>
      </p>}
      {path && <svg viewBox="0 0 120 32" preserveAspectRatio="none" className="mt-2 h-8 w-full" role="img" aria-label={`${t.label}: ${t.points.length} tháng gần nhất`}>
        <polyline points={path} fill="none" stroke="#79a8ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {liveY !== null && <circle cx="118" cy={liveY} r="2.4" fill="#f8fafc" stroke="#4f8ef7" strokeWidth="1.2" vectorEffect="non-scaling-stroke"><title>Hiện tại</title></circle>}
      </svg>}
    </article>
  );
}

/** Nhịp vĩ mô: giá trị tháng đã đóng của các biến có số liệu thật + 24 tháng gần nhất. Tô màu trung tính: tăng/giảm tự nó không phải tốt/xấu. */
export default function MacroPulse() {
  const { data, error, isLoading } = useSWR<MacroSeriesResponse>(["macro-pulse"], () => fetchMarketJson<MacroSeriesResponse>("/api/macro/series", { tail: 25 }), {
    revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 30 * 60_000, keepPreviousData: true,
  });
  const { data: liveDoc } = useSWR<MacroLiveResponse>(["macro-live"], () => fetchMarketJson<MacroLiveResponse>("/api/macro/live"), {
    revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 15 * 60_000, keepPreviousData: true,
  });
  const liveSeries = liveDoc && typeof liveDoc === "object" && "series" in liveDoc ? liveDoc.series : undefined;
  const overdue = liveDoc && Array.isArray(liveDoc.overdue) ? liveDoc.overdue : [];
  const tiles = buildPulseTiles(data);
  const cover = factorCoverage(data);
  return (
    <section aria-labelledby="mh-pulse" className="scroll-mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mh-pulse" className="text-xs font-semibold text-slate-100">Nhịp vĩ mô</h3>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {overdue.length > 0 && <span className="text-[11px] text-amber-200" role="status" data-testid="pulse-overdue">{overdue.length} nguồn chậm công bố: {overdue.map((o) => `${o.nameVi} kỳ ${fmtPeriod(o.nextPeriod)} (${o.overdueDays} ngày)`).join(" · ")}</span>}
          {data && <span className="text-[10px] text-slate-500" data-testid="pulse-coverage">Có số liệu tự động {cover.have}/{cover.total} biến · số chính là tháng đã đóng{liveSeries ? ", dòng “Hiện tại” là giá ngày mới nhất" : ""}</span>}
        </span>
      </div>
      {error && <p role="alert" className="text-[11px] text-rose-300">Không tải được số liệu vĩ mô: {error.message}</p>}
      {isLoading && !data && <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-white/[0.04]" />)}</div>}
      {tiles.length > 0 && <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">{tiles.map((t) => <Tile key={t.id} t={t} l={liveSeries?.[t.id]} />)}</div>}
      {cover.missing.length > 0 && <p className="mt-2 text-[10px] leading-relaxed text-slate-500" data-testid="pulse-missing">Chưa có nguồn mở cập nhật tự động: {cover.missing.join(", ")}. Các biến này không được ước lượng thay thế.</p>}
    </section>
  );
}
