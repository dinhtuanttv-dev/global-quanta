import { memo } from "react";
import type { Tang1Stock, Tang1ScenarioStock } from "../../../types/tang1";

interface Props {
  stock: Tang1Stock | Tang1ScenarioStock;
  rank: number;
  showScenarioScore: boolean;
}

function hasScenarioScore(s: Tang1Stock | Tang1ScenarioStock): s is Tang1ScenarioStock {
  return "scenarioScore" in s;
}

function Tang1TableRow({ stock, rank, showScenarioScore }: Props) {
  const epsUp = stock.epsGrowth >= 0;
  const scenarioScore = hasScenarioScore(stock) ? stock.scenarioScore : null;

  return (
    <tr className="tang1-row">
      <td className="t1-rank">{rank}</td>
      <td>
        <span className="t1-ticker-code">{stock.ticker}</span>
        <span className="t1-sector">{stock.sector}</span>
      </td>
      <td className={`t1-num ${epsUp ? "up" : "down"}`}>
        {epsUp ? "+" : ""}{stock.epsGrowth.toFixed(1)}%
      </td>
      <td className="t1-num">{stock.faScore}</td>
      <td className="t1-num">{stock.tang1Score.toFixed(1)}</td>
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
