// Menu "Lưu" (mẫu nút bấm + danh sách, WAI-ARIA menu button): mũi tên / Home / End / Enter / Space / Escape, focus trả về nút gọi.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Save } from "lucide-react";

export interface MenuItem { id: string; label: string; hint?: string; onSelect: () => void; separatorBefore?: boolean }

export default function ExportMenu({ label, items, disabledReason, testId, compactLabel }: {
  label: string; items: MenuItem[]; disabledReason?: string | null; testId: string; compactLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuLeft, setMenuLeft] = useState<number | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const disabled = Boolean(disabledReason);

  useEffect(() => { if (open) itemRefs.current[active]?.focus(); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const close = (focusButton = true) => { setOpen(false); if (focusButton) btnRef.current?.focus(); };
  const openAt = (i: number) => {
    if (disabled) return;
    const r = btnRef.current?.getBoundingClientRect();
    // Menu rộng min(280px, màn hình − 24px): ưu tiên căn mép phải với nút, rồi KẸP trong [8px, màn hình − 8px] để không tràn hai bên.
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (r && wrap) {
      const w = Math.min(280, window.innerWidth - 24);
      const left = Math.min(Math.max(r.right - w, 8), window.innerWidth - w - 8);
      setMenuLeft(Math.round(left - wrap.left));
    } else setMenuLeft(null);
    setActive(i); setOpen(true);
  };
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); openAt(0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); openAt(items.length - 1); }
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const n = items.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % n); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + n) % n); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(n - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };
  const choose = (it: MenuItem) => { close(); it.onSelect(); };

  return (
    <div ref={wrapRef} className="relative inline-block" data-testid={testId}>
      <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-disabled={disabled || undefined} title={disabledReason ?? undefined} aria-label={compactLabel ? label : undefined}
        onClick={() => (open ? close(false) : openAt(0))} onKeyDown={onButtonKey}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${disabled ? "cursor-not-allowed border-white/10 text-slate-400" : "border-white/20 text-slate-200 hover:border-q-accent/50 hover:text-q-text"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-q-accent-strong`}>
        <Save className="h-3.5 w-3.5" aria-hidden />
        <span className={compactLabel ? "hidden sm:inline" : undefined}>{compactLabel ?? label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {disabled && <span className="sr-only">{disabledReason}</span>}
      {open && (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey} style={{ width: "min(280px, calc(100vw - 24px))", ...(menuLeft == null ? {} : { left: menuLeft }) }}
          className={`absolute ${menuLeft == null ? "right-0" : ""} z-30 mt-1 rounded-md border border-white/15 bg-[#121826] p-1 shadow-xl`}>
          {items.map((it, i) => (
            <div key={it.id}>
              {it.separatorBefore && <div role="separator" className="my-1 h-px bg-white/10" />}
              <button ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitem" tabIndex={i === active ? 0 : -1}
                onClick={() => choose(it)} onMouseEnter={() => setActive(i)} data-testid={`${testId}-${it.id}`}
                className="flex min-h-[32px] w-full flex-col items-start rounded px-2.5 py-1.5 text-left text-[11.5px] text-slate-100 hover:bg-white/10 focus:bg-white/10 focus:outline-none">
                <span>{it.label}</span>
                {it.hint && <span className="text-[10.5px] text-slate-300">{it.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
