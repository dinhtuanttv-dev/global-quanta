// TO-v1 (07/11/2026) — Timeline điểm mua, chế độ "Neo công bố (2D)": mỗi đợt cổ tức tiền đang diễn ra là một làn ngang
// công bố → vùng vào (2 phiên đầu sau công bố) → nắm giữ → phiên bán (cuối còn quyền) → GDKHQ, với vạch "hôm nay".
// Trục x = ngày lịch (dải 45 ngày quanh hôm nay); màu làn theo điều kiện TO-r1. Nhãn THĂM DÒ — không phải khuyến nghị.
import { useEffect, useMemo, useRef } from "react";
import { useToOverview } from "../../../../hooks/useCorpEvents";
import { dm, pct, pctS, type ToRadarRow } from "../../../../lib/cotuc/to";

const DAY = 864e5;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);

export function AnnouncementTimeline({ onSelectTicker }: { onSelectTicker?: (t: string) => void }) {
  const { data, isLoading } = useToOverview(true);
  const rows = useMemo(() => [...(data?.radar.rows ?? [])].sort((a, b) => (a.lastCumDate ?? a.ex).localeCompare(b.lastCumDate ?? b.ex)), [data]);
  const scroller = useRef<HTMLDivElement>(null);
  // Màn hẹp: biểu đồ rộng hơn khung -> cuộn sẵn tới vạch "hôm nay" (phần đáng xem: từ nay tới phiên bán / GDKHQ).
  useEffect(() => { const el = scroller.current, svg = el?.querySelector("svg"), mark = el?.querySelector("[data-today]"); if (!el || !svg || !mark || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, (Number(mark.getAttribute("data-today")) / 900) * el.scrollWidth - el.clientWidth * 0.35); }, [rows]);
  if (isLoading && !data) return <p className="tw-scope p-3 text-[11px] text-slate-500">Đang tải…</p>;
  if (!data) return <p className="tw-scope p-3 text-[11px] text-amber-300">Chưa tải được dữ liệu từ Gateway.</p>;
  const today = data.radar.asOf;
  const from = rows.length ? [addDays(today, -15), ...rows.map((r) => r.disclosed.slice(0, 10))].sort()[0] : addDays(today, -15);
  const to = rows.length ? [addDays(today, 25), ...rows.map((r) => addDays(r.ex, 2))].sort().reverse()[0] : addDays(today, 25);
  const span = (ms(to) - ms(from)) / DAY;
  const L = 112, W = 900, ROW = 30, H = 34 + rows.length * ROW;
  const x = (iso: string) => L + ((ms(iso) - ms(from)) / DAY / span) * (W - L - 8);
  const ticks: string[] = []; for (let d = from; d <= to; d = addDays(d, 7)) ticks.push(d);
  /** Phiên vào: phiên đầu sau công bố (đã có giá) hoặc ước bằng ngày kế tiếp; vùng vào = 2 phiên đầu. */
  const entryEnd = (r: ToRadarRow) => (r.entryDate ? addDays(r.entryDate, 1) : addDays(r.disclosed, 3));
  return (
    <section className="tw-scope rounded-xl p-4 space-y-2" style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} data-testid="to-timeline" aria-label="Timeline neo ngày công bố">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-bold text-slate-200">🗓 Neo ngày công bố (2D)</span>
        <span className="rounded border border-sky-400/40 px-1.5 text-[10px] font-semibold text-sky-300">{data.label}</span>
        <span className="text-slate-500">{rows.length} đợt cổ tức tiền đang chờ GDKHQ · quy tắc TO-r1 · khác chế độ cũ (neo GDKHQ ước tính)</span>
      </div>
      {rows.length === 0 ? <p className="py-6 text-center text-[11px] text-slate-500">Hiện không có đợt cổ tức tiền nào đang chờ GDKHQ.</p> : (
        <div className="overflow-x-auto" ref={scroller}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px]" role="img" aria-label="Làn thời gian từng đợt: công bố, vùng vào, nắm giữ, phiên bán, GDKHQ">
            {ticks.map((d) => <g key={d}><line x1={x(d)} x2={x(d)} y1={18} y2={H} stroke="rgba(255,255,255,0.05)" /><text x={x(d)} y={12} fontSize="9" fill="#64748b" textAnchor="middle">{dm(d)}</text></g>)}
            <line x1={x(today)} x2={x(today)} y1={14} y2={H} stroke="#38bdf8" strokeDasharray="3 3" data-today={x(today)} /><text x={x(today) + 3} y={24} fontSize="9" fill="#38bdf8">hôm nay</text>
            {rows.map((r, i) => {
              const y = 30 + i * ROW, mid = y + ROW / 2 - 4; const sell = r.lastCumDate ?? addDays(r.ex, -1);
              const tone = r.qualifies ? (r.t2Ok ? "#34d399" : "#fbbf24") : "#64748b";
              return (
                <g key={`${r.t}|${r.ex}`} data-testid="to-lane" style={{ cursor: "pointer" }} onClick={() => onSelectTicker?.(r.t)}>
                  <text x={4} y={mid + 4} fontSize="11" fontFamily="monospace" fill="#a5f3fc">{r.t}</text>
                  <text x={44} y={mid + 4} fontSize="9" fill="#94a3b8">{pct(liveOr(r), 1)}{r.qualifies ? " · ĐỦ" : ""}</text>
                  <rect x={x(r.disclosed)} y={mid - 3} width={Math.max(2, x(sell) - x(r.disclosed))} height={6} rx={3} fill={tone} opacity={0.18} />
                  <rect x={x(r.entryDate ?? addDays(r.disclosed, 1))} y={mid - 5} width={Math.max(3, x(entryEnd(r)) - x(r.entryDate ?? addDays(r.disclosed, 1)))} height={10} rx={2} fill={tone} opacity={0.85}><title>Vùng vào: 2 phiên đầu sau công bố</title></rect>
                  <rect x={x(entryEnd(r))} y={mid - 2} width={Math.max(0, x(sell) - x(entryEnd(r)))} height={4} rx={2} fill={tone} opacity={0.55}><title>Nắm giữ tới phiên cuối còn quyền</title></rect>
                  <circle cx={x(r.disclosed)} cy={mid} r={3.5} fill="#e2e8f0"><title>Công bố {dm(r.disclosed)}</title></circle>
                  <path d={`M${x(sell) - 4},${mid - 6}L${x(sell) + 4},${mid - 6}L${x(sell)},${mid + 1}Z`} fill={tone}><title>Bán {dm(sell)} (phiên cuối còn quyền)</title></path>
                  <line x1={x(r.ex)} x2={x(r.ex)} y1={mid - 7} y2={mid + 7} stroke="#f43f5e" strokeWidth="2"><title>GDKHQ {dm(r.ex)}</title></line>
                  <text x={Math.min(W - 6, x(r.ex) + 5)} y={mid + 4} fontSize="9" fill="#94a3b8"><tspan fill="#a5f3fc" fontFamily="monospace">{r.t}</tspan>{r.runUp != null ? ` · đã chạy ${pctS(r.runUp)}` : ""}{r.ranTooFar ? " ⚠" : ""}{!r.t2Ok ? " · không kịp T+2" : ""}</text>
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400">
            <span>● công bố</span><span><span className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-emerald-400/80 align-middle" />vùng vào (2 phiên đầu)</span><span><span className="mr-1 inline-block h-1 w-4 bg-emerald-400/50 align-middle" />nắm giữ</span>
            <span>▼ phiên bán (cuối còn quyền)</span><span><span className="mr-1 inline-block h-3 w-0.5 bg-rose-500 align-middle" />GDKHQ</span>
            <span>Xanh lá = đủ điều kiện TO-r1 và kịp T+2 · vàng = đủ điều kiện nhưng không kịp T+2 · xám = chưa đủ điều kiện</span>
          </div>
        </div>
      )}
    </section>
  );
}
const liveOr = (r: ToRadarRow) => r.yieldNow ?? r.yieldPre;
