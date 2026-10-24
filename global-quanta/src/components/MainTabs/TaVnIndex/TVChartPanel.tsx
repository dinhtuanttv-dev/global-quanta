"use client";

// Biểu đồ TA VN-Index — P3 (TA_VNINDEX_UPGRADE_SPEC §2.1.1):
//   - Lightweight Charts v5: pane giá · khối lượng · RSI14; lớp phủ canvas (OverlayPrimitive) cắt đúng trong vùng giá,
//     tự theo zoom/pan, tối đa 12 nhãn không chồng nhau — thay lớp SVG + forceTick cũ.
//   - Pointer Events: vẽ bằng chuột, cảm ứng, bút (khoá kéo/zoom biểu đồ khi đang vẽ).
//   - quant-core chạy trong Web Worker (AnalysisController); hình vẽ lưu theo mã + tài khoản (chartDrawingsStore).
//   - MẶC ĐỊNH TẮT mọi chỉ báo/công cụ (chỉ có nến); bật lớp nào mới vẽ lớp đó. Mọi thứ là series/marker/primitive
//     của thư viện -> kéo chuột, cuộn, zoom và BÀN PHÍM (← → + − Home End) đều di chuyển cùng nến.
import { useRef, useEffect, useState, useMemo, useDeferredValue, type ReactNode } from "react";
import {
  Activity, Camera, ChevronDown, ChevronsRight, Clock3, Command as CommandIcon, Expand, Keyboard, Layers3, LayoutGrid, Magnet, Maximize2, Minimize2,
  Cloud, HardDrive, MoreHorizontal, PanelRight, PencilLine, Redo2, Shapes, Square, Trash2, TrendingUp, Undo2, Waves, XCircle, ZoomIn, ZoomOut,
} from "lucide-react";
import "./workspace/workspace.css";
import { useCloudState, useWorkspace, workspaceStore } from "./workspace/workspaceStore";
import { PRESETS, fullLayers, layersToSave, matchPreset, presetLayers, rangeBars, rangesFor, type DockTab, type RangeId } from "./workspace/workspaceModel";
import LayerMenu, { LAYER_GROUPS, LAYER_LABEL } from "./workspace/LayerMenu";
import ObjectList from "./workspace/ObjectList";
import CommandPalette, { ShortcutsDialog, type Command } from "./workspace/CommandPalette";
import ChartLegend from "./workspace/ChartLegend";
import InspectorOverview from "./workspace/InspectorOverview";
import { Modal, Popover, useToasts, useWidth } from "./workspace/ui";
import ProvenanceBadge from "./ProvenanceBadge";
import { hitTest, type HitPart } from "../../../lib/ta-command-center/chart/drawingHit";
import { shiftPrimitive, type PrimitivePatch } from "../../../lib/ta-command-center/DrawingManager";
import type { SceneItem } from "../../../lib/ta-command-center/chart/scene";
import { TVChartManager, type ChartMarkerInput } from "../../../lib/ta-command-center/TVChartManager";
import { AnalysisController, EMPTY_SMC, type ChochBacktest, type SmcState } from "../../../lib/ta-command-center/AnalysisController";
import { buildScene } from "../../../lib/ta-command-center/chart/buildScene";
import { GQ_COLORS } from "../../../lib/ta-command-center/chart/scene";
import { loadCloud, loadLocal, pickNewer, saveCloud, saveLocal } from "../../../lib/ta-command-center/chartDrawingsStore";
import AISignalLogPanel from "./AISignalLogPanel";
import TimeframeSelector from "./TimeframeSelector";
import OscillatorPanel from "./OscillatorPanel";
import SmartNotePanel from "./SmartNotePanel";
import BacktestPanel from "./BacktestPanel";
import { SMCPanel, VSAPanel, WyckoffPanel } from "./MethodPanels";
import ElliottWavePanel, { ElliottDeepPanel } from "./ElliottWavePanel";
import { ElliottCountEditor, ElliottCountHistory, useElliottUserCounts, useUndo } from "./ElliottCountEditor";
import ElliottAlertsPanel from "./ElliottAlertsPanel";
import ElliottProPanel from "./ElliottProPanel";
import { COUNT_LABELS, displayStatus, draftFromState, newVersionId, snapToCandle, validateUserCount, type UserCountPoint, type UserCountVersion } from "../../../lib/quant-core/elliott/userCount";
import { TA_INDICES } from "./TickerSelector";
import type { WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import { calculateRSI, calculateMACD, calculateADX } from "../../../lib/ta-command-center/detectors/technicalOscillators";
import type { OhlcvBar, PatternMatch } from "../../../lib/ta-command-center/types";
import type { DrawingToolType, DrawnPrimitive, DomainPoint } from "../../../lib/ta-command-center/DrawingManager";
import type { AnalysisController as Controller } from "../../../lib/ta-command-center/AnalysisController";
import type { LayerState, LayerKey } from "../../../lib/ta-command-center/LayerManager";
import { usePatternDetail } from "../../../hooks/usePatterns";
import { toChartWeekly } from "../../../lib/ta-command-center/chart/pringScene";
import { structureLevels, structureMarkers, structureSceneItems, structureTfFor, type StructureMode } from "../../../lib/ta-command-center/chart/structureScene";
import { useStructure, STAGE_SHORT, VERDICT_TONE, verdictText } from "../../../hooks/useStructure";
import StructurePanel from "./StructurePanel";
import { STRUCTURE_OPEN_EVENT } from "./StructureCells";
import { REPLAY_MIN_BARS, replayDoc } from "../../../lib/ta-command-center/chart/structureReplay";
import { mondayOf } from "../../../lib/ta-command-center/chart/pringScene";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";
import { suggestElliottPoints } from "../../../lib/ta-command-center/detectors/zigzagSuggest";
import type { VsaSignal } from "../../../lib/quant-core";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";
import type { CorporateActionMark, PriceBasis } from "../../../hooks/useTaSeries";
import { useTaIntraday } from "../../../hooks/useTaIntraday";
import { useTaFlow, type ForeignDay } from "../../../hooks/useTaFlow";
import OrderFlowPanel from "./OrderFlowPanel";
import { aggregateToWeekly, isIntradayTf } from "../../../lib/ta-command-center/TimeframeController";
import { elliottMtf } from "../../../lib/quant-core/elliott/mtf";
import { elliottOscData, type ElliottState } from "../../../lib/quant-core/elliott";
import { elliottProjection } from "../../../lib/quant-core/elliott/projection";
import { intradayElliottState } from "../../../lib/quant-core/elliott/intraday";
import { buildWaveTree } from "../../../lib/quant-core/elliott/v3/waveTree";
import { evaluateLifecycle, scenariosFromTree } from "../../../lib/quant-core/elliott/v3/scenarios";
import { ELLIOTT_PRO_MODES, elliottProSummary, type ElliottProMode } from "../../../lib/ta-command-center/chart/elliottProScene";
import { elliottCountPoints } from "../../../lib/ta-command-center/chart/elliottScene";
import type { Analysis } from "../../../lib/quant-core";

interface Props {
  bars: OhlcvBar[];
  ticker: string;
  onRequestTickerChange?: (ticker: string) => void;
  /** Mẫu hình vừa chọn ở Pattern Scanner (tầng cha) — khoanh vùng ngày trên biểu đồ. */
  highlightPattern?: PatternMatch | null;
  /** Ngày GDKHQ đã điều chỉnh trong chuỗi giá (Gateway /ta-series) — đánh dấu ■ trên biểu đồ. */
  corporateActions?: CorporateActionMark[];
  /** Nến ngày VN-Index — so sánh sức mạnh tương đối trong 9 phép thử Wyckoff (bỏ qua khi đang xem chỉ số). */
  benchmarkBars?: OhlcvBar[] | null;
  /** Super Chart: ô chọn mã đặt trong thanh đầu của workspace. */
  tickerSlot?: ReactNode;
  /** Super Chart: nguồn gốc dữ liệu (cơ sở giá, số phiên, khoảng ngày, cảnh báo) — hiện trong thanh đầu. */
  dataContext?: { priceBasis: PriceBasis; label: string; warnings: string[] } | null;
  /** Super Chart SC4: khoanh vùng mẫu hình được chọn ở bộ lọc (Pattern Scanner v2). */
  highlight?: ChartHighlight | null;
}

export interface ChartHighlight { start: string; end: string; label: string; n: number }
const DOCK_TABS: { id: DockTab; label: string }[] = [
  { id: "structure", label: "Cấu trúc MTF" }, { id: "elliott", label: "Elliott Pro" }, { id: "methods", label: "SMC · VSA · Wyckoff" },
  { id: "flow", label: "Dòng tiền" }, { id: "indicators", label: "Chỉ báo" }, { id: "backtest", label: "Backtest" }, { id: "log", label: "Nhật ký tín hiệu" },
];
const TOOLS: { id: DrawingToolType; label: string; short: string; icon: typeof Square; key: string }[] = [
  { id: "trendline", label: "Trendline", short: "Trend", icon: TrendingUp, key: "Alt+T" },
  { id: "rectangle", label: "Zone", short: "Zone", icon: Square, key: "Alt+R" },
  { id: "fibonacci", label: "Fibonacci", short: "Fib", icon: Activity, key: "Alt+F" },
  { id: "fibTimeZone", label: "Fibonacci Time Zones (1 click)", short: "Fib time", icon: Clock3, key: "Alt+Z" },
];

const NO_ACTIONS: CorporateActionMark[] = [];
const VSA_LABEL: Record<string, string> = {
  "Selling Climax": "SC", "Buying Climax": "BC", "Stopping Volume": "SV", "No Demand": "ND", "No Supply": "NS",
  Upthrust: "UT", Shakeout: "SO", Absorption: "ABS",
};
const SAVE_DEBOUNCE_MS = 1000;
const STRUCTURE_MODE_KEY = "gq:structureMode";
const readStructureMode = (): StructureMode => {
  try { const v = window.localStorage.getItem(STRUCTURE_MODE_KEY); return v === "trade" || v === "deep" ? v : "overview"; } catch { return "overview"; }
};
const VERDICT_CHIP = { bull: "text-emerald-300 border-emerald-400/40", bear: "text-rose-300 border-rose-400/40", warn: "text-amber-300 border-amber-400/40", neutral: "text-cyan-200 border-cyan-400/30" } as const;

/** Gợi ý vẽ Elliott từ engine: 6 điểm 0–5 của kịch bản chính (điểm 5 chưa có -> cực trị nến cuối, tạm). null nếu không đủ. */
export function engineElliottPoints(st: ElliottState | null, bars: OhlcvBar[]): DomainPoint[] | null {
  const cnt = st?.scenario ? elliottCountPoints(st) : null;
  if (!cnt || !bars.length) return null;
  const pts = cnt.points.slice(0, 6).map((p) => ({ date: p.date, price: p.price }));
  if (pts.length === 5) {
    const last = bars[bars.length - 1];
    if (last.date <= pts[4].date) return null;
    pts.push({ date: last.date, price: st!.dir === "up" ? last.high : last.low });
  }
  const dates = new Set(bars.map((b) => b.date));
  return pts.length === 6 && pts.every((p) => dates.has(p.date)) ? pts : null;
}

/** Hình vẽ tay thuộc lớp nào: vẽ xong / nạp hình đã lưu -> tự bật lớp đó (mặc định các lớp đều tắt). */
const LAYER_OF_TOOL: Partial<Record<DrawnPrimitive["toolType"], "trendline" | "demandzone" | "elliott">> = {
  trendline: "trendline", rectangle: "demandzone", elliott: "elliott",
};
function enableLayersFor(controller: Controller, list: DrawnPrimitive[]) {
  for (const p of list) {
    const layer = LAYER_OF_TOOL[p.toolType];
    if (layer) controller.layers.enable(layer);
  }
}

export default function TVChartPanel({ bars, ticker, onRequestTickerChange, highlightPattern, corporateActions = NO_ACTIONS, benchmarkBars = null, tickerSlot, dataContext = null, highlight = null }: Props) {
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
  // P4: khung intraday — chỉ tải nến phút khi người dùng chọn 1m/5m/15m/1H lần đầu; khung chờ áp dụng khi dữ liệu về.
  const [wantIntraday, setWantIntraday] = useState(false);
  const [pendingTf, setPendingTf] = useState<Timeframe | null>(null);
  const [volumeExtras, setVolumeExtras] = useState<{ profile: Analysis["profile"]; avwap: Analysis["avwap"]; orderFlow: Analysis["orderFlow"] } | null>(null);
  const orderFlow = volumeExtras?.orderFlow ?? null;
  const [currentBars, setCurrentBars] = useState<OhlcvBar[]>(bars);
  const [highlightRange, setHighlightRange] = useState<{ start: string; end: string } | null>(null);
  const [elliottDraft, setElliottDraft] = useState<DomainPoint[]>([]);
  const [fibExtensionMode, setFibExtensionMode] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "local" | "cloud">("idle");
  // ---- Super Chart: bố cục (theo tài khoản), lựa chọn hình vẽ, bảng lệnh, toàn màn hình ----
  const [ws, setWs] = useWorkspace();
  const cloudState = useCloudState();
  const [wsRef, wsWidth] = useWidth<HTMLElement>();
  const toasts = useToasts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "draw" | "layers" | "objects" | "more">(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [rangeId, setRangeId] = useState<RangeId | null>(null);
  // Di động: dock mặc định thu gọn (chỉ hàng tab) để các bộ lọc ở ngay dưới; chạm tab mới mở.
  const [mobileDockOpen, setMobileDockOpen] = useState(false);
  const [elliottTabReq, setElliottTabReq] = useState<{ tab: string; n: number } | null>(null);
  const [tvApi, setTvApi] = useState<TVChartManager | null>(null);
  const dragRef = useRef<{ id: string; part: HitPart; start: DomainPoint; orig: DrawnPrimitive; pointerId: number; moved: boolean } | null>(null);
  const layersRestoredRef = useRef(false);
  const dockRef = useRef<HTMLElement>(null);
  // E5 — Elliott: engine GET hai khung (tuần gộp từ chuỗi ngày), bản nháp "Gợi ý", bảng phân tích chi tiết.
  const mtf = useMemo(() => (bars.length >= 60 ? elliottMtf(bars) : null), [bars]);
  const weeklyBars = useMemo(() => aggregateToWeekly(bars), [bars]);
  const [elliottDetail, setElliottDetail] = useState(false);
  // DW1: cách đếm đang vẽ (0 = chính, 1–2 = phương án) — về "chính" khi đổi mã / khung / dữ liệu.
  const [elliottPick, setElliottPick] = useState(0);
  useEffect(() => { setElliottPick(0); }, [ticker, timeframe, mtf]); // eslint-disable-line react-hooks/exhaustive-deps
  // DW8: cách đếm chỉnh tay của tài khoản (theo mã + khung D/W) + trạng thái chỉnh sửa.
  const countTf = timeframe === "W" ? "W" : timeframe === "1H" || timeframe === "15m" ? timeframe : "D";
  const userCounts = useElliottUserCounts(ticker, countTf);
  const [countEditing, setCountEditing] = useState(false);
  const [countPlacing, setCountPlacing] = useState<number | null>(null);
  const countDraft = useUndo<UserCountPoint[]>([]);
  useEffect(() => { setCountEditing(false); setCountPlacing(null); }, [ticker, timeframe]);
  // T5 — Cấu trúc MTF: chỉ tải khi bật lớp; chế độ hiển thị nhớ trên máy.
  const [structureMode, setStructureModeState] = useState<StructureMode>(readStructureMode);
  const setStructureMode = (m: StructureMode) => { setStructureModeState(m); try { window.localStorage.setItem(STRUCTURE_MODE_KEY, m); } catch { /* bỏ qua */ } };
  const structurePanelRef = useRef<HTMLDivElement>(null);
  const structureOn = Boolean(layerState?.structure);
  const structure = useStructure(structureOn ? ticker : null);
  // T6 — phát lại: chỉ số nến NGÀY; tính lại cấu trúc trên trình duyệt với dữ liệu tới phiên đó.
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  useEffect(() => { setReplayIdx(null); }, [ticker]);
  const replayIdxDeferred = useDeferredValue(replayIdx);
  const replayOn = structureOn && replayIdxDeferred != null && (timeframe === "D" || timeframe === "W");
  const replayed = useMemo(() => (replayOn ? replayDoc(bars, replayIdxDeferred as number, structure.data, ticker) : null),
    [replayOn, bars, replayIdxDeferred, structure.data, ticker]);
  const structureDoc = replayed ?? structure.data;
  const replayAsOf = replayed && replayIdxDeferred != null ? (timeframe === "W" ? mondayOf(bars[replayIdxDeferred].date) : bars[replayIdxDeferred].date) : undefined;

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
      tvManagerRef.current = new TVChartManager(chartContainerRef.current, activeBars);
      const saved = workspaceStore.getSnapshot();
      tvManagerRef.current.applyPaneStretch(saved.paneStretch);
      tvManagerRef.current.setMagnet(saved.magnet);
      setTvApi(tvManagerRef.current);
    } else if (tvManagerRef.current) {
      tvManagerRef.current.setData(activeBars, calculateRSI(activeBars).series);
    }

    const unsubs = [
      controller.onPrimitivesUpdated(setPrimitives),
      controller.onLogUpdated(setLog),
      controller.onSmcUpdated((s) => {
        setSmc(s);
        setChochBacktest(controller.getChochBacktest());
        const a = controller.getAnalysis();
        setVolumeExtras(a ? { profile: a.profile, avwap: a.avwap, orderFlow: a.orderFlow } : null);
      }),
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
      controller.drawing.on("primitive:created", (p) => enableLayersFor(controller, [p])),
      controller.drawing.on("history:changed", setHistory),
    ];
    // Super Chart SC1: khôi phục lớp người dùng đã bật lần trước (một lần khi mở tab).
    if (!layersRestoredRef.current) {
      layersRestoredRef.current = true;
      controller.layers.setMany(fullLayers(workspaceStore.getSnapshot().layers, controller.getLayerState()));
    }
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

  // VN-Index (tải riêng, có thể tới sau) -> 9 phép thử Wyckoff so sánh sức mạnh tương đối.
  useEffect(() => {
    if (bars.length === 0) return;
    controllerRef.current?.setBenchmark(TA_INDICES.some((x) => x.symbol === ticker) ? null : benchmarkBars?.length ? benchmarkBars : null);
  }, [benchmarkBars, bars, ticker]);

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
    enableLayersFor(controller, local.primitives);
    loadedSymbolRef.current = ticker;
    void loadCloud(ticker).then((cloud) => {
      if (cancelled || !cloud) return;
      const best = pickNewer(local, cloud);
      if (best !== local) {
        persistedRef.current = JSON.stringify(best.primitives);
        controller.drawing.replaceAll(best.primitives);
        enableLayersFor(controller, best.primitives);
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
    if (layerState.corporate && timeframe === "D") {
      corporateActions.forEach((c) => {
        if (visibleDates.has(c.date)) markers.push({ time: c.date, position: "belowBar", color: GQ_COLORS.amber, shape: "square", text: c.label });
      });
    }
    if (layerState.smc) {
      smc.bos.forEach((b) => markers.push({ time: b.date, position: b.type === "bullish" ? "belowBar" : "aboveBar", color: b.type === "bullish" ? GQ_COLORS.bull : GQ_COLORS.bear, shape: b.type === "bullish" ? "arrowUp" : "arrowDown", text: "" })); // BOS: chỉ mũi tên — nhãn chữ do lớp phủ quản lý ngân sách
      smc.choch.forEach((c) => markers.push({ time: c.date, position: c.type === "bullish" ? "belowBar" : "aboveBar", color: GQ_COLORS.amber, shape: "circle", text: "CHoCH" }));
      smc.sweeps.forEach((l) => {
        if (l.stateDate) markers.push({ time: l.stateDate, position: l.type === "EQL" ? "belowBar" : "aboveBar", color: GQ_COLORS.uv, shape: l.type === "EQL" ? "arrowUp" : "arrowDown", text: l.type === "EQL" ? "SSL Sweep" : "BSL Sweep" });
      });
    }
    if (layerState.vsa) {
      vsa.forEach((v) => markers.push({
        time: v.date, position: v.dir === "bullish" ? "belowBar" : "aboveBar",
        color: v.dir === "bullish" ? GQ_COLORS.bull : v.dir === "bearish" ? GQ_COLORS.bear : GQ_COLORS.uv, shape: "circle", text: VSA_LABEL[v.type] ?? v.type.slice(0, 4),
      }));
    }
    if (layerState.structure) markers.push(...structureMarkers(currentBars, timeframe, structureDoc, structureMode));
    if (layerState.orderflow && orderFlow) {
      for (const a of orderFlow.absorption) markers.push({ time: a.date, position: a.dir === "bullish" ? "belowBar" : "aboveBar", color: GQ_COLORS.uv, shape: "square", text: "ABS" });
      markers.push(...divergenceMarkers(orderFlow.divergences, currentBars));
    }
    tvManagerRef.current.setMarkers(markers.filter((m) => visibleDates.has(m.time)));
  }, [smc, vsa, layerState, corporateActions, currentBars, timeframe, orderFlow, structureDoc, structureMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Super Chart: nhớ lớp đang bật + preset tương ứng (theo tài khoản); bố cục đám mây sau đăng nhập ----
  useEffect(() => {
    if (!layerState || !layersRestoredRef.current) return;
    setWs((w) => ({ layers: layersToSave(layerState), preset: matchPreset(layerState, w.mine) }));
  }, [layerState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void workspaceStore.loadCloud().then(() => {
      const c = controllerRef.current;
      if (c) c.layers.setMany(fullLayers(workspaceStore.getSnapshot().layers, c.getLayerState()));
    });
  }, []);
  useEffect(() => { tvManagerRef.current?.setMagnet(ws.magnet); }, [ws.magnet, tvApi]);
  // Đổi mã / khung: tự huỷ nét vẽ dở + bỏ chọn (anh duyệt, lựa chọn 4).
  const viewKeyRef = useRef(`${ticker}|${timeframe}`);
  useEffect(() => {
    const k = `${ticker}|${timeframe}`;
    if (viewKeyRef.current === k) return;
    viewKeyRef.current = k;
    setSelectedId(null); setRangeId(null);
    const c = controllerRef.current;
    if (activeTool || draftPrimitive || elliottDraft.length) {
      c?.drawing.cancelDraw(); c?.drawing.cancelElliottDraft(); setActiveTool(null);
      toasts.push("Đã huỷ nét vẽ dở khi đổi mã / khung thời gian.");
    }
  }, [ticker, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId && !primitives.some((p) => p.id === selectedId)) setSelectedId(null); }, [primitives, selectedId]);
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === wsRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [wsRef]);

  // ---- Pane chỉ báo (khối lượng, RSI) theo công tắc lớp ----
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv || !layerState) return;
    tv.setVolumeVisible(layerState.volume);
    tv.setRsiVisible(layerState.rsi);
  }, [layerState]);
  useEffect(() => { tvManagerRef.current?.setRsi(rsiResult.series); }, [rsiResult]);

  // ---- P4: nến phút SSI cho khung intraday (làm mới 60 giây trong phiên) ----
  const intraday = useTaIntraday(ticker, wantIntraday);
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !intraday.bars.length) return;
    controller.setIntradayBars(intraday.bars);
    if (pendingTf) { controller.setTimeframe(pendingTf); setPendingTf(null); }
  }, [intraday.bars]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { tvManagerRef.current?.setTimeVisible(isIntradayTf(timeframe)); }, [timeframe]);

  // ---- P5: Order Flow (Delta/CVD, Absorption, Divergence, VPIN) + Khối ngoại — chỉ tải khi bật lớp ----
  const flowEnabled = Boolean(layerState?.orderflow || layerState?.foreign);
  const flow = useTaFlow(ticker, flowEnabled);
  useEffect(() => {
    controllerRef.current?.setFlowMinutes(layerState?.orderflow && flow.data ? flow.data.minutes : null);
  }, [flow.data, layerState?.orderflow]);
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    tv.setFlowPane(layerState?.orderflow && orderFlow ? orderFlow.bars : null);
  }, [orderFlow, layerState?.orderflow]);
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    if (!layerState?.foreign || isIntradayTf(timeframe) || !flow.data?.foreign.length) { tv.setForeignPane(null); return; }
    tv.setForeignPane(foreignByBar(currentBars, flow.data.foreign));
  }, [flow.data, layerState?.foreign, currentBars, timeframe]);
  // R3: nguồn + giới hạn hiển thị ngay trên tiêu đề pane.
  const basisShort = dataContext ? (dataContext.priceBasis === "ADJUSTED_CUMULATIVE" ? "giá điều chỉnh" : dataContext.priceBasis === "INDEX_POINTS" ? "điểm chỉ số" : dataContext.label) : null;
  const paneNotes = useMemo(() => paneNotesFor(orderFlow, flow.data?.coverage ?? null, currentBars.length, basisShort), [orderFlow, flow.data?.coverage, currentBars.length, basisShort]);
  // Vì sao pane Khối ngoại không hiện (thay vì im lặng biến mất).
  const foreignNote = foreignUnavailable(ticker, timeframe, Boolean(flow.data), flow.data?.foreign.length ?? 0);

  // ---- Bàn phím: ← → dịch 5 nến (Shift: 20), + − zoom, Home/End về đầu/cuối dữ liệu ----
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    const step = e.shiftKey ? 20 : 5;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => tv.panBars(-step), ArrowRight: () => tv.panBars(step),
      ArrowUp: () => tv.zoom(0.8), ArrowDown: () => tv.zoom(1.25), "+": () => tv.zoom(0.8), "=": () => tv.zoom(0.8), "-": () => tv.zoom(1.25),
      Home: () => tv.goToStart(), End: () => tv.goToEnd(),
      Escape: () => { controllerRef.current?.drawing.cancelDraw(); setActiveTool(null); setSelectedId(null); },
    };
    const act = actions[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  };

  // ---- R4: pane MACD / ADX (khung phụ, bật/tắt bằng lớp macd / adx) ----
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    tv.setMacdPane(layerState?.macd ? currentBars.map((b, i) => ({ date: b.date, macd: macdResult.macdLine[i], signal: macdResult.signalLine[i], hist: macdResult.histogram[i] })) : null);
  }, [layerState?.macd, currentBars, macdResult]);
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    tv.setAdxPane(layerState?.adx ? currentBars.map((b, i) => ({ date: b.date, adx: adxResult.series[i], plus: adxResult.plusDI[i], minus: adxResult.minusDI[i] })) : null);
  }, [layerState?.adx, currentBars, adxResult]);
  // R4: giá trị từng pane tại nến dưới crosshair.
  const paneValue = useMemo(() => paneValueReader({ bars: currentBars, rsi: rsiResult, macd: macdResult, adx: adxResult, flow: orderFlow?.bars ?? null,
    foreign: layerState?.foreign && !isIntradayTf(timeframe) && flow.data?.foreign.length ? foreignByBar(currentBars, flow.data.foreign) : null }),
  [currentBars, rsiResult, macdResult, adxResult, orderFlow, layerState?.foreign, timeframe, flow.data]);

  // ---- Elliott Oscillator (khung phụ, bật/tắt bằng lớp elliottOsc) ----
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    tv.setElliottOscPane(layerState?.elliottOsc && currentBars.length > 40 ? elliottOscData(currentBars) : null);
  }, [layerState?.elliottOsc, currentBars]);

  // Đếm sóng tự động cho khung đang xem: D = khung ngày (+ đếm tuần ghim vào nến ngày), W = khung tuần; khung khác không vẽ.
  const countViolations = useMemo(() => (countEditing ? validateUserCount(countDraft.value, currentBars) : []), [countEditing, countDraft.value, currentBars]);
  const mineScene = useMemo(() => {
    if (countEditing) return { points: countDraft.value, editing: true, violations: countViolations.length };
    const a = userCounts.active;
    return a ? { points: a.points, editing: false, violations: a.violations.length } : null;
  }, [countEditing, countDraft.value, countViolations, userCounts.active]);
  // DW9: Elliott khung trong ngày (1H / 15m) tính trên chính nến đang xem.
  const intradayElliott = useMemo(() => intradayElliottState(currentBars, timeframe), [currentBars, timeframe]);
  // EP1: cây sóng nhiều bậc (engine v3) trên chính khung đang xem (D / W / 1H / 15m).
  const v3Candles = useMemo(() => (["D", "W", "1H", "15m"].includes(timeframe) && currentBars.length >= 60
    ? currentBars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })) : null), [currentBars, timeframe]);
  const waveTree = useMemo(() => (v3Candles ? buildWaveTree(v3Candles) : null), [v3Candles]);
  // EP2: kịch bản ĐÃ XÁC NHẬN (cây trên pivot đã xác nhận — đúng thứ được ghi sổ) + vòng đời; thêm kịch bản "tạm" của chặng đang chạy.
  const v3Scenarios = useMemo(() => {
    if (!v3Candles) return [];
    const confirmed = scenariosFromTree(buildWaveTree(v3Candles, { confirmedOnly: true }), v3Candles, ticker);
    const live = scenariosFromTree(waveTree, v3Candles, ticker).filter((s) => s.provisional && !confirmed.some((c) => c.template === s.template && c.level === s.level));
    return [...confirmed, ...live].map((sc) => ({ sc, lc: evaluateLifecycle(sc, v3Candles) }));
  }, [v3Candles, waveTree, ticker]);
  // EP3: chế độ lớp Elliott Pro (nhớ theo trình duyệt — tiện ích riêng của người xem); mặc định "Phác đồ".
  const [proMode, setProModeState] = useState<ElliottProMode>(() => {
    try { const v = window.localStorage.getItem("gq.ta.elliottProMode"); return v === "compact" || v === "deep" ? v : "chart"; } catch { return "chart"; }
  });
  const setProMode = (m: ElliottProMode) => { setProModeState(m); try { window.localStorage.setItem("gq.ta.elliottProMode", m); } catch { /* riêng tư */ } };
  const elliottProInput = useMemo(() => (waveTree ? { tree: waveTree, scenarios: v3Scenarios, mode: proMode } : null), [waveTree, v3Scenarios, proMode]);
  const elliottProText = useMemo(() => (elliottProInput ? elliottProSummary(elliottProInput) : null), [elliottProInput]);
  const elliottScene = useMemo(() => {
    if (intradayElliott) {
      const p = elliottPick > 0 ? intradayElliott.alternates?.[elliottPick - 1] ?? intradayElliott : intradayElliott;
      return { primary: p, alternate: elliottPick === 0 ? intradayElliott.alternates?.[0] ?? null : intradayElliott, mine: mineScene };
    }
    if (!mtf) return mineScene ? { primary: null, mine: mineScene } : null;
    const pick = (st: ElliottState | null) => (st && elliottPick > 0 ? st.alternates?.[elliottPick - 1] ?? st : st);
    // DW7: kịch bản phụ = phương án kế tiếp sau cách đếm đang vẽ (chính -> PA2; PA2 -> chính).
    const other = (st: ElliottState | null) => (!st ? null : elliottPick === 0 ? st.alternates?.[0] ?? null : st);
    if (timeframe === "W") return { primary: pick(mtf.week), alternate: other(mtf.week), mine: mineScene };
    if (timeframe !== "D") return null;
    const higher = mtf.week?.scenario
      ? { points: mtf.weekPivotsOnDaily.map((p) => ({ date: p.dayDate, price: p.price })), labels: mtf.weekPivotsOnDaily.map((_, k) => `(${k})`) } : null;
    return { primary: pick(mtf.day), alternate: other(mtf.day), higher, mine: mineScene };
  }, [mtf, timeframe, elliottPick, mineScene, intradayElliott]);

  // P5: mô hình giá Pring (Pattern Scanner v2) — chỉ tải khi bật lớp, khung D / W.
  const pringOn = Boolean(layerState?.pring) && (timeframe === "D" || timeframe === "W") && !TA_INDICES.some((x) => x.symbol === ticker);
  const pringDetail = usePatternDetail(pringOn ? ticker : null);
  const pringScene = useMemo(() => (pringOn && pringDetail.data ? (timeframe === "W" ? toChartWeekly(pringDetail.data.weekly) : pringDetail.data.daily) : null), [pringOn, pringDetail.data, timeframe]);

  // ---- Lớp phủ canvas (lớp Cấu trúc MTF vẽ dưới cùng) ----
  const visiblePrims = useMemo(() => primitives.filter((p) => !p.hidden), [primitives]);
  const structureItems = useMemo(() => (structureOn ? structureSceneItems(currentBars, timeframe, structureDoc, structureMode, { asOf: replayAsOf }) : []),
    [structureOn, currentBars, timeframe, structureDoc, structureMode, replayAsOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseScene = useMemo(() => buildScene({
    bars: currentBars, smc, wyckoff: wyckoffResult, layers: layerState, primitives: visiblePrims, draft: draftPrimitive,
    elliottDraft, fibExtension: fibExtensionMode, highlight: highlightRange,
    profile: volumeExtras?.profile ?? null, avwap: volumeExtras?.avwap ?? null, elliott: elliottScene, pring: pringScene, elliottPro: elliottProInput,
  }), [currentBars, smc, wyckoffResult, layerState, visiblePrims, draftPrimitive, elliottDraft, fibExtensionMode, highlightRange, volumeExtras, elliottScene, pringScene, elliottProInput]);
  // SC3: hình đang chọn — vòng tròn ở các điểm neo (vàng = đã khoá).
  const selectionItems = useMemo((): SceneItem[] => {
    const p = primitives.find((x) => x.id === selectedId);
    if (!p || p.hidden) return [];
    const pts = p.toolType === "fibTimeZone" ? [p.anchor] : p.toolType === "elliott" ? p.points : [p.p1, p.p2];
    return pts.map((q) => ({ kind: "ring", t: q.date, price: q.price, color: p.locked ? GQ_COLORS.amber : GQ_COLORS.cyan, r: 5, width: 2 }));
  }, [primitives, selectedId]);
  const scene = useMemo(() => (structureItems.length || selectionItems.length ? { ...baseScene, items: [...structureItems, ...baseScene.items, ...selectionItems] } : baseScene), [structureItems, baseScene, selectionItems]);
  useEffect(() => { tvManagerRef.current?.setScene(scene); }, [scene]);
  // Thang mức giá trục phải + khoảng trống tương lai (nón dự báo / mũi tên kịch bản).
  useEffect(() => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    const close = currentBars[currentBars.length - 1]?.close ?? 0;
    tv.setPriceLevels(structureOn && !replayed ? structureLevels(structure.data, structureMode, close) : []);
    const structureRoom = structureOn && structureMode !== "overview" && (timeframe === "D" || timeframe === "1H") ? 26 : 6;
    // DW3: chừa đủ chỗ cho đường kịch bản Elliott (nến xa nhất + 4, tối đa 60) khi lớp đang bật.
    const proj = layerState?.elliottProj && elliottScene?.primary ? elliottProjection(elliottScene.primary, close) : null;
    // EP3: mọi đường tương lai của scene (Elliott Pro, kịch bản cũ…) — chừa đủ chỗ (≤ 60 nến).
    const futureK = Math.max(0, ...baseScene.items.flatMap((it) => (it.kind === "future" ? it.points.map((q) => q.k) : [])));
    const projRoom = Math.min(60, Math.max(proj?.legs.length ? proj.legs[proj.legs.length - 1].k + 4 : 0, futureK ? futureK + 4 : 0));
    tv.setRightOffset(Math.max(structureRoom, projRoom));
  }, [structureOn, structure.data, structureMode, currentBars, timeframe, replayed, layerState?.elliottProj, elliottScene, baseScene]); // eslint-disable-line react-hooks/exhaustive-deps
  const openStructure = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.layers.enable("structure");
    if (structureMode === "overview") setStructureMode("trade");
    setWs({ dockTab: "structure", dockOpen: true });
    setMobileDockOpen(true);
    setTimeout(() => (structurePanelRef.current ?? dockRef.current)?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 80);
  };
  // Bộ lọc -> "Mở trên biểu đồ với cấu trúc": bật lớp + chế độ Giao dịch sau khi đổi mã.
  useEffect(() => {
    const onOpen = () => { setTimeout(openStructure, 0); };
    window.addEventListener(STRUCTURE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(STRUCTURE_OPEN_EVENT, onOpen);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const structureTfa = structure.data ? structure.data.tfs[structureTfFor(timeframe) ?? "D"] ?? structure.data.tfs.D : undefined;

  useEffect(() => {
    if (!highlight) return;
    setHighlightRange({ start: highlight.start, end: highlight.end });
    toasts.push(`Đang khoanh vùng mẫu ${highlight.label} (${highlight.start} → ${highlight.end}).`);
    const i = currentBars.findIndex((b) => b.date >= highlight.start);
    if (i >= 0) tvManagerRef.current?.showLast(Math.max(60, currentBars.length - i + 20));
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!highlightPattern) return;
    setHighlightRange({ start: highlightPattern.dateRangeStart, end: highlightPattern.dateRangeEnd });
    controllerRef.current?.logPatternConfluence(highlightPattern);
  }, [highlightPattern]);

  // Khoá kéo/zoom biểu đồ khi đang chọn công cụ vẽ (để thao tác chạm/kéo vẽ hình thay vì cuộn biểu đồ).
  useEffect(() => { tvManagerRef.current?.setInteractionLocked(activeTool !== null); }, [activeTool]);

  const handleTimeframeChange = (tf: Timeframe) => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (isIntradayTf(tf) && !controller.hasIntraday()) {
      setWantIntraday(true); // tải nến phút, áp dụng khung khi dữ liệu về
      setPendingTf(tf);
      return;
    }
    if (isIntradayTf(tf)) setWantIntraday(true);
    setPendingTf(null);
    controller.setTimeframe(tf);
  };
  const handleToggleFibExtension = () => controllerRef.current?.drawing.setFibExtensionMode(!fibExtensionMode);
  // "Gợi ý": ưu tiên đếm sóng của engine GET (khung D/W) -> BẢN NHÁP nét đứt; chỉ thành hình vẽ khi người dùng chấp nhận.
  // Engine chưa có kịch bản 5 sóng -> dùng gợi ý Zigzag cũ (6 pivot gần nhất).


  // ---- DW8: chỉnh tay cách đếm Elliott ----
  const drawnState = elliottScene?.primary ?? null;
  const startCountEdit = () => {
    if (countEditing) { setCountEditing(false); setCountPlacing(null); return; }
    countDraft.reset(userCounts.active?.points ?? draftFromState(drawnState));
    setCountEditing(true);
  };
  const saveCountVersion = (meta: { note: string; pattern: UserCountVersion["pattern"]; confirm: boolean }) => {
    const v: UserCountVersion = {
      id: newVersionId(), createdAt: new Date().toISOString(), status: meta.confirm ? "user_confirmed" : "user_edited",
      points: countDraft.value, degree: drawnState?.degree ?? null, pattern: meta.pattern, note: meta.note,
      basedOn: { source: userCounts.active ? "user" : "engine", asOf: drawnState?.asOf ?? null, rank: elliottPick }, violations: countViolations,
    };
    void userCounts.save({ ...userCounts.doc, activeId: v.id, versions: [...userCounts.doc.versions, v].slice(-20) });
    setCountEditing(false); setCountPlacing(null);
    controllerRef.current?.layers.enable("elliottMine");
  };
  const countStatusOf = (v: UserCountVersion) => displayStatus(v, currentBars[currentBars.length - 1]?.close ?? null, drawnState);

  // ---- Pointer Events (chuột · cảm ứng · bút) ----
  const toDomain = (e: React.PointerEvent) => tvManagerRef.current?.clientToDomain(e.clientX, e.clientY) ?? null;
  const barDates = useMemo(() => currentBars.map((b) => b.date), [currentBars]);
  // SC3: bấm vào hình vẽ -> chọn; kéo điểm neo -> sửa, kéo thân -> dời (pha capture: khoá cuộn biểu đồ TRƯỚC khi thư viện nhận).
  const onSelectPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool || (countEditing && countPlacing != null) || e.button > 0) return;
    const tv = tvManagerRef.current, ctl = controllerRef.current, el = chartContainerRef.current;
    if (!tv || !ctl || !el) return;
    const rect = el.getBoundingClientRect(), size = tv.pricePaneSize();
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (at.y > size.height || at.x > size.width) return;
    const hit = hitTest(primitives, at, (q) => tv.domainToPixel(q.date, q.price), { tol: e.pointerType === "touch" ? 14 : 7, height: size.height });
    if (!hit) { if (selectedId) setSelectedId(null); return; }
    setSelectedId(hit.id);
    const prim = primitives.find((x) => x.id === hit.id);
    const start = tv.clientToDomain(e.clientX, e.clientY);
    if (!prim || prim.locked || !start) return;
    e.preventDefault(); e.stopPropagation();
    tv.setInteractionLocked(true);
    dragRef.current = { id: hit.id, part: hit.part, start, orig: prim, pointerId: e.pointerId, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* không bắt được con trỏ */ }
  };
  const dragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current, ctl = controllerRef.current;
    if (!d || d.pointerId !== e.pointerId || !ctl) return false;
    const pt = toDomain(e);
    if (!pt) return true;
    if (!d.moved) { ctl.drawing.beginEdit(); d.moved = true; }
    let patch: PrimitivePatch;
    if (d.part === "body") patch = shiftPrimitive(d.orig, barDates.indexOf(pt.date) - barDates.indexOf(d.start.date), pt.price - d.start.price, barDates);
    else if (d.part === "anchor") patch = { anchor: pt };
    else patch = { [d.part]: pt } as PrimitivePatch;
    ctl.drawing.updatePrimitive(d.id, patch, { record: false });
    return true;
  };
  const dragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return false;
    dragRef.current = null;
    tvManagerRef.current?.setInteractionLocked(activeTool !== null);
    return true;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // DW8: đang đặt điểm của cách đếm chỉnh tay -> bám high/low của nến gần nhất.
    if (countEditing && countPlacing != null) {
      const point = toDomain(e);
      const snapped = point ? snapToCandle(currentBars, point.date, point.price) : null;
      if (!snapped) return;
      e.preventDefault();
      const cur = countDraft.value;
      const label = cur[countPlacing]?.label ?? COUNT_LABELS[cur.length] ?? "C";
      const next = countPlacing < cur.length ? cur.map((p, k) => (k === countPlacing ? { ...snapped, label } : p)) : [...cur, { ...snapped, label }];
      countDraft.set(next);
      setCountPlacing(null);
      return;
    }
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
    if (dragMove(e)) return;
    if (drawingPointerRef.current !== e.pointerId) return;
    const point = toDomain(e);
    if (point) controllerRef.current?.drawing.updateDraw(point);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragEnd(e)) return;
    if (drawingPointerRef.current !== e.pointerId) return;
    drawingPointerRef.current = null;
    const point = toDomain(e);
    if (point) controllerRef.current?.drawing.finishDraw(point);
    else controllerRef.current?.drawing.cancelDraw();
    setActiveTool(null);
  };
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragEnd(e)) return;
    if (drawingPointerRef.current !== e.pointerId) return;
    drawingPointerRef.current = null;
    controllerRef.current?.drawing.cancelDraw();
  };

  // ================================================================ Super Chart — thao tác của workspace
  const ctlNow = () => controllerRef.current;
  const toggleLayer = (k: LayerKey) => ctlNow()?.layers.toggle(k);
  const applyPreset = (id: string) => {
    const c = ctlNow();
    if (!c) return;
    if (id === "mine") { if (ws.mine) c.layers.setMany(fullLayers(ws.mine, c.getLayerState())); return; }
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    c.layers.setMany(presetLayers(p, c.getLayerState()));
    setWs({ dockTab: p.dockTab, ...(p.inspectorTab ? { inspectorTab: p.inspectorTab, inspectorOpen: true } : {}) });
    toasts.push(`Preset “${p.label}” — chỉ đổi lớp hiển thị, hình vẽ và kết quả phân tích giữ nguyên.`);
  };
  const saveMine = () => { if (layerState) { setWs({ mine: layersToSave(layerState), preset: "mine" }); toasts.push("Đã lưu “Bố cục của tôi” theo tài khoản."); } };
  const resetLayout = () => {
    ctlNow()?.layers.setMany(fullLayers({}, ctlNow()!.getLayerState()));
    setWs({ layout: "workspace", inspectorOpen: true, inspectorTab: "overview", dockOpen: true, dockTab: "methods", dockHeight: 420, paneStretch: {}, magnet: false });
    tvManagerRef.current?.applyPaneStretch({});
    toasts.push("Đã khôi phục bố cục mặc định (không đụng tới hình vẽ).");
  };
  const openDock = (t: DockTab) => {
    setWs({ dockTab: t, dockOpen: true });
    setMobileDockOpen(true);
    if (t === "structure" && !layerState?.structure) openStructure();
    setTimeout(() => dockRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }), 60);
  };
  const pickTool = (t: DrawingToolType) => { setSelectedId(null); setActiveTool((cur) => (cur === t ? null : t)); setSheet(null); };
  const deleteSelected = () => { if (selectedId) { ctlNow()?.drawing.deletePrimitive(selectedId); setSelectedId(null); toasts.push("Đã xoá hình — Ctrl+Z để hoàn tác.", { label: "Hoàn tác", run: () => ctlNow()?.drawing.undo() }); } };
  const clearAllDrawings = () => { const n = primitives.length; ctlNow()?.drawing.clearAll(); setSelectedId(null); toasts.push(`Đã xoá ${n} hình vẽ.`, { label: "Hoàn tác", run: () => ctlNow()?.drawing.undo() }); };
  const exportPng = () => {
    const c = tvManagerRef.current?.screenshot();
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${ticker}_${timeframe}_${String(currentBars[currentBars.length - 1]?.date ?? "").slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toasts.push("Đã xuất ảnh biểu đồ (PNG, gồm các lớp đang bật).");
    }, "image/png");
  };
  const toggleFullscreen = () => {
    const el = wsRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => toasts.push("Trình duyệt không cho bật toàn màn hình."));
  };
  const setRange = (id: RangeId) => { setRangeId(id); tvManagerRef.current?.showLast(rangeBars(timeframe, id)); };
  const startCountEditFromToolbar = () => { openDock("elliott"); setElliottTabReq({ tab: "mine", n: Date.now() }); if (!countEditing) startCountEdit(); setSheet(null); };
  const savePaneStretch = () => {
    const tv = tvManagerRef.current;
    if (!tv || tv.paneCount() < 2) return;
    setTimeout(() => { const st = tv.paneStretch(); if (JSON.stringify(st) !== JSON.stringify(ws.paneStretch)) setWs({ paneStretch: { ...ws.paneStretch, ...st } }); }, 60);
  };

  // Phím tắt toàn workspace (không chặn khi đang gõ; bảng lệnh mở ở mọi nơi trong tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = wsRef.current;
      if (!root?.isConnected || (!root.offsetParent && document.fullscreenElement !== root)) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); return; }
      if (typing || document.querySelector("dialog[open]")) return;
      const c = controllerRef.current;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) c?.drawing.redo(); else c?.drawing.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); c?.drawing.redo(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); deleteSelected(); return; }
      if (e.key === "?") { e.preventDefault(); setShortcutsOpen(true); return; }
      if (e.altKey && !mod) {
        const tool = ({ KeyT: "trendline", KeyR: "rectangle", KeyF: "fibonacci", KeyZ: "fibTimeZone" } as Record<string, DrawingToolType>)[e.code];
        if (tool) { e.preventDefault(); pickTool(tool); }
      }
      if (e.key === "Escape" && selectedId) setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Bảng lệnh: mọi thao tác của phần chart.
  const commands = useMemo((): Command[] => {
    const list: Command[] = [];
    for (const g of LAYER_GROUPS) for (const k of g.keys) list.push({ id: `layer-${k}`, group: g.label, label: `${layerState?.[k] ? "Tắt" : "Bật"} ${LAYER_LABEL[k]}`, active: !!layerState?.[k], run: () => toggleLayer(k) });
    for (const p of PRESETS) list.push({ id: `preset-${p.id}`, group: "Preset", label: p.label, hint: p.hint, run: () => applyPreset(p.id) });
    if (ws.mine) list.push({ id: "preset-mine", group: "Preset", label: "Bố cục của tôi", run: () => applyPreset("mine") });
    for (const t of TOOLS) list.push({ id: `tool-${t.id}`, group: "Vẽ", label: t.label, keys: t.key, run: () => pickTool(t.id) });
    list.push({ id: "fib-ext", group: "Vẽ", label: `Fibonacci mở rộng: ${fibExtensionMode ? "tắt" : "bật"}`, run: handleToggleFibExtension });
    list.push({ id: "count-edit", group: "Vẽ", label: "Chỉnh tay cách đếm Elliott", run: startCountEditFromToolbar });
    for (const tf of ["1m", "5m", "15m", "1H", "D", "W", "M"] as Timeframe[]) list.push({ id: `tf-${tf}`, group: "Khung thời gian", label: `Khung ${tf}`, active: timeframe === tf, run: () => handleTimeframeChange(tf) });
    for (const r of rangesFor(timeframe)) list.push({ id: `range-${r.id}`, group: "Khoảng nhìn", label: r.label, run: () => setRange(r.id) });
    for (const d of DOCK_TABS) list.push({ id: `dock-${d.id}`, group: "Phân tích", label: `Mở ${d.label}`, run: () => openDock(d.id) });
    list.push(
      { id: "undo", group: "Hình vẽ", label: "Hoàn tác", keys: "Ctrl+Z", run: () => ctlNow()?.drawing.undo() },
      { id: "redo", group: "Hình vẽ", label: "Làm lại", keys: "Ctrl+Shift+Z", run: () => ctlNow()?.drawing.redo() },
      { id: "objects", group: "Hình vẽ", label: "Danh sách đối tượng", run: () => { setWs({ inspectorTab: "objects", inspectorOpen: true }); setDrawerOpen(true); } },
      { id: "fit", group: "Biểu đồ", label: "Vừa khung toàn bộ dữ liệu", run: () => tvManagerRef.current?.fit() },
      { id: "latest", group: "Biểu đồ", label: "Về nến mới nhất", keys: "End", run: () => tvManagerRef.current?.goToEnd() },
      { id: "magnet", group: "Biểu đồ", label: `Crosshair bám nến: ${ws.magnet ? "tắt" : "bật"}`, run: () => setWs({ magnet: !ws.magnet }) },
      { id: "png", group: "Biểu đồ", label: "Xuất ảnh PNG", run: exportPng },
      { id: "fullscreen", group: "Biểu đồ", label: fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình", run: toggleFullscreen },
      { id: "structure", group: "Phân tích", label: "Phân tích cấu trúc (bật lớp + bảng)", run: openStructure },
      { id: "confluence", group: "Phân tích", label: `Confluence Engine: ${layerState?.aiDetectionMaster ? "tắt" : "bật"}`, run: () => ctlNow()?.layers.setMaster(!layerState?.aiDetectionMaster) },
      { id: "classic", group: "Bố cục", label: ws.layout === "classic" ? "Dùng bố cục workspace mới" : "Bố cục cổ điển (xếp dọc như cũ)", run: () => setWs({ layout: ws.layout === "classic" ? "workspace" : "classic" }) },
      { id: "reset", group: "Bố cục", label: "Khôi phục bố cục mặc định", run: resetLayout },
      { id: "shortcuts", group: "Trợ giúp", label: "Danh sách phím tắt", keys: "?", run: () => setShortcutsOpen(true) },
    );
    return list;
  }, [layerState, ws.mine, ws.magnet, ws.layout, fibExtensionMode, timeframe, fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bars.length === 0) return <div className="text-xs text-slate-500 italic py-8 text-center">Chưa có dữ liệu nến cho {ticker}.</div>;

  const classic = ws.layout === "classic";
  const measured = wsWidth > 0;
  const isMobile = measured && wsWidth < 760;
  const isWide = !measured || wsWidth >= 1100;
  const inspectorMode = classic || isMobile ? "off" : isWide ? (ws.inspectorOpen ? "docked" : "off") : drawerOpen ? "drawer" : "off";
  const last = currentBars[currentBars.length - 1], prev = currentBars[currentBars.length - 2];
  const chgPct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
  const presetLabel = ws.preset === "custom" ? "Tuỳ chỉnh" : ws.preset === "mine" ? "Bố cục của tôi" : PRESETS.find((p) => p.id === ws.preset)?.label ?? "Giá sạch";
  const fmtPx = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
  const selected = primitives.find((p) => p.id === selectedId) ?? null;
  const toggleInspector = () => (isWide ? setWs({ inspectorOpen: !ws.inspectorOpen }) : setDrawerOpen((v) => !v));
  const dockShown = isMobile ? mobileDockOpen : ws.dockOpen;

  const toolButtons = (inSheet = false) => (
    <>
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" onClick={() => pickTool(t.id)} aria-pressed={activeTool === t.id} data-tool={t.id} aria-label={t.label} title={`${t.label} (${t.key})`} className="ws-btn ws-btn-amber">
            <Icon className="w-3.5 h-3.5" /><span className={inSheet ? "" : "ws-btn-text-opt"}>{t.short}</span>
          </button>
        );
      })}
      <button type="button" onClick={handleToggleFibExtension} aria-pressed={fibExtensionMode} data-testid="fib-ext" className="ws-btn" title={fibExtensionMode ? "Fib mở rộng: BẬT (127,2 / 161,8 / 261,8%)" : "Fib mở rộng: TẮT"} aria-label="Fibonacci mở rộng">
        <span className="text-[9px] font-black">Ext</span><span className={inSheet ? "" : "ws-btn-text-opt"}>Fib mở rộng</span>
      </button>
      <button type="button" onClick={startCountEditFromToolbar} aria-pressed={countEditing} className="ws-btn" data-testid="toolbar-count-edit" title="Chỉnh tay cách đếm Elliott (đặt điểm lên biểu đồ)">
        <PencilLine className="w-3.5 h-3.5" /><span className={inSheet ? "" : "ws-btn-text-opt"}>Đếm sóng</span>
      </button>
    </>
  );
  const editButtons = (
    <>
      <button type="button" className="ws-btn" onClick={() => ctlNow()?.drawing.undo()} disabled={!history.canUndo} aria-label="Hoàn tác (Ctrl+Z)" title="Hoàn tác (Ctrl+Z)" data-testid="toolbar-undo"><Undo2 className="w-3.5 h-3.5" /></button>
      <button type="button" className="ws-btn" onClick={() => ctlNow()?.drawing.redo()} disabled={!history.canRedo} aria-label="Làm lại (Ctrl+Shift+Z)" title="Làm lại (Ctrl+Shift+Z)" data-testid="toolbar-redo"><Redo2 className="w-3.5 h-3.5" /></button>
      <button type="button" className="ws-btn" onClick={deleteSelected} disabled={!selectedId} aria-label="Xoá hình đang chọn (Delete)" title="Xoá hình đang chọn (Delete)" data-testid="toolbar-delete"><Trash2 className="w-3.5 h-3.5" /></button>
    </>
  );
  const layerPopover = layerState && (
    <Popover testid="layers-menu-btn" panelTestid="layers-menu" label="Lớp & pane" icon={<Layers3 className="w-3.5 h-3.5" />} width={420} align="end"
      active={Object.entries(layerState).some(([k, v]) => v && k !== "aiDetectionMaster")}>
      <LayerMenu state={layerState} onToggle={toggleLayer} />
    </Popover>
  );
  const objectsButton = (
    <button type="button" className={`ws-btn ${inspectorMode !== "off" && ws.inspectorTab === "objects" ? "ws-btn-on" : ""}`} data-testid="objects-btn" data-count={primitives.length}
      onClick={() => { if (isMobile) { setSheet("objects"); return; } setWs({ inspectorTab: "objects", inspectorOpen: true }); setDrawerOpen(true); }} title="Danh sách đối tượng (hình vẽ)">
      <Shapes className="w-3.5 h-3.5" /><span className="ws-btn-text-opt">Đối tượng</span><span className="font-mono">({primitives.length})</span>
    </button>
  );
  const confluenceBtn = (
    <button type="button" onClick={() => ctlNow()?.layers.setMaster(!layerState?.aiDetectionMaster)} aria-pressed={!!layerState?.aiDetectionMaster} data-testid="confluence-engine" className="ws-btn"
      title="Đối chiếu hình vẽ tay / mẫu hình với SMC · VSA · Wyckoff (điểm theo luật, không phải mô hình AI)">
      <Waves className="w-3.5 h-3.5" /><span className="ws-btn-text-opt">Confluence</span>
    </button>
  );
  const structureBtn = (
    <button type="button" onClick={openStructure} data-testid="structure-open" className="ws-btn" aria-pressed={!!layerState?.structure} title="Phân tích cấu trúc đa khung (bật lớp + mở bảng)">
      <LayoutGrid className="w-3.5 h-3.5" /><span className="ws-btn-text-opt">Cấu trúc MTF</span>
    </button>
  );

  const dataChip = (
    <>
      {dataContext && (
          <Popover testid="data-context-btn" panelTestid="data-context" width={340} title="Nguồn dữ liệu"
            label={<span className="inline-flex items-center gap-1"><ProvenanceBadge kind={dataContext.priceBasis === "INDEX_POINTS" ? "HARD" : "DERIVED"} className="" />
              <span className={`truncate max-w-[110px] ${dataContext.priceBasis === "ADJUSTED_CUMULATIVE" || dataContext.priceBasis === "INDEX_POINTS" ? "" : "text-amber-300"}`}>{dataContext.priceBasis === "ADJUSTED_CUMULATIVE" ? "Giá điều chỉnh" : dataContext.priceBasis === "INDEX_POINTS" ? "Điểm chỉ số" : dataContext.label}</span>
              {dataContext.warnings.length > 0 && <span className="text-amber-300">⚠{dataContext.warnings.length}</span>}</span>}>
            <div className="text-[10.5px] text-slate-300 space-y-1">
              <p><b>{dataContext.label}</b> · {bars.length} phiên D · {bars[0]?.date ?? "—"} → {bars[bars.length - 1]?.date ?? "—"}</p>
              <p className="text-slate-400" data-testid="tf-note">{intraday.isLoading ? "Đang tải nến phút SSI…" : intraday.error ? `⚠ ${intraday.error}` : isIntradayTf(timeframe) ? `Khung ${timeframe}: nến phút SSI · ${intraday.sessions.length} phiên gần nhất · giờ VN` : `Khung ${timeframe}: ${timeframe === "D" ? "nến ngày" : "gộp từ nến D"} điều chỉnh`}</p>
              {dataContext.priceBasis === "ADJUSTED_CUMULATIVE" && <p>{corporateActions.length} sự kiện quyền đã điều chỉnh — bật lớp “Sự kiện quyền” để thấy ■ trên biểu đồ.</p>}
              {corporateActions.slice(-8).map((c) => <p key={c.date} className="font-mono text-[9.5px] text-slate-400">{c.date} {c.label} (hệ số {c.factor})</p>)}
              {dataContext.warnings.map((w) => <p key={w} className="text-amber-300">⚠ {w}</p>)}
            </div>
          </Popover>
        )}
    </>
  );
  const rightTools = (
        <span className="ml-auto inline-flex items-center gap-1" data-testid="ws-right-tools">
          <Popover testid="preset-menu-btn" panelTestid="preset-menu" width={280} align="end" title="Preset bố cục" optionalLabel
            label={<span className="inline-flex items-center gap-1">{presetLabel}<ChevronDown className="w-3 h-3" /></span>} icon={<LayoutGrid className="w-3.5 h-3.5" />}>
            <div className="space-y-1">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className={`ws-toggle w-full ${ws.preset === p.id ? "ws-toggle-on" : ""}`} data-preset={p.id} onClick={() => applyPreset(p.id)}>
                  <span className="font-bold">{p.label}</span><span className="text-[9px] text-slate-500 truncate">{p.hint}</span>
                </button>
              ))}
              {ws.mine && <button type="button" className={`ws-toggle w-full ${ws.preset === "mine" ? "ws-toggle-on" : ""}`} data-preset="mine" onClick={() => applyPreset("mine")}><span className="font-bold">Bố cục của tôi</span></button>}
              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800">
                <button type="button" className="ws-btn" onClick={saveMine} data-testid="preset-save-mine">Lưu làm bố cục của tôi</button>
                <button type="button" className="ws-btn" onClick={resetLayout} data-testid="layout-reset">Khôi phục mặc định</button>
                <button type="button" className="ws-btn" aria-pressed={classic} onClick={() => setWs({ layout: classic ? "workspace" : "classic" })} data-testid="layout-classic">Bố cục cổ điển</button>
              </div>
            </div>
          </Popover>
          <span className={`inline-flex w-4 justify-center ${cloudState === "saving" ? "text-cyan-300 animate-pulse" : cloudState === "saved" ? "text-emerald-300/80" : "text-slate-600"}`} data-testid="ws-cloud" data-state={cloudState}
            role="status" aria-label={cloudState === "saving" ? "Đang lưu bố cục" : cloudState === "saved" ? "Bố cục đã lưu theo tài khoản" : cloudState === "local" ? "Bố cục lưu trên máy này" : "Bố cục"}
            title={cloudState === "saving" ? "Đang lưu bố cục…" : cloudState === "saved" ? "Bố cục đã lưu theo tài khoản (tách khỏi hình vẽ)" : cloudState === "local" ? "Bố cục lưu trên máy này (chưa đăng nhập)" : "Bố cục lưu theo tài khoản"}>
            {cloudState === "local" ? <HardDrive className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
          </span>
          <button type="button" className="ws-btn" onClick={() => setPaletteOpen(true)} data-testid="palette-btn" title="Bảng lệnh (Ctrl/⌘ + K)" aria-label="Bảng lệnh"><CommandIcon className="w-3.5 h-3.5" /><span className="ws-btn-text-opt">⌘K</span></button>
          {isWide && <button type="button" className="ws-btn" onClick={() => setShortcutsOpen(true)} title="Phím tắt (?)" aria-label="Phím tắt"><Keyboard className="w-3.5 h-3.5" /></button>}
          <button type="button" className="ws-btn" onClick={toggleFullscreen} aria-pressed={fullscreen} data-testid="fullscreen-btn" title="Toàn màn hình" aria-label="Toàn màn hình">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</button>
        </span>
  );
  const inspector = (mode: "docked" | "drawer") => (
    <aside className="ws-inspector" data-mode={mode} data-testid="ws-inspector" aria-label="Bảng chi tiết">
      <div className="ws-tabs" role="tablist" aria-label="Bảng chi tiết">
        {([["overview", "Tổng quan"], ["objects", `Đối tượng (${primitives.length})`], ["notes", "Smart Note"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={ws.inspectorTab === id} data-inspector-tab={id} className="ws-tab" onClick={() => setWs({ inspectorTab: id })}>{label}</button>
        ))}
        <button type="button" className="ws-icon-btn ml-auto" onClick={() => (mode === "drawer" ? setDrawerOpen(false) : setWs({ inspectorOpen: false }))} aria-label="Đóng bảng chi tiết"><XCircle className="w-3.5 h-3.5" /></button>
      </div>
      <div className="ws-inspector-body">
        {ws.inspectorTab === "overview" && (
          <InspectorOverview smc={smc} vsa={vsa} wyckoff={wyckoffResult} rsi={rsiResult} macd={macdResult} adx={adxResult} elliottPro={elliottProText} onOpen={openDock}
            structure={structureOn && structure.data ? { on: true, verdict: verdictText(structure.data.align.verdict, structure.data.evidence.verdictValidated), stage: structureTfa ? `${STAGE_SHORT[structureTfa.stage]} · ${structureTfa.stageAge} nến` : "" } : { on: false, verdict: "", stage: "" }} />
        )}
        {ws.inspectorTab === "objects" && objectList}
        {ws.inspectorTab === "notes" && (wyckoffResult
          ? <SmartNotePanel inline ticker={ticker} wyckoff={wyckoffResult} smc={smc} vsa={vsa} rsi={rsiResult} macd={macdResult} adx={adxResult} />
          : <p className="text-[10px] text-slate-500">Đang chờ kết quả phân tích…</p>)}
      </div>
    </aside>
  );
  const objectList = (
    <ObjectList primitives={primitives} selectedId={selectedId} onSelect={setSelectedId} ticker={ticker} saveState={saveState}
      onRename={(id, name) => ctlNow()?.drawing.updatePrimitive(id, { name })}
      onToggleHidden={(id) => { const x = primitives.find((p) => p.id === id); ctlNow()?.drawing.updatePrimitive(id, { hidden: !x?.hidden }); }}
      onToggleLocked={(id) => { const x = primitives.find((p) => p.id === id); ctlNow()?.drawing.updatePrimitive(id, { locked: !x?.locked }); }}
      onDelete={(id) => { ctlNow()?.drawing.deletePrimitive(id); if (selectedId === id) setSelectedId(null); }}
      canUndo={history.canUndo} canRedo={history.canRedo} onUndo={() => ctlNow()?.drawing.undo()} onRedo={() => ctlNow()?.drawing.redo()} onClearAll={clearAllDrawings} />
  );

  const dockPanels: Record<DockTab, ReactNode> = {
    structure: structureOn ? (
      <div ref={structurePanelRef}>
        <StructurePanel doc={structureDoc ?? undefined} isLoading={structure.isLoading} error={structure.error}
          mode={structureMode} onModeChange={setStructureMode} timeframeKey={structureTfFor(timeframe)}
          onOpenChart={onRequestTickerChange} bars={currentBars} timeframe={timeframe}
          replay={{
            index: replayIdx, min: REPLAY_MIN_BARS - 1, max: bars.length - 1, date: replayIdx != null ? bars[replayIdx]?.date ?? null : null,
            available: (timeframe === "D" || timeframe === "W") && bars.length > REPLAY_MIN_BARS + 5, onChange: setReplayIdx,
          }} />
      </div>
    ) : (
      <div className="text-center py-8 space-y-2">
        <p className="text-[11px] text-slate-400">Cấu trúc thị trường đa khung (Tuần / Ngày / 1 giờ, SSI) chưa bật.</p>
        <button type="button" onClick={openStructure} className="ws-btn ws-btn-on mx-auto">Bật Cấu trúc MTF</button>
      </div>
    ),
    elliott: (
      <ElliottProPanel ticker={ticker} timeframe={timeframe} tree={waveTree} scenarios={v3Scenarios} dailyBars={bars} tabRequest={elliottTabReq}
        layerOn={!!layerState?.elliottPro} onToggleLayer={() => toggleLayer("elliottPro")} mode={proMode} onMode={setProMode}
        mine={<>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={startCountEdit} aria-pressed={countEditing} data-testid="elliott-edit"
              className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md border ${countEditing ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10" : "border-slate-700 text-slate-300"}`}>
              <PencilLine className="w-3 h-3" />Chỉnh tay cách đếm
            </button>
            {userCounts.active && (
              <button type="button" onClick={() => toggleLayer("elliottMine")} aria-pressed={!!layerState?.elliottMine} data-testid="elliott-toggle-mine"
                className={`text-[9px] px-1.5 py-0.5 rounded-md border ${layerState?.elliottMine ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10" : "border-slate-700 text-slate-400"}`}>
                {layerState?.elliottMine ? "Ẩn" : "Hiện"} cách đếm của tôi
              </button>
            )}
          </div>
          {countEditing && (
            <ElliottCountEditor points={countDraft.value} onChange={countDraft.set} placing={countPlacing} onPlace={setCountPlacing} violations={countViolations}
              canUndo={countDraft.canUndo} canRedo={countDraft.canRedo} onUndo={countDraft.undo} onRedo={countDraft.redo}
              onSave={saveCountVersion} onCancel={() => { setCountEditing(false); setCountPlacing(null); }} syncing={userCounts.syncing} cloudOk={userCounts.cloudOk} />
          )}
          <ElliottCountHistory doc={userCounts.doc} rejected={userCounts.rejected} statusOf={countStatusOf}
            onRestore={(id) => { void userCounts.save({ ...userCounts.doc, activeId: id }); controllerRef.current?.layers.enable("elliottMine"); }}
            onDelete={(id) => void userCounts.save({ ...userCounts.doc, activeId: userCounts.doc.activeId === id ? null : userCounts.doc.activeId, versions: userCounts.doc.versions.filter((v) => v.id !== id) })}
            onAuto={() => void userCounts.save({ ...userCounts.doc, activeId: null })} />
          <ElliottAlertsPanel ticker={ticker} timeframe={timeframe} state={drawnState}
            mine={userCounts.active && layerState?.elliottMine ? userCounts.active.points : null} dailyBars={bars} />
        </>}
        book={<>
          <ElliottWavePanel mtf={mtf} timeframe={timeframe} intraday={intradayElliott} tree={waveTree} scenarios={v3Scenarios}
            autoOn={!!layerState?.elliottAuto} oscOn={!!layerState?.elliottOsc}
            onToggleAuto={() => toggleLayer("elliottAuto")} onToggleOsc={() => toggleLayer("elliottOsc")}
            fibOn={!!layerState?.elliottFib} projOn={!!layerState?.elliottProj}
            onToggleFib={() => toggleLayer("elliottFib")} onToggleProj={() => toggleLayer("elliottProj")}
            guideOn={!!layerState?.elliottGuide} onToggleGuide={() => toggleLayer("elliottGuide")}
            subOn={!!layerState?.elliottSub} onToggleSub={() => toggleLayer("elliottSub")}
            pick={elliottPick} onPick={setElliottPick} lastClose={currentBars[currentBars.length - 1]?.close ?? null}
            detailOpen={elliottDetail} onToggleDetail={() => setElliottDetail((v) => !v)} />
          {elliottDetail && mtf && <ElliottDeepPanel mtf={mtf} daily={bars} weekly={weeklyBars} ticker={ticker} onClose={() => setElliottDetail(false)} />}
        </>} />
    ),
    methods: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} choch={smc.choch} totals={smc.totals} barCount={currentBars.length} />
        <VSAPanel signals={vsa} />
        {wyckoffResult && <WyckoffPanel result={wyckoffResult} barCount={currentBars.length} timeframe={timeframe} compare={controllerRef.current?.getAnalysis()?.wyckoffAlt ?? null} />}
      </div>
    ),
    flow: (
      <OrderFlowPanel enabled={flowEnabled} loading={flow.isLoading} error={flow.error} orderFlow={orderFlow}
        largePrintThreshold={flow.data?.largePrintThreshold ?? null} foreign={flow.data?.foreign ?? []} coverage={flow.data?.coverage ?? null} foreignNote={foreignNote} />
    ),
    indicators: <OscillatorPanel rsi={rsiResult} macd={macdResult} adx={adxResult} context={{ bars: currentBars.length, timeframe, basis: basisShort }} />,
    backtest: (<>
      {chochBacktest && !isIntradayTf(timeframe) && <BacktestPanel data={chochBacktest} />}
      {isIntradayTf(timeframe) && (
        <p className="text-[9px] text-slate-500 rounded-xl p-3" style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} data-testid="backtest-intraday-note">
          Event study chỉ chạy trên khung D/W/M: cổ phiếu mua trong phiên chưa bán được trong ngày (T+2.5), đo lợi suất theo nến phút sẽ sai bản chất.
        </p>
      )}
    </>),
    log: <AISignalLogPanel log={log} engineOn={!!layerState?.aiDetectionMaster} />,
  };
  const CLASSIC_ORDER: DockTab[] = ["structure", "methods", "elliott", "backtest", "flow", "indicators", "log"];

  return (
    <section ref={wsRef} className="ws" data-testid="ta-workspace" data-layout={classic ? "classic" : "workspace"} data-drawings={primitives.length} data-selected={selectedId ?? ""} data-mode={isMobile ? "mobile" : inspectorMode} aria-label={`Không gian phân tích biểu đồ ${ticker}`}>
      {/* 1. Thanh đầu: mã · giá · khung · khoảng nhìn · nguồn dữ liệu · preset · lưu */}
      <header className="ws-bar ws-head" data-testid="ws-header">
        {tickerSlot}
        {last && (
          <span className="font-mono text-[12px] font-bold text-slate-100" data-testid="ws-quote">
            {fmtPx(last.close)} {chgPct != null && <span className={chgPct >= 0 ? "text-emerald-300" : "text-rose-300"}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2).replace(".", ",")}%</span>}
          </span>
        )}
        <TimeframeSelector compact current={pendingTf ?? timeframe} onChange={handleTimeframeChange}
          loadingIntraday={intraday.isLoading} intradayError={intraday.error} intradaySessions={intraday.sessions.length} />
        {!isMobile && <div className="ws-group" role="group" aria-label="Khoảng nhìn">
          {rangesFor(timeframe).map((r) => (
            <button key={r.id} type="button" className="ws-btn ws-btn-sm" aria-pressed={rangeId === r.id} data-range={r.id} onClick={() => setRange(r.id)} title={`Xem ${r.label} gần nhất`}>{r.label}</button>
          ))}
        </div>}
        {dataChip}
        {!isMobile && rightTools}
        <span className="sr-only" data-testid="price-basis">{dataContext?.label} · {bars.length} phiên</span>
      </header>

      {/* 2. Thanh công cụ (desktop / tablet) */}
      {!isMobile && (
        <div className="ws-bar ws-tools" role="toolbar" aria-label="Công cụ biểu đồ" data-testid="ws-toolbar">
          <div className="ws-group" role="group" aria-label="Điều hướng">
            <button type="button" className="ws-btn" aria-pressed={ws.magnet} onClick={() => setWs({ magnet: !ws.magnet })} data-testid="magnet-btn" title="Crosshair bám giá nến (Magnet)" aria-label="Crosshair bám nến"><Magnet className="w-3.5 h-3.5" /></button>
            <button type="button" className="ws-btn" onClick={() => tvManagerRef.current?.zoom(1.25)} aria-label="Thu nhỏ (−)" title="Thu nhỏ (−)"><ZoomOut className="w-3.5 h-3.5" /></button>
            <button type="button" className="ws-btn" onClick={() => tvManagerRef.current?.zoom(0.8)} aria-label="Phóng to (+)" title="Phóng to (+)"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button type="button" className="ws-btn" onClick={() => { setRangeId("all"); tvManagerRef.current?.fit(); }} data-testid="fit-btn" aria-label="Vừa khung" title="Vừa khung toàn bộ dữ liệu"><Expand className="w-3.5 h-3.5" /></button>
            <button type="button" className="ws-btn" onClick={() => tvManagerRef.current?.goToEnd()} aria-label="Về nến mới nhất (End)" title="Về nến mới nhất (End)" data-testid="latest-btn"><ChevronsRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="ws-group" role="group" aria-label="Vẽ">{toolButtons()}</div>
          <div className="ws-group" role="group" aria-label="Sửa hình vẽ">{editButtons}{objectsButton}</div>
          <div className="ws-group" role="group" aria-label="Phân tích">{layerPopover}{confluenceBtn}{structureBtn}</div>
          <div className="ws-group" role="group" aria-label="Khác">
            <button type="button" className="ws-btn" onClick={exportPng} data-testid="png-btn" aria-label="Xuất ảnh PNG" title="Xuất ảnh PNG"><Camera className="w-3.5 h-3.5" /></button>
            {!classic && <button type="button" className="ws-btn" aria-pressed={inspectorMode !== "off"} onClick={toggleInspector} data-testid="inspector-btn" aria-label="Bảng chi tiết" title="Bảng chi tiết"><PanelRight className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      )}

      {/* 3. Thân: chart (+ bảng chi tiết) */}
      <div className="ws-body" data-inspector={inspectorMode}>
        <div className="ws-stage" data-testid="ta-chart" onPointerUpCapture={savePaneStretch}>
          <ChartLegend tv={tvApi} bars={currentBars} ticker={ticker} timeframe={timeframe} paneNotes={paneNotes} paneValue={paneValue} layoutKey={`${layerState?.volume}${layerState?.rsi}${layerState?.macd}${layerState?.adx}${layerState?.orderflow}${layerState?.foreign}${layerState?.elliottOsc}${wsWidth}${fullscreen}`}
            onClosePane={toggleLayer} />
          <div className="ws-chips">
            {layerState?.foreign && foreignNote && !flow.isLoading && (
              <span className="px-2 py-0.5 rounded-lg bg-slate-950/85 border border-slate-600/50 text-[10px] text-slate-300" data-testid="foreign-note">Khối ngoại: {foreignNote}</span>
            )}
            {layerState?.elliottPro && elliottProText && (
              <div className="px-2 py-1 rounded-lg bg-slate-950/85 border border-cyan-500/30 text-[10px] leading-snug text-cyan-100 flex flex-wrap items-center gap-1 max-w-full"
                data-testid="elliott-pro-chip" title="Elliott Pro (engine v3) — diễn giải EXPERIMENTAL, không phải khuyến nghị">
                <span className="truncate max-w-full">{elliottProText}</span>
                <span className="flex gap-0.5" role="radiogroup" aria-label="Chế độ Elliott Pro">
                  {ELLIOTT_PRO_MODES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={proMode === m.id} onClick={() => setProMode(m.id)} data-testid={`elliott-pro-mode-${m.id}`}
                      className={`px-1 rounded border text-[9px] ${proMode === m.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{m.label}</button>
                  ))}
                </span>
              </div>
            )}
            {structureOn && structure.data && (
              <div className={`px-2 py-1 rounded-lg bg-slate-950/85 border text-[10px] leading-snug ml-auto ${VERDICT_CHIP[VERDICT_TONE[structure.data.align.verdict]]}`}
                data-testid="structure-chip" title={structure.data.align.text}>
                <b>{verdictText(structure.data.align.verdict, structure.data.evidence.verdictValidated)}</b>
                <span className="text-slate-300"> · {structureTfa ? `${structureTfa.tf === "H1" ? "1 giờ" : structureTfa.tf === "W" ? "Tuần" : "Ngày"}: ${STAGE_SHORT[structureTfa.stage]} (${structureTfa.stageAge} nến)` : ""}</span>
                <span className="hidden sm:inline text-slate-400"> · {structure.data.align.rule}</span>
              </div>
            )}
            {highlightRange && (
              <span className="px-2 py-0.5 rounded-lg bg-violet-500/15 border border-violet-400/40 text-[10px] text-violet-200 inline-flex items-center gap-1" data-testid="highlight-chip">
                Mẫu hình {highlightRange.start} → {highlightRange.end}
                <button type="button" aria-label="Bỏ khoanh vùng" onClick={() => setHighlightRange(null)}><XCircle className="w-3 h-3" /></button>
              </span>
            )}
          </div>
          {classic && wyckoffResult && <SmartNotePanel ticker={ticker} wyckoff={wyckoffResult} smc={smc} vsa={vsa} rsi={rsiResult} macd={macdResult} adx={adxResult} />}
          {(activeTool || (countEditing && countPlacing != null) || selected) && (
            <div className="ws-hint" data-testid="drawing-hint" role="status">
              {activeTool ? <>Đang vẽ {TOOLS.find((t) => t.id === activeTool)?.label} — {activeTool === "fibTimeZone" ? "bấm một điểm" : "kéo trên biểu đồ (chạm giữ rồi kéo trên điện thoại)"}</>
                : countEditing && countPlacing != null ? <>Bấm lên biểu đồ để đặt điểm sóng</>
                : selected ? <>{selected.locked ? "Đã khoá — mở khoá ở Đối tượng để sửa" : "Kéo điểm neo để sửa · kéo thân để dời · Delete để xoá"}</> : null}
              {activeTool && <button type="button" className="underline" onClick={() => { controllerRef.current?.drawing.cancelDraw(); setActiveTool(null); }}>Huỷ (Esc)</button>}
              {selected && !activeTool && <button type="button" className="underline" onClick={() => setSelectedId(null)}>Bỏ chọn</button>}
            </div>
          )}
          <div
            ref={chartContainerRef}
            tabIndex={0}
            role="application"
            aria-label={`Biểu đồ ${ticker} — bàn phím: ← → dịch nến (Shift ×4), + − zoom, Home/End về đầu/cuối; Ctrl+K bảng lệnh`}
            title="Bấm vào biểu đồ rồi dùng ← → (Shift: nhanh), + −, Home, End"
            onKeyDown={onKeyDown}
            onPointerDownCapture={onSelectPointerDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            style={{
              background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", height: "100%",
              cursor: activeTool ? "crosshair" : "default", touchAction: activeTool || dragRef.current ? "none" : "auto",
            }}
            className="rounded-xl overflow-hidden relative w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
          />
          {inspectorMode === "drawer" && inspector("drawer")}
        </div>
        {inspectorMode === "docked" && inspector("docked")}
      </div>

      {/* 4. Di động: thanh hành động dưới chart -> bảng trượt */}
      {isMobile && (
        <nav className="ws-mobile-bar" aria-label="Thao tác biểu đồ" data-testid="ws-mobile-bar">
          <button type="button" className="ws-btn" onClick={() => setSheet("draw")} data-testid="mobile-draw"><PencilLine className="w-4 h-4" />Vẽ</button>
          <button type="button" className="ws-btn" onClick={() => setSheet("layers")} data-testid="mobile-layers"><Layers3 className="w-4 h-4" />Lớp</button>
          <button type="button" className="ws-btn" onClick={() => dockRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })} data-testid="mobile-analysis"><LayoutGrid className="w-4 h-4" />Phân tích</button>
          <button type="button" className="ws-btn" onClick={() => setSheet("objects")} data-testid="mobile-objects"><Shapes className="w-4 h-4" />Đối tượng</button>
          <button type="button" className="ws-btn" onClick={() => setSheet("more")} data-testid="mobile-more"><MoreHorizontal className="w-4 h-4" />Thêm</button>
        </nav>
      )}

      {/* 5. Dock: bảng phân tích sâu (tab) — "Bố cục cổ điển": xếp dọc như cũ */}
      <section ref={dockRef} className="ws-dock" data-testid="ws-dock" aria-label="Bảng phân tích">
        {!classic && (
          <>
            {!isMobile && ws.dockOpen && (
              <div className="ws-dock-resize" role="separator" aria-orientation="horizontal" aria-label="Kéo để đổi chiều cao bảng phân tích" tabIndex={0} aria-valuenow={ws.dockHeight} aria-valuemin={160} aria-valuemax={1200}
                onKeyDown={(e) => { if (e.key === "ArrowUp") setWs({ dockHeight: ws.dockHeight + 40 }); if (e.key === "ArrowDown") setWs({ dockHeight: ws.dockHeight - 40 }); }}
                onPointerDown={(e) => {
                  const y0 = e.clientY, h0 = ws.dockHeight, el = e.currentTarget;
                  try { el.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
                  const move = (ev: PointerEvent) => setWs({ dockHeight: h0 + (y0 - ev.clientY) });
                  const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
                  el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
                }} />
            )}
            <div className="ws-tabs" role="tablist" aria-label="Bảng phân tích">
              {DOCK_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={dockShown && ws.dockTab === t.id} aria-controls={`dock-${t.id}`} data-dock-tab={t.id} className="ws-tab"
                  onClick={() => {
                    if (isMobile) { const same = mobileDockOpen && ws.dockTab === t.id; setMobileDockOpen(!same); setWs({ dockTab: t.id }); return; }
                    setWs(ws.dockOpen && ws.dockTab === t.id ? { dockOpen: false } : { dockTab: t.id, dockOpen: true });
                  }}>
                  {t.label}{t.id === "structure" && structureOn ? " ●" : t.id === "elliott" && layerState?.elliottPro ? " ●" : ""}
                </button>
              ))}
              {!isMobile && <button type="button" className="ws-icon-btn ml-auto" aria-label={ws.dockOpen ? "Thu gọn bảng phân tích" : "Mở bảng phân tích"} onClick={() => setWs({ dockOpen: !ws.dockOpen })} data-testid="dock-collapse">
                <ChevronDown className={`w-3.5 h-3.5 transition ${ws.dockOpen ? "" : "rotate-180"}`} /></button>}
            </div>
          </>
        )}
        <div className="ws-dock-body" style={classic ? undefined : isMobile ? (mobileDockOpen ? { maxHeight: "78dvh" } : { padding: 0 }) : { height: ws.dockOpen ? ws.dockHeight : 0, padding: ws.dockOpen ? undefined : 0 }}>
          {(classic ? CLASSIC_ORDER : DOCK_TABS.map((t) => t.id)).map((id) => (
            <div key={id} id={`dock-${id}`} role={classic ? undefined : "tabpanel"} data-dock-panel={id} hidden={!classic && (!dockShown || ws.dockTab !== id)} className={classic ? "mb-3" : ""}>
              {dockPanels[id]}
            </div>
          ))}
        </div>
      </section>

      {/* Hộp thoại: bảng lệnh · phím tắt · bảng trượt di động */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Modal open={sheet === "draw"} onClose={() => setSheet(null)} title="Vẽ" sheet testid="sheet-draw">
        <div className="grid grid-cols-2 gap-1">{toolButtons(true)}</div>
        <div className="flex gap-1 mt-2">{editButtons}</div>
      </Modal>
      <Modal open={sheet === "layers"} onClose={() => setSheet(null)} title="Lớp & pane" sheet testid="sheet-layers">
        {layerState && <LayerMenu state={layerState} onToggle={toggleLayer} dense />}
        <div className="flex flex-wrap gap-1 mt-2">{confluenceBtn}{structureBtn}</div>
      </Modal>
      <Modal open={sheet === "objects"} onClose={() => setSheet(null)} title="Đối tượng" sheet testid="sheet-objects">{objectList}</Modal>
      <Modal open={sheet === "more"} onClose={() => setSheet(null)} title="Thêm" sheet testid="sheet-more">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <button type="button" className="ws-btn" aria-pressed={ws.magnet} onClick={() => setWs({ magnet: !ws.magnet })}><Magnet className="w-3.5 h-3.5" />Bám nến</button>
            <button type="button" className="ws-btn" onClick={() => { tvManagerRef.current?.fit(); setSheet(null); }}><Expand className="w-3.5 h-3.5" />Vừa khung</button>
            <button type="button" className="ws-btn" onClick={() => { tvManagerRef.current?.goToEnd(); setSheet(null); }}><ChevronsRight className="w-3.5 h-3.5" />Mới nhất</button>
            <button type="button" className="ws-btn" onClick={exportPng} data-testid="png-btn"><Camera className="w-3.5 h-3.5" />Ảnh PNG</button>
            <button type="button" className="ws-btn" onClick={() => { setSheet(null); setPaletteOpen(true); }}><CommandIcon className="w-3.5 h-3.5" />Bảng lệnh</button>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Khoảng nhìn">{rangesFor(timeframe).map((r) => <button key={r.id} type="button" className="ws-btn" aria-pressed={rangeId === r.id} data-range={r.id} onClick={() => { setRange(r.id); setSheet(null); }}>{r.label}</button>)}</div>
          <div className="flex flex-wrap gap-1">{PRESETS.map((p) => <button key={p.id} type="button" className="ws-btn" aria-pressed={ws.preset === p.id} data-preset={p.id} onClick={() => { applyPreset(p.id); setSheet(null); }}>{p.label}</button>)}</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="ws-btn" onClick={() => { saveMine(); }}>Lưu làm bố cục của tôi</button>
            <button type="button" className="ws-btn" onClick={() => { resetLayout(); setSheet(null); }}>Khôi phục mặc định</button>
            <button type="button" className="ws-btn" aria-pressed={classic} onClick={() => setWs({ layout: classic ? "workspace" : "classic" })} data-testid="layout-classic">Bố cục cổ điển</button>
            <button type="button" className="ws-btn" onClick={() => { setSheet(null); toggleFullscreen(); }}><Maximize2 className="w-3.5 h-3.5" />Toàn màn hình</button>
          </div>
          <InspectorOverview smc={smc} vsa={vsa} wyckoff={wyckoffResult} rsi={rsiResult} macd={macdResult} adx={adxResult} elliottPro={elliottProText}
            onOpen={(t) => { setSheet(null); openDock(t); }} structure={structureOn && structure.data ? { on: true, verdict: verdictText(structure.data.align.verdict, structure.data.evidence.verdictValidated), stage: "" } : { on: false, verdict: "", stage: "" }} />
          {wyckoffResult && <SmartNotePanel inline ticker={ticker} wyckoff={wyckoffResult} smc={smc} vsa={vsa} rsi={rsiResult} macd={macdResult} adx={adxResult} />}
        </div>
      </Modal>
      {toasts.node}
    </section>
  );
}

const fmtNum = (v: number, d = 2) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-/, "−");
const fmtBig = (v: number) => { const a = Math.abs(v); const s = a >= 1e9 ? `${fmtNum(a / 1e9, 2)} tỷ` : a >= 1e6 ? `${fmtNum(a / 1e6, 2)} tr` : a >= 1e3 ? `${fmtNum(a / 1e3, 1)} k` : fmtNum(a, 0); return `${v < 0 ? "−" : v > 0 ? "+" : ""}${s}`; };

/** R4: đọc giá trị từng pane tại nến thứ `i` (crosshair) — cùng chuỗi đã vẽ, không tính lại. */
export function paneValueReader(src: {
  bars: OhlcvBar[]; rsi: { series: (number | null)[] }; macd: { macdLine: (number | null)[]; signalLine: (number | null)[]; histogram: (number | null)[] };
  adx: { series: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] };
  flow: { date: string; delta: number; cvd: number; source: string }[] | null; foreign: { date: string; net: number; cum: number }[] | null;
}): (kind: string, i: number) => string | null {
  const flowAt = new Map((src.flow ?? []).map((f) => [f.date, f]));
  const forAt = new Map((src.foreign ?? []).map((f) => [f.date, f]));
  const n = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : fmtNum(v, d));
  return (kind, i) => {
    const b = src.bars[i];
    if (!b) return null;
    switch (kind) {
      case "volume": return fmtBig(b.volume).replace(/^\+/, "");
      case "rsi": return n(src.rsi.series[i], 1);
      case "macd": return src.macd.macdLine[i] == null ? "chưa đủ dữ liệu" : `MACD ${n(src.macd.macdLine[i])} · Signal ${n(src.macd.signalLine[i])} · Hist ${n(src.macd.histogram[i])}`;
      case "adx": return src.adx.series[i] == null ? "chưa đủ dữ liệu" : `ADX ${n(src.adx.series[i], 1)} · +DI ${n(src.adx.plusDI[i], 1)} · −DI ${n(src.adx.minusDI[i], 1)}`;
      case "flow": { const f = flowAt.get(b.date); return f ? `Δ ${fmtBig(f.delta)} · CVD ${fmtBig(f.cvd)} · ${f.source === "TICK" ? "tick" : "BVC"}` : null; }
      case "foreign": { const f = forAt.get(b.date); return f ? `ròng ${fmtBig(f.net)} · luỹ kế ${fmtBig(f.cum)}` : "không có dữ liệu ngày này"; }
      default: return null;
    }
  };
}

/** R3: ghi chú nguồn cho từng pane — Order Flow luôn ghi rõ là ƯỚC LƯỢNG và tỷ lệ nến tick thật / BVC. */
export function paneNotesFor(
  orderFlow: { coverage: { tickBars: number; bvcBars: number; tickPct: number } } | null,
  coverage: { requestedSessions: number; tickSessions: number } | null, nBars: number, basis: string | null,
): Partial<Record<"rsi" | "flow" | "foreign" | "volume", string>> {
  const out: Partial<Record<"rsi" | "flow" | "foreign" | "volume", string>> = {};
  if (orderFlow) {
    const c = orderFlow.coverage;
    out.flow = `ƯỚC LƯỢNG · tick thật ${c.tickBars}/${c.tickBars + c.bvcBars} nến (cột đậm) · BVC ${c.bvcBars} nến (cột nhạt)${coverage ? ` · ${coverage.tickSessions}/${coverage.requestedSessions} phiên có tick` : ""}`;
  }
  out.rsi = `${nBars} nến${basis ? ` · ${basis}` : ""}`;
  out.foreign = "dữ liệu sàn theo ngày";
  return out;
}

/**
 * R2 point-in-time: CVD divergence chỉ được BIẾT khi đỉnh/đáy thứ hai được xác nhận (sau R nến) -> marker chính "Div" tại nến
 * xác nhận; nến đỉnh/đáy gốc chỉ có chấm mờ không chữ.
 */
export function divergenceMarkers(divs: { date: string; dir: "bullish" | "bearish"; confirmedIndex: number }[], bars: OhlcvBar[]): ChartMarkerInput[] {
  const out: ChartMarkerInput[] = [];
  for (const d of divs) {
    const pos = d.dir === "bullish" ? "belowBar" as const : "aboveBar" as const;
    const at = bars[d.confirmedIndex]?.date ?? d.date;
    if (at !== d.date) out.push({ time: d.date, position: pos, color: "rgba(251,191,36,0.35)", shape: "circle", text: "" });
    out.push({ time: at, position: pos, color: GQ_COLORS.amber, shape: d.dir === "bullish" ? "arrowUp" : "arrowDown", text: at !== d.date ? `Div · sau ${barsGap(bars, d.date, at)} nến` : "Div" });
  }
  return out;
}
const barsGap = (bars: OhlcvBar[], a: string, b: string) => Math.max(0, bars.findIndex((x) => x.date === b) - bars.findIndex((x) => x.date === a));

/** Lý do không vẽ được Khối ngoại; null = có dữ liệu để vẽ (hoặc đang tải). */
export function foreignUnavailable(ticker: string, timeframe: Timeframe, loaded: boolean, days: number): string | null {
  if (TA_INDICES.some((x) => x.symbol === ticker)) return "chỉ số không có giao dịch khối ngoại theo mã — chọn một cổ phiếu";
  if (isIntradayTf(timeframe)) return "dữ liệu sàn theo ngày — chỉ hiển thị ở khung D / W / M";
  if (loaded && days === 0) return `chưa có dữ liệu khối ngoại cho ${ticker}`;
  return null;
}

/** Khối ngoại theo ngày -> theo nến khung hiện tại (D: cùng ngày; W/M: cộng các ngày thuộc kỳ của nến) + luỹ kế. */
export function foreignByBar(bars: OhlcvBar[], days: ForeignDay[]): { date: string; net: number; cum: number }[] {
  const out: { date: string; net: number; cum: number }[] = [];
  let j = 0;
  let cum = 0;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < bars.length; i++) {
    const end = i + 1 < bars.length ? bars[i + 1].date : "9999-12-31";
    let net = 0;
    let has = false;
    while (j < sorted.length && sorted[j].date < bars[i].date) j++;
    while (j < sorted.length && sorted[j].date < end) { net += sorted[j].netVal; has = true; j++; }
    if (!has) continue;
    cum += net;
    out.push({ date: bars[i].date, net, cum });
  }
  return out;
}
