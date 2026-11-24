import { getAccessToken } from "../../services/api";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { ResearchProjection, ResearchRun } from "./research";

const BASE = "/api/elite/ai-room";
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
