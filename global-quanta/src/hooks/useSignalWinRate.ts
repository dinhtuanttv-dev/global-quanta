import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface SignalWinRateStat {
  winRatePercent: number; // % tin hieu dung (ma duoc goi "huong loi" thuc su tang trong N phien sau)
  sampleSize: number; // so tin hieu da kiem tra
  windowDays: number; // cua so backtest, VD 90
  lastComputedAt: string;
}

// MOI (2026-09-10): endpoint /api/global/signal-win-rate CHUA duoc backend
// trien khai - day la phan "Backtesting win-rate" trong de xuat nang cap.
// Hook nay se rong cho toi khi backend co du lieu tich luy du dai (can it
// nhat vai tuan du lieu tin hieu + gia sau do de tinh co y nghia).
export function useSignalWinRate() {
  const { data, error, isLoading } = useSWR(
    `${API_BASE}/api/global/signal-win-rate`,
    fetcher,
    { refreshInterval: 6 * 60 * 60 * 1000, revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const stat: SignalWinRateStat | null = data && typeof data.winRatePercent === "number" ? data : null;
  return { stat, isLoading, error };
}
