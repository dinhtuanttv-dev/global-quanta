import { useState } from 'react';
import { useCycleFingerprint } from '../../../hooks/useCycleFingerprint';
import { CycleFingerprintPanel } from './CfPanel';
import { CfI18nProvider, useCfI18n } from '../../../i18n/CfI18nProvider';
import { useAppStore } from '../../../store/useAppStore';
import type { PersonalizationSettings, Timeframe } from '../../../types/cycleFingerprint';
import './cycle-fingerprint.css';
import { useMemo as useMemoV2 } from 'react';
import { CfV2Panel } from './CfV2Panel';
import { useCycleFingerprintV2 } from '../../../hooks/useCycleFingerprintV2';
import { useSectorRrg } from '../../../hooks/useSectorRotation';

const DEFAULT_WINDOW_SIZE = 30;
const DEFAULT_TIMEFRAME: Timeframe = 'daily';
const DEFAULT_USE_ATR_AXIS = false;
const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
  qualityScoreThreshold: 0.4,
  weights: { similarity: 0.4, liquidity: 0.2, regime: 0.2, sampleSize: 0.2 },
};

function CfTabInner() {
  const { t } = useCfI18n();
  const selectedTicker = useAppStore((s) => s.selectedTicker);

  const [windowSize, setWindowSize] = useState(DEFAULT_WINDOW_SIZE);
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [useAtrAxis, setUseAtrAxis] = useState(DEFAULT_USE_ATR_AXIS);
  const [personalization, setPersonalization] = useState<PersonalizationSettings>(DEFAULT_PERSONALIZATION);
  // CF4: engine v2 (thư viện toàn universe, cửa sổ 30 phiên ngày) là mặc định; engine cũ giữ cho cửa sổ / khung khác.
  const [engine, setEngine] = useState<'v2' | 'legacy'>('v2');

  const { data, isLoading, isError, error, isEmpty, refresh } = useCycleFingerprint(
    engine === 'legacy' ? selectedTicker : null, windowSize, timeframe,
  );
  const v2 = useCycleFingerprintV2(selectedTicker, engine === 'v2');
  const rrg = useSectorRrg();
  const sectorNames = useMemoV2(() => new Map((rrg.data?.sectors ?? []).map((s) => [s.code, s.name])), [rrg.data]);

  if (!selectedTicker) {
    return <div className="cf-state cf-state--empty"><p>{t('state.noTicker')}</p></div>;
  }

  const switcher = (
    <div className="cf-mode-toggle cf2-engine" role="group" aria-label="Chọn engine">
      <button type="button" className={`cf-chip ${engine === 'v2' ? 'cf-chip--active' : ''}`} aria-pressed={engine === 'v2'} data-testid="cf-engine-v2" onClick={() => setEngine('v2')}>
        Engine v2 · toàn thị trường (30 phiên ngày)
      </button>
      <button type="button" className={`cf-chip ${engine === 'legacy' ? 'cf-chip--active' : ''}`} aria-pressed={engine === 'legacy'} data-testid="cf-engine-legacy" onClick={() => setEngine('legacy')}>
        Engine cũ · chính mã (chọn cửa sổ / khung)
      </button>
    </div>
  );

  if (engine === 'v2') {
    return (
      <div className="cf-tab">
        {switcher}
        {v2.isLoading && <div className="cf-state cf-state--loading"><div className="cf-spinner" /><p>Đang tìm giai đoạn tương tự trong toàn thị trường… lần đầu sau khi máy chủ khởi động có thể mất tới ~1 phút để dựng thư viện.</p></div>}
        {v2.error && (
          <div className="cf-state cf-state--error" role="alert" data-testid="cf2-error">
            <p>{v2.error.message}</p>
            <button type="button" className="cf-retry-btn" onClick={() => setEngine('legacy')}>Dùng engine cũ cho {selectedTicker}</button>
            {v2.error.status !== 404 && <button type="button" className="cf-retry-btn" onClick={v2.refresh}>Thử lại</button>}
          </div>
        )}
        {v2.data && <CfV2Panel data={v2.data} sectorNames={sectorNames} />}
      </div>
    );
  }

  return (
    <>
    {switcher}
    <CycleFingerprintPanel
      data={data} isLoading={isLoading} isError={isError} error={error} isEmpty={isEmpty} onRetry={refresh}
      windowSize={windowSize} onWindowSizeChange={setWindowSize}
      timeframe={timeframe} onTimeframeChange={setTimeframe}
      useAtrAxis={useAtrAxis} onUseAtrAxisChange={setUseAtrAxis}
      personalization={personalization} onPersonalizationChange={setPersonalization}
    />
    </>
  );
}

/** Container: bọc CfI18nProvider, nối selectedTicker từ store toàn cục. */
export function CycleFingerprintTab() {
  return (
    <CfI18nProvider>
      <CfTabInner />
    </CfI18nProvider>
  );
}
