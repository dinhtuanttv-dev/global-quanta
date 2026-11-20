# PO-r2-F: xác nhận tiến cho dải cả phiên MS-GARCH (đăng ký trước, 21/11/2026)

## Bối cảnh
PO-r2 (`PO-r2-results.md`) cho dải cả phiên MS-GARCH đạt cổng G2a: phủ 80,1% trên 376 phiên. Báo cáo kết quả tự ghi nhận đây là lần **nhìn lại trên cùng dữ liệu** sau khi đã biết PO-r1, nên kết quả đạt phải được sổ tiến xác nhận. Tài liệu này chốt cách xác nhận **trước** khi có thêm dữ liệu.

## Công khai dữ liệu đã thấy
Lúc viết tài liệu (21/11/2026), sổ `preopen:ledger:v1` đã chấm 14 phiên (02/11 → 20/11), dải phủ 78,6% (11/14). 14 phiên này **có** nằm trong mẫu chính dưới đây. Để bù cho việc đã thấy chúng, tài liệu báo thêm một mẫu phụ chỉ gồm các phiên chấm sau ngày đăng ký (mục Báo cáo).

## Đối tượng đo
- Mỗi phiên lấy **ảnh chụp cuối cùng trước 09:00** (07:15 / 08:30 / 08:50), đúng như hàm `score()` đang chấm.
- Biến kết quả `dayIn`: giá đóng cửa VN-Index nằm trong dải cả phiên `[lo, hi]` của kịch bản khớp ES ở ảnh chụp đó.
- Không đổi mô hình, cửa sổ huấn luyện, σ̂ hay cách chấm.

## Mẫu chính và thời điểm kết luận
- Mẫu chính: **60 phiên đã chấm đầu tiên** của sổ, xếp theo ngày, tính từ 02/11/2026.
- Kết luận **một lần duy nhất**, khi phiên chấm thứ 60 có kết quả. Phiên thứ 61 trở đi không làm đổi kết luận.
- Không dừng sớm. Trước khi đủ 60 phiên, trạng thái là `confirming`.

## Tiêu chí đạt (cả hai điều kiện)
1. Tỷ lệ phủ p̂ nằm trong **[72%, 88%]**: không quá hẹp (đích 80%), cũng không quá rộng (dải rộng tới mức vô dụng).
2. Khoảng tin cậy **Wilson 95%** của p̂ **chứa 80%**: không bác bỏ được hiệu chuẩn đúng.

## Hệ quả
- Đạt: `status = "passed"`. Dải tiếp tục hiện là đạt kiểm định.
- Không đạt: `status = "failed"`. API tự trả `evidence.dayBand = false`, nên giao diện tự chuyển sang cảnh báo "chưa đạt". Muốn khôi phục phải có kiểm định đăng ký trước mới.

## Báo cáo kèm (mô tả, không phải cổng)
- Mẫu phụ: chỉ các phiên chấm **sau 21/11/2026** (độ phủ + Wilson).
- Tỷ lệ "kịch bản khớp ES" đúng lớp kết quả, so với đường cơ sở "luôn đoán Trung tính" trên cùng các phiên, cả hai kèm Wilson 95%. Không dùng để mở tư thế hay xác suất. Các cổng đó vẫn theo PO-r2 (G3–G6 KHÔNG ĐẠT).

## Tái lập
`GET /api/market/preopen` → `evidence.confirm`; từng phiên: `GET /api/market/preopen/ledger`. Logic nằm ở `preopenConfirm.js` và có test đơn vị.
