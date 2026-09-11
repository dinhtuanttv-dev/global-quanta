import type { TimingForecast } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

export function TimingForecastPanel({ timing }: { timing: TimingForecast }) {
  const { t } = useCfI18n();

  return (
    <section className="cf-timing-panel">
      <h4>{t('timing.title', { target: timing.targetReturnPct > 0 ? `+${timing.targetReturnPct}` : timing.targetReturnPct })}</h4>

      <div className="cf-timing-row">
        <span>{t('timing.daysToPeak')}</span>
        <span>
          {timing.daysToPeak.value.toFixed(1)} {t('timing.sessions')}
          <SourceBadge source={timing.daysToPeak.source} />
        </span>
      </div>
      <div className="cf-timing-row">
        <span>{t('timing.daysToTrough')}</span>
        <span>
          {timing.daysToTrough.value.toFixed(1)} {t('timing.sessions')}
          <SourceBadge source={timing.daysToTrough.source} />
        </span>
      </div>

      <h5>{t('timing.hittingProbTitle')}</h5>
      <table className="cf-topk-table">
        <thead>
          <tr>
            <th>{t('timing.col.within')}</th>
            <th>{t('timing.col.prob')}</th>
          </tr>
        </thead>
        <tbody>
          {timing.hittingProbability.map((h) => (
            <tr key={h.withinSessions}>
              <td>{h.withinSessions} {t('timing.sessions')}</td>
              <td>
                {h.probabilityPct.value.toFixed(0)}%
                <SourceBadge source={h.probabilityPct.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
