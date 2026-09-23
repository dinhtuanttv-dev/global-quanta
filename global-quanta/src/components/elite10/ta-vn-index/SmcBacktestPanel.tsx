import type { SmcDetectorData } from '../../../hooks/elite10/useSmcDetector';
import type { WindowStat } from '../../../hooks/elite10/useCycleDetail';

/**
 * Giai doan 4/4 - Backtest thong ke chat che cho tung pattern SMC da
 * phat hien (Giai doan 1-3). Tai dung 100% bootstrap CI90/winRate/
 * sampleSize tu buildWindowStats() (time-engine.ts) - Y HET logic da
 * dung cho Tab Co Tuc, khong viet lai gi moi.
 */
function Row({ stat }: { stat: WindowStat | null }) {
  if (!stat || stat.sampleSize === 0) {
    return <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px] last:border-b-0"><span className="text-slate-500">{stat?.label ?? '—'}</span><span className="text-slate-600">Chưa đủ mẫu</span></div>;
  }
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px] last:border-b-0">
      <span className="text-slate-300">
        {stat.label}
        {stat.isLowSample && <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-400">n&lt;30</span>}
      </span>
      <span className="text-right">
        <span className={stat.avgReturn >= 0 ? 'font-mono text-emerald-400' : 'font-mono text-rose-400'}>
          {stat.avgReturn >= 0 ? '+' : ''}{stat.avgReturn.toFixed(1)}%
        </span>
        <span className="ml-2 text-slate-500">thắng {Math.round(stat.winRate * 100)}% (n={stat.sampleSize})</span>
      </span>
    </div>
  );
}

export function SmcBacktestPanel({ smcReal }: { smcReal?: SmcDetectorData | null }) {
  if (!smcReal) return null;
  const bt = smcReal.backtest;

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">BACKTEST PATTERN SMC/WYCKOFF</div>
        <span className="text-[9px] text-slate-500">Sau {bt.holdDays} phiên · dữ liệu 6 tháng gần nhất</span>
      </div>

      <Row stat={bt.fvgBullish} /><Row stat={bt.fvgBearish} />
      <Row stat={bt.bosBullish} /><Row stat={bt.bosBearish} />
      <Row stat={bt.chochBullish} /><Row stat={bt.chochBearish} />
      <Row stat={bt.orderBlockBullish} /><Row stat={bt.orderBlockBearish} />

      <div className="mt-2.5 rounded bg-white/[0.02] p-2.5 text-[10px] text-slate-500">
        <p>⏳ <b className="text-slate-300">Wyckoff Spring/SOS/LPS:</b> {bt.wyckoffNote}</p>
        <p className="mt-1">Mẫu thường nhỏ (n&lt;30, dữ liệu 6 tháng) — tham khảo, không phải cam kết. Xem cờ "n&lt;30" trước khi tin vào con số.</p>
      </div>
    </div>
  );
}
