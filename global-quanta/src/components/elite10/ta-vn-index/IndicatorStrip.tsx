import type { VsaData, RsiData, MacdData, SmcData } from '../../../types/taVnIndex';
import { SourceBadge } from './SourceBadge';

/** Dải chỉ báo gọn: SMC tóm tắt + VSA + RSI + MACD. */
export function IndicatorStrip({ smc, vsa, rsi, macd }: { smc: SmcData; vsa: VsaData; rsi: RsiData; macd: MacdData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">SMC</div>
        <div className="text-[13px] font-bold text-slate-100">
          {smc.orderBlockCount} OB · {smc.fvgCount} FVG · {smc.bosCount} BOS
        </div>
        <SourceBadge source={smc.source} />
      </div>
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">VSA Engine</div>
        <div className="text-[13px] font-bold text-slate-100">{vsa.pattern}</div>
        <p className="mt-0.5 text-[10px] text-slate-500">{vsa.detail}</p>
      </div>
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">RSI (14)</div>
        <div className="text-[13px] font-bold text-slate-100">
          {rsi.value.value.toFixed(1)}
          <SourceBadge source={rsi.value.source} />
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">{rsi.label}</p>
      </div>
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">MACD (12,26,9)</div>
        <div className="text-[13px] font-bold text-slate-100">
          {macd.macd.value.toFixed(2)}
          <SourceBadge source={macd.macd.source} />
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">{macd.label}</p>
      </div>
    </div>
  );
}
