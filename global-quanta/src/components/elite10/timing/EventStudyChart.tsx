// CH2 (29/10/2026) — khung ② "Nghiên cứu sự kiện" của chart mô phỏng thời điểm: trục = phiên tương đối so với sự kiện (GDKHQ /
// ngày công bố KQKD), tung độ = lợi suất vượt VN-Index tích luỹ (exp(CAR) − 1). Đường mảnh = từng đợt lịch sử; đường đậm = trung vị;
// dải = tứ phân vị; vùng xanh = vùng mua của cửa sổ đang xem (đặc = ĐẠT KIỂM ĐỊNH v3, chấm = chưa đạt); con trỏ HÔM NAY.
// SVG thuần (≤ 15 đường) — nhẹ, sắc nét mọi độ phân giải; có bảng tương đương cho trình đọc màn hình.
import { useMemo } from "react";
import type { TimelineRow } from "../../../lib/cotuc/buy-timeline";
import type { AnalogFan, FanPoint } from "../../../lib/elite10/analogFan";
import { pathBands, type EventStudy, type EventStudyWindow } from "../../../lib/elite10/timingSim";

const W = 720, H = 260, M = { l: 44, r: 14, t: 18, b: 30 };
const pct = (car: number) => Math.expm1(car);
const fmt = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Pt = { offset: number; ret: number };
export default function EventStudyChart({ es, window: win, todayOff, timeline = null, current = [], fan = null }: {
  es: EventStudy; window: EventStudyWindow | null; todayOff: number | null; timeline?: TimelineRow | null;
  /** Kỳ hiện tại (tự tính từ giá đóng cửa khi engine chưa có) + quạt dự phóng có điều kiện (CH3). */
  current?: Pt[]; fan?: AnalogFan | null;
}) {
  const bands = useMemo(() => pathBands(es), [es]);
  const eventWord = es.kind === "DIVIDEND" ? "GDKHQ" : "Công bố KQKD";
  const { x, y, yTicks, x0, x1 } = useMemo(() => {
    const vals = es.events.flatMap((e) => e.car.filter((v): v is number => v != null).map(pct));
    if (es.currentPath) vals.push(...es.currentPath.filter((v): v is number => v != null).map(pct));
    vals.push(...current.map((p) => p.ret));
    if (fan) for (const p of fan.points) vals.push(p.loAdj ?? p.lo, p.hiAdj ?? p.hi);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pad = (hi - lo) * 0.08 || 0.02;
    const y0 = lo - pad, y1 = hi + pad;
    const a = Math.min(es.offsets[0], todayOff ?? es.offsets[0]), b = Math.max(es.offsets[es.offsets.length - 1], todayOff ?? es.offsets[es.offsets.length - 1]);
    const xs = (o: number) => M.l + ((o - a) / (b - a || 1)) * (W - M.l - M.r);
    const ys = (v: number) => M.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
    const step = (y1 - y0) / 4, mag = 10 ** Math.floor(Math.log10(step)), nice = Math.ceil(step / mag) * mag;
    const ticks: number[] = [];
    for (let t = Math.ceil(y0 / nice) * nice; t <= y1 + 1e-12; t += nice) ticks.push(Math.round(t / nice) * nice);
    return { x: xs, y: ys, yTicks: ticks, x0: a, x1: b };
  }, [es, todayOff, current, fan]);

  const line = (car: (number | null)[]) => {
    let d = "", pen = false;
    car.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(es.offsets[i]).toFixed(1)},${y(pct(v)).toFixed(1)}`; pen = true; });
    return d;
  };
  const tlDates = timeline && win && timeline.windowId === win.id ? timeline : null;
  const med = bands.filter((b) => b.median != null);
  const band = bands.filter((b) => b.q25 != null && b.q75 != null);
  const bandPath = band.length > 1 ? `M${band.map((b) => `${x(b.offset)},${y(pct(b.q75!))}`).join("L")}L${[...band].reverse().map((b) => `${x(b.offset)},${y(pct(b.q25!))}`).join("L")}Z` : "";

  return (
    <figure className="m-0" data-testid="event-study-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Nghiên cứu sự kiện ${es.ticker}: ${es.events.length} đợt ${eventWord} lịch sử, lợi suất vượt VN-Index tích luỹ theo phiên tương đối`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="currentColor" className={t === 0 ? "text-slate-500" : "text-white/5"} strokeWidth={t === 0 ? 1 : 0.6} />
            <text x={M.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500" fontSize={9}>{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        {es.offsets.map((o) => <text key={o} x={x(o)} y={H - M.b + 13} textAnchor="middle" className="fill-slate-500" fontSize={8.5}>{o > 0 ? `+${o}` : o}</text>)}
        <text x={W - M.r} y={H - 4} textAnchor="end" className="fill-slate-600" fontSize={8.5}>phiên so với {eventWord}</text>

        {win && (
          <g data-testid="event-study-window">
            <rect x={x(win.entryFrom)} width={Math.max(2, x(win.entryTo) - x(win.entryFrom))} y={M.t} height={H - M.t - M.b}
              className={win.selected ? "fill-emerald-500/15 stroke-emerald-400/60" : "fill-sky-400/5 stroke-sky-300/50"} strokeDasharray={win.selected ? undefined : "4 3"} />
            <line x1={x(win.exitOffset)} x2={x(win.exitOffset)} y1={M.t} y2={H - M.b} className="stroke-rose-400/70" strokeDasharray="3 3" />
            <text x={x(win.entryFrom) + 3} y={M.t + 10} className={win.selected ? "fill-emerald-300" : "fill-sky-300"} fontSize={9}>
              VÙNG MUA{tlDates ? ` ${dm(tlDates.entryFromDate)}–${dm(tlDates.entryToDate)}` : ""} {win.selected ? "· ĐẠT KIỂM ĐỊNH" : "· chưa đạt"}
            </text>
            {/* sát mép phải -> neo chữ về bên trái đường thoát (không bị cắt) */}
            <text x={x(win.exitOffset) + (x(win.exitOffset) > W - M.r - 70 ? -3 : 3)} y={M.t + 22} textAnchor={x(win.exitOffset) > W - M.r - 70 ? "end" : "start"} className="fill-rose-300" fontSize={9}>
              THOÁT{tlDates ? ` ${dm(tlDates.exitDate)}` : ""}
            </text>
          </g>
        )}
        {bandPath && <path d={bandPath} className="fill-cyan-400/10" />}
        {es.events.map((e) => (
          <path key={e.eventDate} d={line(e.car)} fill="none" className="stroke-slate-400/35 hover:stroke-slate-100" strokeWidth={1} data-testid="event-study-path">
            <title>{`${eventWord} ${e.eventDate}: ${e.car.map((v, i) => (v == null ? null : `${es.offsets[i]}: ${fmt(pct(v))}`)).filter(Boolean).join(" · ")}`}</title>
          </path>
        ))}
        {med.length > 1 && <path d={`M${med.map((b) => `${x(b.offset)},${y(pct(b.median!))}`).join("L")}`} fill="none" className="stroke-cyan-300" strokeWidth={2} data-testid="event-study-median" />}
        {fan && fan.points.length > 0 && (() => {
          // quạt bắt đầu tại điểm neo HÔM NAY; dải ngoài = sau hiệu chỉnh CQR, dải trong = phân vị HD có trọng số
          const s0 = `${x(fan.todayOff)},${y(Math.expm1(fan.anchorCar))}`;
          const band = (lo: (p: FanPoint) => number, hi: (p: FanPoint) => number) =>
            `M${s0}L${fan.points.map((p) => `${x(p.offset)},${y(hi(p))}`).join("L")}L${[...fan.points].reverse().map((p) => `${x(p.offset)},${y(lo(p))}`).join("L")}Z`;
          return <g data-testid="event-study-fan">
            {fan.points[0].loAdj != null && <path d={band((p) => p.loAdj!, (p) => p.hiAdj!)} className="fill-amber-300/10" />}
            <path d={band((p) => p.lo, (p) => p.hi)} className="fill-amber-300/20" />
            <path d={`M${s0}L${fan.points.map((p) => `${x(p.offset)},${y(p.mid)}`).join("L")}`} fill="none" className="stroke-amber-200" strokeWidth={1.6} strokeDasharray="5 3" />
          </g>;
        })()}
        {current.length > 1 && <path d={`M${current.map((p) => `${x(p.offset).toFixed(1)},${y(p.ret).toFixed(1)}`).join("L")}`} fill="none" className="stroke-amber-300" strokeWidth={2.2} data-testid="event-study-current-derived" />}
        {es.currentPath && <path d={line(es.currentPath)} fill="none" className="stroke-amber-300" strokeWidth={2} strokeDasharray="5 3" data-testid="event-study-current" />}
        <line x1={x(0)} x2={x(0)} y1={M.t} y2={H - M.b} className="stroke-slate-300" strokeWidth={1.2} />
        <text x={x(0) + 3} y={H - M.b - 4} className="fill-slate-300" fontSize={9}>{eventWord}</text>
        {todayOff != null && todayOff >= x0 && todayOff <= x1 && (
          <g data-testid="event-study-today">
            <line x1={x(todayOff)} x2={x(todayOff)} y1={M.t} y2={H - M.b} className="stroke-amber-400" strokeWidth={1.4} strokeDasharray="2 2" />
            <text x={x(todayOff) - 3} y={M.t + 22} textAnchor="end" className="fill-amber-300" fontSize={9} fontWeight={700}>HÔM NAY ({todayOff > 0 ? `+${todayOff}` : todayOff})</text>
          </g>
        )}
      </svg>
      {/* sr-only bọc ngoài: đặt thẳng lên <table> thì bảng vẫn giãn theo nội dung -> tràn ngang 390 px. */}
      <div className="sr-only"><table>
        <caption>Trung vị lợi suất vượt VN-Index tích luỹ theo phiên tương đối ({es.events.length} đợt)</caption>
        <tbody>{bands.map((b) => <tr key={b.offset}><th>{b.offset}</th><td>{b.median == null ? "—" : fmt(pct(b.median))}</td><td>n {b.n}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}
