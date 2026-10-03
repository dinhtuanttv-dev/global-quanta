"use client";
import { Clock } from "lucide-react";
import { SMC_DISPLAY_LIMIT, type OrderBlock, type FairValueGap, type BreakOfStructure, type SmcTotals } from "../../../lib/ta-command-center/detectors/smcDetector";
import type { VSASignal } from "../../../lib/ta-command-center/detectors/vsaDetector";
import { WYCKOFF_PHASE_LABEL, describeRangeCriteria, type WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import ProvenanceBadge from "./ProvenanceBadge";

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;
const fmt = (v: number) => v.toLocaleString("vi-VN");

export function SMCPanel({ obs, fvgs, bos, choch, totals, barCount }: {
  obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[]; choch: BreakOfStructure[]; totals: SmcTotals; barCount: number;
}) {
  const lastOB = obs[obs.length - 1];
  const shifts = [...bos, ...choch].sort((a, b) => a.date.localeCompare(b.date));
  const lastShift = shifts[shifts.length - 1];
  const isChoch = !!lastShift && choch.includes(lastShift);
  return (
    <div style={CARD} className="rounded-xl p-3" data-testid="smc-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        Smart Money Concepts <ProvenanceBadge kind="DERIVED" />
      </p>
      <p className="text-sm font-bold font-mono text-slate-100">
        {totals.obs} OB · {totals.fvgs} FVG · {totals.bos} BOS · {totals.choch} CHoCH
      </p>
      <p className="text-[9px] text-slate-500 mt-0.5">
        Toàn bộ {barCount} nến · biểu đồ vẽ {Math.min(totals.obs, SMC_DISPLAY_LIMIT.obs)} OB / {Math.min(totals.fvgs, SMC_DISPLAY_LIMIT.fvgs)} FVG gần nhất
      </p>
      {lastShift && (
        <p className="text-[9px] mt-1" style={{ color: lastShift.type === "bullish" ? "#34d399" : "#f43f5e" }}>
          {isChoch ? "CHoCH (Structural Shift)" : "BOS"} {lastShift.type === "bullish" ? "▲" : "▼"} {lastShift.date} · phá {fmt(lastShift.brokenLevel)}
        </p>
      )}
      {lastOB && (
        <p className="text-[9px] text-slate-500 mt-0.5 font-mono">
          OB gần nhất {lastOB.type === "bullish" ? "▲" : "▼"} {fmt(lastOB.bottom)}–{fmt(lastOB.top)}{lastOB.mitigated ? " · đã mitigated" : ""}
        </p>
      )}
    </div>
  );
}

const VSA_DIRECTION: Partial<Record<VSASignal["type"], "▲" | "▼">> = {
  "Stopping Volume": "▲", "No Supply": "▲", Shakeout: "▲",
  "No Demand": "▼", Upthrust: "▼",
};

export function VSAPanel({ signals }: { signals: VSASignal[] }) {
  const last = signals[signals.length - 1];
  const dir = last ? VSA_DIRECTION[last.type] : undefined;
  return (
    <div style={CARD} className="rounded-xl p-3" data-testid="vsa-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        VSA · Effort vs Result <ProvenanceBadge kind="DERIVED" />
      </p>
      {last ? (
        <>
          <p className="text-sm font-bold text-slate-100" style={dir ? { color: dir === "▲" ? "#34d399" : "#f43f5e" } : undefined}>
            {dir ? `${dir} ` : ""}{last.type}
          </p>
          <p className="text-[9px] text-slate-500 mt-1 font-mono">
            Effort {last.volumeRatio}× vol TB20 · Spread {last.spreadRatio}× · {last.date}
          </p>
          {!dir && <p className="text-[9px] text-slate-600 mt-0.5">Tín hiệu chưa phân biệt hướng (Climax / Two-Bar Reversal).</p>}
        </>
      ) : <p className="text-[10px] text-slate-600 italic">Chưa có tín hiệu VSA trong 8 tín hiệu gần nhất.</p>}
    </div>
  );
}

export function WyckoffPanel({ result, barCount }: { result: WyckoffResult; barCount: number }) {
  return (
    <div style={CARD} className="rounded-xl p-3" data-testid="wyckoff-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        Wyckoff Cycle <ProvenanceBadge kind="INFERRED" />
      </p>
      <p className="text-sm font-bold text-violet-300" data-testid="wyckoff-phase">{WYCKOFF_PHASE_LABEL[result.phase]}</p>
      {result.phase === "undetermined" ? (
        <p className="text-[9px] text-slate-500 mt-1">Chưa tìm thấy trading range: {describeRangeCriteria(barCount)}.</p>
      ) : (
        <>
          <p className="text-[9px] text-slate-500 mt-1 font-mono">
            Range {result.rangeLow?.toLocaleString("vi-VN")}–{result.rangeHigh?.toLocaleString("vi-VN")} từ {result.rangeStartDate}
            {result.springDate && ` · Spring ${result.springDate}`}
            {result.testDate && ` · ST ${result.testDate}`}
          </p>
          <p className="text-[9px] text-slate-600 mt-0.5" title="Tỷ lệ sự kiện mẫu chuẩn đã xuất hiện — không phải xác suất">
            Sự kiện khớp mẫu: {result.confidenceScore}% (không phải xác suất)
          </p>
        </>
      )}
    </div>
  );
}

export function ElliottWavePanelPlaceholder() {
  return (
    <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 opacity-60">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
        Elliott Wave <span className="ml-auto flex items-center gap-0.5 text-[8.5px] text-amber-400"><Clock className="w-2.5 h-2.5" />Giai đoạn 2</span>
      </p>
      <p className="text-[10px] text-slate-600 italic">Đếm sóng mang tính chủ quan cao — dùng công cụ vẽ Elliott (có kiểm tra quy tắc) hoặc gợi ý Zigzag.</p>
    </div>
  );
}
