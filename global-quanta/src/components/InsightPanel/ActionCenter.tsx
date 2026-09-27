import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { formatPct } from '../../utils/formatNumber';
import { CONVERGENCE_LABELS } from '../../types';
import { useCatalystData } from '../../hooks/useCatalystData';
import type { ActionAlert, ActionAlertEvent, ActionAlertWorkerStatus, AlertCondition } from '../../services/api';
import * as api from '../../services/api';

type ActionStatus = { ticker: string; kind: 'success' | 'error'; message: string } | null;

export default function ActionCenter() {
  const radarCore = useAppStore((s) => s.radarCore);
  const radarRing = useAppStore((s) => s.radarRing);
  const radarDataStatus = useAppStore((s) => s.radarDataStatus);
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const radarDataAge = radarDataStatus.generatedAt ? Date.now() - Date.parse(radarDataStatus.generatedAt) : Infinity;
  const { snapshot: catalystSnapshot, error: catalystError } = useCatalystData();
  const core = radarCore.find((node) => node.ticker === selectedTicker);
  const ring = radarRing.find((node) => node.ticker === selectedTicker);
  const [pending, setPending] = useState<'buy' | 'sell' | null>(null);
  const [status, setStatus] = useState<ActionStatus>(null);
  const [alerts, setAlerts] = useState<ActionAlert[]>([]);
  const [alertEvents, setAlertEvents] = useState<ActionAlertEvent[]>([]);
  const [workerStatus, setWorkerStatus] = useState<ActionAlertWorkerStatus | null>(null);
  const [alertCondition, setAlertCondition] = useState<AlertCondition>('price_above');
  const [alertThreshold, setAlertThreshold] = useState('100000');
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const liveRadarAlertsEnabled = import.meta.env.VITE_ENABLE_LIVE_RADAR_ALERTS === 'true' &&
    radarDataStatus.kind === 'live' && radarDataAge <= 15 * 60 * 1000 && workerStatus?.radarAlertsEnabled === true;

  useEffect(() => {
    if (!liveRadarAlertsEnabled && alertCondition === 'convergence_at_least') {
      setAlertCondition('price_above');
      setAlertThreshold('100000');
    }
  }, [liveRadarAlertsEnabled, alertCondition]);

  useEffect(() => {
    setStatus(null);
  }, [selectedTicker]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTicker) return;
    const refreshData = () => Promise.all([
      api.fetchActionAlerts(),
      api.fetchActionAlertEvents(),
      api.fetchActionAlertWorkerStatus(),
    ])
      .then(([items, events, worker]) => {
        if (!cancelled) {
          setAlerts(items.filter((item) => item.ticker === selectedTicker));
          setAlertEvents(events.filter((event) => event.ticker === selectedTicker));
          setWorkerStatus(worker);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAlertEvents([]);
          setWorkerStatus(null);
        }
      });
    void refreshData();
    const timer = window.setInterval(() => void refreshData(), 30_000);
    window.addEventListener('focus', refreshData);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshData);
    };
  }, [selectedTicker]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTicker) return;
    setAlerts([]);
    setAlertBusy(true);
    setAlertMessage('');
    api.fetchActionAlerts()
      .then((items) => { if (!cancelled) setAlerts(items.filter((item) => item.ticker === selectedTicker)); })
      .catch((error: unknown) => {
        if (!cancelled) setAlertMessage(error instanceof Error ? error.message : 'Không thể tải cảnh báo.');
      })
      .finally(() => { if (!cancelled) setAlertBusy(false); });
    return () => { cancelled = true; };
  }, [selectedTicker]);

  const runAction = async (action: 'buy' | 'sell') => {
    if (!selectedTicker || pending) return;
    const ticker = selectedTicker;
    setPending(action);
    setStatus(null);
    try {
      await api.placeOrderIntent(ticker, action);

      setStatus({
        ticker,
        kind: 'success',
        message: `Ý định ${action === 'buy' ? 'MUA' : 'BÁN'} ${ticker} đã được ghi nhận (mô phỏng).`,
      });
    } catch {
      setStatus({
        ticker,
        kind: 'error',
        message: `Không thể ghi nhận thao tác cho ${ticker}. Hãy thử lại.`,
      });
    } finally {
      setPending(null);
    }
  };

  const saveAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicker || alertBusy) return;
    if (alertCondition === 'convergence_at_least' && !liveRadarAlertsEnabled) {
      setAlertMessage('Cảnh báo hội tụ chỉ khả dụng khi feed Radar live đang hoạt động và đã bật đồng bộ.');
      return;
    }
    setAlertBusy(true);
    setAlertMessage('');
    try {
      const created = await api.createActionAlert({
        ticker: selectedTicker,
        condition: alertCondition,
        threshold: Number(alertThreshold),
      });
      setAlerts((current) => [created, ...current]);
      setAlertMessage('Đã lưu điều kiện; trạng thái sẽ chuyển sang hoạt động khi worker bắt đầu theo dõi.');
    } catch (error) {
      setAlertMessage(error instanceof Error ? error.message : 'Không thể lưu cảnh báo.');
    } finally {
      setAlertBusy(false);
    }
  };

  const removeAlert = async (id: string) => {
    setAlertBusy(true);
    setAlertMessage('');
    try {
      await api.deleteActionAlert(id);
      setAlerts((current) => current.filter((item) => item.id !== id));
      setAlertMessage('Đã xóa điều kiện cảnh báo.');
    } catch (error) {
      setAlertMessage(error instanceof Error ? error.message : 'Không thể xóa cảnh báo.');
    } finally {
      setAlertBusy(false);
    }
  };

  if (!core && !ring) {
    return (
      <section className="panel-block ac-panel" aria-labelledby="action-center-title">
        <div className="panel-head"><div id="action-center-title" className="panel-title">ACTION CENTER</div></div>
        <div className="ac-hold">Chọn một mã trên Radar để xem tín hiệu và luận cứ.</div>
      </section>
    );
  }

  const ticker = core?.ticker ?? ring!.ticker;
  const signalLabels = core?.signalLabels ?? ring?.signalLabels ?? CONVERGENCE_LABELS;
  const changePct = core?.changePct ?? ring!.changePct;
  const referencePrice = core?.price ?? ring!.price;
  const score = core
    ? core.convergence.filter(Boolean).length
    : ring!.score;
  const stateLabel = core
    ? core.stateLabel
    : `Watchlist Ring · ${score}/${signalLabels.length} điểm hội tụ`;
  const evidence = core
    ? signalLabels.filter((_, index) => Boolean(core.convergence[index]))
    : ring?.convergence
      ? signalLabels.filter((_, index) => Boolean(ring.convergence?.[index]))
      : [`Điểm hội tụ hiện tại ${score}/${signalLabels.length}`, 'Mã đang ở Watchlist Ring'];
  const currentStatus = status?.ticker === ticker ? status : null;
  const workerHealthy = Boolean(
    workerStatus?.enabled && workerStatus.configured && workerStatus.started && !workerStatus.lastCycleFailed &&
    workerStatus.lastSuccessfulCycleAt &&
    Date.now() - Date.parse(workerStatus.lastSuccessfulCycleAt) < Math.max(workerStatus.pollIntervalMs * 3, 180_000)
  );
  const catalyst = catalystSnapshot?.sectors
    .flatMap((sector) => [...sector.primaryCards, ...sector.cascadeCards])
    .find((card) => card.ticker === ticker);

  return (
    <section className="panel-block ac-panel" aria-labelledby="action-center-title">
      <div className="panel-head">
        <div id="action-center-title" className="panel-title">ACTION CENTER</div>
        <span className="ac-demo-badge">{radarDataStatus.kind === 'live' ? 'RADAR API' : 'MÔ PHỎNG'}</span>
      </div>

      <div className="ac-selected">
        <div className="ac-avatar" aria-hidden="true">{ticker}</div>
        <div className="ac-info">
          <b>{ticker} — {core?.name ?? ring!.sector}</b>
          <span>{stateLabel}</span>
        </div>
        <div className="ac-price">
          <div className="p num">{referencePrice.toLocaleString('vi-VN')}</div>
          <div className={`c num ${changePct >= 0 ? 'up' : 'down'}`}>{formatPct(changePct)}</div>
        </div>
      </div>

      <div className="ac-data-note" role="note">
        Giá tham chiếu từ Radar · chưa xác nhận realtime · chưa có timestamp dữ liệu
      </div>

      <div className="ac-evidence" aria-label={`Luận cứ cho ${ticker}`}>
        <div className="ac-evidence-head">
          <span>LUẬN CỨ RADAR</span>
          <b>{score}/{signalLabels.length}</b>
        </div>
        <ul>
          {evidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
          {core?.trendWarning && <li className="ac-warning">Cảnh báo xu hướng: {core.trendWarning}</li>}
          {core && evidence.length === 0 && !core.trendWarning && <li>Chưa có luận cứ hội tụ được cung cấp.</li>}
        </ul>
        <div className="ac-evidence-foot">Nguồn: Radar · chưa có dữ liệu vị thế danh mục</div>
      </div>

      <div className="ac-catalyst" aria-label={`Tin xúc tác cho ${ticker}`}>
        <div className="ac-evidence-head"><span>TIN XÚC TÁC</span>
          {catalyst && <b className={catalyst.direction === 'benefit' ? 'positive' : catalyst.direction === 'harm' ? 'negative' : ''}>
            {catalyst.direction === 'benefit' ? 'TÍCH CỰC' : catalyst.direction === 'harm' ? 'TIÊU CỰC' : 'TRUNG TÍNH'}
          </b>}
        </div>
        {catalyst ? (
          <>
            <a href={catalyst.sourceUrl} target="_blank" rel="noreferrer" className="ac-catalyst-title">
              {catalyst.sourceTitle}
            </a>
            <div className="ac-catalyst-meta">
              Tin cậy {catalyst.trustScore}/100 · Độ chính xác lịch sử nguồn {catalyst.sourceHistoricalAccuracy}% ({catalyst.sourceSampleSize} mẫu)
            </div>
            <div className="ac-catalyst-meta">Loại nguồn: {catalyst.sourceCategory} · Đối chiếu: {catalyst.corroborationCount} nguồn</div>
            <div className="ac-catalyst-meta">
              Phân tích {Math.round(catalyst.sentiment.confidence * 100)}% · {catalyst.sentiment.modelVersion}
              {catalyst.sentiment.disagreement >= 0.3 ? ' · Mô hình có bất đồng' : ''}
            </div>
            <div className="ac-catalyst-meta">
              Snapshot: {catalystSnapshot?.isStale ? 'CŨ · ' : ''}
              {catalystSnapshot?.scannedAt ? new Date(catalystSnapshot.scannedAt).toLocaleString('vi-VN') : 'thiếu thời điểm cập nhật'}
              {catalystSnapshot?.ageMinutes != null ? ` · ${Math.round(catalystSnapshot.ageMinutes)} phút trước` : ''}
            </div>
            <div className="ac-catalyst-meta">Audit: {catalyst.auditId} · Xác suất thắng lịch sử {catalyst.historicalWinRate}% (n={catalyst.historicalSampleSize})</div>
          </>
        ) : (
          <div className="ac-catalyst-meta">
            {catalystError ? 'Chưa tải được nguồn xúc tác; kiểm tra kết nối dữ liệu.' : catalystSnapshot ? 'Snapshot hiện không có tin xúc tác cho mã này.' : 'Đang tải nguồn xúc tác…'}
          </div>
        )}
      </div>

      <div className="ac-hold">Khung nắm giữ gợi ý: <b>{core?.holdSuggestion ?? 'Theo dõi — chưa đủ điều kiện hành động Core'}</b></div>

      <div className="ac-actions" aria-label="Ý định lệnh mô phỏng">
        <button type="button" className="ac-btn ac-buy" disabled={pending !== null} onClick={() => void runAction('buy')}>
          {pending === 'buy' ? 'ĐANG GỬI…' : 'Ý ĐỊNH MUA'}
        </button>
        <button type="button" className="ac-btn ac-sell" disabled={pending !== null} onClick={() => void runAction('sell')}>
          {pending === 'sell' ? 'ĐANG GỬI…' : 'Ý ĐỊNH BÁN'}
        </button>
        <button type="button" className="ac-btn ac-alert" disabled={alertBusy} onClick={() => document.getElementById('ac-alert-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          CẢNH BÁO
        </button>
      </div>

      <div className="ac-alerts">
        <div className="ac-evidence-head"><span>ĐIỀU KIỆN CẢNH BÁO</span><span>{alerts.length} đã lưu</span></div>
        <div className={`ac-worker-state ${workerHealthy ? 'healthy' : 'inactive'}`} role="status">
          <span className="ac-worker-dot" />
          {workerHealthy
            ? `WORKER ĐANG THEO DÕI · kiểm tra mỗi ${Math.round(workerStatus!.pollIntervalMs / 1000)} giây`
            : workerStatus?.lastCycleFailed
              ? 'WORKER GẶP LỖI · kiểm tra log backend'
              : workerStatus?.enabled && workerStatus.started
                ? workerStatus.radarAlertsEnabled
                  ? 'WORKER ĐANG KHỞI ĐỘNG · chờ lượt kiểm tra đầu tiên'
                  : 'WORKER ĐANG CHẠY · cảnh báo hội tụ vẫn khóa ở backend'
                : workerStatus
                  ? 'WORKER CHƯA BẬT · bật ALERT_WORKER_ENABLED=true'
                  : 'CHƯA KẾT NỐI ĐƯỢC WORKER · kiểm tra đăng nhập và backend'}
        </div>
        <form id="ac-alert-form" className="ac-alert-form" onSubmit={(event) => void saveAlert(event)}>
          <label className="sr-only" htmlFor="ac-alert-condition">Điều kiện cảnh báo</label>
          <select id="ac-alert-condition" value={alertCondition} onChange={(event) => {
            const next = event.target.value as AlertCondition;
            setAlertCondition(next);
            setAlertThreshold(next === 'convergence_at_least' ? '4' : next === 'change_pct_above' ? '5' : '100000');
          }}>
            <option value="price_above">Giá vượt</option>
            <option value="price_below">Giá thấp hơn</option>
            <option value="change_pct_above">Tăng từ (%)</option>
            <option value="convergence_at_least" disabled={!liveRadarAlertsEnabled}>Hội tụ đạt (1–6){liveRadarAlertsEnabled ? '' : ' · chưa khả dụng'}</option>
          </select>
          <input
            aria-label="Ngưỡng cảnh báo"
            type="number"
            min={alertCondition === 'convergence_at_least' ? 1 : alertCondition === 'change_pct_above' ? 0 : 0.01}
            max={alertCondition === 'convergence_at_least' ? 6 : alertCondition === 'change_pct_above' ? 100 : 1000000000}
            step={alertCondition === 'convergence_at_least' ? 1 : alertCondition === 'change_pct_above' ? 0.1 : 100}
            value={alertThreshold}
            onChange={(event) => setAlertThreshold(event.target.value)}
            required
          />
          <button type="submit" disabled={alertBusy || !alertThreshold}>LƯU</button>
        </form>
        {!liveRadarAlertsEnabled && <div className="ac-data-note">Cảnh báo hội tụ tạm khóa khi Radar chưa nhận feed live hoặc chưa bật đồng bộ frontend/backend. Cảnh báo theo giá vẫn khả dụng.</div>}
        {alerts.map((alert) => (
          <div className="ac-alert-row" key={alert.id}>
            <span>{alert.ticker} · {alert.condition.replace(/_/g, ' ')} {alert.threshold} · {alert.state === 'pending' ? 'chờ worker' : alert.state === 'active' ? 'đang theo dõi' : alert.state === 'triggered' ? 'đã kích hoạt' : 'tạm dừng'}</span>
            <button type="button" aria-label={`Xóa cảnh báo ${alert.ticker}`} disabled={alertBusy} onClick={() => void removeAlert(alert.id)}>×</button>
          </div>
        ))}
        {alertMessage && <div className="ac-alert-message" role="status" aria-live="polite">{alertMessage}</div>}
        {!alertMessage && !alertBusy && alerts.length === 0 && <div className="ac-catalyst-meta">Chưa có điều kiện nào được lưu cho mã này.</div>}
        {alertEvents.slice(0, 2).map((event) => (
          <div className="ac-triggered-event" key={event.id} role="status">
            <b>ĐÃ CHẠM NGƯỠNG</b> · {event.ticker} {event.condition.replace(/_/g, ' ')}: {event.observed_value.toFixed(2)}
            <span>{event.provider}{event.market_price !== null ? ` · giá ${event.market_price.toLocaleString('vi-VN')}` : ''} · {new Date(event.quote_at).toLocaleString('vi-VN')}</span>
          </div>
        ))}
        <div className="ac-evidence-foot">Giá lấy từ Yahoo Finance, bỏ qua báo giá cũ quá 30 phút. Hội tụ lấy từ snapshot Radar phía app, bỏ qua snapshot cũ quá 15 phút. Sự kiện được lưu để xem khi mở lại app.</div>
      </div>

      {currentStatus && (
        <div className={`ac-action-status ${currentStatus.kind}`} role="status" aria-live="polite">
          {currentStatus.message}
        </div>
      )}
      <div className="ac-disclaimer">Thao tác hiện chỉ mô phỏng; chưa gửi lệnh tới công ty chứng khoán.</div>
    </section>
  );
}
