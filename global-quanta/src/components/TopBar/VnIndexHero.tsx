import Sparkline from './Sparkline';
import IndexCompareDropdown from './IndexCompareDropdown';
import { usePriceTick } from '../../hooks/usePriceTick';
import { usePriceFlash } from '../../hooks/usePriceFlash';
import { useIndicesCompare } from '../../hooks/useIndicesCompare';
import { generateCompareNote } from '../../utils/generateCompareNote';
import { formatSignedInt, formatPct } from '../../utils/formatNumber';
import type { VnIndexData } from '../../types';

interface Props {
  data: VnIndexData;
  valueMethodology?: string | null;
}

export default function VnIndexHero({ data, valueMethodology }: Props) {
  const livePrice = usePriceTick(data.value);
  const flash = usePriceFlash(Math.round(livePrice * 10));
  const up = data.changePct >= 0;
  const compare = useIndicesCompare();
  const note = generateCompareNote(data.changePct, compare);

  return (
    <div className="vn-hero">
      <div className="vn-hero-main">
        <span className="vn-hero-name">VN-INDEX <span className="vn-hero-caret">▾</span></span>
        <div className="vn-hero-valrow">
          <span className={`vn-hero-val num ${flash ? `flash-${flash}` : ''}`}>{livePrice.toFixed(1)}</span>
          <span className={`vn-hero-chg num ${up ? 'up' : 'down'}`}>
            {formatSignedInt(data.changeAbs)} ({formatPct(data.changePct)})
          </span>
        </div>
      </div>
      <Sparkline data={data.sparkline} width={76} height={28} color={up ? 'positive' : 'negative'} />
      <div className="vn-hero-meta">
        <span>KL <b>{data.volumeShares}</b></span>
        <span
          className={valueMethodology ? "vn-hero-gt-estimated" : undefined}
          title={valueMethodology ?? undefined}
        >
          GT <b>{data.valueVND}</b>{valueMethodology && <span className="vn-hero-info-icon">ⓘ</span>}
        </span>
      </div>
      <IndexCompareDropdown compare={compare} note={note} loading={compare.length === 0} />
    </div>
  );
}
