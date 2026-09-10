import Sparkline from './Sparkline';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatSignedInt, formatPct } from '../../utils/formatNumber';
import type { VnIndexData } from '../../types';

interface Props {
  data: VnIndexData;
  valueMethodology?: string | null;
}

// FIX (2026-09-10): DA GO BO hoan toan dropdown "SO SANH CHI SO"
// (IndexCompareDropdown) - ban nay TRUOC DAY render no VO DIEU KIEN
// (khong co hover/click/state gi ca), la nguyen nhan THAT SU khien no
// luon hien tren production suot ca ngay du sua CSS/hover/click nhieu
// lan o ban khac (global-quanta/src/) khong lien quan gi den ban nay -
// Vercel build tu chinh thu muc goc "src/" nay, khong phai
// "global-quanta/src/".
//
// FIX (lan 2): dung dung 1-arg form usePriceTick(data.value) - tuong
// thich voi CA HAI phien ban co the co cua hook nay (ban don gian cu
// "usePriceTick(basePrice, active?)" LAN ban overload phuc tap moi hon)
// - tranh phu thuoc vao overload "usePriceTick(null, basePrice)" co the
// khong ton tai tren may ban tuy phien ban hook thuc te. Props them
// "valueMethodology?" optional de tuong thich voi ca 2 cach TopBar.tsx
// co the goi component nay.
export default function VnIndexHero({ data, valueMethodology }: Props) {
  const livePrice = usePriceTick(data.value);
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
