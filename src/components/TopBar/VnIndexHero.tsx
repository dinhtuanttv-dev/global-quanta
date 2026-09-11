import Sparkline from './Sparkline';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatSignedInt, formatPct } from '../../utils/formatNumber';
import type { VnIndexData } from '../../types';

interface Props {
  data: VnIndexData;
}

// FIX (2026-09-10, LAN CUOI - DUNG VI TRI): DA GO BO hoan toan dropdown
// "SO SANH CHI SO" (IndexCompareDropdown) - truoc day render VO DIEU KIEN.
// File nay nam o THU MUC GOC THAT SU cua repo (C:\...\global-quanta-react_1\
// src\...) - noi Vercel THAT SU build (Root Directory="./"), KHAC voi
// "global-quanta\src\" (thu muc con) noi da bi sua NHAM suot ca ngay truoc do.
export default function VnIndexHero({ data }: Props) {
  const livePrice = usePriceTick(null, data.value);
  const up = data.changePct >= 0;

  return (
    <div className="vn-hero">
      <div className="vn-hero-main">
        <span className="vn-hero-name">VN-INDEX</span>
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
    </div>
  );
}
