import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { DecisionTicker, EliteDecision, EliteEvidence, PanelTicker } from "../../lib/elite10/decisionTypes";

// Trung tâm quyết định Elite 10 (Gateway /api/elite/*). Dữ liệu dựng 1 lần/phiên sau 17:00 giờ VN -> làm mới 30 phút/lần.
const OPTS = { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 2 };

export function useEliteDecision() {
  return useSWR<EliteDecision>("elite-decision", () => fetchMarketJson<EliteDecision>("/api/elite/decision"), OPTS);
}

export function useEliteEvidence() {
  return useSWR<EliteEvidence>("elite-evidence", () => fetchMarketJson<EliteEvidence>("/api/elite/evidence"), OPTS);
}

/** Điểm Elite + toàn bộ tín hiệu của một mã. 404 (mã ngoài vũ trụ) -> data null, không phải lỗi. */
export function useEliteTicker(ticker: string | null) {
  const get = async <T,>(path: string): Promise<T | null> => {
    try { return await fetchMarketJson<T>(path); } catch (e) { if (/không nằm trong|404/i.test(String((e as Error).message))) return null; throw e; }
  };
  const decision = useSWR<DecisionTicker | null>(ticker ? ["elite-decision-ticker", ticker] : null, () => get<DecisionTicker>(`/api/elite/decision/${ticker}`), OPTS);
  const panel = useSWR<PanelTicker | null>(ticker ? ["elite-panel-ticker", ticker] : null, () => get<PanelTicker>(`/api/elite/panel/${ticker}`), OPTS);
  return { decision: decision.data ?? null, panel: panel.data ?? null, isLoading: decision.isLoading || panel.isLoading, error: decision.error ?? panel.error ?? null };
}

/** Bảng tín hiệu đầy đủ của phiên mới nhất (để tính phân vị của một mã trong vũ trụ). */
export function useElitePanel() {
  return useSWR<{ date: string; rows: { ticker: string; values: Record<string, number | null> }[] }>("elite-panel", () => fetchMarketJson("/api/elite/panel"), OPTS);
}

export function useEliteRisk() {
  return useSWR<import("../../lib/elite10/decisionTypes").EliteRisk>("elite-risk", () => fetchMarketJson("/api/elite/risk"), OPTS);
}

export function useEliteLedger() {
  return useSWR<import("../../lib/elite10/decisionTypes").EliteLedger>("elite-ledger", () => fetchMarketJson("/api/elite/ledger"), OPTS);
}

/** E7: kiểm định hồi cứu walk-forward (404 khi chưa chạy -> null). */
export function useEliteRetro() {
  return useSWR<import("../../lib/elite10/decisionTypes").EliteRetro | null>("elite-retro", async () => {
    try { return await fetchMarketJson("/api/elite/retro"); } catch { return null; }
  }, OPTS);
}
