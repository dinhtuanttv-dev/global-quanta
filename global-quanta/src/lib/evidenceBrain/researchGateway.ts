import { getAccessToken } from "../../services/api";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { ResearchProjection, ResearchRun } from "./research";
import type { ParentRef, ScenarioParent, ScenarioRecord, ScenarioSummary, ScenarioTarget } from "./scenario";
import type { ClaimParseResult } from "./types";
import useSWR from "swr";

const BASE = "/api/elite/ai-room";
export interface ResearchSession {
  expectedClosedSession: string;
  marketDailySession: string | null;
  scannerSession: string | null;
  decisionSession: string | null;
  stage: "EOD" | "MARKET_DAILY" | "SCANNER" | "DECISION" | "PUBLISHED";
  observedAt: string;
  retryAt: string | null;
  eod: { confirmed: number; expected: number } | null;
  publication: string;
  worker?: { session: string | null; core: number; snapshots: number; ready: number; bull: number; bear: number; judge: number;
    blocked: { provider: "claude" | "gemini"; reason: "BILLING" | "AUTH" | "RATE_LIMIT" | "NOT_CONFIGURED"; retryAt: number | null }[] };
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

interface BackgroundReview {
  session: string;
  sourcePublication: string;
  state: "SNAPSHOT" | "READY" | "PARTIAL" | "RETRY" | "FAILED";
  projection: ResearchProjection;
  roles: Partial<Record<"BULL" | "BEAR" | "JUDGE", ClaimParseResult>>;
}
export function usePublishedReview(account: string | null, ticker: string | null, session?: ResearchSession) {
  const stored = useSWR(account && ticker ? ["ai-room-precomputed", account, ticker, session?.publication] : null,
    () => researchRequest<BackgroundReview | null>("/precomputed", { ticker: ticker! }, {}), { refreshInterval: 30_000, keepPreviousData: false, errorRetryCount: 1 });
  const record = stored.data?.projection?.snap.ticker === ticker ? stored.data : null;
  const compatible = record && (!session || record.session === session.expectedClosedSession && session.stage === "PUBLISHED" && record.sourcePublication === session.publication ||
    record.session < session.expectedClosedSession && session.stage !== "PUBLISHED" && record.session === session.decisionSession);
  const fallback = useSWR(account && ticker && session && session.stage !== "PUBLISHED" && !compatible && !stored.isLoading ?
    ["ai-room-observation", account, ticker, session.publication] : null,
    () => researchRequest<ResearchProjection>("/observation", { ticker: ticker! }, {}), { refreshInterval: 30_000, errorRetryCount: 1 });
  return { record: compatible ? record : null, fallback: fallback.data?.snap?.ticker === ticker ? fallback.data : null };
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

export const scenarioGateway = {
  parent: (source: ParentRef, signal: AbortSignal) => researchRequest<ScenarioParent>("/scenarios/parent", {}, { method: "POST", body: JSON.stringify(source), signal }),
  preview: (source: ParentRef, { kind, key }: ScenarioTarget, signal: AbortSignal) => researchRequest<ScenarioRecord>("/scenarios/preview", {}, { method: "POST", body: JSON.stringify({ source, target: { kind, key } }), signal }),
  save: (source: ParentRef, { id, target: { kind, key }, digest }: ScenarioRecord, signal: AbortSignal, approve = false) => researchRequest<ScenarioRecord>("/scenarios/" + id, {}, { method: "PUT", body: JSON.stringify({ source, target: { kind, key }, digest, approve }), signal }),
  get: (id: string, signal: AbortSignal) => researchRequest<ScenarioRecord>("/scenarios/" + encodeURIComponent(id), {}, { signal }),
  list: (ticker: string, signal: AbortSignal) => researchRequest<ScenarioSummary[]>("/scenarios", { ticker }, { signal }),
};
