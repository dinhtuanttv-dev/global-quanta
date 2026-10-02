import type { SignalTracking } from '../../../../lib/cotuc/decision';
import { useSignalTracking } from '../../../../hooks/useCotucDecision';
import { CARD } from '../seasonality/EarningsSeasonalityTab';

/**
 * SignalTrackingPanel — "mô hình có còn hoạt động không" (port SignalTrackingPanel của gói, giai đoạn 4).
 * Server ghi MỌI tín hiệu FAVORABLE/WATCH khi mã vào vùng mua và chấm kết quả thật (CAR từ ngày ghi tới ngày thoát)
 * — panel chỉ hiển thị: tỷ lệ đúng, Brier, CUSUM, bản ghi gần nhất. Không tự học lại trọng số (learnSignalWeights TẮT).
 */
const pct0 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const pctS = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Kpi({ label, value, sub, testId, cls = 'text-slate-100' }: { label: string; value: string; sub?: string; testId?: string; cls?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2 bg-white/[0.02] border border-white/5">
      <div className="text-[9.5px] text-slate-500">{label}</div>
      <div data-testid={testId} className={`font-mono tabular-nums text-base font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-[9.5px] text-slate-500 leading-snug">{sub}</div>}
    </div>
  );
}

export function SignalTrackingPanel({ data, className }: { data: SignalTracking; className?: string }) {
  const { summary, recent } = data;
  const { cusum } = summary;
  const brierCls = summary.brierScore === null ? 'text-slate-400' : summary.brierScore < 0.2 ? 'text-emerald-300' : summary.brierScore <= 0.25 ? 'text-amber-300' : 'text-rose-300';
  return (
    <section className={`tw-scope @container rounded-xl p-4 space-y-3 ${className ?? ''}`} style={CARD} aria-label="Theo dõi hiệu quả tín hiệu thực tế">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-cyan-400">◆ Theo dõi tín hiệu thực tế</h3>
        <span className="text-[10px] text-slate-500">Ghi khi vào vùng mua · chấm khi tới ngày thoát · CAR so với VN-Index</span>
      </header>

      {cusum.alarmed && (
        <div data-testid="cusum-alarm" role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
          ⚠ CUSUM báo động: tỷ lệ đúng {cusum.alarmDirection === 'LOW' ? 'THẤP hơn' : 'cao hơn'} xác suất đã báo một cách kéo dài — cân nhắc hạ độ tin cậy của mô hình.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        <Kpi label="Tín hiệu đã phát" value={String(summary.totalSignals)} sub={`đã có kết quả: ${summary.resolvedSignals}`} testId="tracking-total" />
        <Kpi
          label={`Tỷ lệ đúng${summary.rollingWindowSize ? ` (${summary.rollingWindowSize} gần nhất)` : ''}`}
          value={pct0(summary.rollingAccuracy)}
          sub={summary.meanPredicted !== null ? `xác suất đã báo TB ${pct0(summary.meanPredicted)}` : undefined}
          testId="tracking-accuracy"
          cls={summary.rollingAccuracy === null ? 'text-slate-400' : 'text-amber-300'}
        />
        <Kpi label="Brier score" value={summary.brierScore === null ? '—' : summary.brierScore.toFixed(3)} sub="0 = hoàn hảo · 0.25 = đoán mù" testId="tracking-brier" cls={brierCls} />
        <Kpi
          label="CUSUM (giám sát suy giảm)"
          value={cusum.n === 0 ? '—' : cusum.alarmed ? 'Báo động' : 'Bình thường'}
          sub={cusum.n === 0 ? 'chưa có kết quả' : `S− ${cusum.negSum.toFixed(2)} · S+ ${cusum.posSum.toFixed(2)} · ngưỡng 5`}
          cls={cusum.alarmed ? 'text-rose-300' : cusum.n === 0 ? 'text-slate-400' : 'text-emerald-300'}
        />
      </div>

      {summary.resolvedSignals === 0 && (
        <p data-testid="tracking-empty" className="text-[10.5px] text-slate-400">
          Chưa có tín hiệu nào có kết quả. Sổ theo dõi bắt đầu ghi từ 10/2026; cần vài quý dữ liệu thực tế (≥ 30 tín hiệu) mới đánh giá được độ tin cậy —
          trước đó hệ thống KHÔNG tự hiệu chỉnh hay học lại trọng số.
        </p>
      )}

      {recent.length > 0 && (
        <table data-testid="tracking-table" className="w-full text-[10.5px]">
          <thead>
            <tr className="text-slate-500 text-[9.5px]">
              <th className="text-left font-normal">Mã</th><th className="text-left font-normal">Trạng thái</th>
              <th className="text-right font-normal">Xác suất</th><th className="text-right font-normal">Vào → Thoát</th>
              <th className="text-right font-normal">CAR thực</th><th className="text-right font-normal">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {recent.slice(0, 12).map((r) => (
              <tr key={r.id} data-testid="tracking-row" className="border-t border-white/5">
                <td className="py-1 font-mono font-semibold text-cyan-200">{r.ticker}</td>
                <td className={r.level === 'FAVORABLE' ? 'text-emerald-300' : 'text-amber-300'}>{r.level === 'FAVORABLE' ? 'Thuận lợi' : 'Quan sát'}</td>
                <td className="text-right font-mono tabular-nums text-slate-300">{pct0(r.predictedProbability)}</td>
                <td className="text-right font-mono tabular-nums text-slate-400">{ddmm(r.entryDate)} → {ddmm(r.exitDate ?? r.plannedExitDate)}</td>
                <td className="text-right font-mono tabular-nums" style={{ color: r.realizedCar === null ? '#64748b' : r.realizedCar >= 0 ? '#34d399' : '#fb7185' }}>{pctS(r.realizedCar)}</td>
                <td className="text-right">
                  {r.outcome === null ? <span className="text-slate-500">đang chờ</span> : r.outcome === 1 ? <span className="text-emerald-400">✔ đúng</span> : <span className="text-rose-400">✖ sai</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Bản đã nối dữ liệu (/api/cotuc/signal-tracking). */
export function SignalTrackingCard({ className }: { className?: string }) {
  const { data, loading, error } = useSignalTracking();
  if (data) return <SignalTrackingPanel data={data} className={className} />;
  return (
    <section className={`tw-scope rounded-xl p-4 ${className ?? ''}`} style={CARD} aria-label="Theo dõi hiệu quả tín hiệu thực tế">
      <h3 className="text-sm font-semibold text-cyan-400">◆ Theo dõi tín hiệu thực tế</h3>
      <p role={error ? 'alert' : 'status'} className={`mt-1 text-[10.5px] ${error ? 'text-rose-300' : 'text-slate-500'}`}>
        {loading ? 'Đang tải…' : error ? `Không tải được: ${error}` : 'Chưa có dữ liệu theo dõi.'}
      </p>
    </section>
  );
}

export default SignalTrackingPanel;
