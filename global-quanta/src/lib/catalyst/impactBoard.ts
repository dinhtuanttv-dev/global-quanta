// Z3 (2026-10-17) — ghép chất xúc tác (engine Project A) với chiến lược ngành thế giới (Gateway) theo ngành ICB Việt Nam.
// Hàm thuần, có test. Engine xúc tác dùng tên ngành không dấu (SectorRegistry.ts); ở đây ánh xạ sang 22 ngành ICB của Gateway.
import type { CatalystSnapshot } from "../../types/catalyst";

/** Tên ngành chuẩn của engine xúc tác -> mã ICB (bảng 22 ngành của Nhịp đập thị trường). */
export const CATALYST_SECTOR_ICB: Record<string, string> = {
  "Ngan hang": "8300",
  "Bat dong san": "8600",
  "Khu cong nghiep": "8600",
  "Thep": "1750",
  "Dau khi": "0500",
  "Chung khoan": "8700",
  "Det may": "3700",
  "Cong nghe": "9500",
  "Nong san": "3570",
  "Nong nghiep": "3570",
  "Xuat khau (Go, Thuy san)": "3570",
  "Van tai bien": "2770",
  "Hoa chat": "1300",
  "Cao su": "1300",
  "Phan bon/Hoa chat": "1300",
  "Ban le": "5300",
  "Nang luong/Dien": "7530",
  "Hang khong": "5700",
  "Duoc pham": "4500",
  "Vat lieu xay dung": "2300",
};

export interface CatalystByIcb {
  /** Tổng điểm ròng các nhóm ngành xúc tác ánh xạ vào ICB này (engine; chiều chưa kiểm chứng). */
  netScore: number;
  sectors: string[];
  benefit: string[];
  harm: string[];
}

/**
 * Gom chất xúc tác theo ICB: điểm ròng cấp ngành + mã có tác động (tickerImpacts) nằm trong thành phần ngành.
 * `constituents`: ICB -> các mã thành phần (Gateway). Mã không thuộc ngành nào bị bỏ qua (không đoán).
 */
export function catalystByIcb(snapshot: Pick<CatalystSnapshot, "sectors" | "tickerImpacts"> | null | undefined, constituents: Map<string, string[]>): Map<string, CatalystByIcb> {
  const out = new Map<string, CatalystByIcb>();
  const get = (icb: string) => {
    let v = out.get(icb);
    if (!v) out.set(icb, (v = { netScore: 0, sectors: [], benefit: [], harm: [] }));
    return v;
  };
  if (!snapshot) return out;
  for (const s of snapshot.sectors ?? []) {
    const icb = CATALYST_SECTOR_ICB[s.sector];
    if (!icb) continue;
    const v = get(icb);
    v.netScore += Number.isFinite(s.netScore) ? s.netScore : 0;
    v.sectors.push(s.sector);
  }
  const owner = new Map<string, string>();
  for (const [icb, tickers] of constituents) for (const t of tickers) if (!owner.has(t)) owner.set(t, icb);
  for (const [ticker, r] of Object.entries(snapshot.tickerImpacts ?? {})) {
    const icb = owner.get(ticker);
    if (!icb || r.direction === "none") continue;
    (r.direction === "benefit" ? get(icb).benefit : get(icb).harm).push(ticker);
  }
  return out;
}

/** Số ngày từ lần quét gần nhất; null nếu không có thời điểm. */
export function ageDays(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : null;
}

/** Câu hỏi mồi gửi sang Hỏi đáp xúc tác. */
export const askSector = (nameVi: string, icb: string) =>
  `Phân tích tác động của thế giới, hàng hoá và chất xúc tác tới ngành ${nameVi} (ICB ${icb}) và các cổ phiếu chính của ngành: tư thế ngắn hạn, bối cảnh trung hạn, rủi ro.`;
export const askTicker = (ticker: string) =>
  `Phân tích chuyên sâu ${ticker}: ngành ICB, tác động của thế giới và hàng hoá, chất xúc tác liên quan, bối cảnh vĩ mô và rủi ro.`;
