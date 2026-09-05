export type ImpactDirection = "benefit" | "harm" | "none";
export type PropagationDistance = "direct" | "downstream";
export type Horizon = "short" | "medium" | "long";
export type PriceInStatus = "not_reflected" | "partially_reflected" | "reflected";
export type VolumeFlag = "none" | "confirmed" | "diverging";
export type ForeignFlowDirection = "none" | "buying" | "selling";

export interface CatalystCard {
  ticker: string;
  sourceId: string;
  sourceTitle: string;
  direction: ImpactDirection;
  netSignedImpact: number;
  propagationDistance: PropagationDistance;
  hopCount: number;
  horizon: Horizon;
  scheduled: boolean;
  daysRemaining: number | null;
  corroborationCount: number;
  historicalWinRate: number;
  priceInStatus: PriceInStatus;
  volumeFlag: VolumeFlag;
  foreignFlowDirection: ForeignFlowDirection;
  opportunityScore: number;
  isBestPickInGroup: boolean;
  isConflicted: boolean;
  isWatchlisted: boolean;
  compositeScore: number;
  trustScore: number;
}

export interface CatalystSector {
  sector: string;
  netScore: number;
  opportunityScore: number;
  tickerCount: number;
  isNew: boolean;
  freshnessScore: number;
  primaryCards: CatalystCard[];
  cascadeCards: CatalystCard[];
}

export interface MoverItem {
  rank: number;
  prevRank: number;
  ticker: string;
  label: string;
  compositeScore: number;
  isWatchlisted: boolean;
}

export interface TickerImpactResult {
  direction: ImpactDirection;
  compositeScore: number;
}

export interface CatalystSnapshot {
  scannedAt: string;
  sectors: CatalystSector[];
  emerging: CatalystSector[];
  upMovers: MoverItem[];
  downMovers: MoverItem[];
  totalBenefitCount: number;
  totalHarmCount: number;
  activeAlerts: unknown[];
  upcomingEvents: unknown[];
  tickerImpacts: Record<string, TickerImpactResult>;
  isStale: boolean;
  ageMinutes: number;
}

export interface CatalystErrorResponse {
  error: string;
}
export interface UnmappedSectorItem { rawKey: string; count: number; }
export interface UnmappedSectorsResponse { items: UnmappedSectorItem[]; totalUnique: number; }
