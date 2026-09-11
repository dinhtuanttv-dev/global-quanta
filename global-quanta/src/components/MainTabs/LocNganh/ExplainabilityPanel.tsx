import type { ExplainabilityBreakdown } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

export function ExplainabilityPanel({ explainability }: { explainability: ExplainabilityBreakdown }) {
  const { t } = useCfI18n();
  if (explainability.factors.length === 0) return null;

  return (
    <section className="cf-explainability-panel">
      <h4>{t('explain.title')}</h4>
      <ul>
        {explainability.factors.map((f) => (
          <li key={f.name}>
            <div className="cf-explain-row">
              <span>{f.name}</span>
              <span>
                {f.contributionPct.value.toFixed(0)}%
                <SourceBadge source={f.contributionPct.source} />
              </span>
            </div>
            <div className="cf-explain-bar-track">
              <div className="cf-explain-bar-fill" style={{ width: `${f.contributionPct.value}%` }} />
            </div>
            <p className="cf-explain-desc">{f.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
