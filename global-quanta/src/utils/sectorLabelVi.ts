// Tên ngành hiển thị CÓ DẤU cho dữ liệu engine Chất xúc tác (Project A lưu nhãn không dấu trong ImpactEdge.targetId —
// đổi ở DB sẽ tách ngành cũ/mới, nên chỉ thêm dấu ở tầng hiển thị).
const MAP: Record<string, string> = {
  "ngan hang": "Ngân hàng", "bat dong san": "Bất động sản", "thep": "Thép", "dau khi": "Dầu khí", "chung khoan": "Chứng khoán",
  "det may": "Dệt may", "cong nghe": "Công nghệ", "nong san": "Nông sản", "van tai bien": "Vận tải biển", "hoa chat": "Hóa chất",
  "cao su": "Cao su", "ban le": "Bán lẻ", "phan bon/hoa chat": "Phân bón/Hóa chất", "nang luong/dien": "Năng lượng/Điện",
  "hang khong": "Hàng không", "khu cong nghiep": "Khu công nghiệp", "xuat khau (go, thuy san)": "Xuất khẩu (Gỗ, Thủy sản)",
  "duoc pham": "Dược phẩm", "nong nghiep": "Nông nghiệp", "vat lieu xay dung": "Vật liệu xây dựng",
};

export function sectorLabelVi(name: string): string {
  return MAP[name.trim().toLowerCase()] ?? name;
}
