"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";

interface Props {
  current: Timeframe;
  onChange: (tf: Timeframe) => void;
  /** Đang tải nến phút (lần đầu chọn khung intraday). */
  loadingIntraday?: boolean;
  intradayError?: string | null;
  intradaySessions?: number;
  /** Super Chart: gọn trong thanh đầu workspace. */
  compact?: boolean;
  /** A3: độ phân giải thực tế của nến phút của mã — khung mịn hơn bị khoá (dữ liệu thô, gộp sẽ thành nến giả). */
  minIntraday?: Timeframe | null;
}

// Khung intraday gộp từ nến 1 phút SSI (20 phiên gần nhất); D/W/M từ chuỗi ngày điều chỉnh (~3 năm).
const INTRADAY: Timeframe[] = ["1m", "5m", "15m", "1H"];
const SWING: Timeframe[] = ["D", "W", "M"];
/** TA-T3 (Q4, chủ dự án 28/11): tên khung tiếng Việt — mã `data-tf` giữ nguyên (hợp đồng E2E). */
export const TF_SHORT: Record<string, string> = { "1m": "1p", "5m": "5p", "15m": "15p", "1H": "1g", D: "Ngày", W: "Tuần", M: "Tháng" };
const TF_LONG: Record<string, string> = { "1m": "1 phút", "5m": "5 phút", "15m": "15 phút", "1H": "1 giờ", D: "Ngày", W: "Tuần", M: "Tháng" };

export default function TimeframeSelector({ current, onChange, loadingIntraday = false, intradayError = null, intradaySessions = 0, compact = false, minIntraday = null }: Props) {
  const locked = (tf: Timeframe) => minIntraday != null && INTRADAY.includes(tf) && INTRADAY.indexOf(tf) < INTRADAY.indexOf(minIntraday);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const item = (tf: Timeframe) => (
    <button key={tf} type="button" role="menuitemradio" aria-checked={current === tf} onClick={() => { onChange(tf); setOpen(false); }} aria-pressed={current === tf} data-tf={tf} disabled={locked(tf)}
      title={locked(tf) ? `Nến phút của mã này chỉ có độ phân giải ~${minIntraday} — khung ${TF_LONG[tf]} sẽ là nến giả, đã khoá` : TF_LONG[tf]}
      className="ws-tf-item disabled:opacity-35 disabled:cursor-not-allowed disabled:line-through">
      <span>{TF_LONG[tf]}</span><span className="ws-tf-code">{TF_SHORT[tf]}</span>
    </button>
  );

  return (
    // TA-T3 (Q4): khung thời gian gộp MỘT nút xổ xuống như nút khung của TradingView; danh sách luôn nằm trong trang (ẩn khi đóng).
    <div ref={box} className={`ws-tf ${compact ? "" : "mb-3"}`} role="group" aria-label="Khung thời gian">
      <button type="button" className="ws-btn ws-tf-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="tf-menu-btn"
        title={`Khung thời gian: ${TF_LONG[current] ?? current}`}>
        <b>{TF_SHORT[current] ?? current}</b><ChevronDown className="w-3 h-3" aria-hidden />
      </button>
      <div className="ws-tf-menu" role="menu" aria-label="Chọn khung thời gian" hidden={!open} data-testid="tf-menu">
        <p className="ws-tf-group">Trong phiên</p>
        {INTRADAY.map(item)}
        <p className="ws-tf-group">Ngày · Tuần · Tháng</p>
        {SWING.map(item)}
      </div>
      {!compact && <span className="text-[11px] text-slate-500 ml-1" data-testid="tf-note">
        {loadingIntraday ? "Đang tải nến phút SSI…"
          : intradayError ? <span className="text-amber-400">⚠ {intradayError}</span>
          : INTRADAY.includes(current) ? `Nến phút SSI · ${intradaySessions} phiên gần nhất · giờ VN`
          : "W/M gộp từ nến D điều chỉnh"}
      </span>}
      {compact && loadingIntraday && <span className="text-[11px] text-slate-300 animate-pulse" role="status" aria-label="Đang tải nến phút SSI" title="Đang tải nến phút SSI…">●</span>}
      {compact && intradayError && <span className="text-[11px] text-amber-400" role="status" aria-label={`Lỗi nến phút: ${intradayError}`} title={intradayError}>⚠</span>}
    </div>
  );
}
