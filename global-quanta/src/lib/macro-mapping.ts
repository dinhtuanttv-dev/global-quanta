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
  // FIX (2026-09-10): sectorKey nay duoc SECTOR_ETF_TO_SECTOR_KEY (XLP) va
  // CommodityPulseSubTab (ca phe Robusta) tham chieu nhung truoc day CHUA
  // co trong MACRO_MAPPING -> lookupSectorMapping() luon tra ve null, âm
  // tham lam mat tinh nang hien thi ma CP VN o 2 noi do. vnTickers de trong
  // co chu dich - CAN xac nhan danh sach ma CP dai dien chuan xac truoc khi
  // dien, tranh bia thong tin tai chinh sai lech.
  { sectorKey: "AGRICULTURE_COFFEE", sectorLabelVi: "Nông sản / Cà phê", representativeMarket: "Robusta Coffee (RC=F, ICE)", vnTickers: [], transmissionNote: "Giá cà phê Robusta thế giới tác động trực tiếp đến biên lợi nhuận doanh nghiệp xuất khẩu cà phê VN. (TODO: bổ sung vnTickers sau khi xác nhận danh sách mã CP đại diện chuẩn.)" },
];

export function lookupSectorMapping(sectorKey: string): SectorMapping | null {
  return MACRO_MAPPING.find((m) => m.sectorKey === sectorKey) ?? null;
}
