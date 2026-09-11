import { useState } from 'react';
import type { CycleFingerprintResponse, Timeframe } from '../../../types/cycleFingerprint';
import type { ApiError } from '../../../hooks/useCycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';
import { ControlBar } from './ControlBar';
import { MainChart } from './MainChart';
import { TopKList } from './TopKList';
import { QualityScoreBadge } from './QualityScoreBadge';
import { WarningBanner } from './WarningBanner';
import { SummaryTable } from './SummaryTable';

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
}

// GIAI DOAN 1: chi lap rap 6 panel da co du lieu that tu backend (Control
// Bar, MainChart, TopKList, QualityScoreBadge, WarningBanner, SummaryTable).
export function CycleFingerprintPanel({
  data, isLoading, isError, error, isEmpty, onRetry,
  windowSize, onWindowSizeChange, timeframe, onTimeframeChange, useAtrAxis, onUseAtrAxisChange,
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

  return (
    <div className="cf-tab">
      {topBar}
      <WarningBanner score={data.qualityScore} />

      <div className="cf-tab__main-row">
        <MainChart
          priceSeries={data.priceSeries}
          topMatches={data.topMatches}
          fanChart={data.fanChart ?? []}
          atrSeries={data.atrSeries}
          useAtrAxis={useAtrAxis}
          highlightedTicker={highlightedTicker}
        />
        <QualityScoreBadge score={data.qualityScore} />
      </div>

      <SummaryTable summary={data.summary} />

      <TopKList matches={data.topMatches} highlightedTicker={highlightedTicker} onHighlight={setHighlightedTicker} />
    </div>
  );
}
