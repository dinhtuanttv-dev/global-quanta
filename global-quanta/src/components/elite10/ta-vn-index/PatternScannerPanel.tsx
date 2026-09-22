import type { PatternScannerEntry } from '../../../types/taVnIndex';
import { SourceBadge } from './SourceBadge';
import type { UniverseRankData } from '../../../hooks/elite10/useUniverseRank';

/**
 * Pattern Scanner — 2 fix Giai đoạn 8:
 * 1. Tách "độ khớp hình học" và "tỷ lệ thắng lịch sử" thành 2 số riêng.
 * 2. Hiển thị rõ khi 1 mã bị giảm trọng số do decorrelation theo ngành.
 *
 * MOI (ra soat 2026-09-17, Viec 5): them badge "Top 200 Universe" THAT
 * (thanh khoan + von hoa, TradingView Scanner) - BO SUNG chu KHONG THAY
 * THE phan "do khop hinh hoc" (van la mock, chua co model nhan dien mau
 * hinh that - xem MockDataBanner). 2 khai niem khac nhau hoan toan, khong
 * duoc gop lam mot de tranh gay hieu lam.
 */
export function PatternScannerPanel({ entries, universeRank }: { entries?: PatternScannerEntry[] | null; universeRank?: UniverseRankData | null }) {
  const safeEntries = entries ?? [];
  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">
          PATTERN SCANNER{' '}
          <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
            DECORRELATION NGÀNH
          </span>
        </div>
        {universeRank && (
          universeRank.inTop200 ? (
            <span className="rounded border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300" title={universeRank.note}>
              Top 200 · #{universeRank.rank}/{universeRank.totalUniverseSize}
            </span>
          ) : (
            <span className="text-[9px] text-slate-500" title={universeRank.note}>
              Ngoài Top 200 thanh khoản
            </span>
          )
        )}
      </div>

      <div className="flex flex-col">
        {safeEntries.map((e) => (
          <div key={`${e.ticker}-${e.patternName}`} className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px] last:border-b-0">
            <span>
              {e.ticker} <span className="text-slate-500">·</span> {e.patternName}{' '}
              <span className="text-slate-500">({e.sector})</span>
            </span>
            <span className="text-right">
              <span className="text-slate-300">
                {e.geometricMatchPct?.value !== undefined ? `${e.geometricMatchPct.value.toFixed(0)}% khớp hình học` : '—'}
                {e.geometricMatchPct?.source && <SourceBadge source={e.geometricMatchPct.source} />}
              </span>
              <br />
              <span className="text-slate-500">
                {e.historicalWinRatePct?.value !== undefined
                  ? `Thắng lịch sử ${e.historicalWinRatePct.value.toFixed(0)}%`
                  : 'Chưa đủ mẫu lịch sử'}
              </span>
              {e.isDampened && e.dampenedConfidencePct?.value !== undefined && (
                <>
                  {' '}
                  <span className="text-amber-400">
                    → {e.dampenedConfidencePct.value.toFixed(0)}% sau dampening
                  </span>
                </>
              )}
            </span>
          </div>
        ))}
        {safeEntries.length === 0 && <p className="text-[11px] text-slate-500">Không có mẫu hình nào đủ điều kiện.</p>}
      </div>

      {safeEntries.some((e) => e.isDampened) && (
        <p className="mt-2 text-[10px] text-slate-500">
          Các mã cùng ngành ra mẫu hình gần như cùng lúc được giảm trọng số hiển thị — nghi ngờ đây là 1 chuyển động
          ngành thay vì nhiều xác nhận độc lập.
        </p>
      )}
    </div>
  );
}
