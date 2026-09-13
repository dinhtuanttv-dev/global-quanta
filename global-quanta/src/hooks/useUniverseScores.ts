import useSWR from "swr";
import type { DividendStock } from "../lib/quant-cotuc";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface UniverseEntryRaw {
  ticker: string;
  sector: string | null;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  overallScoreTier123: number | null;
  latestEventType: string | null;
  latestEventTitle: string | null;
  publicDate: string | null;
  agmDate: string | null;
  exrightDate: string | null;
  recordDate: string | null;
  settlementDate: string | null;
  valuePerShare: number | null;
  exerciseRatio: number | null;
  price: number | null;
  pe: number | null;
  roe: number | null;
  debtEquity: number | null;
  rsi14: number | null;
  dividendYieldPct: number | null;
  payoutRatioPct: number | null;
  profitGrowthYoY: number | null;
  fScore: number | null;
}

function isoToVn(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Chuyen 1 ban ghi Universe (tu Database, chi co Tier 1-3 + fundamentals
 * co ban) thanh DividendStock day du de tuong thich voi UI hien co. CAC
 * TRUONG KHONG CO DU LIEU THAT (F-Score, DCF, pros/cons, insider...)
 * dien gia tri TRUNG TINH (0/rong) CHI DE TRANH CRASH - danh dau
 * isUniverseOnly=true de UI (Modal) AN/THAY THE bang thong bao ro rang,
 * TUYET DOI KHONG hien cac gia tri trung tinh nay nhu la du lieu that.
 */
export function mapUniverseEntryToStock(e: UniverseEntryRaw): DividendStock {
  return {
    ticker: e.ticker,
    name: e.ticker, // Khong co ten day du trong Database - dung tam ticker, UI can hien ro day la ma Universe
    sector: e.sector ?? "Khác",
    price: e.price ?? 0,
    pe: e.pe ?? 0,
    roe: e.roe ?? 0,
    dividendYield: e.dividendYieldPct ?? 0,
    payoutRatio: e.payoutRatioPct ?? 0, // DA CO THAT (Cron Job 2 tinh + luu)
    debtEquity: e.debtEquity ?? 0,
    growth: e.profitGrowthYoY ?? 0, // DA CO THAT (Cron Job 2 tinh + luu)
    marketCap: "Mid",
    eps: 0,
    fscore: e.fScore ?? 0, // DA CO THAT (6/9 tieu chi, xem ghi chu dividend-quality-score.ts)
    grossMargin: 0,
    pros: [],
    cons: [],
    technicalTrend: "Neutral",
    rsi: e.rsi14 ?? 0,
    revenueGrowthQtr: 0,
    institutionalHold: 0,
    exDividendDate: isoToVn(e.exrightDate),
    paymentDate: isoToVn(e.settlementDate),
    dividendAmount: e.valuePerShare ?? 0,
    catalystScore: 5,
    newsSentiment: "",
    sectorWaveScore: 0,
    agmDate: isoToVn(e.agmDate),
    agmAgenda: "",
    insiderStatus: "",
    macroCatalyst: "",
    globalIndicator: "",
    globalTrend: "",
    qsTier1: e.tier1,
    qsTier2: e.tier2,
    qsTier3: e.tier3,
    isUniverseOnly: true,
  };
}

import type { DividendEventType, DividendLifecycleEvent } from "./useDividendEvents";

/**
 * FIX: tab "Vong Doi Co Tuc" (DividendTimelinePanel) can DividendLifecycleEvent[]
 * day du (publicDate/recordDate/eventType...) - cac field NAY BI MAT khi
 * chuyen qua mapUniverseEntryToStock (chi giu lai dang format VN rut
 * gon). Ham nay chuyen TRUC TIEP tu UniverseEntryRaw (chua bi rut gon)
 * sang dung shape DividendLifecycleEvent, dam bao Timeline hien DUNG du
 * lieu da co (dù chi la 1 su kien gan nhat, khong phai lich su day du
 * nhu 17 ma theo doi goc - do Database chi luu su kien MOI NHAT/1 dong
 * cho moi ma, khong luu lich su nhieu dot).
 */
export function mapUniverseEntryToLifecycleEvent(e: UniverseEntryRaw): DividendLifecycleEvent | null {
  if (!e.latestEventType) return null;
  return {
    ticker: e.ticker,
    eventType: e.latestEventType as DividendEventType,
    eventTitleVi: e.latestEventTitle ?? "",
    publicDate: e.publicDate,
    agmDate: e.agmDate,
    exrightDate: e.exrightDate,
    recordDate: e.recordDate,
    settlementDate: e.settlementDate,
    valuePerShare: e.valuePerShare,
    exerciseRatio: e.exerciseRatio,
  };
}

export function useUniverseScores() {
  const { data, error, isLoading, mutate } = useSWR(`${API_BASE}/api/cotuc/universe-scores`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  const entries: UniverseEntryRaw[] = data?.entries ?? [];
  const universeStocks: DividendStock[] = entries.map(mapUniverseEntryToStock);

  return { universeData: data, universeStocks, entries, isLoading, error, refresh: mutate };
}
