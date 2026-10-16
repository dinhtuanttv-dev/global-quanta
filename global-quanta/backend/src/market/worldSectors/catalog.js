// Nhịp đập thị trường › ngành thế giới ↔ ngành Việt Nam (M1, 2026-10-17).
//
// Ngành Việt Nam = chỉ số ngành ICB của Gateway (Lọc ngành, thành phần + trọng số thật). Mỗi mã nước ngoài ánh xạ tới mã ICB
// với MỨC KHỚP:
//   exact   — cùng chuẩn ICB (STOXX Europe 600 dùng chính ICB supersector như VN) → khớp 1-1 theo mã ngành;
//   close   — chuẩn khác (GICS/TOPIX-17/KODEX) nhưng cùng nội dung kinh doanh chính;
//   partial — chỉ trùng một phần (ví dụ bán dẫn → Công nghệ VN vốn là phần mềm/dịch vụ CNTT).
// session: "prev" — sàn đóng cửa SAU phiên VN (Mỹ, châu Âu, ETF Trung Quốc niêm yết Mỹ) → với phiên VN ngày d chỉ dùng phiên
//          trước d; "same" — sàn châu Á giao dịch cùng giờ (Nhật, Hàn, Đài, Hồng Kông) → cùng phiên là đồng thời (mô tả),
//          dự báo phiên sau dùng phiên trước.
// Mọi mã đã kiểm tra trên Yahoo: có ≥ 5 năm giá ngày (2026-10-17). Trung Quốc: chỉ số ngành CSI trên Yahoo không có lịch sử
// → chỉ có ETF niêm yết Mỹ / Hang Seng TECH (ghi rõ khoảng trống).

export const VN_SECTORS = [
  { icb: "0500", nameVi: "Dầu khí" }, { icb: "1300", nameVi: "Hóa chất" }, { icb: "1700", nameVi: "Tài nguyên" },
  { icb: "1750", nameVi: "Kim loại công nghiệp", parent: "1700" }, { icb: "2300", nameVi: "Xây dựng & Vật liệu" },
  { icb: "2700", nameVi: "Hàng hoá & dịch vụ công nghiệp" }, { icb: "2770", nameVi: "Giao thông công nghiệp", parent: "2700" },
  { icb: "3300", nameVi: "Ô tô & phụ tùng" }, { icb: "3500", nameVi: "Thực phẩm & đồ uống" }, { icb: "3570", nameVi: "Sản xuất thực phẩm", parent: "3500" },
  { icb: "3700", nameVi: "Đồ dùng cá nhân & gia dụng" }, { icb: "4500", nameVi: "Y tế" }, { icb: "5300", nameVi: "Bán lẻ" },
  { icb: "5700", nameVi: "Du lịch & giải trí" }, { icb: "6500", nameVi: "Viễn thông" }, { icb: "7500", nameVi: "Tiện ích" },
  { icb: "7530", nameVi: "Điện lực", parent: "7500" }, { icb: "8300", nameVi: "Ngân hàng" }, { icb: "8500", nameVi: "Bảo hiểm" },
  { icb: "8600", nameVi: "Bất động sản" }, { icb: "8700", nameVi: "Dịch vụ tài chính" }, { icb: "9500", nameVi: "Công nghệ" },
];

export const REGIONS = {
  US: { nameVi: "Mỹ", session: "prev" }, EU: { nameVi: "Châu Âu", session: "prev" }, JP: { nameVi: "Nhật", session: "same" },
  KR: { nameVi: "Hàn Quốc", session: "same" }, TW: { nameVi: "Đài Loan", session: "same" }, CN: { nameVi: "Trung Quốc / HK", session: "mixed" },
};

const m = (icb, match) => ({ icb, match });
/** [symbol, region, nameVi, maps, session?] */
const RAW = [
  // ── Châu Âu: iShares STOXX Europe 600 (ICB supersector — khớp chuẩn) ──
  ["EXH1.DE", "EU", "STOXX 600 Dầu khí", [m("0500", "exact")]],
  ["EXV7.DE", "EU", "STOXX 600 Hóa chất", [m("1300", "exact")]],
  ["EXV6.DE", "EU", "STOXX 600 Tài nguyên cơ bản", [m("1700", "exact"), m("1750", "close")]],
  ["EXV8.DE", "EU", "STOXX 600 Xây dựng & Vật liệu", [m("2300", "exact")]],
  ["EXH4.DE", "EU", "STOXX 600 Hàng hoá & DV công nghiệp", [m("2700", "exact"), m("2770", "partial")]],
  ["EXV5.DE", "EU", "STOXX 600 Ô tô & phụ tùng", [m("3300", "exact")]],
  ["EXH3.DE", "EU", "STOXX 600 Thực phẩm & đồ uống", [m("3500", "exact"), m("3570", "close")]],
  ["EXH7.DE", "EU", "STOXX 600 Đồ dùng cá nhân & gia dụng", [m("3700", "exact")]],
  ["EXV4.DE", "EU", "STOXX 600 Y tế", [m("4500", "exact")]],
  ["EXH8.DE", "EU", "STOXX 600 Bán lẻ", [m("5300", "exact")]],
  ["EXV9.DE", "EU", "STOXX 600 Du lịch & giải trí", [m("5700", "exact")]],
  ["EXV2.DE", "EU", "STOXX 600 Viễn thông", [m("6500", "exact")]],
  ["EXH9.DE", "EU", "STOXX 600 Tiện ích", [m("7500", "exact"), m("7530", "close")]],
  ["EXV1.DE", "EU", "STOXX 600 Ngân hàng", [m("8300", "exact")]],
  ["EXH5.DE", "EU", "STOXX 600 Bảo hiểm", [m("8500", "exact")]],
  ["EXI5.DE", "EU", "STOXX 600 Bất động sản", [m("8600", "exact")]],
  ["EXH2.DE", "EU", "STOXX 600 Dịch vụ tài chính", [m("8700", "exact")]],
  ["EXV3.DE", "EU", "STOXX 600 Công nghệ", [m("9500", "exact")]],
  // ── Mỹ: SPDR GICS + ETF ngành con ──
  ["XLE", "US", "Năng lượng (XLE)", [m("0500", "close")]],
  ["XOP", "US", "Thăm dò & khai thác dầu khí (XOP)", [m("0500", "close")]],
  ["OIH", "US", "Dịch vụ dầu khí (OIH)", [m("0500", "partial")]],
  ["XLB", "US", "Vật liệu (XLB)", [m("1300", "close"), m("1700", "close")]],
  ["XME", "US", "Kim loại & khai khoáng (XME)", [m("1700", "close"), m("1750", "close")]],
  ["SLX", "US", "Thép (SLX)", [m("1750", "close")]],
  ["XHB", "US", "Xây nhà & vật liệu (XHB)", [m("2300", "partial")]],
  ["ITB", "US", "Xây dựng nhà ở (ITB)", [m("2300", "partial"), m("8600", "partial")]],
  ["XLI", "US", "Công nghiệp (XLI)", [m("2700", "close")]],
  ["IYT", "US", "Vận tải (IYT)", [m("2770", "close"), m("2700", "partial")]],
  ["JETS", "US", "Hàng không (JETS)", [m("5700", "partial"), m("2770", "partial")]],
  ["XLY", "US", "Tiêu dùng không thiết yếu (XLY)", [m("5300", "partial"), m("3300", "partial")]],
  ["XRT", "US", "Bán lẻ (XRT)", [m("5300", "close")]],
  ["XLP", "US", "Tiêu dùng thiết yếu (XLP)", [m("3500", "close"), m("3700", "close")]],
  ["MOO", "US", "Nông nghiệp (MOO)", [m("3570", "partial")]],
  ["XLV", "US", "Y tế (XLV)", [m("4500", "close")]],
  ["XLC", "US", "Truyền thông (XLC)", [m("6500", "partial")]],
  ["XLU", "US", "Tiện ích (XLU)", [m("7500", "close"), m("7530", "close")]],
  ["XLF", "US", "Tài chính (XLF)", [m("8700", "close"), m("8300", "partial")]],
  ["KBE", "US", "Ngân hàng (KBE)", [m("8300", "close")]],
  ["KRE", "US", "Ngân hàng khu vực (KRE)", [m("8300", "partial")]],
  ["XLRE", "US", "Bất động sản REIT (XLRE)", [m("8600", "partial")]],
  ["XLK", "US", "Công nghệ (XLK)", [m("9500", "close")]],
  ["SOXX", "US", "Bán dẫn (SOXX)", [m("9500", "partial")]],
  // ── Nhật: NEXT FUNDS TOPIX-17 ──
  ["1617.T", "JP", "TOPIX-17 Thực phẩm", [m("3500", "close"), m("3570", "close")]],
  ["1618.T", "JP", "TOPIX-17 Năng lượng", [m("0500", "close")]],
  ["1619.T", "JP", "TOPIX-17 Xây dựng & vật liệu", [m("2300", "close")]],
  ["1620.T", "JP", "TOPIX-17 Nguyên liệu & hoá chất", [m("1300", "close")]],
  ["1621.T", "JP", "TOPIX-17 Dược phẩm", [m("4500", "close")]],
  ["1622.T", "JP", "TOPIX-17 Ô tô & thiết bị vận tải", [m("3300", "close")]],
  ["1623.T", "JP", "TOPIX-17 Thép & kim loại màu", [m("1750", "close"), m("1700", "close")]],
  ["1624.T", "JP", "TOPIX-17 Máy móc", [m("2700", "partial")]],
  ["1625.T", "JP", "TOPIX-17 Điện & thiết bị chính xác", [m("2700", "partial")]],
  ["1626.T", "JP", "TOPIX-17 CNTT & dịch vụ", [m("9500", "close")]],
  ["1627.T", "JP", "TOPIX-17 Điện & khí", [m("7500", "close"), m("7530", "close")]],
  ["1628.T", "JP", "TOPIX-17 Vận tải & logistics", [m("2770", "close")]],
  ["1629.T", "JP", "TOPIX-17 Thương mại & bán buôn", [m("2700", "partial")]],
  ["1630.T", "JP", "TOPIX-17 Bán lẻ", [m("5300", "close")]],
  ["1631.T", "JP", "TOPIX-17 Ngân hàng", [m("8300", "close")]],
  ["1632.T", "JP", "TOPIX-17 Tài chính (trừ ngân hàng)", [m("8700", "close"), m("8500", "partial")]],
  ["1633.T", "JP", "TOPIX-17 Bất động sản", [m("8600", "close")]],
  // ── Hàn Quốc: KODEX ──
  ["091160.KS", "KR", "KODEX Bán dẫn", [m("9500", "partial")]],
  ["091170.KS", "KR", "KODEX Ngân hàng", [m("8300", "close")]],
  ["117680.KS", "KR", "KODEX Thép", [m("1750", "close")]],
  ["091180.KS", "KR", "KODEX Ô tô", [m("3300", "close")]],
  ["117460.KS", "KR", "KODEX Năng lượng & hoá chất", [m("0500", "partial"), m("1300", "partial")]],
  ["102970.KS", "KR", "KODEX Chứng khoán", [m("8700", "close")]],
  ["140710.KS", "KR", "KODEX Vận tải", [m("2770", "close")]],
  ["266360.KS", "KR", "KODEX Phần mềm CNTT", [m("9500", "close")]],
  ["117700.KS", "KR", "KODEX Xây dựng", [m("2300", "close")]],
  // ── Đài Loan ──
  ["0052.TW", "TW", "Fubon Công nghệ Đài Loan", [m("9500", "partial")]],
  ["0055.TW", "TW", "MSCI Taiwan Tài chính", [m("8300", "close"), m("8700", "partial")]],
  // ── Trung Quốc / Hồng Kông (không có chỉ số ngành CSI có lịch sử trên Yahoo) ──
  ["KWEB", "CN", "Internet Trung Quốc (KWEB, niêm yết Mỹ)", [m("9500", "partial")], "prev"],
  ["CQQQ", "CN", "Công nghệ Trung Quốc (CQQQ, niêm yết Mỹ)", [m("9500", "partial")], "prev"],
  ["CHIQ", "CN", "Tiêu dùng không thiết yếu TQ (CHIQ, niêm yết Mỹ)", [m("5300", "partial"), m("3300", "partial")], "prev"],
  ["3067.HK", "CN", "Hang Seng TECH (3067.HK)", [m("9500", "partial")], "same"],
];

export const WORLD_SECTOR_INSTRUMENTS = RAW.map(([symbol, region, nameVi, maps, session]) => ({
  symbol, region, nameVi, maps, session: session ?? REGIONS[region].session,
}));

export const MATCH_WEIGHT = { exact: 1, close: 0.75, partial: 0.4 };
export const MATCH_LABEL_VI = { exact: "khớp chuẩn (cùng ICB)", close: "khớp gần (chuẩn khác, cùng ngành)", partial: "khớp một phần" };

/** VN ICB -> [{ symbol, region, match, session, nameVi }] (sắp xếp: khớp tốt trước). */
export function instrumentsFor(icb) {
  const order = { exact: 0, close: 1, partial: 2 };
  return WORLD_SECTOR_INSTRUMENTS.flatMap((i) => i.maps.filter((x) => x.icb === icb).map((x) => ({ symbol: i.symbol, region: i.region, nameVi: i.nameVi, session: i.session, match: x.match })))
    .sort((a, b) => order[a.match] - order[b.match]);
}
