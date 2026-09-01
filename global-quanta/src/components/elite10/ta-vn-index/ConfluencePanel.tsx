import type { EliteScoreBreakdown, ConfluenceStatus } from '../../../types/taVnIndex';

const STATUS_DOT: Record<ConfluenceStatus, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_6px_rgba(31,224,138,0.8)]',
  warn: 'bg-amber-400 shadow-[0_0_6px_rgba(255,176,32,0.8)]',
  conflict: 'bg-rose-400 shadow-[0_0_6px_rgba(255,77,94,0.8)]',
  no_data: 'bg-slate-600',
};

/**
 * "Giải trình hội tụ" — hiển thị Elite Score tổng hợp từ 7 nguồn (Giai
 * đoạn 7 + 9). `overall`/`sources` do Project A tính (renormalize khi
 * thiếu nguồn — xem computeEliteScore trong lib/taMath.ts phía Backend
 * tương ứng); Frontend chỉ hiển thị đúng những gì API trả về.
 */
export function ConfluencePanel({ breakdown, ticker }: { breakdown: EliteScoreBreakdown; ticker: string }) {
  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 text-[11px] font-bold tracking-wide text-cyan-300">
        GIẢI TRÌNH HỘI TỤ — {ticker} (7 NGUỒN)
      </div>

      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="text-3xl font-bold text-amber-400">
          {breakdown.overall.value.toFixed(1)}
          <span className="text-sm font-normal text-slate-500">/5</span>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          Elite Score
          <br />
          {breakdown.sourcesWithData}/{breakdown.sourcesTotal} nguồn có dữ liệu
          {!breakdown.weightsConfirmed && (
            <>
              <br />
              <span className="text-amber-400">Trọng số chưa qua backtest</span>
            </>
          )}
        </div>
      </div>

      {breakdown.sources.map((s) => (
        <div key={s.key} className="flex items-center justify-between border-b border-white/5 py-2 text-xs last:border-b-0">
          <span className={s.isCurrentTab ? 'flex items-center gap-1.5 font-bold text-cyan-300' : 'flex items-center gap-1.5'}>
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
            {s.name}
            {s.isCurrentTab && <span className="text-[9px] font-normal text-slate-500">(đang xem)</span>}
          </span>
          <span className="text-[11px] text-slate-400">
            {s.detail}
            <span className="ml-1.5 rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">
              {s.weightPct !== null ? `${s.weightPct}%` : '—'}
            </span>
          </span>
        </div>
      ))}

      <div className="mt-2.5 rounded bg-white/[0.02] p-2.5 text-[10px] text-slate-500">
        <p>
          <b className="text-slate-200">Rủi ro tập trung:</b> {breakdown.concentrationRiskNote}
        </p>
      </div>
    </div>
  );
}
