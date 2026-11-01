# PO-r2 — 3 kịch bản VN-Index, phiên bản 2 — TIÊU CHÍ ĐẶT TRƯỚC (01/11/2026)
Viết TRƯỚC khi đo. Sau commit không sửa; sửa thì ghi ở mục "Sửa đổi".

Đây là lần nhìn lại trên cùng dữ liệu với PO-r1 và đã biết kết quả r1, cùng kết quả rà soát: dải không co giãn phủ 74,5%, dải không điều kiện 76,9%. Vì vậy mọi KTC dùng 99% thay vì 95%, và sổ tiến vẫn là bằng chứng chính.

## 1. Thay đổi so với r1
- Biến chính vẫn là `es` (ES từ 15:00 phiên VN trước đến 08:30). Nhóm theo độ lệch chuẩn: `z = es / sd(es 250 phiên huấn luyện)`, Tiêu cực `z ≤ −1`, Tích cực `z ≥ +1`.
- Biến kỹ thuật: `above` = giá đóng cửa phiên trước trên MA50, chỉ dùng dữ liệu đến phiên trước.
- `σ̂`: độ lệch chuẩn dự báo một phiên. MS: MS-GARCH 2 chế độ, ước lượng lại mỗi 20 phiên trên 500 phiên trước, lọc đến phiên trước. EW: EWMA 0,94.
- Vùng mở cửa: `gap = a + b·es + q·σ̂ew`, q là phân vị 10/90 của phần dư chuẩn hoá.
- Dải cả phiên: `cc = a + b·es + q·σ̂`, q cùng cách tính.
- Xác suất: bảng trạng thái rời rạc (3 nhóm × above), `p = (đếm + 20·nền) / (n + 20)`.

## 2. Kiểm định
Walk-forward: huấn luyện tối đa 250 phiên trước đó, tối thiểu 120. KTC 99% bootstrap khối 5 phiên, 2.000 lần, seed cố định.

## 3. Cổng
| Mã | Điều kiện | Đạt thì |
|---|---|---|
| G1 `openBand` | Phủ trong [75%, 85%]; pinball thấp hơn nền, KTC 99% hiệu số < 0 | Hiện vùng mở cửa |
| G2a `dayModel=ms` | Dải σ̂ MS phủ trong [75%, 85%]; pinball ≤ dải không điều kiện × 1,02 | Dùng dải MS |
| G2b `dayModel=ew` | Chỉ xét khi G2a không đạt; cùng điều kiện với σ̂ EW | Dùng dải EWMA |
| G2c `dayModel=uncond` | Khi G2a, G2b không đạt | Dùng dải không điều kiện, giống nhau ở 3 thẻ, có cảnh báo nếu ngoài [75%, 85%] |
| G3 `probabilities` | Brier skill so với nền > 0, cận dưới KTC 99% > 0 | Hiện % |
| G4 `noPanicSell` | Nhóm Tiêu cực n ≥ 30: mở → đóng > 0, cận dưới KTC 99% > 0 | Câu không bán đuổi |
| G5 `noChase` | Nhóm Tích cực n ≥ 30: mở → đóng < 0, cận trên KTC 99% < 0 | Câu không mua đuổi |
| G6 `defensive` | Mỗi ngày Tiêu cực chọn 3 nhóm ngành giảm ít nhất trong các ngày Tiêu cực của 250 phiên trước (cần ≥ 8 ngày, nhóm ≥ 3 mã VN100). Ngày Tiêu cực sau đó: lợi suất vượt VN-Index TB > 0, cận dưới KTC 99% > 0, n ≥ 30 | Hiện nhóm phòng thủ |

Bộ chọn G6 dùng phân ngành hiện tại nên có thiên lệch sống sót; đạt cũng chỉ ghi "tham khảo".

## 4. Hiển thị khác
Tư thế luôn ghi tham khảo, không dùng chữ MUA/BÁN. Thiếu ES hoặc ES đóng băng thì không kết luận. Trong phiên giữ nguyên kịch bản của ảnh chụp mới nhất trước 09:00.

## Sửa đổi
(chưa có)
