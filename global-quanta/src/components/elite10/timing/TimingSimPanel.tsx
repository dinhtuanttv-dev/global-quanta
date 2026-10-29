// CH2 (29/10/2026) — "⏱ Mô phỏng thời điểm vào" trong Hồ sơ 360° (Elite 10). Dồn trọng tâm vào CỔ TỨC và KQKD (mùa vụ tháng không đạt
// kiểm định — chỉ là bối cảnh). Dữ liệu: nghiên cứu sự kiện engine v3 (Project A, chỉ đọc) + lịch phiên (có ngày nghỉ) + Timeline điểm
// mua (Gateway). Mặc định (D5): loại sự kiện có vùng mua gần nhất trong Timeline; không có -> cổ tức.
// Khung ① lịch giá + chiếu tới và ③ mô phỏng vào / thoát + bản đồ nhiệt được nối ở CH3–CH4.
import { useMemo, useState } from "react";
import { useEventStudy } from "../../../hooks/elite10/useEventStudy";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useVnTradingCalendar } from "../../../lib/cotuc/vn-holidays";
import { todayOffset, tradingSessions, type EventStudyWindow } from "../../../lib/elite10/timingSim";
import EventStudyChart from "./EventStudyChart";

const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
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

  const todayOff = useMemo(() => {
    const d = es?.upcoming?.date ?? null;
    if (!d) return null;
    const lo = d < today ? d : today, hi = d < today ? today : d;
    return todayOffset(d, today, tradingSessions(lo, hi, (n) => cal.isTradingDay(n)));
  }, [es, today, cal]);
  const windows = useMemo(() => [...(es?.windows ?? [])].sort((a, b) => Number(b.selected) - Number(a.selected) || b.netExpectancyLcb - a.netExpectancyLcb), [es]);
  const win: EventStudyWindow | null = windows.find((w) => w.id === winId) ?? windows[0] ?? null;
  const eventWord = kind === "DIVIDEND" ? "GDKHQ" : `Công bố KQKD${es?.quarter ? ` Q${es.quarter}` : ""}`;

  return (
    <section className="rounded-lg border border-emerald-400/25 bg-slate-950/70 p-3 text-slate-200" data-testid="timing-sim-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold tracking-wide text-emerald-300">⏱ MÔ PHỎNG THỜI ĐIỂM VÀO · {ticker}</h3>
        <div className="inline-flex rounded border border-white/10 p-0.5" role="group" aria-label="Loại sự kiện">
          {(["DIVIDEND", "EARNINGS"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} data-testid={`timing-kind-${k}`} onClick={() => { setChosen(k); setWinId(null); }}
              className={`min-h-[26px] rounded px-2.5 text-[10.5px] ${kind === k ? "bg-emerald-500/20 font-bold text-emerald-200" : "text-slate-400 hover:text-slate-200"}`}>
              {k === "DIVIDEND" ? "Cổ tức" : "KQKD"}
            </button>
          ))}
        </div>
      </div>

      {loading && !es && <p className="py-6 text-center text-[11px] text-slate-500">Đang tải nghiên cứu sự kiện {ticker}…</p>}
      {error && !es && <p role="alert" className="py-4 text-[11px] text-rose-300">Không tải được nghiên cứu sự kiện: {error}</p>}
      {!loading && !error && !es && <p className="py-4 text-[11px] text-slate-500" data-testid="timing-sim-empty">{emptyReason ?? "Chưa có dữ liệu."}</p>}

      {es && (
        <>
          <p className="mt-1 text-[10.5px] text-slate-400" data-testid="timing-sim-upcoming">
            {eventWord} sắp tới: <b className="text-slate-100">{dm(es.upcoming?.date ?? null)}</b>{" "}
            {es.upcoming && <span className={`ml-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${es.upcoming.status === "CONFIRMED" || es.upcoming.status === "ANNOUNCED" ? "border-emerald-400/50 text-emerald-300" : "border-amber-400/50 text-amber-300"}`}>{STATUS_VI[es.upcoming.status] ?? es.upcoming.status}</span>}
            {todayOff != null && <> · hôm nay ở phiên <b className="text-amber-300">{todayOff > 0 ? `+${todayOff}` : todayOff}</b>{todayOff > 0 ? " (sự kiện đã qua)" : ""}</>}
            {" "}· {es.events.length} đợt lịch sử
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="Cửa sổ v3">
            {windows.map((w) => (
              <button key={w.id} type="button" role="option" aria-selected={win?.id === w.id} onClick={() => setWinId(w.id)} data-testid={`timing-window-${w.id}`}
                title={`Vào ${w.entryFrom}…${w.entryTo}, thoát ${w.exitOffset > 0 ? "+" : ""}${w.exitOffset} · ${w.nEvents} đợt · thắng ${Math.round(w.winRate * 100)}% · kỳ vọng ròng ${pct(w.netExpectancy)} (cận dưới ${pct(w.netExpectancyLcb)}) · q ${w.fdrQValue.toFixed(2)}`}
                className={`rounded border px-2 py-1 text-left text-[10px] leading-tight ${win?.id === w.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 hover:border-white/25"}`}>
                <span className="block font-bold text-slate-100">{w.label}</span>
                <span className="text-slate-400">{w.wins ?? Math.round(w.winRate * w.nEvents)}/{w.nEvents} thắng · ròng {pct(w.netExpectancy)}</span>
                <span className={`ml-1 font-bold ${w.selected ? "text-emerald-300" : "text-slate-500"}`}>{w.selected ? "ĐẠT" : "chưa đạt"}</span>
              </button>
            ))}
          </div>
          <div className="mt-2"><EventStudyChart es={es} window={win} todayOff={todayOff} /></div>
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
