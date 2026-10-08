// @gq/quant-core — engine định lượng dùng chung cho TA VN-Index (TA_VNINDEX_UPGRADE_SPEC §0 · C1/C2).
// Thuần TypeScript, không phụ thuộc DOM/React: chạy được trong Web Worker và (sau khi đóng gói) trên Gateway Node.
// Bất biến bắt buộc (có test): mọi đối tượng có confirmedIndex; kết quả tính trên bars[0..t] trùng với kết quả tính
// trên toàn bộ dữ liệu, lọc confirmedIndex ≤ t (không look-ahead, không vẽ lại quá khứ).

import type { Bar } from "./math";
import { computeStructure, type StructureParams } from "./structure";
import { computeDealingRange, detectFVG, detectLiquidity, detectOrderBlocks } from "./zones";
import { detectVsa } from "./vsa";
import { classifyWyckoffV2 } from "./wyckoff";
import { classifyWyckoffV3 } from "./wyckoffV3";
import type { WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";
import { eventStudy } from "./eventStudy";
import { buildSessionProfiles, buildVolumeProfile, type SessionProfile, type VolumeProfile } from "./volumeProfile";
import { anchoredVwap, anchorIndexOf, type VwapPoint } from "./vwap";
import { buildFlowBars, computeVpin, detectAbsorption, detectCvdDivergence, type FlowMinute } from "./orderFlow";

export * from "./math";
export * from "./structure";
export * from "./zones";
export * from "./vsa";
export * from "./wyckoff";
export * from "./wyckoffV3";
export * from "./eventStudy";
export * from "./volumeProfile";
export * from "./vwap";
export * from "./orderFlow";

export const ENGINE_VERSION = "2.3.0";

/**
 * Wyckoff: engine MẶC ĐỊNH + engine thử nghiệm chạy song song (benchmark 2026-10-08, tiêu chí đặt trước — xem PR Wyckoff v3):
 * v3 (máy trạng thái Phase A–E) chưa đạt S1 (chênh lệch tăng−giảm ngoài mẫu −0,82 so với v2 đã sửa −0,01) -> v2 đã sửa là mặc định.
 */
export const WYCKOFF_DEFAULT_ENGINE: "v2" | "v3" = "v2";

/** Chính sách theo khung: 1m/5m tắt (nhiễu, chưa kiểm định); 15m/1H/W/M chạy kèm cảnh báo; D là khung đã kiểm định. */
export function wyckoffTimeframePolicy(tf: string | undefined): { enabled: boolean; note: string | null } {
  const t = tf ?? "D";
  if (t === "1m" || t === "5m") return { enabled: false, note: `Wyckoff tắt ở khung ${t}: khung quá nhỏ, nhiễu, chưa kiểm định — xem khung D.` };
  if (t === "15m" || t === "1H") return { enabled: true, note: `Khung ${t}: Wyckoff khung nhỏ không thể hiện xu hướng, chưa kiểm định — chỉ dùng để tinh chỉnh điểm vào khi khung D đã rõ.` };
  if (t === "W" || t === "M") return { enabled: true, note: `Khung ${t}: chưa kiểm định thống kê (benchmark chỉ trên khung D).` };
  return { enabled: true, note: null };
}

function wyckoffFor(bars: Bar[], engine: "v2" | "v3", tf: string | undefined, isIndex: boolean): WyckoffResult {
  const policy = wyckoffTimeframePolicy(tf);
  const r = engine === "v3" ? classifyWyckoffV3(bars, { timeframe: tf, isIndex }) : classifyWyckoffV2(bars);
  if (!policy.enabled) {
    return { ...r, phase: "undetermined", status: "insufficient", statusReason: policy.note!, events: [], structures: [], historical: null, checks: [], caveats: [policy.note!] };
  }
  const caveats = [...(r.caveats ?? [])];
  if (policy.note && !caveats.some((c) => c.startsWith(`Khung ${tf}`))) caveats.unshift(policy.note);
  if (isIndex && !caveats.some((c) => c.includes("không giao dịch trực tiếp"))) {
    caveats.push("VN-Index là chỉ số, không giao dịch trực tiếp; khối lượng là KL toàn thị trường (không phải dòng tiền vào một tài sản).");
  }
  return { ...r, caveats };
}

/** Số nến cho Composite Volume Profile trên khung D/W/M. */
export const COMPOSITE_PROFILE_BARS = 60;

export interface AnalyzeOptions {
  isIndex?: boolean; limitPct?: number | null; structure?: Partial<StructureParams>; horizon?: number;
  /** Nến 1 phút (khung intraday) -> Session Volume Profile chính xác theo mức giá; không có -> Composite xấp xỉ từ nến ngày. */
  bars1m?: (Bar & { auction?: string })[];
  /** Dòng lệnh theo phút (Gateway /ta-flow). Có (kể cả rỗng) -> tính Order Flow; phiên thiếu tick dùng BVC. */
  flowMinutes?: FlowMinute[];
  /** Khung đang phân tích (1m/5m/15m/1H/D/W/M) — chính sách & cảnh báo Wyckoff theo khung. */
  timeframe?: string;
}

export function analyze(bars: Bar[], opts: AnalyzeOptions = {}) {
  const isIndex = Boolean(opts.isIndex);
  const st = computeStructure(bars, opts.structure);
  const orderBlocks = detectOrderBlocks(bars, st.events, st.atr);
  const fvgs = detectFVG(bars, st.atr, { isIndex, limitPct: isIndex ? null : opts.limitPct ?? 0.07 });
  const liquidity = detectLiquidity(bars, st.pivots, st.atr, { isIndex });
  const dealingRange = computeDealingRange(bars, st.pivots);
  const vsa = detectVsa(bars);
  const wyckoff = wyckoffFor(bars, WYCKOFF_DEFAULT_ENGINE, opts.timeframe, isIndex);
  const wyckoffAlt = wyckoffFor(bars, WYCKOFF_DEFAULT_ENGINE === "v2" ? "v3" : "v2", opts.timeframe, isIndex);
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
  let orderFlow = null;
  if (opts.flowMinutes) {
    const flow = buildFlowBars(bars, opts.flowMinutes);
    const intraday = bars.length > 0 && bars[0].date.length > 10;
    const sessions = intraday ? new Set(bars.map((b) => b.date.slice(0, 10))).size : bars.length;
    const tickBars = flow.filter((f) => f.source === "TICK").length;
    orderFlow = {
      bars: flow,
      absorption: detectAbsorption(bars, flow, { isIndex }),
      divergences: detectCvdDivergence(st.pivots, flow),
      vpin: computeVpin(bars, flow, { sessions }),
      coverage: { tickBars, bvcBars: flow.length - tickBars, tickPct: flow.length ? Math.round((tickBars / flow.length) * 100) : 0 },
    };
  }
  const backtest = {
    chochBull: eventStudy(bars, choch.filter((e) => e.dir === "bullish").map((e) => e.index), "bullish", "CHoCH ▲", horizon),
    chochBear: eventStudy(bars, choch.filter((e) => e.dir === "bearish").map((e) => e.index), "bearish", "CHoCH ▼", horizon),
  };
  return {
    engineVersion: ENGINE_VERSION,
    atr: st.atr, pivots: st.pivots, structure: st.events, trend: st.trend,
    orderBlocks, fvgs, liquidity, dealingRange, vsa, wyckoff, wyckoffAlt, backtest,
    profile: { sessions, composite }, avwap, orderFlow,
    counts: {
      bos: st.events.length - choch.length, choch: choch.length, orderBlocks: orderBlocks.length, fvgs: fvgs.length,
      liquidity: liquidity.length, sweeps: liquidity.filter((z) => z.state === "SWEPT").length, vsa: vsa.length,
    },
  };
}
export type Analysis = ReturnType<typeof analyze>;
