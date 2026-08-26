import { useEffect, useState } from 'react';
import RegimeBadge from './RegimeBadge';
import VnIndexHero from './VnIndexHero';
import MacroTickerItem from './MacroTickerItem';
import MarketBreadth from './MarketBreadth';
import LiquidityCheckBadge from './LiquidityCheckBadge';
import SessionClock from './SessionClock';
import { SearchBar, NotificationBell, UserAvatar } from './TopRightControls';
import * as api from '../../services/api';
import type { VnIndexData, MacroTickerData, LiquidityData } from '../../types';

export default function TopBar() {
  const [regime, setRegime] = useState<'RISK_ON' | 'RISK_OFF' | 'NEUTRAL'>('NEUTRAL');
  const [vnIndex, setVnIndex] = useState<VnIndexData | null>(null);
  const [tickers, setTickers] = useState<MacroTickerData[]>([]);
  const [breadth, setBreadth] = useState({ advancers: 0, decliners: 0 });
  const [liquidity, setLiquidity] = useState<LiquidityData | null>(null);
  const [sessions, setSessions] = useState<Record<string, 'open' | 'closed'>>({});

  useEffect(() => {
    api.fetchRegime().then((r) => setRegime(r.state));
    api.fetchVnIndex().then(setVnIndex);
    api.fetchMacroTickers().then(setTickers);
    api.fetchBreadth().then(setBreadth);
    api.fetchLiquidity1030().then(setLiquidity);
    api.fetchSessions().then(setSessions);
  }, []);

  return (
    <div className="topbar">
      <div className="logo">
        <div className="mark">GQ</div>GLOBAL QUANTA
      </div>

      <RegimeBadge state={regime} />

      {vnIndex && <VnIndexHero data={vnIndex} />}

      <div className="tickers">
        {tickers.map((t) => (
          <MacroTickerItem key={t.name} data={t} />
        ))}
      </div>

      <MarketBreadth advancers={breadth.advancers} decliners={breadth.decliners} />
      {liquidity && <LiquidityCheckBadge data={liquidity} />}
      <SessionClock sessions={sessions} />

      <div className="top-right">
        <SearchBar />
        <NotificationBell />
        <UserAvatar />
      </div>
    </div>
  );
}
