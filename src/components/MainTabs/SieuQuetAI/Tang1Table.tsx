import Tang1TableRow from "./Tang1TableRow";
import type { Tang1Stock, Tang1ScenarioStock } from "../../../types/tang1";

type LivePriceMap = Partial<Record<string, number>>;

interface Props {
  rows: (Tang1Stock | Tang1ScenarioStock)[];
  showScenarioScore: boolean;
  livePrices?: LivePriceMap;
  showLivePrice?: boolean;
}

export default function Tang1Table({ rows, showScenarioScore, livePrices = {}, showLivePrice = false }: Props) {
  return (
    <div className="tang1-table-wrap">
      <table className="tang1-table">
        <thead>
          <tr>
            <th className="t1-rank">#</th>
            <th>Ma CP</th>
            {showLivePrice && <th className="t1-num">Gia HT</th>}
            <th className="t1-num">EPS Growth</th>
            <th className="t1-num">FA Score</th>
            <th className="t1-num">Diem Tang 1</th>
            {showScenarioScore && <th className="t1-num">Diem theo kich ban</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((stock, i) => (
            <Tang1TableRow
              key={stock.ticker}
              stock={stock}
              rank={i + 1}
              showScenarioScore={showScenarioScore}
              livePrice={livePrices[stock.ticker] ?? null}
              showLivePrice={showLivePrice}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
