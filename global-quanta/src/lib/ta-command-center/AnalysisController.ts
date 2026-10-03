import { DrawingManager, type DrawnPrimitive } from "./DrawingManager";
import { LayerManager, type LayerState } from "./LayerManager";
import { AIEngine, type SignalLogEntry } from "./AIEngine";
import { TimeframeController, type Timeframe } from "./TimeframeController";
// P2: mọi phép tính dùng @gq/quant-core (không look-ahead, có confirmedIndex). Các detector cũ trong ./detectors chỉ còn
// phục vụ dữ liệu Project A (convergence) và test lịch sử.
import { ENGINE_VERSION, OB_EXPIRY_BARS, type Analysis, type Dir, type EventStudyResult, type FvgState, type ObStatus, type PoolState, type VsaSignal } from "../quant-core";
import { classifyWyckoffPhase, type WyckoffResult } from "./detectors/wyckoffDetector";
import { runAnalysis } from "../quant-core/runner";
import type { PatternMatch } from "./types";
import { EventEmitter } from "./EventEmitter";
import type { OhlcvBar } from "./types";

// ---- Dạng dữ liệu cho giao diện (giữ tên trường cũ để lớp vẽ không phải đổi) ----
export interface OrderBlock { date: string; type: Dir; top: number; bottom: number; mitigated: boolean; mitigatedAt: string | null; status: ObStatus; kind: "BOS" | "CHoCH" }
export interface FairValueGap { startDate: string; endDate: string; type: Dir; top: number; bottom: number; filled: boolean; filledAt: string | null; state: FvgState; filledPct: number }
export interface BreakOfStructure { date: string; type: Dir; brokenLevel: number; displaced: boolean }
export interface LiquidityPool { date: string; price: number; type: "EQH" | "EQL"; touches: number; state: PoolState; stateDate: string | null }
export interface PremiumDiscountZone { swingHigh: number; swingLow: number; midpoint: number; oteLow: number; oteHigh: number; currentZone: "premium" | "discount" | "equilibrium"; legDir: Dir; startDate: string }
export interface SmcTotals { obs: number; fvgs: number; bos: number; choch: number; liquidity: number; sweeps: number }

export const SMC_DISPLAY_LIMIT = { obs: 10, fvgs: 10, bos: 6, choch: 4, liquidity: 6 } as const;

interface ControllerEvents extends Record<string, unknown> {
  "log:updated": SignalLogEntry[];
  "primitives:updated": DrawnPrimitive[];
  "smc:updated": SmcState;
  "vsa:updated": VsaSignal[];
  "wyckoff:updated": WyckoffResult;
  "timeframe:changed": { timeframe: Timeframe; bars: OhlcvBar[] };
}

export interface SmcState {
  obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[];
  choch: BreakOfStructure[]; liquidity: LiquidityPool[]; premiumDiscount: PremiumDiscountZone | null;
  /** Liquidity Sweep gần nhất (marker) — vùng đã bị quét không còn vẽ thành đường. */
  sweeps: LiquidityPool[];
  /** Tổng số thật trên toàn bộ nến — các mảng trên chỉ là vài đối tượng CÒN HIỆU LỰC gần nhất để vẽ. */
  totals: SmcTotals;
}

/** Danh sách đầy đủ (mọi trạng thái) cho Confluence Log — trendline/zone vẽ ở giai đoạn cũ vẫn đối chiếu được. */
export interface SmcFull { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] }

export const EMPTY_SMC: SmcState = {
  obs: [], fvgs: [], bos: [], choch: [], liquidity: [], premiumDiscount: null, sweeps: [],
  totals: { obs: 0, fvgs: 0, bos: 0, choch: 0, liquidity: 0, sweeps: 0 },
};

export interface ChochBacktest { bullish: EventStudyResult; bearish: EventStudyResult; engineVersion: string }
export interface ControllerOptions { isIndex?: boolean }

const obView = (z: Analysis["orderBlocks"][number]): OrderBlock => ({
  date: z.date, type: z.dir, top: z.top, bottom: z.bottom, mitigated: z.status !== "ACTIVE", mitigatedAt: z.statusDate, status: z.status, kind: z.kind,
});
const fvgView = (g: Analysis["fvgs"][number]): FairValueGap => ({
  startDate: g.startDate, endDate: g.endDate, type: g.dir, top: g.top, bottom: g.bottom,
  filled: g.state === "FILLED" || g.state === "INVERTED", filledAt: g.state === "FILLED" || g.state === "INVERTED" ? g.stateDate : null,
  state: g.state, filledPct: g.filledPct,
});
const poolView = (z: Analysis["liquidity"][number]): LiquidityPool => ({
  date: z.date, price: z.level, type: z.side === "BSL" ? "EQH" : "EQL", touches: z.touches, state: z.state, stateDate: z.stateDate,
});

export function toSmcFull(a: Analysis): SmcFull {
  return {
    obs: a.orderBlocks.map(obView),
    fvgs: a.fvgs.map(fvgView),
    bos: a.structure.map((e) => ({ date: e.date, type: e.dir, brokenLevel: e.level, displaced: e.displaced })),
  };
}

/**
 * Ánh xạ kết quả quant-core -> dạng hiển thị. CHỈ vùng còn hiệu lực (yêu cầu 03/10: SMC quá rối, bỏ hiển thị "test"):
 * OB chưa bị test (ACTIVE), FVG còn mở (OPEN/PARTIAL), vùng thanh khoản chưa bị quét (RESTING). Tổng số giữ trong totals.
 */
export function toSmcState(a: Analysis): SmcState {
  const shift = (e: Analysis["structure"][number]): BreakOfStructure => ({ date: e.date, type: e.dir, brokenLevel: e.level, displaced: e.displaced });
  const bos = a.structure.filter((e) => e.kind === "BOS");
  const choch = a.structure.filter((e) => e.kind === "CHoCH");
  const dr = a.dealingRange;
  return {
    obs: a.orderBlocks.filter((z) => z.status === "ACTIVE").slice(-SMC_DISPLAY_LIMIT.obs).map(obView),
    // FVG còn mở nhưng đã quá 120 phiên (cùng hạn hiệu lực với OB) không vẽ nữa — tránh các dải kéo ngang toàn biểu đồ.
    fvgs: a.fvgs.filter((g) => (g.state === "OPEN" || g.state === "PARTIAL") && a.atr.length - 1 - g.confirmedIndex <= OB_EXPIRY_BARS)
      .slice(-SMC_DISPLAY_LIMIT.fvgs).map(fvgView),
    bos: bos.slice(-SMC_DISPLAY_LIMIT.bos).map(shift),
    choch: choch.slice(-SMC_DISPLAY_LIMIT.choch).map(shift),
    liquidity: a.liquidity.filter((z) => z.state === "RESTING").slice(-SMC_DISPLAY_LIMIT.liquidity).map(poolView),
    sweeps: a.liquidity.filter((z) => z.state === "SWEPT").slice(-SMC_DISPLAY_LIMIT.liquidity).map(poolView),
    premiumDiscount: dr ? {
      swingHigh: dr.high, swingLow: dr.low, midpoint: dr.eq, oteLow: dr.oteLow, oteHigh: dr.oteHigh, currentZone: dr.zone, legDir: dr.legDir,
      startDate: dr.highIndex < dr.lowIndex ? dr.highDate : dr.lowDate,
    } : null,
    totals: { obs: a.counts.orderBlocks, fvgs: a.counts.fvgs, bos: a.counts.bos, choch: a.counts.choch, liquidity: a.counts.liquidity, sweeps: a.counts.sweeps },
  };
}

export class AnalysisController {
  drawing = new DrawingManager();
  layers = new LayerManager();
  timeframeController = new TimeframeController();
  private ai = new AIEngine();
  private emitter = new EventEmitter<ControllerEvents>();

  private bars: OhlcvBar[] = [];
  private log: SignalLogEntry[] = [];
  private smcCache: SmcState = EMPTY_SMC;
  private smcFull: SmcFull = { obs: [], fvgs: [], bos: [] };
  private vsaCache: VsaSignal[] = [];
  private wyckoffCache: WyckoffResult = classifyWyckoffPhase([]);
  private chochBacktestCache: ChochBacktest | null = null;
  private analysis: Analysis | null = null;
  private options: ControllerOptions;
  private unsubscribers: (() => void)[] = [];

  constructor(dailyBars: OhlcvBar[], options: ControllerOptions = {}) {
    this.options = options;
    this.timeframeController.setDailyBars(dailyBars);
    this.bars = this.timeframeController.getBarsForCurrentTimeframe();
    this.recomputeDetectors();

    const unsubCreated = this.drawing.on("primitive:created", (primitive) => {
      this.emitter.emit("primitives:updated", this.drawing.getPrimitives());
      if (!this.layers.getState().aiDetectionMaster) return;
      const currentPrice = this.bars.length > 0 ? this.bars[this.bars.length - 1].close : 0;
      // ĐÃ SỬA: truyền thêm this.bars — cần để tính số lần "test" lại
      // Demand/Supply Zone (countZoneTests trong smcDetector.ts), giảm
      // độ tin cậy theo số lần bị test — đúng nguyên lý SMC/ICT chuẩn.
      const newEntries = this.ai.analyzeAndCrossReference(primitive, this.smcFull, this.analysis?.vsa ?? this.vsaCache, currentPrice, this.wyckoffCache, this.bars);
      this.log = [...newEntries, ...this.log].slice(0, 30);
      this.emitter.emit("log:updated", this.log);
    });

    const unsubDeleted = this.drawing.on("primitive:deleted", () => {
      this.emitter.emit("primitives:updated", this.drawing.getPrimitives());
    });

    const unsubReplaced = this.drawing.on("primitives:replaced", (list) => this.emitter.emit("primitives:updated", list));

    this.unsubscribers.push(unsubCreated, unsubDeleted, unsubReplaced);
  }

  updateDailyBars(dailyBars: OhlcvBar[], options?: ControllerOptions): void {
    if (options) this.options = options;
    this.timeframeController.setDailyBars(dailyBars);
    this.bars = this.timeframeController.getBarsForCurrentTimeframe();
    this.recomputeDetectors();
  }

  setTimeframe(tf: Timeframe): void {
    this.timeframeController.setTimeframe(tf);
    this.bars = this.timeframeController.getBarsForCurrentTimeframe();
    this.recomputeDetectors();
    this.emitter.emit("timeframe:changed", { timeframe: tf, bars: this.bars });
  }

  getCurrentTimeframe(): Timeframe { return this.timeframeController.getTimeframe(); }
  getCurrentBars(): OhlcvBar[] { return this.bars; }

  logPatternConfluence(pattern: PatternMatch): void {
    const layerState = this.layers.getState();
    const entry = this.ai.analyzePatternConfluence(
      pattern, this.smcFull, this.analysis?.vsa ?? this.vsaCache,
      { smc: layerState.smc, vsa: layerState.vsa, wyckoff: layerState.wyckoff, elliott: layerState.elliott },
      this.wyckoffCache
    );
    this.log = [entry, ...this.log].slice(0, 30);
    this.emitter.emit("log:updated", this.log);
  }

  private cancelPending: () => void = () => {};

  /** Tính lại trong Web Worker (không chặn giao diện); kết quả cũ bị bỏ nếu dữ liệu/khung đã đổi. */
  private recomputeDetectors(): void {
    this.cancelPending();
    this.cancelPending = runAnalysis(this.bars, { isIndex: this.options.isIndex }, (a) => this.applyAnalysis(a));
  }

  private applyAnalysis(a: Analysis): void {
    this.analysis = a;
    this.smcCache = toSmcState(a);
    this.smcFull = toSmcFull(a);
    this.vsaCache = a.vsa.slice(-8);
    this.wyckoffCache = a.wyckoff;
    // Event study trên TOÀN BỘ lịch sử: vào lệnh giá mở cửa T+1, trừ phí/thuế, so với tỷ lệ nền (quant-core/eventStudy).
    this.chochBacktestCache = { bullish: a.backtest.chochBull, bearish: a.backtest.chochBear, engineVersion: ENGINE_VERSION };
    this.emitter.emit("smc:updated", this.smcCache);
    this.emitter.emit("vsa:updated", this.vsaCache);
    this.emitter.emit("wyckoff:updated", this.wyckoffCache);
  }

  /** Kết quả đầy đủ của quant-core (sweep, trạng thái FVG/OB, dealing range…) cho lớp vẽ nâng cao. */
  getAnalysis(): Analysis | null { return this.analysis; }
  getChochBacktest() { return this.chochBacktestCache; }
  getSmc() { return this.smcCache; }
  getVsa(): VsaSignal[] { return this.vsaCache; }
  getWyckoff(): WyckoffResult { return this.wyckoffCache; }
  getLog(): SignalLogEntry[] { return this.log; }
  getLayerState(): LayerState { return this.layers.getState(); }

  onLogUpdated(h: (log: SignalLogEntry[]) => void) { return this.emitter.on("log:updated", h); }
  onPrimitivesUpdated(h: (p: DrawnPrimitive[]) => void) { return this.emitter.on("primitives:updated", h); }
  onSmcUpdated(h: (s: SmcState) => void) { return this.emitter.on("smc:updated", h); }
  onVsaUpdated(h: (v: VsaSignal[]) => void) { return this.emitter.on("vsa:updated", h); }
  onWyckoffUpdated(h: (w: WyckoffResult) => void) { return this.emitter.on("wyckoff:updated", h); }
  onLayersChanged(h: (s: LayerState) => void) { return this.layers.on(h); }
  onTimeframeChanged(h: (payload: { timeframe: Timeframe; bars: OhlcvBar[] }) => void) { return this.emitter.on("timeframe:changed", h); }

  destroy(): void { this.cancelPending(); this.unsubscribers.forEach((u) => u()); }
}
