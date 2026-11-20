// Trung tâm thị trường: 3 kịch bản VN-Index từ Gateway. Số nào chưa đạt kiểm định thì API trả null, giao diện không tự suy ra.
// preopen/3 (PR-B) chỉ THÊM trường; mọi trường mới đều tuỳ chọn để giao diện vẫn chạy với Gateway preopen/2.
import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

export type ScenarioId = "neg" | "mid" | "pos";
export interface PreopenScenario {
  id: ScenarioId; name: string; trigger: string; esAnchor: number | null; open: { lo: number; mid: number; hi: number } | null; day: { lo: number; hi: number }; n: number;
  /** preopen/3: null khi cổng kiểm định tương ứng chưa đạt. */
  posture: string | null; probability: number | null; confirm: string; invalid: string; action: string | null;
}
export interface PreopenWorld { group: "us" | "futures" | "asia"; name: string; price: number | null; at: string | null; changePct: number | null; fresh?: boolean }
/** Tỷ lệ + khoảng tin cậy Wilson 95% (đơn vị %). */
export interface RateCi { n: number; k: number; pct: number | null; lo: number | null; hi: number | null }
export interface PreopenConfirm { rule: string; need: number; n: number; coverage: number | null; wilsonLo: number | null; wilsonHi: number | null; range: [number, number]; target: number; status: "confirming" | "passed" | "failed"; decidedOn: string | null; afterRegistration: RateCi }
export interface PreopenDoc {
  version: string; rule: string; asOf: string; phase: "pre" | "session" | "post" | "closed"; session: string; prevDate: string;
  es: { movePct: number | null; livePct?: number | null; price: number | null; refPrice: number | null; at: string | null; fresh?: boolean; frozenAt?: string | null };
  lead: ScenarioId | null; scenarios: PreopenScenario[]; trainDays: number; trainFrom: string | null; trainTo: string | null; esSd?: number | null; above?: boolean | null; volNext?: { ms: number | null; ew: number | null };
  tracking: {
    open: number; last: number; gapPct: number; movePct: number; inOpen: boolean | null; inDay: boolean | null; invalidated: boolean; current: ScenarioId;
    at?: string | null; source?: "live" | "daily"; pctInBand?: number | null; invalidatedAt?: string | null; invalidatedLast?: number | null;
  } | null;
  levels: { close: number; ma20: number | null; ma50: number | null; ma200: number | null };
  risk: { label: "calm" | "volatile"; probCalm: number; probVolatile: number; volAnnualPct: number; grade: string; asOf: string } | null;
  world: PreopenWorld[];
  evidence: { rule: string; openBand: boolean; dayBand: boolean; dayModel?: string; probabilities: boolean; noPanicSell: boolean; noChase: boolean; defensive?: boolean; sample: { tested: number; from: string; to: string }; openCoverage: number; dayCoverage: number; brierSkill: number; history: { id: ScenarioId; label: string; n: number; gap: number; oc: number; cc: number }[]; confirm?: PreopenConfirm };
  timeline: { slot: string; lead: ScenarioId | null; es: number | null; at?: string }[];
  ledger: { days: number; scored: number; openCoverage: number | null; dayCoverage: number | null; leadHit: number | null; lead?: RateCi; alwaysMid?: RateCi };
  /** Độ nhạy mở cửa theo ES trên 250 phiên huấn luyện, chỉ mô tả (cấp C). */
  esFit?: { slope: number; intercept: number; residLo: number; residHi: number; vol: number; n: number; grade: string } | null;
  nextRefreshAt?: string;
}
export interface PreopenLedgerRow { date: string; slot: string; es: number | null; lead: ScenarioId | null; day: { lo: number; hi: number } | null; prevClose: number | null; open: number; close: number; gapPct: number; ccPct: number; outcome: ScenarioId; dayIn: boolean; leadHit: boolean }
export interface PreopenLedgerDoc { rule: string; asOf: string; confirm: PreopenConfirm; lead: RateCi; alwaysMid: RateCi; rows: PreopenLedgerRow[] }

export function usePreopen() {
  // Trong phiên phần theo dõi tính lại từ giá trực tiếp (Gateway cache 15 giây) -> làm mới 20 giây; ngoài phiên 60 giây.
  const { data, error, isLoading } = useSWR<PreopenDoc>("/api/market/preopen", () => fetchMarketJson<PreopenDoc>("/api/market/preopen"), {
    refreshInterval: (d) => (d?.phase === "session" ? 20_000 : 60_000), revalidateOnFocus: false, dedupingInterval: 15_000,
  });
  return { data, error: error as Error | undefined, isLoading };
}

/** Sổ tiến từng phiên (preopen/3). Gateway cũ chưa có endpoint thì trả lỗi; giao diện ẩn phần này. */
export function usePreopenLedger(enabled: boolean) {
  const { data, error } = useSWR<PreopenLedgerDoc>(enabled ? "/api/market/preopen/ledger" : null, () => fetchMarketJson<PreopenLedgerDoc>("/api/market/preopen/ledger", { limit: 20 }), {
    refreshInterval: 30 * 60_000, revalidateOnFocus: false, dedupingInterval: 5 * 60_000, shouldRetryOnError: false,
  });
  return { data, error: error as Error | undefined };
}
