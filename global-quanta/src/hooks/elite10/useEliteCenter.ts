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

/** LS-r1: khối "Sức mạnh dẫn dắt" của Hồ sơ 360° (LS-v1, 5 thành phần, trạng thái thị trường, bằng chứng, cổng H4, dòng Siêu quét). */
export function useEliteLeadership(ticker: string | null) {
  return useSWR<import("../../lib/elite10/decisionTypes").LeadershipTicker>(ticker ? ["elite-leadership", ticker] : null, () => fetchMarketJson(`/api/elite/leadership/${ticker}`), OPTS);
}

/** Bảng tín hiệu đầy đủ của phiên mới nhất (để tính phân vị của một mã trong vũ trụ). */
export function useElitePanel() {
  return useSWR<{ date: string; rows: { ticker: string; icb?: { l1?: string; l2?: string; l3?: string } | null; sector?: string | null; values: Record<string, number | null> }[] }>("elite-panel", () => fetchMarketJson("/api/elite/panel"), OPTS);
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

/** CG-r1: trạng thái Cổng tiền mặt + kết quả kiểm định; lỗi nguồn -> null (thẻ ghi rõ). */
export function useCashGate() {
  return useSWR<import("../../lib/elite10/decisionTypes").CashGateStatus | null>("elite-cash-gate", async () => {
    try { return await fetchMarketJson("/api/elite/cash-gate"); } catch { return null; }
  }, OPTS);
}

/** E7-v3: chưa chạy / lỗi -> null. */
export function useEliteRetroV3() {
  return useSWR<import("../../lib/elite10/decisionTypes").EliteRetroV3 | null>("elite-retro-v3", async () => {
    try { return await fetchMarketJson("/api/elite/retro-v3"); } catch { return null; }
  }, OPTS);
}

/** Elite × TO Giai đoạn II: sổ ảo COMP-r1 / DIV-IC / EX-r1 (THĂM DÒ). Chưa bật / lỗi -> null. */
export function useEliteToShadow() {
  return useSWR<import("../../lib/elite10/decisionTypes").EliteToShadow | null>("elite-to-shadow", async () => {
    try { return await fetchMarketJson("/api/elite/to-shadow"); } catch { return null; }
  }, OPTS);
}
