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
import { MacroCenterTab } from "./MacroCenter/src/ui/MacroCenterTab";
import { getMarketGateway } from "../../../config/marketGateway";

export default function ChatXucTacTab() {
  const [activeSubTab, setActiveSubTab] = useState<"macro" | "catalyst">("macro");
  const macroTabRef = useRef<HTMLButtonElement>(null);
  const catalystTabRef = useRef<HTMLButtonElement>(null);
  const moveSubTab = (tab: "macro" | "catalyst") => {
    setActiveSubTab(tab);
    (tab === "macro" ? macroTabRef : catalystTabRef).current?.focus();
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveSubTab(event.key === "ArrowLeft" || event.key === "Home" ? "macro" : "catalyst");
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Chat Xúc tác" style={{
        display: "flex", gap: 8, marginBottom: 12, borderBottom: "1px solid var(--border)",
      }}>
        <button
          type="button"
          ref={macroTabRef}
          id="chat-xuc-tac-macro-tab"
          role="tab"
          aria-selected={activeSubTab === "macro"}
          aria-controls="chat-xuc-tac-macro-panel"
          tabIndex={activeSubTab === "macro" ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setActiveSubTab("macro")}
          style={{
            padding: "9px 14px", border: 0, borderBottom: activeSubTab === "macro" ? "2px solid var(--gold-bright)" : "2px solid transparent",
            background: "transparent", color: activeSubTab === "macro" ? "var(--gold-bright)" : "var(--text-secondary)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          1. Phân tích vĩ mô
        </button>
        <button
          type="button"
          ref={catalystTabRef}
          id="chat-xuc-tac-catalyst-tab"
          role="tab"
          aria-selected={activeSubTab === "catalyst"}
          aria-controls="chat-xuc-tac-catalyst-panel"
          tabIndex={activeSubTab === "catalyst" ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setActiveSubTab("catalyst")}
          style={{
            padding: "9px 14px", border: 0, borderBottom: activeSubTab === "catalyst" ? "2px solid var(--gold-bright)" : "2px solid transparent",
            background: "transparent", color: activeSubTab === "catalyst" ? "var(--gold-bright)" : "var(--text-secondary)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          2. Chất xúc tác hiện tại
        </button>
      </div>

      {activeSubTab === "macro" ? (
        <section id="chat-xuc-tac-macro-panel" role="tabpanel" aria-labelledby="chat-xuc-tac-macro-tab" tabIndex={0}>
          {/* X2: API vĩ mô chạy trên Market Gateway (/api/macro/*) */}
          <MacroCenterTab baseUrl={getMarketGateway().baseUrl} />
        </section>
      ) : (
        <section id="chat-xuc-tac-catalyst-panel" role="tabpanel" aria-labelledby="chat-xuc-tac-catalyst-tab" tabIndex={0}>
          <CatalystContent />
        </section>
      )}
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
                ⚠ Dữ liệu cũ ({snapshot.ageMinutes} phút trước) — lần quét gần nhất có thể đã thất bại.
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

            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, flexWrap: "wrap" }}>
              <span>Tích cực: <b style={{ color: "var(--positive)" }}>{snapshot.totalBenefitCount}</b></span>
              <span>Tiêu cực: <b style={{ color: "var(--negative)" }}>{snapshot.totalHarmCount}</b></span>
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
