"use client";
// Super Chart SC3 — DANH SÁCH ĐỐI TƯỢNG: mọi hình vẽ tay của mã đang xem — chọn (nổi điểm neo trên biểu đồ), đổi tên, ẩn / hiện,
// khoá (không kéo sửa được), xoá từng hình; hoàn tác / làm lại 50 bước; "Xoá tất cả" tách riêng, phải xác nhận và hoàn tác được.
// Lớp do engine tạo (SMC, Elliott Pro…) KHÔNG nằm ở đây -> không thể xoá nhầm kết quả phân tích khi muốn xoá hình vẽ.
import { useState } from "react";
import { Eye, EyeOff, Lock, LockOpen, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import type { DrawnPrimitive } from "../../../../lib/ta-command-center/DrawingManager";
import { primitiveLabel, TOOL_NAME } from "../../../../lib/ta-command-center/chart/drawingHit";
import { Modal } from "./ui";

interface Props {
  primitives: DrawnPrimitive[]; selectedId: string | null; onSelect: (id: string | null) => void;
  onRename: (id: string, name: string) => void; onToggleHidden: (id: string) => void; onToggleLocked: (id: string) => void; onDelete: (id: string) => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; onClearAll: () => void; saveState: "idle" | "local" | "cloud"; ticker: string;
}

export default function ObjectList(p: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(false);
  const commit = (id: string) => { p.onRename(id, draft); setEditing(null); };
  return (
    <div className="space-y-2" data-testid="object-list">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold text-slate-200">Hình vẽ của tôi · {p.ticker}</span>
        <span className="text-[9px] text-slate-500 font-mono">({p.primitives.length})</span>
        <span className="ml-auto flex gap-1">
          <button type="button" className="ws-icon-btn" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Hoàn tác (Ctrl+Z)" title="Hoàn tác (Ctrl+Z)" data-testid="objects-undo"><Undo2 className="w-3.5 h-3.5" /></button>
          <button type="button" className="ws-icon-btn" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Làm lại (Ctrl+Shift+Z)" title="Làm lại (Ctrl+Shift+Z)" data-testid="objects-redo"><Redo2 className="w-3.5 h-3.5" /></button>
        </span>
      </div>
      {p.primitives.length === 0 ? (
        <p className="text-[10px] text-slate-500 leading-snug">Chưa có hình vẽ. Chọn Trendline / Zone / Fibonacci trên thanh công cụ rồi kéo trên biểu đồ. Bấm vào hình trên biểu đồ để chọn; kéo điểm neo để sửa, kéo thân để dời.</p>
      ) : (
        <ul className="space-y-0.5" role="listbox" aria-label="Danh sách hình vẽ">
          {[...p.primitives].reverse().map((x) => {
            const sel = x.id === p.selectedId;
            return (
              <li key={x.id} role="option" aria-selected={sel} data-testid="object-row"
                className={`flex items-center gap-1 rounded px-1.5 py-1 text-[10px] ${sel ? "bg-cyan-500/10 ring-1 ring-cyan-400/40" : "hover:bg-slate-800/50"} ${x.hidden ? "opacity-50" : ""}`}>
                {editing === x.id ? (
                  <input autoFocus value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(x.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") commit(x.id); if (e.key === "Escape") setEditing(null); }}
                    aria-label="Tên hình vẽ" className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-slate-100" />
                ) : (
                  <button type="button" onClick={() => p.onSelect(sel ? null : x.id)} className="flex-1 min-w-0 text-left truncate text-slate-200" title={TOOL_NAME[x.toolType]}>
                    {primitiveLabel(x)}
                  </button>
                )}
                <button type="button" className="ws-icon-btn" aria-label="Đổi tên" title="Đổi tên" onClick={() => { setEditing(x.id); setDraft(x.name ?? ""); }}><Pencil className="w-3 h-3" /></button>
                <button type="button" className="ws-icon-btn" aria-pressed={!!x.hidden} aria-label={x.hidden ? "Hiện" : "Ẩn"} title={x.hidden ? "Hiện" : "Ẩn"} onClick={() => p.onToggleHidden(x.id)} data-testid="object-hide">
                  {x.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</button>
                <button type="button" className="ws-icon-btn" aria-pressed={!!x.locked} aria-label={x.locked ? "Mở khoá" : "Khoá"} title={x.locked ? "Mở khoá" : "Khoá (không kéo sửa)"} onClick={() => p.onToggleLocked(x.id)} data-testid="object-lock">
                  {x.locked ? <Lock className="w-3 h-3 text-amber-300" /> : <LockOpen className="w-3 h-3" />}</button>
                <button type="button" className="ws-icon-btn" aria-label="Xoá hình này" title="Xoá hình này (Delete)" onClick={() => p.onDelete(x.id)} data-testid="object-delete"><Trash2 className="w-3 h-3 text-rose-300" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
        <span className="text-[9px] text-slate-500" data-testid="drawings-saved-state">{p.saveState === "cloud" ? "☁ Đã lưu theo tài khoản" : p.saveState === "local" ? "Đã lưu trên máy này" : "Hình vẽ lưu theo mã"}</span>
        {p.primitives.length > 0 && (
          <button type="button" onClick={() => setConfirm(true)} className="ml-auto text-[10px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1" data-testid="drawings-clear-all">
            <Trash2 className="w-3 h-3" /> Xoá tất cả…
          </button>
        )}
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Xoá tất cả hình vẽ?" testid="confirm-clear">
        <p className="text-[11px] text-slate-300 leading-snug">Xoá {p.primitives.length} hình vẽ của {p.ticker}. Kết quả phân tích (SMC, Elliott Pro, Cấu trúc…) không bị ảnh hưởng. Có thể hoàn tác ngay sau đó (Ctrl+Z).</p>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="ws-btn" onClick={() => setConfirm(false)}>Huỷ</button>
          <button type="button" className="ws-btn ws-btn-danger" onClick={() => { p.onClearAll(); setConfirm(false); }} data-testid="confirm-clear-ok">Xoá tất cả</button>
        </div>
      </Modal>
    </div>
  );
}
