"use client";

// Biểu đồ TA VN-Index — P3 (TA_VNINDEX_UPGRADE_SPEC §2.1.1):
//   - Lightweight Charts v5: pane giá · khối lượng · RSI14; lớp phủ canvas (OverlayPrimitive) cắt đúng trong vùng giá,
//     tự theo zoom/pan, tối đa 12 nhãn không chồng nhau — thay lớp SVG + forceTick cũ.
//   - Pointer Events: vẽ bằng chuột, cảm ứng, bút (khoá kéo/zoom biểu đồ khi đang vẽ).
//   - quant-core chạy trong Web Worker (AnalysisController); hình vẽ lưu theo mã + tài khoản (chartDrawingsStore).
import { useRef, useEffect, useState, useMemo } from "react";
import { Trash2, XCircle } from "lucide-react";
import { TVChartManager, type ChartMarkerInput } from "../../../lib/ta-command-center/TVChartManager";
import { AnalysisController, EMPTY_SMC, type ChochBacktest, type SmcState } from "../../../lib/ta-command-center/AnalysisController";
import { buildScene } from "../../../lib/ta-command-center/chart/buildScene";
import { GQ_COLORS } from "../../../lib/ta-command-center/chart/scene";
import { loadCloud, loadLocal, pickNewer, saveCloud, saveLocal } from "../../../lib/ta-command-center/chartDrawingsStore";
import DrawingPalette from "./DrawingPalette";
import LayerToggleBar from "./LayerToggleBar";
import AISignalLogPanel from "./AISignalLogPanel";
import TimeframeSelector from "./TimeframeSelector";
import OscillatorPanel from "./OscillatorPanel";
import SmartNotePanel from "./SmartNotePanel";
import BacktestPanel from "./BacktestPanel";
import { SMCPanel, VSAPanel, WyckoffPanel, ElliottWavePanelPlaceholder } from "./MethodPanels";
import { TA_INDICES } from "./TickerSelector";
import type { WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import { calculateRSI, calculateMACD, calculateADX } from "../../../lib/ta-command-center/detectors/technicalOscillators";
import type { OhlcvBar, PatternMatch } from "../../../lib/ta-command-center/types";
import type { DrawingToolType, DrawnPrimitive, DomainPoint } from "../../../lib/ta-command-center/DrawingManager";
import type { LayerState, LayerKey } from "../../../lib/ta-command-center/LayerManager";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";
import { suggestElliottPoints } from "../../../lib/ta-command-center/detectors/zigzagSuggest";
import type { VsaSignal } from "../../../lib/quant-core";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";
import type { CorporateActionMark } from "../../../hooks/useTaSeries";

interface Props {
  bars: OhlcvBar[];
  ticker: string;
  onRequestTickerChange?: (ticker: string) => void;
  /** Mẫu hình vừa chọn ở Pattern Scanner (tầng cha) — khoanh vùng ngày trên biểu đồ. */
  highlightPattern?: PatternMatch | null;
  /** Ngày GDKHQ đã điều chỉnh trong chuỗi giá (Gateway /ta-series) — đánh dấu ■ trên biểu đồ. */
  corporateActions?: CorporateActionMark[];
}

const NO_ACTIONS: CorporateActionMark[] = [];
const VSA_LABEL: Record<string, string> = {
  "Selling Climax": "SC", "Buying Climax": "BC", "Stopping Volume": "SV", "No Demand": "ND", "No Supply": "NS",
  Upthrust: "UT", Shakeout: "SO", Absorption: "ABS",
};
const SAVE_DEBOUNCE_MS = 1000;

export default function TVChartPanel({ bars, ticker, highlightPattern, corporateActions = NO_ACTIONS }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tvManagerRef = useRef<TVChartManager | null>(null);
  const controllerRef = useRef<AnalysisController | null>(null);
  const drawingPointerRef = useRef<number | null>(null);
  const loadedSymbolRef = useRef<string | null>(null);
  // Nội dung đã nạp/lưu gần nhất — chỉ lưu khi người dùng thật sự đổi hình vẽ (tránh ghi đè bản đám mây bằng bản cũ).
  const persistedRef = useRef<string>("[]");

  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null);
  const [primitives, setPrimitives] = useState<DrawnPrimitive[]>([]);
  const [layerState, setLayerState] = useState<LayerState | null>(null);
  const [log, setLog] = useState<SignalLogEntry[]>([]);
  const [smc, setSmc] = useState<SmcState>(EMPTY_SMC);
  const [vsa, setVsa] = useState<VsaSignal[]>([]);
  const [wyckoffResult, setWyckoffResult] = useState<WyckoffResult | null>(null);
  const [chochBacktest, setChochBacktest] = useState<ChochBacktest | null>(null);
  const [draftPrimitive, setDraftPrimitive] = useState<{ toolType: DrawingToolType; p1: DomainPoint; p2: DomainPoint } | null>(null);
  const [timeframe, setTimeframeState] = useState<Timeframe>("D");
  const [currentBars, setCurrentBars] = useState<OhlcvBar[]>(bars);
  const [highlightRange, setHighlightRange] = useState<{ start: string; end: string } | null>(null);
  const [elliottDraft, setElliottDraft] = useState<DomainPoint[]>([]);
  const [fibExtensionMode, setFibExtensionMode] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "local" | "cloud">("idle");

  const rsiResult = useMemo(() => calculateRSI(currentBars), [currentBars]);
  const macdResult = useMemo(() => calculateMACD(currentBars), [currentBars]);
  const adxResult = useMemo(() => calculateADX(currentBars), [currentBars]);

  // ---- Khởi tạo / cập nhật bộ điều phối + biểu đồ khi dữ liệu đổi ----
  useEffect(() => {
    if (bars.length === 0) return;
    const isIndex = TA_INDICES.some((x) => x.symbol === ticker);
    if (!controllerRef.current) controllerRef.current = new AnalysisController(bars, { isIndex });
    else controllerRef.current.updateDailyBars(bars, { isIndex });
    const controller = controllerRef.current;
    const activeBars = controller.getCurrentBars();
    setCurrentBars(activeBars);

    if (!tvManagerRef.current && chartContainerRef.current) {
      tvManagerRef.current = new TVChartManager(chartContainerRef.current, activeBars, { rsi: calculateRSI(activeBars).series });
    } else if (tvManagerRef.current) {
      tvManagerRef.current.setData(activeBars, calculateRSI(activeBars).series);
    }

    const unsubs = [
      controller.onPrimitivesUpdated(setPrimitives),
      controller.onLogUpdated(setLog),
      controller.onSmcUpdated((s) => { setSmc(s); setChochBacktest(controller.getChochBacktest()); }),
      controller.onVsaUpdated(setVsa),
      controller.onWyckoffUpdated(setWyckoffResult),
      controller.onLayersChanged(setLayerState),
      controller.onTimeframeChanged(({ timeframe: tf, bars: newBars }) => {
        setTimeframeState(tf);
        setCurrentBars(newBars);
        tvManagerRef.current?.setData(newBars, calculateRSI(newBars).series);
      }),
      controller.drawing.on("elliott:draft-updated", setElliottDraft),
      controller.drawing.on("fibExtension:changed", setFibExtensionMode),
      controller.drawing.on("primitive:draft-updated", setDraftPrimitive),
    ];
    setPrimitives(controller.drawing.getPrimitives());
    setLog(controller.getLog());
    setSmc(controller.getSmc());
    setVsa(controller.getVsa());
    setWyckoffResult(controller.getWyckoff());
    setChochBacktest(controller.getChochBacktest());
    setLayerState(controller.getLayerState());
    setTimeframeState(controller.getCurrentTimeframe());
    setElliottDraft(controller.drawing.getElliottDraft());
    setFibExtensionMode(controller.drawing.getFibExtensionMode());
    return () => unsubs.forEach((u) => u());
  }, [bars, ticker]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      const h = entries[0]?.contentRect.height;
      if (w && h && tvManagerRef.current) tvManagerRef.current.resize(w, h);
    });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    tvManagerRef.current?.destroy(); tvManagerRef.current = null;
    controllerRef.current?.destroy(); controllerRef.current = null;
  }, []);

  // ---- Hình vẽ theo mã + tài khoản: nạp khi đổi mã, lưu (gom 1 giây) khi thay đổi ----
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !bars.length) return;
    let cancelled = false;
    loadedSymbolRef.current = null;
    const local = loadLocal(ticker);
    persistedRef.current = JSON.stringify(local.primitives);
    controller.drawing.replaceAll(local.primitives);
    loadedSymbolRef.current = ticker;
    void loadCloud(ticker).then((cloud) => {
      if (cancelled || !cloud) return;
      const best = pickNewer(local, cloud);
      if (best !== local) {
        persistedRef.current = JSON.stringify(best.primitives);
        controller.drawing.replaceAll(best.primitives);
        saveLocal(ticker, best.primitives, best.updatedAt ?? undefined);
        setSaveState("cloud");
      }
    });
    return () => { cancelled = true; };
  }, [ticker, bars.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loadedSymbolRef.current !== ticker) return;
    const json = JSON.stringify(primitives);
    if (json === persistedRef.current) return;
    const symbol = ticker;
    const timer = setTimeout(() => {
      persistedRef.current = json;
      saveLocal(symbol, primitives);
      setSaveState("local");
      void saveCloud(symbol, primitives).then((at) => { if (at) setSaveState("cloud"); });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [primitives]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Marker: sự kiện quyền, BOS/CHoCH, Sweep, VSA ----
  useEffect(() => {
    if (!tvManagerRef.current || !layerState) return;
    const markers: ChartMarkerInput[] = [];
    const visibleDates = new Set(currentBars.map((b) => b.date));
    corporateActions.forEach((c) => {
      if (timeframe === "D" && visibleDates.has(c.date)) markers.push({ time: c.date, position: "belowBar", color: GQ_COLORS.amber, shape: "square", text: c.label });
    });
    if (layerState.smc) {
      smc.bos.forEach((b) => markers.push({ time: b.date, position: b.type === "bullish" ? "belowBar" : "aboveBar", color: b.type === "bullish" ? GQ_COLORS.bull : GQ_COLORS.bear, shape: b.type === "bullish" ? "arrowUp" : "arrowDown", text: "" })); // BOS: chỉ mũi tên — nhãn chữ do lớp phủ quản lý ngân sách
      smc.choch.forEach((c) => markers.push({ time: c.date, position: c.type === "bullish" ? "belowBar" : "aboveBar", color: GQ_COLORS.amber, shape: "circle", text: "CHoCH" }));
      smc.liquidity.forEach((l) => {
        if (l.state === "SWEPT" && l.stateDate) markers.push({ time: l.stateDate, position: l.type === "EQL" ? "belowBar" : "aboveBar", color: GQ_COLORS.uv, shape: l.type === "EQL" ? "arrowUp" : "arrowDown", text: l.type === "EQL" ? "SSL Sweep" : "BSL Sweep" });
      });
    }
    if (layerState.vsa) {
      vsa.forEach((v) => markers.push({
        time: v.date, position: v.dir === "bullish" ? "belowBar" : "aboveBar",
        color: v.dir === "bullish" ? GQ_COLORS.bull : v.dir === "bearish" ? GQ_COLORS.bear : GQ_COLORS.uv, shape: "circle", text: VSA_LABEL[v.type] ?? v.type.slice(0, 4),
      }));
    }
    tvManagerRef.current.setMarkers(markers.filter((m) => visibleDates.has(m.time)));
  }, [smc, vsa, layerState, corporateActions, currentBars, timeframe]);

  // ---- Lớp phủ canvas ----
  const scene = useMemo(() => buildScene({
    bars: currentBars, smc, wyckoff: wyckoffResult, layers: layerState, primitives, draft: draftPrimitive,
    elliottDraft, fibExtension: fibExtensionMode, highlight: highlightRange,
  }), [currentBars, smc, wyckoffResult, layerState, primitives, draftPrimitive, elliottDraft, fibExtensionMode, highlightRange]);
  useEffect(() => { tvManagerRef.current?.setScene(scene); }, [scene]);

  useEffect(() => {
    if (!highlightPattern) return;
    setHighlightRange({ start: highlightPattern.dateRangeStart, end: highlightPattern.dateRangeEnd });
    controllerRef.current?.logPatternConfluence(highlightPattern);
  }, [highlightPattern]);

  // Khoá kéo/zoom biểu đồ khi đang chọn công cụ vẽ (để thao tác chạm/kéo vẽ hình thay vì cuộn biểu đồ).
  useEffect(() => { tvManagerRef.current?.setInteractionLocked(activeTool !== null); }, [activeTool]);

  const handleTimeframeChange = (tf: Timeframe) => controllerRef.current?.setTimeframe(tf);
  const handleToggleFibExtension = () => controllerRef.current?.drawing.setFibExtensionMode(!fibExtensionMode);
  const handleSuggestElliott = () => {
    if (!controllerRef.current) return;
    const points = suggestElliottPoints(currentBars);
    if (!points) { window.alert("Chưa đủ dữ liệu đỉnh/đáy rõ ràng để gợi ý sóng Elliott cho mã này."); return; }
    controllerRef.current.drawing.createElliottFromPoints(points);
    if (layerState && !layerState.elliott) controllerRef.current.layers.toggle("elliott");
  };

  // ---- Pointer Events (chuột · cảm ứng · bút) ----
  const toDomain = (e: React.PointerEvent) => tvManagerRef.current?.clientToDomain(e.clientX, e.clientY) ?? null;
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!activeTool || !controller) return;
    const point = toDomain(e);
    if (!point) return;
    e.preventDefault();
    if (activeTool === "elliott") {
      controller.drawing.addElliottPoint(point);
      if (controller.drawing.getElliottDraft().length === 0) {
        setActiveTool(null);
        if (layerState && !layerState.elliott) controller.layers.toggle("elliott");
      }
      return;
    }
    if (activeTool === "fibTimeZone") { controller.drawing.addFibTimeZone(point); setActiveTool(null); return; }
    drawingPointerRef.current = e.pointerId;
    // Giữ con trỏ để kéo ra ngoài khung vẫn vẽ tiếp; một số trình duyệt di động không cho -> bỏ qua, vẫn vẽ bình thường.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* không bắt được con trỏ */ }
    controller.drawing.startDraw(activeTool, point);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawingPointerRef.current !== e.pointerId) return;
    const point = toDomain(e);
    if (point) controllerRef.current?.drawing.updateDraw(point);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawingPointerRef.current !== e.pointerId) return;
    drawingPointerRef.current = null;
    const point = toDomain(e);
    if (point) controllerRef.current?.drawing.finishDraw(point);
    else controllerRef.current?.drawing.cancelDraw();
    setActiveTool(null);
  };
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawingPointerRef.current !== e.pointerId) return;
    drawingPointerRef.current = null;
    controllerRef.current?.drawing.cancelDraw();
  };

  if (bars.length === 0) return <div className="text-xs text-slate-500 italic py-8 text-center">Chưa có dữ liệu nến cho {ticker}.</div>;

  return (
    <div className="space-y-3">
      <TimeframeSelector current={timeframe} onChange={handleTimeframeChange} />
      {layerState && (
        <LayerToggleBar state={layerState}
          onToggle={(key: LayerKey) => controllerRef.current?.layers.toggle(key)}
          onToggleMaster={(on) => controllerRef.current?.layers.setMaster(on)} />
      )}

      <div className="relative" style={{ height: "70vh", minHeight: 420 }} data-testid="ta-chart">
        <DrawingPalette
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          elliottEnabled={!!layerState?.elliott}
          fibExtensionMode={fibExtensionMode}
          onToggleFibExtension={handleToggleFibExtension}
          onSuggestElliott={handleSuggestElliott}
        />
        {wyckoffResult && (
          <SmartNotePanel ticker={ticker} wyckoff={wyckoffResult} smc={smc} vsa={vsa} rsi={rsiResult} macd={macdResult} adx={adxResult} />
        )}
        <div className="absolute top-3 z-10 flex items-center gap-2" style={{ left: 44 }}>
          {activeTool && (
            <span className="text-[10px] text-cyan-300 bg-slate-900/85 px-2 py-1 rounded-lg" data-testid="drawing-hint">
              Đang vẽ — kéo trên biểu đồ (chạm giữ rồi kéo trên điện thoại) ·{" "}
              <button type="button" className="underline" onClick={() => { controllerRef.current?.drawing.cancelDraw(); setActiveTool(null); }}>Huỷ</button>
            </span>
          )}
          {elliottDraft.length > 0 && (
            <button onClick={() => { controllerRef.current?.drawing.cancelElliottDraft(); setActiveTool(null); }}
              className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg">
              <XCircle className="w-3 h-3" /> Huỷ Elliott ({elliottDraft.length}/6)
            </button>
          )}
          {primitives.length > 0 && (
            <button onClick={() => controllerRef.current?.drawing.clearAll()}
              className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg">
              <Trash2 className="w-3 h-3" /> Xoá hình vẽ ({primitives.length})
            </button>
          )}
          {primitives.length > 0 && saveState !== "idle" && (
            <span className="text-[9px] text-slate-500 bg-slate-900/70 px-1.5 py-0.5 rounded" data-testid="drawings-saved">
              {saveState === "cloud" ? "☁ đã lưu theo tài khoản" : "đã lưu trên máy này"}
            </span>
          )}
        </div>
        <div
          ref={chartContainerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{
            background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", height: "100%",
            cursor: activeTool ? "crosshair" : "default", touchAction: activeTool ? "none" : "auto",
          }}
          className="rounded-xl overflow-hidden relative w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} choch={smc.choch} totals={smc.totals} barCount={currentBars.length} />
        <VSAPanel signals={vsa} />
        {wyckoffResult && <WyckoffPanel result={wyckoffResult} barCount={currentBars.length} />}
        <ElliottWavePanelPlaceholder />
      </div>

      {chochBacktest && <BacktestPanel data={chochBacktest} />}

      <OscillatorPanel rsi={rsiResult} macd={macdResult} adx={adxResult} />

      <AISignalLogPanel log={log} engineOn={!!layerState?.aiDetectionMaster} />
    </div>
  );
}
