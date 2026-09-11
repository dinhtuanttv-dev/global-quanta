import useSWR from 'swr';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const CLUSTER_ENDPOINT = `${API_BASE}/api/cluster`;

export interface ClusterAnalysisResult {
  labels: number[];
  probabilities: number[];
  nClusters: number;
}

/**
 * Goi Python endpoint HDBSCAN RIENG BIET, khong qua route /analyze -
 * tranh self-fetch server-to-server (da gap rui ro timeout that o tab
 * "Loc nganh" truoc do khi lam dieu nay). Neu cham/loi, CHI ClusterPanel
 * bi anh huong (loading/error rieng) - toan bo cac panel khac (MainChart,
 * TopKList, FanChart, Timing, Explainability) van hien thi binh thuong.
 */
export function useClusterAnalysis(distanceMatrix: number[][] | null | undefined) {
  const shouldFetch = Boolean(distanceMatrix && distanceMatrix.length >= 4);
  // Dung chinh noi dung ma tran lam key - SWR se tu dong cache/khong goi
  // lai neu cung 1 bo du lieu (VD nguoi dung doi qua lai giua 2 ma da xem).
  const key = shouldFetch ? [CLUSTER_ENDPOINT, JSON.stringify(distanceMatrix)] : null;

  const fetcher = async (): Promise<ClusterAnalysisResult> => {
    const res = await fetch(CLUSTER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distanceMatrix }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(body || `Loi ${res.status}`);
    }
    return res.json();
  };

  const { data, error, isLoading } = useSWR<ClusterAnalysisResult, Error>(key, fetcher, {
    revalidateOnFocus: false,
  });

  return { data, isLoading, isError: Boolean(error), error };
}
