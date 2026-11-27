import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { EvidenceEvolution } from "../../lib/elite10/evolutionTypes";

// EV-4: tiến hoá bằng chứng tab 4 (dựng phía Gateway, nhớ 10 phút). Lỗi / chưa có -> data undefined, giao diện vẫn hiện phần cũ.
const OPTS = { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 };

export function useEvidenceEvolution(enabled = true) {
  return useSWR<EvidenceEvolution>(enabled ? "elite-evidence-evolution" : null, () => fetchMarketJson<EvidenceEvolution>("/api/elite/evidence-evolution"), OPTS);
}
