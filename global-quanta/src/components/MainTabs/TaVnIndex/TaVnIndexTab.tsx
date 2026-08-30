import { useEffect, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import TickerSelector from "./TickerSelector";
import TaCommandCenterTab from "./TaCommandCenterTab";
import GoldenFilterPanel from "./GoldenFilterPanel";
import TAConsensusPanel from "./TAConsensusPanel";
import ConvergenceFilterPanel from "./ConvergenceFilterPanel";
import PatternList from "./PatternList";
import SubTabNavigation, { SubTabKey } from "./SubTabNavigation";
import type { PatternMatch } from "../../../lib/ta-command-center/types";

export default function TaVnIndexTab() {
  const globalSelectedTicker = useAppStore((s) => s.selectedTicker);
  const [ticker, setTicker] = useState(globalSelectedTicker ?? "VNM");
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>("pattern");

  useEffect(() => {
    if (globalSelectedTicker) setTicker(globalSelectedTicker);
  }, [globalSelectedTicker]);

  const handleSelectPattern = (pattern: PatternMatch) => {
    if (pattern.ticker) setTicker(pattern.ticker);
  };

  return (
    <div className="ta-vnindex-tab">
      <TickerSelector ticker={ticker} onChange={setTicker} />
      <TaCommandCenterTab ticker={ticker} onRequestTickerChange={setTicker} />
      <SubTabNavigation activeTab={activeSubTab} onTabChange={setActiveSubTab} />
      <div className="mt-2">
        {activeSubTab === "pattern" && <PatternList onSelectPattern={handleSelectPattern} />}
        {activeSubTab === "convergence" && <ConvergenceFilterPanel onSelectTicker={setTicker} />}
        {activeSubTab === "golden" && (
          <>
            <GoldenFilterPanel onSelectTicker={setTicker} />
            <div style={{ marginTop: 16 }}>
              <TAConsensusPanel onSelectTicker={setTicker} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}