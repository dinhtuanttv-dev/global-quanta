"use client";

// Biểu đồ TA VN-Index — P3 (TA_VNINDEX_UPGRADE_SPEC §2.1.1):
//   - Lightweight Charts v5: pane giá · khối lượng · RSI14; lớp phủ canvas (OverlayPrimitive) cắt đúng trong vùng giá,
//     tự theo zoom/pan, tối đa 12 nhãn không chồng nhau — thay lớp SVG + forceTick cũ.
//   - Pointer Events: vẽ bằng chuột, cảm ứng, bút (khoá kéo/zoom biểu đồ khi đang vẽ).
//   - quant-core chạy trong Web Worker (AnalysisController); hình vẽ lưu theo mã + tài khoản (chartDrawingsStore).
//   - MẶC ĐỊNH TẮT mọi chỉ báo/công cụ (chỉ có nến); bật lớp nào mới vẽ lớp đó. Mọi thứ là series/marker/primitive
//     của thư viện -> kéo chuột, cuộn, zoom và BÀN PHÍM (← → + − Home End) đều di chuyển cùng nến.
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
import { SMCPanel, VSAPanel, WyckoffPanel } from "./MethodPanels";
import ElliottWavePanel, { ElliottDeepPanel } from "./ElliottWavePanel";
import { TA_INDICES } from "./TickerSelector";
import type { WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import { calculateRSI, calculateMACD, calculateADX } from "../../../lib/ta-command-center/detectors/technicalOscillators";
import type { OhlcvBar, PatternMatch } from "../../../lib/ta-command-center/types";
import type { DrawingToolType, DrawnPrimitive, DomainPoint } from "../../../lib/ta-command-center/DrawingManager";
import type { AnalysisController as Controller } from "../../../lib/ta-command-center/AnalysisController";
import type { LayerState, LayerKey } from "../../../lib/ta-command-center/LayerManager";
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

export default function TVChartPanel({ bars, ticker, highlightPattern, corporateActions = NO_ACTIONS, benchmarkBars = null }: Props) {
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
    if (layerState.orderflow && orderFlow) {
      for (const a of orderFlow.absorption) markers.push({ time: a.date, position: a.dir === "bullish" ? "belowBar" : "aboveBar", color: GQ_COLORS.uv, shape: "square", text: "ABS" });
      for (const d of orderFlow.divergences) markers.push({ time: d.date, position: d.dir === "bullish" ? "belowBar" : "aboveBar", color: GQ_COLORS.amber, shape: d.dir === "bullish" ? "arrowUp" : "arrowDown", text: "Div" });
    }
    tvManagerRef.current.setMarkers(markers.filter((m) => visibleDates.has(m.time)));
  }, [smc, vsa, layerState, corporateActions, currentBars, timeframe, orderFlow]);

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
  const elliottScene = useMemo(() => {
    if (!mtf) return null;
    if (timeframe === "W") return { primary: mtf.week };
    if (timeframe !== "D") return null;
    const higher = mtf.week?.scenario
      ? { points: mtf.weekPivotsOnDaily.map((p) => ({ date: p.dayDate, price: p.price })), labels: mtf.weekPivotsOnDaily.map((_, k) => `(${k})`) } : null;
    return { primary: mtf.day, higher };
  }, [mtf, timeframe]);

  // ---- Lớp phủ canvas ----
  const scene = useMemo(() => buildScene({
    bars: currentBars, smc, wyckoff: wyckoffResult, layers: layerState, primitives, draft: draftPrimitive,
    elliottDraft: elliottProposal ?? elliottDraft, fibExtension: fibExtensionMode, highlight: highlightRange,
    profile: volumeExtras?.profile ?? null, avwap: volumeExtras?.avwap ?? null, elliott: elliottScene,
  }), [currentBars, smc, wyckoffResult, layerState, primitives, draftPrimitive, elliottDraft, elliottProposal, fibExtensionMode, highlightRange, volumeExtras, elliottScene]);
  useEffect(() => { tvManagerRef.current?.setScene(scene); }, [scene]);

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
      <TimeframeSelector current={pendingTf ?? timeframe} onChange={handleTimeframeChange}
        loadingIntraday={intraday.isLoading} intradayError={intraday.error} intradaySessions={intraday.sessions.length} />
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} choch={smc.choch} totals={smc.totals} barCount={currentBars.length} />
        <VSAPanel signals={vsa} />
        {wyckoffResult && <WyckoffPanel result={wyckoffResult} barCount={currentBars.length} timeframe={timeframe} compare={controllerRef.current?.getAnalysis()?.wyckoffAlt ?? null} />}
        <ElliottWavePanel mtf={mtf} timeframe={timeframe}
          autoOn={!!layerState?.elliottAuto} oscOn={!!layerState?.elliottOsc}
          onToggleAuto={() => controllerRef.current?.layers.toggle("elliottAuto")}
          onToggleOsc={() => controllerRef.current?.layers.toggle("elliottOsc")}
          onSuggest={handleSuggestElliott} detailOpen={elliottDetail} onToggleDetail={() => setElliottDetail((v) => !v)} />
      </div>
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
