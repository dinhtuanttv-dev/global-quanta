"use client";
// TA-T3 (28/11/2026) — nút "Kiểu biểu đồ" như TradingView: Nến · Nến rỗng · Heikin Ashi · Thanh OHLC · Đường · Vùng · Đường nền,
// và cách vẽ khối lượng (pane riêng / chồng ở đáy giá — Q3). Heikin Ashi chỉ đổi CÁCH VẼ: chỉ báo, phân tích, chú giải vẫn dùng giá thật.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ChartType } from "../../../../lib/ta-command-center/TVChartManager";
import { CHART_TYPE_LABEL } from "./chartPrefs";

const ORDER: ChartType[] = ["candle", "hollow", "heikin", "bar", "line", "area", "baseline"];

export default function ChartTypeMenu({ type, volOverlay, onType, onVolOverlay }: {
  type: ChartType; volOverlay: boolean; onType: (t: ChartType) => void; onVolOverlay: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="ws-tf" role="group" aria-label="Kiểu biểu đồ">
      <button type="button" className="ws-btn ws-tf-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="charttype-btn"
        title={`Kiểu biểu đồ: ${CHART_TYPE_LABEL[type]}`}>
        <b>{CHART_TYPE_LABEL[type]}</b><ChevronDown className="w-3 h-3" aria-hidden />
      </button>
      <div className="ws-tf-menu" role="menu" aria-label="Chọn kiểu biểu đồ" hidden={!open} data-testid="charttype-menu">
        <p className="ws-tf-group">Kiểu biểu đồ</p>
        {ORDER.map((t) => (
          <button key={t} type="button" role="menuitemradio" aria-checked={type === t} aria-pressed={type === t} data-charttype={t} className="ws-tf-item"
            onClick={() => { onType(t); setOpen(false); }}>
            <span>{CHART_TYPE_LABEL[t]}</span>{t === "heikin" && <span className="ws-tf-code" title="Chỉ đổi cách vẽ nến — chỉ báo và chú giải dùng giá thật">giá thật</span>}
          </button>
        ))}
        <p className="ws-tf-group">Khối lượng (khi bật lớp KL)</p>
        <button type="button" role="menuitemradio" aria-checked={!volOverlay} aria-pressed={!volOverlay} data-volmode="pane" className="ws-tf-item" onClick={() => { onVolOverlay(false); setOpen(false); }}>
          <span>Pane riêng</span>
        </button>
        <button type="button" role="menuitemradio" aria-checked={volOverlay} aria-pressed={volOverlay} data-volmode="overlay" className="ws-tf-item" onClick={() => { onVolOverlay(true); setOpen(false); }}>
          <span>Chồng ở đáy khung giá</span>
        </button>
      </div>
    </div>
  );
}
