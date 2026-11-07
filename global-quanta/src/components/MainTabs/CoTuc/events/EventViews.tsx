// LSK6 (07/11/2026) — Lịch sự kiện: lịch tháng (đậm nhạt theo lợi suất), Gantt mốc cổ tức / đại hội, ngăn chi tiết mã (lịch sử cổ tức 10 năm).
import { useEffect, useMemo, useState } from "react";
import { useCorpEventsTicker } from "../../../../hooks/useCorpEvents";
import { addDays, type CorpEvent, dividendHabits, dividendHistory, ganttRows, GROUP_UI, keyDate, monthCells, netYield, shiftMonth, TRUST } from "../../../../lib/events/calendar";
import { dmy, pctPlain } from "../../../../lib/kqkd/format";
import { ExStudyTicker } from "./ExDatePanels";

const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Lịch tháng: mỗi ô liệt kê tối đa 3 mã; nền vàng đậm dần theo lợi suất cổ tức tiền (sau thuế) cao nhất trong ngày. */
export function MonthGrid({ events, prices, today, onPickDay, onTicker }: { events: CorpEvent[]; prices: Record<string, number>; today: string; onPickDay: (d: string) => void; onTicker: (t: string) => void }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const byDay = useMemo(() => { const m = new Map<string, CorpEvent[]>(); for (const e of events) { const k = keyDate(e); (m.get(k) ?? m.set(k, []).get(k)!).push(e); } return m; }, [events]);
  const cells = monthCells(ym);
  return (
    <div className="space-y-2" data-testid="ce-month">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Tháng trước" className="rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-slate-300">‹</button>
        <b className="w-28 text-center text-[12px] text-slate-100" data-testid="ce-month-label">Tháng {Number(ym.slice(5))}/{ym.slice(0, 4)}</b>
        <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Tháng sau" className="rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-slate-300">›</button>
        <button type="button" onClick={() => setYm(today.slice(0, 7))} className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">Hôm nay</button>
        <span className="ml-auto text-[10px] text-slate-500">nền vàng đậm = lợi suất cổ tức tiền cao nhất trong ngày (sau thuế)</span>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
        {WD.map((w) => <div key={w} className="bg-[#0B0F19] px-1.5 py-1 text-center text-[10px] font-bold uppercase text-slate-500">{w}</div>)}
        {cells.map(({ date, inMonth }) => {
          const es = byDay.get(date) ?? [];
          const ys = es.map((e) => netYield(e, prices[e.t])).filter((y): y is number => y != null);
          const top = ys.length ? Math.max(...ys) : 0;
          const alpha = top ? Math.min(0.45, 0.08 + top * 6) : 0;
          return (
            <div key={date} className={`min-h-[78px] bg-[#0B0F19] p-1 ${inMonth ? "" : "opacity-40"} ${date === today ? "ring-1 ring-inset ring-[#E8B84B]/70" : ""}`} style={alpha ? { backgroundImage: `linear-gradient(rgba(232,184,75,${alpha}),rgba(232,184,75,${alpha}))` } : undefined} data-testid="ce-cell">
              <button type="button" onClick={() => onPickDay(date)} disabled={!es.length} className="w-full text-left text-[10.5px] font-bold text-slate-400 disabled:cursor-default">{Number(date.slice(8))}{es.length > 0 && <span className="ml-1 font-normal text-slate-500">· {es.length}</span>}</button>
              <div className="mt-0.5 flex flex-col gap-0.5">
                {es.slice(0, 3).map((e) => (
                  <button key={e.id} type="button" onClick={() => onTicker(e.t)} title={`${e.t} · ${e.label} · ${e.title}`} className={`truncate rounded border px-1 text-left text-[10px] ${GROUP_UI[e.group].cls}`}>{e.t}{e.cash ? ` ${e.cash >= 1000 ? `${(e.cash / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}k` : `${e.cash}đ`}` : ""}</button>
                ))}
                {es.length > 3 && <button type="button" onClick={() => onPickDay(date)} className="text-left text-[10px] text-slate-500">+{es.length - 3} sự kiện</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Gantt: mỗi mã một dòng — đoạn công bố → GDKHQ (mờ), GDKHQ → thanh toán (vàng), chốt quyền → họp (tím). */
export function GanttView({ events, from, to, today, onTicker }: { events: CorpEvent[]; from: string; to: string; today: string; onTicker: (t: string) => void }) {
  const rows = useMemo(() => ganttRows(events).slice(0, 80), [events]);
  const span = Math.max(1, (Date.parse(to) - Date.parse(from)) / 864e5);
  const x = (d: string | null) => (d ? Math.max(0, Math.min(100, ((Date.parse(d) - Date.parse(from)) / 864e5 / span) * 100)) : null);
  const ticks = useMemo(() => { const out: string[] = []; let d = from.slice(0, 8) + "01"; if (d < from) d = shiftMonth(d.slice(0, 7), 1) + "-01"; while (d <= to && out.length < 14) { out.push(d); d = shiftMonth(d.slice(0, 7), 1) + "-01"; } return out; }, [from, to]);
  if (!rows.length) return <p className="text-[11px] text-slate-500">Không có sự kiện cổ tức / đại hội trong khoảng này.</p>;
  const bar = (a: string | null, b: string | null, cls: string, title: string) => { const xa = x(a), xb = x(b); if (xa == null || xb == null || xb < xa) return null; return <span className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-sm ${cls}`} style={{ left: `${xa}%`, width: `${Math.max(0.6, xb - xa)}%` }} title={title} />; };
  const dot = (d: string | null, cls: string, title: string) => { const v = x(d); return v == null ? null : <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ${cls}`} style={{ left: `${v}%` }} title={title} />; };
  return (
    <div className="overflow-x-auto" data-testid="ce-gantt">
      <div className="min-w-[760px]">
        <div className="relative ml-16 h-5 border-b border-white/10 text-[10px] text-slate-500">
          {ticks.map((d) => <span key={d} className="absolute -translate-x-1/2" style={{ left: `${x(d)}%` }}>{Number(d.slice(5, 7))}/{d.slice(2, 4)}</span>)}
          {x(today) != null && <span className="absolute top-0 h-full w-px bg-[#E8B84B]" style={{ left: `${x(today)}%` }} />}
        </div>
        {rows.map((r) => (
          <div key={r.t} className="flex items-center border-b border-white/[0.04]" data-testid="ce-gantt-row">
            <button type="button" onClick={() => onTicker(r.t)} className="w-16 shrink-0 px-1 py-1 text-left font-mono text-[11px] font-bold text-cf-primary">{r.t}</button>
            <div className="relative h-6 flex-1">
              {x(today) != null && <span className="absolute top-0 h-full w-px bg-[#E8B84B]/40" style={{ left: `${x(today)}%` }} />}
              {r.items.map((i) => (
                <span key={i.id}>
                  {i.cat === "AGM_RECORD" || i.cat === "AGM"
                    ? <>{bar(i.record, i.meeting, "bg-violet-400/50", `${i.label}: ĐKCC ${dmy(i.record)} → họp ${dmy(i.meeting)}`)}{i.meeting ? dot(i.meeting, "bg-violet-300", `Họp ĐHCĐ ${dmy(i.meeting)}`) : dot(i.record ?? i.date, "bg-violet-400", `${i.label} ${dmy(i.record ?? i.date)} (chưa có ngày họp)`)}</>
                    : !i.ex ? dot(i.date, "bg-slate-400", `${i.label} ${dmy(i.date)}`)
                    : <>{bar(i.disclosed, i.ex, "bg-white/15", `Công bố ${dmy(i.disclosed)} → GDKHQ ${dmy(i.ex)}`)}{bar(i.ex, i.pay ?? i.record, "bg-[#E8B84B]/70", `${i.label}${i.cash ? ` ${i.cash.toLocaleString("vi-VN")} đ` : i.ratio ? ` ${i.ratio}%` : ""}: GDKHQ ${dmy(i.ex)}${i.pay ? ` → trả ${dmy(i.pay)}` : ""}`)}{dot(i.ex, "bg-[#F5CE72]", `GDKHQ ${dmy(i.ex)}`)}</>}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-1 text-[10px] text-slate-500"><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-white/15 align-middle" />công bố → GDKHQ <span className="mx-1 inline-block h-2 w-4 rounded-sm bg-[#E8B84B]/70 align-middle" />GDKHQ → thanh toán / ĐKCC <span className="mx-1 inline-block h-2 w-4 rounded-sm bg-violet-400/50 align-middle" />chốt quyền → họp ĐHCĐ · vạch vàng = hôm nay · tối đa 80 mã</p>
      </div>
    </div>
  );
}

/** Ngăn chi tiết mã: thói quen cổ tức, lịch sử theo năm tài chính, mọi sự kiện. */
export function TickerEventsDrawer({ ticker, price, onClose, onOpenProfile }: { ticker: string; price?: number; onClose: () => void; onOpenProfile: (t: string) => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={`Sự kiện ${ticker}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="ce-drawer">
      <div className="tw-scope h-full w-full max-w-[880px] overflow-y-auto border-l border-white/10 bg-[#0B0F19] p-4 shadow-2xl">
        <header className="mb-3 flex items-start gap-3">
          <h3 className="flex-1 text-[16px] font-bold text-[#F5CE72]">{ticker} <span className="text-[12px] font-normal text-slate-400">· sự kiện doanh nghiệp & cổ tức</span></h3>
          <button type="button" onClick={() => onOpenProfile(ticker)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300">Mở hồ sơ mã</button>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-slate-300">✕</button>
        </header>
        <TickerEventsBody ticker={ticker} price={price} />
      </div>
    </div>
  );
}

/** BL5: thân ngăn sự kiện một mã (Gateway VNDirect) — dùng cả ở ngăn Lịch sự kiện và tab "Sự kiện & cổ tức" của hồ sơ mã. */
export function TickerEventsBody({ ticker, price }: { ticker: string; price?: number }) {
  const d = useCorpEventsTicker(ticker);
  const events = d?.events ?? [];
  const hist = useMemo(() => dividendHistory(events).slice(-11), [events]);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const habits = useMemo(() => dividendHabits(events, Number(today.slice(0, 4))), [events, today]);
  const maxCash = Math.max(1, ...hist.map((h) => h.cash));
  const paid = hist.filter((h) => h.cash > 0); const lastFy = paid[paid.length - 1];
  const list = [...events].sort((a, b) => keyDate(b).localeCompare(keyDate(a)));
  return (
    <div className="tw-scope" data-testid="ce-body">
        {!d ? <p className="text-[11px] text-slate-500">Đang tải…</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Năm liên tiếp trả tiền</p><p className="font-mono text-[15px] font-bold text-slate-100" data-testid="ce-streak">{habits.streak}</p></div>
              <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Cổ tức tiền năm {lastFy?.year ?? "—"}</p><p className="font-mono text-[15px] font-bold text-emerald-300">{lastFy ? `${lastFy.cash.toLocaleString("vi-VN")} đ` : "—"}</p><p className="text-[10px] text-slate-500">{lastFy && price ? `${pctPlain((lastFy.cash * 0.95) / price, 2)} sau thuế theo giá hiện tại` : ""}</p></div>
              <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Báo trước GDKHQ</p><p className="font-mono text-[15px] font-bold text-slate-100">{habits.leadDays != null ? `${Math.round(habits.leadDays)} ngày` : "—"}</p><p className="text-[10px] text-slate-500">trung vị các lần trả tiền</p></div>
              <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Tháng hay GDKHQ</p><p className="font-mono text-[15px] font-bold text-slate-100">{habits.usualMonths.length ? habits.usualMonths.map((m) => `T${m}`).join(" · ") : "—"}</p></div>
            </div>
            {hist.length > 0 && (
              <div className="rounded-lg border border-white/10 p-2" data-testid="ce-hist">
                <p className="mb-1 text-[11px] font-bold text-slate-200">Cổ tức theo năm tài chính</p>
                <div className="flex items-end gap-1.5" style={{ height: 120 }}>
                  {hist.map((h) => (
                    <div key={h.year} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${h.year}: ${h.cash.toLocaleString("vi-VN")} đ/cp tiền${h.stockPct ? ` · cổ phiếu ${h.stockPct}%` : ""}${h.bonusPct ? ` · thưởng ${h.bonusPct}%` : ""} · ${h.payments} đợt`}>
                      <span className="text-[10px] text-slate-400">{h.cash ? (h.cash / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "k" : ""}</span>
                      <span className="w-full rounded-t bg-emerald-400/70" style={{ height: `${(h.cash / maxCash) * 80}px` }} />
                      {(h.stockPct || h.bonusPct) ? <span className="rounded bg-cyan-400/20 px-0.5 text-[10px] text-cyan-200">+{h.stockPct + h.bonusPct}%</span> : null}
                      <span className="text-[10px] text-slate-500">{h.year}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">Cột xanh = tổng cổ tức tiền đ/cp theo năm tài chính được chia; ô xanh dương = cổ tức cổ phiếu + thưởng (%). Nguồn VNDirect, từ 2015.</p>
              </div>
            )}
            <ExStudyTicker ticker={ticker} />
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[620px] text-[11px]" data-testid="ce-drawer-list">
                <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="px-2 py-1">Ngày</th><th className="px-2 py-1">Sự kiện</th><th className="px-2 py-1 text-right">Giá trị</th><th className="px-2 py-1">Mốc khác</th></tr></thead>
                <tbody>{list.slice(0, 120).map((e) => (
                  <tr key={e.id} className={`border-t border-white/[0.04] ${keyDate(e) < today ? "text-slate-400" : "text-slate-200"}`}>
                    <td className="px-2 py-0.5 font-mono">{dmy(keyDate(e))}</td>
                    <td className="px-2 py-0.5"><span className={`mr-1 rounded border px-1 text-[10px] ${GROUP_UI[e.group].cls}`}>{e.label}</span>{e.title}{e.check && keyDate(e) >= today && <span className={`ml-1 rounded border px-1 text-[10px] ${TRUST[e.check.level].cls}`}>{TRUST[e.check.level].t}</span>}</td>
                    <td className="px-2 py-0.5 text-right font-mono">{e.cash ? `${e.cash.toLocaleString("vi-VN")} đ` : e.ratio ? `${e.ratio}%` : ""}</td>
                    <td className="px-2 py-0.5 text-[10.5px] text-slate-500">{[e.record && `ĐKCC ${dmy(e.record)}`, e.pay && `trả ${dmy(e.pay)}`, e.meeting && e.cat !== "AGM" && `họp ${dmy(e.meeting)}`, e.disclosed && `công bố ${dmy(e.disclosed)}`].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
}

export const horizonEnd = (today: string, days: number) => addDays(today, days);
