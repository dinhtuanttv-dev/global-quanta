import useSWR from "swr";

// PHUONG AN D: dung route /api/universe da co san o Project A (theo route
// table trong guide: "GET /api/universe - Danh sách mã + ngành (VN30+VN100)
// - Dùng cho autocomplete/tìm kiếm, nhẹ, không gọi Yahoo"). Route nay da
// duoc dung o cho khac trong Project B (src/services/api.ts ham
// loadUniverse()) nen cau truc response { tickers: [...] } DA DUOC XAC NHAN
// THAT qua code hien co, khong phai doan.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface UniverseTicker {
  ticker: string;
  sector?: string;
  name?: string;
}

export function useUniverseSearch() {
  // Universe it thay doi trong ngay -> cache dai (30 phut), khop tinh than
  // "nhẹ, không gọi Yahoo" cua route nay trong guide.
  const { data, error, isLoading } = useSWR(`${API_BASE}/api/universe`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30 * 60 * 1000,
  });

  const universe: UniverseTicker[] = data?.tickers ?? [];

  return { universe, isLoading, error };
}
