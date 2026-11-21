// Menu "Lưu" của từng vùng trong Phòng họp AI. Ghi chú dựng TẠI LÚC BẤM từ state đang hiển thị (không gọi AI lại, không gọi mạng).
import { useState } from "react";
import { buildBriefNote, buildDebateNote, laneState } from "../../../../lib/obsidian/note";
import type { LaneTraceMap } from "../../../../lib/obsidian/trace";
import type { ExportOptions, LaneLike, NoteOut } from "../../../../lib/obsidian/types";
import ExportMenu, { type MenuItem } from "./ExportMenu";
import ExportPreview from "./ExportPreview";
import type { ExportAction, ObsidianDesk } from "./useObsidianDesk";

type Build = (a: { now: number; suffix: string; options: ExportOptions }) => NoteOut;

function stateBadge(lanes: (LaneLike | null | undefined)[], saved: boolean): { text: string; cls: string } | null {
  if (saved) return { text: "Đã xuất", cls: "border-emerald-400/40 text-emerald-200" };
  const st = lanes.filter(Boolean).map(laneState);
  if (st.includes("partial")) return { text: "Dở dang", cls: "border-amber-300/40 text-amber-100" };
  if (st.includes("fallback")) return { text: "Mô hình dự phòng", cls: "border-sky-300/40 text-sky-100" };
  return null;
}

/** Khung xuất chung: menu + xem trước; `extra` cho các mục riêng (Nhật ký, Canvas — O3). */
export function NoteExport({ desk, build, label, testId, previewTitle, notReady, savedKey, lanes, extra = [], showQuestions = false, className = "" }: {
  desk: ObsidianDesk; build: Build; label: string; testId: string; previewTitle: string; notReady: string | null; savedKey: string | null;
  lanes: (LaneLike | null | undefined)[]; extra?: MenuItem[]; showQuestions?: boolean; className?: string;
}) {
  const [preview, setPreview] = useState<{ now: number; suffix: string } | null>(null);
  const make = (at = { now: Date.now(), suffix: desk.newSuffix() }) => build({ ...at, options: desk.prefs.options });
  const act = (a: ExportAction) => void desk.run(make(), a, savedKey);
  const items: MenuItem[] = [
    { id: "preview", label: "Xem trước…", hint: "Kiểm nội dung, chọn phần đưa vào ghi chú", onSelect: () => setPreview({ now: Date.now(), suffix: desk.newSuffix() }) },
    { id: "obsidian", label: "Mở trong Obsidian", hint: "Tạo ghi chú mới trong Vault", onSelect: () => act("obsidian") },
    { id: "download", label: "Tải .md", onSelect: () => act("download") },
    { id: "copy", label: "Sao chép Markdown", onSelect: () => act("copy") },
    ...extra,
  ];
  const badge = stateBadge(lanes, desk.isSaved(savedKey));
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {badge && <span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${badge.cls}`} data-testid={`${testId}-badge`}>{badge.text}</span>}
      <ExportMenu label={label} compactLabel="Lưu" items={items} disabledReason={notReady} testId={testId} />
      {preview && (
        <ExportPreview title={previewTitle} note={make(preview)} options={desk.prefs.options} onOptions={desk.setOptions} showQuestions={showQuestions}
          onClose={() => setPreview(null)} onAction={(a) => { void desk.run(make(preview), a, savedKey).then(() => setPreview(null)); }} />
      )}
    </span>
  );
}

const RUNNING = "Đang chạy — chờ hoàn tất rồi mới lưu được.";
export const debateKey = (trace: LaneTraceMap) => (trace.bull?.startedAt ? `debate:${trace.bull.startedAt}` : null);
export const briefKey = (trace: LaneTraceMap) => (trace.brief?.startedAt ? `brief:${trace.brief.startedAt}` : null);

export function DebateExport({ desk, subject, bull, bear, judge, trace, busy, extra }: {
  desk: ObsidianDesk; subject: string | null; bull: LaneLike | null; bear: LaneLike | null; judge: LaneLike | null; trace: LaneTraceMap; busy: boolean; extra?: MenuItem[];
}) {
  if (!bull && !bear) return null;
  return (
    <NoteExport desk={desk} label="Lưu tranh luận" testId="obsidian-debate" previewTitle={`Xem trước · Tranh luận ${subject ?? "Elite 10"}`}
      notReady={busy || [bull, bear, judge].some((l) => l && !l.done) ? RUNNING : null} savedKey={debateKey(trace)} lanes={[bull, bear, judge]} extra={extra}
      build={({ now, suffix, options }) => buildDebateNote({ subject, bull, bear, judge, trace: { bull: trace.bull, bear: trace.bear, judge: trace.judge }, now, suffix, options, folder: desk.prefs.folder })} />
  );
}

export function BriefExport({ desk, brief, trace, busy }: { desk: ObsidianDesk; brief: LaneLike | null; trace: LaneTraceMap; busy: boolean }) {
  if (!brief) return null;
  return (
    <NoteExport desk={desk} label="Lưu bản tin" testId="obsidian-brief" previewTitle="Xem trước · Bản tin phiên"
      notReady={busy || !brief.done ? RUNNING : null} savedKey={briefKey(trace)} lanes={[brief]} className="ml-auto"
      build={({ now, suffix, options }) => buildBriefNote({ brief, trace: trace.brief, now, suffix, options, folder: desk.prefs.folder })} />
  );
}
