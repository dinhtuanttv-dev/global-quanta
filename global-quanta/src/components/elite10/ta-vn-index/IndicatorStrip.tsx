import type { VsaData, RsiData, MacdData, SmcData, ComputedIndicatorBar } from '../../../types/taVnIndex';
import { SourceBadge } from './SourceBadge';

/** Dải chỉ báo gọn: SMC tóm tắt + VSA + RSI + MACD.
 * GIAI DOAN 1: RSI gio uu tien lay tu computedIndicators (tinh THAT tu
 * vnstock qua api/stock.py) - fallback ve field mock cu neu chua co du
 * lieu that (vd loi mang, chua tich hop xong). MACD VAN LA MOCK (can
 * tinh them Signal Line tu EMA12/EMA26 - de danh cho Giai doan 2). */
export function IndicatorStrip({
  smc, vsa, rsi, macd, computedIndicators,
}: { smc: SmcData; vsa: VsaData; rsi: RsiData; macd: MacdData; computedIndicators?: ComputedIndicatorBar[] | null }) {
  const latest = computedIndicators && computedIndicators.length > 0 ? computedIndicators[computedIndicators.length - 1] : null;
  const realRsi = latest?.rsi14 ?? null;
  const rsiValue = realRsi !== null ? realRsi : (rsi.value?.value ?? 0);
  const rsiIsReal = realRsi !== null;
  const rsiLabel = rsiIsReal
    ? (realRsi >= 70 ? 'Quá mua' : realRsi <= 30 ? 'Quá bán' : 'Trung tính')
    : rsi.label;

  // GIAI DOAN 2: MACD THAT (EMA12-EMA26, Signal=EMA9 cua MACD line) -
  // fallback ve field mock cu neu chua co du lieu that.
  const realMacd = latest?.macdLine ?? null;
  const macdValue = realMacd !== null ? realMacd : (macd.macd?.value ?? 0);
  const macdIsReal = realMacd !== null;
  const macdHistogram = macdIsReal ? (latest!.macdHistogram ?? 0) : (macd.histogram?.value ?? 0);
  const macdLabel = macdIsReal
    ? (macdHistogram > 0 ? 'Bullish (MACD trên Signal)' : macdHistogram < 0 ? 'Bearish (MACD dưới Signal)' : 'Trung tính')
    : macd.label;

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
          {rsiValue.toFixed(1)}
          <SourceBadge source={rsiIsReal ? 'HARD_DATA' : (rsi.value?.source ?? 'ESTIMATED')} />
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">{rsiLabel}</p>
      </div>
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">MACD (12,26,9)</div>
        <div className="text-[13px] font-bold text-slate-100">
          {macdValue.toFixed(2)}
          <SourceBadge source={macdIsReal ? 'HARD_DATA' : (macd.macd?.source ?? 'ESTIMATED')} />
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">{macdLabel}</p>
      </div>
    </div>
  );
}

