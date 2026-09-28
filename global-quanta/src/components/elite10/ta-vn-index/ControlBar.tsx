import type { Timeframe } from '../../../types/taVnIndex';

interface ControlBarProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  overlays: Record<string, boolean>;
  onToggleOverlay: (key: string) => void;
}

const TIMEFRAMES: Timeframe[] = ['D', 'W', 'H4', 'M1'];
const OVERLAY_KEYS: { key: string; label: string }[] = [
  { key: 'trendline', label: 'Trendline' },
  { key: 'demandZone', label: 'Demand Zone' },
  { key: 'sma200', label: 'SMA200' },
  { key: 'ema', label: 'EMA21/50/100' },
  { key: 'bollinger', label: 'Bollinger' },
  { key: 'smc', label: 'SMC' },
  { key: 'vsa', label: 'VSA' },
  { key: 'wyckoff', label: 'Wyckoff' },
  { key: 'elliott', label: 'Elliott' },
];

export function ControlBar({ timeframe, onTimeframeChange, overlays, onToggleOverlay }: ControlBarProps) {
  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            aria-pressed={timeframe === tf}
            onClick={() => onTimeframeChange(tf)}
            className={
              timeframe === tf
                ? 'rounded border border-cyan-400 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-300'
                : 'rounded border border-cyan-400/25 px-2.5 py-1 text-[11px] text-slate-400'
            }
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OVERLAY_KEYS.map((o) => {
          const isActive = Boolean(overlays[o.key]);
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggleOverlay(o.key)}
              className={
                isActive
                  ? 'flex items-center gap-1 rounded border border-cyan-400 bg-cyan-500/25 px-2.5 py-1 text-[11px] font-bold text-cyan-200 shadow-[0_0_10px_rgba(34,232,255,0.3)] transition-all'
                  : 'flex items-center gap-1 rounded border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-all'
              }
            >
              <span className={isActive ? 'text-emerald-400 font-extrabold' : 'text-slate-600'}>●</span>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
