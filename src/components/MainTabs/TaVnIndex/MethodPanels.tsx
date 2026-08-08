"use client";
import { CheckCircle2, Clock } from "lucide-react";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "../../../lib/ta-command-center/detectors/smcDetector";
import type { VSASignal } from "../../../lib/ta-command-center/detectors/vsaDetector";

export function SMCPanel({ obs, fvgs, bos }: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] }) {
  const lastOB = obs[obs.length - 1];
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
        SMC <span className="ml-auto flex items-center gap-0.5 text-[8px] text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />HARD_DATA</span>
      </p>
      <p className="text-sm font-black text-slate-100">{obs.length} OB · {fvgs.length} FVG · {bos.length} BOS</p>
      {lastOB && <p className="text-[9px] text-slate-500 mt-1">OB gan nhat ({lastOB.type}): {lastOB.bottom.toLocaleString()}-{lastOB.top.toLocaleString()}</p>}
    </div>
  );
}

export function VSAPanel({ signals }: { signals: VSASignal[] }) {
  const last = signals[signals.length - 1];
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
        VSA Engine <span className="ml-auto flex items-center gap-0.5 text-[8px] text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />HARD_DATA</span>
      </p>
      {last ? (
        <>
          <p className="text-sm font-black text-slate-100">{last.type}</p>
          <p className="text-[9px] text-slate-500 mt-1">Vol {last.volumeRatio}x TB · Spread {last.spreadRatio}x TB - ngay {last.date}</p>
        </>
      ) : <p className="text-[10px] text-slate-600 italic">Chua phat hien tin hieu VSA nao gan day.</p>}
    </div>
  );
}

export function ElliottWavePanelPlaceholder() {
  return (
    <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 opacity-60">
      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
        Elliott Wave <span className="ml-auto flex items-center gap-0.5 text-[8px] text-amber-400"><Clock className="w-2.5 h-2.5" />Giai doan 2</span>
      </p>
      <p className="text-[10px] text-slate-600 italic">Dem song mang tinh chu quan cao - se trien khai ban heuristic rieng, co canh bao ro rang.</p>
    </div>
  );
}

export function WyckoffPanelPlaceholder() {
  return (
    <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 opacity-60">
      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
        Wyckoff Cycle <span className="ml-auto flex items-center gap-0.5 text-[8px] text-amber-400"><Clock className="w-2.5 h-2.5" />Giai doan 2</span>
      </p>
      <p className="text-[10px] text-slate-600 italic">Xac dinh pha Wyckoff can boi canh rong - se trien khai dang uoc tinh, co canh bao ro rang.</p>
    </div>
  );
}
