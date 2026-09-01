import type { AdxData } from '../../../types/taVnIndex';
import { SourceBadge } from './SourceBadge';

const DOMINANT_LABEL: Record<AdxData['dominant'], string> = {
  plus: 'Xu hướng TĂNG mạnh',
  minus: 'Xu hướng GIẢM mạnh',
  neutral: 'Chưa rõ hướng (±DI gần bằng nhau)',
};

/**
 * ADX(14) — PHẢI hiển thị tách +DI/-DI (fix Giai đoạn 8). ADX chỉ đo
 * cường độ, không có hướng; tuyệt đối không suy luận hướng chỉ từ adx.value.
 */
export function AdxPanel({ adx }: { adx: AdxData }) {
  const dominantIsMinus = adx.dominant === 'minus';
  const dominantIsPlus = adx.dominant === 'plus';

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 text-[11px] font-bold tracking-wide text-cyan-300">
        ADX (14){' '}
        <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
          ĐÃ TÁCH HƯỚNG
        </span>
      </div>
      <div className="text-base font-bold text-slate-100">
        {adx.adx.value.toFixed(1)}{' '}
        <span className="text-[11px] font-normal text-slate-400">— {DOMINANT_LABEL[adx.dominant]}</span>
        <SourceBadge source={adx.adx.source} />
      </div>
      <div className="mt-1.5 flex gap-3 text-[11px]">
        <span className={dominantIsMinus ? 'font-bold text-rose-400' : 'text-rose-400'}>
          ▼ -DI: {adx.minusDi.value.toFixed(1)} {dominantIsMinus && '(chiếm ưu thế)'}
        </span>
        <span className={dominantIsPlus ? 'font-bold text-emerald-400' : 'text-emerald-400'}>
          ▲ +DI: {adx.plusDi.value.toFixed(1)} {dominantIsPlus && '(chiếm ưu thế)'}
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
