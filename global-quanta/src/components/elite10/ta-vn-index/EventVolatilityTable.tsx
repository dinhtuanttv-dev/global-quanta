import { useMemo } from 'react';
import type { OhlcBar, ChartEvent, PriceZone } from '../../../types/taVnIndex';
import { computeEventStats, findTrough, pctChange } from '../../../lib/taMath';

interface EventVolatilityTableProps {
  priceSeries: OhlcBar[];
  events: ChartEvent[];
  demandZone: PriceZone | undefined;
}

/**
 * Bảng "sự kiện ghim vào nến → biến động tới hiện tại" — % biến động + số
 * nến, tính bằng computeEventStats (O(n+m), xem lib/taMath.ts). Không tính
 * lại logic này ở component khác — 1 nguồn sự thật duy nhất.
 */
export function EventVolatilityTable({ priceSeries, events, demandZone }: EventVolatilityTableProps) {
  const stats = useMemo(() => computeEventStats(priceSeries, events), [priceSeries, events]);

  const troughStat = useMemo(() => {
    if (!demandZone || priceSeries.length === 0) return null;
    const trough = findTrough(priceSeries);
    if (!trough) return null;
    const lastBar = priceSeries[priceSeries.length - 1];
    const idx = priceSeries.findIndex((b) => b.time === trough.time);
    const bars = priceSeries.length - 1 - idx;
    const pct = pctChange(trough.close, lastBar.close);
    return { time: trough.time, close: trough.close, bars, pct };
  }, [priceSeries, demandZone]);

  if (priceSeries.length === 0) return null;

  return (
    <div className="mt-3">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="border-b border-cyan-400/20 px-1.5 py-1 text-left text-[9px] font-normal text-slate-500">
              Sự kiện
            </th>
            <th className="border-b border-cyan-400/20 px-1.5 py-1 text-left text-[9px] font-normal text-slate-500">
              Ngày
            </th>
            <th className="border-b border-cyan-400/20 px-1.5 py-1 text-left text-[9px] font-normal text-slate-500">
              Giá lúc đó
            </th>
            <th className="border-b border-cyan-400/20 px-1.5 py-1 text-left text-[9px] font-normal text-slate-500">
              Biến động → hiện tại
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.map((ev) => (
            <tr key={`${ev.time}-${ev.type}`} className="border-b border-white/5">
              <td className="px-1.5 py-1.5">
                <span
                  className={
                    ev.type === 'T'
                      ? 'mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400 text-[9px] font-bold text-cyan-400'
                      : 'mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-400 text-[9px] font-bold text-amber-400'
                  }
                >
                  {ev.type}
                </span>
                {ev.label}
              </td>
              <td className="px-1.5 py-1.5">{ev.time}</td>
              <td className="px-1.5 py-1.5">{ev.priceAtEvent.value.toLocaleString()}</td>
              <td className={ev.pctChangeToNow.value >= 0 ? 'px-1.5 py-1.5 text-emerald-400' : 'px-1.5 py-1.5 text-rose-400'}>
                {ev.pctChangeToNow.value > 0 ? '+' : ''}
                {ev.pctChangeToNow.value.toFixed(1)}% · {ev.barsSinceEvent} nến
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {troughStat && (
        <p className="mt-2 text-[10px] text-slate-500">
          Từ đáy Demand Zone ({troughStat.time}, {troughStat.close.toLocaleString()}) đến hiện tại:{' '}
          <b className={troughStat.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {troughStat.pct > 0 ? '+' : ''}
            {troughStat.pct.toFixed(1)}%
          </b>{' '}
          qua <b className="text-slate-300">{troughStat.bars} nến</b>.
        </p>
      )}
    </div>
  );
}
