// Tên ngành cho khoá sector của kết quả AI / bảng tác động: mã ICB (định dạng mới, 2026-10-17) hoặc khoá cũ của macro-mapping.
import { lookupSectorMapping } from "../macro-mapping";

export const ICB_NAMES: Record<string, string> = {
  "0500": "Dầu khí", "1300": "Hóa chất", "1700": "Tài nguyên", "1750": "Kim loại công nghiệp", "2300": "Xây dựng & Vật liệu",
  "2700": "Hàng hoá & dịch vụ công nghiệp", "2770": "Giao thông công nghiệp", "3300": "Ô tô & phụ tùng", "3500": "Thực phẩm & đồ uống",
  "3570": "Sản xuất thực phẩm", "3700": "Đồ dùng cá nhân & gia dụng", "4500": "Y tế", "5300": "Bán lẻ", "5700": "Du lịch & giải trí",
  "6500": "Viễn thông", "7500": "Tiện ích", "7530": "Điện lực", "8300": "Ngân hàng", "8500": "Bảo hiểm", "8600": "Bất động sản",
  "8700": "Dịch vụ tài chính", "9500": "Công nghệ",
};

export function sectorNameOf(key: string): string {
  const k = key.replace(/^ICB:?/i, "");
  if (ICB_NAMES[k]) return `${ICB_NAMES[k]} (ICB ${k})`;
  return lookupSectorMapping(key)?.sectorLabelVi ?? key;
}
