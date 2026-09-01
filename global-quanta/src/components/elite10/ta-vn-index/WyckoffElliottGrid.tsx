import type { WyckoffData, ElliottData } from '../../../types/taVnIndex';
import { SourceBadge } from './SourceBadge';

/**
 * Wyckoff + Elliott — fix Giai đoạn 8: cả 2 PHẢI hiển thị độ tin cậy, và
 * Wyckoff PHẢI tự hạ tin cậy (regimeGated=true) khi ADX < 20. Wyckoff giữ
 * nguyên quyền trả `phase: null` ("Chưa xác định") thay vì ép ra kết luận.
 */
export function WyckoffElliottGrid({ wyckoff, elliott }: { wyckoff: WyckoffData; elliott: ElliottData }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">
          Wyckoff cycle
          <span className="ml-1.5 rounded bg-slate-500/15 px-1.5 py-0.5 text-[8px] font-bold text-slate-400">
            {wyckoff.regimeGated ? 'ADX-GATED · HẠ TIN CẬY' : 'ADX-GATED'}
          </span>
        </div>
        <div className="text-[13px] font-bold text-slate-100">{wyckoff.phase ?? 'Chưa xác định'}</div>
        {wyckoff.confidence && (
          <div className="mt-0.5 text-[11px] text-slate-400">
            Độ tin cậy: {(wyckoff.confidence.value * 100).toFixed(0)}%
            <SourceBadge source={wyckoff.confidence.source} />
          </div>
        )}
        <p className="mt-1 text-[10px] text-slate-500">{wyckoff.detail}</p>
      </div>

      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">
          Elliott wave
          <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">
            ĐỘ TIN CẬY {(elliott.confidence.value * 100).toFixed(0)}%
          </span>
        </div>
        <div className="text-[13px] font-bold text-slate-100">
          {elliott.waveLabel} ({elliott.alternateCounts > 1 ? `1/${elliott.alternateCounts} cách đếm` : 'duy nhất'})
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Đếm sóng luôn có thể có nhiều cách hợp lệ — hiển thị độ tin cậy thay vì khẳng định 1 kết luận duy nhất.
        </p>
      </div>
    </div>
  );
}
