import Sparkline from './Sparkline';
import IndexCompareDropdown from './IndexCompareDropdown';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatSignedInt, formatPct } from '../../utils/formatNumber';
import type { VnIndexData } from '../../types';

interface Props {
  data: VnIndexData;
}

export default function VnIndexHero({ data }: Props) {
  const livePrice = usePriceTick(data.value);
  const up = data.changePct >= 0;

  return (
    <div className="vn-hero">
      <div className="vn-hero-main">
        <span className="vn-hero-name">VN-INDEX <span className="vn-hero-caret">▾</span></span>
        <div className="vn-hero-valrow">
          <span className="vn-hero-val num">{livePrice.toFixed(1)}</span>
          <span className={`vn-hero-chg num ${up ? 'up' : 'down'}`}>
            {formatSignedInt(data.changeAbs)} ({formatPct(data.changePct)})
          </span>
        </div>
      </div>
      <Sparkline data={data.sparkline} width={76} height={28} color={up ? 'positive' : 'negative'} />
      <div className="vn-hero-meta">
        <span>KL <b>{data.volumeShares}</b></span>
        <span>GT <b>{data.valueVND}</b></span>
      </div>
      <IndexCompareDropdown compare={data.compare} note={data.compareNote} />
    </div>
  );
}
