// Phân ngành 2 cấp cho bộ lọc Siêu Quét: Nhóm ngành -> Ngành (tiếng Việt, thống nhất).
// Nguồn theo thứ tự ưu tiên:
//   1. Nhãn tiếng Việt do người tuyển chọn (Project A / danh sách cổ tức) — VD "Khu công nghiệp".
//   2. TradingView "industry" (104 ngành, chi tiết: Major Banks, Investment Banks/Brokers, Steel…).
//   3. TradingView "sector" (thô: Finance, Process Industries…).
// Nhãn gốc lẫn tiếng Anh / tiếng Việt có dấu / không dấu được quy về cùng một ngành.

export const SECTOR_GROUPS = [
  { group: "Tài chính", industries: ["Ngân hàng", "Chứng khoán", "Bảo hiểm", "Dịch vụ tài chính"] },
  { group: "Bất động sản", industries: ["Bất động sản", "Khu công nghiệp"] },
  { group: "Xây dựng & Vật liệu", industries: ["Xây dựng", "Vật liệu xây dựng", "Thép & Kim loại"] },
  { group: "Năng lượng", industries: ["Dầu khí", "Than"] },
  { group: "Tiện ích", industries: ["Điện", "Nước & Môi trường"] },
  { group: "Công nghiệp", industries: ["Vận tải & Logistics", "Hàng không", "Máy móc & Thiết bị", "Dịch vụ công nghiệp", "Thương mại & Phân phối"] },
  { group: "Nguyên vật liệu", industries: ["Hóa chất & Phân bón", "Bao bì, Giấy & Gỗ", "Cao su & Nông nghiệp"] },
  { group: "Tiêu dùng", industries: ["Thực phẩm & Đồ uống", "Bán lẻ", "Dệt may & Da giày", "Thủy sản & Xuất khẩu", "Ô tô & Phụ tùng", "Gia dụng & Nội thất", "Du lịch & Giải trí", "Truyền thông & Xuất bản"] },
  { group: "Công nghệ & Viễn thông", industries: ["Công nghệ thông tin", "Viễn thông", "Thiết bị điện tử"] },
  { group: "Y tế", industries: ["Dược phẩm", "Thiết bị & Dịch vụ y tế"] },
  { group: "Khác", industries: ["Quỹ đầu tư", "Khác"] },
];
export const GROUP_OF = new Map(SECTOR_GROUPS.flatMap((g) => g.industries.map((i) => [i, g.group])));

/** Bỏ dấu, chữ thường — so khớp nhãn tiếng Việt có/không dấu. */
export function normalizeLabel(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

const LEGACY = new Map([
  ["ngan hang", "Ngân hàng"], ["chung khoan", "Chứng khoán"], ["bao hiem", "Bảo hiểm"],
  ["bat dong san", "Bất động sản"], ["khu cong nghiep", "Khu công nghiệp"],
  ["xay dung", "Xây dựng"], ["vat lieu xd", "Vật liệu xây dựng"], ["vat lieu xay dung", "Vật liệu xây dựng"], ["thep", "Thép & Kim loại"],
  ["dau khi", "Dầu khí"], ["than", "Than"],
  ["nang luong", "Điện"], ["nang luong/dien", "Điện"], ["dien", "Điện"],
  ["van tai bien", "Vận tải & Logistics"], ["cang bien", "Vận tải & Logistics"], ["van tai", "Vận tải & Logistics"], ["logistics", "Vận tải & Logistics"],
  ["hang khong", "Hàng không"],
  ["hoa chat", "Hóa chất & Phân bón"], ["phan bon", "Hóa chất & Phân bón"],
  ["cao su", "Cao su & Nông nghiệp"], ["nong nghiep", "Cao su & Nông nghiệp"],
  ["thuc pham", "Thực phẩm & Đồ uống"], ["ban le", "Bán lẻ"], ["det may", "Dệt may & Da giày"],
  ["xuat khau (go, thuy san)", "Thủy sản & Xuất khẩu"], ["thuy san", "Thủy sản & Xuất khẩu"],
  ["duoc pham", "Dược phẩm"], ["cong nghe tt", "Công nghệ thông tin"], ["cong nghe", "Công nghệ thông tin"],
]);

const TV_INDUSTRY = {
  "Major Banks": "Ngân hàng", "Regional Banks": "Ngân hàng",
  "Investment Banks/Brokers": "Chứng khoán", "Investment Managers": "Chứng khoán",
  "Multi-Line Insurance": "Bảo hiểm", "Specialty Insurance": "Bảo hiểm", "Property/Casualty Insurance": "Bảo hiểm",
  "Life/Health Insurance": "Bảo hiểm", "Insurance Brokers/Services": "Bảo hiểm",
  "Financial Conglomerates": "Dịch vụ tài chính", "Finance/Rental/Leasing": "Dịch vụ tài chính",
  "Investment Trusts/Mutual Funds": "Quỹ đầu tư",
  "Real Estate Development": "Bất động sản", "Homebuilding": "Bất động sản", "Real Estate Investment Trusts": "Bất động sản",
  "Engineering & Construction": "Xây dựng",
  "Construction Materials": "Vật liệu xây dựng", "Building Products": "Vật liệu xây dựng",
  "Steel": "Thép & Kim loại", "Aluminum": "Thép & Kim loại", "Other Metals/Minerals": "Thép & Kim loại", "Metal Fabrication": "Thép & Kim loại",
  "Integrated Oil": "Dầu khí", "Oil Refining/Marketing": "Dầu khí", "Oil & Gas Production": "Dầu khí",
  "Oilfield Services/Equipment": "Dầu khí", "Oil & Gas Pipelines": "Dầu khí", "Contract Drilling": "Dầu khí", "Gas Distributors": "Dầu khí",
  "Coal": "Than",
  "Electric Utilities": "Điện", "Alternative Power Generation": "Điện",
  "Water Utilities": "Nước & Môi trường", "Environmental Services": "Nước & Môi trường",
  "Marine Shipping": "Vận tải & Logistics", "Other Transportation": "Vận tải & Logistics", "Trucking": "Vận tải & Logistics",
  "Railroads": "Vận tải & Logistics", "Air Freight/Couriers": "Vận tải & Logistics",
  "Airlines": "Hàng không",
  "Industrial Machinery": "Máy móc & Thiết bị", "Electrical Products": "Máy móc & Thiết bị", "Trucks/Construction/Farm Machinery": "Máy móc & Thiết bị",
  "Industrial Conglomerates": "Máy móc & Thiết bị", "Miscellaneous Manufacturing": "Máy móc & Thiết bị", "Office Equipment/Supplies": "Máy móc & Thiết bị",
  "Miscellaneous Commercial Services": "Dịch vụ công nghiệp", "Personnel Services": "Dịch vụ công nghiệp",
  "Commercial Printing/Forms": "Dịch vụ công nghiệp", "Advertising/Marketing Services": "Dịch vụ công nghiệp",
  "Wholesale Distributors": "Thương mại & Phân phối", "Electronics Distributors": "Thương mại & Phân phối",
  "Medical Distributors": "Thương mại & Phân phối", "Food Distributors": "Thương mại & Phân phối",
  "Chemicals: Agricultural": "Hóa chất & Phân bón", "Chemicals: Specialty": "Hóa chất & Phân bón",
  "Chemicals: Major Diversified": "Hóa chất & Phân bón", "Industrial Specialties": "Hóa chất & Phân bón",
  "Containers/Packaging": "Bao bì, Giấy & Gỗ", "Pulp & Paper": "Bao bì, Giấy & Gỗ", "Forest Products": "Bao bì, Giấy & Gỗ",
  "Agricultural Commodities/Milling": "Cao su & Nông nghiệp",
  "Food: Meat/Fish/Dairy": "Thực phẩm & Đồ uống", "Food: Specialty/Candy": "Thực phẩm & Đồ uống", "Food: Major Diversified": "Thực phẩm & Đồ uống",
  "Beverages: Alcoholic": "Thực phẩm & Đồ uống", "Beverages: Non-Alcoholic": "Thực phẩm & Đồ uống", "Tobacco": "Thực phẩm & Đồ uống",
  "Household/Personal Care": "Gia dụng & Nội thất",
  "Specialty Stores": "Bán lẻ", "Food Retail": "Bán lẻ", "Department Stores": "Bán lẻ", "Home Improvement Chains": "Bán lẻ", "Electronics/Appliance Stores": "Bán lẻ",
  "Textiles": "Dệt may & Da giày", "Apparel/Footwear": "Dệt may & Da giày",
  "Motor Vehicles": "Ô tô & Phụ tùng", "Automotive Aftermarket": "Ô tô & Phụ tùng",
  "Home Furnishings": "Gia dụng & Nội thất", "Electronics/Appliances": "Gia dụng & Nội thất",
  "Other Consumer Specialties": "Gia dụng & Nội thất", "Recreational Products": "Gia dụng & Nội thất",
  "Hotels/Resorts/Cruise lines": "Du lịch & Giải trí", "Movies/Entertainment": "Du lịch & Giải trí",
  "Restaurants": "Du lịch & Giải trí", "Other Consumer Services": "Du lịch & Giải trí",
  "Publishing: Books/Magazines": "Truyền thông & Xuất bản", "Media Conglomerates": "Truyền thông & Xuất bản",
  "Information Technology Services": "Công nghệ thông tin", "Packaged Software": "Công nghệ thông tin", "Internet Software/Services": "Công nghệ thông tin",
  "Specialty Telecommunications": "Viễn thông", "Wireless Telecommunications": "Viễn thông", "Major Telecommunications": "Viễn thông",
  "Electronic Equipment/Instruments": "Thiết bị điện tử", "Electronic Production Equipment": "Thiết bị điện tử",
  "Telecommunications Equipment": "Thiết bị điện tử", "Computer Communications": "Thiết bị điện tử",
  "Pharmaceuticals: Major": "Dược phẩm", "Pharmaceuticals: Other": "Dược phẩm", "Pharmaceuticals: Generic": "Dược phẩm",
  "Medical Specialties": "Thiết bị & Dịch vụ y tế", "Hospital/Nursing Management": "Thiết bị & Dịch vụ y tế",
};

const TV_SECTOR = {
  "Finance": "Dịch vụ tài chính", "Industrial Services": "Xây dựng", "Distribution Services": "Thương mại & Phân phối",
  "Transportation": "Vận tải & Logistics", "Non-Energy Minerals": "Vật liệu xây dựng", "Utilities": "Điện",
  "Health Technology": "Dược phẩm", "Health Services": "Thiết bị & Dịch vụ y tế", "Process Industries": "Hóa chất & Phân bón",
  "Consumer Non-Durables": "Thực phẩm & Đồ uống", "Consumer Durables": "Gia dụng & Nội thất", "Consumer Services": "Du lịch & Giải trí",
  "Producer Manufacturing": "Máy móc & Thiết bị", "Commercial Services": "Dịch vụ công nghiệp", "Retail Trade": "Bán lẻ",
  "Energy Minerals": "Dầu khí", "Technology Services": "Công nghệ thông tin", "Electronic Technology": "Thiết bị điện tử",
  "Communications": "Viễn thông", "Miscellaneous": "Khác",
};

/**
 * @param {{ legacy?: string|null, tvIndustry?: string|null, tvSector?: string|null }} src
 * @returns {{ industry: string, group: string }}
 */
export function classify({ legacy = null, tvIndustry = null, tvSector = null } = {}) {
  const fromLegacy = legacy ? LEGACY.get(normalizeLabel(legacy)) : null;
  const industry = fromLegacy
    ?? (tvIndustry && TV_INDUSTRY[tvIndustry])
    ?? (tvSector && TV_SECTOR[tvSector])
    // Nhãn cũ đã là tiếng Anh của TradingView (sector) -> dùng bảng sector.
    ?? (legacy && TV_SECTOR[legacy])
    ?? "Khác";
  return { industry, group: GROUP_OF.get(industry) ?? "Khác" };
}
