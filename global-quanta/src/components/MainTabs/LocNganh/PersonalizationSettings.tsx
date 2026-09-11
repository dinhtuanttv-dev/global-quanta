import type { ChangeEvent } from 'react';
import type { PersonalizationSettings as Settings } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

interface PersonalizationSettingsProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

const WEIGHT_KEYS = ['similarity', 'liquidity', 'regime', 'sampleSize'] as const;
const WEIGHT_LABEL_KEYS: Record<(typeof WEIGHT_KEYS)[number], 'quality.similarity' | 'quality.liquidity' | 'quality.regime' | 'quality.sampleSize'> = {
  similarity: 'quality.similarity',
  liquidity: 'quality.liquidity',
  regime: 'quality.regime',
  sampleSize: 'quality.sampleSize',
};

/**
 * GIAI DOAN 1 (Nhom 1): cai dat nay hien CHI anh huong nguong hien thi
 * CANH BAO o Frontend (WarningBanner) - backend van tinh Quality Score
 * theo trong so co dinh 40/20/20/20. Ket noi "trong so tuy chinh" toi
 * backend can them 1 tham so query moi, chua lam o giai doan nay.
 */
export function PersonalizationSettings({ settings, onChange }: PersonalizationSettingsProps) {
  const { t } = useCfI18n();
  const totalWeight = WEIGHT_KEYS.reduce((sum, k) => sum + settings.weights[k], 0);

  return (
    <section className="cf-personalization-panel">
      <h4>{t('personalization.title')}</h4>

      <label className="cf-settings-row">
        <span>{t('personalization.threshold')}</span>
        <input
          type="range" min={0} max={1} step={0.05}
          value={settings.qualityScoreThreshold}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...settings, qualityScoreThreshold: Number(e.target.value) })}
        />
        <span>{Math.round(settings.qualityScoreThreshold * 100)}%</span>
      </label>

      <p className="cf-settings-subtitle">
        {t('personalization.weightsTitle')}
        {totalWeight !== 1 && ` ${t('personalization.weightsTotal', { pct: (totalWeight * 100).toFixed(0) })}`}
      </p>
      {WEIGHT_KEYS.map((key) => (
        <label key={key} className="cf-settings-row">
          <span>{t(WEIGHT_LABEL_KEYS[key])}</span>
          <input
            type="range" min={0} max={1} step={0.05}
            value={settings.weights[key]}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...settings, weights: { ...settings.weights, [key]: Number(e.target.value) } })
            }
          />
          <span>{Math.round(settings.weights[key] * 100)}%</span>
        </label>
      ))}
    </section>
  );
}
