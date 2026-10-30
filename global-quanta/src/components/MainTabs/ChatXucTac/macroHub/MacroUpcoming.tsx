import useSWR from "swr";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { upcomingEvents, type MacroCalendarItem, type MacroCalendarResponse } from "./macroHubData";

const whenVi = (d: number) => d === 0 ? "Hôm nay" : d === 1 ? "Ngày mai" : `Còn ${d} ngày`;
const dateVi = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Row({ e }: { e: MacroCalendarItem }) {
  const signal = e.kind === "alert" || e.kind === "regime"; // tín hiệu từ số liệu thật, không phải lịch công bố
  return (
    <li className="flex items-start gap-3 border-t border-white/5 py-2 first:border-t-0" data-testid="macro-upcoming-row">
      <div className="w-12 shrink-0 text-center">
        <p className="text-xs font-semibold tabular-nums text-slate-100">{dateVi(e.date)}</p>
        <p className="text-[9px] text-slate-500">{whenVi(e.daysRemaining)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-snug text-slate-100">{e.title}</p>
        <p className={`mt-0.5 text-[9px] ${signal ? "text-rose-300/90" : e.estimated ? "text-amber-300/90" : "text-emerald-300/90"}`}>{signal ? "Tín hiệu từ số liệu" : e.estimated ? "Ngày ước tính" : "Ngày chính thức"}{e.country ? ` · ${e.country}` : ""}</p>
      </div>
    </li>
  );
}

/** Lịch vĩ mô sắp tới: lịch hợp nhất trên Gateway — FOMC (ngày chính thức), GSO/NHNN/PMI (ước tính, ghi rõ), cảnh báo vĩ mô. */
export default function MacroUpcoming() {
  const { data, error, isLoading } = useSWR<MacroCalendarResponse>(["macro-upcoming"], () => fetchMarketJson<MacroCalendarResponse>("/api/macro/catalyst-events", { horizonDays: 60 }), {
    revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 60 * 60_000, keepPreviousData: true,
  });
  const rows = upcomingEvents(data);
  return (
    <section aria-labelledby="mh-calendar" className="scroll-mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-4" data-testid="macro-upcoming">
      <h3 id="mh-calendar" className="text-xs font-semibold text-amber-300">Lịch vĩ mô sắp tới</h3>
      <p className="mb-2 text-[11px] text-slate-400">Công bố số liệu và họp chính sách trong 60 ngày tới.</p>
      {error && <p role="alert" className="text-[11px] text-rose-300">Không tải được lịch vĩ mô: {error.message}</p>}
      {isLoading && !data && <p className="text-[11px] text-slate-400">Đang tải…</p>}
      {data && rows.length === 0 && <p className="text-[11px] text-slate-400">Chưa có sự kiện trong 60 ngày tới.</p>}
      {rows.length > 0 && <ul>{rows.map((e) => <Row key={e.id} e={e} />)}</ul>}
      {data?.caveat && <p className="mt-2 text-[9px] leading-relaxed text-slate-500">{data.caveat}</p>}
    </section>
  );
}
