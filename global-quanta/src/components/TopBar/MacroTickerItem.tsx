import { memo } from 'react';
import Sparkline from './Sparkline';
import { usePriceTick } from '../../hooks/usePriceTick';
import { usePriceFlash } from '../../hooks/usePriceFlash';
import { formatPct } from '../../utils/formatNumber';
import type { MacroTickerData } from '../../types';

interface Props {
  data: MacroTickerData;
}

function MacroTickerItem({ data }: Props) {
  const isNumeric = typeof data.value === 'number';
  const livePrice = usePriceTick(isNumeric ? (data.value as number) : 0, isNumeric);
  const flash = usePriceFlash(Math.round(livePrice * 10));
  const up = (data.changePct ?? 0) >= 0;

  return (
    <div className="ticker-item">
      <span className="t-name">{data.name}</span>
      <Sparkline data={data.sparkline} color={up ? 'positive' : 'negative'} />
      <span className={`t-val num ${flash ? `flash-${flash}` : ''}`}>{isNumeric ? livePrice.toFixed(1) : data.value}</span>
      <span className={`t-chg num ${up ? 'up' : 'down'}`}>
        {data.changePct !== undefined ? formatPct(data.changePct) : formatPct(data.changeAbs ?? 0)}
      </span>
    </div>
  );
}

export default memo(MacroTickerItem);
