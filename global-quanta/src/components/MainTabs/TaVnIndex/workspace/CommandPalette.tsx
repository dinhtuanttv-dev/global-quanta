"use client";
// Super Chart SC4 — BẢNG LỆNH (⌘/Ctrl + K): mọi thao tác của phần chart trong một ô tìm kiếm — bật/tắt lớp, preset, công cụ vẽ,
// khung thời gian, khoảng nhìn, tab dock, xuất ảnh, hoàn tác… Tìm mờ KHÔNG DẤU (gõ "khoi luong" ra "Khối lượng"), ↑↓ chọn, Enter chạy.
// ARIA combobox + listbox; chạy trong <dialog> gốc (khoá focus, Esc đóng).
import { useMemo, useState } from "react";
import { Modal } from "./ui";

export interface Command { id: string; group: string; label: string; hint?: string; keys?: string; run: () => void; active?: boolean }

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
/** Điểm khớp mờ: mọi từ của truy vấn phải xuất hiện (không dấu); khớp đầu từ / liên tiếp được điểm cao hơn. */
export function scoreCommand(c: Pick<Command, "label" | "group" | "hint">, q: string): number {
  const query = fold(q).trim();
  if (!query) return 1;
  const hay = fold(`${c.label} ${c.group} ${c.hint ?? ""}`);
  let score = 0;
  for (const w of query.split(/\s+/)) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    score += (i === 0 || hay[i - 1] === " " ? 3 : 1) + w.length / 10;
  }
  return score;
}

export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useMemo(() => commands.map((c) => ({ c, s: scoreCommand(c, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.c), [commands, q]);
  const run = (c: Command | undefined) => { if (!c) return; onClose(); setQ(""); setSel(0); setTimeout(c.run, 0); };
  return (
    <Modal open={open} onClose={() => { onClose(); setQ(""); setSel(0); }} title="Bảng lệnh" testid="command-palette" wide>
      <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Gõ lệnh… (VD: khoi luong, fib, cau truc, 1H, xuat anh)"
        role="combobox" aria-expanded aria-controls="cmd-list" aria-activedescendant={list[sel] ? `cmd-${list[sel].id}` : undefined} aria-label="Tìm lệnh"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(list.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter") { e.preventDefault(); run(list[sel]); }
        }}
        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-[12px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400/60" data-testid="command-input" />
      <ul id="cmd-list" role="listbox" className="mt-2 max-h-[55vh] overflow-y-auto space-y-0.5">
        {list.map((c, i) => (
          <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(c)} data-testid="command-item"
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[11px] ${i === sel ? "bg-cyan-500/15 text-cyan-100" : "text-slate-300"}`}>
            <span className="text-[9px] uppercase tracking-wide text-slate-500 w-24 shrink-0 truncate">{c.group}</span>
            <span className="flex-1 truncate">{c.label}{c.active ? " · đang bật" : ""}</span>
            {c.keys && <kbd className="text-[9px] text-slate-400 border border-slate-700 rounded px-1">{c.keys}</kbd>}
          </li>
        ))}
        {!list.length && <li className="text-[11px] text-slate-500 px-2 py-3">Không có lệnh khớp “{q}”.</li>}
      </ul>
    </Modal>
  );
}

export const SHORTCUTS: [string, string][] = [
  ["Ctrl/⌘ + K", "Mở bảng lệnh"], ["?", "Danh sách phím tắt"], ["← →", "Dịch biểu đồ 5 nến (Shift: 20)"], ["+ / −", "Phóng to / thu nhỏ"],
  ["Home / End", "Về đầu / cuối dữ liệu"], ["Alt + T / R / F / Z", "Trendline / Zone / Fibonacci / Fib Time Zones"], ["Ctrl/⌘ + Z", "Hoàn tác hình vẽ"],
  ["Ctrl/⌘ + Shift + Z · Ctrl + Y", "Làm lại"], ["Delete / Backspace", "Xoá hình đang chọn"], ["Esc", "Huỷ nét vẽ / bỏ chọn"],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Phím tắt biểu đồ" testid="shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
        {SHORTCUTS.map(([k, v]) => <div key={k} className="contents"><dt><kbd className="text-[10px] text-cyan-200 border border-slate-700 rounded px-1">{k}</kbd></dt><dd className="text-slate-300">{v}</dd></div>)}
      </dl>
      <p className="mt-2 text-[10px] text-slate-500">Phím di chuyển chỉ hoạt động khi biểu đồ đang được chọn (bấm vào biểu đồ); không chặn khi bạn đang gõ trong ô nhập.</p>
    </Modal>
  );
}
