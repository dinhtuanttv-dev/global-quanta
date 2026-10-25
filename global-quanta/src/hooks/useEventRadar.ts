import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../services/marketDataClient";

export interface EventRadarEvent {
  eventId: string;
  clusterId: string | null;
  source: string;
  sourceLabel: string;
  sourceAuthority: string;
  usageTermsStatus: string;
  verificationStatus: string;
  title: string;
  summary: string;
  url: string | null;
  attachment: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  updatedAt: string | null;
  eventType: string;
  eventLabel: string;
  tickers: string[];
  entityMatch: string;
  entityConfidence: number;
  severity: string;
  severityScore: number;
  corroboratingSources: string[];
  corroborationCount: number;
  documentCount: number;
  sourceDocuments: { eventId: string; source: string; sourceLabel: string; url: string | null; publishedAt: string | null; verificationStatus: string; usageTermsStatus: string }[];
  revision: number;
  reactionStatus: string;
}

export interface EventRadarResponse {
  generatedAt: string | null;
  events: EventRadarEvent[];
  sources: Record<string, { ok: boolean; items?: number; error?: string; coverage?: { symbolsRequested: number; universeSize: number; capped: boolean } }>;
  meta: {
    storage: { kind: string; durability: string; configuredPath: boolean; singleWriter: boolean };
    disclosureCoverage: string;
    pollIntervalMs: number;
    disclaimer: string;
  };
}

export function useEventRadar(opts: { ticker?: string; category?: string; limit?: number } = {}) {
  const enabled = isMarketGatewayEnabled();
  const { data, error, isLoading, mutate } = useSWR<EventRadarResponse>(
    enabled ? ["event-radar", opts.ticker ?? "", opts.category ?? "", opts.limit ?? 100] : null,
    () => fetchMarketJson<EventRadarResponse>("/api/market/event-radar", {
      ticker: opts.ticker, category: opts.category, limit: opts.limit ?? 100,
    }),
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
  );
  return { data, error, isLoading, refresh: mutate, enabled };
}

