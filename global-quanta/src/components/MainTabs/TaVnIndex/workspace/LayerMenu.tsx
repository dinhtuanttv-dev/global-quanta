"use client";
// Super Chart SC1 — menu "Lớp & pane": 18 công tắc chia NHÓM theo vai trò (pane · lớp phủ giá · phương pháp · hình vẽ) thay cho
// một hàng chip phẳng. Giữ nguyên data-layer (hợp đồng E2E) và LayerManager (không đổi engine). Mặc định mọi lớp TẮT.
import type { ComponentProps } from "react";
import type { LayerKey, LayerState } from "../../../../lib/ta-command-center/LayerManager";
import IndicatorSettingsForm from "./IndicatorSettingsForm";

export const LAYER_LABEL: Record<LayerKey, string> = {
  volume: "Khối lượng", rsi: "RSI 14", macd: "MACD 12/26/9", adx: "ADX · DI± 14", maSet: "EMA 21/50/100 · MA 200", ichimoku: "Mây Ichimoku", vprofile: "Volume Profile", avwap: "Anchored VWAP", orderflow: "Order Flow", foreign: "Khối ngoại", smc: "SMC", vsa: "VSA",
  wyckoff: "Wyckoff", corporate: "Sự kiện quyền", trendline: "Trendline", demandzone: "Demand Zone", elliott: "Elliott (vẽ tay)",
  elliottAuto: "Elliott tự động", elliottOsc: "Elliott Oscillator", elliottFib: "Elliott Fibonacci", elliottProj: "Elliott kịch bản", elliottGuide: "Elliott kênh & mốc",
  elliottSub: "Elliott bậc nhỏ", elliottMine: "Elliott của tôi", elliottPro: "Elliott Pro", pring: "Mô hình giá (Pring)", structure: "Cấu trúc MTF",
};

export const LAYER_GROUPS: { id: string; label: string; hint: string; keys: LayerKey[] }[] = [
  { id: "panes", label: "Pane chỉ báo", hint: "Khung phụ dưới biểu đồ giá (kéo vạch ngăn để đổi chiều cao)", keys: ["volume", "rsi", "macd", "adx", "orderflow", "foreign"] },
  { id: "overlays", label: "Lớp phủ giá", hint: "Vẽ trên nến", keys: ["maSet", "ichimoku", "vprofile", "avwap", "corporate"] },
  { id: "methods", label: "Phương pháp phân tích", hint: "Kết quả engine, ghim vào nến", keys: ["smc", "vsa", "wyckoff", "pring", "structure", "elliottPro", "elliottMine"] },
  { id: "drawings", label: "Hình vẽ tay", hint: "Hiện / ẩn nhóm hình bạn đã vẽ", keys: ["trendline", "demandzone", "elliott"] },
];

export default function LayerMenu({ state, onToggle, dense = false, settings }: {
  state: LayerState; onToggle: (k: LayerKey) => void; dense?: boolean;
  /** R5: tham số chỉ báo (chu kỳ, ngưỡng, kiểu tính, neo AVWAP). */ settings?: ComponentProps<typeof IndicatorSettingsForm>;
}) {
  return (
    <div className="space-y-2.5" data-testid="layer-menu">
      {LAYER_GROUPS.map((g) => (
        <section key={g.id} aria-label={g.label}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-300">{g.label}</h3>
            {!dense && <span className="text-[9px] text-slate-500 truncate">{g.hint}</span>}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {g.keys.map((key) => (
              <button key={key} type="button" onClick={() => onToggle(key)} aria-pressed={state[key]} data-layer={key}
                className={`ws-toggle ${state[key] ? "ws-toggle-on" : ""}`}>
                <span className="ws-switch" aria-hidden><span /></span>
                <span className="truncate">{LAYER_LABEL[key]}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {settings && <IndicatorSettingsForm {...settings} />}
      <p className="text-[9px] text-slate-500">Mặc định mọi lớp tắt. Preset chỉ đổi lớp hiển thị — không xoá hình vẽ hay kết quả phân tích.</p>
      <p className="text-[9px] text-slate-500" data-testid="pit-legend">Point-in-time: phần <b>mờ, nét đứt</b> của vùng OB / FVG / thanh khoản là đoạn TRƯỚC khi tín hiệu được xác nhận (lúc đó chưa biết); marker "Div · sau N nến" đặt tại nến xác nhận.</p>
    </div>
  );
}
