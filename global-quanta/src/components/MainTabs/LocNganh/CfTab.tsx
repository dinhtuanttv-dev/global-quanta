import { useMemo } from 'react';
import { CfI18nProvider, useCfI18n } from '../../../i18n/CfI18nProvider';
import { useAppStore } from '../../../store/useAppStore';
import './cycle-fingerprint.css';
import { CfV2Panel } from './CfV2Panel';
import { useCycleFingerprintV2 } from '../../../hooks/useCycleFingerprintV2';
import { useSectorRrg } from '../../../hooks/useSectorRotation';

function CfTabInner() {
  const { t } = useCfI18n();
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const v2 = useCycleFingerprintV2(selectedTicker, true);
  const rrg = useSectorRrg();
  const sectorNames = useMemo(() => new Map((rrg.data?.sectors ?? []).map((s) => [s.code, s.name])), [rrg.data]);

  if (!selectedTicker) {
    return <div className="cf-state cf-state--empty"><p>{t('state.noTicker')}</p></div>;
  }
  return (
    <div className="cf-tab">
      {v2.isLoading && <div className="cf-state cf-state--loading"><div className="cf-spinner" /><p>Đang tìm giai đoạn tương tự trong toàn thị trường… lần đầu sau khi máy chủ khởi động có thể mất tới ~1 phút để dựng thư viện.</p></div>}
      {v2.error && (
        <div className="cf-state cf-state--error" role="alert" data-testid="cf2-error">
          <p>{v2.error.message}</p>
          {v2.error.status !== 404 && <button type="button" className="cf-retry-btn" onClick={v2.refresh}>Thử lại</button>}
        </div>
      )}
      {v2.data && <CfV2Panel data={v2.data} sectorNames={sectorNames} />}
    </div>
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
