import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface RRGPoint {
  sectorKey: string;
  sectorLabel: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: "Leading" | "Improving" | "Weakening" | "Lagging";
}

export interface RRGResponse {
  generatedAt: string;
  benchmark: string;
  points: RRGPoint[];
}

// ===== DU LIEU DU PHONG (FALLBACK) =====
// Khi API khong kha dung (VD: deploy tinh tren Vercel khong co backend,
// hoac backend local down) thi tu dong ding du lieu nay de tab khong bao gio loi.
export const FALLBACK_RRG: RRGResponse = {
  generatedAt: new Date().toISOString(),
  benchmark: "VN-Index",
  points: [
    { sectorKey: "banking", sectorLabel: "Ngan hang", rsRatio: 1.25, rsMomentum: 0.85, quadrant: "Leading" },
    { sectorKey: "electricity", sectorLabel: "Dien", rsRatio: 1.2, rsMomentum: 0.75, quadrant: "Leading" },
    { sectorKey: "chemicals", sectorLabel: "Hoa chat", rsRatio: 1.1, rsMomentum: 0.35, quadrant: "Leading" },
    { sectorKey: "technology", sectorLabel: "Cong nghe", rsRatio: 1.15, rsMomentum: 0.65, quadrant: "Improving" },
    { sectorKey: "real_estate", sectorLabel: "Bat dong san", rsRatio: 1.05, rsMomentum: 0.25, quadrant: "Improving" },
    { sectorKey: "transport", sectorLabel: "Van tai", rsRatio: 1.0, rsMomentum: 0.15, quadrant: "Improving" },
    { sectorKey: "consumer", sectorLabel: "Tieu dung", rsRatio: 0.95, rsMomentum: -0.15, quadrant: "Weakening" },
    { sectorKey: "retail", sectorLabel: "Ban le", rsRatio: 0.9, rsMomentum: -0.25, quadrant: "Weakening" },
    { sectorKey: "steel", sectorLabel: "Thep", rsRatio: 0.85, rsMomentum: -0.45, quadrant: "Lagging" },
    { sectorKey: "oil_gas", sectorLabel: "Dau khi", rsRatio: 0.8, rsMomentum: -0.55, quadrant: "Lagging" },
  ],
};

interface FetcherResult {
  data: RRGResponse;
  usingFallback: boolean;
}

const fetcher = async (url: string): Promise<FetcherResult> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Loi ${res.status}`);
    const json = (await res.json()) as RRGResponse;
    return { data: json, usingFallback: false };
  } catch (err) {
    // API loi -> khong bao gio nem loi, dung mock du phong
    console.warn("[useSectorRRG] API khong kha dung, dung du lieu du phong:", err);
    return { data: FALLBACK_RRG, usingFallback: true };
  }
};

export function useSectorRRG() {
  const { data, error, isLoading, mutate } = useSWR<FetcherResult>(
    `${API_BASE}/api/sector-filter/rrg`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15 * 60 * 1000 }
  );
  const rrgData = data?.data;
  const usingFallback = data?.usingFallback ?? false;
  return { rrgData, error, usingFallback, isLoading, refresh: mutate };
}