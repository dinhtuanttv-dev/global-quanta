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
  const [suggestedTicker, setSuggestedTicker] = useState<string | null>(null);
  // ĐÃ THÊM — thay cho <PatternList> từng gắn sẵn TRÙNG LẶP bên trong
  // TVChartPanel.tsx (đã bỏ): lưu pattern vừa chọn, truyền xuống
  // TaCommandCenterTab -> TVChartPanel để vẫn khoanh vùng ngày trên biểu
  // đồ — giữ nguyên đúng hành vi cũ, chỉ đổi đường truyền dữ liệu.
  const [patternHighlight, setPatternHighlight] = useState<PatternMatch | null>(null);

  useEffect(() => {
    if (globalSelectedTicker) setTicker(globalSelectedTicker);
  }, [globalSelectedTicker]);

  const handleCandidateSelect = (symbol: string) => {
    setTicker(symbol);
    setSuggestedTicker(symbol);
  };

  const handleSelectPattern = (pattern: PatternMatch) => {
    if (pattern.ticker) handleCandidateSelect(pattern.ticker);
    setPatternHighlight(pattern);
  };

  const handleTabChange = (tab: SubTabKey) => {
    setActiveSubTab(tab);
    if (tab === "aichart") setSuggestedTicker(null);
  };

  const showSuggestionBanner = suggestedTicker !== null && activeSubTab !== "aichart";

  return (
    <div className="ta-vnindex-tab">
      <TickerSelector ticker={ticker} onChange={setTicker} />

      {/* ĐÃ SỬA: bỏ khung cuộn 70vh từng bọc ở đây (bọc nhầm cả khối lớn
          gồm chart + SMC/VSA/Wyckoff/Backtest) — chiều cao 70% màn hình
          giờ áp dụng ĐÚNG vào khung chart nến bên trong TVChartPanel.tsx,
          không phải toàn bộ khối này. Quay về luồng cuộn trang bình
          thường, tự nhiên hơn. */}
      <div style={{ display: activeSubTab === "aichart" ? "none" : undefined }}>
        <TaCommandCenterTab ticker={ticker} onRequestTickerChange={setTicker} highlightPattern={patternHighlight} />
      </div>

      {activeSubTab === "aichart" && (
        <AIChartVisionTab ticker={ticker} onRequestTickerChange={setTicker} />
      )}

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

      {activeSubTab !== "aichart" && (
        <>
          <SubTabNavigation activeTab={activeSubTab} onTabChange={handleTabChange} />
          {/* ĐÃ SỬA — LỖI NHÂN BẢN: đây vẫn là nơi DUY NHẤT render
              PatternList/ConvergenceFilterPanel — TVChartPanel.tsx không
              còn tự gắn thêm bản sao thứ 2 của 2 component này nữa. */}
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
          </div>
        </>
      )}
    </div>
  );
}
