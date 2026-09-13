import type { AdxData, ComputedIndicatorBar } from '../../../types/taVnIndex';
import { SourceBadge } from './SourceBadge';

const DOMINANT_LABEL: Record<AdxData['dominant'], string> = {
  plus: 'Xu hướng TĂNG mạnh',
  minus: 'Xu hướng GIẢM mạnh',
  neutral: 'Chưa rõ hướng (±DI gần bằng nhau)',
};

/**
 * ADX(14) — PHẢI hiển thị tách +DI/-DI (fix Giai đoạn 8). ADX chỉ đo
 * cường độ, không có hướng; tuyệt đối không suy luận hướng chỉ từ adx.value.
 *
 * GIAI DOAN 2: uu tien computedIndicators (Wilder's DMI/ADX THAT tinh tu
 * gia that qua api/stock.py) - fallback ve field mock cu neu chua co du
 * lieu that.
 */
export function AdxPanel({ adx, computedIndicators }: { adx: AdxData; computedIndicators?: ComputedIndicatorBar[] | null }) {
  const latest = computedIndicators && computedIndicators.length > 0 ? computedIndicators[computedIndicators.length - 1] : null;
  const hasReal = latest?.adx !== null && latest?.adx !== undefined && latest?.plusDi !== null && latest?.minusDi !== null;

  const adxValue = hasReal ? (latest!.adx as number) : (adx.adx?.value ?? 0);
  const plusDiValue = hasReal ? (latest!.plusDi as number) : (adx.plusDi?.value ?? 0);
  const minusDiValue = hasReal ? (latest!.minusDi as number) : (adx.minusDi?.value ?? 0);
  // Dominant TU TINH tu +DI/-DI THAT (khong dung field mock adx.dominant khi da co du lieu that)
  const dominant: AdxData['dominant'] = hasReal
    ? (Math.abs(plusDiValue - minusDiValue) < 2 ? 'neutral' : plusDiValue > minusDiValue ? 'plus' : 'minus')
    : adx.dominant;

  const dominantIsMinus = dominant === 'minus';
  const dominantIsPlus = dominant === 'plus';

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 text-[11px] font-bold tracking-wide text-cyan-300">
        ADX (14){' '}
        <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
          ĐÃ TÁCH HƯỚNG
        </span>
      </div>
      <div className="text-base font-bold text-slate-100">
        {adxValue.toFixed(1)}{' '}
        <span className="text-[11px] font-normal text-slate-400">— {DOMINANT_LABEL[dominant]}</span>
        <SourceBadge source={hasReal ? 'HARD_DATA' : (adx.adx?.source ?? 'ESTIMATED')} />
      </div>
      <div className="mt-1.5 flex gap-3 text-[11px]">
        <span className={dominantIsMinus ? 'font-bold text-rose-400' : 'text-rose-400'}>
          ▼ -DI: {minusDiValue.toFixed(1)} {dominantIsMinus && '(chiếm ưu thế)'}
        </span>
        <span className={dominantIsPlus ? 'font-bold text-emerald-400' : 'text-emerald-400'}>
          ▲ +DI: {plusDiValue.toFixed(1)} {dominantIsPlus && '(chiếm ưu thế)'}
        </span>
      </div>
      {dominantIsMinus && (
        <p className="mt-1.5 text-[10px] text-slate-500">
          ADX cao + -DI chiếm ưu thế = xu hướng GIẢM mạnh, không phải tăng. Không suy diễn "ADX mạnh" thành tín hiệu
          tăng khi chưa xét hướng.
        </p>
      )}
    </div>
  );
}

