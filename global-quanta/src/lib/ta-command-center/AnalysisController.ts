import { DrawingManager, type DrawnPrimitive } from "./DrawingManager";
import { LayerManager, type LayerState } from "./LayerManager";
import { AIEngine, type SignalLogEntry } from "./AIEngine";
import { TimeframeController, type Timeframe } from "./TimeframeController";
import {
  detectOrderBlocks, detectFVG, detectBOS, detectCHoCH, detectLiquidityPools, computePremiumDiscountZone,
  computeStructureEventsFull,
  type OrderBlock, type FairValueGap, type BreakOfStructure, type LiquidityPool, type PremiumDiscountZone,
} from "./detectors/smcDetector";
// ĐÃ THÊM — tái dùng nguyên lý Pattern Backtest Engine cho tín hiệu CHoCH
// (xem signalBacktest.ts để hiểu vì sao chỉ áp dụng cho CHoCH — tín hiệu
// duy nhất trong nhóm này có hướng kỳ vọng tăng/giảm RÕ RÀNG, không mơ hồ
// như VSA Climax).
import { backtestSignalDates, type SignalBacktestResult } from "./detectors/signalBacktest";
import { detectVSASignals, type VSASignal } from "./detectors/vsaDetector";
// ĐÃ THÊM: đưa tính toán Wyckoff vào AnalysisController, cùng kiến trúc
// cache/event với SMC/VSA — trước đây Wyckoff được tính RIÊNG, TÁCH RỜI
// trong TVChartPanel.tsx, khiến AIEngine (chạy trong controller này)
// không có cách nào truy cập kết quả Wyckoff để đối chiếu chéo. Đây chính
// là nguyên nhân gốc khiến toggle "Wyckoff" trước đây không ảnh hưởng gì
// tới confidence AI dù logic tính điểm đã viết sẵn.
import { classifyWyckoffPhase, type WyckoffResult } from "./detectors/wyckoffDetector";
import type { PatternMatch } from "./types";
import { EventEmitter } from "./EventEmitter";
import type { OhlcvBar } from "./types";

interface ControllerEvents extends Record<string, unknown> {
  "log:updated": SignalLogEntry[];
  "primitives:updated": DrawnPrimitive[];
  "smc:updated": {
    obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[];
    choch: BreakOfStructure[]; liquidity: LiquidityPool[]; premiumDiscount: PremiumDiscountZone | null;
  };
  "vsa:updated": VSASignal[];
  "wyckoff:updated": WyckoffResult;
  "timeframe:changed": { timeframe: Timeframe; bars: OhlcvBar[] };
}

export class AnalysisController {
  drawing = new DrawingManager();
  layers = new LayerManager();
  timeframeController = new TimeframeController();
  private ai = new AIEngine();
  private emitter = new EventEmitter<ControllerEvents>();

  private bars: OhlcvBar[] = [];
  private log: SignalLogEntry[] = [];
  private smcCache = {
    obs: [] as OrderBlock[], fvgs: [] as FairValueGap[], bos: [] as BreakOfStructure[],
    choch: [] as BreakOfStructure[], liquidity: [] as LiquidityPool[], premiumDiscount: null as PremiumDiscountZone | null,
  };
  private vsaCache: VSASignal[] = [];
  private wyckoffCache: WyckoffResult = classifyWyckoffPhase([]);
  // ĐÃ THÊM — kết quả backtest CHoCH (bullish/bearish riêng), tính lại
  // mỗi khi dữ liệu nến/khung thời gian đổi.
  private chochBacktestCache: { bullish: SignalBacktestResult; bearish: SignalBacktestResult } | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor(dailyBars: OhlcvBar[]) {
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
      const newEntries = this.ai.analyzeAndCrossReference(primitive, this.smcCache, this.vsaCache, currentPrice, this.wyckoffCache, this.bars);
      this.log = [...newEntries, ...this.log].slice(0, 30);
      this.emitter.emit("log:updated", this.log);
    });

    const unsubDeleted = this.drawing.on("primitive:deleted", () => {
      this.emitter.emit("primitives:updated", this.drawing.getPrimitives());
    });

    this.unsubscribers.push(unsubCreated, unsubDeleted);
  }

  updateDailyBars(dailyBars: OhlcvBar[]): void {
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
      pattern, this.smcCache, this.vsaCache,
      { smc: layerState.smc, vsa: layerState.vsa, wyckoff: layerState.wyckoff, elliott: layerState.elliott },
      this.wyckoffCache
    );
    this.log = [entry, ...this.log].slice(0, 30);
    this.emitter.emit("log:updated", this.log);
  }

  private recomputeDetectors(): void {
    this.smcCache = {
      obs: detectOrderBlocks(this.bars), fvgs: detectFVG(this.bars), bos: detectBOS(this.bars),
      choch: detectCHoCH(this.bars), liquidity: detectLiquidityPools(this.bars), premiumDiscount: computePremiumDiscountZone(this.bars),
    };
    this.vsaCache = detectVSASignals(this.bars);
    this.wyckoffCache = classifyWyckoffPhase(this.bars);
    // ĐÃ THÊM: backtest CHoCH trên TOÀN BỘ lịch sử (không dùng bản đã cắt
    // bớt cho UI) — dùng computeStructureEventsFull thay vì smcCache.choch.
    const fullChoch = computeStructureEventsFull(this.bars).choch;
    const bullishDates = fullChoch.filter((c) => c.type === "bullish").map((c) => c.date);
    const bearishDates = fullChoch.filter((c) => c.type === "bearish").map((c) => c.date);
    this.chochBacktestCache = {
      bullish: backtestSignalDates(this.bars, bullishDates, "bullish", "CHoCH tăng"),
      bearish: backtestSignalDates(this.bars, bearishDates, "bearish", "CHoCH giảm"),
    };
    this.emitter.emit("smc:updated", this.smcCache);
    this.emitter.emit("vsa:updated", this.vsaCache);
    this.emitter.emit("wyckoff:updated", this.wyckoffCache);
  }

  getChochBacktest() { return this.chochBacktestCache; }
  getSmc() { return this.smcCache; }
  getVsa(): VSASignal[] { return this.vsaCache; }
  getWyckoff(): WyckoffResult { return this.wyckoffCache; }
  getLog(): SignalLogEntry[] { return this.log; }
  getLayerState(): LayerState { return this.layers.getState(); }

  onLogUpdated(h: (log: SignalLogEntry[]) => void) { return this.emitter.on("log:updated", h); }
  onPrimitivesUpdated(h: (p: DrawnPrimitive[]) => void) { return this.emitter.on("primitives:updated", h); }
  onSmcUpdated(h: (s: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[]; choch: BreakOfStructure[]; liquidity: LiquidityPool[]; premiumDiscount: PremiumDiscountZone | null }) => void) { return this.emitter.on("smc:updated", h); }
  onVsaUpdated(h: (v: VSASignal[]) => void) { return this.emitter.on("vsa:updated", h); }
  onWyckoffUpdated(h: (w: WyckoffResult) => void) { return this.emitter.on("wyckoff:updated", h); }
  onLayersChanged(h: (s: LayerState) => void) { return this.layers.on(h); }
  onTimeframeChanged(h: (payload: { timeframe: Timeframe; bars: OhlcvBar[] }) => void) { return this.emitter.on("timeframe:changed", h); }

  destroy(): void { this.unsubscribers.forEach((u) => u()); }
}
