"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import MacroHub from "./macroHub/MacroHub";
import CatalystChatPanel from "./CatalystChatPanel";
import ImpactBoard from "./ImpactBoard";
import EventRadarWorkspace from "./EventRadarWorkspace";
type SubTab = "macro" | "impact" | "radar" | "chat";
// Z3 (2026-10-17): thêm "Tác động ngành & cổ phiếu" (ghép chiến lược thế giới + hàng hoá + xúc tác theo ICB) — đầu mối từ vĩ mô tới mã.
// Event Radar: tab tổng hợp sự kiện thị trường với phân tích phản ứng H1.
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "macro", label: "1. Phân tích vĩ mô" },
  { id: "impact", label: "2. Tác động ngành & cổ phiếu" },
  { id: "radar", label: "3. Event Radar" },
  { id: "chat", label: "4. Hỏi đáp vĩ mô & thị trường" },
];

export default function ChatXucTacTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("macro");
  const tabRefs = useRef<Record<SubTab, HTMLButtonElement | null>>({ macro: null, impact: null, radar: null, chat: null });
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
        {activeSubTab === "macro" && <MacroHub onOpenImpact={() => setActiveSubTab("impact")} onOpenRadar={() => setActiveSubTab("radar")} />}
        {activeSubTab === "impact" && <ImpactBoard onAsk={askAi} />}
        {/* Event Radar: tổng hợp tin & công bố gắn nguồn, phân tích phản ứng H1 */}
        {activeSubTab === "radar" && <EventRadarWorkspace />}
        {/* X4/Z2: Claude hoặc Gemini + công cụ vĩ mô, thế giới, ngành ICB (Gateway) & xúc tác (snapshot engine) */}
        {activeSubTab === "chat" && <CatalystChatPanel seedQuestion={seed} onSeedConsumed={() => setSeed(null)} />}
      </section>
    </div>
  );
}
