// Super Chart SC1 — MÔ HÌNH BỐ CỤC tab TA VN-Index (hàm thuần, có test). Tách hẳn khỏi hình vẽ (theo mã) và kết quả phân tích:
// chỉ là sở thích hiển thị — preset, lớp đang bật, bảng chi tiết, dock, tỷ lệ pane, crosshair bám nến. Lưu theo tài khoản (lựa chọn 3).
import type { LayerKey, LayerState } from "../../../../lib/ta-command-center/LayerManager";
import { DEFAULT_LAYER_STATE } from "../../../../lib/ta-command-center/LayerManager";
import type { PaneKind } from "../../../../lib/ta-command-center/TVChartManager";
import { DEFAULT_INDICATORS, sanitizeIndicators, type IndicatorSettings } from "./indicatorSettings";

export const WORKSPACE_SCHEMA = 1;
export type PresetId = "clean" | "priceVolume" | "structure" | "momentum" | "elliott" | "manual" | "mine" | "custom";
export type InspectorTab = "overview" | "objects" | "notes";
export type DockTab = "structure" | "elliott" | "methods" | "flow" | "indicators" | "backtest" | "log";
export type StructureModePref = "overview" | "trade" | "deep";

export interface Workspace {
  schemaVersion: number;
  preset: PresetId;
  /** Lớp đang bật do NGƯỜI DÙNG chọn (nhớ giữa các lần mở). Chỉ các khoá của LayerState. */
  layers: Partial<LayerState>;
  layout: "workspace" | "classic";
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  dockOpen: boolean;
  dockTab: DockTab;
  dockHeight: number;
  paneStretch: Partial<Record<PaneKind, number>>;
  magnet: boolean;
  structureMode: StructureModePref;
  /** "Bố cục của tôi": bộ lớp người dùng tự lưu (null = chưa lưu). */
  mine: Partial<LayerState> | null;
  /** R5: tham số chỉ báo người dùng chỉnh (mặc định = công thức chuẩn). */
  indicators: IndicatorSettings;
}

export const DEFAULT_WORKSPACE: Workspace = {
  schemaVersion: WORKSPACE_SCHEMA, preset: "clean", layers: {}, layout: "workspace",
  inspectorOpen: true, inspectorTab: "overview", dockOpen: true, dockTab: "methods", dockHeight: 420, paneStretch: {}, magnet: false, structureMode: "overview", mine: null,
  indicators: DEFAULT_INDICATORS,
};

const ENUM = {
  preset: ["clean", "priceVolume", "structure", "momentum", "elliott", "manual", "mine", "custom"],
  layout: ["workspace", "classic"],
  inspectorTab: ["overview", "objects", "notes"],
  dockTab: ["structure", "elliott", "methods", "flow", "indicators", "backtest", "log"],
  structureMode: ["overview", "trade", "deep"],
} as const satisfies Partial<Record<keyof Workspace, readonly string[]>>;
const PANES: PaneKind[] = ["volume", "rsi", "macd", "adx", "flow", "foreign", "eosc"];

/** Đọc bố cục từ máy / đám mây (không tin dữ liệu): khoá lạ bỏ, giá trị sai -> mặc định. */
export function sanitizeWorkspace(raw: unknown): Workspace {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <K extends keyof typeof ENUM>(k: K) => ((ENUM[k] as readonly string[]).includes(r[k] as string) ? r[k] : DEFAULT_WORKSPACE[k]) as Workspace[K];
  const layerObj = (x: unknown): Partial<LayerState> => {
    const out: Partial<LayerState> = {};
    if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (k in DEFAULT_LAYER_STATE && typeof v === "boolean") out[k as keyof LayerState] = v;
    return out;
  };
  const layers = layerObj(r.layers);
  const paneStretch: Workspace["paneStretch"] = {};
  if (r.paneStretch && typeof r.paneStretch === "object") for (const [k, v] of Object.entries(r.paneStretch)) if (PANES.includes(k as PaneKind) && Number.isFinite(v) && (v as number) > 0 && (v as number) <= 1) paneStretch[k as PaneKind] = v as number;
  const bool = (k: "inspectorOpen" | "dockOpen" | "magnet") => (typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_WORKSPACE[k]);
  const h = Number(r.dockHeight);
  return {
    schemaVersion: WORKSPACE_SCHEMA, preset: pick("preset"), layers, layout: pick("layout"), inspectorOpen: bool("inspectorOpen"), inspectorTab: pick("inspectorTab"),
    dockOpen: bool("dockOpen"), dockTab: pick("dockTab"), dockHeight: Number.isFinite(h) ? Math.min(1200, Math.max(160, Math.round(h))) : DEFAULT_WORKSPACE.dockHeight,
    paneStretch, magnet: bool("magnet"), structureMode: pick("structureMode"), mine: r.mine && typeof r.mine === "object" ? layerObj(r.mine) : null,
    indicators: sanitizeIndicators(r.indicators),
  };
}

export interface Preset { id: Exclude<PresetId, "custom">; label: string; hint: string; layers: LayerKey[]; dockTab: DockTab; inspectorTab?: InspectorTab }
/** 6 preset (anh duyệt, lựa chọn 2): CHỈ đổi lớp + bố cục, không đụng dữ liệu / hình vẽ / cách đếm của người dùng. */
export const PRESETS: readonly Preset[] = [
  { id: "clean", label: "Giá sạch", hint: "Chỉ nến + crosshair", layers: [], dockTab: "methods" },
  { id: "priceVolume", label: "Giá + KL", hint: "Nến + pane khối lượng", layers: ["volume"], dockTab: "flow" },
  { id: "structure", label: "Cấu trúc", hint: "Cấu trúc MTF + SMC + Wyckoff", layers: ["structure", "smc", "wyckoff"], dockTab: "structure" },
  { id: "momentum", label: "Động lượng", hint: "Khối lượng + RSI; bật thêm pane MACD / ADX trong menu Lớp", layers: ["volume", "rsi"], dockTab: "indicators" },
  { id: "elliott", label: "Elliott", hint: "Elliott Pro (+ cách đếm của tôi)", layers: ["elliottPro", "elliottMine"], dockTab: "elliott" },
  { id: "manual", label: "Vẽ tay", hint: "Hiện mọi hình vẽ tay + danh sách đối tượng", layers: ["trendline", "demandzone", "elliott"], dockTab: "methods", inspectorTab: "objects" },
] as const;

/** Lớp của preset dưới dạng trạng thái đầy đủ (mọi lớp khác TẮT; Confluence Engine giữ nguyên — không phải lớp hiển thị). */
export function presetLayers(p: Preset, current: LayerState): Partial<LayerState> {
  const out: Partial<LayerState> = {};
  for (const k of Object.keys(DEFAULT_LAYER_STATE) as (keyof LayerState)[]) if (k !== "aiDetectionMaster") out[k] = (p.layers as readonly string[]).includes(k);
  return { ...out, aiDetectionMaster: current.aiDetectionMaster };
}

const onKeys = (l: Partial<LayerState>) => (Object.keys(l) as (keyof LayerState)[]).filter((k) => k !== "aiDetectionMaster" && l[k]).sort().join(",");
/** Lớp người dùng đang bật -> preset tương ứng nếu khớp đúng ("Bố cục của tôi" nếu trùng bản đã lưu), ngược lại "custom". */
export function matchPreset(layers: LayerState, mine: Partial<LayerState> | null = null): PresetId {
  const on = onKeys(layers);
  const p = PRESETS.find((x) => [...x.layers].sort().join(",") === on);
  if (p && (p.id !== "clean" || !mine)) return p.id;
  if (mine && onKeys(mine) === on) return "mine";
  return p?.id ?? "custom";
}
/** Trạng thái lớp ĐẦY ĐỦ từ bộ lớp đã lưu (lớp không có trong bộ -> tắt; Confluence Engine giữ nguyên). */
export function fullLayers(saved: Partial<LayerState>, current: LayerState): Partial<LayerState> {
  const out: Partial<LayerState> = {};
  for (const k of Object.keys(DEFAULT_LAYER_STATE) as (keyof LayerState)[]) if (k !== "aiDetectionMaster") out[k] = saved[k] === true;
  return { ...out, aiDetectionMaster: current.aiDetectionMaster };
}

/** Lớp đáng lưu: chỉ những lớp đang BẬT (mặc định mọi lớp tắt — yêu cầu 03/10/2026). */
export const layersToSave = (s: LayerState): Partial<LayerState> =>
  Object.fromEntries((Object.keys(s) as (keyof LayerState)[]).filter((k) => s[k]).map((k) => [k, true])) as Partial<LayerState>;

/** Mốc khoảng nhìn (khung nhìn, không đổi độ phân giải nến): số nến theo khung.
 *  TA-T3 (Q4, 28/11): thêm 5 ngày · Đầu năm · 5 năm như TradingView; nhãn rõ nghĩa (1Năm / 3Năm). Mã data-range cũ giữ nguyên (hợp đồng E2E). */
export type RangeId = "1P" | "5P" | "5D" | "1T" | "3T" | "6T" | "YTD" | "1N" | "3N" | "5Y" | "all";
const BARS_PER_SESSION: Record<string, number> = { "1m": 255, "5m": 51, "15m": 17, "1H": 5 };
const LABEL: Record<RangeId, string> = { "1P": "1 phiên", "5P": "5 phiên", "5D": "5N", "1T": "1T", "3T": "3T", "6T": "6T", YTD: "Đầu năm", "1N": "1Năm", "3N": "3Năm", "5Y": "5Năm", all: "Tất cả" };
export const RANGE_TITLE: Record<RangeId, string> = { "1P": "1 phiên", "5P": "5 phiên", "5D": "5 ngày", "1T": "1 tháng", "3T": "3 tháng", "6T": "6 tháng", YTD: "Từ đầu năm", "1N": "1 năm", "3N": "3 năm", "5Y": "5 năm", all: "Toàn bộ dữ liệu" };
const pick = (ids: RangeId[]) => ids.map((id) => ({ id, label: LABEL[id] }));
export function rangesFor(tf: string): { id: RangeId; label: string }[] {
  if (tf in BARS_PER_SESSION) return pick(["1P", "5P", "all"]);
  if (tf === "W") return pick(["6T", "YTD", "1N", "3N", "5Y", "all"]);
  if (tf === "M") return pick(["1N", "3N", "5Y", "all"]);
  return pick(["5D", "1T", "3T", "6T", "YTD", "1N", "3N", "5Y", "all"]);
}
/** Số nến cho mốc khoảng nhìn. "Đầu năm" cần danh sách nến (đếm nến từ 01/01 năm của nến cuối). */
export function rangeBars(tf: string, id: RangeId, bars?: readonly { date: string }[]): number {
  if (id === "all") return Infinity;
  if (id === "YTD") {
    if (!bars?.length) return tf === "W" ? 26 : 126;
    const y = bars[bars.length - 1].date.slice(0, 4);
    let n = 0; for (let i = bars.length - 1; i >= 0 && bars[i].date.slice(0, 4) === y; i--) n++;
    return Math.max(1, n);
  }
  const sessions = { "1P": 1, "5P": 5, "5D": 5, "1T": 21, "3T": 63, "6T": 126, "1N": 250, "3N": 750, "5Y": 1250 }[id];
  if (tf in BARS_PER_SESSION) return sessions * BARS_PER_SESSION[tf];
  if (tf === "W") return Math.round(sessions / 5);
  if (tf === "M") return Math.round(sessions / 21);
  return sessions;
}
