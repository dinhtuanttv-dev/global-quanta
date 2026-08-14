import type { OhlcvBar } from "../types";
import { detectOrderBlocks, detectFVG } from "./smcDetector";
import { classifyWyckoffPhase, scoreWyckoffPhase, type WyckoffPhase } from "./wyckoffDetector";

export interface ConvergenceResult {
  ticker: string;
  sector: string;
  wyckoffPhase: WyckoffPhase;
  smcStatus: "fresh_testing" | "old_tested" | "none";
  fvgStatus: "near_unfilled" | "far_or_partial" | "none";
  volumeStatus: "high" | "medium" | "low";
  compositeScore: number;
  dataQuality: "ESTIMATED";
  breakdown: { wyckoff: number; smc: number; fvg: number; volume: number };
}

const WEIGHTS = { wyckoff: 0.30, smc: 0.30, fvg: 0.20, volume: 0.20 };

function avgVolume(bars: OhlcvBar[], n: number): number {
  const recent = bars.slice(-n);
  if (recent.length === 0) return 0;
  return recent.reduce((s, b) => s + b.volume, 0) / recent.length;
}

// Cham diem hop luu 4 tieu chi. Cong khai cong thuc, khong giau logic.
export function computeConvergence(bars: OhlcvBar[], ticker: string, sector: string): ConvergenceResult | null {
  if (bars.length < 60) return null;

  const currentPrice = bars[bars.length - 1].close;
  const wyckoff = classifyWyckoffPhase(bars);
  const wyckoffScore = scoreWyckoffPhase(wyckoff.phase);

  const obs = detectOrderBlocks(bars);
  const lastOB = obs[obs.length - 1];
  let smcStatus: ConvergenceResult["smcStatus"] = "none";
  let smcScore = 0;
  if (lastOB) {
    const withinOB = currentPrice >= lastOB.bottom && currentPrice <= lastOB.top;
    smcStatus = withinOB ? "fresh_testing" : "old_tested";
    smcScore = withinOB ? 1.0 : 0.5;
  }

  const fvgs = detectFVG(bars);
  const nearFvg = fvgs.find((f) => {
    const mid = (f.top + f.bottom) / 2;
    return Math.abs(currentPrice - mid) / currentPrice <= 0.03;
  });
  let fvgStatus: ConvergenceResult["fvgStatus"] = "none";
  let fvgScore = 0;
  if (nearFvg) { fvgStatus = "near_unfilled"; fvgScore = 1.0; }
  else if (fvgs.length > 0) { fvgStatus = "far_or_partial"; fvgScore = 0.5; }

  const ma20Vol = avgVolume(bars, 20);
  const lastVol = bars[bars.length - 1].volume;
  const volRatio = ma20Vol > 0 ? lastVol / ma20Vol : 0;
  let volumeStatus: ConvergenceResult["volumeStatus"] = "low";
  let volumeScore = 0;
  if (volRatio > 2) { volumeStatus = "high"; volumeScore = 1.0; }
  else if (volRatio >= 1.2) { volumeStatus = "medium"; volumeScore = 0.5; }

  const compositeScore = Math.round(
    (wyckoffScore * WEIGHTS.wyckoff + smcScore * WEIGHTS.smc + fvgScore * WEIGHTS.fvg + volumeScore * WEIGHTS.volume) * 100
  );

  return {
    ticker, sector, wyckoffPhase: wyckoff.phase, smcStatus, fvgStatus, volumeStatus,
    compositeScore, dataQuality: "ESTIMATED",
    breakdown: { wyckoff: wyckoffScore, smc: smcScore, fvg: fvgScore, volume: volumeScore },
  };
}
