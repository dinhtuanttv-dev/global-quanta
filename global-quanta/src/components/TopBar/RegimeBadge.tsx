// TOPBAR — chế độ thế giới từ cấu trúc kỳ hạn biến động VIX / VIX3M (VT1, thay Risk-On đã KHÔNG ĐẠT); chưa kiểm định đặt trước -> luôn gắn
// nhãn "MÔ TẢ"; thiếu dữ liệu -> "Chưa xác định" (không mặc định Trung lập). Bấm mở phần giải thích.
import Popover, { PopTrigger, usePopover } from './Popover';
import { describeMeta } from './StatusTag';
import type { Block, RegimeData } from '../../hooks/useTopbar';

const LABEL: Record<RegimeData['state'], string> = { RISK_ON: 'THẾ GIỚI RISK-ON', RISK_OFF: 'THẾ GIỚI RISK-OFF', NEUTRAL: 'THẾ GIỚI TRUNG LẬP', UNKNOWN: 'CHƯA XÁC ĐỊNH' };

export default function RegimeBadge({ block }: { block: Block<RegimeData> }) {
  const pop = usePopover();
  const state = block.data?.state ?? 'UNKNOWN';
  return (
    <>
      <PopTrigger pop={pop} label={`Chế độ thị trường: ${LABEL[state]} (mô tả, chưa kiểm định đạt)`} className={`regime-badge regime-${state.toLowerCase()}`}>
        <span className="dot" aria-hidden />{LABEL[state]}<span className="regime-tag">MÔ TẢ</span>
      </PopTrigger>
      <Popover pop={pop} title="Chế độ thế giới (cấu trúc kỳ hạn VIX)">
        <div className="tb-note" data-testid="tb-regime-detail">
          {block.data?.volTerm && <p data-testid="tb-volterm"><b>{block.data.volTerm.stateVi}</b> · VIX {block.data.volTerm.vix.toFixed(2)} / VIX3M {block.data.volTerm.vix3m.toFixed(2)} → VolSlope {(block.data.volTerm.slope * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% (contango dưới −5%, backwardation trên +5%)</p>}
          <p className="tb-warn">{block.data?.evidence.note ?? 'Chưa có dữ liệu.'}</p>
          <p className="tb-muted">{describeMeta(block.meta)}</p>
        </div>
      </Popover>
    </>
  );
}
