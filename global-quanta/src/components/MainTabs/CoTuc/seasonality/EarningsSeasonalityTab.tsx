import { useMemo, useState, type CSSProperties } from 'react';
import type { BacktestWindow, EarningsCycleStatsV3, Quarter, QuarterSeasonality } from '../../../../lib/cotuc/timing-types';
import { useAnnualEarningsCalendar, useEarningsCyclePaths, useEarningsCycleStats } from '../../../../hooks/useEarningsSeasonality';
import { useEarningsSignalsBulk } from '../../../../hooks/useCotucSeasonalBulk';
import { elapsedDaysSinceQuarterEnd } from '../../../../lib/cotuc/annual-timeline.utils';
import { quarterOfLabel } from '../../../../lib/cotuc/seasonal-bulk';
import { CycleTimeline } from '../CycleTimeline';
import { AnnualCycleTimeline } from './AnnualCycleTimeline';
import { QuarterlySeasonalityPanel, type QuarterCardData } from './QuarterlySeasonalityPanel';

/**
 * Tab "📊 Mùa vụ KQKD" (giai đoạn 3 gói cotuc-timing-engine) — port EarningsSeasonalityTab của gói, giữ nguyên dữ liệu và
 * logic (3 hook useAnnualEarningsCalendar / useEarningsCycleStats / useEarningsCyclePaths, AnnualCycleTimeline, CycleTimeline
 * quanh ngày công bố), trình bày theo chuẩn tab Siêu Quét AI: thẻ tối bo góc, tiêu đề cyan, số font-mono tabular, hổ phách =
 * cửa sổ được chọn, xanh/đỏ = lãi/lỗ, tím = AI/thống kê. Bổ sung: dải "kỳ KQKD tới" (EarningsSignal toàn danh mục) và bảng
 * 4 cửa sổ giao dịch của quý đang xem (lý do đạt / chưa đạt minh bạch).
 */
const QUARTERS: Quarter[] = [1, 2, 3, 4];
export const SEASONALITY_THEME: CSSProperties = {
  // Bảng màu Siêu Quét: Q1 cyan-400 · Q2 emerald-400 · Q3 amber-400 · Q4 violet-400
  ['--ct-q1' as string]: '#22d3ee', ['--ct-q2' as string]: '#34d399', ['--ct-q3' as string]: '#fbbf24', ['--ct-q4' as string]: '#a78bfa',
  ['--ct-grid' as string]: 'rgba(255,255,255,0.08)', ['--ct-muted' as string]: '#64748b', ['--ct-fg' as string]: '#e2e8f0', ['--ct-today' as string]: '#fb7185',
};
export const CARD: CSSProperties = { background: 'rgba(13,17,26,0.75)', border: '1px solid rgba(255,255,255,0.06)' };
const QCOLOR: Record<Quarter, string> = { 1: '#22d3ee', 2: '#34d399', 3: '#fbbf24', 4: '#a78bfa' };

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`);
const pct0 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Verdict = { text: string; cls: string };
function verdictOf(w: BacktestWindow, selectedId: string | null, minEvents = 8): Verdict {
  if (w.id === selectedId) return { text: '✓ ĐẠT', cls: 'text-amber-300 border-amber-500/50 bg-amber-500/10' };
  if (w.nEvents < minEvents && (w.fdrQValue <= 0.2 || w.netExpectancyLcb > 0)) return { text: `THEO DÕI · ${w.nEvents}/${minEvents} kỳ`, cls: 'text-violet-200 border-violet-500/40 bg-violet-500/10' };
  if (w.nEvents < minEvents) return { text: `CHƯA ĐỦ MẪU · ${w.nEvents}/${minEvents}`, cls: 'text-slate-400 border-white/10' };
  return { text: 'KHÔNG CÓ LỢI THẾ', cls: 'text-slate-500 border-white/10' };
}

function QuarterTile({ q, stats, active, upcoming, onClick }: { q: QuarterSeasonality | null; stats: EarningsCycleStatsV3 | null; active: boolean; upcoming: boolean; quarter: Quarter; onClick: () => void }) {
  const quarter = q?.quarter ?? stats?.quarter;
  const rp = stats?.reactionProbability ?? q?.reactionProbability ?? null;
  const sel = stats?.windows.find((w) => w.id === stats.selectedWindowId) ?? null;
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-lg px-2.5 py-2 border transition-colors ${active ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold" style={{ color: quarter ? QCOLOR[quarter as Quarter] : undefined }}>Q{quarter}{upcoming && <span className="ml-1 text-[9px] font-normal text-cyan-300">· kỳ tới</span>}</span>
        <span className="font-mono tabular-nums text-[10px] text-slate-400">{q ? `Th${q.typicalAnnounceMonth}${q.announceMonthStd > 0.03 ? ` ±${q.announceMonthStd.toFixed(1)}` : ''}` : '—'}</span>
      </div>
      <div className="mt-1 text-[10px] text-slate-500">P(phản ứng +)</div>
      <div className="font-mono tabular-nums text-[13px] font-semibold" style={{ color: rp ? (rp.mean >= 0.5 ? '#34d399' : '#fb7185') : '#64748b' }}>
        {rp ? pct0(rp.mean) : '—'}
        {rp ? <span className="ml-1 text-[9.5px] font-normal text-slate-500">[{pct0(rp.ci[0])}–{pct0(rp.ci[1])}]</span>
          : <span className="ml-1.5 font-sans text-[9.5px] font-normal text-slate-500">chưa đủ bằng chứng</span>}
      </div>
      <div className="text-[9.5px] text-slate-500 truncate">{sel ? `${sel.label} · ${pct(sel.netExpectancy)}` : `${q?.nEvents ?? stats?.windows[0]?.nEvents ?? 0} kỳ lịch sử`}</div>
    </button>
  );
}

function WindowsTable({ stats }: { stats: EarningsCycleStatsV3 }) {
  return (
    <table className="w-full text-[10.5px]">
      <thead>
        <tr className="text-slate-500 text-[9.5px]">
          <th className="text-left font-normal py-1">Cửa sổ (ngày GD quanh công bố)</th>
          <th className="text-right font-normal">Số kỳ</th>
          <th className="text-right font-normal" title="Lợi nhuận vượt VN-Index trung bình sau phí, thuế">Ròng TB</th>
          <th className="text-right font-normal" title="Cận dưới khoảng tin cậy 90% (bootstrap)">Cận dưới 90%</th>
          <th className="text-right font-normal">Thắng</th>
          <th className="text-right font-normal" title="Kiểm định đa so sánh Benjamini–Hochberg trên 4 quý × 4 cửa sổ">q (FDR)</th>
          <th className="text-right font-normal">Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        {stats.windows.map((w) => {
          const v = verdictOf(w, stats.selectedWindowId);
          const isSel = w.id === stats.selectedWindowId;
          return (
            <tr key={w.id} className={`border-t border-white/5 ${isSel ? 'bg-amber-500/[0.06]' : ''}`}>
              <td className="py-1 pr-2">
                <div className={isSel ? 'text-amber-300 font-medium' : 'text-slate-200'}>{w.label}</div>
                <div className="font-mono tabular-nums text-[9.5px] text-slate-500">vào [{w.entryFrom}, {w.entryTo}] → thoát {w.exitOffset >= 0 ? `+${w.exitOffset}` : w.exitOffset}</div>
              </td>
              <td className="text-right font-mono tabular-nums text-slate-300">{w.nEvents}</td>
              <td className="text-right font-mono tabular-nums" style={{ color: w.netExpectancy >= 0 ? '#34d399' : '#fb7185' }}>{pct(w.netExpectancy)}</td>
              <td className="text-right font-mono tabular-nums" style={{ color: w.netExpectancyLcb > 0 ? '#34d399' : '#94a3b8' }}>{pct(w.netExpectancyLcb)}</td>
              <td className="text-right font-mono tabular-nums text-slate-300">{pct0(w.winRate)}</td>
              <td className="text-right font-mono tabular-nums" style={{ color: w.fdrQValue <= 0.1 ? '#fbbf24' : '#94a3b8' }}>{w.fdrQValue.toFixed(2)}</td>
              <td className="text-right"><span className={`inline-block px-1.5 py-px rounded border text-[9px] font-semibold whitespace-nowrap ${v.cls}`}>{v.text}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuarterDetail({ ticker, quarter }: { ticker: string; quarter: Quarter }) {
  const stats = useEarningsCycleStats(ticker, quarter);
  if (stats.status === 'loading') return <div role="status" className="text-[10.5px] text-slate-500 py-2">Đang tải thống kê Q{quarter}…</div>;
  if (stats.status === 'error') return <div role="alert" className="text-[10.5px] text-rose-300 py-2">Không tải được Q{quarter}: {stats.error?.message}</div>;
  if (!stats.data) return <div className="text-[10.5px] text-slate-500 py-2">Chưa có dữ liệu Q{quarter} cho mã này.</div>;
  return <WindowsTable stats={stats.data} />;
}

/** Biểu đồ CAR quanh ngày công bố của một quý (CycleTimeline nguyên bản, nhãn mốc 0 = "Công bố", ẩn bảng trùng). */
function QuarterCar({ ticker, quarter, todayOffset }: { ticker: string; quarter: Quarter; todayOffset: number | null }) {
  const stats = useEarningsCycleStats(ticker, quarter);
  const paths = useEarningsCyclePaths(ticker, quarter);
  return (
    <div className="rounded-lg p-2 h-full [&_p]:!text-[10.5px] [&_p]:!leading-snug [&_label]:!text-[10.5px] [&_label]:text-slate-400" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="text-[9.5px] text-slate-500 mb-1">CAR quanh ngày công bố <span style={{ color: QCOLOR[quarter] }}>Q{quarter}</span> — lợi nhuận vượt VN-Index tích luỹ, ngày 0 = phiên đầu tiên sau công bố</div>
      {stats.data ? <CycleTimeline stats={stats.data} paths={paths.data} todayOffset={todayOffset} eventLabel="công bố" hideWindowTable />
        : <div className="text-[10.5px] text-slate-500 py-4">{stats.status === 'loading' ? 'Đang tải…' : 'Chưa có dữ liệu.'}</div>}
    </div>
  );
}

/** Lưới 4 quý (QuarterlySeasonalityPanel của gói) — nối hook cho từng quý. */
function QuarterGrid({ ticker, offsets }: { ticker: string; offsets: Record<Quarter, number | null> }) {
  const s = { 1: useEarningsCycleStats(ticker, 1), 2: useEarningsCycleStats(ticker, 2), 3: useEarningsCycleStats(ticker, 3), 4: useEarningsCycleStats(ticker, 4) };
  const p = { 1: useEarningsCyclePaths(ticker, 1), 2: useEarningsCyclePaths(ticker, 2), 3: useEarningsCyclePaths(ticker, 3), 4: useEarningsCyclePaths(ticker, 4) };
  const cards: QuarterCardData[] = QUARTERS.map((q) => ({
    quarter: q, stats: s[q].data, paths: p[q].data, todayOffset: offsets[q],
    loading: s[q].status === 'loading', errorMessage: s[q].status === 'error' ? s[q].error?.message ?? 'Lỗi không xác định' : null,
  }));
  return <QuarterlySeasonalityPanel cards={cards} />;
}

export interface EarningsSeasonalityTabProps {
  ticker: string;
  /** Ngày hiện tại (ISO) — để test được; bỏ trống ⇒ đồng hồ hệ thống. */
  today?: string;
  className?: string;
  /** Hiện biểu đồ CAR của quý đang xem (mặc định có). */
  showTimeline?: boolean;
}

export function EarningsSeasonalityTab({ ticker, today, className, showTimeline = true }: EarningsSeasonalityTabProps) {
  const calendar = useAnnualEarningsCalendar(ticker);
  const { byTicker } = useEarningsSignalsBulk();
  const signal = byTicker.get(ticker) ?? null;
  const upcomingQ = quarterOfLabel(signal?.quarterLabel);
  const todayIso = useMemo(() => today ?? new Date().toISOString().slice(0, 10), [today]);
  const [picked, setPicked] = useState<Quarter | null>(null);
  const [grid, setGrid] = useState(false);
  const active: Quarter = picked ?? upcomingQ ?? 1;

  // Vị trí "hôm nay" trên timeline CAR từng quý (như gói): ngày lịch còn lại tới ngày công bố khả dĩ nhất × 5/7.
  const offsets = useMemo(() => {
    const out = {} as Record<Quarter, number | null>;
    for (const q of QUARTERS) {
      const model = calendar.data?.quarters.find((x) => x.quarter === q)?.announceModel;
      const elapsed = elapsedDaysSinceQuarterEnd(todayIso, q);
      out[q] = model && elapsed !== null ? Math.round((elapsed - model.mu) * (5 / 7)) : null;
    }
    return out;
  }, [calendar.data, todayIso]);
  const statsByQ = {
    1: useEarningsCycleStats(ticker, 1).data, 2: useEarningsCycleStats(ticker, 2).data,
    3: useEarningsCycleStats(ticker, 3).data, 4: useEarningsCycleStats(ticker, 4).data,
  } as Record<Quarter, EarningsCycleStatsV3 | null>;

  return (
    <section className={`tw-scope @container rounded-xl p-4 space-y-3 ${className ?? ''}`} style={{ ...CARD, ...SEASONALITY_THEME }} aria-label={`Mùa vụ KQKD — ${ticker}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-cyan-400">📊 Mùa vụ KQKD · <span className="font-mono">{ticker}</span></h3>
        {signal && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10.5px]">
            <span className="text-slate-500">Kỳ tới <b className="text-slate-100 font-mono">{signal.quarterLabel}</b></span>
            <span className="text-slate-500">dự kiến <b className="text-cyan-200 font-mono tabular-nums">{ddmm(signal.expectedAnnounce.date)}</b>
              {signal.expectedAnnounce.lagStdDays !== null && <span className="text-slate-500"> ±{signal.expectedAnnounce.lagStdDays.toFixed(0)} ngày</span>}
            </span>
            <span className="text-slate-500" title="SUE: mức lợi nhuận kỳ vừa công bố vượt/thấp hơn kỳ vọng (độ lệch chuẩn). Dương lớn -> giá thường trôi tiếp theo hướng tích cực.">
              SUE kỳ trước <b className="font-mono tabular-nums" style={{ color: (signal.sue ?? 0) >= 0 ? '#34d399' : '#fb7185' }}>{signal.sue === null ? '—' : `${signal.sue >= 0 ? '+' : '−'}${Math.abs(signal.sue).toFixed(2)}`}</b>
            </span>
            {signal.profitGrowthYoY !== null && <span className="text-slate-500">LNST YoY <b className="font-mono tabular-nums" style={{ color: signal.profitGrowthYoY >= 0 ? '#34d399' : '#fb7185' }}>{pct(signal.profitGrowthYoY)}</b></span>}
          </div>
        )}
      </div>

      {calendar.status === 'loading' && <p role="status" data-testid="seasonality-loading" className="text-[10.5px] text-slate-500">Đang tải lịch KQKD cả năm…</p>}
      {calendar.status === 'error' && <p role="alert" data-testid="seasonality-error" className="text-[10.5px] text-rose-300">Không tải được lịch KQKD: {calendar.error?.message}</p>}
      {calendar.status === 'empty' && <p data-testid="seasonality-empty" className="text-[10.5px] text-slate-500">Chưa có dữ liệu mùa vụ KQKD cho mã này (mã ngoài danh mục quét hoặc chưa đủ lịch sử).</p>}

      {calendar.status === 'ready' && calendar.data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {QUARTERS.map((q) => (
              <QuarterTile key={q} quarter={q} q={calendar.data!.quarters.find((x) => x.quarter === q) ?? null} stats={statsByQ[q]}
                active={active === q} upcoming={upcomingQ === q} onClick={() => setPicked(q)} />
            ))}
          </div>
          {/* Khối rộng (≥ 1024px, VD sub-tab v3): timeline 12 tháng | CAR quý đang xem cạnh nhau; khối hẹp (StockModal): xếp dọc. */}
          <div className={`grid grid-cols-1 gap-2 ${showTimeline && !grid ? '@5xl:grid-cols-2' : ''}`}>
            <div className="rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <AnnualCycleTimeline calendar={calendar.data} currentMonth={Number(todayIso.slice(5, 7))} currentDay={Number(todayIso.slice(8, 10))} />
            </div>
            {showTimeline && !grid && <QuarterCar ticker={ticker} quarter={active} todayOffset={offsets[active]} />}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400">CỬA SỔ GIAO DỊCH QUANH CÔNG BỐ · <span style={{ color: QCOLOR[active] }}>Q{active}</span></span>
              <span className="inline-flex items-center gap-2">
              <button type="button" onClick={() => setGrid((g) => !g)} aria-pressed={grid}
                className={`text-[10px] px-2 py-0.5 rounded border ${grid ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}>▦ Lưới 4 quý</button>
              <span className="inline-flex rounded border border-white/10 overflow-hidden" role="tablist" aria-label="Chọn quý">
                {QUARTERS.map((q) => (
                  <button key={q} type="button" role="tab" aria-selected={active === q} onClick={() => setPicked(q)}
                    className={`text-[10px] px-2 py-0.5 font-mono ${active === q ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'}`}>Q{q}</button>
                ))}
              </span>
              </span>
            </div>
            <QuarterDetail ticker={ticker} quarter={active} />
            {grid && <div className="mt-2"><QuarterGrid ticker={ticker} offsets={offsets} /></div>}
          </div>
        </>
      )}

      <p className="text-[9.5px] text-slate-500 leading-snug">
        Giá: SSI (điều chỉnh cổ tức sau thuế 5%, thưởng/cổ tức CP) · Ngày công bố &amp; sự kiện quyền: VNDirect. Xác suất là hậu nghiệm Bayes
        (Beta-Binomial, prior cùng ngành × quý × cửa sổ); một cửa sổ chỉ "ĐẠT" khi đủ ≥ 8 kỳ, q-value FDR ≤ 0,1 trên 16 phép thử và cận dưới
        lợi nhuận ròng &gt; 0. Thông tin định lượng tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}

export default EarningsSeasonalityTab;
