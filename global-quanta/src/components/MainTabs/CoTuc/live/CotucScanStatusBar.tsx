import { useEffect, useState } from 'react';
import { useCotucScanStatus } from '../../../../hooks/useCotucUniverse';

/**
 * Dải trạng thái "quét liên tục" của tab Cổ tức (chuẩn Siêu Quét AI): danh mục bao nhiêu mã, đang ở lô nào của vòng thứ
 * mấy, lô gần nhất cách đây bao lâu, giá trong phiên đã cập nhật cho bao nhiêu mã. Dữ liệu từ Gateway /cotuc-scan/status.
 */
const hhmmss = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—');
function ago(iso: string | null, now: number) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} giây trước` : s < 3600 ? `${Math.floor(s / 60)} phút trước` : `${Math.floor(s / 3600)} giờ trước`;
}

export function CotucScanStatusBar({ universeCount, className }: { universeCount: number; className?: string }) {
  const { status, error } = useCotucScanStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5_000); return () => clearInterval(t); }, []);

  const t = status?.timing;
  const live = status?.mode === 'SESSION';
  const dot = !status ? '#64748b' : !status.enabled ? '#fb7185' : status.running ? '#fbbf24' : '#34d399';
  const total = t?.total ?? universeCount;
  const batchNo = t && t.total ? Math.floor(t.offset / Math.max(1, status!.intervals.timingLimit)) + 1 : null;
  const batches = t && t.total ? Math.ceil(t.total / Math.max(1, status!.intervals.timingLimit)) : null;
  return (
    <div data-testid="cotuc-scan-status" className={`tw-scope rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] ${className ?? ''}`}
      style={{ background: 'rgba(13,17,26,0.75)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="flex items-center gap-1.5 font-semibold text-cyan-400">
        <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${status?.running ? 'animate-pulse' : ''}`} style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
        Quét liên tục
      </span>
      <span className="text-slate-300">Danh mục <span className="font-mono tabular-nums text-slate-100">{total}</span> mã (Siêu Quét AI)</span>
      {error && <span className="text-rose-300">Không đọc được trạng thái quét: {error}</span>}
      {status && !status.enabled && <span className="text-rose-300">Bộ quét đang tắt — {status.reason}</span>}
      {status?.enabled && t && (
        <>
          <span className={live ? 'text-emerald-300' : 'text-slate-400'}>
            {live ? `Trong phiên · mỗi ${Math.round(status.intervals.sessionMs / 60000)} phút một lô` : `Ngoài giờ · mỗi ${Math.round(status.intervals.offHoursMs / 60000)} phút một lô`}
          </span>
          <span className="text-slate-400">
            Vòng <span className="font-mono tabular-nums text-slate-200">#{t.passes + 1}</span>
            {batchNo && batches && <> · lô <span className="font-mono tabular-nums text-slate-200">{batchNo}/{batches}</span></>}
          </span>
          {t.progress !== null && (
            <span className="inline-flex items-center gap-1.5" aria-label="Tiến độ vòng quét">
              <span className="relative inline-block h-1 w-20 rounded-full bg-white/10 overflow-hidden">
                <span className="absolute inset-y-0 left-0 bg-cyan-400/80" style={{ width: `${Math.round(t.progress * 100)}%` }} />
              </span>
              <span className="font-mono tabular-nums text-slate-400">{Math.round(t.progress * 100)}%</span>
            </span>
          )}
          <span className="text-slate-400">Lô gần nhất <span className="font-mono tabular-nums text-slate-200">{hhmmss(t.lastBatchAt)}</span> <span className="text-slate-500">({ago(t.lastBatchAt, now)})</span></span>
          {t.lastResult?.liveQuotes != null && <span className="text-slate-500">giá trong phiên: <span className="font-mono tabular-nums">{t.lastResult.liveQuotes}</span> mã</span>}
          {t.lastPassAt && <span className="text-slate-500">hết vòng gần nhất {hhmmss(t.lastPassAt)}</span>}
          {t.lastError && <span className="text-amber-300" title={t.lastError.message}>⚠ lô lỗi lúc {hhmmss(t.lastError.at)} — sẽ thử lại</span>}
        </>
      )}
    </div>
  );
}

export default CotucScanStatusBar;
