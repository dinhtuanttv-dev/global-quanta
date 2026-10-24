"use client";
import type { RsiResult, MacdResult, AdxResult } from "../../../lib/ta-command-center/detectors/technicalOscillators";

import ProvenanceBadge from "./ProvenanceBadge";
import { DEFAULT_INDICATORS, type IndicatorSettings } from "./workspace/indicatorSettings";

// Chỉ báo tính bằng công thức chuẩn Wilder/EMA từ giá đóng cửa -> DERIVED (không phải dữ liệu sàn thô).
const HARD_DATA_BADGE = <ProvenanceBadge kind="DERIVED" />;

function rsiLabel(r: RsiResult, up = 70, lo = 30): { text: string; color: string } {
  const v = r.latest;
  if (v === null) return { text: `Chưa đủ dữ liệu (cần ≥ ${r.needBars} nến)`, color: "#64748b" };
  if (r.flat) return { text: "Chuỗi giá phẳng 14 phiên — RSI không xác định (quy ước 50)", color: "#64748b" };
  if (v >= up) return { text: "Overbought", color: "#f43f5e" };
  if (v <= lo) return { text: "Oversold", color: "#34d399" };
  return { text: "Neutral", color: "#94a3b8" };
}

function macdLabel(histogram: number | null): { text: string; color: string } {
  if (histogram === null) return { text: "Chưa đủ dữ liệu", color: "#64748b" };
  if (histogram > 0) return { text: "Momentum ▲ (histogram > 0)", color: "#34d399" };
  if (histogram < 0) return { text: "Momentum ▼ (histogram < 0)", color: "#f43f5e" };
  return { text: "Neutral", color: "#94a3b8" };
}

const ADX_LABEL: Record<AdxResult["trendStrength"], { text: string; color: string }> = {
  chua_du: { text: "Chưa đủ dữ liệu", color: "#64748b" },
  yeu: { text: "Trend yếu / range-bound", color: "#64748b" },
  trung_binh: { text: "Trend trung bình", color: "#94a3b8" },
  manh: { text: "Trend mạnh", color: "#fbbf24" },
  rat_manh: { text: "Trend rất mạnh", color: "#34d399" },
};

interface Props {
  rsi: RsiResult;
  macd: MacdResult;
  adx: AdxResult;
  /** R3: số nến + khung + loại giá dùng để tính. */
  context?: { bars: number; timeframe: string; basis: string | null };
  /** R5: tham số đang dùng (mặc định = chuẩn). */
  params?: IndicatorSettings;
}

export default function OscillatorPanel({ rsi, macd, adx, context, params = DEFAULT_INDICATORS }: Props) {
  const P = params;
  const rsiInfo = rsiLabel(rsi, P.rsi.upper, P.rsi.lower);
  const macdInfo = macdLabel(macd.latest.histogram);
  const adxInfo = ADX_LABEL[adx.trendStrength];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2" data-testid="oscillator-panel">
      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          RSI ({P.rsi.period}{P.rsi.method === "cutler" ? " · Cutler" : ""}) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color: rsiInfo.color }}>
          {rsi.latest !== null ? rsi.latest.toFixed(1) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1" data-testid="rsi-state">{rsiInfo.text} · ngưỡng {P.rsi.upper} / {P.rsi.lower}</p>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          MACD ({P.macd.fast},{P.macd.slow},{P.macd.signal}) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color: macdInfo.color }}>
          {macd.latest.histogram !== null ? macd.latest.histogram.toFixed(2) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">
          {macdInfo.text} · MACD {macd.latest.macd?.toFixed(2) ?? "-"} / Signal {macd.latest.signal?.toFixed(2) ?? "-"}
        </p>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          ADX ({P.adx.period}) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color: adxInfo.color }}>
          {adx.latest !== null ? adx.latest.toFixed(1) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1" data-testid="adx-state">
          {adx.trendStrength === "chua_du" ? `${adxInfo.text} — cần ≥ ${adx.needBars} nến (không phải "trend yếu")` : `${adxInfo.text} · nhãn theo quy ước Wilder >25 mạnh, >50 rất mạnh${P.adx.threshold !== 25 ? ` · vạch trên pane: ${P.adx.threshold}` : ""}`}
        </p>
      </div>
      {context && (
        <p className="md:col-span-3 text-[9px] text-slate-500" data-testid="osc-context">
          Tính trên {context.bars} nến khung {context.timeframe}{context.basis ? ` · ${context.basis}` : ""} · công thức {P.rsi.method === "cutler" ? "Cutler (RSI)" : "Wilder (RSI)"}, Wilder (ADX), EMA (MACD). Ngưỡng là quy ước mô tả — chưa kiểm định lợi thế ngoài mẫu.
        </p>
      )}
    </div>
  );
}
