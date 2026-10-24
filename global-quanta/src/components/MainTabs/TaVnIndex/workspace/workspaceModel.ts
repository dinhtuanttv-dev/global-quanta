// Super Chart SC1 — MÔ HÌNH BỐ CỤC tab TA VN-Index (hàm thuần, có test). Tách hẳn khỏi hình vẽ (theo mã) và kết quả phân tích:
// chỉ là sở thích hiển thị — preset, lớp đang bật, bảng chi tiết, dock, tỷ lệ pane, crosshair bám nến. Lưu theo tài khoản (lựa chọn 3).
import type { LayerKey, LayerState } from "../../../../lib/ta-command-center/LayerManager";
import { DEFAULT_LAYER_STATE } from "../../../../lib/ta-command-center/LayerManager";
import type { PaneKind } from "../../../../lib/ta-command-center/TVChartManager";

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
}

export const DEFAULT_WORKSPACE: Workspace = {
  schemaVersion: WORKSPACE_SCHEMA, preset: "clean", layers: {}, layout: "workspace",
  inspectorOpen: true, inspectorTab: "overview", dockOpen: true, dockTab: "methods", dockHeight: 420, paneStretch: {}, magnet: false, structureMode: "overview", mine: null,
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

/** Mốc khoảng nhìn (khung nhìn, không đổi độ phân giải nến): số nến theo khung. */
export type RangeId = "1P" | "5P" | "1T" | "3T" | "6T" | "1N" | "3N" | "all";
const BARS_PER_SESSION: Record<string, number> = { "1m": 255, "5m": 51, "15m": 17, "1H": 5 };
export function rangesFor(tf: string): { id: RangeId; label: string }[] {
  if (tf in BARS_PER_SESSION) return [{ id: "1P", label: "1 phiên" }, { id: "5P", label: "5 phiên" }, { id: "all", label: "Tất cả" }];
  if (tf === "W") return [{ id: "6T", label: "6T" }, { id: "1N", label: "1N" }, { id: "3N", label: "3N" }, { id: "all", label: "Tất cả" }];
  if (tf === "M") return [{ id: "1N", label: "1N" }, { id: "3N", label: "3N" }, { id: "all", label: "Tất cả" }];
  return [{ id: "1T", label: "1T" }, { id: "3T", label: "3T" }, { id: "6T", label: "6T" }, { id: "1N", label: "1N" }, { id: "3N", label: "3N" }, { id: "all", label: "Tất cả" }];
}
export function rangeBars(tf: string, id: RangeId): number {
  if (id === "all") return Infinity;
  const sessions = { "1P": 1, "5P": 5, "1T": 21, "3T": 63, "6T": 126, "1N": 250, "3N": 750 }[id];
  if (tf in BARS_PER_SESSION) return sessions * BARS_PER_SESSION[tf];
  if (tf === "W") return Math.round(sessions / 5);
  if (tf === "M") return Math.round(sessions / 21);
  return sessions;
}
