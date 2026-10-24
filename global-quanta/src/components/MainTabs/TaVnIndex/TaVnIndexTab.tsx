import { useEffect, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import TickerSelector, { DEFAULT_TA_SYMBOL } from "./TickerSelector";
import TaCommandCenterTab from "./TaCommandCenterTab";
import PanelBoundary from "./workspace/PanelBoundary";
import type { ChartHighlight } from "./TVChartPanel";
import GoldenSepaPanel from "./GoldenSepaPanel";
import ConvergencePanelV2 from "./ConvergencePanelV2";
import { isMarketGatewayEnabled } from "../../../services/marketDataClient";
import PatternScannerPanel from "./PatternScannerPanel";
import SubTabNavigation, { SubTabKey } from "./SubTabNavigation";
import AIChartVisionTab from "./AIChartVision";
import TechnicalFilterPanel from "./TechnicalFilterPanel";
import SepaPanel from "./SepaPanel";

export default function TaVnIndexTab() {
  const globalSelectedTicker = useAppStore((s) => s.selectedTicker);
  // Mặc định VN-Index (TA_VNINDEX_UPGRADE_SPEC §2.1.1) — mã đang chọn ở nơi khác vẫn được ưu tiên.
  const [ticker, setTicker] = useState(globalSelectedTicker ?? DEFAULT_TA_SYMBOL);
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>("pattern");
  const [suggestedTicker, setSuggestedTicker] = useState<string | null>(null);
  // Super Chart SC4: mẫu hình chọn ở Pattern Scanner v2 -> khoanh vùng trên biểu đồ (nối lại đường đã đứt từ khi thay bộ lọc cũ).
  const [highlight, setHighlight] = useState<ChartHighlight | null>(null);
  useEffect(() => {
    if (globalSelectedTicker) setTicker(globalSelectedTicker);
  }, [globalSelectedTicker]);

  const handleCandidateSelect = (symbol: string, h?: Omit<ChartHighlight, "n"> | null) => {
    setTicker(symbol);
    setSuggestedTicker(symbol);
    setHighlight(h ? { ...h, n: Date.now() } : null);
  };

  const handleTabChange = (tab: SubTabKey) => {
    setActiveSubTab(tab);
    if (tab === "aichart") setSuggestedTicker(null);
  };
  // Bảng phụ của các bộ lọc -> mở thẳng AI Chart Vision cho mã đó.
  const openVision = (symbol: string) => {
    setTicker(symbol);
    setSuggestedTicker(null);
    setActiveSubTab("aichart");
  };

  const showSuggestionBanner = suggestedTicker !== null && activeSubTab !== "aichart";

  return (
    <div className="ta-vnindex-tab">
      {/* ĐÃ SỬA: bỏ khung cuộn 70vh từng bọc ở đây (bọc nhầm cả khối lớn
          gồm chart + SMC/VSA/Wyckoff/Backtest) — chiều cao 70% màn hình
          giờ áp dụng ĐÚNG vào khung chart nến bên trong TVChartPanel.tsx,
          không phải toàn bộ khối này. Quay về luồng cuộn trang bình
          thường, tự nhiên hơn. */}
      <div style={{ display: activeSubTab === "aichart" ? "none" : undefined }}>
        {/* Phần A — Chart + bảng điều khiển (Super Chart). Ô chọn mã nằm trong thanh đầu của workspace. */}
        <PanelBoundary label="biểu đồ" resetKey={ticker} testid="panel-error-chart"><TaCommandCenterTab ticker={ticker} onRequestTickerChange={setTicker} highlight={highlight} tickerSlot={<TickerSelector ticker={ticker} onChange={(t) => { setTicker(t); setHighlight(null); }} />} /></PanelBoundary>
      </div>

      {activeSubTab === "aichart" && (
        <>
          {/* thanh tab con vẫn hiện ở AI Chart Vision để quay lại các bộ lọc */}
          <SubTabNavigation activeTab={activeSubTab} onTabChange={handleTabChange} />
          <div className="mt-2">
            <PanelBoundary label="AI Chart Vision" resetKey={ticker}><AIChartVisionTab ticker={ticker} onRequestTickerChange={setTicker} onOpenScreener={(tab) => handleTabChange(tab as SubTabKey)} /></PanelBoundary>
          </div>
        </>
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
              các bộ lọc — TVChartPanel.tsx không
              còn tự gắn thêm bản sao thứ 2 của 2 component này nữa. */}
          <div className="mt-2"><PanelBoundary label="bộ lọc" resetKey={activeSubTab} testid="panel-error-filter">
            {/* Pattern Scanner v2 (Pring, P4) thay Pattern Scanner cũ của Project A (/api/pattern-scan, chỉ 4 mẫu, báo mô hình cũ). */}
            {activeSubTab === "pattern" && (isMarketGatewayEnabled()
              ? <PatternScannerPanel onSelectTicker={handleCandidateSelect} onOpenVision={openVision} />
              : <p className="text-[10px] text-slate-500 italic py-4 text-center">Pattern Scanner v2 cần Market Gateway (chưa bật cho môi trường này).</p>)}
            {/* Hợp lưu v2 chạy trên Gateway (bộ lọc cũ của Project A đã gỡ khỏi tab — H4). */}
            {activeSubTab === "convergence" && (isMarketGatewayEnabled()
              ? <ConvergencePanelV2 onSelectTicker={handleCandidateSelect} onOpenVision={openVision} />
              : <p className="text-[10px] text-slate-500 italic py-4 text-center">Bộ lọc Hợp lưu v2 cần Market Gateway (chưa bật cho môi trường này).</p>)}
            {activeSubTab === "camslim" && (
              <TechnicalFilterPanel strategy="camslim" onSelectTicker={handleCandidateSelect} onOpenVision={openVision} />
            )}
            {activeSubTab === "base-breakout" && (
              <TechnicalFilterPanel strategy="base-breakout" onSelectTicker={handleCandidateSelect} onOpenVision={openVision} />
            )}
            {/* SEPA Minervini (SP4) — chiến lược "sepa" của Gateway; bảng phụ phân tích chuyên sâu theo sách. */}
            {activeSubTab === "sepa" && (isMarketGatewayEnabled()
              ? <SepaPanel onSelectTicker={handleCandidateSelect} onOpenVision={openVision} />
              : <p className="text-[10px] text-slate-500 italic py-4 text-center">Bộ lọc SEPA cần Market Gateway (chưa bật cho môi trường này).</p>)}
            {/* SP5: Golden SEPA thay hoàn toàn Golden Filter × Top 20 Kỹ thuật + TA Consensus (Project A). */}
            {activeSubTab === "golden" && (isMarketGatewayEnabled()
              ? <GoldenSepaPanel onSelectTicker={handleCandidateSelect} onOpenVision={openVision} />
              : <p className="text-[10px] text-slate-500 italic py-4 text-center">Golden SEPA cần Market Gateway (chưa bật cho môi trường này).</p>)}
          </PanelBoundary></div>
        </>
      )}
    </div>
  );
}
