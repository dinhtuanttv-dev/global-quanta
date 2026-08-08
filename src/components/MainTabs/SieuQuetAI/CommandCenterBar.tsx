import ScenarioSwitcher from "./ScenarioSwitcher";
import type { Scenario } from "../../../types/tang1";

interface Props {
  scenario: Scenario;
  onScenarioChange: (s: Scenario) => void;
}

// PHAM VI B2: chi lam ScenarioSwitcher. MarketStatusIndicator va
// UniversalCountdown se bo sung o B3 sau khi xac minh useMarketStatus
// va /api/catalysts/latest qua Option A.
export default function CommandCenterBar({ scenario, onScenarioChange }: Props) {
  return (
    <div className="command-center-bar">
      <span className="ccb-label">KICH BAN PHAN TICH</span>
      <ScenarioSwitcher value={scenario} onChange={onScenarioChange} />
    </div>
  );
}
