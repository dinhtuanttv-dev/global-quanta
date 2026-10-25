import type { CellLike, ImpactPayloadLike } from '../macro-filter';

export interface Notice { notice?: string }
export interface HealthPayload { ok: boolean; dataVersion: string }
export interface SeriesInfo { id: string; nameVi: string; role: 'factor' | 'target'; unit: string; n: number; first: string | null; last: string | null; issues: { severity: string; message: string }[] }
export interface ScenarioInfo { id: string; nameVi: string; descriptionVi: string }
export interface SeriesPayload extends Notice { series: SeriesInfo[]; scenarios: ScenarioInfo[]; asOf: string }
export interface ImpactPayload extends ImpactPayloadLike, Notice {
  asOf: string; firstPeriod: string; lastPeriod: string; warnings: string[];
  options: { maxLag: number; adjust: string; alpha: number };
}
export interface CellDetailPayload extends Notice {
  factor: string; target: string; lag: number; nobs: number; beta: number; se: number; t: number; p: number; bootstrapCI: [number, number];
  rolling: { dates: string[]; beta: number[]; t: number[] };
}
export interface ThermoPayload extends Notice {
  target: string;
  thermometer: { value: number; band: string; bandVi: string; period: string; topContributors: { factor: string; contribution: number }[] } | null;
  backtest: { ic: number; icP: number; hitRate: number; gate: { pass: boolean; reasons: string[] } } | null;
  usableForDecisions: boolean;
  gateNote: string;
}
export interface ScenarioPayload extends Notice {
  scenario: ScenarioInfo; horizon: number; warnings: string[];
  ranking: { target: string; est: number; lo: number; hi: number; significant: boolean }[];
}
export interface CalendarPayload extends Notice { releases: { seriesId: string; nameVi: string; period: string; expectedDate: string; status: 'upcoming' | 'overdue'; daysUntil: number }[]; caveat: string }
export interface AlertsPayload extends Notice { alerts: { id: string; level: 'info' | 'warn' | 'high'; messageVi: string }[] }
export type { CellLike };
