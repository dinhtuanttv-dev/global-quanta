import type { TimingForecast } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { SourceBadge } from './SourceBadge';

export function TimingForecastPanel({ timing, shownCount }: { timing: TimingForecast; shownCount: number }) {
  const { t } = useCfI18n();
  const tgt = timing.targetReturnPct;
  const direction = tgt < 0 ? `giảm ${Math.abs(tgt)}%` : `tăng ${tgt}%`;

  return (
    <section className="cf-timing-panel">
      <h4 data-testid="cf-timing-title">Dự báo thời gian (mục tiêu: {direction} so với hôm nay)</h4>
      <p className="cf-note" data-testid="cf-timing-note">
        Tính trên {timing.poolSize ?? 20} giai đoạn (rộng hơn {shownCount} giai đoạn hiển thị ở trên).
        {tgt < 0 ? ' Mục tiêu âm: đây là xác suất GIẢM chạm mức này, không phải xác suất tăng.' : ''}
        {' '}Kiểm định 10/10: xác suất chạm trong 20 phiên bị thổi phồng (báo 56%, thực tế 43%). Thời gian đạt đỉnh/đáy trong 60 phiên
        ≈ 30 phiên với cả chuỗi giá ngẫu nhiên — ít mang thông tin.
      </p>

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
