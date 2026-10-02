import { researchUiAvailable, useResearchUi } from "../../../hooks/useResearchUi";

/** Công tắc gọn bật/tắt các khối AI/Nghiên cứu. Tắt = giao diện nguyên bản. */
export default function ResearchUiToggle({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useResearchUi();
  if (!researchUiAvailable()) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      title={on ? "Đang hiện khối AI học & thích ứng (bấm để ẩn)" : "Hiện khối AI học & thích ứng"}
      aria-label={compact ? "Hiện chỉ số AI trong bảng phân tích khối lượng" : undefined}
      className={`inline-flex items-center gap-1.5 ${compact ? "text-[9px] align-middle" : "text-[9.5px]"} text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 rounded`}
    >
      <span>{compact ? "AI" : "AI nghiên cứu"}</span>
      <span className={`relative inline-block w-6 h-3.5 rounded-full transition-colors ${on ? "bg-violet-500" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
      </span>
    </button>
  );
}
