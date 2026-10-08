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
import { buildSessionProfiles, buildVolumeProfile, type SessionProfile, type VolumeProfile } from "./volumeProfile";
import { anchoredVwap, anchorIndexOf, type VwapPoint } from "./vwap";

export * from "./math";
export * from "./structure";
export * from "./zones";
export * from "./vsa";
export * from "./wyckoff";
export * from "./eventStudy";
export * from "./volumeProfile";
export * from "./vwap";

export const ENGINE_VERSION = "2.1.0";

/** Số nến cho Composite Volume Profile trên khung D/W/M. */
export const COMPOSITE_PROFILE_BARS = 60;

export interface AnalyzeOptions {
  isIndex?: boolean; limitPct?: number | null; structure?: Partial<StructureParams>; horizon?: number;
  /** Nến 1 phút (khung intraday) -> Session Volume Profile chính xác theo mức giá; không có -> Composite xấp xỉ từ nến ngày. */
  bars1m?: (Bar & { auction?: string })[];
}

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
  // Volume Profile: intraday -> theo từng phiên từ nến 1 phút (T2); D/W/M -> composite 60 nến, phân phối tam giác (T3, xấp xỉ).
  const sessions: SessionProfile[] = opts.bars1m?.length ? buildSessionProfiles(opts.bars1m, { isIndex }) : [];
  const composite: VolumeProfile | null = opts.bars1m?.length
    ? null
    : buildVolumeProfile(bars.slice(-COMPOSITE_PROFILE_BARS), { method: "triangular", isIndex });
  // Anchored VWAP mặc định: neo vào điểm bắt đầu dải giao dịch (swing đã xác nhận cũ hơn trong cặp đỉnh/đáy gần nhất).
  let avwap: { anchorDate: string; points: VwapPoint[] } | null = null;
  if (dealingRange) {
    const anchorDate = dealingRange.highIndex < dealingRange.lowIndex ? dealingRange.highDate : dealingRange.lowDate;
    avwap = { anchorDate, points: anchoredVwap(bars, anchorIndexOf(bars, anchorDate)) };
  }
  const backtest = {
    chochBull: eventStudy(bars, choch.filter((e) => e.dir === "bullish").map((e) => e.index), "bullish", "CHoCH ▲", horizon),
    chochBear: eventStudy(bars, choch.filter((e) => e.dir === "bearish").map((e) => e.index), "bearish", "CHoCH ▼", horizon),
  };
  return {
    engineVersion: ENGINE_VERSION,
    atr: st.atr, pivots: st.pivots, structure: st.events, trend: st.trend,
    orderBlocks, fvgs, liquidity, dealingRange, vsa, wyckoff, backtest,
    profile: { sessions, composite }, avwap,
    counts: {
      bos: st.events.length - choch.length, choch: choch.length, orderBlocks: orderBlocks.length, fvgs: fvgs.length,
      liquidity: liquidity.length, sweeps: liquidity.filter((z) => z.state === "SWEPT").length, vsa: vsa.length,
    },
  };
}
export type Analysis = ReturnType<typeof analyze>;
