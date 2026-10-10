import { useState } from 'react';
import type { CycleFingerprintResponse, PersonalizationSettings as Settings, Timeframe } from '../../../types/cycleFingerprint';
import type { ApiError } from '../../../hooks/useCycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { ControlBar } from './ControlBar';
import { MainChart } from './MainChart';
import { TopKList } from './TopKList';
import { QualityScoreBadge } from './QualityScoreBadge';
import { WarningBanner } from './WarningBanner';
import { SummaryTable } from './SummaryTable';
import { FanChartPanel } from './FanChartPanel';
import { ClusterPanel } from './ClusterPanel';
import { ExplainabilityPanel } from './ExplainabilityPanel';
import { TimingForecastPanel } from './TimingForecastPanel';
import { PersonalizationSettings } from './PersonalizationSettings';
import { CfEvidenceBanner } from './CfEvidenceBanner';
import type { MatchChartMode } from './MainChart';

const UNIT: Record<Timeframe, string> = { daily: 'phiên', weekly: 'tuần', monthly: 'tháng' };

interface CycleFingerprintPanelProps {
  data: CycleFingerprintResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: ApiError;
  isEmpty: boolean;
  onRetry: () => void;
  windowSize: number;
  onWindowSizeChange: (size: number) => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  useAtrAxis: boolean;
  onUseAtrAxisChange: (v: boolean) => void;
  personalization: Settings;
  onPersonalizationChange: (next: Settings) => void;
}

// QUAN TRONG: <MainChart /> duoc goi Y HET Giai doan 1 (khong co prop
// fanChart - kieu du lieu cua component da bo han truong nay, khong the
// vo tinh truyen vao duoc nua). Fan Chart hien o <FanChartPanel /> RIENG,
// dat SAU TopKList, KHONG chung canvas/truc voi bieu do gia.
export function CycleFingerprintPanel({
  data, isLoading, isError, error, isEmpty, onRetry,
  windowSize, onWindowSizeChange, timeframe, onTimeframeChange, useAtrAxis, onUseAtrAxisChange,
  personalization, onPersonalizationChange,
}: CycleFingerprintPanelProps) {
  const { t } = useCfI18n();
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<MatchChartMode>('overlay');
  const unit = UNIT[timeframe];

  const topBar = (
    <div className="cf-tab__top-bar">
      <ControlBar
        windowSize={windowSize} onWindowSizeChange={onWindowSizeChange}
        timeframe={timeframe} onTimeframeChange={onTimeframeChange}
        useAtrAxis={useAtrAxis} onUseAtrAxisChange={onUseAtrAxisChange}
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="cf-tab">
        {topBar}
        <div className="cf-state cf-state--loading">
          <div className="cf-spinner" aria-label={t('state.loading')} />
          <p>{t('state.loading')}</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="cf-tab">
        {topBar}
        <div className="cf-state cf-state--error" role="alert">
          <p>{t('state.error.title')}</p>
          <p style={{ fontSize: 12, opacity: 0.8 }}>{error?.message ?? t('state.error.unknown')}</p>
          <button type="button" className="cf-retry-btn" onClick={onRetry}>{t('state.error.retry')}</button>
        </div>
      </div>
    );
  }

  if (isEmpty || !data) {
    return (
      <div className="cf-tab">
        {topBar}
        <div className="cf-state cf-state--empty"><p>{t('state.empty')}</p></div>
      </div>
    );
  }

  const qualityScoreWithPersonalThreshold = {
    ...data.qualityScore,
    warningThreshold: personalization.qualityScoreThreshold,
  };

  return (
    <div className="cf-tab">
      {topBar}
      <CfEvidenceBanner windowSize={windowSize} />
      <WarningBanner score={qualityScoreWithPersonalThreshold} />

      <div className="cf-mode-toggle" role="group" aria-label="Cách vẽ giai đoạn tương tự">
        {([['overlay', `Chồng lên hiện tại + 60 ${unit} sau`], ['shape', 'Hình dạng mẫu (kiểu cũ)']] as const).map(([m, label]) => (
          <button key={m} type="button" className={`cf-chip ${chartMode === m ? 'cf-chip--active' : ''}`} aria-pressed={chartMode === m}
            data-testid={`cf-mode-${m}`} onClick={() => setChartMode(m)}>{label}</button>
        ))}
      </div>

      {/* Bieu do gia chinh - Y HET Giai doan 1, khong dinh dang lieu Nhom 1 nao */}
      <div className="cf-tab__main-row">
        <MainChart
          priceSeries={data.priceSeries}
          topMatches={data.topMatches}
          atrSeries={data.atrSeries}
          useAtrAxis={useAtrAxis}
          highlightedKey={highlightedKey}
          mode={chartMode}
          unitLabel={unit}
        />
        <QualityScoreBadge score={data.qualityScore} />
      </div>

      <SummaryTable summary={data.summary} />

      <TopKList matches={data.topMatches} highlightedKey={highlightedKey} onHighlight={setHighlightedKey} unitLabel={unit} />

      {/* Nhom 1 - tat ca deu la panel RIENG, khong dung chung canvas voi MainChart */}
      {data.fanChart && data.fanChart.length > 0 && <FanChartPanel fanChart={data.fanChart} />}
      <ClusterPanel clusterInput={data.clusterInput} />
      {data.explainability && <ExplainabilityPanel explainability={data.explainability} />}
      {data.timingForecast && <TimingForecastPanel timing={data.timingForecast} shownCount={data.topMatches.length} />}

      <PersonalizationSettings settings={personalization} onChange={onPersonalizationChange} />
    </div>
  );
}
