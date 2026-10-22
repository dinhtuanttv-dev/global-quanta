// TOPBAR T3 — popover truy cập được (spec §9, Phụ lục A §5): nút trigger có aria-expanded / aria-controls; render qua portal
// nhưng bấm / focus BÊN TRONG không bị coi là bấm ngoài; Escape đóng và trả focus về trigger; vị trí kẹp trong viewport,
// cập nhật khi resize / cuộn; trên mobile (< 640px) thành bottom sheet.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function usePopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const close = useCallback((returnFocus = true) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); }, []);
  return { open, setOpen, toggle: () => setOpen((v) => !v), close, triggerRef, id: `tbp-${id.replace(/:/g, "")}` };
}

export default function Popover({ pop, title, width = 320, children }: { pop: ReturnType<typeof usePopover>; title: string; width?: number; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; sheet: boolean }>({ top: 0, left: 0, sheet: false });

  const place = useCallback(() => {
    const t = pop.triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 640) { setPos({ top: 0, left: 0, sheet: true }); return; }
    const w = Math.min(width, vw - 16);
    const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    const h = panelRef.current?.offsetHeight ?? 0;
    const below = r.bottom + 8;
    const top = below + h > vh - 8 && r.top - 8 - h > 8 ? r.top - 8 - h : below; // không đủ chỗ dưới -> mở lên trên
    setPos({ top, left, sheet: false });
  }, [pop.triggerRef, width]);

  useLayoutEffect(() => { if (pop.open) place(); }, [pop.open, place]);
  useEffect(() => {
    if (!pop.open) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (panelRef.current?.contains(n) || pop.triggerRef.current?.contains(n)) return;
      pop.close(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); pop.close(true); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const f = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.clearTimeout(f);
    };
  }, [pop, place]);

  if (!pop.open) return null;
  return createPortal(
    <div ref={panelRef} id={pop.id} role="dialog" aria-label={title} tabIndex={-1}
      className={`tb-popover ${pos.sheet ? "tb-sheet" : ""}`}
      style={pos.sheet ? undefined : { top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16) }}>
      <div className="tb-pop-head">
        <span>{title}</span>
        <button type="button" className="tb-pop-close" aria-label="Đóng" onClick={() => pop.close(true)}>×</button>
      </div>
      <div className="tb-pop-body">{children}</div>
    </div>,
    document.body,
  );
}

/** Nút mở popover (button thật, aria-expanded / aria-controls). */
export function PopTrigger({ pop, label, className = "", children }: { pop: ReturnType<typeof usePopover>; label: string; className?: string; children: ReactNode }) {
  return (
    <button type="button" ref={pop.triggerRef} className={`tb-trigger ${className}`} aria-haspopup="dialog" aria-expanded={pop.open} aria-controls={pop.open ? pop.id : undefined}
      aria-label={label} onClick={pop.toggle}>
      {children}
    </button>
  );
}
