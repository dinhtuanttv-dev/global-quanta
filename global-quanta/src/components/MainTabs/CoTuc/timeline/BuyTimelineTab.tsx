import { useMemo, useState } from 'react';
import { useBuyTimeline } from '../../../../hooks/useBuyTimeline';
import { useBoardQuotes } from '../../../../hooks/useBoardQuotes';
import { useDecisionStates } from '../../../../hooks/useCotucDecision';
import type { TimelineRow } from '../../../../lib/cotuc/buy-timeline';
import { ddmm, ddmmyyyy, fmtOffset, fmtPriceK, fmtRatioPct, weekdayVi } from '../../../../lib/cotuc/format';

/**
 * ⏱ Timeline điểm mua tối ưu — danh sách LIÊN TỤC theo ngày từ hôm nay, gộp chu kỳ cổ tức và mùa vụ KQKD.
 * Dữ liệu: /api/cotuc/buy-timeline (Project A, Gateway quét liên tục). Giá: SSI trực tiếp (REST + SSE).
 * Nguyên tắc: bậc "Đạt kiểm định" và "Gần đạt" luôn tách bạch; không bịa khung giá mua — hiện giá trực tiếp và mức
 * "giá đã chạy trước" (phân vị CAR hiện tại so với các đợt cũ) thay thế. Chuẩn giao diện Siêu Quét AI.
 */
const STATUS = {
  IN_WINDOW: { text: 'ĐANG TRONG VÙNG MUA', cls: 'text-emerald-300 border-emerald-400/50 bg-emerald-400/15 shadow-[0_0_12px_rgba(52,211,153,0.35)]', dot: '#34d399' },
  UPCOMING: { text: 'SẮP TỚI ĐIỂM MUA', cls: 'text-amber-300 border-amber-400/40 bg-amber-400/10', dot: '#fbbf24' },
  PASSED: { text: 'ĐÃ QUA VÙNG MUA', cls: 'text-slate-500 border-white/10 bg-white/[0.03]', dot: '#64748b' },
} as const;

const KIND = {
  DIVIDEND: { text: 'Chu kỳ cổ tức', cls: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10' },
  EARNINGS: { text: 'Mùa vụ KQKD', cls: 'text-violet-300 border-violet-400/30 bg-violet-400/10' },
} as const;

const BASIS: Record<string, string> = {
  CONFIRMED: 'đã xác nhận', ESTIMATED: 'ước tính theo chu kỳ', ANNOUNCED: 'đã công bố',
  HISTORICAL_LAG: 'ước theo độ trễ lịch sử', DEADLINE_ONLY: 'theo hạn pháp lý',
};

const LEVEL_TEXT = { FAVORABLE: 'Thuận lợi', WATCH: 'Quan sát', AVOID: 'Chưa nên' } as const;
const LEVEL_CLS = { FAVORABLE: 'text-emerald-300', WATCH: 'text-amber-300', AVOID: 'text-slate-400' } as const;

type KindFilter = 'ALL' | 'DIVIDEND' | 'EARNINGS';
const CELL = '@3xl:px-2 @3xl:py-1.5 @3xl:border-b @3xl:border-white/5 align-top';

function Pill({ children, cls, title }: { children: React.ReactNode; cls: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

function groupOf(r: TimelineRow, today: string) {
  if (r.status === 'IN_WINDOW') return { key: '0', label: 'Đang trong vùng mua', sub: `hôm nay ${weekdayVi(today)} ${ddmmyyyy(today)}` };
  if (r.status === 'PASSED') return { key: '9', label: 'Vừa qua vùng mua', sub: 'còn trong thời gian nắm giữ' };
  return { key: `1${r.entryFromDate}`, label: `${weekdayVi(r.entryFromDate)} ${ddmmyyyy(r.entryFromDate)}`, sub: `bắt đầu vùng mua · còn ${r.sessionsToEntry} phiên` };
}

export function BuyTimelineTab({ onSelectTicker, className }: { onSelectTicker?: (ticker: string) => void; className?: string }) {
  const { data, loading, error } = useBuyTimeline();
  const decisions = useDecisionStates();
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [showNear, setShowNear] = useState(true);
  const [showPassed, setShowPassed] = useState(false);
  const [q, setQ] = useState('');

  const rows = useMemo(() => (data?.rows ?? []).filter((r) =>
    (kind === 'ALL' || r.kind === kind) && (showNear || r.tier === 'VALIDATED') && (showPassed || r.status !== 'PASSED')
    && (!q || r.ticker.includes(q.trim().toUpperCase()))), [data, kind, showNear, showPassed, q]);

  const symbols = useMemo(() => [...new Set(rows.map((r) => r.ticker))], [rows]);
  const board = useBoardQuotes(symbols, { flushMs: 1000 });

  const groups = useMemo(() => {
    const today = data?.today ?? '';
    const m = new Map<string, { label: string; sub: string; rows: TimelineRow[] }>();
    for (const r of rows) {
      const g = groupOf(r, today);
      const cur = m.get(g.key) ?? { label: g.label, sub: g.sub, rows: [] };
      cur.rows.push(r);
      m.set(g.key, cur);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [rows, data]);

  const c = data?.counts;
  return (
    <section className={`tw-scope @container rounded-xl p-4 space-y-3 ${className ?? ''}`} aria-label="Timeline điểm mua tối ưu"
      style={{ background: 'rgba(13,17,26,0.75)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-cyan-400">⏱ Timeline điểm mua tối ưu</h3>
          <p className="text-[10.5px] text-slate-500">Vùng mua có cơ sở thống kê theo ngày — chu kỳ cổ tức (quanh GDKHQ) và mùa vụ KQKD (quanh ngày công bố).</p>
        </div>
        {c && (
          <div className="flex flex-wrap gap-1.5" data-testid="timeline-counts">
            <Pill cls={STATUS.IN_WINDOW.cls}>● {c.inWindow} đang trong vùng</Pill>
            <Pill cls={STATUS.UPCOMING.cls}>{c.upcoming} sắp tới</Pill>
            <Pill cls="text-emerald-300 border-emerald-400/25 bg-transparent">{c.validated} đạt kiểm định</Pill>
            <Pill cls="text-slate-300 border-white/10 bg-transparent">{c.near} gần đạt</Pill>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
        <div className="flex rounded-lg border border-white/10 overflow-hidden" role="tablist" aria-label="Loại tín hiệu">
          {(['ALL', 'DIVIDEND', 'EARNINGS'] as KindFilter[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={`px-2.5 py-1 font-semibold transition-colors ${kind === k ? 'bg-cyan-400/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>
              {k === 'ALL' ? 'Tất cả' : KIND[k].text}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showNear} onChange={(e) => setShowNear(e.target.checked)} className="accent-cyan-400" /> Hiện “gần đạt”
        </label>
        <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showPassed} onChange={(e) => setShowPassed(e.target.checked)} className="accent-cyan-400" /> Hiện “đã qua vùng mua”
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc mã…" aria-label="Lọc theo mã"
          className="ml-auto w-28 rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/50" />
      </div>

      {loading && !data && <p role="status" className="text-[10.5px] text-slate-500">Đang tải timeline…</p>}
      {error && !data && <p role="alert" className="text-[10.5px] text-rose-300">Không tải được timeline: {error}</p>}
      {data && rows.length === 0 && (
        <p data-testid="timeline-empty" className="text-[10.5px] text-slate-400">
          Không có vùng mua nào khớp bộ lọc.{showNear ? '' : ' Bật “gần đạt” để xem các mã sắp đủ bằng chứng.'}
        </p>
      )}

      {rows.length > 0 && (
        // Bảng có header dính khi cuộn; container hẹp (< 768px) chuyển mỗi dòng thành thẻ.
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-white/5">
          <table className="w-full text-[11px] border-separate border-spacing-0">
            <thead className="hidden @3xl:table-header-group">
              <tr className="text-[9.5px] uppercase tracking-wider text-slate-500">
                {['Mã · Ngành', 'Tín hiệu', 'Vùng mua', 'Xác suất lịch sử', 'Kỳ vọng ròng', 'Giá trực tiếp', 'Trạng thái'].map((h, i) => (
                  <th key={h} className={`sticky top-0 z-10 bg-[#0b0f17] px-2 py-1.5 font-semibold border-b border-white/10 ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.label}>
                <tr className="block @3xl:table-row">
                  <td colSpan={7} className="block @3xl:table-cell @3xl:sticky @3xl:top-[27px] z-[5] bg-[#0b0f17]/95 px-2 py-1 border-b border-white/5">
                    <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-200">{g.label}</span>
                    <span className="ml-2 text-[10px] text-slate-500">{g.sub} · {g.rows.length} mã</span>
                  </td>
                </tr>
                {g.rows.map((r) => {
                  const st = STATUS[r.status];
                  const qd = board.quotes[r.ticker];
                  const ds = r.kind === 'DIVIDEND' ? decisions.byTicker.get(r.ticker) : undefined;
                  const rtf = ds?.entryPlan.runTooFar.percentile ?? null;
                  return (
                    <tr key={r.id} data-testid="timeline-row" data-status={r.status} data-tier={r.tier}
                      className={`transition-colors hover:bg-cyan-400/[0.05] ${r.status === 'PASSED' ? 'opacity-55' : ''} grid grid-cols-2 gap-x-3 gap-y-1 border-b border-white/5 px-2 py-2 @3xl:table-row @3xl:p-0`}>
                      <td className={CELL}>
                        <button type="button" onClick={() => onSelectTicker?.(r.ticker)} className="font-mono text-[12.5px] font-semibold text-cyan-200 hover:text-cyan-100 hover:underline">{r.ticker}</button>
                        <span className="block text-[10px] text-slate-500 truncate max-w-[9rem]">{r.sector ?? '—'}</span>
                      </td>
                      <td className={`${CELL} col-span-2 @3xl:col-auto order-last @3xl:order-none`}>
                        <div className="flex flex-wrap items-center gap-1">
                          <Pill cls={KIND[r.kind].cls}>{KIND[r.kind].text}</Pill>
                          {r.tier === 'VALIDATED'
                            ? <Pill cls="text-emerald-300 border-emerald-400/30 bg-emerald-400/10" title="Qua cổng thống kê: ≥ 8 đợt, q-value FDR, cận dưới lợi nhuận ròng > 0, kiểm tra ngoài mẫu">✓ Đạt kiểm định</Pill>
                            : <Pill cls="text-slate-300 border-white/15 bg-white/[0.03]" title={r.missing.join('; ')}>Gần đạt</Pill>}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-slate-300">{r.windowLabel}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.eventLabel} <span className="font-mono tabular-nums text-slate-300">{ddmm(r.eventDate)}</span> · {BASIS[r.eventDateBasis] ?? r.eventDateBasis}
                        </div>
                        {r.tier === 'NEAR' && r.missing.length > 0 && <div className="text-[10px] text-amber-300/80">Còn thiếu: {r.missing.join('; ')}</div>}
                      </td>
                      <td className={CELL}>
                        <div className="font-mono tabular-nums text-[12px] font-semibold text-slate-100">{ddmm(r.entryFromDate)} → {ddmm(r.entryToDate)}</div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-500">{fmtOffset(r.entryFrom)}…{fmtOffset(r.entryTo)} · thoát {ddmm(r.exitDate)}</div>
                      </td>
                      <td className={`${CELL} @3xl:text-right`}>
                        <div className="font-mono tabular-nums text-[12px] font-semibold text-amber-300">Thắng {Math.round(r.winRate * 100)}%</div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-500">{r.nEvents} đợt{r.probability !== null ? ` · xác suất ${Math.round(r.probability * 100)}%` : ''}</div>
                      </td>
                      <td className={`${CELL} @3xl:text-right`}>
                        <div className={`font-mono tabular-nums text-[12px] font-semibold ${r.netExpectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtRatioPct(r.netExpectancy, { signed: true })}</div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-500" title="Cận dưới khoảng tin cậy 90% (bootstrap) của lợi nhuận ròng sau phí/thuế">cận dưới {fmtRatioPct(r.netExpectancyLcb, { signed: true })}</div>
                      </td>
                      <td className={`${CELL} @3xl:text-right`}>
                        <div className="font-mono tabular-nums text-[12px] text-slate-100">{fmtPriceK(qd?.price)}</div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-500">
                          {typeof qd?.changePct === 'number' && <span className={qd.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{qd.changePct >= 0 ? '+' : '−'}{Math.abs(qd.changePct).toFixed(2)}%</span>}
                          {rtf !== null && <span className={`ml-1 ${rtf >= 0.7 ? 'text-rose-300' : ''}`} title="Giá đã chạy trước: phân vị CAR hiện tại so với các đợt cũ tại cùng thời điểm">· chạy trước p{Math.round(rtf * 100)}</span>}
                        </div>
                      </td>
                      <td className={CELL}>
                        <Pill cls={st.cls}>
                          <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${r.status === 'IN_WINDOW' ? 'animate-pulse' : ''}`} style={{ background: st.dot }} />
                          {st.text}
                        </Pill>
                        {r.decisionLevel && r.status !== 'PASSED' && (
                          <div className="mt-0.5 text-[10px] text-slate-500">Quyết định: <span className={LEVEL_CLS[r.decisionLevel]}>{LEVEL_TEXT[r.decisionLevel]}</span></div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {data && (
        <p className="text-[10px] text-slate-500 border-t border-white/5 pt-2">
          Phủ {data.coverage.decisions}/{data.coverage.universe} mã chu kỳ cổ tức · {data.coverage.seasonality} mã mùa vụ KQKD.
          Ngày vùng mua tính theo phiên giao dịch (lịch nghỉ tự tính). Không có khung giá mua vì chưa có mô hình giá đã kiểm định.
          “Gần đạt” chưa qua cổng thống kê — chỉ để theo dõi. Thông tin định lượng tham khảo, không phải khuyến nghị đầu tư.
        </p>
      )}
    </section>
  );
}

export default BuyTimelineTab;
