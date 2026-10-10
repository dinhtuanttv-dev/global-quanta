import type { ExplainabilityBreakdown } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

const FACTOR_VI: Record<string, string> = { Similarity: 'Tương đồng (tương đối)', Liquidity: 'Thanh khoản', Regime: 'Trạng thái xu hướng', 'Sample-size': 'Cỡ mẫu' };

/** Tỷ trọng đóng góp của từng thành phần vào Điểm chất lượng (trọng số cố định 40/20/20/20) — không phải lời giải thích dự báo. */
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
              <span>{FACTOR_VI[f.name] ?? f.name}</span>
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
