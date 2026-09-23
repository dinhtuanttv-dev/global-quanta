import type { WyckoffData, ElliottData } from '../../../types/taVnIndex';
import type { WyckoffSchematic } from '../../../hooks/elite10/useSmcDetector';
import { SourceBadge } from './SourceBadge';

const STATUS_LABEL: Record<WyckoffSchematic["status"], string> = {
  range_only: "Đang trong vùng tích lũy",
  spring_confirmed: "Spring đã xác nhận",
  sos_confirmed: "Sign of Strength (SOS)",
  lps_confirmed: "Last Point of Support (LPS)",
};

/**
 * Wyckoff + Elliott — fix Giai đoạn 8: cả 2 PHẢI hiển thị độ tin cậy, và
 * Wyckoff PHẢI tự hạ tin cậy (regimeGated=true) khi ADX < 20. Wyckoff giữ
 * nguyên quyền trả `phase: null` ("Chưa xác định") thay vì ép ra kết luận.
 *
 * WYCKOFF (Giai doan 3, 2026-09-22): uu tien wyckoffReal (Spring/SOS/LPS
 * THAT tu lib/elite10/smc-detector.ts, da test khop 8/8 vi du tinh tay)
 * - fallback ve field mock cu neu chua load xong. CHI phat hien 3 su
 * kien co dinh nghia dinh luong ro rang, KHONG phai toan bo chu ky
 * Wyckoff A-E. Elliott GIU NGUYEN 100% - khong dong vao vi ban chat
 * khong xac dinh duy nhat 1 cach dem.
 */
export function WyckoffElliottGrid({ wyckoff, elliott, wyckoffReal }: { wyckoff: WyckoffData; elliott: ElliottData; wyckoffReal?: WyckoffSchematic | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">
          Wyckoff cycle
          {wyckoffReal ? (
            <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">DỮ LIỆU THẬT</span>
          ) : (
            <span className="ml-1.5 rounded bg-slate-500/15 px-1.5 py-0.5 text-[8px] font-bold text-slate-400">
              {wyckoff.regimeGated ? 'ADX-GATED · HẠ TIN CẬY' : 'ADX-GATED'}
            </span>
          )}
        </div>
        {wyckoffReal ? (
          <>
            <div className="text-[13px] font-bold text-slate-100">{STATUS_LABEL[wyckoffReal.status]}</div>
            <p className="mt-1 text-[10px] text-slate-500">
              Vùng {wyckoffReal.range.support.toFixed(1)}–{wyckoffReal.range.resistance.toFixed(1)}
              {wyckoffReal.spring && ` · Spring ${wyckoffReal.spring.date} (${wyckoffReal.spring.volumeVsAvgPct}% volume TB)`}
              {wyckoffReal.sos && ` · SOS ${wyckoffReal.sos.date}`}
              {wyckoffReal.lps && ` · LPS ${wyckoffReal.lps.date}`}
            </p>
            <p className="mt-1 text-[9px] text-amber-400">Chỉ phát hiện Spring/SOS/LPS, không phải toàn bộ chu kỳ Wyckoff A-E.</p>
          </>
        ) : (
          <>
            <div className="text-[13px] font-bold text-slate-100">{wyckoff.phase ?? 'Chưa xác định'}</div>
            {wyckoff.confidence && (
              <div className="mt-0.5 text-[11px] text-slate-400">
                Độ tin cậy: {wyckoff.confidence.value.toFixed(0)}%
                <SourceBadge source={wyckoff.confidence.source} />
              </div>
            )}
            <p className="mt-1 text-[10px] text-slate-500">{wyckoff.detail}</p>
          </>
        )}
      </div>

      <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
        <div className="mb-1 text-[11px] font-bold text-slate-200">
          Elliott wave
          <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">
            ĐỘ TIN CẬY {elliott.confidence.value.toFixed(0)}%
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
