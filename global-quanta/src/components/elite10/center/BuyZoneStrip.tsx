// ⏱ DẢI VÙNG MUA (30/10/2026) — hiển thị vùng mua + thời gian vùng mua trực tiếp trong Radar Elite 10, cùng ngôn ngữ với Timeline điểm mua
// tối ưu (tab Cổ tức): ● ĐANG TRONG VÙNG MUA (sáng) / ⏱ SẮP TỚI / ĐÃ QUA, Chu kỳ cổ tức · Mùa vụ KQKD, ✓ Đạt kiểm định / Gần đạt.
// SVG theo trục PHIÊN GIAO DỊCH thật, dùng chung cho mọi hàng (đầu bảng có trục ngày) — nhìn ngang là thấy vùng mua nằm ở đâu so với HÔM NAY
// và kỳ nắm giữ 10 phiên của danh mục.
import type { BuyCell } from "../../../lib/elite10/buyTimingCell";
import type { BuyLane, LaneAxis, LaneZone } from "../../../lib/elite10/buyZoneLane";

const H = 22, TOP = 5, BAR = 12;
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const KIND = { DIVIDEND: { short: "C", text: "cổ tức", color: "#22d3ee" }, EARNINGS: { short: "K", text: "KQKD", color: "#a78bfa" } } as const;
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")}%`;

const cellX = (axis: LaneAxis, w: number) => {
  const n = Math.max(1, axis.dates.length), cw = w / n;
  return { cw, x: (i: number) => i * cw };
};

/** Trục ngày đầu cột (dùng chung cho mọi hàng). */
export function BuyZoneAxis({ axis, width }: { axis: LaneAxis; width: number }) {
  const { cw, x } = cellX(axis, width);
  const step = Math.max(1, Math.round(axis.dates.length / 5));
  return (
    <svg width={width} height={22} viewBox={`0 0 ${width} 22`} role="img" aria-label={`Trục phiên ${axis.dates[0] ? dm(axis.dates[0]) : ""} → ${axis.dates.length ? dm(axis.dates[axis.dates.length - 1]) : ""}`} data-testid="buy-zone-axis">
      {axis.entryIdx != null && axis.holdTo != null && (
        <rect x={x(axis.entryIdx)} y={13} width={(axis.holdTo - axis.entryIdx + 1) * cw} height={3} rx={1.5} fill="rgba(56,189,248,.45)"><title>Kỳ nắm giữ danh mục Elite 10 phiên</title></rect>
      )}
      {(() => {
        // Nhãn: phiên vào + mỗi ~1/5 trục, bỏ nhãn quá gần nhau (< 30 px); nhãn đầu / cuối neo vào trong (không bị cắt mép).
        const want = axis.dates.map((_, i) => i).filter((i) => i === axis.entryIdx || i % step === 0 || i === axis.dates.length - 1);
        const keep: number[] = [];
        for (const i of [...want].sort((a, b) => Number(b === axis.entryIdx) - Number(a === axis.entryIdx) || a - b)) if (keep.every((k) => Math.abs(x(k) - x(i)) >= 30)) keep.push(i);
        return keep.sort((a, b) => a - b).map((i) => {
          const cx = x(i) + cw / 2, anchor = cx < 14 ? "start" : cx > width - 14 ? "end" : "middle";
          return <text key={axis.dates[i]} x={anchor === "start" ? 1 : anchor === "end" ? width - 3 : cx} y={9} textAnchor={anchor} fontSize={8}
            className={i === axis.todayIdx ? "fill-amber-300" : i === axis.entryIdx ? "fill-cyan-300" : "fill-slate-500"}>{dm(axis.dates[i])}</text>;
        });
      })()}
      {axis.todayIdx != null && <line x1={x(axis.todayIdx) + cw / 2} x2={x(axis.todayIdx) + cw / 2} y1={11} y2={22} stroke="#f59e0b" strokeWidth={1.2} />}
    </svg>
  );
}

const ZONE_STATUS = (z: LaneZone) => z.row.status === "IN_WINDOW" ? "đang trong vùng" : z.row.status === "UPCOMING" ? `còn ${z.row.sessionsToEntry} phiên` : "đã qua";
const zoneTitle = (z: LaneZone) => {
  const r = z.row;
  return `${r.tier === "VALIDATED" ? "✓ Đạt kiểm định" : "Gần đạt (chưa qua kiểm định)"} · ${r.kind === "DIVIDEND" ? "Chu kỳ cổ tức" : "Mùa vụ KQKD"} · ${r.windowLabel}\n`
    + `Vùng mua ${dm(r.entryFromDate)} → ${dm(r.entryToDate)} (${ZONE_STATUS(z)}) · thoát ${dm(r.exitDate)} · ${r.eventLabel} ${dm(r.eventDate)}\n`
    + `Thắng ${Math.round(r.winRate * 100)}% / ${r.nEvents} đợt · kỳ vọng ròng ${pct(r.netExpectancy)} (cận dưới ${pct(r.netExpectancyLcb)})${r.missing.length ? ` · còn thiếu: ${r.missing.join("; ")}` : ""}`;
};

/** Một hàng: dòng trạng thái (cùng ngôn ngữ tab Cổ tức) + dải SVG. */
export default function BuyZoneStrip({ ticker, lane, axis, cell, width }: { ticker: string; lane: BuyLane; axis: LaneAxis; cell: BuyCell | undefined; width: number }) {
  const { cw, x } = cellX(axis, width);
  const main = lane.zones[0] ?? null;
  const far = lane.far.find((f) => f.side === "after") ?? null;
  // Dòng trạng thái: ưu tiên vùng ĐẠT KIỂM ĐỊNH (cùng quy tắc cột ⏱ Điểm mua), không có thì quy tắc danh mục.
  const kind = cell?.kind ?? "rule";
  const pill = kind === "in" ? { t: "● ĐANG TRONG VÙNG MUA", c: "text-emerald-300 border-emerald-400/60 bg-emerald-400/15 shadow-[0_0_10px_rgba(52,211,153,0.45)]" }
    : kind === "soon" || kind === "wait" ? { t: `⏱ SẮP TỚI · ${cell?.row?.sessionsToEntry ?? ""} phiên`, c: "text-amber-300 border-amber-400/50 bg-amber-400/10" }
    : kind === "near" ? { t: "◌ GẦN ĐẠT", c: "text-slate-300 border-dashed border-slate-400/50" }
    : { t: "→ QUY TẮC", c: "text-cyan-200 border-cyan-400/30 bg-cyan-400/5" };
  const entryDate = axis.entryIdx != null ? axis.dates[axis.entryIdx] : null, holdEnd = axis.holdTo != null ? axis.dates[axis.holdTo] : null;
  const detail = cell?.row && (kind === "in" || kind === "soon" || kind === "wait")
    ? `${KIND[cell.row.kind].text} ${dm(cell.row.entryFromDate)}→${dm(cell.row.entryToDate)} · thoát ${dm(cell.row.exitDate)}`
    : `${entryDate ? `Mở cửa ${dm(entryDate)}` : "Mở cửa phiên tới"}${holdEnd ? ` · giữ tới ${dm(holdEnd)}` : ""}`;
  const label = `${ticker}: ${pill.t}. ${detail}.${main ? ` Vùng mua ${dm(main.row.entryFromDate)}–${dm(main.row.entryToDate)} (${main.row.tier === "VALIDATED" ? "đạt kiểm định" : "gần đạt"}, ${ZONE_STATUS(main)}).` : ""}${far ? ` Vùng tiếp theo ${dm(far.row.entryFromDate)} sau ${far.row.sessionsToEntry} phiên.` : ""}`;

  return (
    <div className="leading-tight" data-testid={`buy-zone-${ticker}`} title={cell?.tooltip}>
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span className={`rounded border px-1 text-[8.5px] font-bold ${pill.c}`} data-testid={`buy-zone-pill-${ticker}`}>{pill.t}</span>
        <span className="truncate text-[9.5px] text-slate-300" data-testid={`buy-zone-detail-${ticker}`}>{detail}</span>
      </div>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label} className="mt-0.5 block overflow-visible">
        <rect x={0} y={TOP + 2} width={width} height={BAR - 4} rx={2} fill="rgba(148,163,184,.06)" />
        {axis.entryIdx != null && axis.holdTo != null && (
          <rect x={x(axis.entryIdx)} y={TOP + BAR / 2 - 1.5} width={(axis.holdTo - axis.entryIdx + 1) * cw} height={3} rx={1.5} fill="rgba(56,189,248,.5)">
            <title>{`Kỳ nắm giữ Elite: ${entryDate ? dm(entryDate) : "—"} → ${holdEnd ? dm(holdEnd) : "—"} (10 phiên)`}</title>
          </rect>
        )}
        {[...lane.zones].reverse().map((z) => {
          const ok = z.row.tier === "VALIDATED", passed = z.row.status === "PASSED", live = z.row.status === "IN_WINDOW";
          const col = ok ? "#34d399" : "#94a3b8";
          return (
            <g key={z.row.id} opacity={passed ? 0.4 : 1} data-testid={`buy-zone-bar-${ticker}`} data-tier={z.row.tier} data-status={z.row.status}>
              <title>{zoneTitle(z)}</title>
              <rect x={x(z.i0) + 0.5} y={TOP} width={Math.max(2, (z.i1 - z.i0 + 1) * cw - 1)} height={BAR} rx={3}
                fill={ok ? "rgba(52,211,153,.55)" : "rgba(148,163,184,.18)"} stroke={col} strokeWidth={live ? 1.6 : 1} strokeDasharray={ok ? undefined : "3 2"}
                className={live && ok ? "buy-zone-live" : undefined} style={live && ok ? { filter: "drop-shadow(0 0 4px rgba(52,211,153,.8))" } : undefined} />
              {z.clipLeft && <path d={`M${x(z.i0) + 1},${TOP + BAR / 2}l4,-3v6z`} fill={col} />}
              {z.clipRight && <path d={`M${x(z.i1) + cw - 1},${TOP + BAR / 2}l-4,-3v6z`} fill={col} />}
              {(z.i1 - z.i0 + 1) * cw > 34 && <text x={x(z.i0) + ((z.i1 - z.i0 + 1) * cw) / 2} y={TOP + BAR - 3} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={ok ? "#052e1a" : "#cbd5e1"}>{KIND[z.row.kind].short}·{dm(z.row.entryFromDate)}</text>}
              {z.eventIdx != null && (
                <g><title>{`${z.row.eventLabel} ${dm(z.row.eventDate)} (${z.row.eventDateBasis === "CONFIRMED" || z.row.eventDateBasis === "ANNOUNCED" ? "đã công bố" : "ước tính"})`}</title>
                  <path d={`M${x(z.eventIdx) + cw / 2},${TOP - 4}l3,3l-3,3l-3,-3z`} fill={KIND[z.row.kind].color} /></g>
              )}
              {z.exitIdx != null && <line x1={x(z.exitIdx) + cw / 2} x2={x(z.exitIdx) + cw / 2} y1={TOP} y2={TOP + BAR} stroke="#fb7185" strokeWidth={1.4}><title>{`Thoát vùng ${dm(z.row.exitDate)}`}</title></line>}
            </g>
          );
        })}
        {kind === "rule" || kind === "near" ? (axis.entryIdx != null && <path d={`M${x(axis.entryIdx) + cw / 2},${TOP + BAR + 5}l-3.5,4.5h7z`} fill="#38bdf8"><title>{`Vào theo quy tắc danh mục: mở cửa ${entryDate ? dm(entryDate) : ""}`}</title></path>) : null}
        {axis.todayIdx != null && <line x1={x(axis.todayIdx) + cw / 2} x2={x(axis.todayIdx) + cw / 2} y1={0} y2={H} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="2 1.5"><title>Hôm nay</title></line>}
        {far && (
          <text x={width - 1} y={TOP + BAR - 2} textAnchor="end" fontSize={8} className="fill-slate-400" data-testid={`buy-zone-far-${ticker}`}>
            <title>{zoneTitle({ row: far.row, i0: 0, i1: 0, clipLeft: false, clipRight: false, eventIdx: null, exitIdx: null })}</title>
            → {KIND[far.row.kind].short} {dm(far.row.entryFromDate)}/{far.row.entryFromDate.slice(2, 4)} · {far.row.sessionsToEntry}p
          </text>
        )}
      </svg>
      <style>{`.buy-zone-live{animation:buyZoneGlow 1.6s ease-in-out infinite}@keyframes buyZoneGlow{50%{stroke-opacity:.35}}@media (prefers-reduced-motion: reduce){.buy-zone-live{animation:none}}`}</style>
    </div>
  );
}
