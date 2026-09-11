import type { QualityScoreBreakdown } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

export function QualityScoreBadge({ score }: { score: QualityScoreBreakdown }) {
  const { t } = useCfI18n();
  const pct = Math.round(score.overall.value * 100);
  const tier = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';

  return (
    <div className={`cf-quality-badge cf-quality-badge--${tier}`}>
      <div className="cf-quality-badge__overall">
        <span className="cf-quality-badge__value">{pct}%</span>
        <span>{t('quality.title')}</span>
        <SourceBadge source={score.overall.source} />
      </div>
      <dl className="cf-quality-badge__breakdown">
        <div><dt>{t('quality.similarity')}</dt><dd>{(score.similarity.value * 100).toFixed(0)}%</dd></div>
        <div><dt>{t('quality.liquidity')}</dt><dd>{(score.liquidity.value * 100).toFixed(0)}%</dd></div>
        <div><dt>{t('quality.regime')}</dt><dd>{(score.regime.value * 100).toFixed(0)}%</dd></div>
        <div><dt>{t('quality.sampleSize')}</dt><dd>{(score.sampleSize.value * 100).toFixed(0)}%</dd></div>
      </dl>
    </div>
  );
}
