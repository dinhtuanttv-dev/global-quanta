import Sparkline from './Sparkline';
import { usePriceTick } from '../../hooks/usePriceTick';
import { usePriceFlash } from '../../hooks/usePriceFlash';
import { formatSignedInt, formatPct } from '../../utils/formatNumber';
import type { VnIndexData } from '../../types';

interface Props {
  data: VnIndexData;
  valueMethodology?: string | null;
}

// FIX (2026-09-10): DA GO BO hoan toan tinh nang dropdown "SO SANH CHI SO"
// (VN30/HNX-Index/UPCOM). Sau nhieu lan sua (CSS trung lap, z-index, doi
// tu hover sang click) ma loi hien thi van lap lai giong het nhau tren
// production du code/deploy da duoc xac nhan dung qua GitHub + Vercel
// dashboard - quyet dinh an toan nhat la go bo hoan toan tinh nang nay
// thay vi tiep tuc vá mot co che dang cu xu bat thuong khong xac dinh
// duoc nguyen nhan goc tu xa. Chi giu lai phan hien thi VN-INDEX co ban.
export default function VnIndexHero({ data, valueMethodology }: Props) {
  const livePrice = usePriceTick(data.value);
  const flash = usePriceFlash(Math.round(livePrice * 10));
  const up = data.changePct >= 0;

  return (
    <div className="vn-hero">
      <div className="vn-hero-main">
        <span className="vn-hero-name">VN-INDEX</span>
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
    </div>
  );
}
