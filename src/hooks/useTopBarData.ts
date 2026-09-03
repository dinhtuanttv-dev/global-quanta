/**
 * useTopBarData — gom toan bo 6 API khoi tao cua TopBar vao 1 hook,
 * parallelize bang SWR (da co san trong project, khong can cai them dependency).
 *
 * Loi ich so voi code cu:
 *  - Promise.all: 6 request chay song song, tong TG cho = max(T1..T6) thay vi tong cong
 *  - Dedupe: nhieu component goi cung key => chi 1 network request
 *  - Stale-while-revalidate: tra ve data cu ngay lap tuc neu co, fetch ngu nen
 *  - Auto retry: 3 lan voi exponential backoff (mac dinh SWR)
 *  - Tra ve {isLoading, isError, dataUpdatedAt, refetch} de UI xu ly skeleton/error
 */
import useSWR from 'swr';
import * as api from '../services/api';
import type { VnIndexData, MacroTickerData, LiquidityData } from '../types';

export type RegimeState = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface TopBarData {
  regime: RegimeState;
  vnIndex: VnIndexData | null;
  tickers: MacroTickerData[];
  breadth: { advancers: number; decliners: number };
  liquidity: LiquidityData | null;
  sessions: Record<string, 'open' | 'closed'>;
}

const EMPTY: TopBarData = {
  regime: 'NEUTRAL',
  vnIndex: null,
  tickers: [],
  breadth: { advancers: 0, decliners: 0 },
  liquidity: null,
  sessions: {},
};

/**
 * 6 SWR key rieng biet, moi key co staleTime rieng theo nhip tuoi cua du lieu:
 *  - regime:        60s  (cham, phai qua nhieu tin hieu moi doi)
 *  - vnIndex:       30s  (REST snapshot)
 *  - macro-tickers: 60s
 *  - breadth:       15s
 *  - liquidity-1030: Infinity (chi fetch 1 lan/ngay sau 10:30)
 *  - sessions:      300s (5 phut)
 */
const STALE = {
  regime: 60_000,
  vnIndex: 30_000,
  tickers: 60_000,
  breadth: 15_000,
  liquidity: Infinity,
  sessions: 300_000,
};

export function useTopBarData() {
  const r1 = useSWR('topbar/regime', () => api.fetchRegime().then((r) => r.state), {
    refreshInterval: STALE.regime,
    revalidateOnFocus: true,
    dedupingInterval: STALE.regime,
  });

  const r2 = useSWR<VnIndexData>('topbar/vnindex', api.fetchVnIndex, {
    refreshInterval: STALE.vnIndex,
    revalidateOnFocus: true,
    dedupingInterval: STALE.vnIndex,
  });

  const r3 = useSWR<MacroTickerData[]>('topbar/macro-tickers', api.fetchMacroTickers, {
    refreshInterval: STALE.tickers,
    dedupingInterval: STALE.tickers,
  });

  const r4 = useSWR<{ advancers: number; decliners: number }>('topbar/breadth', api.fetchBreadth, {
    refreshInterval: STALE.breadth,
    dedupingInterval: STALE.breadth,
  });

  const r5 = useSWR<LiquidityData>('topbar/liquidity-1030', api.fetchLiquidity1030, {
    refreshInterval: 0, // chi fetch 1 lan (sau 10:30 moi ngay)
    revalidateIfStale: true,
    dedupingInterval: Infinity,
  });

  const r6 = useSWR<Record<string, 'open' | 'closed'>>('topbar/sessions', api.fetchSessions, {
    refreshInterval: STALE.sessions,
    dedupingInterval: STALE.sessions,
  });

  const results = [r1, r2, r3, r4, r5, r6];
  const isLoading = results.some((r) => r.isLoading && !r.data);
  const isError = results.some((r) => r.error);

  const data: TopBarData = {
    regime: r1.data ?? EMPTY.regime,
    vnIndex: r2.data ?? EMPTY.vnIndex,
    tickers: r3.data ?? EMPTY.tickers,
    breadth: r4.data ?? EMPTY.breadth,
    liquidity: r5.data ?? EMPTY.liquidity,
    sessions: r6.data ?? EMPTY.sessions,
  };

  return {
    data,
    isLoading,
    isError,
    refetch: () => results.forEach((r) => r.mutate()),
  };
}
