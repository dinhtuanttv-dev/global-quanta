// MOI (2026-09-10): Tinh hieu dong thuan da thi truong cho tab "Ket Noi The
// Gioi" - khi 1 nganh cung chieu tang/giam o >=2 thi truong cung luc, tin
// hieu duoc coi la dang tin cay hon 1 thi truong don le.
//
// THIET KE CO CHU DICH: ham nay CHI tra ve tin hieu khi co >=2 thi truong
// CUNG co du lieu that cho 1 sectorKey. Giai doan hien tai chi My co nguon
// du lieu nganh dang tin cay (xem SECTOR_ETF_TO_SECTOR_KEY) nen ham se luon
// tra ve mang rong cho toi khi Chau Au / Chau A duoc bo sung - dung nhu vay,
// KHONG bia du lieu de lap day giao dien.

export interface MarketSectorEntry {
  market: string;
  sectorLabelVi: string;
  changePercent: number;
}

export interface ConsensusSignal {
  sectorKey: string;
  sectorLabelVi: string;
  direction: "positive" | "negative";
  marketsAgreeing: string[];
  totalMarketsWithData: number;
  detailByMarket: MarketSectorEntry[];
}

export function computeSectorConsensus(
  bySectorKey: Record<string, MarketSectorEntry[]>,
): ConsensusSignal[] {
  const signals: ConsensusSignal[] = [];

  for (const [sectorKey, entries] of Object.entries(bySectorKey)) {
    if (entries.length < 2) continue; // chua du 2 thi truong co du lieu

    const positive = entries.filter((e) => e.changePercent >= 0);
    const negative = entries.filter((e) => e.changePercent < 0);
    const majority = positive.length >= negative.length ? positive : negative;

    if (majority.length < 2) continue; // khong co phe nao dat >=2 thi truong dong thuan

    signals.push({
      sectorKey,
      sectorLabelVi: majority[0].sectorLabelVi,
      direction: majority === positive ? "positive" : "negative",
      marketsAgreeing: majority.map((m) => m.market),
      totalMarketsWithData: entries.length,
      detailByMarket: entries,
    });
  }

  // Uu tien nganh co nhieu thi truong dong thuan nhat truoc
  return signals.sort((a, b) => b.marketsAgreeing.length - a.marketsAgreeing.length);
}
