// Thành phần dùng chung của Bảng quyết định Elite 10 (Danh mục + Ứng viên): định dạng số, ô "⏱ Điểm mua", nút thu gọn / gọn.
import type { BuyCell } from "../../../lib/elite10/buyTimingCell";

export const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const signed = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const price = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));

// B2: ô "⏱ Điểm mua" — màu theo loại: trong vùng (xanh) · ≤ 5 phiên (vàng) · trong kỳ nắm giữ (xanh lam) · gần đạt / quy tắc (xám).
const BUY_TONE: Record<BuyCell["kind"], string> = { in: "text-emerald-300", soon: "text-amber-300", wait: "text-sky-300", near: "text-slate-300", rule: "text-slate-300" };
const BUY_ICON: Record<BuyCell["kind"], string> = { in: "●", soon: "⏱", wait: "⏱", near: "◌", rule: "→" };
export function BuyTimingCell({ cell, compact = false }: { cell?: BuyCell; compact?: boolean }) {
  if (!cell) return <span className="text-slate-500">—</span>;
  return (
    <span title={cell.tooltip} data-kind={cell.kind} className={`inline-flex flex-col leading-tight ${cell.dashed ? "border-b border-dashed border-slate-500/60" : ""}`}>
      <b className={`whitespace-nowrap ${BUY_TONE[cell.kind]}`}>{BUY_ICON[cell.kind]} {cell.text}</b>
      {!compact && <span className="text-[9.5px] text-slate-500 whitespace-nowrap">{cell.sub}</span>}
    </span>
  );
}

/** C2: nút "Gọn / Đầy đủ" (ẩn cột phụ) + "Thu gọn / Mở" (ẩn bảng, còn dòng tóm tắt) — có aria-expanded / aria-pressed. */
export function SectionControls({ id, open, compact, onToggleOpen, onToggleCompact, testid }: {
  id: string; open: boolean; compact: boolean; onToggleOpen: () => void; onToggleCompact: () => void; testid: string;
}) {
  const btn = "min-h-[24px] rounded border border-white/15 px-2 text-[10px] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200";
  return (
    <span className="inline-flex items-center gap-1">
      {open && <button type="button" className={btn} aria-pressed={compact} onClick={onToggleCompact} data-testid={`${testid}-compact`}
        title={compact ? "Hiện đủ cột" : "Chỉ giữ cột chính (Mã, Ngành, Điểm mua, Z, P vượt, Giá, Cắt lỗ)"}>{compact ? "Đầy đủ" : "Gọn"}</button>}
      <button type="button" className={btn} aria-expanded={open} aria-controls={id} onClick={onToggleOpen} data-testid={`${testid}-toggle`}>{open ? "▾ Thu gọn" : "▸ Mở"}</button>
    </span>
  );
}
