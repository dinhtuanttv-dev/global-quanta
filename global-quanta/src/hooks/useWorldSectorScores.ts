import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { WsScores } from "../lib/worldSectors/types";

/** Gateway /api/world-sectors/scores — dùng chung cho Nhịp đập thị trường và Elite Command Radar (cùng khoá SWR). */
export function useWorldSectorScores() {
  return useSWR<WsScores>("world-sectors-scores", () => fetchMarketJson<WsScores>("/api/world-sectors/scores"), { refreshInterval: 5 * 60_000, revalidateOnFocus: false });
}
