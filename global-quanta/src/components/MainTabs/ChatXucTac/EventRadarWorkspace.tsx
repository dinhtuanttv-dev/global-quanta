import { useState, type KeyboardEvent } from "react";
import type { EventRadarEvent } from "../../../hooks/useEventRadar";
import EventRadarPanel from "./EventRadarPanel";
import EventResearchWorkspace from "./eventResearch/EventResearchWorkspace";
import { seedFromEvent, type EventSeed } from "./eventResearch/researchFormat";

type Section = "radar" | "research";
const SECTIONS: readonly [Section, string][] = [["radar", "1. Radar sự kiện"], ["research", "2. Phân tích chuyên sâu"]];
const KEY = "gq.eventRadar.section.v1";

function readSection(): Section {
  try { return window.localStorage.getItem(KEY) === "research" ? "research" : "radar"; } catch { return "radar"; }
}

/**
 * Event Radar (tab Chất xúc tác › 4) — 30/10/2026 gồm 2 phần:
 *   1. Radar sự kiện · Sự kiện → phản ứng → drift (đang có).
 *   2. Phân tích chuyên sâu — chuyển từ tab Siêu quét AI: Quant Edge H1/H2, ESA cảnh báo bất thường intraday, Sự kiện vĩ mô.
 * Nút "Phân tích chuyên sâu" trên thẻ sự kiện mở phần 2 với đúng mã + thời điểm công bố. Phần 2 chỉ tải khi mở.
 */
export default function EventRadarWorkspace() {
  const [section, setSectionState] = useState<Section>(readSection);
  const [seed, setSeed] = useState<EventSeed | null>(null);
  const setSection = (next: Section) => {
    setSectionState(next);
    try { window.localStorage.setItem(KEY, next); } catch { /* chỉ nhớ trong phiên */ }
  };
  const analyze = (event: EventRadarEvent) => { setSeed(seedFromEvent(event)); setSection("research"); };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next: Section | null = e.key === "Home" || e.key === "ArrowLeft" ? "radar" : e.key === "End" || e.key === "ArrowRight" ? "research" : null;
    if (!next) return;
    e.preventDefault();
    setSection(next);
    document.getElementById(`event-workspace-${next}-tab`)?.focus();
  };

  return (
    // tw-scope: tab Chất xúc tác nằm ngoài vùng Tailwind — reset toàn cục (App.css) xoá padding/margin của mọi phần tử ngoài .tw-scope.
    <section aria-label="Event Radar và phân tích chuyên sâu" className="tw-scope space-y-3">
      <div role="tablist" aria-label="Các phần Event Radar" className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {SECTIONS.map(([id, label]) => (
          <button key={id} id={`event-workspace-${id}-tab`} type="button" role="tab" aria-selected={section === id}
            aria-controls={`event-workspace-${id}-panel`} tabIndex={section === id ? 0 : -1} onKeyDown={onKeyDown} onClick={() => setSection(id)}
            className={`rounded px-3 py-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${section === id ? "border border-cyan-700/60 bg-cyan-950/40 text-cyan-200" : "border border-white/10 text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>
      <div id={`event-workspace-${section}-panel`} role="tabpanel" aria-labelledby={`event-workspace-${section}-tab`}>
        {section === "radar" ? <EventRadarPanel onAnalyzeEvent={analyze} /> : <EventResearchWorkspace seed={seed} />}
      </div>
    </section>
  );
}
