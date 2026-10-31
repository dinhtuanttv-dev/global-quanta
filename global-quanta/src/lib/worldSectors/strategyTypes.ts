// Hợp đồng dữ liệu Gateway /api/world-sectors/strategy (S1–S2).
import type { RegionId } from "./types";

export type ShortStance = "overweight" | "neutral" | "underweight" | "na";
export type MediumStance = "supportive" | "mixed" | "neutral" | "adverse";

export interface ShortRow {
  icb: string; nameVi: string; parent: string | null; score: number; zx: number; stance: ShortStance;
  ic: number; icBasisVi: string; sigmaBps: number | null; alphaBps: number | null; pOutperform: number | null;
  evidence: { label: string; labelVi: string } | null; byRegion: Partial<Record<RegionId, { z: number; n: number }>>; commodity: number | null;
  constituents: { ticker: string; weight: number }[];
}
export interface MediumRow {
  icb: string; nameVi: string; parent: string | null; stance: MediumStance; votes: [number, number, number];
  ws: { score: number | null; label: string; gap3m: number | null; commodity: number | null; m1: number | null };
  rrg: { quadrant: string; state: string | null; accumulation: number | null; foreignNet20: number | null; weeksSinceImproving: number | null } | null;
  basket: string | null;
  factorPressure: { score: number | null; links: { factor: string; tier: string; beta: number; lag: number; z: number | null; push: number | null }[] };
  confirm: { id: string; factor: string; confirmed: boolean; signOk: boolean | null; q: number }[];
  scenarios: { id: string; nameVi: string; estPct: number | null; lo: number | null; hi: number | null; conclusive: boolean; unreliable: boolean }[];
  constituents: { ticker: string; weight: number }[];
}
export interface Forward {
  /** Phiên VN không có bản ghi (không ghi bù). */
  missing?: string[];
  since: string | null; recorded: number; evaluated: number; meanIc: number | null; t: number | null; p: number | null; hitRate: number | null;
  cumSpreadPct: number | null; curve: [string, number][]; days: { date: string; next: string; ic: number | null; spreadPct: number; n: number }[];
  statusVi: string; methodVi: string;
}
export interface Strategy {
  version: string; generatedAt: string; vnLast: string | null;
  evidence: { short: { label: string; ic: number; t: number; version: string; sample: string }; medium: { label: string; reasonVi: string } };
  regime: { stressed: boolean; vix: number | null; vixChg: number | null; dxy: number | null; dxyChg: number | null; us10y: number | null; date: string | null; noteVi: string };
  method: { shortVi: string; mediumVi: string };
  short: { n: number; rows: ShortRow[] };
  medium: MediumRow[];
  forward: Forward;
  sources: Record<string, boolean | number>;
}

export const SHORT_STANCE_VI: Record<ShortStance, string> = { overweight: "Ưu tiên", neutral: "Trung tính", underweight: "Giảm tỷ trọng", na: "—" };
export const MEDIUM_STANCE_VI: Record<MediumStance, string> = { supportive: "Bối cảnh thuận", mixed: "Hỗn hợp", neutral: "Trung tính", adverse: "Bối cảnh bất lợi" };
export const QUADRANT_VI: Record<string, string> = { LEADING: "Dẫn dắt", IMPROVING: "Cải thiện", WEAKENING: "Suy yếu", LAGGING: "Tụt hậu" };
