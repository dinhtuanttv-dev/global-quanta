import { useAppStore } from '../../store/useAppStore';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatPct } from '../../utils/formatNumber';
import * as api from '../../services/api';
import { isMarketGatewayEnabled } from '../../services/marketDataClient';
import { useResearchSymbol } from '../../hooks/useResearch';
import { AdaptiveScoreBody } from '../MainTabs/SieuQuetAI/AdaptiveScoreCard';
import { useRadarModel } from '../../hooks/useRadarModel';
import { useSieuQuetScanner } from '../../hooks/useSieuQuetScanner';
import { CORE_MIN } from '../../lib/radarModel';

export default function ActionCenter() {
  const { selectedTicker, showToast } = useAppStore();
  const live = useAppStore((s) => s.livePrices);
  const radar = useRadarModel();
  const { items } = useSieuQuetScanner();

  // Mã đang chọn: ưu tiên dữ liệu Radar (★ Danh mục); mã ngoài danh mục thì lấy từ Bảng Siêu Quét.
  const core = radar.core.find((n) => n.ticker === selectedTicker);
  const ring = radar.ring.find((n) => n.ticker === selectedTicker);
  const scored = radar.scored.find((x) => x.ticker === selectedTicker) ?? null;
  const item = scored?.item ?? items.find((i) => i.ticker === selectedTicker) ?? null;
  const known = Boolean(selectedTicker && (core || ring || scored || item));

  const basePrice = live[selectedTicker ?? '']?.price ?? core?.price ?? ring?.price ?? item?.price ?? 0;
  const livePrice = usePriceTick(basePrice, known);
  const research = useResearchSymbol(known ? selectedTicker : null);

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

  if (!known) {
    return (
      <div className="panel-block">
        <div className="panel-head"><div className="panel-title">ACTION CENTER <span className="ai-chip">AI</span></div></div>
        <div className="ac-hold">Chọn 1 mã trên Radar hoặc bấm một dòng trong Bảng Siêu Quét để xem chi tiết hành động.</div>
      </div>
    );
  }

  const ticker = selectedTicker!;
  const changePct = live[ticker]?.changePct ?? core?.changePct ?? ring?.changePct ?? item?.changePct ?? 0;
  // Chế độ Gateway: chỉ hiển thị giá khi đã có giá thật, không hiển thị giá mẫu.
  const hasRealPrice = !isMarketGatewayEnabled() || Boolean(live[ticker] || core?.livePrice || ring?.livePrice || item?.price);
  const score = scored?.score ?? null;
  const stateLine = core
    ? `${core.state === 'stable' ? '🛡' : core.state === 'breakout' ? '⚡' : '⚠'} ${core.stateLabel} · Core ${score}/6`
    : score !== null
      ? `Ring · ${score}/6 tiêu chí hội tụ — còn ${Math.max(0, CORE_MIN - score)} tiêu chí để vào Core`
      : `Ngoài ★ ${radar.listName} — ☆ thêm vào danh mục để Radar chấm hội tụ`;
  const holdLine = core ? core.holdSuggestion : 'Theo dõi — chưa đủ điều kiện hành động Core';
  const subtitle = item?.companyName ?? core?.name ?? item?.industry ?? ring?.sector ?? '';

  return (
    <div className="panel-block">
      <div className="panel-head"><div className="panel-title">ACTION CENTER <span className="ai-chip">AI</span></div></div>
      <div className="ac-selected">
        <div className="ac-avatar">{ticker}</div>
        <div className="ac-info">
          <b>{ticker}{subtitle ? ` — ${subtitle}` : ''}</b>
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
          <div style={{ marginBottom: 4 }}>Điểm dòng tiền thích ứng (AI tự học) — xác suất mạnh hơn trung vị thị trường:</div>
          <AdaptiveScoreBody data={research.data} compact />
        </div>
      )}
    </div>
  );
}
