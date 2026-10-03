import { useMemo, useState } from 'react';
import { useDecisionStates } from '../../../../hooks/useCotucDecision';
import type { DecisionSnapshot } from '../../../../lib/cotuc/decision';
import { ddmm, fmtOffset, fmtRatioPct } from '../../../../lib/cotuc/format';

/**
 * 🎯 Xếp hạng xác suất (v3) — toàn danh mục ~300 mã từ bộ máy quyết định (thay bảng v2 chỉ 17 mã, engine cũ).
 * Thứ tự: Thuận lợi > Quan sát > Chưa nên, rồi xác suất tổng hợp, rồi cận dưới kỳ vọng ròng. Chuẩn Siêu Quét AI.
 */
const LEVEL_ORDER = { FAVORABLE: 0, WATCH: 1, AVOID: 2 } as const;
const LEVEL = {
  FAVORABLE: { text: 'Thuận lợi', cls: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' },
  WATCH: { text: 'Quan sát', cls: 'text-amber-300 border-amber-400/40 bg-amber-400/10' },
  AVOID: { text: 'Chưa nên', cls: 'text-slate-500 border-white/10 bg-white/[0.02]' },
} as const;
const ACTION: Record<DecisionSnapshot['recommendation']['action'], string> = {
  NO_DATE: 'Chưa có lịch', POST_EX: 'Đã qua GDKHQ', NO_SIGNAL: 'Chưa đủ mẫu', TOO_EARLY: 'Chờ vùng mua', IN_WINDOW: 'Trong vùng mua', WINDOW_PASSED: 'Đã qua vùng',
};

export function rankDecisions(states: DecisionSnapshot[]): DecisionSnapshot[] {
  return [...states].sort((a, b) =>
    LEVEL_ORDER[a.decision.level] - LEVEL_ORDER[b.decision.level]
    || b.decision.combinedProbability - a.decision.combinedProbability
    || (b.recommendation.expectedNetReturn ?? -1) - (a.recommendation.expectedNetReturn ?? -1)
    || a.ticker.localeCompare(b.ticker));
}

const TH = 'sticky top-0 z-10 bg-[#0b0f17] px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 border-b border-white/10 whitespace-nowrap';
const TD = 'px-2 py-1.5 border-b border-white/[0.05] align-middle';

export function DecisionRanking({ onSelectTicker }: { onSelectTicker?: (t: string) => void }) {
  const { states, asOf, loading, error } = useDecisionStates();
  const [onlyActionable, setOnlyActionable] = useState(true);
  const ranked = useMemo(() => rankDecisions(states).filter((s) => !onlyActionable || s.recommendation.window !== null), [states, onlyActionable]);
  return (
    <section className="tw-scope rounded-xl p-4 space-y-3" aria-label="Xếp hạng xác suất toàn danh mục"
      style={{ background: 'rgba(13,17,26,0.75)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-cyan-400">🎯 Xếp hạng xác suất — toàn danh mục</h3>
          <p className="text-[10.5px] text-slate-500">
            Từ bộ máy quyết định (chu kỳ cổ tức + mùa vụ KQKD + thị trường + thanh khoản) · {states.length} mã đã quét
            {asOf ? ` · cập nhật ${new Date(asOf).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <label className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-400 cursor-pointer">
          <input type="checkbox" checked={onlyActionable} onChange={(e) => setOnlyActionable(e.target.checked)} className="accent-cyan-400" />
          Chỉ mã có cửa sổ đã kiểm định
        </label>
      </header>
      {loading && !states.length && <p role="status" className="text-[10.5px] text-slate-500">Đang tải…</p>}
      {error && !states.length && <p role="alert" className="text-[10.5px] text-rose-300">Không tải được: {error}</p>}
      {!loading && ranked.length === 0 && (
        <p data-testid="ranking-empty" className="text-[10.5px] text-slate-400">
          Chưa có mã nào có cửa sổ cổ tức qua kiểm định trong lượt quét hiện tại. Bỏ chọn ô trên để xem toàn bộ, hoặc xem Timeline (bậc “gần đạt”).
        </p>
      )}
      {ranked.length > 0 && (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-white/5">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr>
                {['#', 'Mã', 'Trạng thái', 'Xác suất', 'Hành động', 'Cửa sổ', 'GDKHQ', 'Kỳ vọng ròng', 'Thanh khoản 20p'].map((h, i) => (
                  <th key={h} className={`${TH} ${i === 3 || i >= 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s.ticker} data-testid="ranking-row" className="cursor-pointer hover:bg-cyan-400/[0.05]" onClick={() => onSelectTicker?.(s.ticker)}>
                  <td className={`${TD} font-mono tabular-nums text-slate-500`}>{i + 1}</td>
                  <td className={`${TD} font-mono font-semibold text-cyan-200`}>{s.ticker}</td>
                  <td className={TD}><span className={`rounded-md border px-1.5 py-[1px] text-[9.5px] font-semibold ${LEVEL[s.decision.level].cls}`}>{LEVEL[s.decision.level].text}</span></td>
                  <td className={`${TD} text-right font-mono tabular-nums font-semibold text-amber-300`}>{Math.round(s.decision.combinedProbability * 100)}%</td>
                  <td className={`${TD} text-slate-300`}>{ACTION[s.recommendation.action]}</td>
                  <td className={`${TD} font-mono tabular-nums text-slate-400`}>{s.recommendation.window ? `${s.recommendation.window.id.toUpperCase()} ${fmtOffset(s.recommendation.window.entryFrom)}…${fmtOffset(s.recommendation.window.entryTo)}` : '—'}</td>
                  <td className={`${TD} font-mono tabular-nums ${s.exDate?.status === 'CONFIRMED' ? 'text-emerald-300' : 'text-slate-400'}`} title={s.exDate?.label}>
                    {s.exDate ? `${ddmm(s.exDate.value)}${s.exDate.status === 'CONFIRMED' ? '' : ' (ước)'}` : '—'}
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums ${(s.recommendation.expectedNetReturn ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtRatioPct(s.recommendation.expectedNetReturn, { signed: true })}</td>
                  <td className={`${TD} text-right font-mono tabular-nums text-slate-400`}>{s.liquidity.avgValue20 != null ? `${(s.liquidity.avgValue20 / 1e9).toFixed(1)} tỷ` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default DecisionRanking;
