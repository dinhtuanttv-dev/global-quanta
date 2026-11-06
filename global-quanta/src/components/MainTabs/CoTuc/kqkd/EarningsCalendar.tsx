// LC5 (06/11/2026) — 📋 Lịch công bố KQKD (tab PHÂN TÍCH CƠ BẢN › Kết quả kinh doanh). Thay danh sách "Sắp KQKD" cũ (Project A, 30 phiên).
//   Mùa hiện tại + mùa kế tiếp · đường tiến độ mùa so 2 năm trước · lưới lịch tuần × ngày · bảng trạng thái (đã công bố / có BCTC chính thức
//   chưa có số / sắp tới / quá hạn) · dải ngày P10–P90 · khả năng công bố trong 5 phiên · lịch sử độ trễ · kết quả · xuất .ics · mở ngăn KQKD.
//   Nguồn: Gateway /api/fundamentals/kqkd/calendar (LC-v1). Nhãn MÔ TẢ.
import { useMemo, useState } from "react";
import { useKqkdCalendar, useKqkdSummary } from "../../../../hooks/useKqkd";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import { dmy, downloadText, fin, growthText, num, pct, pctPlain, TPL_LABEL, TPL_SHORT } from "../../../../lib/kqkd/format";
import type { CalRow, CalSeason, CalStatus, Tpl } from "../../../../lib/kqkd/types";
import { TPL_COLOR } from "./Kqkd3D";
import KqkdTickerDrawer from "./KqkdTickerDrawer";
import EventStudyPanel from "./EventStudyPanel";

const DAY = 864e5;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const STATUS: Record<CalStatus, { t: string; cls: string; dot: string }> = {
  REPORTED: { t: "Đã công bố", cls: "border-emerald-400/40 text-emerald-300", dot: "#10B981" },
  DISCLOSED: { t: "Có BCTC, chờ số", cls: "border-sky-400/40 text-sky-300", dot: "#38BDF8" },
  UPCOMING: { t: "Sắp công bố", cls: "border-[#E8B84B]/50 text-[#F5CE72]", dot: "#E8B84B" },
  OVERDUE: { t: "Quá hạn", cls: "border-rose-400/50 text-rose-300", dot: "#F43F5E" },
};
type Filter = "all" | CalStatus | "late" | "mine";
const WD = ["T2", "T3", "T4", "T5", "T6"];
/** Thứ tự bảng: việc cần chú ý trước — quá hạn, có BCTC chờ số, sắp công bố (ngày dự kiến tăng dần), đã công bố (mới nhất trước). */
const RANK: Record<CalStatus, number> = { OVERDUE: 0, DISCLOSED: 1, UPCOMING: 2, REPORTED: 3 };
export const sortRows = (a: CalRow, b: CalRow) => RANK[a.status] - RANK[b.status]
  || (a.status === "REPORTED" ? (b.date ?? "").localeCompare(a.date ?? "") : (a.date ?? a.expected ?? "9").localeCompare(b.date ?? b.expected ?? "9")) || a.t.localeCompare(b.t);

/** Ngày hiển thị của dòng: ngày thật (đã công bố / có tin) hoặc ngày dự kiến. */
const dayOf = (r: CalRow) => r.date ?? r.expected;

/** Đường tiến độ mùa: % mã đã công bố theo ngày sau kết thúc quý; mùa này (vàng, tới hôm nay) và cùng quý 1–2 năm trước. */
function SeasonCurve({ s }: { s: CalSeason }) {
  const [hx, setHx] = useState<number | null>(null);
  const Wd = 1000, Hd = 220, L = 44, R = 12, T = 12, B = 28, N = s.curve.curve.length - 1;
  const x = (d: number) => L + (d / N) * (Wd - L - R), y = (v: number) => T + (1 - v) * (Hd - T - B);
  const today = Math.max(0, Math.min(N, s.quarter.dayOfSeason));
  const path = (c: (number | null)[], upto = N) => c.slice(0, upto + 1).map((v, d) => `${d ? "L" : "M"}${x(d).toFixed(1)},${y(v ?? 0).toFixed(1)}`).join("");
  const lines = [
    ...s.prevCurves.map((p, i) => ({ label: p.label, d: path(p.curve), stroke: i === 0 ? "rgba(148,163,184,0.85)" : "rgba(148,163,184,0.45)", dash: i === 0 ? undefined : "4 4", w: 1.5 })),
    ...(s.quarter.dayOfSeason >= 0 ? [{ label: s.curve.label, d: path(s.curve.curve, today), stroke: "#E8B84B", dash: undefined, w: 2.5 }] : []),
  ];
  const hv = hx != null ? { d: hx, cur: hx <= today && s.quarter.dayOfSeason >= 0 ? s.curve.curve[hx] : null, prev: s.prevCurves.map((p) => p.curve[hx]) } : null;
  return (
    <figure className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="lc-curve">
      <figcaption className="mb-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
        <b>Tiến độ mùa báo cáo {s.quarter.label}</b>
        {lines.map((l) => <span key={l.label} className="flex items-center gap-1"><i className="inline-block h-[3px] w-5 rounded" style={{ background: l.stroke }} />{l.label}</span>)}
        {hv && <span className="ml-auto font-mono text-slate-200">ngày {hv.d}: {hv.cur != null ? `${s.curve.label} ${pctPlain(hv.cur, 0)} · ` : ""}{s.prevCurves.map((p, i) => `${p.label} ${pctPlain(hv.prev[i], 0)}`).join(" · ")}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${Wd} ${Hd}`} className="w-full" role="img" aria-label={`Tỷ lệ mã đã công bố theo ngày sau kết thúc quý: ${s.curve.label} ${pctPlain(s.stats.shareNow, 0)} tới hôm nay; ${s.prevCurves.map((p) => `${p.label} ${pctPlain(p.curve[today], 0)} cùng ngày`).join(", ")}`}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const d = Math.round((((e.clientX - r.left) / r.width) * Wd - L) / ((Wd - L - R) / N)); setHx(d >= 0 && d <= N ? d : null); }} onPointerLeave={() => setHx(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={L} x2={Wd - R} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.14)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgba(148,163,184,0.85)">{v * 100}%</text></g>)}
        {[0, 15, 30, 45, 60, 75].filter((d) => d <= N).map((d) => <text key={d} x={x(d)} y={Hd - 8} textAnchor="middle" fontSize={11} fill="rgba(148,163,184,0.85)">{d}</text>)}
        {[[20, "hạn riêng lẻ"], [45, "hạn hợp nhất"]].map(([d, t]) => <g key={d as number}><line x1={x(d as number)} x2={x(d as number)} y1={T} y2={Hd - B} stroke="rgba(244,63,94,0.45)" strokeDasharray="3 3" /><text x={x(d as number) + 4} y={T + 10} fontSize={10.5} fill="rgba(244,63,94,0.8)">{t as string}</text></g>)}
        {lines.map((l) => <path key={l.label} d={l.d} fill="none" stroke={l.stroke} strokeWidth={l.w} strokeDasharray={l.dash} strokeLinejoin="round" />)}
        {s.quarter.dayOfSeason >= 0 && s.quarter.dayOfSeason <= N && <><line x1={x(today)} x2={x(today)} y1={T} y2={Hd - B} stroke="rgba(245,206,114,0.5)" /><circle cx={x(today)} cy={y(s.curve.curve[today] ?? 0)} r={4} fill="#F5CE72" stroke="#0B0F19" strokeWidth={2} /></>}
        {hx != null && <line x1={x(hx)} x2={x(hx)} y1={T} y2={Hd - B} stroke="rgba(226,232,240,0.35)" />}
      </svg>
      <p className="text-[10px] text-slate-500">Trục ngang: số ngày sau kết thúc quý ({dmy(s.quarter.end)}). Cùng tập mã ở mọi mùa; ngày công bố thật = sớm nhất của tin BCTC chính thức và ngày dữ liệu.</p>
    </figure>
  );
}

/** Lưới lịch tuần × ngày làm việc từ kết thúc quý tới +75 ngày. */
function CalendarGrid({ s, rows, selected, onSelect, today }: { s: CalSeason; rows: CalRow[]; selected: string | null; onSelect: (d: string | null) => void; today: string }) {
  const byDay = useMemo(() => { const m = new Map<string, CalRow[]>(); for (const r of rows) { const d = dayOf(r); if (d) (m.get(d) ?? m.set(d, []).get(d)!).push(r); } return m; }, [rows]);
  const start = ms(s.quarter.end) + DAY;
  const monday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;
  const weeks: string[][] = [];
  // Cắt lưới: tới ngày có sự kiện cuối cùng (hoặc hạn hợp nhất) + 1 tuần, tối đa 76 ngày sau kết thúc quý.
  const lastDay = Math.max(ms(s.quarter.deadlineConsolidated), ...[...byDay.keys()].map(ms));
  const endGrid = Math.min(ms(s.quarter.end) + 76 * DAY, lastDay + 7 * DAY);
  for (let w = monday; w <= endGrid; w += 7 * DAY) weeks.push([0, 1, 2, 3, 4].map((k) => iso(w + k * DAY)));
  const max = Math.max(1, ...[...byDay.values()].map((x) => x.length));
  return (
    <div className="overflow-x-auto" data-testid="lc-grid">
      <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[11px]">
        <thead><tr>{WD.map((d) => <th key={d} className="text-center text-[10px] font-bold uppercase text-slate-500">{d}</th>)}</tr></thead>
        <tbody>
          {weeks.map((wk) => (
            <tr key={wk[0]}>
              {wk.map((d) => {
                const list = byDay.get(d) ?? [];
                const rep = list.filter((r) => r.status === "REPORTED" || r.status === "DISCLOSED"), exp = list.filter((r) => r.status === "UPCOMING");
                const out = ms(d) <= ms(s.quarter.end);
                const isToday = d === today, sel = d === selected;
                const a = list.length / max;
                const dl = d === s.quarter.deadlineStandalone ? "hạn riêng lẻ" : d === s.quarter.deadlineConsolidated ? "hạn hợp nhất" : null;
                return (
                  <td key={d} className="align-top">
                    <button type="button" disabled={out} onClick={() => onSelect(sel ? null : d)} data-testid={`lc-day-${d}`} aria-pressed={sel}
                      title={list.length ? `${dmy(d)}: ${rep.length} đã công bố, ${exp.length} dự kiến` : dmy(d)}
                      className={`h-[74px] w-full rounded-md border p-1 text-left transition ${sel ? "border-[#E8B84B] ring-1 ring-[#E8B84B]/60" : isToday ? "border-[#F5CE72]/70" : "border-white/[0.07]"} ${out ? "opacity-30" : "hover:border-white/25"}`}
                      style={{ background: list.length ? `rgba(232,184,75,${(0.05 + 0.25 * a).toFixed(3)})` : "rgba(255,255,255,0.015)" }}>
                      <span className="flex items-center justify-between">
                        <span className={`font-mono text-[11px] ${isToday ? "font-bold text-[#F5CE72]" : "text-slate-400"}`}>{d.slice(8)}/{d.slice(5, 7)}</span>
                        {list.length > 0 && <span className="font-mono text-[10px] text-slate-200">{rep.length > 0 && <span className="text-emerald-300">✓{rep.length}</span>}{exp.length > 0 && <span className="ml-1 text-[#F5CE72]">~{exp.length}</span>}</span>}
                      </span>
                      {dl && <span className="block text-[10px] font-bold text-rose-300">{dl}</span>}
                      <span className="mt-0.5 flex flex-wrap gap-[2px]">
                        {list.slice(0, dl ? 3 : 4).map((r) => {
                          const g = r.result?.npatYoY;
                          const c = r.status === "UPCOMING" ? "border-[#E8B84B]/60 text-[#F5CE72]" : g?.status === "NORMAL" ? ((g.value ?? 0) >= 0 ? "border-emerald-400/50 text-emerald-200" : "border-rose-400/50 text-rose-200") : "border-white/20 text-slate-300";
                          return <span key={r.t} className={`rounded border px-[3px] font-mono text-[10px] leading-[13px] ${c}`}>{r.t}</span>;
                        })}
                        {list.length > (dl ? 3 : 4) && <span className="text-[10px] text-slate-400">+{list.length - (dl ? 3 : 4)}</span>}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span><span className="text-emerald-300">✓n</span> đã công bố (chip xanh = LNST tăng, hồng = giảm so cùng kỳ)</span><span><span className="text-[#F5CE72]">~n</span> dự kiến (trung vị độ trễ lịch sử)</span><span>Màu nền đậm = nhiều mã · bấm ngày để lọc bảng</span>
      </p>
    </div>
  );
}

/** Dải chấm độ trễ lịch sử cùng loại quý (≤ 8 lần), vạch đỏ = hạn hợp nhất 45 ngày; vạch vàng = mùa này (thật hoặc dự kiến). */
function LagStrip({ r }: { r: CalRow }) {
  const W = 110, H = 16, max = 75, x = (d: number) => 2 + (Math.min(max, Math.max(0, d)) / max) * (W - 4);
  const now = r.lagDays ?? r.medianLag;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Độ trễ các mùa trước: ${r.history.map((h) => `${h.q} ${h.lag} ngày`).join(", ")}`}>
      <line x1={2} x2={W - 2} y1={H / 2} y2={H / 2} stroke="rgba(148,163,184,0.25)" />
      <line x1={x(45)} x2={x(45)} y1={1} y2={H - 1} stroke="rgba(244,63,94,0.7)" />
      {r.history.map((h, i) => <circle key={h.q} cx={x(h.lag)} cy={H / 2} r={2.5} fill={h.lag > 45 ? "#F43F5E" : `rgba(148,163,184,${(0.35 + 0.65 * ((i + 1) / r.history.length)).toFixed(2)})`}><title>{`${h.q}: ${h.lag} ngày`}</title></circle>)}
      {fin(now) && <rect x={x(now) - 1.5} y={1} width={3} height={H - 2} rx={1} fill={r.lagDays != null ? "#10B981" : "#E8B84B"}><title>{r.lagDays != null ? `Mùa này: ${r.lagDays} ngày` : `Dự kiến: ${r.medianLag} ngày`}</title></rect>}
    </svg>
  );
}

/** Tệp .ics (RFC 5545) các mã sắp công bố — sự kiện cả ngày tại ngày dự kiến. */
export function calendarIcs(rows: CalRow[], s: CalSeason): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ev = rows.filter((r) => r.expected && (r.status === "UPCOMING" || r.status === "OVERDUE")).map((r) => {
    const d = r.expected!.replace(/-/g, ""), d2 = iso(ms(r.expected!) + DAY).replace(/-/g, "");
    const band = r.band ? `Dải P10–P90: ${dmy(r.band[0])}–${dmy(r.band[1])}. ` : "";
    return ["BEGIN:VEVENT", `UID:kqkd-${s.quarter.fiscal}-${r.t}@dinhtuan-ck`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
      `SUMMARY:KQKD ${s.quarter.label} — ${r.t} (dự kiến)`, `DESCRIPTION:${band}Ước tính thống kê theo độ trễ công bố lịch sử (LC-v1)\\, không phải lịch công ty đăng ký.`, "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DinhTuan CK//Lich cong bo KQKD//VI", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n");
}

export default function EarningsCalendar({ onSelectTicker, sectorOf }: { onSelectTicker?: (t: string) => void; sectorOf?: (t: string) => string | null }) {
  const { data, error, isLoading } = useKqkdCalendar();
  const { data: summary } = useKqkdSummary();
  const { isPinned } = usePinnedStocks();
  const [season, setSeason] = useState<"current" | "next">("current");
  const [filter, setFilter] = useState<Filter>("all");
  const [tpl, setTpl] = useState<Tpl | "all">("all");
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE);
  const s = data ? data[season] : null;
  const tests: Record<Filter, (r: CalRow) => boolean> = {
    all: () => true, REPORTED: (r) => r.status === "REPORTED", DISCLOSED: (r) => r.status === "DISCLOSED", UPCOMING: (r) => r.status === "UPCOMING", OVERDUE: (r) => r.status === "OVERDUE",
    late: (r) => (r.lateShare ?? 0) >= 1 / 3, mine: (r) => isPinned(r.t),
  };
  const base = useMemo(() => (s?.rows ?? []).filter((r) => (tpl === "all" || r.tpl === tpl) && (!q || r.t.includes(q.toUpperCase()))), [s, tpl, q]);
  const rows = useMemo(() => base.filter((r) => tests[filter](r) && (!day || dayOf(r) === day)).sort(sortRows), [base, filter, day]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <div className="cf-panel rounded-xl p-4 text-[11px] text-rose-300">Không tải được Lịch công bố KQKD: {error}</div>;
  if (isLoading || !data || !s) return <div className="cf-panel rounded-xl p-4 text-[11px] italic text-slate-400">Đang tải Lịch công bố KQKD…</div>;
  const st = s.stats, today = data.asOf;
  const diffPrev = fin(st.shareNow) && fin(st.sharePrevSameDay) ? st.shareNow - st.sharePrevSameDay : null;
  const tiles: { label: string; value: string; sub: string; cls?: string }[] = [
    { label: "Đã công bố", value: `${st.reported}/${st.tickers}`, sub: `${pctPlain(st.shareNow, 0)} · ngày ${Math.max(0, s.quarter.dayOfSeason)} của mùa`, cls: "text-emerald-300" },
    { label: "So cùng ngày năm trước", value: diffPrev == null ? "—" : `${diffPrev >= 0 ? "+" : "−"}${Math.abs(diffPrev * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm %`, sub: `năm trước ${pctPlain(st.sharePrevSameDay, 0)} tới cùng ngày`, cls: diffPrev == null ? undefined : diffPrev >= 0 ? "text-emerald-300" : "text-amber-300" },
    { label: "Có BCTC, chờ số", value: String(st.disclosed), sub: "đã có tin BCTC chính thức", cls: "text-sky-300" },
    { label: `Dự kiến ${st.horizonDays} phiên tới`, value: fin(st.expectedNext) ? `≈ ${num(st.expectedNext, 0)}` : "—", sub: "tổng xác suất công bố", cls: "text-[#F5CE72]" },
    { label: "Quá hạn hợp nhất", value: String(st.overdue), sub: `sau ${dmy(s.quarter.deadlineConsolidated)}`, cls: st.overdue ? "text-rose-300" : undefined },
    { label: "Tin tốt công bố sớm?", value: st.earlyVsLate ? `${pct(st.earlyVsLate.early, 0)} / ${pct(st.earlyVsLate.late, 0)}` : "—", sub: st.earlyVsLate ? `LNST YoY trung vị: 1/3 sớm nhất / 1/3 muộn nhất (${st.earlyVsLate.n} mã mỗi nhóm)` : "cần ≥ 30 mã đã công bố" },
  ];
  const FILTERS: { id: Filter; label: string; title: string }[] = [
    { id: "all", label: "Tất cả", title: "Mọi mã" }, { id: "REPORTED", label: "Đã công bố", title: "Đã có BCTC quý" }, { id: "DISCLOSED", label: "Có BCTC, chờ số", title: "Có tin BCTC chính thức, số chưa vào kho" },
    { id: "UPCOMING", label: "Sắp công bố", title: "Chưa công bố, trước hạn hợp nhất" }, { id: "OVERDUE", label: "Quá hạn", title: "Quá hạn BCTC hợp nhất (+45 ngày) mà chưa có tin" },
    { id: "late", label: "Hay nộp muộn", title: "≥ 1/3 số mùa trước công bố sau hạn 45 ngày" }, { id: "mine", label: "Danh mục của tôi", title: "Mã đã ghim" },
  ];
  return (
    <section className="tw-scope cf-panel space-y-3 rounded-xl p-4" aria-label="Lịch công bố KQKD" data-testid="lc-panel">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-bold text-[#F5CE72]">📋 Lịch công bố KQKD — {s.quarter.label}</h3>
          <p className="text-[11px] text-slate-400">{st.tickers} mã · ngày thật từ tin BCTC chính thức VNDirect và kho BCTC · ngày dự kiến theo độ trễ lịch sử từng mã · cập nhật {dmy(today)}{data.disclosuresFetchedAt ? ` (tin BCTC ${data.disclosuresFetchedAt.slice(11, 16)} UTC)` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1" role="tablist" aria-label="Mùa báo cáo">
            {(["current", "next"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={season === k} onClick={() => { setSeason(k); setDay(null); setFilter("all"); setLimit(PAGE); }} data-testid={`lc-season-${k}`}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${season === k ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{k === "current" ? "Mùa hiện tại" : "Mùa kế tiếp"} · {data[k].quarter.label}</button>
            ))}
          </div>
          <span className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] font-bold text-slate-300" title={s.method}>{s.version} · {s.label}</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-[11px]" data-testid="lc-deadlines">
        {[["Kết thúc quý", s.quarter.end], ["Hạn BCTC riêng lẻ (+20 ngày)", s.quarter.deadlineStandalone], ["Hạn BCTC hợp nhất (+45 ngày)", s.quarter.deadlineConsolidated]].map(([t, d]) => (
          <span key={t} className="rounded-md border border-sky-400/20 bg-sky-400/[0.05] px-2 py-1 text-slate-300">{t}: <b className="font-mono text-slate-100">{dmy(d)}</b>{ms(d) >= ms(today) ? <span className="text-slate-500"> · còn {Math.round((ms(d) - ms(today)) / DAY)} ngày</span> : null}</span>
        ))}
        <span className="text-[10px] text-slate-500 self-center">Hạn theo quy định công bố thông tin (ước tính, công ty có thể được gia hạn).</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="lc-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">{t.label}</p>
            <p className={`font-mono text-[18px] font-bold tabular-nums ${t.cls ?? "text-slate-100"}`}>{t.value}</p>
            <p className="text-[10px] text-slate-500">{t.sub}</p>
          </div>
        ))}
      </div>

      <SeasonCurve s={s} />
      <CalendarGrid s={s} rows={base} selected={day} onSelect={(d) => { setDay(d); setLimit(PAGE); }} today={today} />
      {data.eventStudy?.aggregate && <EventStudyPanel a={data.eventStudy.aggregate} />}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Lọc trạng thái">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} title={f.title} onClick={() => { setFilter(f.id); setLimit(PAGE); }} data-testid={`lc-filter-${f.id}`}
              className={`rounded-md border px-2 py-1 font-semibold ${filter === f.id ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
              {f.label} <span className="font-mono text-slate-500">{base.filter(tests[f.id]).length}</span>
            </button>
          ))}
        </div>
        {day && <button type="button" onClick={() => setDay(null)} className="rounded-md border border-[#E8B84B]/40 px-2 py-1 text-[#F5CE72]" data-testid="lc-day-clear">Ngày {dmy(day)} ✕</button>}
        <select value={tpl} onChange={(e) => { setTpl(e.target.value as Tpl | "all"); setLimit(PAGE); }} aria-label="Mẫu BCTC" className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200">
          <option value="all">Mọi mẫu BCTC</option>{(Object.keys(TPL_LABEL) as Tpl[]).map((t) => <option key={t} value={t}>{TPL_LABEL[t]}</option>)}
        </select>
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Lọc mã…" aria-label="Lọc mã" className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200" data-testid="lc-search" />
        <button type="button" onClick={() => downloadText(`lich-KQKD-${s.quarter.label.replace("/", "-")}.ics`, calendarIcs(rows, s), "text/calendar;charset=utf-8")} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:text-slate-100" data-testid="lc-ics"
          title="Tải tệp lịch (.ics) các mã sắp công bố đang lọc — mở bằng Google Calendar / Outlook / Lịch iPhone">📅 Thêm vào lịch (.ics)</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[930px] border-separate border-spacing-0 text-[11px]" data-testid="lc-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="border-b border-white/10 px-1 py-1.5">Mã · ngành</th>
              <th className="border-b border-white/10 px-1 py-1.5">Trạng thái</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right">Ngày</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Dải P10–P90 của ngày công bố theo lịch sử">Dải dự kiến</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title={`Khả năng công bố trong ${st.horizonDays} phiên tới, có điều kiện chưa công bố tới hôm nay`}>{st.horizonDays} phiên tới</th>
              <th className="border-b border-white/10 px-1 py-1.5" title="Độ trễ (ngày sau kết thúc quý) các mùa cùng loại quý trước; vạch đỏ = hạn 45 ngày">Lịch sử độ trễ</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right">LNST YoY · lũy kế</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Bất ngờ chuẩn hoá LN cốt lõi">SUE</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Đã công bố: lợi suất vượt 3 phiên từ ngày công bố và z khối lượng. Chưa công bố: lợi suất vượt và z khối lượng 10 phiên gần nhất (giá/KL chạy trước tin)">Phản ứng giá</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => {
              const S = STATUS[r.status], g = growthText(r.result?.npatYoY ?? null), y = growthText(r.result?.ytd ?? null);
              return (
                <tr key={r.t} className="align-middle hover:bg-white/[0.03]" data-testid="lc-row">
                  <td className="border-b border-white/[0.05] px-1 py-1.5">
                    <button type="button" onClick={() => setOpen(r.t)} className="font-mono text-[12px] font-bold text-[#F5CE72] hover:underline" data-testid={`lc-open-${r.t}`}>{r.t}</button>
                    <span className="ml-1 rounded px-1 text-[10px] font-bold" style={{ color: TPL_COLOR[r.tpl], border: `1px solid ${TPL_COLOR[r.tpl]}55` }}>{TPL_SHORT[r.tpl]}</span>
                    <span className="block truncate text-[10px] text-slate-500" style={{ maxWidth: 130 }}>{sectorOf?.(r.t) ?? ""}</span>
                  </td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5">
                    <span className={`rounded border px-1.5 text-[10px] font-bold ${S.cls}`}>{S.t}</span>
                    {r.status === "DISCLOSED" && r.disclosureTitle && <span className="block max-w-[220px] truncate text-[10px] text-slate-500" title={r.disclosureTitle}>{r.disclosureTitle}</span>}
                    {(r.lateShare ?? 0) >= 1 / 3 && <span className="block text-[10px] text-rose-300">hay nộp muộn ({pctPlain(r.lateShare, 0)} mùa)</span>}
                  </td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums">
                    <span className={r.date ? "text-slate-100" : r.expected && r.expected < today ? "text-amber-300" : "text-[#F5CE72]"}>{dmy(dayOf(r))}</span>
                    <span className="block text-[10px] text-slate-500">{r.date ? `${r.lagDays} ngày · ${r.source === "DISCLOSURE" ? "tin BCTC" : "dữ liệu"}` : r.status === "OVERDUE" ? "quá hạn hợp nhất" : r.expected && r.expected < today ? `trễ hơn dự kiến ${Math.round((ms(today) - ms(r.expected)) / DAY)} ngày` : `dự kiến · ${r.medianLag} ngày`}</span>
                  </td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono text-[10.5px] tabular-nums text-slate-400">{r.band && !r.date ? `${dmy(r.band[0]).slice(0, 5)}–${dmy(r.band[1]).slice(0, 5)}` : "—"}<span className="block text-[10px] text-slate-500">{r.ownN} mùa{r.ownN < 4 ? " · theo nhóm" : ""}</span></td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right">
                    {fin(r.pNext) ? <span className="inline-flex items-center gap-1"><span className="h-1.5 w-12 overflow-hidden rounded bg-white/10"><span className="block h-full rounded bg-[#E8B84B]" style={{ width: `${r.pNext * 100}%` }} /></span><b className="font-mono tabular-nums text-slate-100">{pctPlain(r.pNext, 0)}</b></span> : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5"><LagStrip r={r} /></td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums">{r.result ? <><span className={`block ${g.cls}`} title={g.title}>{g.text}</span><span className={`block text-[10px] ${y.cls}`} title={y.title}>{y.text}</span></> : <span className="text-slate-500">—</span>}</td>
                  <td className={`border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums ${!fin(r.result?.sueCore) ? "text-slate-500" : (r.result!.sueCore as number) >= 2 ? "text-emerald-300" : (r.result!.sueCore as number) <= -2 ? "text-rose-300" : "text-slate-200"}`}>{num(r.result?.sueCore ?? null, 1)}</td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums" data-testid="lc-react">{(() => {
                    const x = r.reaction;
                    if (!x) return <span className="text-slate-500">—</span>;
                    if (x.kind === "THIN") return <span className="text-[10px] text-slate-500" title={`Chỉ ${x.nEst} phiên có giao dịch trong cửa sổ ước lượng (cần 60): không ước lượng được mô hình thị trường`}>ít giao dịch</span>;
                    if (x.kind === "EVENT") return <><span className={`block ${fin(x.scarAnn) && Math.abs(x.scarAnn) >= 2 ? ((x.carAnn ?? 0) > 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-200"}`} title="Lợi suất vượt 3 phiên từ ngày công bố">{x.sessionsAfter >= 2 ? pct(x.carAnn, 1) : "chờ phiên"}</span><span className={`block text-[10px] ${fin(x.avAnn) && x.avAnn >= 2 ? "text-[#F5CE72]" : "text-slate-500"}`} title="z khối lượng 3 phiên">KL z {num(x.avAnn, 1)}</span></>;
                    const alert = (fin(x.av10) && x.av10 >= 2) || (fin(x.scar10) && Math.abs(x.scar10) >= 2);
                    return <><span className={`block ${alert ? "text-[#F5CE72]" : "text-slate-300"}`} title={`10 phiên tới ${dmy(x.asOf)}: lợi suất vượt`}>{alert ? "⚡ " : ""}{pct(x.car10, 1)}</span><span className={`block text-[10px] ${fin(x.av10) && x.av10 >= 2 ? "text-[#F5CE72]" : "text-slate-500"}`} title="z khối lượng 10 phiên gần nhất">KL10 z {num(x.av10, 1)}</span></>;
                  })()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="py-4 text-center text-[11px] text-slate-500">Không có mã nào trong nhóm này{day ? ` vào ngày ${dmy(day)}` : ""}.</p>}
        {rows.length > limit && (
          <div className="flex items-center justify-center gap-3 py-2 text-[11px] text-slate-400">
            <span>Đang hiện {limit}/{rows.length} mã</span>
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} data-testid="lc-more" className="rounded-md border border-[#E8B84B]/40 px-3 py-1 font-semibold text-[#F5CE72] hover:bg-[#E8B84B]/10">Xem thêm {Math.min(PAGE, rows.length - limit)}</button>
            <button type="button" onClick={() => setLimit(rows.length)} className="rounded-md border border-white/10 px-3 py-1 hover:text-slate-200">Hiện tất cả</button>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-500">{s.method} Hạn pháp lý: BCTC quý riêng lẻ 20 ngày, hợp nhất 45 ngày sau kết thúc quý. "Tin tốt công bố sớm" là mô tả (Kross 1981; Chambers &amp; Penman 1984), chưa kiểm định cho thị trường Việt Nam.</p>
      {open && <KqkdTickerDrawer ticker={open} rows={summary?.rows ?? []} onClose={() => setOpen(null)} onOpenProfile={onSelectTicker} sectorOf={sectorOf} nextDeadline={data.next.quarter.deadlineConsolidated} />}
    </section>
  );
}
