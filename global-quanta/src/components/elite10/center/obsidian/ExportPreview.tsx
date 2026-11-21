// Xem trước ghi chú trước khi xuất: tên tệp, thư mục, Markdown; 3 công tắc nội dung (nhớ theo trình duyệt); 3 hành động xuất.
import type { ExportOptions, NoteOut } from "../../../../lib/obsidian/types";
import Modal from "./Modal";
import type { ExportAction } from "./useObsidianDesk";

const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace" } as const;
const BTN = "inline-flex min-h-[32px] items-center rounded-md px-3 py-1.5 text-[11.5px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5CE72]";

export default function ExportPreview({ title, note, options, onOptions, onAction, onClose, showQuestions = false }: {
  title: string; note: NoteOut; options: ExportOptions; onOptions: (o: Partial<ExportOptions>) => void;
  onAction: (a: ExportAction) => void; onClose: () => void; showQuestions?: boolean;
}) {
  const toggles: [keyof ExportOptions, string][] = [
    ...(showQuestions ? [["includeQuestions", "Gồm câu hỏi của tôi"] as [keyof ExportOptions, string]] : []),
    ["includeEvidence", "Gồm bằng chứng công cụ"], ["includeLinks", "Gồm liên kết (Graph view)"],
  ];
  const status = note.meta.evidenceStatus;
  return (
    <Modal title={title} onClose={onClose} testId="obsidian-preview" wide
      footer={<>
        <button type="button" className={`${BTN} border border-white/20 text-slate-200 hover:bg-white/10`} onClick={() => onAction("copy")}>Sao chép Markdown</button>
        <button type="button" className={`${BTN} border border-white/20 text-slate-200 hover:bg-white/10`} onClick={() => onAction("download")}>Tải .md</button>
        <button type="button" className={`${BTN} bg-[#E8B84B]/25 text-[#F5CE72] hover:bg-[#E8B84B]/35`} onClick={() => onAction("obsidian")} data-testid="obsidian-preview-open">Mở trong Obsidian</button>
      </>}>
      <dl className="mb-2 gap-x-3 gap-y-0.5 text-[11.5px]" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)" }}>
        <dt className="text-slate-300">Tệp</dt><dd className="break-all text-slate-100" style={MONO} data-testid="obsidian-preview-file">{note.fileName}</dd>
        <dt className="text-slate-300">Thư mục</dt><dd className="break-all text-slate-100" style={MONO}>{note.folder || "(gốc Vault)"}</dd>
        <dt className="text-slate-300">Bằng chứng</dt>
        <dd className={status === "complete" ? "text-emerald-300" : "text-amber-200"}>{status === "complete" ? "Đầy đủ" : status === "fallback" ? "Có mô hình dự phòng" : "Dở dang — ghi chú gắn evidence_status: partial"}</dd>
        <dt className="text-slate-300">Dữ liệu tới</dt><dd className="text-slate-100">{note.meta.dataAsOf ?? "chưa xác định"}</dd>
      </dl>
      <fieldset className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
        <legend className="sr-only">Nội dung ghi chú</legend>
        {toggles.map(([k, label]) => (
          <label key={k} className="inline-flex min-h-[32px] cursor-pointer items-center gap-2 text-slate-200">
            <input type="checkbox" checked={options[k]} onChange={(e) => onOptions({ [k]: e.target.checked })} className="h-4 w-4 accent-[#E8B84B]" />{label}
          </label>
        ))}
      </fieldset>
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-slate-200" style={{ ...MONO, overflowWrap: "anywhere" }} data-testid="obsidian-preview-md" tabIndex={0} aria-label="Nội dung Markdown">{note.markdown}</pre>
      <p className="mt-2 text-[11px] text-slate-300">Ghi chú chỉ được tạo trên trình duyệt của bạn — không gửi lên máy chủ. Mở trong Obsidian chỉ gửi yêu cầu cho ứng dụng; nếu không mở được, dùng Tải .md.</p>
    </Modal>
  );
}
