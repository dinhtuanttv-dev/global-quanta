// TOPBAR — một ticker vĩ mô (spec §6.3): giá + đơn vị + thay đổi + sparkline 1 tháng + trạng thái riêng (Yahoo chậm ~15 phút,
// ngoài phiên = giá đóng cửa). Thiếu % thay đổi -> "—" (không hiện 0%). Lỗi -> thẻ lỗi, không số 0.
import { memo } from 'react';
import Sparkline from './Sparkline';
import StatusTag, { describeMeta } from './StatusTag';
import type { Block, MacroData } from '../../hooks/useTopbar';

function MacroTickerItem({ block, fallbackLabel }: { block: Block<MacroData>; fallbackLabel: string }) {
  const d = block.data;
  const up = (d?.changePct ?? 0) >= 0;
  const value = d ? `${d.value.toLocaleString('vi-VN', { minimumFractionDigits: d.digits, maximumFractionDigits: d.digits })}${d.unit === '%' ? '%' : ''}` : '—';
  return (
    <div className="ticker-item" title={describeMeta(block.meta)} data-testid={`tb-macro-${d?.symbol ?? fallbackLabel}`}>
      <span className="t-name">{d?.label ?? fallbackLabel}</span>
      {d && d.series.length >= 2 && <Sparkline data={d.series.map((p) => p.value)} color={up ? 'positive' : 'negative'} />}
      <span className="t-val num">{value}</span>
      <span className={`t-chg num ${d?.changePct == null ? '' : up ? 'up' : 'down'}`}>
        {d?.changePct == null ? '—' : `${d.changePct >= 0 ? '+' : ''}${d.changePct.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`}
      </span>
      <StatusTag meta={block.meta} compact />
    </div>
  );
}

export default memo(MacroTickerItem);
