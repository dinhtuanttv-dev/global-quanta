import { useState, type ReactNode } from "react";

/** Khối rút gọn: mặc định chỉ một dòng tóm tắt, mở ra vẫn đủ nội dung. Trạng thái nhớ theo trình duyệt. */
export default function FoldSection({ id, title, summary, children, defaultOpen = false }: { id: string; title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const key = `gq.fold.${id}`;
  const [open, setOpenState] = useState(() => { try { const v = window.localStorage.getItem(key); return v == null ? defaultOpen : v === "1"; } catch { return defaultOpen; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { window.localStorage.setItem(key, v ? "1" : "0"); } catch { /* bỏ qua */ } };
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02]" data-testid={`fold-${id}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`fold-body-${id}`} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-white/[0.03]">
        <b className="text-[12px] font-semibold text-violet-300">{title}</b>
        {!open && summary && <span className="min-w-0 text-[11px] text-slate-400">{summary}</span>}
        <span className="ml-auto rounded border border-white/10 px-2 py-0.5 text-[11px] text-cyan-300">{open ? "Rút gọn ▴" : "Mở rộng ▾"}</span>
      </button>
      {open && <div id={`fold-body-${id}`} className="px-3 pb-3">{children}</div>}
    </section>
  );
}
