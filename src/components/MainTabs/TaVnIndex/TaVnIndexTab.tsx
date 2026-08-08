import { useEffect, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import TickerSelector from "./TickerSelector";
import TaCommandCenterTab from "./TaCommandCenterTab";
import GoldenFilterPanel from "./GoldenFilterPanel";

export default function TaVnIndexTab() {
  const globalSelectedTicker = useAppStore((s) => s.selectedTicker);
  const [ticker, setTicker] = useState(globalSelectedTicker ?? "VNM");

  // Dong bo khi nguoi dung click 1 ma o Sidebar/Radar noi khac trong app
  useEffect(() => {
    if (globalSelectedTicker) setTicker(globalSelectedTicker);
  }, [globalSelectedTicker]);

  return (
    <div className="ta-vnindex-tab">
      <TickerSelector ticker={ticker} onChange={setTicker} />
      <TaCommandCenterTab ticker={ticker} onRequestTickerChange={setTicker} />
      <div style={{ marginTop: 16 }}>
        <GoldenFilterPanel onSelectTicker={setTicker} />
      </div>
    </div>
  );
}
