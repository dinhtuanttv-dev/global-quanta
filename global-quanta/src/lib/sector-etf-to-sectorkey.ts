// MUC 2: Cau noi Sector ETF (Yahoo Finance) -> sectorKey da dinh nghia
// trong macro-mapping.ts. KHONG tao he thong Smart Mapping moi - tai dung
// toan bo logic/vnTickers da co san, tranh trung lap.
//
// LUU Y: chi 5/11 ETF co sectorKey tuong ung trong macro-mapping.ts hien
// tai (XLV, XLI, XLY, XLU, XLC CHUA co mapping - se tra ve null, KHONG bia).
export const SECTOR_ETF_TO_SECTOR_KEY: Record<string, string> = {
  XLK: "SEMICONDUCTOR_TECH",
  XLE: "ENERGY_OIL_GAS",
  XLB: "STEEL_MATERIALS",
  XLF: "BANKING_FINANCE",
  XLRE: "REAL_ESTATE",
  XLP: "AGRICULTURE_COFFEE",
};
