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
import AIChartVisionTab from "./AIChartVision";
import "./AIChartVision/styles.css";

export default function TaVnIndexTab() {
  const globalSelectedTicker = useAppStore((s) => s.selectedTicker);
  const [ticker, setTicker] = useState(globalSelectedTicker ?? "VNM");
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>("pattern");
  // ĐÃ SỬA — thay "Auto Drill-Down" (tự động ép chuyển tab) bằng "Suggested
  // Drill-Down": chọn mã ở tab sàng lọc chỉ cập nhật biểu đồ + hiện banner
  // gợi ý, KHÔNG tự chuyển tab. Người dùng chủ động bấm nếu muốn xem AI.
  // Lý do đổi: Auto Drill-Down khiến activeSubTab bị "kẹt" ở AI Chart
  // Vision sau lần drill-down đầu tiên — mọi lần đổi mã sau đó (kể cả từ
  // sidebar toàn cục) đều hiển thị trên nền AI Chart Vision, gây cảm giác
  // "cứ bấm mã nào cũng nhảy sang AI", mất kiểm soát.
  const [suggestedTicker, setSuggestedTicker] = useState<string | null>(null);

  useEffect(() => {
    if (globalSelectedTicker) setTicker(globalSelectedTicker);
  }, [globalSelectedTicker]);

  const handleCandidateSelect = (symbol: string) => {
    setTicker(symbol);
    setSuggestedTicker(symbol);
  };

  const handleSelectPattern = (pattern: PatternMatch) => {
    if (pattern.ticker) handleCandidateSelect(pattern.ticker);
  };

  const handleTabChange = (tab: SubTabKey) => {
    setActiveSubTab(tab);
    if (tab === "aichart") setSuggestedTicker(null);
  };

  const showSuggestionBanner = suggestedTicker !== null && activeSubTab !== "aichart";

  return (
    <div className="ta-vnindex-tab">
      <TickerSelector ticker={ticker} onChange={setTicker} />

      <div style={{ display: activeSubTab === "aichart" ? "none" : undefined }}>
        <TaCommandCenterTab ticker={ticker} onRequestTickerChange={setTicker} />
      </div>

      {showSuggestionBanner && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#fbbf24" }}>
            Vừa chọn {suggestedTicker} — xem AI Chart Vision cho mã này?
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => handleTabChange("aichart")}
              style={{
                fontSize: 11,
                padding: "5px 10px",
                background: "rgba(245,158,11,0.2)",
                color: "#fbbf24",
                border: "1px solid rgba(245,158,11,0.4)",
                borderRadius: 6,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Xem ngay →
            </button>
            <button
              onClick={() => setSuggestedTicker(null)}
              style={{
                fontSize: 11,
                padding: "5px 8px",
                background: "transparent",
                color: "#64748b",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      <SubTabNavigation activeTab={activeSubTab} onTabChange={handleTabChange} />

      <div className="mt-2">
        {activeSubTab === "pattern" && <PatternList onSelectPattern={handleSelectPattern} />}
        {activeSubTab === "convergence" && <ConvergenceFilterPanel onSelectTicker={handleCandidateSelect} />}
        {activeSubTab === "golden" && (
          <>
            <GoldenFilterPanel onSelectTicker={handleCandidateSelect} />
            <div style={{ marginTop: 16 }}>
              <TAConsensusPanel onSelectTicker={handleCandidateSelect} />
            </div>
          </>
        )}
        {activeSubTab === "aichart" && (
          <AIChartVisionTab ticker={ticker} onRequestTickerChange={setTicker} />
        )}
      </div>
    </div>
  );
}
