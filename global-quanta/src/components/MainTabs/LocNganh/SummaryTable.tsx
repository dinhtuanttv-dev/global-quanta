import type { CycleFingerprintResponse } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

export function SummaryTable({ summary }: { summary: CycleFingerprintResponse['summary'] }) {
  const n = summary.sampleCount;
  const { t } = useCfI18n();

  return (
    <section className="cf-summary-table" aria-label={t('summary.winRate')}>
      <div className="cf-summary-cell">
        <span className="cf-summary-label">{t('summary.winRate')}</span>
        <span style={{ color: 'var(--positive)' }}>
          {summary.winRatePct.value.toFixed(1)}%
          <SourceBadge source={summary.winRatePct.source} />
        </span>
      </div>
      <div className="cf-summary-cell">
        <span className="cf-summary-label">{t('summary.avgReturn')}</span>
        <span style={{ color: summary.avgReturnPct.value >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
          {summary.avgReturnPct.value > 0 ? '+' : ''}
          {summary.avgReturnPct.value.toFixed(2)}%
          <SourceBadge source={summary.avgReturnPct.source} />
        </span>
      </div>
      <div className="cf-summary-cell">
        <span className="cf-summary-label">{t('summary.maxDrawdown')}</span>
        <span style={{ color: 'var(--negative)' }}>
          {summary.maxDrawdownPct.value.toFixed(2)}%
          <SourceBadge source={summary.maxDrawdownPct.source} />
        </span>
      </div>
      <div className="cf-summary-cell">
        <span className="cf-summary-label">{t('summary.sampleCount')}</span>
        <span>{summary.sampleCount}</span>
      </div>
      <p className="cf-note" data-testid="cf-summary-note" style={{ gridColumn: "1 / -1", flexBasis: "100%" }}>
        Thống kê mô tả trên {n} giai đoạn của chính mã — mẫu rất nhỏ và không độc lập (diễn biến sau của các giai đoạn có thể chồng lấn nhau).
        Không dùng làm xác suất thắng.
      </p>
    </section>
  );
}
