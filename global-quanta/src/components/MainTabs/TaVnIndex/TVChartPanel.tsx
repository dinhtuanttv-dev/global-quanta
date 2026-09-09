"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Trash2, XCircle } from "lucide-react";
import { TVChartManager } from "../../../lib/ta-command-center/TVChartManager";
import { AnalysisController } from "../../../lib/ta-command-center/AnalysisController";
import DrawingPalette from "./DrawingPalette";
import LayerToggleBar from "./LayerToggleBar";
import AISignalLogPanel from "./AISignalLogPanel";
import TimeframeSelector from "./TimeframeSelector";
import PatternList from "./PatternList";
import ConvergenceFilterPanel from "./ConvergenceFilterPanel";
import OscillatorPanel from "./OscillatorPanel";
import SmartNotePanel from "./SmartNotePanel";
import { SMCPanel, VSAPanel, WyckoffPanel, ElliottWavePanelPlaceholder } from "./MethodPanels";
// ĐÃ SỬA: bỏ import classifyWyckoffPhase — Wyckoff giờ tính trong
// AnalysisController (cùng kiến trúc cache/event với SMC/VSA), không tính
// rời trực tiếp trong component nữa. Giữ lại type WyckoffResult để khai
// báo state.
import type { WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import { calculateRSI, calculateMACD, calculateADX } from "../../../lib/ta-command-center/detectors/technicalOscillators";
import type { OhlcvBar, PatternMatch } from "../../../lib/ta-command-center/types";
import type {
  DrawingToolType, DrawnPrimitive, DomainPoint,
  RectangleZone, Trendline, FibonacciRetracement, ElliottWaveMarking, FibTimeZoneMarking,
} from "../../../lib/ta-command-center/DrawingManager";
import { FIB_TIME_SEQUENCE, buildFibLevels } from "../../../lib/ta-command-center/DrawingManager";
import type { LayerState, LayerKey } from "../../../lib/ta-command-center/LayerManager";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";
import type { OrderBlock, FairValueGap, BreakOfStructure, LiquidityPool, PremiumDiscountZone } from "../../../lib/ta-command-center/detectors/smcDetector";
import { countZoneTests } from "../../../lib/ta-command-center/detectors/smcDetector";
import { suggestElliottPoints } from "../../../lib/ta-command-center/detectors/zigzagSuggest";
import type { SignalBacktestResult } from "../../../lib/ta-command-center/detectors/signalBacktest";
import type { VSASignal } from "../../../lib/ta-command-center/detectors/vsaDetector";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";

interface Props {
  bars: OhlcvBar[];
  ticker: string;
  onRequestTickerChange?: (ticker: string) => void;
}

function isTwoPointPrimitive(p: DrawnPrimitive): p is RectangleZone | Trendline | FibonacciRetracement {
  return p.toolType === "rectangle" || p.toolType === "trendline" || p.toolType === "fibonacci";
}

export default function TVChartPanel({ bars, ticker, onRequestTickerChange }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tvManagerRef = useRef<TVChartManager | null>(null);
  const controllerRef = useRef<AnalysisController | null>(null);
  const isDrawingRef = useRef(false);

  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null);
  const [primitives, setPrimitives] = useState<DrawnPrimitive[]>([]);
  const [layerState, setLayerState] = useState<LayerState | null>(null);
  const [log, setLog] = useState<SignalLogEntry[]>([]);
  const [smc, setSmc] = useState<{
    obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[];
    choch: BreakOfStructure[]; liquidity: LiquidityPool[]; premiumDiscount: PremiumDiscountZone | null;
  }>({ obs: [], fvgs: [], bos: [], choch: [], liquidity: [], premiumDiscount: null });
  const [vsa, setVsa] = useState<VSASignal[]>([]);
  const [wyckoffResult, setWyckoffResult] = useState<WyckoffResult | null>(null);
  // ĐÃ THÊM — kết quả backtest CHoCH thật (tỷ lệ thắng trên chính lịch sử
  // giá của mã đang xem), đồng bộ cùng lúc với `smc` vì cả 2 được tính
  // chung trong recomputeDetectors() của AnalysisController.
  const [chochBacktest, setChochBacktest] = useState<{ bullish: SignalBacktestResult; bearish: SignalBacktestResult } | null>(null);
  // ĐÃ THÊM: lưu hình đang vẽ dở (draft) để hiển thị preview theo thời gian
  // thực khi rê chuột — trước đây KHÔNG hề subscribe sự kiện
  // "primitive:draft-updated" dù DrawingManager đã phát ra sự kiện này mỗi
  // lần updateDraw() chạy, khiến người dùng không thấy gì cho tới khi thả
  // chuột ("chưa ghim vào di chuyển của chuột").
  const [draftPrimitive, setDraftPrimitive] = useState<{ toolType: DrawingToolType; p1: DomainPoint; p2: DomainPoint } | null>(null);
  const [timeframe, setTimeframeState] = useState<Timeframe>("D");
  const [currentBars, setCurrentBars] = useState<OhlcvBar[]>(bars);
  const [highlightRange, setHighlightRange] = useState<{ start: string; end: string } | null>(null);
  const [elliottDraft, setElliottDraft] = useState<DomainPoint[]>([]);
  const [fibExtensionMode, setFibExtensionMode] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (bars.length === 0) return;

    if (!controllerRef.current) controllerRef.current = new AnalysisController(bars);
    else controllerRef.current.updateDailyBars(bars);

    const controller = controllerRef.current;
    const activeBars = controller.getCurrentBars();
    setCurrentBars(activeBars);

    if (!tvManagerRef.current && chartContainerRef.current) {
      tvManagerRef.current = new TVChartManager(chartContainerRef.current, activeBars);
    } else if (tvManagerRef.current) {
      tvManagerRef.current.setData(activeBars);
    }

    const unsubPrim = controller.onPrimitivesUpdated(setPrimitives);
    const unsubLog = controller.onLogUpdated(setLog);
    const unsubSmc = controller.onSmcUpdated(setSmc);
    const unsubVsa = controller.onVsaUpdated(setVsa);
    const unsubWyckoff = controller.onWyckoffUpdated(setWyckoffResult);
    const unsubLayers = controller.onLayersChanged(setLayerState);
    const unsubTf = controller.onTimeframeChanged(({ timeframe: tf, bars: newBars }: { timeframe: Timeframe; bars: OhlcvBar[] }) => {
      setTimeframeState(tf);
      setCurrentBars(newBars);
      tvManagerRef.current?.setData(newBars);
    });
    const unsubElliottDraft = controller.drawing.on("elliott:draft-updated", setElliottDraft);
    const unsubFibExt = controller.drawing.on("fibExtension:changed", setFibExtensionMode);
    // ĐÃ THÊM: subscribe draft preview cho Trendline/Rectangle/Fibonacci
    const unsubDraft = controller.drawing.on("primitive:draft-updated", setDraftPrimitive);
    const unsubRange = tvManagerRef.current?.onVisibleRangeChange(() => forceTick((t) => t + 1)) ?? (() => {});

    setPrimitives(controller.drawing.getPrimitives());
    setLog(controller.getLog());
    setSmc(controller.getSmc());
    setVsa(controller.getVsa());
    setWyckoffResult(controller.getWyckoff());
    setLayerState(controller.getLayerState());
    setTimeframeState(controller.getCurrentTimeframe());
    setElliottDraft(controller.drawing.getElliottDraft());
    setFibExtensionMode(controller.drawing.getFibExtensionMode());

    return () => { unsubPrim(); unsubLog(); unsubSmc(); unsubVsa(); unsubWyckoff(); unsubLayers(); unsubTf(); unsubElliottDraft(); unsubFibExt(); unsubDraft(); unsubRange(); };
  }, [bars]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && tvManagerRef.current) tvManagerRef.current.resize(w);
    });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    tvManagerRef.current?.destroy(); tvManagerRef.current = null;
    controllerRef.current?.destroy(); controllerRef.current = null;
  }, []);

  // ĐÃ THÊM: đồng bộ kết quả backtest CHoCH mỗi khi `smc` đổi (cả 2 được
  // tính cùng lúc trong recomputeDetectors() của AnalysisController).
  useEffect(() => {
    setChochBacktest(controllerRef.current?.getChochBacktest() ?? null);
  }, [smc]);

  useEffect(() => {
    if (!tvManagerRef.current || !layerState) return;
    const markers: { time: string; position: "aboveBar" | "belowBar"; color: string; shape: "arrowUp" | "arrowDown" | "circle"; text: string }[] = [];
    if (layerState.smc) {
      smc.obs.forEach((ob) => markers.push({ time: ob.date, position: ob.type === "bullish" ? "belowBar" : "aboveBar", color: ob.type === "bullish" ? "#34d399" : "#f87171", shape: "circle", text: `OB${ob.type === "bullish" ? "+" : "-"}` }));
      smc.bos.forEach((b) => markers.push({ time: b.date, position: b.type === "bullish" ? "belowBar" : "aboveBar", color: b.type === "bullish" ? "#38bdf8" : "#fb923c", shape: b.type === "bullish" ? "arrowUp" : "arrowDown", text: "BOS" }));
      // ĐÃ THÊM — CHoCH (Change of Character): tín hiệu đảo chiều, khác
      // hẳn màu/nhãn với BOS (tiếp diễn) để không gây nhầm lẫn khi nhìn
      // nhanh trên biểu đồ.
      smc.choch.forEach((c) => markers.push({ time: c.date, position: c.type === "bullish" ? "belowBar" : "aboveBar", color: "#fbbf24", shape: "circle", text: "CHoCH" }));
    }
    if (layerState.vsa) {
      // ĐÃ SỬA: thêm màu riêng cho 3 tín hiệu VSA mới (Upthrust/Shakeout/
      // Two-Bar Reversal) — trước đây rơi vào màu xám mặc định, không
      // phân biệt được trên biểu đồ.
      vsa.forEach((v) => {
        const colorMap: Record<string, string> = {
          "Stopping Volume": "#a78bfa", "Climax": "#fbbf24",
          "Upthrust": "#f87171", "Shakeout": "#34d399", "Two-Bar Reversal": "#38bdf8",
        };
        const labelMap: Record<string, string> = {
          "Stopping Volume": "Stop", "Climax": "Clim", "No Demand": "NoDe", "No Supply": "NoSu",
          "Upthrust": "Up-T", "Shakeout": "Shk", "Two-Bar Reversal": "2BR",
        };
        markers.push({ time: v.date, position: "aboveBar", color: colorMap[v.type] || "#64748b", shape: "circle", text: labelMap[v.type] || v.type.slice(0, 4) });
      });
    }
    markers.sort((a, b) => a.time.localeCompare(b.time));
    tvManagerRef.current.setMarkers(markers);
  }, [smc, vsa, layerState]);

  const rsiResult = useMemo(() => calculateRSI(currentBars), [currentBars]);
  const macdResult = useMemo(() => calculateMACD(currentBars), [currentBars]);
  const adxResult = useMemo(() => calculateADX(currentBars), [currentBars]);

  const handleTimeframeChange = (tf: Timeframe) => {
    controllerRef.current?.setTimeframe(tf);
  };

  const handleToggleFibExtension = () => {
    controllerRef.current?.drawing.setFibExtensionMode(!fibExtensionMode);
  };

  // ĐÃ THÊM — Nâng cấp Elliott: gợi ý 6 điểm bằng Zigzag pivot thật, tạo
  // ngay 1 bản Elliott Wave nháp mà không bắt người dùng tự click 6 lần.
  // Người dùng có thể xóa (nút "Xóa") nếu không đồng ý và vẽ lại tay.
  const handleSuggestElliott = () => {
    if (!controllerRef.current) return;
    const points = suggestElliottPoints(currentBars);
    if (!points) {
      window.alert("Chưa đủ dữ liệu đỉnh/đáy rõ ràng để gợi ý sóng Elliott cho mã này.");
      return;
    }
    controllerRef.current.drawing.createElliottFromPoints(points);
    if (layerState && !layerState.elliott) {
      controllerRef.current.layers.toggle("elliott");
    }
    forceTick((t) => t + 1);
  };

  const handleSelectPattern = (pattern: PatternMatch) => {
    if (pattern.ticker !== ticker && onRequestTickerChange) {
      onRequestTickerChange(pattern.ticker);
    }
    setHighlightRange({ start: pattern.dateRangeStart, end: pattern.dateRangeEnd });
    controllerRef.current?.logPatternConfluence(pattern);
  };

  const getSvgCoords = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const toDomainPoint = (x: number, y: number) => {
    const tv = tvManagerRef.current;
    if (!tv) return null;
    const price = tv.pixelToPrice(y);
    const date = tv.pixelToDate(x);
    if (price === null || date === null) return null;
    return { date, price };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!activeTool || !controllerRef.current) return;
    const { x, y } = getSvgCoords(e);
    const point = toDomainPoint(x, y);
    if (!point) return;

    if (activeTool === "elliott") {
      controllerRef.current.drawing.addElliottPoint(point);
      if (controllerRef.current.drawing.getElliottDraft().length === 0) {
        setActiveTool(null);
        // ĐÃ THÊM: vừa vẽ xong Elliott Wave (đủ 6 điểm) — tự bật toggle
        // "Elliott" trên LayerToggleBar nếu đang tắt, để hình vừa vẽ hiện
        // ra ngay lập tức thay vì người dùng phải tự đi tìm nút bật riêng
        // (nếu không, elliottMarkings vẫn lọc ẩn hình dù đã vẽ xong).
        if (layerState && !layerState.elliott) {
          controllerRef.current.layers.toggle("elliott");
        }
      }
      forceTick((t) => t + 1);
      return;
    }

    if (activeTool === "fibTimeZone") {
      controllerRef.current.drawing.addFibTimeZone(point);
      setActiveTool(null);
      forceTick((t) => t + 1);
      return;
    }

    isDrawingRef.current = true;
    controllerRef.current.drawing.startDraw(activeTool, point);
    forceTick((t) => t + 1);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !controllerRef.current) return;
    const { x, y } = getSvgCoords(e);
    const point = toDomainPoint(x, y);
    if (!point) return;
    controllerRef.current.drawing.updateDraw(point);
    forceTick((t) => t + 1);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !controllerRef.current) return;
    isDrawingRef.current = false;
    const { x, y } = getSvgCoords(e);
    const point = toDomainPoint(x, y);
    if (point) controllerRef.current.drawing.finishDraw(point);
    setActiveTool(null);
    forceTick((t) => t + 1);
  };

  const tv = tvManagerRef.current;

  const renderPrimitivePixels = (p: RectangleZone | Trendline | FibonacciRetracement) => {
    if (!tv) return null;
    const x1 = tv.timeToPixel(p.p1.date); const y1 = tv.priceToPixel(p.p1.price);
    const x2 = tv.timeToPixel(p.p2.date); const y2 = tv.priceToPixel(p.p2.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { x1, y1, x2, y2 };
  };

  // ĐÃ THÊM: tính tọa độ pixel cho hình đang vẽ dở (draft) — hiển thị
  // LUÔN LUÔN bất kể trạng thái toggle layer (người đang chủ động vẽ cần
  // thấy phản hồi ngay lập tức, không phụ thuộc Trendline/Demand Zone
  // đang bật hay tắt).
  const draftPixels = useMemo(() => {
    if (!tv || !draftPrimitive) return null;
    const x1 = tv.timeToPixel(draftPrimitive.p1.date);
    const y1 = tv.priceToPixel(draftPrimitive.p1.price);
    const x2 = tv.timeToPixel(draftPrimitive.p2.date);
    const y2 = tv.priceToPixel(draftPrimitive.p2.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { toolType: draftPrimitive.toolType, x1, y1, x2, y2 };
  }, [tv, draftPrimitive]);

  const visiblePrimitives = useMemo(() => {
    if (!layerState) return [];
    return primitives.filter(isTwoPointPrimitive).filter((p) => {
      if (p.toolType === "trendline") return layerState.trendline;
      if (p.toolType === "rectangle") return layerState.demandzone;
      return true;
    });
  }, [primitives, layerState]);

  const elliottMarkings = useMemo(() => {
    if (!layerState?.elliott) return [];
    return primitives.filter((p): p is ElliottWaveMarking => p.toolType === "elliott");
  }, [primitives, layerState]);

  const fibTimeZoneMarkings = useMemo(() => {
    return primitives.filter((p): p is FibTimeZoneMarking => p.toolType === "fibTimeZone");
  }, [primitives]);

  const fibTimeZoneLines = useMemo(() => {
    if (!tv || currentBars.length === 0) return [];
    const lines: { key: string; x: number; label: string }[] = [];
    fibTimeZoneMarkings.forEach((marking) => {
      const anchorIdx = currentBars.findIndex((b) => b.date === marking.anchor.date);
      if (anchorIdx === -1) return;
      FIB_TIME_SEQUENCE.forEach((seq) => {
        const targetIdx = anchorIdx + seq;
        if (targetIdx >= currentBars.length) return;
        const targetDate = currentBars[targetIdx].date;
        const x = tv.timeToPixel(targetDate);
        if (x === null) return;
        lines.push({ key: `${marking.id}-${seq}`, x, label: String(seq) });
      });
    });
    return lines;
  }, [tv, fibTimeZoneMarkings, currentBars]);

  const smcOverlayRects = useMemo(() => {
    if (!tv || !layerState?.smc) return [];
    const lastBar = currentBars[currentBars.length - 1];
    const rects: { key: string; x1: number; x2: number; y1: number; y2: number; color: string; label: string }[] = [];

    smc.obs.forEach((ob, i) => {
      const x1 = tv.timeToPixel(ob.date);
      if (x1 === null) return;
      const endDate = ob.mitigatedAt ?? lastBar?.date;
      const x2 = endDate ? tv.timeToPixel(endDate) : x1 + 40;
      if (x2 === null) return;
      const y1 = tv.priceToPixel(ob.top);
      const y2 = tv.priceToPixel(ob.bottom);
      if (y1 === null || y2 === null) return;
      const baseAlpha = ob.mitigated ? 0.06 : 0.15;
      const color = ob.type === "bullish" ? `rgba(52,211,153,${baseAlpha})` : `rgba(248,113,113,${baseAlpha})`;
      const label = `OB ${ob.type === "bullish" ? "up" : "down"}${ob.mitigated ? " (đã test)" : ""}`;
      rects.push({ key: `ob-${i}`, x1, x2, y1, y2, color, label });
    });

    smc.fvgs.forEach((fvg, i) => {
      const x1 = tv.timeToPixel(fvg.startDate);
      const endDate = fvg.filledAt ?? fvg.endDate;
      const x2 = endDate ? tv.timeToPixel(endDate) : null;
      if (x1 === null || x2 === null) return;
      const y1 = tv.priceToPixel(fvg.top);
      const y2 = tv.priceToPixel(fvg.bottom);
      if (y1 === null || y2 === null) return;
      const baseAlpha = fvg.filled ? 0.05 : 0.12;
      const color = fvg.type === "bullish" ? `rgba(56,189,248,${baseAlpha})` : `rgba(251,146,60,${baseAlpha})`;
      rects.push({ key: `fvg-${i}`, x1, x2, y1, y2, color, label: fvg.filled ? "FVG (đã lấp)" : "FVG" });
    });

    return rects;
  }, [tv, smc, layerState, currentBars]);

  const wyckoffOverlay = useMemo(() => {
    if (!tv || !layerState?.wyckoff || !wyckoffResult) return null;
    if (wyckoffResult.rangeHigh === null || wyckoffResult.rangeLow === null || !wyckoffResult.rangeStartDate) return null;
    const x1 = tv.timeToPixel(wyckoffResult.rangeStartDate);
    const lastBar = currentBars[currentBars.length - 1];
    const x2 = lastBar ? tv.timeToPixel(lastBar.date) : null;
    const yTop = tv.priceToPixel(wyckoffResult.rangeHigh);
    const yBottom = tv.priceToPixel(wyckoffResult.rangeLow);
    if (x1 === null || x2 === null || yTop === null || yBottom === null) return null;

    const markers: { x: number; label: string; color: string }[] = [];
    if (wyckoffResult.springDate) {
      const x = tv.timeToPixel(wyckoffResult.springDate);
      if (x !== null) markers.push({ x, label: "Spring", color: "#38bdf8" });
    }
    if (wyckoffResult.testDate) {
      const x = tv.timeToPixel(wyckoffResult.testDate);
      if (x !== null) markers.push({ x, label: "Test", color: "#fbbf24" });
    }
    if (wyckoffResult.markupDate) {
      const x = tv.timeToPixel(wyckoffResult.markupDate);
      if (x !== null) markers.push({ x, label: "Markup", color: "#34d399" });
    }
    if (wyckoffResult.declineDate) {
      const x = tv.timeToPixel(wyckoffResult.declineDate);
      if (x !== null) markers.push({ x, label: "Decline", color: "#f87171" });
    }

    return { x1, x2, yTop, yBottom, markers };
  }, [tv, wyckoffResult, layerState, currentBars]);

  // ĐÃ THÊM — Liquidity Sweep / EQH-EQL: vẽ đường ngang nét đứt tại mức
  // giá có 2+ đỉnh/đáy gần bằng nhau — nơi thanh khoản (lệnh dừng lỗ) dồn
  // cụm, mục tiêu "quét thanh khoản" kinh điển trong SMC/ICT hiện đại.
  const liquidityLines = useMemo(() => {
    if (!tv || !layerState?.smc || currentBars.length === 0) return [];
    const lastBar = currentBars[currentBars.length - 1];
    const xEnd = tv.timeToPixel(lastBar.date);
    if (xEnd === null) return [];
    return smc.liquidity
      .map((pool) => {
        const y = tv.priceToPixel(pool.price);
        const xStart = tv.timeToPixel(pool.date);
        if (y === null || xStart === null) return null;
        return { key: `${pool.type}-${pool.date}`, xStart, xEnd, y, type: pool.type, touches: pool.touches };
      })
      .filter((l): l is { key: string; xStart: number; xEnd: number; y: number; type: "EQH" | "EQL"; touches: number } => l !== null);
  }, [tv, smc, layerState, currentBars]);

  // ĐÃ THÊM — Premium/Discount Zone + OTE: chia nền biểu đồ thành 2 nửa
  // theo swing gần nhất — nửa trên (premium, tô đỏ nhạt) là vùng cân nhắc
  // bán, nửa dưới (discount, tô xanh nhạt) là vùng cân nhắc mua; dải OTE
  // (62-79% hồi lại) tô đậm hơn — công cụ ra quyết định vào lệnh phổ biến
  // nhất trong ICT/SMC hiện đại.
  const premiumDiscountOverlay = useMemo(() => {
    if (!tv || !layerState?.smc || !smc.premiumDiscount || currentBars.length === 0) return null;
    const pd = smc.premiumDiscount;
    const firstBar = currentBars[Math.max(0, currentBars.length - 50)];
    const lastBar = currentBars[currentBars.length - 1];
    const x1 = tv.timeToPixel(firstBar.date);
    const x2 = tv.timeToPixel(lastBar.date);
    const yHigh = tv.priceToPixel(pd.swingHigh);
    const yMid = tv.priceToPixel(pd.midpoint);
    const yLow = tv.priceToPixel(pd.swingLow);
    const yOteLow = tv.priceToPixel(pd.oteLow);
    const yOteHigh = tv.priceToPixel(pd.oteHigh);
    if ([x1, x2, yHigh, yMid, yLow, yOteLow, yOteHigh].some((v) => v === null)) return null;
    return { x1: x1!, x2: x2!, yHigh: yHigh!, yMid: yMid!, yLow: yLow!, yOteLow: yOteLow!, yOteHigh: yOteHigh!, zone: pd.currentZone };
  }, [tv, smc, layerState, currentBars]);

  const elliottDraftPixels = useMemo(() => {
    if (!tv) return [];
    return elliottDraft
      .map((pt) => {
        const x = tv.timeToPixel(pt.date); const y = tv.priceToPixel(pt.price);
        return x !== null && y !== null ? { x, y } : null;
      })
      .filter((p): p is { x: number; y: number } => p !== null);
  }, [tv, elliottDraft]);

  const patternHighlightPixels = useMemo(() => {
    if (!tv || !highlightRange) return null;
    const x1 = tv.timeToPixel(highlightRange.start);
    const x2 = tv.timeToPixel(highlightRange.end);
    if (x1 === null || x2 === null) return null;
    return { x1, x2 };
  }, [tv, highlightRange, currentBars]);

  if (bars.length === 0) return <div className="text-xs text-slate-500 italic py-8 text-center">Chua co du lieu nen cho {ticker}.</div>;

  return (
    <div className="space-y-3">
      <TimeframeSelector current={timeframe} onChange={handleTimeframeChange} />
      {layerState && (
        <LayerToggleBar state={layerState}
          onToggle={(key: LayerKey) => controllerRef.current?.layers.toggle(key)}
          onToggleMaster={(on) => controllerRef.current?.layers.setMaster(on)} />
      )}

      <div className="relative" style={{ minHeight: 400 }}>
        <DrawingPalette
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          elliottEnabled={!!layerState?.elliott}
          fibExtensionMode={fibExtensionMode}
          onToggleFibExtension={handleToggleFibExtension}
          onSuggestElliott={handleSuggestElliott}
        />
        {wyckoffResult && (
          <SmartNotePanel
            ticker={ticker}
            wyckoff={wyckoffResult}
            smc={smc}
            vsa={vsa}
            rsi={rsiResult}
            macd={macdResult}
            adx={adxResult}
          />
        )}
        <div className="absolute top-3 z-10 flex items-center gap-2" style={{ left: 44 }}>
          {elliottDraft.length > 0 && (
            <button onClick={() => { controllerRef.current?.drawing.cancelElliottDraft(); setActiveTool(null); }}
              className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg">
              <XCircle className="w-3 h-3" /> Huy Elliott ({elliottDraft.length}/6)
            </button>
          )}
          {primitives.length > 0 && (
            <button onClick={() => controllerRef.current?.drawing.clearAll()}
              className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg">
              <Trash2 className="w-3 h-3" /> Xoa ({primitives.length})
            </button>
          )}
        </div>
        <div ref={chartContainerRef}
          style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", minHeight: 400 }}
          className="rounded-xl overflow-hidden relative w-full" />
        <svg className="absolute inset-0 w-full h-full" style={{ cursor: activeTool ? "crosshair" : "default", zIndex: 5, pointerEvents: activeTool ? "auto" : "none" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (isDrawingRef.current) { controllerRef.current?.drawing.cancelDraw(); isDrawingRef.current = false; } }}>

          {premiumDiscountOverlay && (
            <g opacity={0.5}>
              <rect x={Math.min(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2)} y={premiumDiscountOverlay.yHigh}
                width={Math.abs(premiumDiscountOverlay.x2 - premiumDiscountOverlay.x1)} height={Math.max(0, premiumDiscountOverlay.yMid - premiumDiscountOverlay.yHigh)}
                fill="rgba(248,113,113,0.05)" stroke="none" />
              <rect x={Math.min(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2)} y={premiumDiscountOverlay.yMid}
                width={Math.abs(premiumDiscountOverlay.x2 - premiumDiscountOverlay.x1)} height={Math.max(0, premiumDiscountOverlay.yLow - premiumDiscountOverlay.yMid)}
                fill="rgba(52,211,153,0.05)" stroke="none" />
              <rect x={Math.min(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2)} y={Math.min(premiumDiscountOverlay.yOteLow, premiumDiscountOverlay.yOteHigh)}
                width={Math.abs(premiumDiscountOverlay.x2 - premiumDiscountOverlay.x1)} height={Math.abs(premiumDiscountOverlay.yOteLow - premiumDiscountOverlay.yOteHigh)}
                fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.3)" strokeWidth={1} strokeDasharray="2,2" />
              <line x1={Math.min(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2)} y1={premiumDiscountOverlay.yMid}
                x2={Math.max(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2)} y2={premiumDiscountOverlay.yMid}
                stroke="rgba(148,163,184,0.4)" strokeWidth={1} strokeDasharray="2,2" />
              <text x={Math.max(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2) - 60} y={premiumDiscountOverlay.yHigh + 12} fontSize="8" fill="#f87171">Premium</text>
              <text x={Math.max(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2) - 60} y={premiumDiscountOverlay.yLow - 4} fontSize="8" fill="#34d399">Discount</text>
              <text x={Math.max(premiumDiscountOverlay.x1, premiumDiscountOverlay.x2) - 30} y={Math.min(premiumDiscountOverlay.yOteLow, premiumDiscountOverlay.yOteHigh) + 10} fontSize="8" fill="#38bdf8">OTE</text>
            </g>
          )}

          {patternHighlightPixels && (
            <rect x={Math.min(patternHighlightPixels.x1, patternHighlightPixels.x2)} y={10}
              width={Math.abs(patternHighlightPixels.x2 - patternHighlightPixels.x1)} height={340}
              fill="rgba(167,139,250,0.1)" stroke="#a78bfa" strokeWidth={1} strokeDasharray="5,3" />
          )}

          {smcOverlayRects.map((r) => (
            <g key={r.key}>
              <rect x={Math.min(r.x1, r.x2)} y={Math.min(r.y1, r.y2)}
                width={Math.abs(r.x2 - r.x1)} height={Math.max(2, Math.abs(r.y2 - r.y1))}
                fill={r.color} stroke="none" />
              <text x={Math.min(r.x1, r.x2) + 2} y={Math.min(r.y1, r.y2) - 2} fontSize="8" fill="#94a3b8">{r.label}</text>
            </g>
          ))}

          {liquidityLines.map((l) => (
            <g key={l.key}>
              <line x1={l.xStart} y1={l.y} x2={l.xEnd} y2={l.y}
                stroke={l.type === "EQH" ? "rgba(248,113,113,0.5)" : "rgba(52,211,153,0.5)"} strokeWidth={1} strokeDasharray="3,2" />
              <text x={l.xEnd - 40} y={l.y - 3} fontSize="8" fill={l.type === "EQH" ? "#f87171" : "#34d399"}>{l.type} ({l.touches})</text>
            </g>
          ))}

          {wyckoffOverlay && (
            <g>
              <rect x={Math.min(wyckoffOverlay.x1, wyckoffOverlay.x2)} y={Math.min(wyckoffOverlay.yTop, wyckoffOverlay.yBottom)}
                width={Math.abs(wyckoffOverlay.x2 - wyckoffOverlay.x1)} height={Math.abs(wyckoffOverlay.yBottom - wyckoffOverlay.yTop)}
                fill="rgba(167,139,250,0.06)" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4,3" />
              <text x={Math.min(wyckoffOverlay.x1, wyckoffOverlay.x2) + 4} y={Math.min(wyckoffOverlay.yTop, wyckoffOverlay.yBottom) + 12}
                fontSize="9" fill="#a78bfa" fontWeight="bold">Wyckoff Range ({wyckoffResult?.confidenceScore ?? 0}% tin cậy)</text>
              {wyckoffOverlay.markers.map((m, i) => (
                <g key={i}>
                  <line x1={m.x} y1={Math.min(wyckoffOverlay.yTop, wyckoffOverlay.yBottom)} x2={m.x} y2={Math.max(wyckoffOverlay.yTop, wyckoffOverlay.yBottom) + 15}
                    stroke={m.color} strokeWidth={1} strokeDasharray="2,2" />
                  <text x={m.x} y={Math.max(wyckoffOverlay.yTop, wyckoffOverlay.yBottom) + 26} textAnchor="middle" fontSize="9" fontWeight="bold" fill={m.color}>{m.label}</text>
                </g>
              ))}
            </g>
          )}

          {fibTimeZoneLines.map((l) => (
            <g key={l.key}>
              <line x1={l.x} y1={10} x2={l.x} y2={350} stroke="#f472b6" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
              <text x={l.x + 2} y={20} fontSize="8" fill="#f472b6">{l.label}</text>
            </g>
          ))}

          {draftPixels && draftPixels.toolType === "rectangle" && (
            <rect x={Math.min(draftPixels.x1, draftPixels.x2)} y={Math.min(draftPixels.y1, draftPixels.y2)}
              width={Math.abs(draftPixels.x2 - draftPixels.x1)} height={Math.abs(draftPixels.y2 - draftPixels.y1)}
              fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.7)" strokeWidth={1} strokeDasharray="3,3" />
          )}
          {draftPixels && draftPixels.toolType === "trendline" && (
            <line x1={draftPixels.x1} y1={draftPixels.y1} x2={draftPixels.x2} y2={draftPixels.y2}
              stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.8} />
          )}
          {/* ĐÃ SỬA: vẽ đúng lưới % Fibonacci thật khi đang kéo (dùng lại
              buildFibLevels() — cùng công thức với lúc thả chuột hoàn tất),
              thay vì chỉ 1 đường thẳng đơn giản như bản vá trước — người
              dùng cần thấy TRƯỚC khi thả chuột các mức % sẽ nằm ở đâu. */}
          {draftPixels && draftPrimitive && draftPrimitive.toolType === "fibonacci" && tv && (() => {
            const levels = buildFibLevels(draftPrimitive.p1, draftPrimitive.p2, fibExtensionMode);
            return (
              <g opacity={0.7}>
                <line x1={draftPixels.x1} y1={draftPixels.y1} x2={draftPixels.x2} y2={draftPixels.y2}
                  stroke="#a78bfa" strokeWidth={1} strokeDasharray="2,2" />
                {levels.map((lvl, i) => {
                  const y = tv.priceToPixel(lvl.price);
                  if (y === null) return null;
                  const isExtension = lvl.ratio > 1;
                  return (
                    <g key={i}>
                      <line x1={Math.min(draftPixels.x1, draftPixels.x2)} y1={y} x2={Math.max(draftPixels.x1, draftPixels.x2)} y2={y}
                        stroke={isExtension ? "rgba(244,114,182,0.6)" : "rgba(167,139,250,0.6)"} strokeWidth={1} strokeDasharray="2,2" />
                      <text x={Math.max(draftPixels.x1, draftPixels.x2) + 2} y={y + 3} fontSize="8" fill={isExtension ? "#f472b6" : "#a78bfa"}>
                        {(lvl.ratio * 100).toFixed(1)}%
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {visiblePrimitives.map((p) => {
            const px = renderPrimitivePixels(p);
            if (!px) return null;
            if (p.toolType === "rectangle") {
              const zone = p as RectangleZone;
              const top = Math.max(zone.p1.price, zone.p2.price);
              const bottom = Math.min(zone.p1.price, zone.p2.price);
              // ĐÃ THÊM: mờ dần theo số lần đã bị test lại — đúng nguyên
              // lý SMC/ICT: vùng bị "cày" nhiều lần thì lệnh chờ tại đó
              // đã cạn dần, không còn nguyên vẹn như lúc mới hình thành.
              const testCount = countZoneTests(currentBars, top, bottom, zone.p1.date);
              const alpha = Math.max(0.03, 0.12 - testCount * 0.025);
              return (
                <g key={p.id}>
                  <rect x={Math.min(px.x1, px.x2)} y={Math.min(px.y1, px.y2)}
                    width={Math.abs(px.x2 - px.x1)} height={Math.abs(px.y2 - px.y1)}
                    fill={`rgba(245,158,11,${alpha})`} stroke="rgba(245,158,11,0.5)" strokeWidth={1} strokeDasharray="4,2" />
                  {testCount > 0 && (
                    <text x={Math.min(px.x1, px.x2) + 2} y={Math.min(px.y1, px.y2) - 2} fontSize="8" fill="#fbbf24">
                      Đã test {testCount} lần
                    </text>
                  )}
                </g>
              );
            }
            if (p.toolType === "trendline") return (
              <line key={p.id} x1={px.x1} y1={px.y1} x2={px.x2} y2={px.y2} stroke="#38bdf8" strokeWidth={1.5} />
            );
            return (
              <g key={p.id}>
                {p.levels.map((lvl, i) => {
                  const y = tv?.priceToPixel(lvl.price);
                  if (y === null || y === undefined) return null;
                  const isExtension = lvl.ratio > 1;
                  return (
                    <g key={i}>
                      <line x1={Math.min(px.x1, px.x2)} y1={y} x2={Math.max(px.x1, px.x2)} y2={y}
                        stroke={isExtension ? "rgba(244,114,182,0.5)" : "rgba(167,139,250,0.5)"} strokeWidth={1} strokeDasharray="2,2" />
                      <text x={Math.max(px.x1, px.x2) + 2} y={y + 3} fontSize="8" fill={isExtension ? "#f472b6" : "#a78bfa"}>{(lvl.ratio * 100).toFixed(1)}%</text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {elliottMarkings.map((marking) => {
            if (!tv) return null;
            const pts = marking.points
              .map((pt) => {
                const x = tv.timeToPixel(pt.date); const y = tv.priceToPixel(pt.price);
                return x !== null && y !== null ? { x, y } : null;
              })
              .filter((p): p is { x: number; y: number } => p !== null);
            if (pts.length < 2) return null;
            const hasViolation = marking.violations.length > 0;
            const strokeColor = hasViolation ? "#f87171" : "#fbbf24";
            const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <g key={marking.id}>
                <polyline points={pointsAttr} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeDasharray={hasViolation ? "4,3" : undefined} />
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={9} fill="#0F1420" stroke={strokeColor} strokeWidth={1.5} />
                    <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill={strokeColor}>{marking.labels[i]}</text>
                  </g>
                ))}
                {hasViolation && pts.length > 0 && (
                  <text x={pts[pts.length - 1].x + 12} y={pts[pts.length - 1].y} fontSize="9" fill="#f87171" fontWeight="bold">
                    Vi pham {marking.violations.length} quy tac
                  </text>
                )}
              </g>
            );
          })}

          {elliottDraftPixels.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={8} fill="#0F1420" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="2,1" />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fbbf24">{i}</text>
            </g>
          ))}
          {elliottDraftPixels.length > 1 && (
            <polyline points={elliottDraftPixels.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
          )}
        </svg>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} />
        <VSAPanel signals={vsa} />
        {wyckoffResult && <WyckoffPanel result={wyckoffResult} />}
        <ElliottWavePanelPlaceholder />
      </div>

      {/* ĐÃ THÊM — Backtest CHoCH thật trên chính lịch sử giá mã đang xem
          (tái dùng nguyên lý Pattern Backtest Engine) + điểm tin cậy %
          của Wyckoff — thay "cảm tính" bằng bằng chứng thống kê thật. */}
      {chochBacktest && (
        <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3 mt-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Backtest tín hiệu thật (trên chính mã đang xem)</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-lg p-2">
              <p className="text-slate-400">CHoCH tăng {chochBacktest.bullish.lowSampleWarning && <span className="text-amber-400">(mẫu nhỏ)</span>}</p>
              <p className="text-sm font-black text-sky-400">
                {chochBacktest.bullish.sampleSize} lần
                {chochBacktest.bullish.successRatePct !== null && ` · ${chochBacktest.bullish.successRatePct}% thắng`}
              </p>
              {chochBacktest.bullish.avgReturnPct !== null && (
                <p className="text-slate-500">LN TB {chochBacktest.bullish.avgReturnPct > 0 ? "+" : ""}{chochBacktest.bullish.avgReturnPct}%</p>
              )}
            </div>
            <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)" }} className="rounded-lg p-2">
              <p className="text-slate-400">CHoCH giảm {chochBacktest.bearish.lowSampleWarning && <span className="text-amber-400">(mẫu nhỏ)</span>}</p>
              <p className="text-sm font-black text-red-400">
                {chochBacktest.bearish.sampleSize} lần
                {chochBacktest.bearish.successRatePct !== null && ` · ${chochBacktest.bearish.successRatePct}% thắng`}
              </p>
              {chochBacktest.bearish.avgReturnPct !== null && (
                <p className="text-slate-500">LN TB {chochBacktest.bearish.avgReturnPct > 0 ? "+" : ""}{chochBacktest.bearish.avgReturnPct}%</p>
              )}
            </div>
          </div>
          <p className="text-[8px] text-slate-600 mt-2">
            Đo lợi nhuận 10 phiên sau mỗi lần CHoCH xảy ra trong lịch sử — mẫu &lt; 5 lần không đủ tin cậy thống kê.
          </p>
        </div>
      )}

      <OscillatorPanel rsi={rsiResult} macd={macdResult} adx={adxResult} />

      <PatternList onSelectPattern={handleSelectPattern} />
      <ConvergenceFilterPanel onSelectTicker={(t) => onRequestTickerChange?.(t)} />
      <AISignalLogPanel log={log} />
    </div>
  );
}
