"use client";
// Super Chart — khối giao diện nền dùng chung:
//   Popover     : HTML Popover API gốc (top-layer, tự đóng khi bấm ra ngoài / Esc) — trình duyệt chưa hỗ trợ thì rơi về div tuyệt đối.
//   Modal       : <dialog>.showModal() (khoá focus gốc, Esc đóng, nền mờ) cho xác nhận / bảng lệnh / phím tắt / bảng trượt di động.
//   Toasts      : thông báo ngắn aria-live (đọc được bằng trình đọc màn hình), tự tắt.
// Mọi nút có nhãn chữ hoặc aria-label; vùng chạm ≥ 44px trên thiết bị cảm ứng (lớp .ws-touch).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const supportsPopover = () => typeof HTMLElement !== "undefined" && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, "popover");

/** Nút + bảng nổi neo dưới nút. `testid` của nút mở là hợp đồng E2E. */
export function Popover({ label, icon, children, testid, panelTestid, align = "start", width = 300, title, active, optionalLabel = false }: {
  label: ReactNode; icon?: ReactNode; children: ReactNode; testid: string; panelTestid?: string; align?: "start" | "end"; width?: number; title?: string; active?: boolean;
  /** Nhãn chữ ẩn khi workspace hẹp (còn icon + tooltip + aria-label). */ optionalLabel?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const native = supportsPopover();
  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect(), p = panel.current;
    if (!b || !p) return;
    const w = Math.min(width, window.innerWidth - 16);
    const left = align === "end" ? Math.max(8, b.right - w) : Math.min(Math.max(8, b.left), window.innerWidth - w - 8);
    const top = Math.min(b.bottom + 6, window.innerHeight - 80);
    Object.assign(p.style, { position: "fixed", left: `${left}px`, top: `${top}px`, width: `${w}px`, maxHeight: `${Math.max(200, window.innerHeight - top - 12)}px`, margin: "0", inset: "auto" });
    p.style.left = `${left}px`; p.style.top = `${top}px`;
  }, [align, width]);
  useLayoutEffect(() => {
    const p = panel.current;
    if (!p || !native) return;
    const onToggle = (e: Event) => { const st = (e as Event & { newState?: string }).newState; setOpen(st === "open"); if (st === "open") place(); };
    p.addEventListener("toggle", onToggle);
    return () => p.removeEventListener("toggle", onToggle);
  }, [native, place]);
  useEffect(() => {
    if (!open) return;
    const re = () => place();
    window.addEventListener("resize", re); window.addEventListener("scroll", re, true);
    return () => { window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true); };
  }, [open, place]);
  const toggle = () => {
    if (native) { (panel.current as HTMLElement & { togglePopover?: () => void })?.togglePopover?.(); return; }
    setOpen((v) => { if (!v) setTimeout(place, 0); return !v; });
  };
  useEffect(() => {
    if (native || !open) return;
    const close = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [native, open]);
  return (
    <>
      <button ref={btn} type="button" onClick={toggle} aria-expanded={open} aria-controls={`pop-${id}`} data-testid={testid} title={title}
        aria-label={title} className={`ws-btn ${active || open ? "ws-btn-on" : ""}`}>{icon}<span className={optionalLabel ? "ws-btn-text-opt" : "ws-btn-text"}>{label}</span></button>
      <div ref={panel} id={`pop-${id}`} {...(native ? { popover: "auto" } : {})} role="dialog" aria-label={typeof label === "string" ? label : title}
        data-testid={panelTestid} className="ws-pop" style={native ? undefined : { display: open ? "block" : "none", position: "fixed", zIndex: 60 }}>
        {(open || !native) && children}
      </div>
    </>
  );
}

/** Hộp thoại gốc <dialog> (modal). */
export function Modal({ open, onClose, title, children, testid, wide = false, sheet = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; testid?: string; wide?: boolean; sheet?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} data-testid={testid} aria-label={title}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`ws-dialog ${sheet ? "ws-sheet" : ""} ${wide ? "ws-dialog-wide" : ""}`}>
      <div className="ws-dialog-head">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Đóng" className="ws-icon-btn"><X className="w-4 h-4" /></button>
      </div>
      <div className="ws-dialog-body">{open && children}</div>
    </dialog>
  );
}

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
/** Thông báo ngắn (tối đa 3), tự tắt sau 5 giây; có thể kèm hành động (VD "Hoàn tác"). */
export function useToasts() {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, action }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 5000);
  }, []);
  const node = (
    <div className="ws-toasts" role="status" aria-live="polite" data-testid="ws-toasts">
      {list.map((t) => (
        <div key={t.id} className="ws-toast">
          <span>{t.text}</span>
          {t.action && <button type="button" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
  return { push, node };
}

/** Theo dõi bề rộng phần tử (container query cho JS: thanh công cụ / bảng chi tiết / di động). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
