// MUC 2: Cau noi Sector ETF (Yahoo Finance) -> sectorKey da dinh nghia
// trong macro-mapping.ts. KHONG tao he thong Smart Mapping moi - tai dung
// toan bo logic/vnTickers da co san, tranh trung lap.
//
// LUU Y: XLV, XLC van CHUA co sectorKey tuong ung trong macro-mapping.ts
// (se tra ve null, KHONG bia) - XLI/XLY/XLU da bo sung ngay 2026-09-10,
// vnTickers xac nhan tu ban production da trien khai.
export const SECTOR_ETF_TO_SECTOR_KEY: Record<string, string> = {
  XLK: "SEMICONDUCTOR_TECH",
  XLE: "ENERGY_OIL_GAS",
  XLB: "STEEL_MATERIALS",
  XLF: "BANKING_FINANCE",
  XLRE: "REAL_ESTATE",
  XLP: "AGRICULTURE_COFFEE",
  XLI: "INDUSTRIALS",
  XLY: "CONSUMER_DISCRETIONARY",
  XLU: "UTILITIES",
};
