// Danh mục hàng hoá của tab Kết nối thế giới › Nhịp đập hàng hoá (C1, 2026-10-16). Mỗi mặt hàng có ĐÚNG MỘT nguồn giá:
//   yahoo  — hợp đồng tương lai kỳ gần (giá ngày, nối kỳ hạn nên có thể có bước nhảy khi đáo hạn);
//   wb     — World Bank Pink Sheet (giá tháng, trung bình tháng, công bố đầu tháng sau);
//   none   — chưa có nguồn mở: hiển thị trung thực "chưa có nguồn", không ước lượng.
// compareWith: mặt hàng cùng nguồn vẽ kèm để so sánh (gạo VN ↔ gạo Thái).
// worldFactor: mã yếu tố của Kết nối thế giới (cổng xác nhận W3) tương ứng, nếu có.
// vn: chuỗi so sánh phía Việt Nam (C2/C3) — chỉ số ngành ICB của Gateway và/hoặc cổ phiếu đại diện (ánh xạ đặt tay = heuristic).
export const COMMODITIES = [
  { id: "GOLD", nameVi: "Vàng", group: "Kim loại quý", unit: "USD/oz", source: { kind: "yahoo", symbol: "GC=F", labelVi: "COMEX, HĐ tương lai kỳ gần" }, sectorKey: "PRECIOUS_METALS", vn: { tickers: ["PNJ"] } },
  { id: "BRENT", nameVi: "Dầu Brent", group: "Năng lượng", unit: "USD/thùng", source: { kind: "yahoo", symbol: "BZ=F", labelVi: "ICE, HĐ tương lai kỳ gần" }, sectorKey: "ENERGY_OIL_GAS", worldFactor: "OIL", vn: { icb: "0500", tickers: ["GAS", "PVS", "PVD", "BSR"] } },
  { id: "WTI", nameVi: "Dầu WTI", group: "Năng lượng", unit: "USD/thùng", source: { kind: "yahoo", symbol: "CL=F", labelVi: "NYMEX, HĐ tương lai kỳ gần" }, sectorKey: "ENERGY_OIL_GAS", vn: { icb: "0500", tickers: ["GAS", "PVS", "PVD", "BSR"] } },
  { id: "COAL", nameVi: "Than (Úc)", group: "Năng lượng", unit: "USD/tấn", source: { kind: "wb", column: "Coal, Australian", labelVi: "World Bank Pink Sheet, Newcastle" }, vn: { tickers: ["NT2", "QTP"] } },
  { id: "IRON_ORE", nameVi: "Quặng sắt 62% Fe", group: "Kim loại", unit: "USD/tấn", source: { kind: "yahoo", symbol: "TIO=F", labelVi: "SGX/TSI, CFR Trung Quốc, HĐ tương lai kỳ gần" }, sectorKey: "STEEL_MATERIALS", vn: { icb: "1750", tickers: ["HPG", "HSG", "NKG"] } },
  { id: "RUBBER", nameVi: "Cao su RSS3", group: "Nông sản", unit: "USD/kg", source: { kind: "wb", column: "Rubber, RSS3", labelVi: "World Bank Pink Sheet, Singapore" }, sectorKey: "RUBBER_NATURAL", vn: { tickers: ["PHR", "DPR", "TRC"] },
    twoWayVi: "Giá tăng có lợi cho DN trồng/khai thác (PHR, DPR, TRC) nhưng BẤT LỢI cho DN sản xuất lốp xe (DRC, CSM, SRC) vì đây là nguyên liệu đầu vào." },
  { id: "ROBUSTA", nameVi: "Cà phê Robusta", group: "Nông sản", unit: "USD/kg", source: { kind: "wb", column: "Coffee, Robusta", labelVi: "World Bank Pink Sheet, ICO" }, sectorKey: "AGRICULTURE_COFFEE", vn: { tickers: [] } },
  { id: "RICE_VN", nameVi: "Gạo Việt Nam 5% tấm", group: "Nông sản", unit: "USD/tấn", source: { kind: "wb", column: "Rice, Viet Namese 5%", labelVi: "World Bank Pink Sheet — giá xuất khẩu GẠO VIỆT NAM" }, vnPrice: true, compareWith: "RICE_TH", vn: { tickers: [] } },
  { id: "RICE_TH", nameVi: "Gạo Thái 5% tấm", group: "Nông sản", unit: "USD/tấn", source: { kind: "wb", column: "Rice, Thai 5%", labelVi: "World Bank Pink Sheet, Bangkok" }, vn: { tickers: [] } },
  { id: "PALM_OIL", nameVi: "Dầu cọ", group: "Nông sản", unit: "USD/tấn", source: { kind: "wb", column: "Palm oil", labelVi: "World Bank Pink Sheet, Malaysia" }, vn: { tickers: [] } },
  { id: "UREA", nameVi: "Phân Urê", group: "Phân bón", unit: "USD/tấn", source: { kind: "wb", column: "Urea", labelVi: "World Bank Pink Sheet, Trung Đông" }, sectorKey: "FERTILIZER", vn: { tickers: ["DPM", "DCM"] } },
  { id: "DAP", nameVi: "Phân DAP", group: "Phân bón", unit: "USD/tấn", source: { kind: "wb", column: "DAP", labelVi: "World Bank Pink Sheet, Mỹ vùng Vịnh" }, sectorKey: "FERTILIZER", vn: { tickers: ["DGC", "LAS"] } },
  { id: "BDI", nameVi: "Cước tàu hàng rời (BDI)", group: "Vận tải", unit: "điểm", source: { kind: "none", labelVi: "Baltic Exchange — chỉ số trả phí, chưa có nguồn mở" }, sectorKey: "SHIPPING_LOGISTICS", vn: { tickers: ["HAH", "VSC", "GMD"] } },
];

export const COMMODITY_IDS = COMMODITIES.map((c) => c.id);
export const commodityById = (id) => COMMODITIES.find((c) => c.id === id) ?? null;
