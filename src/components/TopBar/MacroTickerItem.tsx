import { memo } from 'react';
import Sparkline from './Sparkline';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatPct } from '../../utils/formatNumber';
import type { MacroTickerData } from '../../types';

interface Props {
  data: MacroTickerData;
}

function MacroTickerItem({ data }: Props) {
  const isNumeric = typeof data.value === 'number';
  const livePrice = usePriceTick(null, isNumeric ? (data.value as number) : 0);
  const up = (data.changePct ?? 0) >= 0;

  return (
    <div className="ticker-item">
      <span className="t-name">{data.name}</span>
      <Sparkline data={data.sparkline} color={up ? 'positive' : 'negative'} />
      <span className="t-val num">{isNumeric ? livePrice.toFixed(1) : data.value}</span>
      <span className={`t-chg num ${up ? 'up' : 'down'}`}>
        {data.changePct !== undefined ? formatPct(data.changePct) : formatPct(data.changeAbs ?? 0)}
      </span>
    </div>
  );
}

// memo — chỉ re-render khi chính ticker này đổi dữ liệu gốc, không theo tick nội bộ của ticker khác
export default memo(MacroTickerItem);
