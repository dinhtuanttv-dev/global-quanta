"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { TVChartManager } from "../../../lib/ta-command-center/TVChartManager";
import { AnalysisController } from "../../../lib/ta-command-center/AnalysisController";
import DrawingPalette from "./DrawingPalette";
import LayerToggleBar from "./LayerToggleBar";
import AISignalLogPanel from "./AISignalLogPanel";
import TimeframeSelector from "./TimeframeSelector";
import PatternList from "./PatternList";
import { SMCPanel, VSAPanel, ElliottWavePanelPlaceholder, WyckoffPanelPlaceholder } from "./MethodPanels";
import type { OhlcvBar, PatternMatch } from "../../../lib/ta-command-center/types";
import type { DrawingToolType, DrawnPrimitive } from "../../../lib/ta-command-center/DrawingManager";
import type { LayerState, LayerKey } from "../../../lib/ta-command-center/LayerManager";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "../../../lib/ta-command-center/detectors/smcDetector";
import type { VSASignal } from "../../../lib/ta-command-center/detectors/vsaDetector";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";

interface Props {
  bars: OhlcvBar[];
  ticker: string;
  onRequestTickerChange?: (ticker: string) => void;
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
  const [smc, setSmc] = useState<{ obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] }>({ obs: [], fvgs: [], bos: [] });
  const [vsa, setVsa] = useState<VSASignal[]>([]);
  const [timeframe, setTimeframeState] = useState<Timeframe>("D");
  const [currentBars, setCurrentBars] = useState<OhlcvBar[]>(bars);
  const [highlightRange, setHighlightRange] = useState<{ start: string; end: string } | null>(null);
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
    const unsubLayers = controller.onLayersChanged(setLayerState);
    const unsubTf = controller.onTimeframeChanged(({ timeframe: tf, bars: newBars }: { timeframe: Timeframe; bars: OhlcvBar[] }) => {
      setTimeframeState(tf);
      setCurrentBars(newBars);
      tvManagerRef.current?.setData(newBars);
    });
    const unsubRange = tvManagerRef.current?.onVisibleRangeChange(() => forceTick((t) => t + 1)) ?? (() => {});

    setPrimitives(controller.drawing.getPrimitives());
    setLog(controller.getLog());
    setSmc(controller.getSmc());
    setVsa(controller.getVsa());
    setLayerState(controller.getLayerState());
    setTimeframeState(controller.getCurrentTimeframe());

    return () => { unsubPrim(); unsubLog(); unsubSmc(); unsubVsa(); unsubLayers(); unsubTf(); unsubRange(); };
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

  useEffect(() => {
    if (!tvManagerRef.current || !layerState) return;
    const markers: { time: string; position: "aboveBar" | "belowBar"; color: string; shape: "arrowUp" | "arrowDown" | "circle"; text: string }[] = [];
    if (layerState.smc) {
      smc.obs.forEach((ob) => markers.push({ time: ob.date, position: ob.type === "bullish" ? "belowBar" : "aboveBar", color: ob.type === "bullish" ? "#34d399" : "#f87171", shape: "circle", text: `OB${ob.type === "bullish" ? "+" : "-"}` }));
      smc.bos.forEach((b) => markers.push({ time: b.date, position: b.type === "bullish" ? "belowBar" : "aboveBar", color: b.type === "bullish" ? "#38bdf8" : "#fb923c", shape: b.type === "bullish" ? "arrowUp" : "arrowDown", text: "BOS" }));
    }
    if (layerState.vsa) {
      vsa.forEach((v) => markers.push({ time: v.date, position: "aboveBar", color: v.type === "Stopping Volume" ? "#a78bfa" : v.type === "Climax" ? "#fbbf24" : "#64748b", shape: "circle", text: v.type.slice(0, 4) }));
    }
    markers.sort((a, b) => a.time.localeCompare(b.time));
    tvManagerRef.current.setMarkers(markers);
  }, [smc, vsa, layerState]);

  const handleTimeframeChange = (tf: Timeframe) => {
    controllerRef.current?.setTimeframe(tf);
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

  const renderPrimitivePixels = (p: DrawnPrimitive) => {
    if (!tv) return null;
    const x1 = tv.timeToPixel(p.p1.date); const y1 = tv.priceToPixel(p.p1.price);
    const x2 = tv.timeToPixel(p.p2.date); const y2 = tv.priceToPixel(p.p2.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { x1, y1, x2, y2 };
  };

  const visiblePrimitives = useMemo(() => {
    if (!layerState) return [];
    return primitives.filter((p) => {
      if (p.toolType === "trendline") return layerState.trendline;
      if (p.toolType === "rectangle") return layerState.demandzone;
      return true;
    });
  }, [primitives, layerState]);

  const smcOverlayRects = useMemo(() => {
    if (!tv || !layerState?.smc) return [];
    const rects: { key: string; x1: number; x2: number; y1: number; y2: number; color: string; label: string }[] = [];
    smc.obs.forEach((ob, i) => {
      const x1 = tv.timeToPixel(ob.date); if (x1 === null) return;
      const y1 = tv.priceToPixel(ob.top); const y2 = tv.priceToPixel(ob.bottom);
      if (y1 === null || y2 === null) return;
      rects.push({ key: `ob-${i}`, x1, x2: x1 + 40, y1, y2, color: ob.type === "bullish" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)", label: `OB ${ob.type === "bullish" ? "up" : "down"}` });
    });
    smc.fvgs.forEach((fvg, i) => {
      const x1 = tv.timeToPixel(fvg.startDate); const x2 = tv.timeToPixel(fvg.endDate);
      if (x1 === null || x2 === null) return;
      const y1 = tv.priceToPixel(fvg.top); const y2 = tv.priceToPixel(fvg.bottom);
      if (y1 === null || y2 === null) return;
      rects.push({ key: `fvg-${i}`, x1, x2, y1, y2, color: fvg.type === "bullish" ? "rgba(56,189,248,0.12)" : "rgba(251,146,60,0.12)", label: "FVG" });
    });
    return rects;
  }, [tv, smc, layerState]);

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
        <DrawingPalette activeTool={activeTool} onSelectTool={setActiveTool} />
        {primitives.length > 0 && (
          <button onClick={() => controllerRef.current?.drawing.clearAll()}
            className="absolute top-3 right-3 z-10 text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg">
            <Trash2 className="w-3 h-3" /> Xoa ({primitives.length})
          </button>
        )}
        <div ref={chartContainerRef}
          style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", minHeight: 400 }}
          className="rounded-xl overflow-hidden relative w-full" />
        <svg className="absolute inset-0 w-full h-full" style={{ cursor: activeTool ? "crosshair" : "default" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (isDrawingRef.current) { controllerRef.current?.drawing.cancelDraw(); isDrawingRef.current = false; } }}>

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

          {visiblePrimitives.map((p) => {
            const px = renderPrimitivePixels(p);
            if (!px) return null;
            if (p.toolType === "rectangle") return (
              <rect key={p.id} x={Math.min(px.x1, px.x2)} y={Math.min(px.y1, px.y2)}
                width={Math.abs(px.x2 - px.x1)} height={Math.abs(px.y2 - px.y1)}
                fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.5)" strokeWidth={1} strokeDasharray="4,2" />
            );
            if (p.toolType === "trendline") return (
              <line key={p.id} x1={px.x1} y1={px.y1} x2={px.x2} y2={px.y2} stroke="#38bdf8" strokeWidth={1.5} />
            );
            return (
              <g key={p.id}>
                {p.levels.map((lvl, i) => {
                  const y = tv?.priceToPixel(lvl.price);
                  if (y === null || y === undefined) return null;
                  return <line key={i} x1={Math.min(px.x1, px.x2)} y1={y} x2={Math.max(px.x1, px.x2)} y2={y} stroke="rgba(167,139,250,0.5)" strokeWidth={1} strokeDasharray="2,2" />;
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} />
        <VSAPanel signals={vsa} />
        <ElliottWavePanelPlaceholder />
        <WyckoffPanelPlaceholder />
      </div>

      <PatternList onSelectPattern={handleSelectPattern} />
      <AISignalLogPanel log={log} />
    </div>
  );
}
