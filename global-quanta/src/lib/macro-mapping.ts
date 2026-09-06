// BAN SAO TAY tu Project A (lib/mapping/macro-mapping.ts) - theo dung nguyen
// tac "nhan ban co chu dich" o Global-Quanta-Data-Sharing-Guide.md muc 2.1:
// khong co chia se code tu dong giua 2 repo, phai tu tay dong bo khi 1 ben
// doi. Neu Project A doi mapping nay (them/bot nganh, doi ma CP...), PHAI
// cap nhat tay o day.

export type ImpactDirection = "positive" | "negative" | "mixed";

export interface SectorMapping {
  sectorKey: string;
  sectorLabelVi: string;
  representativeMarket: string;
  vnTickers: string[];
  transmissionNote: string;
}

export const MACRO_MAPPING: SectorMapping[] = [
  { sectorKey: "SEMICONDUCTOR_TECH", sectorLabelVi: "Công nghệ / Bán dẫn", representativeMarket: "NASDAQ (^IXIC)", vnTickers: ["FPT", "CMG", "VTP"], transmissionNote: "Chu kỳ nâng cấp thiết bị điện tử toàn cầu tác động gián tiếp qua nhu cầu dịch vụ CNTT xuất khẩu." },
  { sectorKey: "ENERGY_OIL_GAS", sectorLabelVi: "Năng lượng / Dầu khí", representativeMarket: "Brent/WTI (BZ=F, CL=F)", vnTickers: ["PVS", "PVD", "BSR", "GAS"], transmissionNote: "Giá dầu thế giới ảnh hưởng trực tiếp đến biên lợi nhuận nhóm thượng nguồn/hạ nguồn dầu khí VN." },
  { sectorKey: "STEEL_MATERIALS", sectorLabelVi: "Thép & Vật liệu", representativeMarket: "China Steel / Iron Ore", vnTickers: ["HPG", "NKG", "HSG"], transmissionNote: "Nhu cầu bất động sản Trung Quốc và giá quặng sắt thế giới tác động đến giá bán thép nội địa." },
  { sectorKey: "SHIPPING_LOGISTICS", sectorLabelVi: "Vận tải biển", representativeMarket: "Baltic Dry Index (BDI)", vnTickers: ["HAH", "GMD"], transmissionNote: "Cước vận tải biển thế giới tác động trực tiếp đến doanh thu cho thuê tàu và dịch vụ logistics." },
  { sectorKey: "BANKING_FINANCE", sectorLabelVi: "Ngân hàng / Tài chính", representativeMarket: "Fed Funds Rate / US 10Y Treasury", vnTickers: ["VCB", "TCB", "ACB", "CTG"], transmissionNote: "Lãi suất Fed ảnh hưởng đến tỷ giá USD/VND và chi phí vốn vay ngoại tệ của hệ thống ngân hàng." },
  { sectorKey: "REAL_ESTATE", sectorLabelVi: "Bất động sản", representativeMarket: "US 10Y Treasury / DXY", vnTickers: ["VHM", "NLG", "KDH"], transmissionNote: "DXY tăng gây áp lực tỷ giá, ảnh hưởng gián tiếp dòng vốn FDI vào bất động sản." },
    { sectorKey: "PRECIOUS_METALS", sectorLabelVi: "Kim loại quý / Vàng", representativeMarket: "Gold (GC=F)", vnTickers: ["PNJ"], transmissionNote: "Giá vàng thế giới tác động trực tiếp đến biên lợi nhuận kinh doanh vàng trang sức." },

  // --- THEM MOI 6 SECTORKEY (5 ETF con thieu + 1 sectorKey bi loi thieu) ---
  { sectorKey: "AGRICULTURE_COFFEE", sectorLabelVi: "Nông nghiệp / Cà phê", representativeMarket: "Coffee Futures (KC=F) / USDA WASDE", vnTickers: ["TCM", "VCF", "HNG", "AGR"], transmissionNote: "Giá cà phê Robusta/Arabica trên sàn ICE/London tác động trực tiếp đến doanh thu xuất khẩu và biên lợi nhuận các doanh nghiệp cà phê, tiêu, điều VN." },
  { sectorKey: "INDUSTRIALS", sectorLabelVi: "Công nghiệp / Xây dựng", representativeMarket: "XLI (Industrial Select Sector SPDR) / ISM Manufacturing PMI", vnTickers: ["BCM", "REE", "GEX", "DIG", "KBC", "CTD", "HBC"], transmissionNote: "Chu kỳ sản xuất toàn cầu (PMI) và chi tiêu cơ sở hạ tầng tác động đến đơn hàng, biên lợi nhuận nhóm công nghiệp, xây dựng, cơ khí VN." },
  { sectorKey: "CONSUMER_DISCRETIONARY", sectorLabelVi: "Tiêu dùng phi thiết yếu", representativeMarket: "XLY (Consumer Discretionary SPDR) / US Retail Sales", vnTickers: ["MWG", "FRT", "HVN", "VJC", "ASM", "DGW"], transmissionNote: "Tăng trưởng thu nhập, tâm lý tiêu dùng và du lịch quốc tế tác động trực tiếp đến bán lẻ, hàng không, du lịch, xe VN." },
  { sectorKey: "HEALTHCARE", sectorLabelVi: "Y tế / Dược phẩm", representativeMarket: "XLV (Health Care SPDR) / US Healthcare Spending", vnTickers: ["DBD", "TNH", "DHG", "IMP", "VHC", "MED", "PMC"], transmissionNote: "Chi tiêu y tế toàn cầu và trong nước, xu hướng già hóa dân số hỗ trợ dài hạn cho bệnh viện, dược phẩm, thiết bị y tế VN." },
  { sectorKey: "UTILITIES_POWER", sectorLabelVi: "Điện lực / Tiện ích", representativeMarket: "XLU (Utilities SPDR) / Global Power Demand", vnTickers: ["GEG", "PPC", "PC1", "NT2", "SBA", "HDG"], transmissionNote: "Nhu cầu điện tăng, giá điện đầu ra và chính sách FIT/Điện gió - mặt trời quyết định doanh thu, lợi nhuận nhóm điện lực VN." },
  { sectorKey: "TELECOM_MEDIA", sectorLabelVi: "Viễn thông / Truyền thông", representativeMarket: "XLC (Communication Services SPDR) / Global Data Traffic", vnTickers: ["VGI", "FPT", "CMT", "SGC", "ELC", "ITA"], transmissionNote: "Lưu lượng dữ liệu, thuê bao 5G, quảng cáo số và nội dung giải trí số tác động đến doanh thu viễn thông, media, quảng cáo VN." },
];

export function lookupSectorMapping(sectorKey: string): SectorMapping | null {
  return MACRO_MAPPING.find((m) => m.sectorKey === sectorKey) ?? null;
}
