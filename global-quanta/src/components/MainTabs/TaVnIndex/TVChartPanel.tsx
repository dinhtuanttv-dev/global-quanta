"use client";

// Biểu đồ TA VN-Index — P3 (TA_VNINDEX_UPGRADE_SPEC §2.1.1):
//   - Lightweight Charts v5: pane giá · khối lượng · RSI14; lớp phủ canvas (OverlayPrimitive) cắt đúng trong vùng giá,
//     tự theo zoom/pan, tối đa 12 nhãn không chồng nhau — thay lớp SVG + forceTick cũ.
//   - Pointer Events: vẽ bằng chuột, cảm ứng, bút (khoá kéo/zoom biểu đồ khi đang vẽ).
//   - quant-core chạy trong Web Worker (AnalysisController); hình vẽ lưu theo mã + tài khoản (chartDrawingsStore).
//   - MẶC ĐỊNH TẮT mọi chỉ báo/công cụ (chỉ có nến); bật lớp nào mới vẽ lớp đó. Mọi thứ là series/marker/primitive
//     của thư viện -> kéo chuột, cuộn, zoom và BÀN PHÍM (← → + − Home End) đều di chuyển cùng nến.
import { useRef, useEffect, useState, useMemo, useDeferredValue } from "react";
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
import { SMCPanel, VSAPanel, WyckoffPanel } from "./MethodPanels";
import ElliottWavePanel, { ElliottDeepPanel } from "./ElliottWavePanel";
import { ElliottCountEditor, ElliottCountHistory, useElliottUserCounts, useUndo } from "./ElliottCountEditor";
import ElliottAlertsPanel from "./ElliottAlertsPanel";
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
import { useStructure, STAGE_SHORT, VERDICT_TONE } from "../../../hooks/useStructure";
import StructurePanel from "./StructurePanel";
import { STRUCTURE_OPEN_EVENT } from "./StructureCells";
import { REPLAY_MIN_BARS, replayDoc } from "../../../lib/ta-command-center/chart/structureReplay";
import { mondayOf } from "../../../lib/ta-command-center/chart/pringScene";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";
import { suggestElliottPoints } from "../../../lib/ta-command-center/detectors/zigzagSuggest";
import type { VsaSignal } from "../../../lib/quant-core";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";
import type { CorporateActionMark } from "../../../hooks/useTaSeries";
import { useTaIntraday } from "../../../hooks/useTaIntraday";
import { useTaFlow, type ForeignDay } from "../../../hooks/useTaFlow";
import OrderFlowPanel from "./OrderFlowPanel";
import { aggregateToWeekly, isIntradayTf } from "../../../lib/ta-command-center/TimeframeController";
import { elliottMtf } from "../../../lib/quant-core/elliott/mtf";
import { elliottOscData, type ElliottState } from "../../../lib/quant-core/elliott";
import { elliottProjection } from "../../../lib/quant-core/elliott/projection";
import { intradayElliottState } from "../../../lib/quant-core/elliott/intraday";
import { buildWaveTree } from "../../../lib/quant-core/elliott/v3/waveTree";
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
}

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

export default function TVChartPanel({ bars, ticker, onRequestTickerChange, highlightPattern, corporateActions = NO_ACTIONS, benchmarkBars = null }: Props) {
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
  // E5 — Elliott: engine GET hai khung (tuần gộp từ chuỗi ngày), bản nháp "Gợi ý", bảng phân tích chi tiết.
  const mtf = useMemo(() => (bars.length >= 60 ? elliottMtf(bars) : null), [bars]);
  const weeklyBars = useMemo(() => aggregateToWeekly(bars), [bars]);
  const [elliottProposal, setElliottProposal] = useState<DomainPoint[] | null>(null);
  const [elliottDetail, setElliottDetail] = useState(false);
  useEffect(() => { setElliottProposal(null); }, [ticker, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps
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
      for (const d of orderFlow.divergences) markers.push({ time: d.date, position: d.dir === "bullish" ? "belowBar" : "aboveBar", color: GQ_COLORS.amber, shape: d.dir === "bullish" ? "arrowUp" : "arrowDown", text: "Div" });
    }
    tvManagerRef.current.setMarkers(markers.filter((m) => visibleDates.has(m.time)));
  }, [smc, vsa, layerState, corporateActions, currentBars, timeframe, orderFlow, structureDoc, structureMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---- Bàn phím: ← → dịch 5 nến (Shift: 20), + − zoom, Home/End về đầu/cuối dữ liệu ----
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tv = tvManagerRef.current;
    if (!tv) return;
    const step = e.shiftKey ? 20 : 5;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => tv.panBars(-step), ArrowRight: () => tv.panBars(step),
      ArrowUp: () => tv.zoom(0.8), ArrowDown: () => tv.zoom(1.25), "+": () => tv.zoom(0.8), "=": () => tv.zoom(0.8), "-": () => tv.zoom(1.25),
      Home: () => tv.goToStart(), End: () => tv.goToEnd(),
      Escape: () => { controllerRef.current?.drawing.cancelDraw(); setActiveTool(null); },
    };
    const act = actions[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  };

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
  const waveTree = useMemo(() => (["D", "W", "1H", "15m"].includes(timeframe) && currentBars.length >= 60
    ? buildWaveTree(currentBars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }))) : null), [currentBars, timeframe]);
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
  const structureItems = useMemo(() => (structureOn ? structureSceneItems(currentBars, timeframe, structureDoc, structureMode, { asOf: replayAsOf }) : []),
    [structureOn, currentBars, timeframe, structureDoc, structureMode, replayAsOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseScene = useMemo(() => buildScene({
    bars: currentBars, smc, wyckoff: wyckoffResult, layers: layerState, primitives, draft: draftPrimitive,
    elliottDraft: elliottProposal ?? elliottDraft, fibExtension: fibExtensionMode, highlight: highlightRange,
    profile: volumeExtras?.profile ?? null, avwap: volumeExtras?.avwap ?? null, elliott: elliottScene, pring: pringScene,
  }), [currentBars, smc, wyckoffResult, layerState, primitives, draftPrimitive, elliottDraft, elliottProposal, fibExtensionMode, highlightRange, volumeExtras, elliottScene, pringScene]);
  const scene = useMemo(() => (structureItems.length ? { items: [...structureItems, ...baseScene.items] } : baseScene), [structureItems, baseScene]);
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
    const projRoom = proj?.legs.length ? Math.min(60, proj.legs[proj.legs.length - 1].k + 4) : 0;
    tv.setRightOffset(Math.max(structureRoom, projRoom));
  }, [structureOn, structure.data, structureMode, currentBars, timeframe, replayed, layerState?.elliottProj, elliottScene]); // eslint-disable-line react-hooks/exhaustive-deps
  const openStructure = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.layers.enable("structure");
    if (structureMode === "overview") setStructureMode("trade");
    setTimeout(() => structurePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  // Bộ lọc -> "Mở trên biểu đồ với cấu trúc": bật lớp + chế độ Giao dịch sau khi đổi mã.
  useEffect(() => {
    const onOpen = () => { setTimeout(openStructure, 0); };
    window.addEventListener(STRUCTURE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(STRUCTURE_OPEN_EVENT, onOpen);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const structureTfa = structure.data ? structure.data.tfs[structureTfFor(timeframe) ?? "D"] ?? structure.data.tfs.D : undefined;

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
  const handleSuggestElliott = () => {
    if (!controllerRef.current) return;
    const st = timeframe === "W" ? mtf?.week ?? null : timeframe === "D" ? mtf?.day ?? null : null;
    const points = engineElliottPoints(st, currentBars) ?? suggestElliottPoints(currentBars);
    if (!points) { window.alert("Chưa đủ dữ liệu đỉnh/đáy rõ ràng để gợi ý sóng Elliott cho mã này."); return; }
    controllerRef.current.drawing.cancelElliottDraft();
    setElliottProposal(points);
  };
  const acceptElliottProposal = () => {
    const controller = controllerRef.current;
    if (!controller || !elliottProposal) return;
    controller.drawing.createElliottFromPoints(elliottProposal);
    controller.layers.enable("elliott");
    setElliottProposal(null);
  };

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
      <TimeframeSelector current={pendingTf ?? timeframe} onChange={handleTimeframeChange}
        loadingIntraday={intraday.isLoading} intradayError={intraday.error} intradaySessions={intraday.sessions.length} />
      {layerState && (
        <LayerToggleBar state={layerState}
          onToggle={(key: LayerKey) => controllerRef.current?.layers.toggle(key)}
          onToggleMaster={(on) => controllerRef.current?.layers.setMaster(on)} />
      )}

      <div className="flex flex-wrap items-center gap-2 -mt-1">
        <button type="button" onClick={openStructure} data-testid="structure-open"
          className="px-3 py-1 rounded-full text-[10px] font-black border border-cyan-400/40 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition">
          Phân tích cấu trúc
        </button>
        {structureOn && structure.isLoading && !structure.data && <span className="text-[10px] text-slate-500">Đang phân tích Tuần / Ngày / 1 giờ (SSI)…</span>}
      </div>

      <div className="relative" style={{ height: "70vh", minHeight: 420 }} data-testid="ta-chart">
        {structureOn && structure.data && (
          <div className={`absolute top-3 z-10 max-w-[60%] px-2 py-1 rounded-lg bg-slate-950/85 border text-[10px] leading-snug ${VERDICT_CHIP[VERDICT_TONE[structure.data.align.verdict]]}`}
            style={{ right: 72 }} data-testid="structure-chip" title={structure.data.align.text}>
            <b>{structure.data.align.verdict}</b>
            <span className="text-slate-300"> · {structureTfa ? `${structureTfa.tf === "H1" ? "1 giờ" : structureTfa.tf === "W" ? "Tuần" : "Ngày"}: ${STAGE_SHORT[structureTfa.stage]} (${structureTfa.stageAge} nến)` : ""}</span>
            <span className="hidden sm:inline text-slate-400"> · {structure.data.align.rule}</span>
          </div>
        )}
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
          {elliottProposal && (
            <span className="text-[10px] text-amber-300 flex items-center gap-1.5 bg-slate-900/85 px-2 py-1 rounded-lg" data-testid="elliott-proposal">
              Gợi ý Elliott (nháp) ·
              <button type="button" className="underline text-emerald-300" onClick={acceptElliottProposal} data-testid="elliott-proposal-accept">Chấp nhận</button>
              <button type="button" className="underline text-slate-400" onClick={() => setElliottProposal(null)}>Huỷ</button>
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
          tabIndex={0}
          role="application"
          aria-label={`Biểu đồ ${ticker} — bàn phím: ← → dịch nến (Shift ×4), + − zoom, Home/End về đầu/cuối`}
          title="Bấm vào biểu đồ rồi dùng ← → (Shift: nhanh), + −, Home, End"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{
            background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", height: "100%",
            cursor: activeTool ? "crosshair" : "default", touchAction: activeTool ? "none" : "auto",
          }}
          className="rounded-xl overflow-hidden relative w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
        />
      </div>

      {structureOn && (
        <div ref={structurePanelRef}>
          <StructurePanel doc={structureDoc ?? undefined} isLoading={structure.isLoading} error={structure.error}
            mode={structureMode} onModeChange={setStructureMode} timeframeKey={structureTfFor(timeframe)}
            onOpenChart={onRequestTickerChange}
            replay={{
              index: replayIdx, min: REPLAY_MIN_BARS - 1, max: bars.length - 1, date: replayIdx != null ? bars[replayIdx]?.date ?? null : null,
              available: (timeframe === "D" || timeframe === "W") && bars.length > REPLAY_MIN_BARS + 5, onChange: setReplayIdx,
            }} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} choch={smc.choch} totals={smc.totals} barCount={currentBars.length} />
        <VSAPanel signals={vsa} />
        {wyckoffResult && <WyckoffPanel result={wyckoffResult} barCount={currentBars.length} timeframe={timeframe} compare={controllerRef.current?.getAnalysis()?.wyckoffAlt ?? null} />}
        <ElliottWavePanel mtf={mtf} timeframe={timeframe} intraday={intradayElliott} tree={waveTree}
          autoOn={!!layerState?.elliottAuto} oscOn={!!layerState?.elliottOsc}
          onToggleAuto={() => controllerRef.current?.layers.toggle("elliottAuto")}
          onToggleOsc={() => controllerRef.current?.layers.toggle("elliottOsc")}
          fibOn={!!layerState?.elliottFib} projOn={!!layerState?.elliottProj}
          onToggleFib={() => controllerRef.current?.layers.toggle("elliottFib")}
          onToggleProj={() => controllerRef.current?.layers.toggle("elliottProj")}
          guideOn={!!layerState?.elliottGuide} onToggleGuide={() => controllerRef.current?.layers.toggle("elliottGuide")}
          subOn={!!layerState?.elliottSub} onToggleSub={() => controllerRef.current?.layers.toggle("elliottSub")}
          pick={elliottPick} onPick={setElliottPick} lastClose={currentBars[currentBars.length - 1]?.close ?? null}
          editing={countEditing} onEdit={startCountEdit}
          hasMine={!!userCounts.active} mineOn={!!layerState?.elliottMine} onToggleMine={() => controllerRef.current?.layers.toggle("elliottMine")}
          onSuggest={handleSuggestElliott} detailOpen={elliottDetail} onToggleDetail={() => setElliottDetail((v) => !v)} />
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
      {elliottDetail && mtf && <ElliottDeepPanel mtf={mtf} daily={bars} weekly={weeklyBars} ticker={ticker} onClose={() => setElliottDetail(false)} />}

      {chochBacktest && !isIntradayTf(timeframe) && <BacktestPanel data={chochBacktest} />}
      {isIntradayTf(timeframe) && (
        <p className="text-[9px] text-slate-500 rounded-xl p-3" style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} data-testid="backtest-intraday-note">
          Event study chỉ chạy trên khung D/W/M: cổ phiếu mua trong phiên chưa bán được trong ngày (T+2.5), đo lợi suất theo nến phút sẽ sai bản chất.
        </p>
      )}

      <OrderFlowPanel enabled={flowEnabled} loading={flow.isLoading} error={flow.error} orderFlow={orderFlow}
        largePrintThreshold={flow.data?.largePrintThreshold ?? null} foreign={flow.data?.foreign ?? []} coverage={flow.data?.coverage ?? null} />

      <OscillatorPanel rsi={rsiResult} macd={macdResult} adx={adxResult} />

      <AISignalLogPanel log={log} engineOn={!!layerState?.aiDetectionMaster} />
    </div>
  );
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
