import useSWR from "swr";
import type { SectorQuote } from "./useSectorPulse";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

// MOI (2026-09-10): endpoint /api/global/sector-pulse?region=eu|asia CHUA
// duoc backend (Project A) trien khai tinh den thoi diem viet code nay -
// goi ham nay se that bai (404 hoac loi tuong tu) cho toi khi backend bo
// sung tham so "region" vao endpoint sector-pulse hien co. Component GOI ham
// nay PHAI tu xu ly truong hop loi bang cach hien thi danh sach nguon du
// lieu tham khao (xem region-sector-sources.ts) thay vi hien thi loi tho.
//
// shouldRetryOnError: false - vi day la tinh nang chua ton tai o backend,
// khong phai loi mang tam thoi, retry lien tuc chi tao request thua.
export function useSectorPulseRegion(region: "eu" | "asia") {
  const { data, error, isLoading } = useSWR(
    `${API_BASE}/api/global/sector-pulse?region=${region}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false, shouldRetryOnError: false },
  );

  return {
    topGainers: (data?.topGainers ?? []) as SectorQuote[],
    topLosers: (data?.topLosers ?? []) as SectorQuote[],
    isLoading,
    error,
    // true khi da nhan duoc phan hoi hop le tu backend (khong loi, khong
    // dang loading) - dung de phan biet "chua co backend" voi "dang tai".
    backendReady: !error && !isLoading && data !== undefined,
  };
}
