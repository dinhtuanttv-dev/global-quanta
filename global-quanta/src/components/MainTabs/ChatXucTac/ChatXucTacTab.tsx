"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { useCatalystData } from "../../../hooks/useCatalystData";
import { useCatalystSearch } from "../../../hooks/useCatalystSearch";
import { useLiveFreshness } from "../../../hooks/useLiveFreshness";
import SectorCard from "./SectorCard";
import EmergingSourceRow from "./EmergingSourceRow";
import MoversList from "./MoversList";
import UnmappedSectorsPanel from "./UnmappedSectorsPanel";
import MacroCalendarPanel from "./MacroCalendarPanel";
import CatalystHeatmap from "./CatalystHeatmap";
import { useCatalystHeatmap } from "../../../hooks/useCatalystHeatmap";
import TopBeneficiariesPanel from "./TopBeneficiariesPanel";
import { useTopBeneficiaries } from "../../../hooks/useTopBeneficiaries";
import DomesticEventsPanel from "./DomesticEventsPanel";
import { useDomesticEvents } from "../../../hooks/useDomesticEvents";
import MarketAnnouncementWatchPanel from "./MarketAnnouncementWatchPanel";
import CatalystSkeleton from "./CatalystSkeleton";
import CatalystErrorBoundary from "./CatalystErrorBoundary";
import RetryButton from "./RetryButton";
import { MacroCenterTab } from "../../../macro-center/src/ui/MacroCenterTab";
import { getMarketGateway } from "../../../config/marketGateway";
import { CATALYST_EVIDENCE as EV } from "./catalystEvidence";
import CatalystChatPanel from "./CatalystChatPanel";
import ImpactBoard from "./ImpactBoard";
import WorldTodayStrip from "./WorldTodayStrip";
import EventRadarWorkspace from "./EventRadarWorkspace";

type SubTab = "macro" | "impact" | "catalyst" | "radar" | "chat";
// Z3 (2026-10-17): thêm "Tác động ngành & cổ phiếu" (ghép chiến lược thế giới + hàng hoá + xúc tác theo ICB) — đầu mối từ vĩ mô tới mã.
// Event Radar: tab tổng hợp sự kiện thị trường với phân tích phản ứng H1.
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "macro", label: "1. Phân tích vĩ mô" },
  { id: "impact", label: "2. Tác động ngành & cổ phiếu" },
  { id: "catalyst", label: "3. Chất xúc tác hiện tại" },
  { id: "radar", label: "4. Event Radar" },
  { id: "chat", label: "5. Hỏi đáp xúc tác" },
];

export default function ChatXucTacTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("macro");
  const tabRefs = useRef<Record<SubTab, HTMLButtonElement | null>>({ macro: null, impact: null, catalyst: null, radar: null, chat: null });
  const [seed, setSeed] = useState<string | null>(null);
  const askAi = (question: string) => { setSeed(question); setActiveSubTab("chat"); };
  const moveSubTab = (tab: SubTab) => {
    setActiveSubTab(tab);
    tabRefs.current[tab]?.focus();
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const i = SUB_TABS.findIndex((t) => t.id === activeSubTab);
    const next = event.key === "ArrowRight" ? (i + 1) % SUB_TABS.length : event.key === "ArrowLeft" ? (i - 1 + SUB_TABS.length) % SUB_TABS.length
      : event.key === "Home" ? 0 : event.key === "End" ? SUB_TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    moveSubTab(SUB_TABS[next].id);
  };

  return (
    <div>
      <div role="tablist" aria-label="Chất xúc tác" style={{
        display: "flex", gap: 8, marginBottom: 12, borderBottom: "1px solid var(--border)", overflowX: "auto",
      }}>
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            ref={(el) => { tabRefs.current[t.id] = el; }}
            id={`chat-xuc-tac-${t.id}-tab`}
            role="tab"
            aria-selected={activeSubTab === t.id}
            aria-controls={`chat-xuc-tac-${t.id}-panel`}
            tabIndex={activeSubTab === t.id ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveSubTab(t.id)}
            style={{
              padding: "9px 14px", border: 0, borderBottom: activeSubTab === t.id ? "2px solid var(--gold-bright)" : "2px solid transparent",
              background: "transparent", color: activeSubTab === t.id ? "var(--gold-bright)" : "var(--text-secondary)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section id={`chat-xuc-tac-${activeSubTab}-panel`} role="tabpanel" aria-labelledby={`chat-xuc-tac-${activeSubTab}-tab`} tabIndex={0}>
        {/* X2: API vĩ mô chạy trên Market Gateway (/api/macro/*) */}
        {activeSubTab === "macro" && <>
          <WorldTodayStrip onOpenImpact={() => setActiveSubTab("impact")} />
          <MacroCenterTab baseUrl={getMarketGateway().baseUrl} />
        </>}
        {activeSubTab === "impact" && <ImpactBoard onAsk={askAi} />}
        {activeSubTab === "catalyst" && <CatalystContent />}
        {/* Event Radar: tổng hợp tin & công bố gắn nguồn, phân tích phản ứng H1 */}
        {activeSubTab === "radar" && <EventRadarWorkspace />}
        {/* X4/Z2: Claude hoặc Gemini + công cụ vĩ mô, thế giới, ngành ICB (Gateway) & xúc tác (snapshot engine) */}
        {activeSubTab === "chat" && <CatalystChatPanel seedQuestion={seed} onSeedConsumed={() => setSeed(null)} />}
      </section>
    </div>
  );
}

function CatalystContent() {
  const { snapshot, noDataYet, transientError, isLoading, error, refresh } = useCatalystData();
  const { query, setQuery, filteredSectors, filteredEmerging } = useCatalystSearch(
    snapshot?.sectors ?? [], snapshot?.emerging ?? []
  );
  const freshnessLabel = useLiveFreshness(snapshot?.scannedAt);
  const heatmapCells = useCatalystHeatmap(snapshot?.sectors ?? []);
  const topBeneficiaries = useTopBeneficiaries(snapshot?.tickerImpacts, snapshot?.sectors ?? []);
  const { events: domesticEvents } = useDomesticEvents();

  return (
    <div className="t1-toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
      <span className="t1-toolbar-title">CHẤT XÚC TÁC · CATALYST ENGINE</span>
      <EvidenceNote />
      {isLoading && !snapshot && <CatalystSkeleton />}

      {error && (
        <div className="t1-state-msg t1-error">
          Lỗi kết nối: {String(error)}
          <div><RetryButton onRetry={() => refresh()} /></div>
        </div>
      )}

      {!isLoading && !error && transientError && (
        <div className="t1-state-msg t1-error">
          {transientError}
          <div><RetryButton onRetry={() => refresh()} /></div>
        </div>
      )}

      {!isLoading && !error && !transientError && noDataYet && (
        <div className="t1-state-msg">{noDataYet}</div>
      )}

      {snapshot && (
        <CatalystErrorBoundary>
          <div style={{ marginTop: 10 }}>
            {snapshot.isStale && (
              <div style={{
                background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                borderRadius: 8, padding: "6px 10px", fontSize: 10.5, color: "#fbbf24", marginBottom: 10,
              }}>
                ⚠ Dữ liệu cũ ({snapshot.ageMinutes != null && snapshot.ageMinutes >= 120 ? `${Math.round(snapshot.ageMinutes / 60)} giờ` : `${snapshot.ageMinutes} phút`} trước) — lần quét gần nhất có thể đã thất bại.
              </div>
            )}

            <input
              type="text"
              placeholder="Tìm theo mã cổ phiếu hoặc tên ngành…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%", padding: "7px 10px", marginBottom: 12, fontSize: 11.5,
                background: "var(--bg-surface)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text-primary)", outline: "none",
              }}
            />

            {snapshot.sanitized && (
              <div role="note" style={{ fontSize: 10.5, color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                Đã ẩn {snapshot.sanitized.removedCards} thẻ và {snapshot.sanitized.removedMovers} mục tăng/giảm hạng. {snapshot.sanitized.reason}
              </div>
            )}

            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, flexWrap: "wrap" }}>
              {!snapshot.sanitized && <>
                <span>Tích cực: <b style={{ color: "var(--positive)" }}>{snapshot.totalBenefitCount}</b></span>
                <span>Tiêu cực: <b style={{ color: "var(--negative)" }}>{snapshot.totalHarmCount}</b></span>
              </>}
              <span>Cập nhật: {freshnessLabel}</span>
            </div>

            <MoversList upMovers={snapshot.upMovers} downMovers={snapshot.downMovers} />
            <CatalystHeatmap cells={heatmapCells} />
            <TopBeneficiariesPanel rows={topBeneficiaries} />
            <DomesticEventsPanel events={domesticEvents} />
            <MarketAnnouncementWatchPanel />

            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "16px 0 8px" }}>THEO NGÀNH</p>
            {filteredSectors.length === 0 && <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Không tìm thấy kết quả phù hợp.</p>}
            {filteredSectors.map((s) => <SectorCard key={s.sector} sector={s} />)}

            {filteredEmerging.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-bright)", margin: "16px 0 8px" }}>NGÀNH MỚI NỔI</p>
                {filteredEmerging.map((s) => <EmergingSourceRow key={s.sourceId} source={s} />)}
              </>
            )}

            <MacroCalendarPanel events={snapshot.upcomingEvents} />
            <UnmappedSectorsPanel />
          </div>
        </CatalystErrorBoundary>
      )}
    </div>
  );
}

const pctVi = (x: number, d = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`;

/** X6: nhãn bằng chứng của chiều tác động (kiểm định đặt trước) — luôn hiện cùng giới hạn của nó. */
function EvidenceNote() {
  return (
    <details style={{ fontSize: 10.5, color: "var(--text-tertiary)", margin: "6px 0 2px" }}>
      <summary style={{ cursor: "pointer" }}>
        Bằng chứng: <b style={{ color: "var(--warning, #f59e0b)" }}>THỬ NGHIỆM</b> — chiều "tích cực/tiêu cực" của engine chưa được kiểm chứng đủ mẫu sạch
      </summary>
      <p style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
        Kiểm định đặt trước ({EV.window}) cho lợi suất vượt VN-Index 20 phiên theo chiều tín hiệu {pctVi(EV.prereg.meanSar20)} (KTC95 {pctVi(EV.prereg.ci95[0])} … {pctVi(EV.prereg.ci95[1])}, n = {EV.prereg.n20}).
        Rà soát nguồn gốc sau đó phát hiện {EV.seedSignals} tín hiệu đến từ dữ liệu mẫu bịa (đã gỡ). Loại chúng và tin trung lập, mẫu sạch còn {EV.clean.n20} tín hiệu — dưới ngưỡng {EV.minN} đã đăng ký
        ({pctVi(EV.clean.meanSar20)}, KTC95 {pctVi(EV.clean.ci95[0])} … {pctVi(EV.clean.ci95[1])}). Chấm lại bằng kiểm định tiến khi đủ {EV.minN} tín hiệu sạch.
        "Tỷ lệ thắng" trên thẻ là tỷ lệ tăng giá thô 5 phiên, không phải lợi suất vượt trội. Không phải khuyến nghị đầu tư.
      </p>
    </details>
  );
}
