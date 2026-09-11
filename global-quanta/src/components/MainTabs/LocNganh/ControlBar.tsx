import type { ChangeEvent } from 'react';
import type { Timeframe } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

interface ControlBarProps {
  windowSize: number;
  onWindowSizeChange: (size: number) => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  useAtrAxis: boolean;
  onUseAtrAxisChange: (v: boolean) => void;
}

const WINDOW_OPTIONS = [10, 20, 30, 60, 90];
const TIMEFRAME_OPTIONS: { value: Timeframe; labelKey: 'controlBar.timeframe.daily' | 'controlBar.timeframe.weekly' | 'controlBar.timeframe.monthly' }[] = [
  { value: 'daily', labelKey: 'controlBar.timeframe.daily' },
  { value: 'weekly', labelKey: 'controlBar.timeframe.weekly' },
  { value: 'monthly', labelKey: 'controlBar.timeframe.monthly' },
];

// NHOM 2: don vi cua "cua so phan tich" phai doi theo khung thoi gian -
// "30 phien" (Ngay) va "30 phien" hien thi giong het "30 THANG" (Thang) se
// gay hieu lam nghiem trong ve do dai thuc te dang phan tich (30 thang ~
// 2.5 nam, khac han 30 ngay). Khong dung chung 1 nhan "phien" nua.
const PERIOD_UNIT_LABEL: Record<Timeframe, string> = {
  daily: 'phiên (ngày)',
  weekly: 'tuần',
  monthly: 'tháng',
};

export function ControlBar({
  windowSize, onWindowSizeChange, timeframe, onTimeframeChange, useAtrAxis, onUseAtrAxisChange,
}: ControlBarProps) {
  const { t } = useCfI18n();

  return (
    <div className="cf-control-bar">
      <div className="cf-control-group">
        <span className="cf-control-label">{t('controlBar.windowSize')}</span>
        <div role="group" aria-label={t('controlBar.windowSize')}>
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt} type="button"
              className={`cf-chip ${windowSize === opt ? 'cf-chip--active' : ''}`}
              aria-pressed={windowSize === opt}
              onClick={() => onWindowSizeChange(opt)}
            >
              {opt} {PERIOD_UNIT_LABEL[timeframe]}
            </button>
          ))}
        </div>
      </div>

      <div className="cf-control-group">
        <span className="cf-control-label">{t('controlBar.timeframe')}</span>
        <div role="group" aria-label={t('controlBar.timeframe')}>
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.value} type="button"
              className={`cf-chip ${timeframe === opt.value ? 'cf-chip--active' : ''}`}
              aria-pressed={timeframe === opt.value}
              onClick={() => onTimeframeChange(opt.value)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="cf-control-group">
        <label className="cf-atr-toggle">
          <input
            type="checkbox" checked={useAtrAxis}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onUseAtrAxisChange(e.target.checked)}
          />
          {t('controlBar.atrAxis')}
        </label>
      </div>
    </div>
  );
}
