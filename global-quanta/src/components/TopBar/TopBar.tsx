import { useMemo } from 'react';
import RegimeBadge from './RegimeBadge';
import VnIndexHero from './VnIndexHero';
import MacroTickerItem from './MacroTickerItem';
import MarketBreadth from './MarketBreadth';
import LiquidityCheckBadge from './LiquidityCheckBadge';
import SessionClock from './SessionClock';
import { SearchBar, NotificationBell, UserAvatar } from './TopRightControls';
import { useVnIndexReal } from '../../hooks/useVnIndexReal';
import { useMacroDailyChange } from '../../hooks/useMacroDailyChange';
import { useMarketBreadthReal } from '../../hooks/useMarketBreadthReal';
import { useMacroHistory } from '../../hooks/useMacroHistory';
import { computeSessions } from '../../utils/computeSessions';
import type { MacroTickerData, VnIndexData } from '../../types';
import './topbar-pro.css';

export default function TopBar() {
  const vnIndexReal = useVnIndexReal();
  const macro = useMacroDailyChange();
  const macroHistory = useMacroHistory();
  const breadth = useMarketBreadthReal();
  const sessions = useMemo(() => computeSessions(), []);

  const macroTickers: MacroTickerData[] = useMemo(() => {
    if (!macro) return [];
    return [
      { name: 'DXY', value: macro.dxy.value, changePct: macro.dxy.changePct ?? 0, sparkline: macroHistory?.dxy ?? [] },
      { name: 'US 10Y', value: `${macro.treasury10y.value.toFixed(2)}%`, changePct: macro.treasury10y.changePct ?? 0, sparkline: macroHistory?.treasury10y ?? [] },
      { name: 'GOLD', value: macro.gold.value, changePct: macro.gold.changePct ?? 0, sparkline: macroHistory?.gold ?? [] },
    ];
  }, [macro, macroHistory]);

  const regime = macro?.riskStatus ?? 'NEUTRAL';

  const gtDisplay = vnIndexReal?.estimatedValueBillionVnd
    ? `~${vnIndexReal.estimatedValueBillionVnd.toLocaleString('vi-VN')} tỷ (ước tính)`
    : '--';

  const vnIndexData: VnIndexData | null = vnIndexReal
    ? {
        value: vnIndexReal.value,
        changeAbs: vnIndexReal.changeAbs,
        changePct: vnIndexReal.changePct,
        sparkline: vnIndexReal.sparkline,
        volumeShares: vnIndexReal.volumeShares,
        valueVND: gtDisplay,
        compare: [],
        compareNote: 'Du lieu so sanh VN30/HNX/UPCOM dang duoc phat trien.',
      }
    : null;

  return (
    <div className="topbar topbar-pro">
      <div className="tb-zone tb-zone-left">
        <div className="logo">
          <div className="mark">GQ</div>
          <span>GLOBAL QUANTA</span>
        </div>
        <RegimeBadge state={regime} />
      </div>

      <div className="tb-zone tb-zone-center">
        {vnIndexData && <VnIndexHero data={vnIndexData} valueMethodology={vnIndexReal?.valueMethodology ?? null} />}
        <div className="tickers ticker-strip">
          {macroTickers.map((t) => (
            <MacroTickerItem key={t.name} data={t} />
          ))}
        </div>
      </div>

      <div className="tb-zone tb-zone-right">
        <MarketBreadth advancers={breadth.advancers} decliners={breadth.decliners} />
        <LiquidityCheckBadge />
        <SessionClock sessions={sessions} />
        <div className="top-right">
          <SearchBar />
          <NotificationBell />
          <UserAvatar />
        </div>
      </div>
    </div>
  );
}
