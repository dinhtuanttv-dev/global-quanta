// @gq/quant-core — engine định lượng dùng chung cho TA VN-Index (TA_VNINDEX_UPGRADE_SPEC §0 · C1/C2).
// Thuần TypeScript, không phụ thuộc DOM/React: chạy được trong Web Worker và (sau khi đóng gói) trên Gateway Node.
// Bất biến bắt buộc (có test): mọi đối tượng có confirmedIndex; kết quả tính trên bars[0..t] trùng với kết quả tính
// trên toàn bộ dữ liệu, lọc confirmedIndex ≤ t (không look-ahead, không vẽ lại quá khứ).

import type { Bar } from "./math";
import { computeStructure, type StructureParams } from "./structure";
import { computeDealingRange, detectFVG, detectLiquidity, detectOrderBlocks } from "./zones";
import { detectVsa } from "./vsa";
import { classifyWyckoffV2 } from "./wyckoff";
import { eventStudy } from "./eventStudy";

export * from "./math";
export * from "./structure";
export * from "./zones";
export * from "./vsa";
export * from "./wyckoff";
export * from "./eventStudy";

export const ENGINE_VERSION = "2.0.0";

export interface AnalyzeOptions { isIndex?: boolean; limitPct?: number | null; structure?: Partial<StructureParams>; horizon?: number }

export function analyze(bars: Bar[], opts: AnalyzeOptions = {}) {
  const isIndex = Boolean(opts.isIndex);
  const st = computeStructure(bars, opts.structure);
  const orderBlocks = detectOrderBlocks(bars, st.events, st.atr);
  const fvgs = detectFVG(bars, st.atr, { isIndex, limitPct: isIndex ? null : opts.limitPct ?? 0.07 });
  const liquidity = detectLiquidity(bars, st.pivots, st.atr, { isIndex });
  const dealingRange = computeDealingRange(bars, st.pivots);
  const vsa = detectVsa(bars);
  const wyckoff = classifyWyckoffV2(bars);
  const choch = st.events.filter((e) => e.kind === "CHoCH");
  const horizon = opts.horizon ?? 10;
  const backtest = {
    chochBull: eventStudy(bars, choch.filter((e) => e.dir === "bullish").map((e) => e.index), "bullish", "CHoCH ▲", horizon),
    chochBear: eventStudy(bars, choch.filter((e) => e.dir === "bearish").map((e) => e.index), "bearish", "CHoCH ▼", horizon),
  };
  return {
    engineVersion: ENGINE_VERSION,
    atr: st.atr, pivots: st.pivots, structure: st.events, trend: st.trend,
    orderBlocks, fvgs, liquidity, dealingRange, vsa, wyckoff, backtest,
    counts: {
      bos: st.events.length - choch.length, choch: choch.length, orderBlocks: orderBlocks.length, fvgs: fvgs.length,
      liquidity: liquidity.length, sweeps: liquidity.filter((z) => z.state === "SWEPT").length, vsa: vsa.length,
    },
  };
}
export type Analysis = ReturnType<typeof analyze>;
