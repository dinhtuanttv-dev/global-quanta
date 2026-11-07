// Thành phần dùng chung của Bảng quyết định Elite 10 (Danh mục + Ứng viên): định dạng số, ô "⏱ Điểm mua", nút thu gọn / gọn.
import type { BuyCell } from "../../../lib/elite10/buyTimingCell";

export const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const signed = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const price = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));

// B2: ô "⏱ Điểm mua" — màu theo loại: trong vùng (xanh) · ≤ 5 phiên (vàng) · trong kỳ nắm giữ (xanh lam) · gần đạt / quy tắc (xám).
const BUY_TONE: Record<BuyCell["kind"], string> = { in: "text-emerald-300", soon: "text-amber-300", wait: "text-sky-300", near: "text-slate-300", rule: "text-slate-300", to: "text-cyan-300" };
const BUY_ICON: Record<BuyCell["kind"], string> = { in: "●", soon: "⏱", wait: "⏱", near: "◌", rule: "→", to: "◆" };
export function BuyTimingCell({ cell, compact = false }: { cell?: BuyCell; compact?: boolean }) {
  if (!cell) return <span className="text-slate-500">—</span>;
  return (
    <span title={cell.tooltip} data-kind={cell.kind} className={`inline-flex flex-col leading-tight ${cell.dashed ? "border-b border-dashed border-slate-500/60" : ""}`}>
      <b className={`whitespace-nowrap ${BUY_TONE[cell.kind]}`}>{BUY_ICON[cell.kind]} {cell.text}</b>
      {!compact && <span className="text-[10px] text-slate-500 whitespace-nowrap">{cell.sub}</span>}
    </span>
  );
}

/** C2: nút "Gọn / Đầy đủ" (ẩn cột phụ) + "Thu gọn / Mở" (ẩn bảng, còn dòng tóm tắt) — có aria-expanded / aria-pressed. */
export function SectionControls({ id, open, compact, onToggleOpen, onToggleCompact, testid }: {
  id: string; open: boolean; compact: boolean; onToggleOpen: () => void; onToggleCompact: () => void; testid: string;
}) {
  const btn = "min-h-[24px] rounded border border-white/15 px-2 text-[10px] text-slate-300 hover:border-[#E8B84B]/50 hover:text-[#F5CE72]";
  return (
    <span className="inline-flex items-center gap-1">
      {open && <button type="button" className={btn} aria-pressed={compact} onClick={onToggleCompact} data-testid={`${testid}-compact`}
        title={compact ? "Hiện đủ cột" : "Chỉ giữ cột chính (Mã, Ngành, Điểm mua, Z, P vượt, Giá, Cắt lỗ)"}>{compact ? "Đầy đủ" : "Gọn"}</button>}
      <button type="button" className={btn} aria-expanded={open} aria-controls={id} onClick={onToggleOpen} data-testid={`${testid}-toggle`}>{open ? "▾ Thu gọn" : "▸ Mở"}</button>
    </span>
  );
}

/**
 * Elite × TO (07/11/2026) — cảnh báo GDKHQ: GDKHQ cổ tức tiền đã công bố rơi vào kỳ nắm giữ của vị thế. Số lịch sử (EX-r1, MÔ TẢ): giữ qua
 * GDKHQ 5 phiên theo nhóm lợi suất, vượt VN-Index, ĐÃ GỒM cổ tức nhận sau thuế. Chỉ thông tin — không đổi danh mục / lệnh Elite.
 */
export function ExGuardChip({ g }: { g: import("../../../lib/elite10/toTiming").ExGuard }) {
  const pc = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")}%`);
  const tip = `GDKHQ ${fmtDate(g.ex)} (cổ tức tiền ${g.cash.toLocaleString("vi-VN")} đ/cp, lợi suất ${pc(g.yieldNow)}, nhóm ${g.bucket}) nằm trong kỳ nắm giữ 10 phiên.`
    + ` Phiên cuối còn quyền: ${fmtDate(g.lastCum)}.`
    + (g.post?.n ? ` Lịch sử 2022–nay, nhóm ${g.bucket}: giữ qua GDKHQ 5 phiên vượt VN-Index ${pc(g.post.mean)} (khoảng 95% ${pc(g.post.ci95[0])}…${pc(g.post.ci95[1])}), dương ${Math.round((g.post.hit ?? 0) * 100)}% / ${g.post.n} đợt — đã gồm cổ tức sau thuế.` : "")
    + " Thông tin THĂM DÒ (kiểm định tiến EX-r1), không phải lệnh.";
  return (
    <span title={tip} data-testid={`elite-exguard-${g.ticker}`}
      className={`ml-1 rounded border px-1 text-[10px] font-semibold ${g.strong ? "border-rose-400/60 bg-rose-400/10 text-rose-300" : "border-amber-400/50 bg-amber-400/10 text-amber-300"}`}>
      GDKHQ {fmtDate(g.ex).slice(0, 5)} · bán trước {fmtDate(g.lastCum).slice(0, 5)}
    </span>
  );
}
