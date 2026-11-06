// LSK0/LSK1 (07/11/2026) — 🗓️ Lịch sự kiện (tab Cổ tức), thay CalendarTabV3 (chỉ "Sắp GDKHQ" 30 phiên, nhãn "Ước tính" gán cứng, 1 sự kiện/mã).
// Nguồn: Gateway /api/corp-events — toàn bộ sự kiện VNDirect của danh mục (cổ tức tiền / cổ phiếu / thưởng, đổi ngày trả, ĐHCĐ, chốt quyền họp,
// lấy ý kiến, phát hành thêm, chuyển đổi, niêm yết bổ sung, cảnh báo / kiểm soát / ký quỹ), làm mới 4 lần/ngày, nhật ký đổi ngày,
// kiểm chéo ngày với tin doanh nghiệp CafeF. Lợi suất = cổ tức tiền × (1 − thuế 5%) / giá trực tiếp.
import { useMemo, useState } from "react";
import { useCorpEvents } from "../../../../hooks/useCorpEvents";
import { useVnTradingCalendar } from "../../../../lib/cotuc/vn-holidays";
import { tradingDaysBetween } from "../../../../lib/quant-cotuc";
import { addDays, calendarIcs, type CeGroup, type CorpEvent, filterEvents, GROUP_UI, groupByDay, keyDate, netYield, TRUST, weekday } from "../../../../lib/events/calendar";
import { dmy, downloadText, pctPlain, toCsv } from "../../../../lib/kqkd/format";
import { GanttView, MonthGrid, TickerEventsDrawer } from "./EventViews";

type View = "list" | "month" | "gantt";
const VIEW_KEY = "gq.events.view.v1";
const readView = (): View => { try { const v = localStorage.getItem(VIEW_KEY); return v === "month" || v === "gantt" ? v : "list"; } catch { return "list"; } };

const HORIZONS: [string, number][] = [["2 tuần", 14], ["30 ngày", 30], ["90 ngày", 90], ["12 tháng", 366]];
const GROUPS: CeGroup[] = ["DIVIDEND", "MEETING", "CAPITAL", "STATUS"];
const CHANGE_FIELD: Record<string, string> = { date: "ngày", ex: "GDKHQ", record: "ĐKCC", pay: "ngày thanh toán", meeting: "ngày họp", end: "ngày kết thúc", cash: "số tiền", ratio: "tỷ lệ", title: "nội dung" };

function Amount({ e, price }: { e: CorpEvent; price?: number }) {
  if (e.cat === "CASH" && e.cash) {
    const y = netYield(e, price);
    return <span className="font-mono tabular-nums"><b className="text-emerald-300">{e.cash.toLocaleString("vi-VN")} đ</b>{y != null && <span className="ml-1 text-[10px] text-slate-400" title="Sau thuế 5%, theo giá hiện tại">{pctPlain(y, 2)}</span>}</span>;
  }
  if (e.ratio && ["STOCK", "BONUS", "RIGHTS"].includes(e.cat)) return <span className="whitespace-nowrap font-mono text-cyan-200" title={e.cat === "RIGHTS" ? "Tỷ lệ quyền mua / phát hành (100:x)" : "Tỷ lệ cổ phiếu nhận thêm (100:x)"}><span className="font-sans text-[10px] text-slate-500">tỷ lệ </span>{e.ratio.toLocaleString("vi-VN")}%</span>;
  return <span className="text-slate-600">—</span>;
}

function Dates({ e }: { e: CorpEvent }) {
  const parts = [e.record && `ĐKCC ${dmy(e.record).slice(0, 5)}`, e.pay && `trả ${dmy(e.pay)}`, e.meeting && e.cat !== "AGM" && `họp ${dmy(e.meeting)}`, e.end && ["RIGHTS", "CONVERT"].includes(e.cat) && `đến ${dmy(e.end)}`].filter(Boolean);
  return <span className="text-[10.5px] text-slate-400">{parts.join(" · ") || "—"}</span>;
}

export default function EventsCalendar({ livePrices, onSelectTicker, pinned = [] }: { livePrices: Record<string, number>; onSelectTicker: (t: string) => void; pinned?: string[] }) {
  const { data, error, isLoading } = useCorpEvents(true);
  const cal = useVnTradingCalendar();
  const [groups, setGroups] = useState<Set<CeGroup>>(() => new Set<CeGroup>(["DIVIDEND", "MEETING", "CAPITAL"]));
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");
  const [minYield, setMinYield] = useState<number | null>(null);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [view, setViewRaw] = useState<View>(readView);
  const setView = (v: View) => { setViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* không có storage */ } };
  const [day, setDay] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const today = data?.asOf ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const base = { groups, query, minYield, onlyTickers: onlyPinned ? new Set(pinned) : null };
  const rows = useMemo(() => (data ? filterEvents(data.events, { ...base, from: day ?? (showPast ? addDays(today, -7) : today), to: day ?? addDays(today, days) }, livePrices) : []), [data, groups, today, days, query, minYield, onlyPinned, pinned, livePrices, showPast, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const wide = useMemo(() => (data ? filterEvents(data.events, { ...base, from: "2015-01-01", to: "2099-12-31" }, livePrices) : []), [data, groups, query, minYield, onlyPinned, pinned, livePrices]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => groupByDay(rows), [rows]);
  const kpi = useMemo(() => {
    if (!data) return null;
    const fut = data.events.filter((e) => keyDate(e) >= today && keyDate(e) <= addDays(today, 30));
    const cash = fut.filter((e) => e.cat === "CASH");
    const ys = cash.map((e) => netYield(e, livePrices[e.t])).filter((y): y is number => y != null);
    return { cash: cash.length, stock: fut.filter((e) => e.cat === "STOCK" || e.cat === "BONUS").length, meet: fut.filter((e) => e.cat === "AGM").length, maxYield: ys.length ? Math.max(...ys) : null, changes: data.changes.filter((c) => c.kind !== "NEW").length, news: data.changes.filter((c) => c.kind === "NEW").length };
  }, [data, today, livePrices]);

  if (error && !data) return <p className="tw-scope text-[11px] text-amber-300" data-testid="ce-error">Lịch sự kiện chưa sẵn sàng ({error}).</p>;
  if (!data) return <p role="status" className="tw-scope text-[11px] text-slate-500">{isLoading ? "Đang tải lịch sự kiện…" : "Chưa có dữ liệu."}</p>;
  const toggle = (g: CeGroup) => setGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const exportCsv = () => downloadText(`lich-su-kien-${today}.csv`, toCsv(["Ngày", "Mã", "Loại", "Nội dung", "Cổ tức đ/cp", "Tỷ lệ %", "ĐKCC", "Thanh toán", "Ngày họp", "Công bố", "Kiểm chéo"],
    rows.map((e) => [keyDate(e), e.t, e.label, e.title, e.cash, e.ratio, e.record, e.pay, e.meeting, e.disclosed, e.check ? TRUST[e.check.level].t : ""])));
  const exportIcs = () => downloadText(`lich-su-kien-${today}.ics`, calendarIcs(rows), "text/calendar;charset=utf-8");

  return (
    <section className="tw-scope space-y-3" data-testid="ce-calendar">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="ce-kpi">
        {[["GDKHQ cổ tức tiền · 30 ngày", kpi!.cash, ""], ["Cổ tức cổ phiếu / thưởng", kpi!.stock, ""], ["Họp ĐHCĐ · 30 ngày", kpi!.meet, ""], ["Lợi suất cao nhất (sau thuế)", kpi!.maxYield != null ? pctPlain(kpi!.maxYield, 2) : "—", "theo giá hiện tại"], ["Đổi / huỷ · 30 ngày", kpi!.changes, `${kpi!.news} sự kiện mới công bố`]].map(([l, v, s]) => (
          <div key={String(l)} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">{l}</p><p className="font-mono text-[15px] font-bold text-slate-100">{v}</p>{s && <p className="text-[10px] text-slate-500">{s}</p>}</div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Chế độ xem">
        {([["list", "☰ Danh sách"], ["month", "▦ Lịch tháng"], ["gantt", "▬ Gantt mốc"]] as [View, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`ce-view-${k}`}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${view === k ? "border-[#E8B84B]/60 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{l}</button>
        ))}
        {day && <button type="button" onClick={() => setDay(null)} className="ml-2 rounded-full border border-sky-400/50 px-2 py-0.5 text-[11px] text-sky-200" data-testid="ce-day-chip">Ngày {dmy(day)} ✕</button>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {GROUPS.map((g) => <button key={g} type="button" aria-pressed={groups.has(g)} onClick={() => toggle(g)} data-testid={`ce-g-${g}`} className={`rounded-full border px-2.5 py-1 text-[11px] ${groups.has(g) ? GROUP_UI[g].cls : "border-white/10 text-slate-500"}`}>{GROUP_UI[g].t}</button>)}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {HORIZONS.map(([l, n]) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)} data-testid={`ce-h-${n}`} className={`rounded-md border px-2 py-0.5 text-[11px] ${days === n ? "border-white/30 bg-white/10 text-slate-100" : "border-white/10 text-slate-500"}`}>{l}</button>)}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <select value={minYield ?? ""} onChange={(e) => setMinYield(e.target.value ? Number(e.target.value) : null)} aria-label="Lợi suất tối thiểu" className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-200" data-testid="ce-minyield">
          <option value="">Mọi lợi suất</option><option value="0.01">≥ 1%</option><option value="0.02">≥ 2%</option><option value="0.03">≥ 3%</option><option value="0.05">≥ 5%</option>
        </select>
        <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={onlyPinned} onChange={(e) => setOnlyPinned(e.target.checked)} /> Mã ghim</label>
        <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> 7 ngày qua</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Lọc mã…" aria-label="Lọc mã" className="ml-auto w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-200" data-testid="ce-q" />
        <button type="button" onClick={exportCsv} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300">CSV</button>
        <button type="button" onClick={exportIcs} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300" title="Thêm vào Google Calendar / Outlook">.ics</button>
      </div>

      {view === "month" && <MonthGrid events={wide} prices={livePrices} today={today} onPickDay={(d) => { setDay(d); setView("list"); }} onTicker={setDrawer} />}
      {view === "gantt" && <GanttView events={rows} from={day ?? (showPast ? addDays(today, -7) : today)} to={day ?? addDays(today, days)} today={today} onTicker={setDrawer} />}
      {view === "list" && <div className="overflow-x-auto rounded-lg border border-white/10" data-testid="ce-agenda">
        <table className="w-full min-w-[760px] text-[11px]">
          <thead><tr className="border-b border-white/10 text-left text-[10px] uppercase text-slate-500"><th className="px-2 py-1.5">Mã</th><th className="px-2 py-1.5">Sự kiện</th><th className="px-2 py-1.5 text-right">Cổ tức · lợi suất</th><th className="px-2 py-1.5">Mốc khác</th><th className="px-2 py-1.5">Độ tin cậy</th></tr></thead>
          {byDay.map(({ date, events }) => {
            const td = tradingDaysBetween(today, date, cal);
            return (
              <tbody key={date} data-testid="ce-day">
                <tr className="bg-white/[0.03]"><td colSpan={5} className="px-2 py-1 text-[10.5px] font-bold text-slate-300">{weekday(date)} {dmy(date)} <span className="font-normal text-slate-500">{date < today ? "· đã qua" : td === 0 ? "· hôm nay" : td != null ? `· còn ${td} phiên` : ""}</span></td></tr>
                {events.map((e) => (
                  <tr key={e.id} className={`border-b border-white/[0.04] ${date < today ? "opacity-60" : ""}`} data-testid="ce-row">
                    <td className="px-2 py-1"><button type="button" onClick={() => setDrawer(e.t)} className="font-mono font-bold text-cf-primary hover:text-[#F5CE72]">{e.t}</button></td>
                    <td className="px-2 py-1"><span className={`mr-1.5 rounded border px-1 text-[10px] ${GROUP_UI[e.group].cls}`}>{e.label}</span><span className="text-slate-300">{e.title}</span>
                      {e.changed && <span className="ml-1 rounded border border-amber-400/50 px-1 text-[10px] text-amber-300" title="VNDirect ghi nhận đổi ngày">đổi từ {dmy(e.changed)}</span>}</td>
                    <td className="px-2 py-1 text-right"><Amount e={e} price={livePrices[e.t]} /></td>
                    <td className="px-2 py-1"><Dates e={e} /></td>
                    <td className="whitespace-nowrap px-2 py-1">{e.check ? <span className={`rounded border px-1 text-[10px] ${TRUST[e.check.level].cls}`} title={`${TRUST[e.check.level].title}${e.check.source ? ` — ${dmy(e.check.source.date)}: ${e.check.source.title}` : ""}`}>{TRUST[e.check.level].t}</span> : <span className="text-[10px] text-slate-600">{e.disclosed ? `công bố ${dmy(e.disclosed).slice(0, 5)}` : ""}</span>}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
          {!byDay.length && <tbody><tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">Không có sự kiện nào khớp bộ lọc trong khoảng này.</td></tr></tbody>}
        </table>
      </div>}
      {drawer && <TickerEventsDrawer ticker={drawer} price={livePrices[drawer]} onClose={() => setDrawer(null)} onOpenProfile={(t) => { setDrawer(null); onSelectTicker(t); }} />}

      {data.changes.length > 0 && (
        <details className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px]" data-testid="ce-changes">
          <summary className="cursor-pointer text-slate-300"><b className="text-slate-100">Nhật ký thay đổi 30 ngày</b> · {data.changes.length} mục (mới công bố, đổi ngày, huỷ)</summary>
          <ul className="mt-1 space-y-0.5">{data.changes.slice(0, 60).map((c, i) => (
            <li key={i} className="text-slate-400"><span className="font-mono text-slate-500">{dmy(c.at)}</span> <button type="button" onClick={() => setDrawer(c.t)} className="font-mono font-bold text-cf-primary">{c.t}</button> · {c.label}: {c.kind === "NEW" ? <span className="text-emerald-300">mới công bố</span> : c.kind === "REMOVED" ? <span className="text-rose-300">không còn trên nguồn</span> : <span className="text-amber-300">{CHANGE_FIELD[c.field ?? ""] ?? c.field} {String(c.from ?? "—")} → {String(c.to ?? "—")}</span>} <span className="text-slate-500">· {c.title.slice(0, 80)}</span></li>
          ))}</ul>
        </details>
      )}
      <p className="text-[10px] text-slate-500"><span className="mr-1 rounded border border-sky-400/40 px-1 text-sky-300">MÔ TẢ</span>Nguồn: sự kiện quyền VNDirect (làm mới 4 lần/ngày, cập nhật {dmy(data.fetchedAt)} {data.fetchedAt.slice(11, 16)} UTC), kiểm chéo với tin công bố của doanh nghiệp trên CafeF. Cổ tức thường chỉ được báo trước khoảng 2 tuần (trung vị 13 ngày) — sự kiện xa hơn sẽ có ở phần dự báo. ĐKCC của cổ tức tiền = phiên kế tiếp sau GDKHQ. Lợi suất sau thuế TNCN 5%, theo giá hiện tại.</p>
    </section>
  );
}
