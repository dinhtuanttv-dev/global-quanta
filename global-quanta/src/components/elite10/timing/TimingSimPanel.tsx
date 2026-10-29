// CH2 (29/10/2026) — "⏱ Mô phỏng thời điểm vào" trong Hồ sơ 360° (Elite 10). Dồn trọng tâm vào CỔ TỨC và KQKD (mùa vụ tháng không đạt
// kiểm định — chỉ là bối cảnh). Dữ liệu: nghiên cứu sự kiện engine v3 (Project A, chỉ đọc) + lịch phiên (có ngày nghỉ) + Timeline điểm
// mua (Gateway). Mặc định (D5): loại sự kiện có vùng mua gần nhất trong Timeline; không có -> cổ tức.
// CH3D (29/10/2026): gắn "Timeline điểm mua tối ưu" (Gateway, cùng engine v3 — khớp theo windowId) thành dải vùng mua theo NGÀY THẬT;
// thêm chế độ "Không gian 4D" (TimingSpace3D: X phiên · Y lợi suất · Z đợt · W ESA ngày + điểm ESA intraday trực tiếp).
// Mặc định 3D trên màn ≥ 768 px, 2D trên điện thoại (3D vẫn bật được).
import { useMemo, useState } from "react";
import { useEventStudy } from "../../../hooks/elite10/useEventStudy";
import { useEsaSnapshot } from "../../../hooks/elite10/useEsaSnapshot";
import { useOhlcvData } from "../../../hooks/useOhlcvData";
import { buyTimingFreshness, useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useVnTradingCalendar } from "../../../lib/cotuc/vn-holidays";
import { todayOffset, tradingSessions, type EventStudyWindow } from "../../../lib/elite10/timingSim";
import { timelineRowFor, type DailyBar } from "../../../lib/elite10/timingSpace";
import EventStudyChart from "./EventStudyChart";
import TimingSpace3D from "./TimingSpace3D";

const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const wide = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches;
const TL_STATUS: Record<string, { text: string; cls: string }> = {
  IN_WINDOW: { text: "ĐANG TRONG VÙNG MUA", cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" },
  UPCOMING: { text: "SẮP TỚI", cls: "border-sky-400/50 bg-sky-500/10 text-sky-200" },
  PASSED: { text: "ĐÃ QUA", cls: "border-white/15 text-slate-400" },
};
const STATUS_VI: Record<string, string> = { CONFIRMED: "XÁC NHẬN", ANNOUNCED: "ĐÃ CÔNG BỐ", ESTIMATED: "ƯỚC TÍNH", HISTORICAL_LAG: "ƯỚC TÍNH (độ trễ lịch sử)", DEADLINE_ONLY: "THEO HẠN PHÁP LÝ" };

export default function TimingSimPanel({ ticker }: { ticker: string }) {
  const buy = useGatewayBuyTimeline();
  const defaultKind = useMemo<"DIVIDEND" | "EARNINGS">(() => {
    const rows = (buy.data?.rows ?? []).filter((r) => r.ticker === ticker && r.status !== "PASSED").sort((a, b) => a.sessionsToEntry - b.sessionsToEntry);
    return rows[0]?.kind === "EARNINGS" ? "EARNINGS" : "DIVIDEND";
  }, [buy.data, ticker]);
  const [chosen, setChosen] = useState<"DIVIDEND" | "EARNINGS" | null>(null);
  const kind = chosen ?? defaultKind;
  const { es, emptyReason, loading, error } = useEventStudy(ticker, kind);
  const cal = useVnTradingCalendar();
  const today = vnToday();
  const [winId, setWinId] = useState<string | null>(null);
  const [view, setView] = useState<"2D" | "3D">(() => (wide() ? "3D" : "2D"));
  const tl = useMemo(() => timelineRowFor(buy.data?.rows ?? [], ticker, kind), [buy.data, ticker, kind]);
  const fresh = buyTimingFreshness(buy.meta);
  const daily = useOhlcvData(view === "3D" && es ? ticker : null, "5y", 1300);
  const vni = useOhlcvData(view === "3D" && es ? "VNINDEX" : null, "1y", 300);
  const { esa } = useEsaSnapshot(ticker, view === "3D" && !!es);

  const todayOff = useMemo(() => {
    const d = es?.upcoming?.date ?? null;
    if (!d) return null;
    const lo = d < today ? d : today, hi = d < today ? today : d;
    return todayOffset(d, today, tradingSessions(lo, hi, (n) => cal.isTradingDay(n)));
  }, [es, today, cal]);
  const windows = useMemo(() => [...(es?.windows ?? [])].sort((a, b) => Number(b.selected) - Number(a.selected) || b.netExpectancyLcb - a.netExpectancyLcb), [es]);
  // Mặc định: cửa sổ của Timeline điểm mua (cùng engine) -> rồi cửa sổ đạt kiểm định / kỳ vọng cao nhất.
  const win: EventStudyWindow | null = windows.find((w) => w.id === winId) ?? windows.find((w) => w.id === tl?.windowId) ?? windows[0] ?? null;
  const eventWord = kind === "DIVIDEND" ? "GDKHQ" : `Công bố KQKD${es?.quarter ? ` Q${es.quarter}` : ""}`;

  return (
    <section className="rounded-lg border border-emerald-400/25 bg-slate-950/70 p-3 text-slate-200" data-testid="timing-sim-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold tracking-wide text-emerald-300">⏱ MÔ PHỎNG THỜI ĐIỂM VÀO · {ticker}</h3>
        <div className="flex flex-wrap gap-1.5">
        <div className="inline-flex rounded border border-white/10 p-0.5" role="group" aria-label="Kiểu biểu đồ">
          {(["2D", "3D"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} data-testid={`timing-view-${v}`} onClick={() => setView(v)}
              className={`min-h-[26px] rounded px-2.5 text-[10.5px] ${view === v ? "bg-cyan-500/20 font-bold text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>
              {v === "2D" ? "2D phân phối" : "3D · 4D không gian"}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded border border-white/10 p-0.5" role="group" aria-label="Loại sự kiện">
          {(["DIVIDEND", "EARNINGS"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} data-testid={`timing-kind-${k}`} onClick={() => { setChosen(k); setWinId(null); }}
              className={`min-h-[26px] rounded px-2.5 text-[10.5px] ${kind === k ? "bg-emerald-500/20 font-bold text-emerald-200" : "text-slate-400 hover:text-slate-200"}`}>
              {k === "DIVIDEND" ? "Cổ tức" : "KQKD"}
            </button>
          ))}
        </div>
        </div>
      </div>

      {loading && !es && <p className="py-6 text-center text-[11px] text-slate-500">Đang tải nghiên cứu sự kiện {ticker}…</p>}
      {error && !es && <p role="alert" className="py-4 text-[11px] text-rose-300">Không tải được nghiên cứu sự kiện: {error}</p>}
      {!loading && !error && !es && <p className="py-4 text-[11px] text-slate-500" data-testid="timing-sim-empty">{emptyReason ?? "Chưa có dữ liệu."}</p>}

      {es && (
        <>
          <p className="mt-1 text-[10.5px] text-slate-400" data-testid="timing-sim-upcoming">
            {eventWord} {es.upcoming?.date && es.upcoming.date < today ? "kỳ gần nhất" : "sắp tới"}: <b className="text-slate-100">{dm(es.upcoming?.date ?? null)}</b>{" "}
            {es.upcoming && <span className={`ml-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${es.upcoming.status === "CONFIRMED" || es.upcoming.status === "ANNOUNCED" ? "border-emerald-400/50 text-emerald-300" : "border-amber-400/50 text-amber-300"}`}>{STATUS_VI[es.upcoming.status] ?? es.upcoming.status}</span>}
            {todayOff != null && <> · hôm nay ở phiên <b className="text-amber-300">{todayOff > 0 ? `+${todayOff}` : todayOff}</b>{todayOff > 0 ? " (đã qua — chờ cập nhật kỳ kế tiếp)" : ""}</>}
            {" "}· {es.events.length} đợt lịch sử
          </p>
          {tl ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-emerald-400/20 bg-emerald-500/5 px-2 py-1.5 text-[10.5px]" data-testid="timing-timeline">
              <b className="text-emerald-300">⏱ Timeline điểm mua</b>
              <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${TL_STATUS[tl.status].cls}`}>{TL_STATUS[tl.status].text}</span>
              <span className="text-slate-200">{tl.windowLabel}</span>
              <span className="text-slate-300">vào <b className="text-slate-100">{dm(tl.entryFromDate)} → {dm(tl.entryToDate)}</b> · thoát <b className="text-slate-100">{dm(tl.exitDate)}</b></span>
              {tl.status === "UPCOMING" && <span className="text-sky-300">còn {tl.sessionsToEntry} phiên tới vùng mua</span>}
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${tl.tier === "VALIDATED" ? "border-emerald-400/50 text-emerald-300" : "border-amber-400/50 text-amber-300"}`}>{tl.tier === "VALIDATED" ? "ĐẠT KIỂM ĐỊNH" : "GẦN ĐẠT"}</span>
              <span className="text-slate-400">{tl.nEvents} đợt · thắng {Math.round(tl.winRate * 100)}% · ròng {pct(tl.netExpectancy)} (cận dưới {pct(tl.netExpectancyLcb)})</span>
              {tl.missing.length > 0 && <span className="text-amber-300/90">thiếu: {tl.missing.join("; ")}</span>}
              {fresh && <span className={`ml-auto text-[9.5px] ${fresh.stale ? "text-amber-300" : "text-slate-500"}`}>{fresh.text}</span>}
            </div>
          ) : (
            <p className="mt-2 text-[10.5px] text-slate-500" data-testid="timing-timeline-empty">
              ⏱ Timeline điểm mua: {buy.loading ? "đang tải…" : buy.error ? `tạm không có (${buy.error})` : `chưa có vùng mua ${kind === "DIVIDEND" ? "cổ tức" : "KQKD"} cho ${ticker} (chưa qua cổng thống kê hoặc chưa có lịch sự kiện).`}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="Cửa sổ v3">
            {windows.map((w) => (
              <button key={w.id} type="button" role="option" aria-selected={win?.id === w.id} onClick={() => setWinId(w.id)} data-testid={`timing-window-${w.id}`}
                title={`Vào ${w.entryFrom}…${w.entryTo}, thoát ${w.exitOffset > 0 ? "+" : ""}${w.exitOffset} · ${w.nEvents} đợt · thắng ${Math.round(w.winRate * 100)}% · kỳ vọng ròng ${pct(w.netExpectancy)} (cận dưới ${pct(w.netExpectancyLcb)}) · q ${w.fdrQValue.toFixed(2)}`}
                className={`rounded border px-2 py-1 text-left text-[10px] leading-tight ${win?.id === w.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 hover:border-white/25"}`}>
                <span className="block font-bold text-slate-100">{w.label}</span>
                <span className="text-slate-400">{w.wins ?? Math.round(w.winRate * w.nEvents)}/{w.nEvents} thắng · ròng {pct(w.netExpectancy)}</span>
                <span className={`ml-1 font-bold ${w.selected ? "text-emerald-300" : "text-slate-500"}`}>{w.selected ? "ĐẠT" : "chưa đạt"}</span>
                {tl?.windowId === w.id && <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-200">TIMELINE</span>}
              </button>
            ))}
          </div>
          <div className="mt-2">
            {view === "3D"
              ? <TimingSpace3D es={es} bars={(daily.bars ?? []) as DailyBar[]} indexBars={(vni.bars ?? []) as DailyBar[]} barsLoading={daily.isLoading} window={win} todayOff={todayOff} today={today} timeline={tl} esa={esa} />
              : <EventStudyChart es={es} window={win} todayOff={todayOff} timeline={tl} />}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Đường mảnh = từng đợt {eventWord.toLowerCase()} lịch sử, đường xanh đậm = trung vị, dải = tứ phân vị (lợi suất vượt VN-Index tích luỹ, giá tổng lợi suất).
            Vùng mua ĐẠT = cửa sổ qua cổng thống kê v3 (≥ 8 đợt, FDR, cận dưới lợi nhuận ròng {">"} 0, ngoài mẫu); "chưa đạt" chỉ để quan sát.
            Phân phối lịch sử, không phải dự báo · nguồn engine v3 ({es.version}, {es.asOf}).
          </p>
        </>
      )}
    </section>
  );
}
