// Menu "Lưu" của từng vùng trong Phòng họp AI. Ghi chú dựng TẠI LÚC BẤM từ state đang hiển thị (không gọi AI lại, không gọi mạng).
// O3: tài liệu phụ (Nhật ký quyết định, Hỏi đáp lượt cuối), Canvas tranh luận, xuất Hỏi đáp.
import { useState } from "react";
import { buildDebateCanvas } from "../../../../lib/obsidian/canvas";
import { buildBriefNote, buildDebateNote, buildJournalNote, buildQaNote, laneState } from "../../../../lib/obsidian/note";
import type { QaMeta } from "../../../../lib/obsidian/qaTap";
import type { LaneTraceMap } from "../../../../lib/obsidian/trace";
import type { ExportOptions, LaneLike, NoteOut, QaTurn } from "../../../../lib/obsidian/types";
import { makeVnTradingCalendar } from "../../../../lib/cotuc/vn-trading-calendar";
import ExportMenu, { type MenuItem } from "./ExportMenu";
import ExportPreview from "./ExportPreview";
import type { ExportAction, ObsidianDesk } from "./useObsidianDesk";

type Build = (a: { now: number; suffix: string; options: ExportOptions }) => NoteOut;
/** Tài liệu phụ trong cùng menu (VD Nhật ký quyết định, Hỏi đáp lượt cuối): có Xem trước / Mở / Tải / Chép riêng. */
export interface AltDoc { id: string; label: string; hint?: string; previewTitle: string; build: Build; savedKey: string | null }
/** Lịch giao dịch tự tính (âm lịch + Bộ luật Lao động) — thuần, không gọi mạng. */
const VN_CAL = makeVnTradingCalendar(null);

function stateBadge(lanes: (LaneLike | null | undefined)[], saved: boolean): { text: string; cls: string } | null {
  if (saved) return { text: "Đã xuất", cls: "border-emerald-400/40 text-emerald-200" };
  const st = lanes.filter(Boolean).map(laneState);
  if (st.includes("partial")) return { text: "Dở dang", cls: "border-amber-300/40 text-amber-100" };
  if (st.includes("fallback")) return { text: "Mô hình dự phòng", cls: "border-sky-300/40 text-sky-100" };
  return null;
}

/** Khung xuất chung: menu + xem trước; `alts` = tài liệu phụ; `extra` = mục riêng (Canvas). */
export function NoteExport({ desk, build, label, testId, previewTitle, notReady, savedKey, lanes, extra = [], alts = [], showQuestions = false, className = "", primaryLabel }: {
  desk: ObsidianDesk; build: Build; label: string; testId: string; previewTitle: string; notReady: string | null; savedKey: string | null;
  lanes: (LaneLike | null | undefined)[]; extra?: MenuItem[]; alts?: AltDoc[]; showQuestions?: boolean; className?: string; primaryLabel?: string;
}) {
  const docs: AltDoc[] = [{ id: "main", label: primaryLabel ?? "", previewTitle, build, savedKey }, ...alts];
  const [preview, setPreview] = useState<{ doc: string; now: number; suffix: string } | null>(null);
  const docOf = (id: string) => docs.find((d) => d.id === id) ?? docs[0];
  const make = (d: AltDoc, at = { now: Date.now(), suffix: desk.newSuffix() }) => d.build({ ...at, options: desk.prefs.options });
  const act = (d: AltDoc, a: ExportAction) => void desk.run(make(d), a, d.savedKey);
  const items: MenuItem[] = docs.flatMap((d, k) => {
    const p = d.id === "main" ? "" : `${d.label} · `, id = d.id === "main" ? "" : `${d.id}-`;
    return [
      { id: `${id}preview`, label: `${p}Xem trước…`, hint: k === 0 ? "Kiểm nội dung, chọn phần đưa vào ghi chú" : d.hint, separatorBefore: k > 0, onSelect: () => setPreview({ doc: d.id, now: Date.now(), suffix: desk.newSuffix() }) },
      { id: `${id}obsidian`, label: `${p}Mở trong Obsidian`, hint: k === 0 ? "Tạo ghi chú mới trong Vault" : undefined, onSelect: () => act(d, "obsidian") },
      { id: `${id}download`, label: `${p}Tải .md`, onSelect: () => act(d, "download") },
    ];
  });
  // "Sao chép Markdown" (tài liệu chính) luôn ở cuối menu.
  const all = [...items, ...extra.map((e, i) => ({ ...e, separatorBefore: e.separatorBefore ?? i === 0 })),
    { id: "copy", label: "Sao chép Markdown", separatorBefore: alts.length > 0 || extra.length > 0, onSelect: () => act(docs[0], "copy") }];
  const badge = stateBadge(lanes, desk.isSaved(savedKey));
  const pv = preview ? docOf(preview.doc) : null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {badge && <span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${badge.cls}`} data-testid={`${testId}-badge`}>{badge.text}</span>}
      <ExportMenu label={label} compactLabel="Lưu" items={all} disabledReason={notReady} testId={testId} />
      {preview && pv && (
        <ExportPreview title={pv.previewTitle} note={make(pv, preview)} options={desk.prefs.options} onOptions={desk.setOptions} showQuestions={showQuestions}
          onClose={() => setPreview(null)} onAction={(a) => { void desk.run(make(pv, preview), a, pv.savedKey).then(() => setPreview(null)); }} />
      )}
    </span>
  );
}

const RUNNING = "Đang chạy — chờ hoàn tất rồi mới lưu được.";
export const debateKey = (trace: LaneTraceMap) => (trace.bull?.startedAt ? `debate:${trace.bull.startedAt}` : null);
export const briefKey = (trace: LaneTraceMap) => (trace.brief?.startedAt ? `brief:${trace.brief.startedAt}` : null);
/** Hỏi đáp: khoá theo số lượt trả lời đã xong — có lượt mới thì lại "chưa lưu". */
export const qaKey = (turns: QaTurn[]) => {
  const n = turns.filter((t) => t.role === "assistant").length;
  return n ? `qa:${n}` : null;
};

export function DebateExport({ desk, subject, bull, bear, judge, trace, busy, extra = [] }: {
  desk: ObsidianDesk; subject: string | null; bull: LaneLike | null; bear: LaneLike | null; judge: LaneLike | null; trace: LaneTraceMap; busy: boolean; extra?: MenuItem[];
}) {
  if (!bull && !bear) return null;
  const key = debateKey(trace);
  const input = (a: { now: number; suffix: string; options: ExportOptions }) => ({ subject, bull, bear, judge, trace: { bull: trace.bull, bear: trace.bear, judge: trace.judge }, ...a, folder: desk.prefs.folder });
  const saved = desk.fileOf(key);
  const canvas: MenuItem = {
    id: "canvas", label: "Tải Canvas (.canvas)",
    hint: saved ? `Bản đồ phe mua · phe bán · trọng tài, liên kết tới “${saved.fileName}”` : "Lưu ghi chú tranh luận (Mở trong Obsidian hoặc Tải .md) trước để Canvas liên kết đúng",
    onSelect: () => {
      if (!saved) { desk.announce("warn", "Hãy lưu ghi chú tranh luận trước (Mở trong Obsidian hoặc Tải .md) để Canvas liên kết tới đúng ghi chú."); return; }
      const c = buildDebateCanvas({ ...input({ now: Date.now(), suffix: saved.fileName.match(/ - ([a-z0-9]{1,8})\.md$/i)?.[1] ?? desk.newSuffix(), options: desk.prefs.options }) }, saved.folder ? `${saved.folder}/${saved.fileName}` : saved.fileName);
      desk.download(c.fileName, c.json, "application/json;charset=utf-8", key ? `canvas:${key}` : null);
    },
  };
  const journal: AltDoc = {
    id: "journal", label: "Nhật ký quyết định", hint: "Luận điểm + bối cảnh định lượng + hậu kiểm +5/+10/+20 phiên", previewTitle: `Xem trước · Nhật ký quyết định ${subject ?? "Elite 10"}`,
    savedKey: key ? `journal:${key}` : null,
    build: (a) => buildJournalNote({ ...input(a), calendar: VN_CAL, debateFileName: desk.fileOf(key)?.fileName ?? null }),
  };
  return (
    <NoteExport desk={desk} label="Lưu tranh luận" testId="obsidian-debate" previewTitle={`Xem trước · Tranh luận ${subject ?? "Elite 10"}`}
      notReady={busy || [bull, bear, judge].some((l) => l && !l.done) ? RUNNING : null} savedKey={key} lanes={[bull, bear, judge]}
      alts={[journal]} extra={[canvas, ...extra]} build={(a) => buildDebateNote(input(a))} />
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

export function QaExport({ desk, turns, meta }: { desk: ObsidianDesk; turns: QaTurn[]; meta: QaMeta | null }) {
  const answered = turns.filter((t) => t.role === "assistant");
  if (!answered.length) return null;
  const lanes = answered.flatMap((t) => (t.role === "assistant" ? t.lanes : []));
  const running = lanes.some((l) => !l.done);
  const key = qaKey(turns);
  const build = (scope: "all" | "last") => (a: { now: number; suffix: string; options: ExportOptions }) => buildQaNote({ turns, meta, ...a, folder: desk.prefs.folder }, scope);
  const last: AltDoc = { id: "last", label: "Chỉ lượt cuối", hint: "Một câu hỏi và câu trả lời gần nhất", previewTitle: "Xem trước · Hỏi đáp (lượt cuối)", build: build("last"), savedKey: key ? `${key}:last` : null };
  return (
    <NoteExport desk={desk} label={`Lưu cuộc trao đổi (${answered.length} lượt)`} testId="obsidian-qa" previewTitle={`Xem trước · Hỏi đáp (toàn bộ ${answered.length} lượt)`}
      notReady={running ? RUNNING : null} savedKey={key} lanes={lanes} alts={[last]} showQuestions build={build("all")} />
  );
}
