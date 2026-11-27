// HS360-v3 H3/H4 — hợp đồng GET /api/elite/profile/:ticker (backend/src/market/elite/profileSnapshot.js). Chỉ đọc.
export type ProfileSeal = "ĐẠT" | "MỘT PHẦN" | "THĂM DÒ" | "KHÔNG ĐẠT" | "ĐANG TÍCH LUỸ" | "CHƯA KIỂM ĐỊNH" | "MÔ TẢ";
export type LayerId = "LEADERSHIP" | "TECHNICAL" | "SECTOR" | "FLOW" | "FUNDAMENTAL" | "WORLD_CATALYST" | "TIMING" | "LIQUIDITY" | "AI";
export interface ProfileLayer { id: LayerId; labelVi: string; stateVi: string; direction: 1 | 0 | -1 | null; seal: ProfileSeal; sealSource: string; asOf: string | null }
export interface ProfileSnapshot {
  version: string; ticker: string; session: string | null; builtAt: string; missing: string[];
  freshness: Record<string, string | null>;
  header: { icb: { l1?: string; l2?: string; l3?: string } | null; sector: string | null; close: number | null; inUniverse: boolean; hl: unknown; warnings: { level: string; textVi: string; source: string | null }[] };
  thesis: {
    strengths: { layer: LayerId; textVi: string; seal: ProfileSeal }[];
    risks: { kind: "EXIT_NEAR" | "FA_WARN" | "LIQUIDITY" | "INVERTED_SIGNAL"; textVi: string }[];
    nextEvent: { date: string; kindVi: string; source: string } | null;
  };
  layers: ProfileLayer[];
  signals: unknown[];
  outsideE2: { structure_stage: number | null; log_rvol: number | null };
  eliteScore: unknown;
  price: { bars: [string, number][]; pivot: number | null; zone: [number, number] | null; stop: number | null; stopRef: number | null } | null;
  noteVi: string;
}
