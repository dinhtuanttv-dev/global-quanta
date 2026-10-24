"use client";
// Super Chart SC2 — CHÚ GIẢI trên biểu đồ (không che nến: chữ nhỏ, không bắt chuột trừ nút):
//   • OHLC · % thay đổi · KL tại CROSSHAIR (rời biểu đồ -> nến cuối), cập nhật qua requestAnimationFrame (không render thừa).
//   • Tiêu đề từng pane chỉ báo + nút ✕ tắt pane (tắt lớp tương ứng) — pane tự gỡ khỏi biểu đồ.
//   • "+n nhãn ẩn": lớp phủ lược nhãn theo ngân sách để khỏi chồng chữ — báo rõ thay vì im lặng.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CrosshairBar, PaneInfo, PaneKind, TVChartManager } from "../../../../lib/ta-command-center/TVChartManager";
import type { LayerKey } from "../../../../lib/ta-command-center/LayerManager";
import type { OhlcvBar } from "../../../../lib/ta-command-center/types";

const PANE_TITLE: Record<Exclude<PaneKind, "price">, string> = { volume: "Khối lượng", rsi: "RSI 14 · 70 / 30", macd: "MACD 12/26/9", adx: "ADX 14 · +DI / −DI", flow: "Order Flow · Delta (cột) · CVD (đường, trục trái)", foreign: "Khối ngoại · ròng (cột) · luỹ kế (đường)", eosc: "Elliott Oscillator 5/35" };
export const PANE_LAYER: Record<Exclude<PaneKind, "price">, LayerKey> = { volume: "volume", rsi: "rsi", macd: "macd", adx: "adx", flow: "orderflow", foreign: "foreign", eosc: "elliottOsc" };

const fmtP = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const fmtV = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} tỷ` : v >= 1e6 ? `${(v / 1e6).toFixed(2)} tr` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} k` : String(Math.round(v))).replace(".", ",");

export default function ChartLegend({ tv, bars, ticker, timeframe, layoutKey, onClosePane, paneNotes = {}, paneValue, paneTitle = {}, priceExtras }: {
  tv: TVChartManager | null; bars: OhlcvBar[]; ticker: string; timeframe: string; layoutKey: string; onClosePane: (k: LayerKey) => void;
  /** R3: nguồn + giới hạn của từng pane (VD Order Flow: ước lượng, tỷ lệ tick / BVC). */ paneNotes?: Partial<Record<PaneKind, string>>;
  /** 25/10: giá trị EMA / MA / Ichimoku tại nến dưới crosshair (dòng thứ hai của chú giải). */
  priceExtras?: (index: number) => { label: string; color: string; value: string }[];
  /** R5: tiêu đề theo tham số người dùng (VD "RSI 21 · 80 / 20"). */ paneTitle?: Partial<Record<PaneKind, string>>;
  /** R4: giá trị của pane tại nến dưới crosshair (hoặc nến cuối) — đọc lịch sử, không chỉ giá trị cuối. */ paneValue?: (kind: PaneKind, index: number) => string | null;
}) {
  const last = bars.length ? { ...bars[bars.length - 1], volume: bars[bars.length - 1].volume ?? 0, prevClose: bars.length > 1 ? bars[bars.length - 2].close : null, index: bars.length - 1 } : null;
  const [bar, setBar] = useState<CrosshairBar | null>(null);
  const [panes, setPanes] = useState<PaneInfo[]>([]);
  const [hidden, setHidden] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!tv) return;
    const off = tv.onCrosshair((b) => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => setBar(b)); });
    tv.onLabels = (n) => setHidden((h) => (h === n ? h : n));
    return () => { off(); cancelAnimationFrame(raf.current); tv.onLabels = undefined; };
  }, [tv]);
  // Vị trí pane: tính lại khi số pane / kích thước đổi (layoutKey) và khi người dùng kéo vạch ngăn (pointerup).
  useEffect(() => {
    if (!tv) return;
    const read = () => setPanes(tv.paneLayout());
    const t = setTimeout(read, 60);
    window.addEventListener("pointerup", read);
    return () => { clearTimeout(t); window.removeEventListener("pointerup", read); };
  }, [tv, layoutKey]);
  const b = bar ?? last;
  const chg = b && b.prevClose ? ((b.close - b.prevClose) / b.prevClose) * 100 : null;
  const up = (chg ?? 0) >= 0;
  return (
    <>
      {b && (
        <div className="ws-legend" data-testid="ohlc-legend" aria-live="off">
          <b className="text-slate-100">{ticker}</b><span className="text-slate-500">{timeframe}</span>
          <span className="text-slate-400">{String(b.date).slice(0, 16).replace("T", " ")}</span>
          <span>O <b>{fmtP(b.open)}</b></span><span>H <b>{fmtP(b.high)}</b></span><span>L <b>{fmtP(b.low)}</b></span><span>C <b className={up ? "text-emerald-300" : "text-rose-300"}>{fmtP(b.close)}</b></span>
          {chg != null && <b className={up ? "text-emerald-300" : "text-rose-300"}>{up ? "+" : ""}{chg.toFixed(2).replace(".", ",")}%</b>}
          {b.volume > 0 && <span>KL <b>{fmtV(b.volume)}</b></span>}
          {priceExtras && b && priceExtras(b.index).length > 0 && (
            <span className="ws-legend-extras" data-testid="legend-ma">
              {priceExtras(b.index).map((x) => <span key={x.label} style={{ color: x.color }}>{x.label} <b>{x.value}</b></span>)}
            </span>
          )}
          {hidden > 0 && <span className="ws-chip-warn" title="Lớp phủ giới hạn số nhãn để không chồng chữ — phóng to hoặc tắt bớt lớp để xem thêm" data-testid="labels-hidden">+{hidden} nhãn ẩn</span>}
        </div>
      )}
      {panes.filter((p) => p.kind !== "price").map((p) => (
        <div key={`${p.kind}-${p.index}`} className="ws-pane-title" style={{ top: p.top + 4 }} data-testid={`pane-title-${p.kind}`}>
          <span>{paneTitle[p.kind] ?? PANE_TITLE[p.kind as Exclude<PaneKind, "price">]}</span>
          {b && paneValue?.(p.kind, b.index) && <b className="text-slate-100" title={paneValue(p.kind, b.index) ?? undefined} data-testid={`pane-value-${p.kind}`}>{paneValue(p.kind, b.index)}</b>}
          {paneNotes[p.kind] && <span className="text-amber-300/80" title={paneNotes[p.kind]} data-testid={`pane-note-${p.kind}`}>· {paneNotes[p.kind]}</span>}
          <button type="button" aria-label={`Đóng pane ${PANE_TITLE[p.kind as Exclude<PaneKind, "price">]}`} onClick={() => onClosePane(PANE_LAYER[p.kind as Exclude<PaneKind, "price">])}><X className="w-3 h-3" /></button>
        </div>
      ))}
    </>
  );
}
