import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface SectorConfidence {
  sectorKey: string;
  correlationR: number; // he so tuong quan Pearson, -1..1
  sampleSize: number; // so phien du lieu dung de tinh
  lastComputedAt: string;
}

// MOI (2026-09-10): endpoint /api/global/sector-confidence CHUA duoc backend
// trien khai - day la phan "Correlation Confidence Score" trong de xuat
// nang cap. Hook nay goi that, se loi/rong cho toi khi backend co du lieu -
// component dung hook nay PHAI tu xu ly truong hop rong (khong hien badge)
// thay vi bao loi, giong nguyen tac da ap dung cho useSectorPulseRegion.
export function useSectorConfidence() {
  const { data, error, isLoading } = useSWR(
    `${API_BASE}/api/global/sector-confidence`,
    fetcher,
    { refreshInterval: 60 * 60 * 1000, revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const byKey = new Map<string, SectorConfidence>();
  if (Array.isArray(data?.items)) {
    for (const item of data.items as SectorConfidence[]) {
      if (item?.sectorKey) byKey.set(item.sectorKey, item);
    }
  }

  return { confidenceByKey: byKey, isLoading, error, ready: !error && !isLoading && byKey.size > 0 };
}
