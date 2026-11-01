# PO-r1 — 3 kịch bản VN-Index trước giờ giao dịch — TIÊU CHÍ ĐẶT TRƯỚC (01/11/2026)
Viết TRƯỚC khi đo. Sau commit không sửa; sửa thì ghi ở mục "Sửa đổi". Khảo sát trước đó dùng ES 24 giờ và đã xem kết quả, nên không tính là bằng chứng.

## 1. Biến và quy tắc (`preopenModel.js`)
- Biến duy nhất: `es` = % đổi của ES=F từ 15:00 phiên VN trước đến 08:30 hôm nay, chỉ dùng nến 60 phút đã kết thúc.
- Nhóm: Tiêu cực `es ≤ −0,8`, Tích cực `es ≥ +0,8`, còn lại Trung tính. Châu Á chỉ hiển thị, không vào mô hình.
- Vùng mở cửa: hồi quy `gap ~ es`, P10/P90 bằng phân vị phần dư (conformal).
- Dải cả phiên: P10/P90 lợi suất cả phiên của nhóm, co giãn theo độ lệch chuẩn 20 phiên so với cả mẫu, kẹp [0,5; 2].
- Lớp kết quả: `cc < −0,5%` giảm, `cc > +0,5%` tăng, còn lại đi ngang. Xác suất từng nhóm có làm trơn cộng 1.

## 2. Kiểm định
Walk-forward: mỗi phiên huấn luyện trên tối đa 250 phiên trước đó, tối thiểu 120, không dùng phiên hiện tại. KTC 95% bootstrap khối 5 phiên, 2.000 lần, seed cố định. Dữ liệu: nến 60 phút Yahoo (khoảng 2 năm) và VN-Index OHLC từ Gateway.

## 3. Cổng và việc được hiển thị
| Mã | Điều kiện | Đạt thì được hiện |
|---|---|---|
| G1 `openBand` | Độ phủ vùng mở cửa trong [75%, 85%] và pinball thấp hơn nền (phân vị gap không điều kiện), KTC hiệu số < 0 | Vùng mở cửa |
| G2 `dayBand` | Độ phủ dải cả phiên trong [75%, 85%] và pinball không kém dải không điều kiện quá 2% | Nhãn đã kiểm định cho dải; không đạt vẫn hiện dải kèm cảnh báo |
| G3 `probabilities` | Brier skill so với tần suất nền > 0, cận dưới KTC > 0 | Xác suất % trên thẻ |
| G4 `noPanicSell` | Nhóm Tiêu cực, n ≥ 30: mở → đóng TB > 0, cận dưới KTC > 0 | Câu "không bán đuổi lúc mở" |
| G5 `noChase` | Nhóm Tích cực, n ≥ 30: mở → đóng TB < 0, cận trên KTC < 0 | Câu "không mua đuổi lúc mở" |

Không đạt cổng nào thì phần tương ứng không hiện hoặc ghi "chưa có bằng chứng". Không dùng chữ MUA/BÁN; tư thế là tham khảo.

## 4. Sổ tiến
Từ khi triển khai: ghi ảnh chụp 07:15, 08:30, 08:50 mỗi ngày giao dịch, chấm lúc 15:05. Sổ tiến là bằng chứng chính cho các lần đánh giá sau. Hạn chế đã biết: mẫu ngắn, 07:15 dùng cùng tham số với 08:30, Yahoo có thể trễ.

## Sửa đổi
(chưa có)
