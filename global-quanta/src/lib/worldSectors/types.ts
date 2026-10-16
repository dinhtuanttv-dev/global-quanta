// Hợp đồng dữ liệu Gateway /api/world-sectors/* (backend/src/market/worldSectors).
export type RegionId = "US" | "EU" | "JP" | "KR" | "TW" | "CN";
export type Match = "exact" | "close" | "partial";
export type WsLabel = "tailwind" | "headwind" | "neutral" | "na";

export interface Agg { score: number | null; byRegion: Partial<Record<RegionId, { z: number; n: number }>> }
export interface Evidence { label: "EVIDENCE" | "EXPERIMENTAL"; labelVi: string; ic?: number; q?: number; t?: number; p?: number; pass?: boolean }

export interface WsRow {
  icb: string; nameVi: string; parent: string | null; available: boolean; members: number | null; vnLast: string | null;
  short: { score: number | null; sectors: Agg; commodity: number | null; label: WsLabel; week: Agg; evidence: Evidence };
  medium: { score: number | null; sectors: Agg; m1: Agg; commodity: number | null; label: WsLabel; gap3m: number | null; vn: { w1: Move | null; m1: Move | null; m3: Move | null } };
  heat: Partial<Record<RegionId, { new: number | null; w1: number | null; m1: number | null; m3: number | null; n: number; best: Match }>>;
  drivers: { id: string; nameVi: string; sign: 1 | -1; short: (Move & { sessions?: string[] }) | null; medium: Move | null }[];
}
export interface Move { z: number | null; pct: number | null }

export interface WsScores {
  generatedAt: string;
  evidence: { version: string; sample: string; short: Evidence; medium: Evidence; reasonVi: string };
  method: { vi: string };
  regions: Record<RegionId, { nameVi: string; session: string }>;
  rows: WsRow[];
  rankings: Record<"short" | "medium", Record<"tailwind" | "headwind", { icb: string; nameVi: string; score: number }[]>>;
}

export interface WsRelation {
  symbol: string; region: RegionId; regionVi: string; nameVi: string; match: Match; matchVi: string; session: "prev" | "same"; unavailable?: boolean;
  n?: number; corr?: number | null; beta?: number | null; band?: number; significant?: boolean; contemporaneous?: number | null;
  leadLag?: { lag: number; r: number | null; n: number }[]; rolling?: [string, number | null][];
}
export interface WsComponent { symbol: string; region: RegionId; match: Match; session: string; lastDate: string | null; new: (Move & { sessions: string[] }) | null; w1: Move | null; m1: Move | null; m3: Move | null }

export interface WsDetail {
  icb: string; nameVi: string; available: boolean; reasonVi?: string; range: "1y" | "3y" | "5y"; from: string; vnLast: string; members: number | null;
  evidence: { short: Evidence; medium: { label: string; labelVi: string }; relationsVi: string; version: string };
  scores: { short: WsRow["short"]; medium: WsRow["medium"] };
  components: WsComponent[]; drivers: WsRow["drivers"];
  chart: { key: string; labelVi: string; region?: RegionId; rebased: [string, number][] }[];
  relations: WsRelation[];
  stocks: { symbol: string; weight: number; n?: number; corr?: number | null; beta?: number | null; d1?: number | null; m1?: number | null; m3?: number | null; lastDate?: string | null; error?: string }[];
  rebalanceDate: string | null; stocksNoteVi: string;
}

export const REGION_ORDER: RegionId[] = ["US", "EU", "JP", "KR", "TW", "CN"];
export const REGION_SHORT: Record<RegionId, string> = { US: "Mỹ", EU: "Âu", JP: "Nhật", KR: "Hàn", TW: "Đài", CN: "TQ/HK" };

/** Màu phân kỳ (dataviz: xanh dương ↔ đỏ, giữa xám) cho z ∈ [−3, 3]. */
const POS = [57, 135, 229], NEG = [230, 103, 103], MID = [56, 56, 53];
export function divergingColor(z: number | null | undefined): string {
  if (z == null || !Number.isFinite(z)) return "rgba(148,163,184,0.06)";
  const t = Math.min(1, Math.abs(z) / 2.5);
  const end = z >= 0 ? POS : NEG;
  const c = MID.map((m, i) => Math.round(m + (end[i] - m) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export const fmtZ = (z: number | null | undefined, d = 1) => (z == null || !Number.isFinite(z) ? "—" : `${z > 0 ? "+" : z < 0 ? "−" : ""}${Math.abs(z).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const labelVi: Record<WsLabel, string> = { tailwind: "Thuận gió", headwind: "Ngược gió", neutral: "Trung tính", na: "Chưa có thông tin mới" };
