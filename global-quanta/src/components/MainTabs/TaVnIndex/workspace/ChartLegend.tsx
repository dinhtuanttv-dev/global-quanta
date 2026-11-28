"use client";
// Super Chart SC2 — CHÚ GIẢI trên biểu đồ (không che nến: chữ nhỏ, không bắt chuột trừ nút):
//   • OHLC · % thay đổi · KL tại CROSSHAIR (rời biểu đồ -> nến cuối), cập nhật qua requestAnimationFrame (không render thừa).
//   • Tiêu đề từng pane chỉ báo + nút ✕ tắt pane (tắt lớp tương ứng) — pane tự gỡ khỏi biểu đồ.
//   • "+n nhãn ẩn": lớp phủ lược nhãn theo ngân sách để khỏi chồng chữ — báo rõ thay vì im lặng.
import { useEffect, useRef, useState } from "react";
import { Info, Settings2, X } from "lucide-react";
import type { CrosshairBar, PaneInfo, PaneKind, TVChartManager } from "../../../../lib/ta-command-center/TVChartManager";
import type { LayerKey } from "../../../../lib/ta-command-center/LayerManager";
import type { OhlcvBar } from "../../../../lib/ta-command-center/types";
import { priceDigitsFor, viPrice, viVolume } from "../../../../lib/ta-command-center/chart/viFormat";
import { LAYER_LABEL } from "./LayerMenu";

const PANE_TITLE: Record<Exclude<PaneKind, "price">, string> = { volume: "Khối lượng", rsi: "RSI 14 · 70 / 30", macd: "MACD 12/26/9", adx: "ADX 14 · +DI / −DI", flow: "Order Flow · Delta (cột) · CVD (đường, trục trái)", foreign: "Khối ngoại · ròng (cột) · luỹ kế (đường)", eosc: "Elliott Oscillator 5/35",
  stoch: "Stoch 14 1 3 · 80 / 20", stochRsi: "Stoch RSI 3 3 14 14 · 80 / 20", atr: "ATR 14", obv: "OBV", mfi: "MFI 14 · 80 / 20" };
export const PANE_LAYER: Record<Exclude<PaneKind, "price">, LayerKey> = { volume: "volume", rsi: "rsi", macd: "macd", adx: "adx", flow: "orderflow", foreign: "foreign", eosc: "elliottOsc", stoch: "stoch", stochRsi: "stochRsi", atr: "atr", obv: "obv", mfi: "mfi" };

// TA-T1: cùng kiểu số với trục giá (2 chữ số thập phân, kiểu Việt) và trục KL (tỷ / tr / N).
const fmtV = (v: number) => viVolume(v);
/** "2026-07-24" -> "24/07/2026"; có giờ -> "24/07/2026 10:15" (giờ ghi sẵn trong chuỗi). */
const fmtD = (d: string) => { const [y, m, dd] = d.slice(0, 10).split("-"); const t = d.length > 10 ? d.slice(11, 16) : ""; return `${dd}/${m}/${y}${t ? ` ${t}` : ""}`; };
/** Tên dòng chú giải của từng lớp phủ giá (mỗi chỉ báo một dòng như TradingView). */
const EXTRA_TITLE: Partial<Record<LayerKey, string>> = { ichimoku: "Ichimoku 9/26/52" }; // các lớp khác: nhãn giá trị đã là tên (EMA 21, BB, SuperTrend)

export default function ChartLegend({ tv, bars, ticker, timeframe, layoutKey, onClosePane, paneNotes = {}, paneValue, paneTitle = {}, priceExtras, onSettings, hasSettings = () => true }: {
  tv: TVChartManager | null; bars: OhlcvBar[]; ticker: string; timeframe: string; layoutKey: string; onClosePane: (k: LayerKey) => void;
  /** TA-T5: nút ⚙ mở tham số của chỉ báo (như TradingView) — chỉ hiện khi hasSettings(k). */ onSettings?: (k: LayerKey) => void; hasSettings?: (k: LayerKey) => boolean;
  /** R3: nguồn + giới hạn của từng pane (VD Order Flow: ước lượng, tỷ lệ tick / BVC). */ paneNotes?: Partial<Record<PaneKind, string>>;
  /** 25/10: giá trị EMA / MA / Ichimoku tại nến dưới crosshair (dòng thứ hai của chú giải). */
  priceExtras?: (index: number) => { label: string; color: string; value: string; group?: LayerKey }[];
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
  // TA-T1: cùng độ chính xác với trục giá (cổ phiếu 0 chữ số, chỉ số 2 chữ số).
  const digits = priceDigitsFor(bars);
  const fmtP = (v: number) => viPrice(v, digits);
  const chg = b && b.prevClose ? ((b.close - b.prevClose) / b.prevClose) * 100 : null;
  const up = (chg ?? 0) >= 0;
  return (
    <>
      {b && (
        <div className="ws-legend" data-testid="ohlc-legend" aria-live="off">
          <b className="text-slate-100">{ticker}</b><span className="text-slate-500">{timeframe}</span>
          <span className="text-slate-400">{fmtD(String(b.date).replace(" ", "T"))}</span>
          {/* TA-T1: O H L C tô theo chiều nến như TradingView */}
          <span>O <b className={up ? "text-emerald-300" : "text-rose-300"}>{fmtP(b.open)}</b></span><span>H <b className={up ? "text-emerald-300" : "text-rose-300"}>{fmtP(b.high)}</b></span>
          <span>L <b className={up ? "text-emerald-300" : "text-rose-300"}>{fmtP(b.low)}</b></span><span>C <b className={up ? "text-emerald-300" : "text-rose-300"}>{fmtP(b.close)}</b></span>
          {chg != null && <b className={up ? "text-emerald-300" : "text-rose-300"}>{up ? "+" : ""}{chg.toFixed(2).replace(".", ",")}%</b>}
          {b.volume > 0 && <span>KL <b>{fmtV(b.volume)}</b></span>}
          {priceExtras && b && priceExtras(b.index).length > 0 && (
            <span className="ws-legend-extras" data-testid="legend-ma">
              {/* TA-T1: mỗi chỉ báo phủ giá một dòng (tên · giá trị theo màu đường · ✕ tắt lớp), như TradingView */}
              {groupExtras(priceExtras(b.index)).map(([g, xs]) => (
                <span key={g} className="ws-legend-row" data-testid={`legend-row-${g}`}>
                  {EXTRA_TITLE[g as LayerKey] && <span className="text-slate-400">{EXTRA_TITLE[g as LayerKey]}</span>}
                  {xs.map((x) => <span key={x.label} style={{ color: x.color }}>{x.label} <b>{x.value}</b></span>)}
                  {g !== "_" && onSettings && hasSettings(g as LayerKey) && <button type="button" aria-label={`Cài đặt ${LAYER_LABEL[g as LayerKey] ?? g}`} title="Tham số" onClick={() => onSettings(g as LayerKey)} data-testid={`legend-settings-${g}`}><Settings2 className="w-3 h-3" /></button>}
                  {g !== "_" && <button type="button" aria-label={`Tắt ${LAYER_LABEL[g as LayerKey] ?? g}`} title="Tắt lớp" onClick={() => onClosePane(g as LayerKey)}><X className="w-3 h-3" /></button>}
                </span>
              ))}
            </span>
          )}
          {hidden > 0 && <span className="ws-chip-warn" title="Lớp phủ giới hạn số nhãn để không chồng chữ — phóng to hoặc tắt bớt lớp để xem thêm" data-testid="labels-hidden">+{hidden} nhãn ẩn</span>}
        </div>
      )}
      {panes.filter((p) => p.kind !== "price").map((p) => (
        <div key={`${p.kind}-${p.index}`} className="ws-pane-title" style={{ top: p.top + 4 }} data-testid={`pane-title-${p.kind}`}>
          <span>{paneTitle[p.kind] ?? PANE_TITLE[p.kind as Exclude<PaneKind, "price">]}</span>
          {b && paneValue?.(p.kind, b.index) && <b className="text-slate-100" title={paneValue(p.kind, b.index) ?? undefined} data-testid={`pane-value-${p.kind}`}>{paneValue(p.kind, b.index)}</b>}
          {/* TA-T1: ghi chú dữ liệu (nguồn / giới hạn) thu vào ⓘ — chú giải chỉ còn tên, tham số, giá trị */}
          {paneNotes[p.kind] && <span className="ws-pane-note" title={paneNotes[p.kind]} aria-label={paneNotes[p.kind]} data-testid={`pane-note-${p.kind}`}><Info className="w-3 h-3" /></span>}
          {onSettings && hasSettings(PANE_LAYER[p.kind as Exclude<PaneKind, "price">]) && <button type="button" aria-label={`Cài đặt ${PANE_TITLE[p.kind as Exclude<PaneKind, "price">]}`} title="Tham số" onClick={() => onSettings(PANE_LAYER[p.kind as Exclude<PaneKind, "price">])} data-testid={`pane-settings-${p.kind}`}><Settings2 className="w-3 h-3" /></button>}
          <button type="button" aria-label={`Đóng pane ${PANE_TITLE[p.kind as Exclude<PaneKind, "price">]}`} onClick={() => onClosePane(PANE_LAYER[p.kind as Exclude<PaneKind, "price">])}><X className="w-3 h-3" /></button>
        </div>
      ))}
    </>
  );
}

/** Gom các giá trị phủ giá theo lớp (giữ thứ tự xuất hiện); giá trị không có lớp vào nhóm "_". */
function groupExtras(xs: { label: string; color: string; value: string; group?: LayerKey }[]): [string, typeof xs][] {
  const m = new Map<string, typeof xs>();
  for (const x of xs) { const g = x.group ?? "_"; if (!m.has(g)) m.set(g, []); m.get(g)!.push(x); }
  return [...m.entries()];
}
