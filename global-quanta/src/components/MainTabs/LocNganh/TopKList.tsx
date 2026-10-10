import type { CycleMatch } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';
import { fmtCfDate, matchKey } from './MainChart';

interface TopKListProps {
  matches: CycleMatch[];
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
  unitLabel: string;
}

/** CF0: mỗi dòng là một GIAI ĐOẠN (có ngày), highlight theo giai đoạn — trước đây theo mã nên cả 5 dòng cùng sáng. */
export function TopKList({ matches, highlightedKey, onHighlight, unitLabel }: TopKListProps) {
  const { t } = useCfI18n();
  if (matches.length === 0) return null;

  return (
    <section className="cf-topk-list" aria-label={t('topk.title', { n: matches.length })}>
      <h4>{t('topk.title', { n: matches.length })}</h4>
      <table className="cf-topk-table">
        <thead>
          <tr>
            <th>{t('topk.col.ticker')}</th>
            <th>Giai đoạn</th>
            <th title="Thang tương đối trong lần quét (min-max): giai đoạn khớp nhất luôn = 100%">{t('topk.col.similarity')}</th>
            {[10, 20, 30, 60].map((h) => <th key={h} title={`Lợi suất ${h} ${unitLabel} SAU khi giai đoạn kết thúc`}>R{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const key = matchKey(m);
            const isHighlighted = highlightedKey === key;
            return (
              <tr
                key={key}
                data-testid="cf-topk-row"
                className={isHighlighted ? 'cf-topk-row--highlighted' : ''}
                onMouseEnter={() => onHighlight(key)}
                onMouseLeave={() => onHighlight(null)}
                onClick={() => onHighlight(isHighlighted ? null : key)}
              >
                <td>{m.ticker}</td>
                <td data-testid="cf-topk-period" style={{ whiteSpace: 'nowrap' }}>{fmtCfDate(m.matchStartDate)} → {fmtCfDate(m.matchEndDate)}</td>
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
      <p className="cf-note">Rê chuột hoặc chạm một dòng để làm nổi giai đoạn đó trên biểu đồ. Các giai đoạn đều thuộc lịch sử của chính mã này.</p>
    </section>
  );
}
