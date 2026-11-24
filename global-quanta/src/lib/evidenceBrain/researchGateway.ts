import { getAccessToken } from "../../services/api";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { ResearchProjection, ResearchRun } from "./research";
import useSWR from "swr";

const BASE = "/api/elite/ai-room";
export interface ResearchSession {
  expectedClosedSession: string;
  marketDailySession: string | null;
  scannerSession: string | null;
  decisionSession: string | null;
  stage: "MARKET_DAILY" | "SCANNER" | "DECISION" | "PUBLISHED";
  observedAt: string;
  retryAt: string | null;
  eod: { confirmed: number; expected: number } | null;
  publication: string;
}

export function useResearchSession(enabled: boolean) {
  return useSWR(enabled ? "ai-room-session" : null, () => fetchMarketJson<ResearchSession>(`${BASE}/session`, {}, { signal: AbortSignal.timeout(5_000) }),
    { refreshInterval: 30_000, dedupingInterval: 15_000, revalidateOnFocus: true, errorRetryCount: 1 });
}
async function researchRequest<T>(path: string, params: Record<string, string>, init: RequestInit) {
  const token = await getAccessToken();
  if (!token) throw new Error("Cần đăng nhập để truy cập kho nghiên cứu trên Gateway.");
  return fetchMarketJson<T>(BASE + path, params, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

export function lockResearchSnapshot(ticker: string | null, signal: AbortSignal) {
  return researchRequest<ResearchProjection>("/snapshots", {}, { method: "POST", body: JSON.stringify({ ticker }), signal: AbortSignal.any([signal, AbortSignal.timeout(9_000)]) });
}

export type GatewayResearchRecord = { run: ResearchRun; approvedAt: string | null };
export function gatewayResearchRuns(ticker: string | null, offset = 0) {
  return researchRequest<{ records: GatewayResearchRecord[]; nextOffset: number | null }>("/runs", { ...(ticker ? { ticker } : {}), offset: String(offset) }, {});
}
export function gatewayResearchRun(id: string) {
  return researchRequest<GatewayResearchRecord>(`/runs/${encodeURIComponent(id)}`, {}, {});
}

export function persistGatewayResearch(run: ResearchRun, approve: boolean) {
  return researchRequest<GatewayResearchRecord>(`/runs/${encodeURIComponent(run.id)}`, {}, { method: "PUT", body: JSON.stringify({ run, approve }) });
}
