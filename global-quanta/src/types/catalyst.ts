export interface MacroEventSummary {
  sourceId: string;
  title: string;
  executionDate: string;
  daysRemaining: number;
  direction: "benefit" | "harm";
  category: string;
}

export interface TickerImpactResult {
  direction: "benefit" | "harm" | "none";
  compositeScore: number;
}

export interface CatalystSnapshot {
  scannedAt: string;
  sectors: unknown[];
  emerging: unknown[];
  upMovers: unknown[];
  downMovers: unknown[];
  totalBenefitCount: number;
  totalHarmCount: number;
  activeAlerts: unknown[];
  upcomingEvents: MacroEventSummary[];
  tickerImpacts: Record<string, TickerImpactResult>;
}
