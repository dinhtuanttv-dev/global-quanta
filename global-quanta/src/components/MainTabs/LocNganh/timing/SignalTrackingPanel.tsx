// Port từ locnganh-timing-engine (ui/decision/SignalTrackingPanel.tsx).
import type { CusumState } from '../../../../lib/locnganh/signal-tracking-log';

/**
 * SignalTrackingPanel — "mô hình có còn hoạt động không". Nhận một tóm tắt đã tính sẵn từ
 * TrackingStore (rollingAccuracy, brierScoreFromStore, store.cusum) chứ không nhận thẳng store,
 * để component thuần và test được không cần dựng dữ liệu lịch sử đầy đủ.
 */
export interface TrackingSummary {
  totalSignals: number;
  resolvedSignals: number;
  /** null nếu chưa có tín hiệu nào có kết quả. */
  rollingAccuracy: number | null;
  rollingWindowSize?: number;
  brierScore: number | null;
  cusum: CusumState;
}

function pct(v: number | null): string {
  return v === null ? 'N/A' : `${Math.round(v * 100)}%`;
}

export function SignalTrackingPanel({ summary, className }: { summary: TrackingSummary; className?: string }) {
  const { totalSignals, resolvedSignals, rollingAccuracy, rollingWindowSize, brierScore, cusum } = summary;
  return (
    <section className={className} aria-label="Theo dõi hiệu quả tín hiệu thực tế">
      <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Theo dõi thực tế</h4>

      {cusum.alarmed && (
        <div
          data-testid="cusum-alarm"
          role="alert"
          style={{ background: 'var(--ct-today, #d6336c)', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 12, marginBottom: 8 }}
        >
          ⚠ Phát hiện lợi thế {cusum.alarmDirection === 'LOW' ? 'SUY GIẢM' : 'thay đổi bất thường'} kéo dài — cân nhắc hạ độ tin cậy của mô hình.
        </div>
      )}

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 12, margin: 0 }}>
        <dt style={{ color: 'var(--ct-muted, #5d6b78)' }}>Tín hiệu đã phát</dt>
        <dd data-testid="tracking-total" style={{ margin: 0 }}>
          {totalSignals} (đã có kết quả: {resolvedSignals})
        </dd>

        <dt style={{ color: 'var(--ct-muted, #5d6b78)' }}>Tỷ lệ đúng{rollingWindowSize ? ` (${rollingWindowSize} gần nhất)` : ''}</dt>
        <dd data-testid="tracking-accuracy" style={{ margin: 0 }}>
          {pct(rollingAccuracy)}
        </dd>

        <dt style={{ color: 'var(--ct-muted, #5d6b78)' }}>Brier score</dt>
        <dd data-testid="tracking-brier" style={{ margin: 0 }}>
          {brierScore === null ? 'N/A' : brierScore.toFixed(3)} <span style={{ color: 'var(--ct-muted, #5d6b78)' }}>(0 = hoàn hảo, 0,25 = đoán mù)</span>
        </dd>
      </dl>

      {resolvedSignals === 0 && (
        <p data-testid="tracking-empty" style={{ fontSize: 12, color: 'var(--ct-muted, #5d6b78)', marginTop: 6 }}>
          Chưa có tín hiệu nào ghi nhận kết quả — cần vài quý dữ liệu thực tế mới đánh giá được độ tin cậy.
        </p>
      )}
    </section>
  );
}

export default SignalTrackingPanel;
