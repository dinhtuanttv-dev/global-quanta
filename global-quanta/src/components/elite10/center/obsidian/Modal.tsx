// Hộp thoại dùng chung (role="dialog", aria-modal): focus vào phần tử đầu, Tab bị giữ bên trong, Escape đóng, đóng xong focus trả về nơi mở.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, footer, testId, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testId: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !ref.current) return;
    const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKey} data-testid={testId}
        className={`flex max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-md"} flex-col rounded-lg border border-white/15 bg-[#0E131F] text-slate-200 shadow-2xl`}>
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h3 id={titleId} className="text-[12px] font-bold uppercase tracking-wide text-slate-100">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F5CE72]"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  );
}
