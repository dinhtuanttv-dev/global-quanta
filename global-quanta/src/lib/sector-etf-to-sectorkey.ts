// MUC 2: Cau noi Sector ETF (Yahoo Finance) -> sectorKey da dinh nghia
// trong macro-mapping.ts. KHONG tao he thong Smart Mapping moi - tai dung
// toan bo logic/vnTickers da co san, tranh trung lap.
//
// LUU Y: 11/11 ETF SPDR Sector da co mapping (truoc chi 6/11, con lai da
// duoc bo sung vao macro-mapping.ts).
export const SECTOR_ETF_TO_SECTOR_KEY: Record<string, string> = {
  XLK: "SEMICONDUCTOR_TECH",
  XLE: "ENERGY_OIL_GAS",
  XLB: "STEEL_MATERIALS",
  XLF: "BANKING_FINANCE",
  XLRE: "REAL_ESTATE",
  XLP: "AGRICULTURE_COFFEE",

  // --- THEM MOI 5 ETF CON THIEU ---
  // Dung cho TopSectorsPanel + CommodityPulseSubTab (macro breakdown).
  XLI: "INDUSTRIALS",                 // Công nghiệp / Xây dựng / Cơ khí
  XLY: "CONSUMER_DISCRETIONARY",      // Tiêu dùng phi thiết yếu (bán lẻ, du lịch, hàng không)
  XLV: "HEALTHCARE",                  // Y tế / Dược phẩm / Bệnh viện
  XLU: "UTILITIES_POWER",             // Điện lực / Năng lượng / Tiện ích
  XLC: "TELECOM_MEDIA",               // Viễn thông / Truyền thông / Media
};
