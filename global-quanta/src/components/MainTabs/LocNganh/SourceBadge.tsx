import type { DataSource } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

/** Badge nhỏ gắn nhãn HARD_DATA / ESTIMATED cạnh mọi số liệu định lượng. */
export function SourceBadge({ source }: { source: DataSource }) {
  const { t } = useCfI18n();
  const isEstimated = source === 'ESTIMATED';
  return (
    <span
      className="cf-source-badge"
      data-source={source}
      title={isEstimated ? t('sourceBadge.estimatedTitle') : t('sourceBadge.hardDataTitle')}
    >
      {isEstimated ? t('sourceBadge.estimated') : t('sourceBadge.hardData')}
    </span>
  );
}
