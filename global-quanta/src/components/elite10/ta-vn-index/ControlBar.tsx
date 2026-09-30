import type { Timeframe } from '../../../types/taVnIndex';

interface ControlBarProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  overlays: Record<string, boolean>;
  onToggleOverlay: (key: string) => void;
}

const TIMEFRAMES: Timeframe[] = ['D', 'W', 'H4', 'M1'];
const OVERLAY_KEYS: { key: string; label: string; group?: string }[] = [
  // Nhóm 1: Chỉ báo Trend & MA
  { key: 'trendline', label: 'Trendline', group: 'Xu hướng' },
  { key: 'sma200', label: 'SMA200', group: 'Xu hướng' },
  { key: 'ema', label: 'EMA21/50/100', group: 'Xu hướng' },
  { key: 'bollinger', label: 'Bollinger', group: 'Xu hướng' },
  { key: 'vwap', label: 'VWAP', group: 'Xu hướng' },
  { key: 'supertrend', label: 'SuperTrend', group: 'Xu hướng' },

  // Nhóm 2: Dòng tiền & Cấu trúc Mô hình
  { key: 'demandZone', label: 'Demand Zone', group: 'Cấu trúc & Dòng tiền' },
  { key: 'smc', label: 'SMC', group: 'Cấu trúc & Dòng tiền' },
  { key: 'vsa', label: 'VSA', group: 'Cấu trúc & Dòng tiền' },
  { key: 'wyckoff', label: 'Wyckoff', group: 'Cấu trúc & Dòng tiền' },
  { key: 'elliott', label: 'Elliott', group: 'Cấu trúc & Dòng tiền' },
  { key: 'fibonacci', label: 'Fibonacci', group: 'Cấu trúc & Dòng tiền' },
  { key: 'volumeProfile', label: 'Volume Profile', group: 'Cấu trúc & Dòng tiền' },

  // Nhóm 3: Dự báo & Sự kiện Chart
  { key: 'msGarch', label: 'MS-GARCH (Dự báo)', group: 'Dự báo & Sự kiện' },
  { key: 'events', label: 'Sự kiện (T/C/A)', group: 'Dự báo & Sự kiện' },
  { key: 'riskFlags', label: 'Cảnh báo ⚠', group: 'Dự báo & Sự kiện' },

  // Nhóm 4: Bảng giao diện
  { key: 'subPanels', label: 'Bảng chỉ báo phụ', group: 'Giao diện' },
];

export function ControlBar({ timeframe, onTimeframeChange, overlays, onToggleOverlay }: ControlBarProps) {
  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Khung thời gian:</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            aria-pressed={timeframe === tf}
            onClick={() => onTimeframeChange(tf)}
            className={
              timeframe === tf
                ? 'rounded border border-cyan-400 bg-cyan-400/20 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300'
                : 'rounded border border-cyan-400/25 px-2.5 py-0.5 text-[11px] text-slate-400 hover:text-slate-200'
            }
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Công cụ Chart (17):</span>
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
                  ? 'flex items-center gap-1 rounded border border-cyan-400 bg-cyan-500/25 px-2 py-0.5 text-[10px] font-bold text-cyan-200 shadow-[0_0_10px_rgba(34,232,255,0.3)] transition-all'
                  : 'flex items-center gap-1 rounded border border-slate-700/60 bg-slate-900/40 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-all'
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
