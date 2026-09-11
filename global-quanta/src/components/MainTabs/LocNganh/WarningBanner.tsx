import type { QualityScoreBreakdown } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

const LOW_SAMPLE_SIZE_THRESHOLD = 0.3;

export function WarningBanner({ score }: { score: QualityScoreBreakdown }) {
  const { t } = useCfI18n();

  const showOverallWarning = score.overall.value < score.warningThreshold;
  const showSampleSizeWarning = score.sampleSize.value < LOW_SAMPLE_SIZE_THRESHOLD;

  if (!showOverallWarning && !showSampleSizeWarning) return null;

  return (
    <div className="cf-warning-banner" role="alert">
      {showOverallWarning && (
        <p>
          ⚠️{' '}
          {t('warningBanner.text', {
            score: (score.overall.value * 100).toFixed(0),
            threshold: (score.warningThreshold * 100).toFixed(0),
          })}
        </p>
      )}
      {showSampleSizeWarning && <p>⚠️ {t('warningBanner.sampleSize')}</p>}
    </div>
  );
}
