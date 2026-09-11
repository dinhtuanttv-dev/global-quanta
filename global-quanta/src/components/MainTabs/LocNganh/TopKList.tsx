import type { CycleMatch } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

interface TopKListProps {
  matches: CycleMatch[];
  highlightedTicker: string | null;
  onHighlight: (ticker: string | null) => void;
}

export function TopKList({ matches, highlightedTicker, onHighlight }: TopKListProps) {
  const { t } = useCfI18n();
  if (matches.length === 0) return null;

  return (
    <section className="cf-topk-list" aria-label={t('topk.title', { n: matches.length })}>
      <h4>{t('topk.title', { n: matches.length })}</h4>
      <table className="cf-topk-table">
        <thead>
          <tr>
            <th>{t('topk.col.ticker')}</th>
            <th>{t('topk.col.similarity')}</th>
            <th>R10</th>
            <th>R20</th>
            <th>R30</th>
            <th>R60</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const isHighlighted = highlightedTicker === m.ticker;
            return (
              <tr
                key={`${m.ticker}-${m.matchStartDate}`}
                className={isHighlighted ? 'cf-topk-row--highlighted' : ''}
                onMouseEnter={() => onHighlight(m.ticker)}
                onMouseLeave={() => onHighlight(null)}
              >
                <td>{m.ticker}</td>
                <td>
                  {m.similarityPct.value.toFixed(1)}%
                  <SourceBadge source={m.similarityPct.source} />
                </td>
                {(['d10', 'd20', 'd30', 'd60'] as const).map((k) => (
                  <td key={k} style={{ color: m.returns[k].value >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                    {m.returns[k].value > 0 ? '+' : ''}
                    {m.returns[k].value.toFixed(2)}%
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
