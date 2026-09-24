import { useMsGarch } from '../../../hooks/elite10/useMsGarch';

/**
 * Elite 10 - Muc F (Tech Spec v2) Giai doan 5/5: hien thi ket qua
 * Markov-Switching GARCH - regime hien tai (yen tinh/bien dong) + xac
 * suat, canh bao neu mo hinh khong dang tin, va tom tat fan chart
 * (chi tiet day du da ve tren MainChart o tren).
 */
export function MsGarchPanel({ ticker }: { ticker: string | null }) {
  const { msGarch, isLoading, isError } = useMsGarch(ticker);

  if (isLoading) {
    return (
      <div className="rounded-md border border-amber-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3">
        <div className="text-[11px] font-bold tracking-wide text-amber-300">MARKOV-SWITCHING GARCH</div>
        <div className="mt-2 text-[10px] text-slate-500">Đang ước lượng mô hình...</div>
      </div>
    );
  }
  if (isError || !msGarch) return null;

  const { currentRegime, warnings, fanChart, horizonDays, currentPrice } = msGarch;
  const last = fanChart[fanChart.length - 1];
  const isCalm = currentRegime.label === 'calm';

  return (
    <div className="rounded-md border border-amber-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(251,191,36,0.06)]">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-amber-300">MARKOV-SWITCHING GARCH</div>
        <span className="text-[9px] text-slate-500">Dải xác suất {horizonDays} phiên tới</span>
      </div>

      <div className="mb-2.5 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] p-2.5">
        <span className="text-[10px] text-slate-400">Chế độ biến động hiện tại</span>
        <span className={isCalm ? 'text-[11px] font-bold text-emerald-400' : 'text-[11px] font-bold text-rose-400'}>
          {isCalm ? '🟢 Yên tĩnh' : '🔴 Biến động mạnh'} ({(isCalm ? currentRegime.probCalm : currentRegime.probVolatile) * 100 | 0}%)
        </span>
      </div>

      <div className="mb-2.5 grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <div className="rounded bg-rose-500/10 p-1.5">
          <div className="text-slate-500">P10 (bi quan)</div>
          <div className="font-mono font-bold text-rose-400">{last.p10.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded bg-white/5 p-1.5">
          <div className="text-slate-500">P50 (trung vị)</div>
          <div className="font-mono font-bold text-slate-200">{last.p50.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded bg-emerald-500/10 p-1.5">
          <div className="text-slate-500">P90 (lạc quan)</div>
          <div className="font-mono font-bold text-emerald-400">{last.p90.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</div>
        </div>
      </div>
      <div className="mb-2.5 text-center text-[9px] text-slate-500">
        So với giá hiện tại {currentPrice.toLocaleString('vi-VN')}: dải {((last.p10 / currentPrice - 1) * 100).toFixed(1)}% → {((last.p90 / currentPrice - 1) * 100).toFixed(1)}%
      </div>

      {warnings.length > 0 && (
        <div className="mb-2.5 rounded bg-rose-500/10 p-2.5 text-[9px] leading-relaxed text-rose-300">
          <b>⚠ {warnings.length} cảnh báo về độ tin cậy mô hình với mã này:</b>
          <ul className="mt-1 list-disc pl-3">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded bg-white/[0.02] p-2.5 text-[9px] leading-relaxed text-slate-500">{msGarch.methodologyNote}</div>
    </div>
  );
}
