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

// Hinh dang THAT cua tung phan tu "emerging" - la nguon tin MOI phat hien,
// KHONG PHAI ket qua tong hop cap nganh (khac han CatalystSector).
export interface EmergingSourceSummary {
  sourceId: string;
  title: string;
  category: string;
  corroborationCount: number;
  affectedTargetCount: number;
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

export interface MacroCalendarEvent {
  sourceId: string;
  title: string;
  executionDate: string;
  daysRemaining: number;
  direction: "benefit" | "harm";
  category: string;
}

export interface CatalystSnapshot {
  scannedAt: string;
  sectors: CatalystSector[];
  emerging: EmergingSourceSummary[];
  upMovers: MoverItem[];
  downMovers: MoverItem[];
  totalBenefitCount: number;
  totalHarmCount: number;
  activeAlerts: unknown[];
  upcomingEvents: MacroCalendarEvent[];
  tickerImpacts: Record<string, TickerImpactResult>;
  isStale: boolean;
  ageMinutes: number;
}

export interface CatalystErrorResponse {
  error: string;
}

export interface UnmappedSectorItem { rawKey: string; count: number; }
export interface UnmappedSectorsResponse { items: UnmappedSectorItem[]; totalUnique: number; }
export interface DomesticEventStage {
  label: string;
  date: string | null;
}

export interface DomesticEvent {
  id: string;
  tag: "NANG_HANG_THI_TRUONG" | "KY_REVIEW_CHI_SO" | "ROOM_NGOAI" | "IPO_NIEM_YET" | "CHINH_SACH";
  title: string;
  stages: DomesticEventStage[];
  activeStageIndex: number;
  effectiveDate: string;
  sourceUrl: string;
  sourceName: string;
  note: string;
  daysUntil: number;
  isPast: boolean;
}
export interface Vn30ReviewFinding {
  found: boolean;
  announcementDate: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  checkedAt: string;
}
