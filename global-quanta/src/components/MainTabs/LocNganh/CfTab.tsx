import { useState } from 'react';
import { useCycleFingerprint } from '../../../hooks/useCycleFingerprint';
import { CycleFingerprintPanel } from './CfPanel';
import { CfI18nProvider, useCfI18n } from '../../../i18n/CfI18nProvider';
import { useAppStore } from '../../../store/useAppStore';
import type { Timeframe } from '../../../types/cycleFingerprint';
import './cycle-fingerprint.css';

const DEFAULT_WINDOW_SIZE = 30;
const DEFAULT_TIMEFRAME: Timeframe = 'daily';
const DEFAULT_USE_ATR_AXIS = false;

function CfTabInner() {
  const { t } = useCfI18n();
  const selectedTicker = useAppStore((s) => s.selectedTicker);

  const [windowSize, setWindowSize] = useState(DEFAULT_WINDOW_SIZE);
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [useAtrAxis, setUseAtrAxis] = useState(DEFAULT_USE_ATR_AXIS);

  const { data, isLoading, isError, error, isEmpty, refresh } = useCycleFingerprint(
    selectedTicker, windowSize, timeframe,
  );

  if (!selectedTicker) {
    return <div className="cf-state cf-state--empty"><p>{t('state.noTicker')}</p></div>;
  }

  return (
    <CycleFingerprintPanel
      data={data} isLoading={isLoading} isError={isError} error={error} isEmpty={isEmpty} onRetry={refresh}
      windowSize={windowSize} onWindowSizeChange={setWindowSize}
      timeframe={timeframe} onTimeframeChange={setTimeframe}
      useAtrAxis={useAtrAxis} onUseAtrAxisChange={setUseAtrAxis}
    />
  );
}

/** Container: bọc CfI18nProvider (hạ tầng nội bộ, không hiện công tắc UI ở
 * Giai đoạn 1), nối selectedTicker từ store toàn cục. */
export function CycleFingerprintTab() {
  return (
    <CfI18nProvider>
      <CfTabInner />
    </CfI18nProvider>
  );
}
