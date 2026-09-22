import type { CycleDetailData, WindowStat, SeasonalStat } from '../../../hooks/elite10/useCycleDetail';

const MONTH_LABEL = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

function WindowCell({ w }: { w: WindowStat }) {
  if (w.sampleSize === 0) {
    return <div className="rounded-md bg-white/5 p-2 text-center"><div className="text-[8px] text-slate-600">{w.windowId}</div><div className="mt-1 text-[10px] text-slate-600">—</div></div>;
  }
  return (
    <div className={`relative rounded-md p-2 text-center ${w.isCurrent ? 'border border-cyan-400 bg-cyan-950/20' : 'bg-white/5'}`}>
      {w.isLowSample && <span className="absolute right-1 top-1 text-[7px] text-amber-400">n{'<'}30</span>}
      <div className="text-[8px] text-slate-500">{w.windowId}{w.isCurrent ? ' ★' : ''}</div>
      <div className={`mt-1 text-[13px] font-bold font-mono ${w.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {w.avgReturn >= 0 ? '+' : ''}{w.avgReturn.toFixed(1)}%
      </div>
      <div className="text-[8px] text-slate-600">n={w.sampleSize}</div>
    </div>
  );
}

const VERDICT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  MUA_TICH_LUY: { bg: 'bg-emerald-950/40 border-emerald-700', text: 'text-emerald-400', label: 'MUA TÍCH LŨY' },
  CHO: { bg: 'bg-amber-950/40 border-amber-700', text: 'text-amber-400', label: 'CHỜ' },
  QUAN_SAT: { bg: 'bg-slate-800/40 border-slate-600', text: 'text-slate-400', label: 'QUAN SÁT' },
};

/**
 * Vung 2.5 - "Chu Ky & Thoi Diem" DAY DU (thay CurrentWindowRibbon don
 * gian truoc day): Dividend 5 cua so + AGM 2 cua so + Seasonal 12 thang
 * + Verdict + placeholder minh bach Earnings/Wyckoff.
 */
export function CycleEnginePanel({ data }: { data: CycleDetailData }) {
  const v = data.verdict;
  const style = VERDICT_STYLE[v.action] ?? VERDICT_STYLE.QUAN_SAT;
  const currentMonthStat = data.seasonal.stats.find((s) => s.month === data.seasonal.currentMonth);

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">CHU KỲ &amp; THỜI ĐIỂM</div>
        <span className="text-[9px] text-slate-500">Time Engine — độc lập với điểm hội tụ</span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${style.bg} ${style.text}`}>{style.label}</span>
        <span className="text-[9px] text-slate-500">Độ tin cậy: {v.confidence} · Điểm khuyến nghị {v.recommendationScore}/10</span>
      </div>

      {(v.agreements.length > 0 || v.conflicts.length > 0) && (
        <div className="mb-3 space-y-1 text-[10px]">
          {v.agreements.map((a, i) => <div key={`a${i}`} className="text-emerald-400">+ {a}</div>)}
          {v.conflicts.map((c, i) => <div key={`c${i}`} className="text-rose-400">- {c}</div>)}
        </div>
      )}

      <div className="mb-1 text-[10px] font-bold text-slate-400">Chu kỳ cổ tức — 5 cửa sổ ({data.dividend.totalEvents} sự kiện lịch sử)</div>
      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {data.dividend.windows.map((w) => <WindowCell key={w.windowId} w={w} />)}
      </div>

      <div className="mb-1 text-[10px] font-bold text-slate-400">ĐHCĐ — 2 cửa sổ ({data.agm.totalEvents} sự kiện lịch sử)</div>
      <div className="mb-3 grid max-w-[220px] grid-cols-2 gap-1.5">
        {data.agm.windows.map((w) => <WindowCell key={w.windowId} w={w} />)}
      </div>

      <div className="mb-1 text-[10px] font-bold text-slate-400">Hiệu ứng mùa vụ theo tháng (5 năm gần nhất)</div>
      <div className="mb-3 grid grid-cols-12 gap-1">
        {data.seasonal.stats.map((s) => (
          <div key={s.month} className={`rounded p-1 text-center ${s.month === data.seasonal.currentMonth ? 'border border-cyan-400' : ''}`}>
            <div className="text-[7px] text-slate-500">{MONTH_LABEL[s.month - 1]}</div>
            <div className={`mt-0.5 text-[9px] font-bold ${s.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {s.sampleSize > 0 ? `${s.avgReturn >= 0 ? '+' : ''}${s.avgReturn.toFixed(1)}` : '—'}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2 rounded-md border border-dashed border-white/10 bg-white/[0.02] p-2.5">
        <div className="text-[10px] font-bold text-amber-400">⏳ BCTC quý — chưa tích hợp</div>
        <p className="mt-1 text-[9px] text-slate-500">{data.earnings.note}</p>
      </div>
      <div className="mb-2 rounded-md border border-dashed border-white/10 bg-white/[0.02] p-2.5">
        <div className="text-[10px] font-bold text-amber-400">⏳ Pha Wyckoff — chưa tích hợp vào verdict</div>
        <p className="mt-1 text-[9px] text-slate-500">{data.wyckoff.note}</p>
      </div>

      <p className="text-[9px] text-slate-600">
        <b>Ghi chú:</b> {v.disclaimer} Time Verdict độc lập hoàn toàn với Điểm hội tụ, không được cộng dồn.
      </p>
    </div>
  );
}
