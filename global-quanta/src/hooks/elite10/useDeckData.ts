// Command Deck: dữ liệu phụ cho Bảng quyết định Elite HL — rủi ro danh mục (/api/elite/risk), bảng tín hiệu E1 (/api/elite/panel)
// cho Không gian quy tắc, sổ bằng chứng (/api/elite/evidence-registry). Cùng khoá SWR với các hook hiện có -> dùng chung bộ đệm.
// Nguồn nào lỗi / chưa có thì khối tương ứng tự ẩn hoặc hiện "—", không làm vỡ bảng.
import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { EliteRisk } from "../../lib/elite10/decisionTypes";
import type { HlRowIn } from "../../lib/elite10/confluence";

const OPTS = { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 };
export interface EvidenceEntry { id: string; layer: string; test: string; verdict: string; detail: string; src: string; ranAt: string }
export interface EvidenceRegistry { version: string; entries: EvidenceEntry[] }
const quiet = async <T,>(p: string): Promise<T | null> => { try { return await fetchMarketJson<T>(p); } catch { return null; } };

export function useDeckRisk() { return useSWR<EliteRisk | null>("elite-risk", () => quiet<EliteRisk>("/api/elite/risk"), OPTS); }
export function useDeckPanel() { return useSWR<{ date: string; rows: HlRowIn[] } | null>("elite-panel", () => quiet<{ date: string; rows: HlRowIn[] }>("/api/elite/panel"), OPTS); }
export function useEvidenceRegistry() { return useSWR<EvidenceRegistry | null>("elite-evidence-registry", () => quiet<EvidenceRegistry>("/api/elite/evidence-registry"), { ...OPTS, refreshInterval: 24 * 3600_000 }); }
