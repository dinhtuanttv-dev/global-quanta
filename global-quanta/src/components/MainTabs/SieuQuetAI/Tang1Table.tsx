/**
 * Tang1Table.tsx - V11.0 Enhanced
 */
import Tang1TableRow from "./Tang1TableRow";
import type { Tang1Stock, Tang1ScenarioStock } from "../../../types/tang1";
import type { LivePriceResponse } from "./livePriceApi";
import type { ConfluenceData } from "./ConfluenceScore";
import type { PatternData } from "./PatternBadge";
import type { RSRatingData } from "./RSRating";

interface Props {
  rows: (Tang1Stock | Tang1ScenarioStock)[];
  showScenarioScore: boolean;
  livePrices?: LivePriceResponse;
  showLivePrice?: boolean;
  showV11?: boolean;
  onRowClick?: (ticker: string) => void;
  confluenceData?: Record<string, ConfluenceData>;
  patternData?: Record<string, PatternData | null>;
  rsData?: Record<string, RSRatingData>;
}

export default function Tang1Table({ 
  rows, 
  showScenarioScore,
  livePrices = {},
  showLivePrice = false,
  showV11 = false,
  onRowClick,
  confluenceData = {},
  patternData = {},
  rsData = {},
}: Props) {
  return (
    <div className="tang1-table-wrap">
      <table className="tang1-table">
        <thead>
          <tr>
            <th className="t1-rank">#</th>
            <th>Ma CP</th>
            {showLivePrice && <th className="t1-num">Gia HT</th>}
            <th className="t1-num">EPS</th>
            <th className="t1-num">FA</th>
            <th className="t1-num">T1</th>
            {showV11 && <th className="t1-num">Conf</th>}
            {showV11 && <th className="t1-num">RS</th>}
            {showV11 && <th className="t1-num">Pattern</th>}
            {showScenarioScore && <th className="t1-num">Kich Ban</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((stock, i) => (
            <Tang1TableRow 
              key={stock.ticker} 
              stock={stock} 
              rank={i + 1} 
              showScenarioScore={showScenarioScore}
              livePrice={livePrices[stock.ticker] || null}
              showLivePrice={showLivePrice}
              showV11={showV11}
              confluence={confluenceData[stock.ticker]}
              pattern={patternData[stock.ticker] ?? null}
              rsData={rsData[stock.ticker] ?? null}
              onClick={() => onRowClick?.(stock.ticker)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

