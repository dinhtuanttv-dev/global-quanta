import { useState } from 'react';
import type { CycleFingerprintResponse, PersonalizationSettings as Settings, Timeframe } from '../../../types/cycleFingerprint';
import type { ApiError } from '../../../hooks/useCycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { ControlBar } from './ControlBar';
import { MainChart } from './MainChart';
import { FanChartPanel } from './FanChartPanel';
import { TopKList } from './TopKList';
import { QualityScoreBadge } from './QualityScoreBadge';
import { WarningBanner } from './WarningBanner';
import { SummaryTable } from './SummaryTable';
import { ExplainabilityPanel } from './ExplainabilityPanel';
import { TimingForecastPanel } from './TimingForecastPanel';
import { PersonalizationSettings } from './PersonalizationSettings';

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

// NHOM 1 (2026-09-11): mo rong them Fan Chart (da co du lieu that trong
// MainChart), ExplainabilityPanel, TimingForecastPanel, Personalization -
// ca 4 deu dung du lieu THAT tu backend (khong con field rong []/undefined
// nhu Giai doan 1 ban dau). Van CHUA co: ClusterPanel (can HDBSCAN),
// MultiSignalPanel/MonteCarloPanel/CrossMarketPanel (chua co du lieu),
// ExportButton/FeedbackWidget/AlertToastStack/LanguageThemeToggle.
export function CycleFingerprintPanel({
  data, isLoading, isError, error, isEmpty, onRetry,
  windowSize, onWindowSizeChange, timeframe, onTimeframeChange, useAtrAxis, onUseAtrAxisChange,
  personalization, onPersonalizationChange,
}: CycleFingerprintPanelProps) {
  const { t } = useCfI18n();
  const [highlightedTicker, setHighlightedTicker] = useState<string | null>(null);

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

  // GIAI DOAN 1 - LUU Y (ghi ro, khong che giau): personalization.qualityScoreThreshold
  // hien CHI doi nguong hien thi CANH BAO o Frontend (WarningBanner), CHUA
  // gui nguoc ve backend de doi cach TINH Quality Score (van dung trong so
  // co dinh 40/20/20/20). Doi trong so tinh diem that can them tham so
  // query moi o backend - ngoai pham vi Nhom 1 da thong nhat.
  const qualityScoreWithPersonalThreshold = {
    ...data.qualityScore,
    warningThreshold: personalization.qualityScoreThreshold,
  };

  return (
    <div className="cf-tab">
      {topBar}
      <WarningBanner score={qualityScoreWithPersonalThreshold} />

      <div className="cf-tab__main-row">
        <MainChart
          priceSeries={data.priceSeries}
          topMatches={data.topMatches}
          atrSeries={data.atrSeries}
          useAtrAxis={useAtrAxis}
          highlightedTicker={highlightedTicker}
        />
        <QualityScoreBadge score={data.qualityScore} />
      </div>

      <SummaryTable summary={data.summary} />

      <TopKList matches={data.topMatches} highlightedTicker={highlightedTicker} onHighlight={setHighlightedTicker} />

      {data.fanChart && data.fanChart.length > 0 && <FanChartPanel fanChart={data.fanChart} />}
      {data.explainability && <ExplainabilityPanel explainability={data.explainability} />}
      {data.timingForecast && <TimingForecastPanel timing={data.timingForecast} />}

      <PersonalizationSettings settings={personalization} onChange={onPersonalizationChange} />
    </div>
  );
}
