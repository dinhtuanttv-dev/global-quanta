import type { CycleFingerprintResponse } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

export function SummaryTable({ summary }: { summary: CycleFingerprintResponse['summary'] }) {
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
    </section>
  );
}
