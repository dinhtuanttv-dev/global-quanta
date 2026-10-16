# W5 — Event study với ngành mục tiêu định trước (2026-10-16)

## Luật (áp dụng trong engine, không chọn theo kết quả)

- Ngành mục tiêu là phần tử **đầu tiên** của `sectorsHint`. Hint đã được đặt từ trước; với 2 sự kiện mới, hint được đặt trước khi chạy.
  Không còn chọn ngành có p nhỏ nhất. Ngành p nhỏ nhất vẫn được hiển thị, gắn nhãn "thăm dò".
- Họ BY xác nhận: 1 kiểm định / sự kiện. q của toàn bảng sự kiện × ngành chỉ dùng để thăm dò.
- Sự kiện có chiều (`polarityHint` ≠ 0) phải đúng chiều.
- Hai sự kiện trùng cửa sổ (−1, +3) bị coi là nhiễu nhau: tối đa bậc C, ghi rõ trùng với sự kiện nào.
- Nhân rộng BMP theo loại: bỏ sự kiện trùng cửa sổ với sự kiện trước, và quy CAR về cùng chiều (CAR × chiều).

## Kết quả thật (37 sự kiện)

- Bậc: **B 1 · C 34 · chờ 2**. Không có bậc A.
- FOMC 30/07/2025 → Ngân hàng: CAR +5,05%, q 0,001 → bậc B. Không nhân rộng được qua 30 kỳ FOMC (BMP t 0,23, p 0,82).
- Thuế đối ứng 02/04/2025 → Dệt may: CAR −8,4% (đúng chiều), trùng cửa sổ với kỳ hoãn 09/04 → C.
- Hoãn thuế 09/04/2025 → Dệt may: CAR −12,1% (ngược chiều). Cửa sổ còn chứa phiên bán tháo 09/04 → C (nhiễu, không phải phản ứng với tin tốt).
- PBoC 24/09/2024 → Thép: CAR −0,3%, trùng FOMC 18/09 → C.
- Geneva 12/05/2025 → Dệt may: CAR −0,9%, trùng FOMC 07/05 → C.
- FTSE nâng hạng 07/10/2025 → Chứng khoán: CAR −5,6% (**ngược chiều**, "bán tin"), q 0,85 → C.

Kết luận: chưa có phản ứng sự kiện nào đạt chuẩn bằng chứng. Mẫu sự kiện có chiều còn quá ít và hay trùng nhau.
