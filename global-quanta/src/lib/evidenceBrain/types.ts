export type EvidenceFreshness = "CURRENT" | "STALE" | "MISSING" | "UNKNOWN";
export type EvidenceStatus = "VERIFIED" | "DERIVED" | "AI_INTERPRETATION" | "USER_NOTE";
export type SnapshotCompleteness = "COMPLETE" | "PARTIAL" | "STALE" | "CONFLICT";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface EvidenceRef {
  id: string;
  domain: "decision" | "profile" | "price_action" | "catalyst" | "volume" | "ledger" | "risk";
  subject: string;
  fieldPath: string;
  value: JsonValue;
  unit: string | null;
  status: EvidenceStatus;
  freshness: EvidenceFreshness;
  asOf: string | null;
  source: string;
  sourceVersion: string | null;
  methodVersion: string | null;
  limitation: string | null;
  url: string | null;
}

export interface SnapshotSource {
  key: string;
  label: string;
  endpoint: string;
  state: "LOADED" | "LOADING" | "ERROR" | "NOT_REQUESTED" | "UNAVAILABLE";
  asOf: string | null;
  version: string | null;
  error: string | null;
  warnings: string[];
}

export interface EvidenceSnapshot {
  schemaVersion: "vee-1.0";
  snapshotId: string;
  createdAt: string;
  scope: "ticker" | "portfolio";
  ticker: string | null;
  tickerVerified: boolean | null;
  decisionSession: string | null;
  portfolioKind: string | null;
  completeness: SnapshotCompleteness;
  sources: SnapshotSource[];
  funnel: {
    mode: "GATE" | "DISPLAY" | null;
    steps: { index: number; label: string; count: number | null; parallel: boolean; displayOnly: boolean; countedOn: string }[];
    membership: { state: string; rank: number | null; reason: string | null; pz: string | null };
    branch: { previous: number; kept: number; added: number; exited: number; held: number } | null;
    checks: string[];
    frozen: boolean;
    frozenReasons: string[];
  };
  data: Record<string, JsonValue>;
  refs: EvidenceRef[];
  missing: string[];
  stale: string[];
  conflicts: string[];
  limitations: string[];
}

export type ClaimSide = "BULL" | "BEAR" | "JUDGE";
export type ClaimClass = "FACT" | "ENGINE_OUTPUT" | "STATISTICAL_RESULT" | "MODEL_INTERPRETATION" | "UNKNOWN";
export type ClaimValidationState = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "MISREPRESENTED" | "UNKNOWN";

export interface StructuredClaim {
  id: string;
  side: ClaimSide;
  ticker: string | null;
  asOf: string | null;
  text: string;
  classification: ClaimClass;
  refs: string[];
  supports: string[];
  invalidates: string[];
  numericAssertions: { refId: string; value: number; unit: string | null }[];
  horizon: string | null;
  uncertainty: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  invalidation: string | null;
  missingData: string[];
}

export interface ValidatedClaim extends StructuredClaim {
  validation: ClaimValidationState;
  validationNotes: string[];
}

export interface ClaimBundle {
  schemaVersion: "claims-1.0";
  snapshotId: string;
  claims: StructuredClaim[];
  limitations: string[];
}

export interface ClaimParseResult {
  ok: boolean;
  bundle: ClaimBundle | null;
  claims: ValidatedClaim[];
  error: string | null;
  summary: { supported: number; partial: number; unsupported: number; unknown: number };
}
