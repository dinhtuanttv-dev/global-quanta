import { useEffect, useMemo, useRef, useState } from "react";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import type { Basket } from "../../../hooks/useScannerBasket";
import { groupStats } from "./scannerTaxonomy";

export type GroupBy = "none" | "group" | "industry";

const seg = (on: boolean) =>
  `px-2 py-1 text-[10px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${on ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`;
const fmt1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));

/** Bộ lọc ngành 2 cấp (Nhóm ngành -> Ngành): đếm số mã + Smart Score TB trong rổ đang xem. */
function SectorFilter({ items, selected, onChange }: { items: SieuQuetStockItem[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const stats = useMemo(() => groupStats(items), [items]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const visible = stats
    .map((g) => ({ ...g, industries: g.industries.filter((i) => !needle || i.name.toLowerCase().includes(needle) || g.name.toLowerCase().includes(needle)) }))
    .filter((g) => g.industries.length);
  const toggle = (names: string[], on: boolean) => {
    const next = new Set(selected);
    for (const n of names) (on ? next.add(n) : next.delete(n));
    onChange(next);
  };
  const label = selected.size === 0 ? "Tất cả ngành" : selected.size === 1 ? [...selected][0] : `${selected.size} ngành`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}
        className={`text-[10px] bg-black/40 border rounded px-2 py-1 max-w-[160px] truncate ${selected.size ? "border-cyan-500/50 text-cyan-200" : "border-white/10 text-slate-300"}`}
        title="Lọc theo nhóm ngành / ngành">
        {label} ▾
      </button>
      {open && (
        <div role="dialog" aria-label="Lọc theo ngành" className="absolute right-0 top-full mt-1 z-30 w-72 rounded-lg p-2 shadow-xl"
          style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="flex gap-1 mb-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm ngành…" aria-label="Tìm ngành"
              className="flex-1 text-[10px] bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-200 outline-none focus:border-cyan-500/50" />
            <button type="button" onClick={() => onChange(new Set())} className="text-[9.5px] px-2 rounded bg-white/5 text-slate-300 hover:bg-white/10">Tất cả</button>
          </div>
          <div className="text-[8.5px] text-slate-500 mb-1 flex justify-between px-1"><span>Ngành</span><span>số mã · Smart TB</span></div>
          <div className="max-h-80 overflow-y-auto pr-1">
            {visible.map((g) => {
              const names = g.industries.map((i) => i.name);
              const nSel = names.filter((n) => selected.has(n)).length;
              return (
                <div key={g.name} className="mb-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-200 px-1 py-0.5 rounded hover:bg-white/5 cursor-pointer">
                    <input type="checkbox" checked={nSel === names.length} ref={(el) => { if (el) el.indeterminate = nSel > 0 && nSel < names.length; }}
                      onChange={(e) => toggle(names, e.target.checked)} className="accent-cyan-500" />
                    <span className="flex-1">{g.name}</span>
                    <span className="text-slate-400 font-normal">{g.count} · {fmt1(g.avgScore)}</span>
                  </label>
                  {g.industries.map((i) => (
                    <label key={i.name} className="flex items-center gap-1.5 text-[10px] text-slate-300 pl-5 pr-1 py-0.5 rounded hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={selected.has(i.name)} onChange={(e) => toggle([i.name], e.target.checked)} className="accent-cyan-500" />
                      <span className="flex-1 truncate">{i.name}</span>
                      <span className="text-slate-500">{i.count} · {fmt1(i.avgScore)}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {!visible.length && <div className="text-[10px] text-slate-500 px-1 py-2">Không có ngành phù hợp.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ScannerToolbarProps {
  basket: Basket; onBasket: (b: Basket) => void; watchlistCount: number; gatewayReady: boolean;
  items: SieuQuetStockItem[]; industries: Set<string>; onIndustries: (s: Set<string>) => void;
  groupBy: GroupBy; onGroupBy: (g: GroupBy) => void;
}

/** Góc phải Bảng Siêu Quét: rổ (Tất cả / VN30 / Danh mục), lọc ngành 2 cấp, gom nhóm. */
export default function ScannerToolbar({ basket, onBasket, watchlistCount, gatewayReady, items, industries, onIndustries, groupBy, onGroupBy }: ScannerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div role="tablist" aria-label="Rổ cổ phiếu" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
        <button role="tab" aria-selected={basket === "ALL"} className={seg(basket === "ALL")} onClick={() => onBasket("ALL")}>Tất cả</button>
        <button role="tab" aria-selected={basket === "VN30"} className={seg(basket === "VN30")} onClick={() => onBasket("VN30")}
          disabled={!gatewayReady} title={gatewayReady ? "Rổ VN30 (thành phần từ SSI)" : "Cần Market Gateway"}>VN30</button>
        <button role="tab" aria-selected={basket === "WATCHLIST"} className={seg(basket === "WATCHLIST")} onClick={() => onBasket("WATCHLIST")}
          title="Danh mục tự chọn: thêm/bớt mã, Siêu Quét chấm điểm riêng">★ Danh mục{watchlistCount ? ` (${watchlistCount})` : ""}</button>
      </div>
      <SectorFilter items={items} selected={industries} onChange={onIndustries} />
      <select value={groupBy} onChange={(e) => onGroupBy(e.target.value as GroupBy)} aria-label="Gom nhóm"
        className="text-[10px] bg-black/40 border border-white/10 rounded px-1.5 py-1 text-slate-300">
        <option value="none">Không gom nhóm</option>
        <option value="group">Gom theo nhóm ngành</option>
        <option value="industry">Gom theo ngành</option>
      </select>
    </div>
  );
}
