// HL-RADAR P3 (20/11/2026, tài liệu 20) — "Lớp tác động" mở rộng dưới từng dòng của bảng Danh mục Elite HL: dùng NGUYÊN khối
// "Tác động lên cổ phiếu" của Hồ sơ 360° (StockImpactCard — các lớp thế giới / ngành / xúc tác kèm dấu bằng chứng, nguồn Gateway
// /api/elite/impact/:t có sẵn). Chỉ tải khi người dùng mở; mọi phần tử mang data-hl-layer. MÔ TẢ, không đổi danh mục.
import StockImpactCard from "./StockImpactCard";

export function HlImpactToggle({ ticker, open, onToggle, mobile = false }: { ticker: string; open: boolean; onToggle: () => void; mobile?: boolean }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} data-hl-layer="impact" data-testid={`hl-impact-btn-${mobile ? "m-" : ""}${ticker}`}
      title="Mở các lớp tác động lên cổ phiếu (thế giới, ngành, xúc tác) — như Hồ sơ 360°"
      className={`ml-1 min-h-[22px] rounded border px-1.5 text-[10px] ${open ? "border-sky-400/50 bg-sky-400/10 text-sky-200" : "border-white/15 text-slate-300 hover:border-sky-400/40 hover:text-sky-200"}`}>
      {open ? "▾ Tác động" : "▸ Tác động"}
    </button>
  );
}

export function HlImpactRow({ ticker, colSpan }: { ticker: string; colSpan: number }) {
  return (
    <tr data-hl-layer="impact" data-testid={`hl-impact-row-${ticker}`}>
      <td colSpan={colSpan} className="pb-2 pt-1"><StockImpactCard ticker={ticker} /></td>
    </tr>
  );
}

export function HlImpactBlock({ ticker }: { ticker: string }) {
  return <div className="mt-1" data-hl-layer="impact" data-testid={`hl-impact-m-${ticker}`}><StockImpactCard ticker={ticker} /></div>;
}
