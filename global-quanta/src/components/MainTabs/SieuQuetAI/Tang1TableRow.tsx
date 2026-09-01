/**
 * Tang1TableRow.tsx - V11.0 Enhanced
 */
import { memo } from "react";
import type { Tang1Stock, Tang1ScenarioStock } from "../../../types/tang1";
import type { LivePrice } from "./livePriceApi";
import type { ConfluenceData } from "./ConfluenceScore";
import type { PatternData } from "./PatternBadge";
import type { RSRatingData } from "./RSRating";

interface Props {
  stock: Tang1Stock | Tang1ScenarioStock;
  rank: number;
  showScenarioScore: boolean;
  livePrice?: LivePrice | null;
  showLivePrice?: boolean;
  showV11?: boolean;
  confluence?: ConfluenceData;
  pattern?: PatternData | null;
  rsData?: RSRatingData | null;
  onClick?: () => void;
}

function hasScenarioScore(s: Tang1Stock | Tang1ScenarioStock): s is Tang1ScenarioStock {
  return "scenarioScore" in s;
}

function Tang1TableRow({ 
  stock, rank, showScenarioScore,
  livePrice, showLivePrice = false,
  showV11 = false, confluence, pattern, rsData, onClick
}: Props) {
  const epsUp = stock.epsGrowth >= 0;
  const scenarioScore = hasScenarioScore(stock) ? stock.scenarioScore : null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--positive)';
    if (score >= 60) return '#6BCB77';
    if (score >= 40) return '#FFD93D';
    return 'var(--negative)';
  };

  const getPatternLabel = (p: PatternData | null | undefined) => {
    if (!p) return '--';
    const labels: Record<string, string> = {
      VCP: 'VCP', WYCKOFF_ACCUM: 'WykA', ELLIOTT_3: 'W3',
      BREAKOUT: 'BO', GOLDEN_CROSS: 'GX', DIV_RSI: 'Div'
    };
    return labels[p.type as string] || p.type;
  };

  return (
    <tr className="tang1-row" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <td className="t1-rank">{rank}</td>
      <td>
        <span className="t1-ticker-code">{stock.ticker}</span>
        <span className="t1-sector">{stock.sector}</span>
      </td>
      {showLivePrice && (
        <td className="t1-num">
          {livePrice?.price !== null ? (
            <span>{livePrice?.price?.toLocaleString('vi-VN')}</span>
          ) : <span className="t1-price-loading">--</span>}
          {livePrice?.changePct !== null && (
            <span className={`t1-pct ${(livePrice?.changePct ?? 0) >= 0 ? 'up' : 'down'}`}>
              {(livePrice?.changePct ?? 0) >= 0 ? '+' : ''}{(livePrice?.changePct ?? 0).toFixed(1)}%
            </span>
          )}
        </td>
      )}
      <td className={`t1-num ${epsUp ? "up" : "down"}`}>
        {epsUp ? "+" : ""}{stock.epsGrowth.toFixed(1)}%
      </td>
      <td className="t1-num">{stock.faScore}</td>
      <td className="t1-num">{stock.tang1Score.toFixed(1)}</td>
      {showV11 && (
        <>
          <td className="t1-num">
            {confluence ? (
              <span style={{ color: getScoreColor(confluence.totalScore), fontWeight: 700 }}>
                {confluence.totalScore}
              </span>
            ) : '--'}
          </td>
          <td className="t1-num">
            {rsData ? (
              <span style={{ color: getScoreColor(rsData.rsRating) }} className={rsData.isElite ? 'elite-star' : ''}>
                {rsData.isElite ? '⭐' : ''}{rsData.rsRating}
              </span>
            ) : '--'}
          </td>
          <td className="t1-num">
            <span className={`pattern-badge ${pattern?.isBullish ? 'bull' : 'bear'}`}>
              {getPatternLabel(pattern)}
            </span>
          </td>
        </>
      )}
      {showScenarioScore && (
        <td className="t1-scenario-cell">
          {scenarioScore !== null ? (
            <div className="t1-scenario-bar-wrap">
              <div className="t1-scenario-bar" style={{ width: `${scenarioScore}%` }} />
              <span className="t1-scenario-val">{scenarioScore}</span>
            </div>
          ) : "-"}
        </td>
      )}
    </tr>
  );
}

export default memo(Tang1TableRow);

