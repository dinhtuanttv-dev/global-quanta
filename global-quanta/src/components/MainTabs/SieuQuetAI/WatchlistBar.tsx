import { useState } from "react";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import { MAX_WATCHLIST_TICKERS, parseTickerInput, useWatchlists } from "../../../hooks/useWatchlists";
import { basketSummary } from "./scannerTaxonomy";

const fmt1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));

/** Dải tóm tắt điểm của rổ đang xem (VN30 / danh mục / bộ lọc ngành). */
export function BasketSummary({ items, title }: { items: SieuQuetStockItem[]; title: string }) {
  const s = basketSummary(items);
  if (!s.n) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9.5px] text-slate-400 mb-2 px-2 py-1 rounded" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)" }}>
      <span className="text-cyan-200 font-semibold">{title}</span>
      <span>{s.n} mã{s.outside ? ` (${s.outside} ngoài universe)` : ""}</span>
      <span>Smart TB <b className="text-amber-400">{fmt1(s.avgSmart)}</b></span>
      <span title="Điểm cơ bản / kỹ thuật trung bình">FA {fmt1(s.avgFa)} · TA {fmt1(s.avgTa)}</span>
      <span>RS TB {fmt1(s.avgRs)}</span>
      <span title="Số mã Up-Trend (giá > MA20 > MA50)">▲ Up-Trend {s.upTrend}/{s.n}</span>
      {s.breakout > 0 && <span>⚡ Breakout {s.breakout}</span>}
      {s.foreign > 0 && <span>🌍 NN mua ròng {s.foreign}</span>}
      {s.top.length > 0 && <span>Mạnh nhất: <b className="text-slate-200">{s.top.join(", ")}</b></span>}
      {s.groups.length > 1 && <span>Tỷ trọng: {s.groups.map((g) => `${g.name} ${Math.round(g.share * 100)}%`).join(" · ")}</span>}
    </div>
  );
}

/** Quản lý danh mục tự chọn ngay trên bảng: chọn/tạo/đổi tên/xoá danh mục, thêm mã, bỏ mã. */
export default function WatchlistBar({ notFound, insufficient, loading, gatewayReady }: { notFound: string[]; insufficient: string[]; loading: boolean; gatewayReady: boolean }) {
  const wl = useWatchlists();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const pinned = new Set(wl.active.pinned ?? []);

  const submit = () => {
    const { valid, invalid } = parseTickerInput(text);
    const added = valid.length ? wl.add(valid) : 0;
    const skipped = valid.length - added;
    setMsg([
      added ? `Đã thêm ${added} mã.` : null,
      skipped ? `${skipped} mã đã có hoặc vượt giới hạn ${MAX_WATCHLIST_TICKERS}.` : null,
      invalid.length ? `Sai định dạng: ${invalid.join(", ")}.` : null,
    ].filter(Boolean).join(" ") || null);
    setText("");
  };

  return (
    <div className="mb-2 px-2 py-1.5 rounded" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {renaming ? (
          <input autoFocus defaultValue={wl.active.name} aria-label="Tên danh mục"
            onBlur={(e) => { wl.rename(e.target.value); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(false); }}
            className="text-[10px] bg-black/40 border border-cyan-500/50 rounded px-2 py-1 text-slate-200 w-36 outline-none" />
        ) : (
          <select value={wl.active.id} onChange={(e) => wl.setActive(e.target.value)} aria-label="Chọn danh mục"
            className="text-[10px] bg-black/40 border border-white/10 rounded px-1.5 py-1 text-slate-200 max-w-[160px]">
            {wl.lists.map((l) => <option key={l.id} value={l.id}>★ {l.name} ({l.tickers.length})</option>)}
          </select>
        )}
        <button type="button" className="text-[9.5px] px-1.5 py-1 rounded bg-white/5 text-slate-300 hover:bg-white/10" onClick={() => wl.create(`Danh mục ${wl.lists.length + 1}`)} title="Tạo danh mục mới">＋ Mới</button>
        <button type="button" className="text-[9.5px] px-1.5 py-1 rounded bg-white/5 text-slate-300 hover:bg-white/10" onClick={() => setRenaming(true)} title="Đổi tên danh mục">Đổi tên</button>
        <button type="button" className="text-[9.5px] px-1.5 py-1 rounded bg-white/5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
          onClick={() => { if (window.confirm(`Xoá danh mục "${wl.active.name}"?`)) wl.remove(); }} title="Xoá danh mục">Xoá</button>
        <form className="flex items-center gap-1 ml-auto" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Thêm mã: FPT, HPG, VNM…" aria-label="Thêm mã vào danh mục"
            className="text-[10px] bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-200 w-44 outline-none focus:border-cyan-500/50" />
          <button type="submit" className="text-[9.5px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30">Thêm</button>
        </form>
      </div>
      {wl.active.tickers.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {[...wl.active.tickers].sort((a, b) => Number(pinned.has(b)) - Number(pinned.has(a))).map((t) => {
            const bad = notFound.includes(t) ? "không tìm thấy" : insufficient.includes(t) ? "chưa đủ 50 phiên dữ liệu" : null;
            const note = wl.active.notes?.[t] ?? null;
            const isPinned = pinned.has(t);
            return (
              <span key={t} className={`inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.5 rounded border ${bad ? "border-rose-700/60 text-rose-300" : isPinned ? "border-amber-500/40 text-slate-200" : "border-white/10 text-slate-300"}`}
                title={[bad, note ? `Ghi chú: ${note}` : null].filter(Boolean).join(" · ") || undefined}>
                <button type="button" aria-pressed={isPinned} aria-label={isPinned ? `Bỏ ghim ${t}` : `Ghim ${t} lên đầu`} onClick={() => wl.togglePin(t)}
                  className={isPinned ? "text-amber-400" : "text-slate-600 hover:text-amber-300"}>📌</button>
                {t}{bad ? " ⚠" : ""}
                {note && <span className="text-slate-500 max-w-[90px] truncate">· {note}</span>}
                <button type="button" aria-label={`Ghi chú cho ${t}`} title="Ghi chú / lý do theo dõi"
                  onClick={() => { const v = window.prompt(`Ghi chú / lý do theo dõi mã ${t}:`, note ?? ""); if (v !== null) wl.setNote(t, v); }}
                  className="text-slate-500 hover:text-cyan-300">✎</button>
                <button type="button" aria-label={`Bỏ ${t} khỏi danh mục`} onClick={() => wl.removeTicker(t)} className="text-slate-500 hover:text-rose-300">×</button>
              </span>
            );
          })}
          {loading && <span className="text-[9.5px] text-slate-500">Đang chấm điểm mã ngoài universe…</span>}
        </div>
      ) : (
        <div className="text-[9.5px] text-slate-500 mt-1">Danh mục trống — nhập mã ở ô bên phải, hoặc bấm ☆ cạnh mã bất kỳ trong bảng (tab Tất cả / VN30).</div>
      )}
      {msg && <div className="text-[9.5px] text-slate-400 mt-1">{msg}</div>}
      {!gatewayReady && <div className="text-[9.5px] text-amber-400 mt-1">Mã ngoài universe cần Market Gateway để được chấm điểm.</div>}
    </div>
  );
}
