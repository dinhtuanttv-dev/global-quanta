// TOPBAR — chế độ thị trường (spec §6.1, §7.6): Risk-On Index (DXY / VIX / US10Y) KHÔNG ĐẠT kiểm định đặt trước -> luôn gắn
// nhãn "MÔ TẢ"; thiếu dữ liệu -> "Chưa xác định" (không mặc định Trung lập). Bấm mở phần giải thích.
import Popover, { PopTrigger, usePopover } from './Popover';
import { describeMeta } from './StatusTag';
import type { Block, RegimeData } from '../../hooks/useTopbar';

const LABEL: Record<RegimeData['state'], string> = { RISK_ON: 'RISK-ON', RISK_OFF: 'RISK-OFF', NEUTRAL: 'TRUNG LẬP', UNKNOWN: 'CHƯA XÁC ĐỊNH' };

export default function RegimeBadge({ block }: { block: Block<RegimeData> }) {
  const pop = usePopover();
  const state = block.data?.state ?? 'UNKNOWN';
  return (
    <>
      <PopTrigger pop={pop} label={`Chế độ thị trường: ${LABEL[state]} (mô tả, chưa kiểm định đạt)`} className={`regime-badge regime-${state.toLowerCase()}`}>
        <span className="dot" aria-hidden />{LABEL[state]}<span className="regime-tag">MÔ TẢ</span>
      </PopTrigger>
      <Popover pop={pop} title="Chế độ thị trường (Risk-On)">
        <div className="tb-note" data-testid="tb-regime-detail">
          {block.data?.score != null && <p><b>{LABEL[state]}</b> · điểm {block.data.score}/100 (≥ 65 Risk-On, ≤ 35 Risk-Off)</p>}
          {block.data?.inputs && <p>DXY {block.data.inputs.dxy.toFixed(2)} · VIX {block.data.inputs.vix.toFixed(2)} · US10Y {block.data.inputs.treasury10y.toFixed(2)}%</p>}
          <p className="tb-warn">{block.data?.evidence.note ?? 'Chưa có dữ liệu.'}</p>
          <p className="tb-muted">{describeMeta(block.meta)}</p>
        </div>
      </Popover>
    </>
  );
}
