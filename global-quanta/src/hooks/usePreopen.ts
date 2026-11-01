// Trung tâm thị trường: 3 kịch bản VN-Index từ Gateway. Số nào chưa đạt kiểm định thì API trả null, giao diện không tự suy ra.
import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

export type ScenarioId = "neg" | "mid" | "pos";
export interface PreopenScenario {
  id: ScenarioId; name: string; trigger: string; esAnchor: number | null; open: { lo: number; mid: number; hi: number } | null; day: { lo: number; hi: number }; n: number;
  posture: string; probability: number | null; confirm: string; invalid: string; action: string;
}
export interface PreopenWorld { group: "us" | "futures" | "asia"; name: string; price: number | null; at: string | null; changePct: number | null }
export interface PreopenDoc {
  version: string; rule: string; asOf: string; phase: "pre" | "session" | "post" | "closed"; session: string; prevDate: string;
  es: { movePct: number | null; price: number | null; refPrice: number | null; at: string | null };
  lead: ScenarioId; scenarios: PreopenScenario[]; trainDays: number; trainFrom: string | null; trainTo: string | null; scale: number | null;
  tracking: { open: number; last: number; gapPct: number; movePct: number; inOpen: boolean | null; inDay: boolean | null; invalidated: boolean; current: ScenarioId } | null;
  levels: { close: number; ma20: number | null; ma50: number | null; ma200: number | null };
  risk: { label: "calm" | "volatile"; probCalm: number; probVolatile: number; volAnnualPct: number; grade: string; asOf: string } | null;
  world: PreopenWorld[];
  evidence: { rule: string; openBand: boolean; dayBand: boolean; probabilities: boolean; noPanicSell: boolean; noChase: boolean; sample: { tested: number; from: string; to: string }; openCoverage: number; dayCoverage: number; brierSkill: number; history: { id: ScenarioId; label: string; n: number; gap: number; oc: number; cc: number }[] };
  timeline: { slot: string; lead: ScenarioId; es: number | null }[];
  ledger: { days: number; scored: number; openCoverage: number | null; dayCoverage: number | null; leadHit: number | null };
}

export function usePreopen() {
  const { data, error, isLoading } = useSWR<PreopenDoc>("/api/market/preopen", () => fetchMarketJson<PreopenDoc>("/api/market/preopen"), { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 });
  return { data, error: error as Error | undefined, isLoading };
}
