import useSWR from "swr";

interface OhlcvBar { date: string; open: number; high: number; low: number; close: number; volume: number; }
interface OhlcvApiResponse { ticker: string; bars: OhlcvBar[]; }

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error(`API loi ${res.status}`);
  return res.json();
});

export function useOhlcvData(ticker: string | null, range: string = "3mo", limit: number = 30) {
  const { data, error, isLoading } = useSWR<OhlcvApiResponse>(
    ticker ? `/api/ohlcv?ticker=${encodeURIComponent(ticker)}&range=${range}&limit=${limit}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  return { bars: data?.bars ?? [], isLoading, error };
}
