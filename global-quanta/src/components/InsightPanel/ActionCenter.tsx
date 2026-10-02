import { useAppStore } from '../../store/useAppStore';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatPct } from '../../utils/formatNumber';
import * as api from '../../services/api';
import { isMarketGatewayEnabled } from '../../services/marketDataClient';
import { useResearchSymbol } from '../../hooks/useResearch';
import { AdaptiveScoreBody } from '../MainTabs/SieuQuetAI/AdaptiveScoreCard';

export default function ActionCenter() {
  const { radarCore, radarRing, selectedTicker, showToast } = useAppStore();

  const core = radarCore.find((n) => n.ticker === selectedTicker);
  const ring = radarRing.find((n) => n.ticker === selectedTicker);

  const livePrice = usePriceTick(core?.price ?? ring?.price ?? 0, !!(core || ring));
  const research = useResearchSymbol(core || ring ? selectedTicker : null);

  const handleOrder = (side: 'buy' | 'sell') => {
    if (!selectedTicker) return;
    api.placeOrderIntent(selectedTicker, side);
    showToast(`Đã ghi nhận ý định ${side === 'buy' ? 'MUA' : 'BÁN'} ${selectedTicker} (demo).`);
  };

  const handleAlert = () => {
    if (!selectedTicker) return;
    api.createAlert(selectedTicker);
    showToast(`Đã đặt cảnh báo cho ${selectedTicker}.`);
  };

  if (!core && !ring) {
    return (
      <div className="panel-block">
        <div className="panel-head"><div className="panel-title">ACTION CENTER <span className="ai-chip">AI</span></div></div>
        <div className="ac-hold">Chọn 1 mã trên Radar để xem chi tiết hành động.</div>
      </div>
    );
  }

  const ticker = core?.ticker ?? ring?.ticker ?? '';
  const changePct = core?.changePct ?? ring?.changePct ?? 0;
  // Chế độ Gateway: chỉ hiển thị giá khi đã có giá thật, không hiển thị giá mẫu.
  const hasRealPrice = !isMarketGatewayEnabled() || Boolean(core?.livePrice ?? ring?.livePrice);
  const stateLine = core
    ? `${core.state === 'stable' ? '🛡' : core.state === 'breakout' ? '⚡' : '⚠'} ${core.stateLabel}`
    : `Ring · ${ring!.score}/6 điểm hội tụ — còn ${6 - ring!.score} điểm để vào Core`;
  const holdLine = core ? core.holdSuggestion : 'Theo dõi — chưa đủ điều kiện hành động Core';

  return (
    <div className="panel-block">
      <div className="panel-head"><div className="panel-title">ACTION CENTER <span className="ai-chip">AI</span></div></div>
      <div className="ac-selected">
        <div className="ac-avatar">{ticker}</div>
        <div className="ac-info">
          <b>{ticker}{core ? ` — ${core.name}` : ` — ${ring!.sector}`}</b>
          <span>{stateLine}</span>
        </div>
        <div className="ac-price">
          <div className="p num" title={hasRealPrice ? undefined : 'Đang chờ giá thật từ SSI'}>{hasRealPrice ? livePrice.toLocaleString('vi-VN') : '—'}</div>
          <div className={`c num ${changePct >= 0 ? 'up' : 'down'}`}>{hasRealPrice ? formatPct(changePct) : ''}</div>
        </div>
      </div>
      <div className="ac-actions">
        <div className="ac-btn ac-buy" onClick={() => handleOrder('buy')}>MUA</div>
        <div className="ac-btn ac-sell" onClick={() => handleOrder('sell')}>BÁN</div>
        <div className="ac-btn ac-alert" onClick={handleAlert}>⏰ CẢNH BÁO</div>
      </div>
      <div className="ac-hold">Gợi ý khung nắm giữ: <b>{holdLine}</b></div>
      {research.data?.asOf && (
        <div className="ac-hold" style={{ fontFamily: 'inherit' }}>
          <div style={{ marginBottom: 4 }}>Điểm dòng tiền thích ứng (AI tự học) — xác suất vượt VN-Index:</div>
          <AdaptiveScoreBody data={research.data} compact />
        </div>
      )}
    </div>
  );
}
