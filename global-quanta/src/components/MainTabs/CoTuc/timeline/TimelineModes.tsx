// TO-v1 (07/11/2026) — chọn chế độ cho tab Timeline điểm mua. Chế độ cũ (BuyTimelineTab, khoá) giữ NGUYÊN mã và hành vi;
// chế độ mới "Neo công bố (2D)" chạy song song để so sánh. Lựa chọn nhớ trên máy.
import { useState } from "react";
import { BuyTimelineTab } from "./BuyTimelineTab";
import { AnnouncementTimeline } from "../to/AnnouncementTimeline";

const KEY = "gq.cotuc.timeline.mode.v1";
type Mode = "legacy" | "announce";
const read = (): Mode => { try { return localStorage.getItem(KEY) === "announce" ? "announce" : "legacy"; } catch { return "legacy"; } };

export function TimelineModes({ onSelectTicker }: { onSelectTicker?: (t: string) => void }) {
  const [mode, setMode] = useState<Mode>(read);
  const pick = (m: Mode) => { setMode(m); try { localStorage.setItem(KEY, m); } catch { /* không có storage */ } };
  return (
    <div className="space-y-2">
      <div className="tw-scope flex flex-wrap items-center gap-1.5 text-[11px]" role="tablist" aria-label="Chế độ Timeline">
        {([["legacy", "Chế độ cũ (neo GDKHQ)"], ["announce", "Neo công bố (2D) · THĂM DÒ"]] as [Mode, string][]).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} data-testid={`timeline-mode-${m}`} onClick={() => pick(m)}
            className={`rounded-md border px-2.5 py-1 font-semibold ${mode === m ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>
      {mode === "legacy" ? <BuyTimelineTab onSelectTicker={onSelectTicker} /> : <AnnouncementTimeline onSelectTicker={onSelectTicker} />}
    </div>
  );
}
