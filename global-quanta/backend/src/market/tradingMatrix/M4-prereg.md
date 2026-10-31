# M4 — Kịch bản Trading Matrix phiên bản 2 — TIÊU CHÍ ĐẶT TRƯỚC (31/10/2026)
Soạn TRƯỚC khi đo. Sau commit không sửa; sửa thì ghi ở mục "Sửa đổi". Căn cứ: bộ tài liệu Trading Matrix, mục 4.7 và 4.9.

## 1. Quy tắc `M4-r1`
Số đo lấy từ `marketState.js`, chỉ dùng dữ liệu đến t. Phân vị tính trên 250 phiên trước t.
| Kịch bản | Theo dõi | Đủ điều kiện (giữ 2 phiên liền) | Vô hiệu |
|---|---|---|---|
| SC1 Xu hướng có độ rộng hỗ trợ | UPTREND và (B20 ≥ 50 hoặc MO > 0) | UPTREND, B20 ≥ 50, MO > 0, σYZ phân vị < 80 | Không UPTREND, hoặc B20 < 40 |
| SC2 Chỉ số dẫn dắt, số đông yếu | PG5 phân vị ≥ 80 | PG5 phân vị ≥ 80 và ΔB20 5 phiên < 0 | PG5 phân vị < 50 |
| SC3 Cú sốc biến động | σYZ phân vị ≥ 90 hoặc |r1| ≥ 2,5σ ngày | Như theo dõi | σYZ phân vị < 70 và |r1| < 1,5σ ngày |
| SC4 Độ rộng rơi nhanh | B20 so đỉnh 5 phiên ≤ −15 | Như theo dõi | B20 so đỉnh 5 phiên > −5 |
Vòng đời: INVALIDATED 1 phiên, rồi COOLDOWN 5 phiên. Đợt = phiên vào CONFIRMED.

## 2. Khác với mục 4.7 của tài liệu
Số trụ hiệu dụng và trục Y không vào quy tắc: dữ liệu 2021–2024 không có số cổ phiếu theo thời điểm, nên không kiểm định được. Trục X, Y vẫn chỉ để mô tả.

## 3. Giả thuyết và cổng (BH-FDR q = 0,10)
Outcome: lợi suất VN-Index 10 phiên từ đóng cửa phiên bắt đầu đợt, trừ trung bình 10 phiên vô điều kiện cùng giai đoạn. KTC 95% bootstrap theo đợt.
- P1 SC1: ≥ 12 đợt, TB > 0, cận dưới > 0, TB trong mẫu > 0.
- P2 SC2: ≥ 12 đợt, TB < 0, cận trên < 0, TB trong mẫu < 0.
- P3 SC3, P4 SC4: ≥ 12 đợt, KTC không chứa 0, cùng dấu với trong mẫu.

## 4. Dữ liệu
**Bằng chứng chính:** sổ tiến `market_matrix_signal_m4` từ phiên đầu tiên sau triển khai trên cả 3 phạm vi.
**Bằng chứng phụ:** VN100 + VN-Index 2021-10 → nay, trong mẫu ≤ 2024-12-31. Giai đoạn 2025–2026 đã dùng cho M3 và M5, cùng thiên lệch sống sót của danh mục hiện tại, nên không đủ để thăng hạng một mình.

## 5. Quyết định hiển thị
Chạy song song, sổ riêng. M3-r1 và nhãn hiện tại không đổi. Chỉ thăng hạng khi sổ tiến đạt cổng mục 3.

## Sửa đổi
(chưa có)
