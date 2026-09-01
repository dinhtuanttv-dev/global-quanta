import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface ConfluenceStock {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: string;
  rrgScore: number;
  rsScore: number;
  volumeScore: number;
  confluenceScore: number;
}

export interface Top20Response {
  generatedAt: string;
  totalAnalyzed: number;
  top20: ConfluenceStock[];
}

// ===== DU LIEU DU PHONG (FALLBACK) =====
// Giong useSectorRRG - khi API khong kha dung thi dung mock de tab khong bao gio loi.
export const FALLBACK_TOP20: Top20Response = {
  generatedAt: new Date().toISOString(),
  totalAnalyzed: 150,
  top20: [
    { ticker: "VNM", sectorKey: "consumer", sectorQuadrant: "Leading", rrgScore: 85, rsScore: 78, volumeScore: 92, confluenceScore: 88 },
    { ticker: "FPT", sectorKey: "technology", sectorQuadrant: "Improving", rrgScore: 82, rsScore: 85, volumeScore: 88, confluenceScore: 86 },
    { ticker: "VCB", sectorKey: "banking", sectorQuadrant: "Leading", rrgScore: 88, rsScore: 82, volumeScore: 85, confluenceScore: 85 },
    { ticker: "DGC", sectorKey: "chemicals", sectorQuadrant: "Leading", rrgScore: 86, rsScore: 82, volumeScore: 80, confluenceScore: 83 },
    { ticker: "TCB", sectorKey: "banking", sectorQuadrant: "Leading", rrgScore: 84, rsScore: 80, volumeScore: 82, confluenceScore: 82 },
    { ticker: "SSI", sectorKey: "securities", sectorQuadrant: "Improving", rrgScore: 78, rsScore: 85, volumeScore: 90, confluenceScore: 84 },
    { ticker: "BVH", sectorKey: "insurance", sectorQuadrant: "Improving", rrgScore: 77, rsScore: 83, volumeScore: 85, confluenceScore: 81 },
    { ticker: "GEX", sectorKey: "industrial", sectorQuadrant: "Improving", rrgScore: 79, rsScore: 84, volumeScore: 87, confluenceScore: 83 },
    { ticker: "VHM", sectorKey: "real_estate", sectorQuadrant: "Improving", rrgScore: 76, rsScore: 82, volumeScore: 84, confluenceScore: 80 },
    { ticker: "NVL", sectorKey: "real_estate", sectorQuadrant: "Improving", rrgScore: 75, rsScore: 80, volumeScore: 86, confluenceScore: 80 },
    { ticker: "SAB", sectorKey: "consumer", sectorQuadrant: "Leading", rrgScore: 83, rsScore: 78, volumeScore: 85, confluenceScore: 82 },
    { ticker: "BID", sectorKey: "banking", sectorQuadrant: "Leading", rrgScore: 85, rsScore: 81, volumeScore: 83, confluenceScore: 83 },
    { ticker: "CTG", sectorKey: "banking", sectorQuadrant: "Leading", rrgScore: 83, rsScore: 79, volumeScore: 85, confluenceScore: 82 },
    { ticker: "ACB", sectorKey: "banking", sectorQuadrant: "Leading", rrgScore: 82, rsScore: 80, volumeScore: 84, confluenceScore: 82 },
    { ticker: "REE", sectorKey: "electricity", sectorQuadrant: "Leading", rrgScore: 84, rsScore: 81, volumeScore: 83, confluenceScore: 83 },
    { ticker: "SVG", sectorKey: "transport", sectorQuadrant: "Improving", rrgScore: 78, rsScore: 82, volumeScore: 88, confluenceScore: 82 },
    { ticker: "MWG", sectorKey: "retail", sectorQuadrant: "Weakening", rrgScore: 70, rsScore: 68, volumeScore: 85, confluenceScore: 74 },
    { ticker: "PNJ", sectorKey: "retail", sectorQuadrant: "Weakening", rrgScore: 72, rsScore: 70, volumeScore: 88, confluenceScore: 76 },
    { ticker: "HPG", sectorKey: "steel", sectorQuadrant: "Lagging", rrgScore: 65, rsScore: 72, volumeScore: 88, confluenceScore: 78 },
    { ticker: "PVD", sectorKey: "oil_gas", sectorQuadrant: "Lagging", rrgScore: 68, rsScore: 65, volumeScore: 82, confluenceScore: 71 },
  ],
};

interface FetcherResult {
  data: Top20Response;
  usingFallback: boolean;
}

const fetcher = async (url: string): Promise<FetcherResult> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Loi ${res.status}`);
    const json = (await res.json()) as Top20Response;
    return { data: json, usingFallback: false };
  } catch (err) {
    // API loi -> khong bao gio nem loi, dung mock du phong (va loc theo sector neu dang chon)
    console.warn("[useTop20Radar] API khong kha dung, dung du lieu du phong:", err);
    const sectorKey = new URL(url, window.location.origin).searchParams.get("sectorKey");
    const top20 = sectorKey
      ? FALLBACK_TOP20.top20.filter((s) => s.sectorKey === sectorKey)
      : FALLBACK_TOP20.top20;
    const data: Top20Response = { ...FALLBACK_TOP20, top20 };
    return { data, usingFallback: true };
  }
};

export function useTop20Radar(sectorKey: string | null) {
  const url = sectorKey
    ? `${API_BASE}/api/sector-filter/top20?sectorKey=${encodeURIComponent(sectorKey)}`
    : `${API_BASE}/api/sector-filter/top20`;

  const { data, error, isLoading, mutate } = useSWR<FetcherResult>(
    url, fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15 * 60 * 1000 }
  );
  const top20Data = data?.data;
  const usingFallback = data?.usingFallback ?? false;
  return { top20Data, error, usingFallback, isLoading, refresh: mutate };
}