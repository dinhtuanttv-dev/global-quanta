# MSG-r1 — Kiểm định dải MS-GARCH — TIÊU CHÍ ĐẶT TRƯỚC (01/11/2026)
Viết TRƯỚC khi đo trên toàn mẫu. Sau commit không sửa; sửa thì ghi ở mục "Sửa đổi".

## 1. Đối tượng
Bản `backend/src/market/volatility/msGarch.js`: 500 phiên ước lượng, dự báo 20 phiên, P10/P50/P90, 2.000 kịch bản, seed theo mã và ngày, không drift khi mô phỏng vì đây là dải rủi ro, không dự báo chiều giá.

## 2. Mô hình so sánh
Biến động lịch sử 250 phiên, không drift (`historicalBands`).

## 3. Dữ liệu
VN100 và VN-Index, giá điều chỉnh cộng dồn, 2021-10 → 2026-10. Lấy điểm dự báo mỗi 20 phiên. Mã có dưới 521 phiên thì bỏ.

Trước đó đã xem kết quả của bản Project A trên 11 mã (phủ 80,9%, pinball 7,174 so với 7,022). Các sửa trong mô hình được quyết định từ đọc code, không phải từ con số này. Mẫu vẫn có thiên lệch sống sót do dùng danh mục hiện tại.

## 4. Giả thuyết và cổng (phải đạt cả 3)
- H1 Độ phủ: tỷ lệ giá thực tế nằm trong P10–P90 thuộc [75%, 85%], tính trên toàn mẫu.
- H2 Không kém: pinball trung bình của MS-GARCH thấp hơn mô hình so sánh; KTC 95% của hiệu số, bootstrap khối theo ngày dự báo, nằm hoàn toàn dưới 0.
- H3 Thị trường căng thẳng: trong các điểm có biến động lịch sử thuộc nhóm 20% cao nhất, độ phủ của MS-GARCH gần 80% hơn mô hình so sánh.

## 5. Quyết định hiển thị
Đạt cả 3: nâng lên cấp B, ghi "đã qua kiểm định dải rủi ro". Không đạt: giữ cấp C, chỉ mô tả, hiện kết quả ở thẻ chỉ báo. Không kiểm định chiều giá; dải không dùng làm tín hiệu mua bán.

## Sửa đổi
(chưa có)
