# PX-r1 — đăng ký trước: mua mới sau GDKHQ pha loãng ≥ 10% có kém hơn không

**Ngày đăng ký:** 18/11/2026 · **Người quyết định:** chủ dự án (duyệt PX0 + PX-L + PX-r1 cùng ngày, theo tệp 15 thẩm định).
**Trạng thái:** viết và commit TRƯỚC khi chạy bất kỳ phép tính nào trên giai đoạn kiểm định 2020–2026 cho câu hỏi này.

## 1. Câu hỏi duy nhất

> Mua mới một mã ở đóng cửa phiên GDKHQ + 1 của một đợt **pha loãng ≥ 10%** (cổ tức bằng cổ phiếu, cổ phiếu thưởng, quyền mua giá thấp), giữ 30 phiên, có kém một khoản mua bất kỳ trong cùng vũ trụ, cùng ngày, một cách có ý nghĩa và bền theo thời gian không?

Nếu ĐẠT: đề xuất cổng MỀM "hậu GDKHQ" cho Elite HL (mã trong cửa sổ chuyển sang hàng chờ với lý do, tiền dành cho mã kế tiếp) — kèm kiểm tra cấp danh mục ở mục 6.
Nếu KHÔNG ĐẠT: không có cổng; huy hiệu PX0 vẫn chỉ hiển thị.

## 2. Bằng chứng đã biết trước khi đăng ký (không dùng để quyết định)

Khám phá 2014–2019 (tệp 15 thẩm định, mục 2): mua ở ex+1 kém nền cùng tháng −0,72% / 20 phiên (t −0,75), −1,34% / 30 phiên (t −1,44); phiên GDKHQ +2,7%. Các ngưỡng ở mục 5 được đặt khi đã biết các số này; vì vậy giai đoạn kiểm định là 2020–2026, chưa dùng cho câu hỏi này.

## 3. Dữ liệu và định nghĩa

- **Giá:** kho VNDirect tải 12/11/2026 (`gq-research/pit-ohlc/px`): giá điều chỉnh `adClose`, giá danh nghĩa `close`, `nmValue` (khớp lệnh). VN-Index đã sửa (HL-r2 S2).
- **Sự kiện:** phiên t có hệ số `k = (adClose/close)_{t−1} / (adClose/close)_t ≤ 1/1,1 = 0,90909` và `k ≥ 0,3` (loại lỗi dữ liệu). Pha loãng 10% cho k = 0,909. Nhóm này gồm cổ tức CP, thưởng, quyền mua giá thấp; có thể lẫn cổ tức tiền lợi suất ≥ 9,1% (hiếm) — không tách được từ giá, ghi rõ trong báo cáo.
- **Vũ trụ (đúng thời điểm):** top 300 theo GTGD khớp lệnh trung bình 20 phiên tính tới ex−1, và GTGD đó ≥ 5 tỷ (ngưỡng Elite HL).
- **Giai đoạn kiểm định:** sự kiện có GDKHQ từ 02/01/2020 tới 12/11/2026, đủ 31 phiên sau ex+1 trong dữ liệu.
- **Điểm vào:** đóng cửa phiên ex+1 (Elite HL khớp ở đóng cửa phiên kế tiếp). Mã không có giá ở ex+1 hoặc ex+31: loại.
- **Kết quả của sự kiện:** `R = ln(P_{ex+31}/P_{ex+1})` trên giá điều chỉnh.
- **Đối chứng cùng ngày:** trung bình `ln(P_{d+30}/P_d)` của mọi mã trong vũ trụ (top 300, ≥ 5 tỷ, tính tới d) tại cùng ngày vào d = ex+1, có đủ giá d+30.
- **Chênh lệch sự kiện:** `X = R − đối chứng cùng ngày`.

## 4. Thống kê

- Trung bình X trên mọi sự kiện; t theo cụm tháng GDKHQ (trung bình X trong tháng, rồi t của chuỗi tháng).
- Hai nửa: GDKHQ 02/01/2020 → 31/05/2023 và 01/06/2023 → 12/11/2026.

## 5. Tiêu chí ĐẠT (phải đạt CẢ BA)

1. Trung bình X ≤ −1,0% (30 phiên).
2. t theo cụm tháng ≤ −2,0.
3. Trung bình X âm ở CẢ HAI nửa.

Số liệu báo cáo kèm (không dùng để quyết định): X ở 10 và 20 phiên; vào ở ex+5, ex+10; nhóm động lượng 60 phiên (phần ba trên / còn lại); phần trăm sự kiện X > +20% ("siêu cổ phiếu").

## 6. Kiểm tra cấp danh mục — chỉ chạy khi mục 5 ĐẠT

Phát lại G2r (P0) và G2r + cổng mềm hậu GDKHQ (PX: không mua mới mã trong `[ex, ex+30]` của đợt pha loãng ≥ 10%, chuyển suất cho mã kế tiếp) trên bảng tín hiệu 19/05/2023 → 12/11/2026 đã dựng cho PZ-r2, cùng khung mô phỏng PZ-r2. Ràng buộc: lợi suất/năm của PX không thấp hơn P0 quá 0,3 điểm %, sụt giảm lớn nhất không sâu hơn. Vi phạm ràng buộc = không đề xuất cổng dù mục 5 đạt.

## 7. Quyết định

- Đạt mục 5 và 6 → đề xuất cổng mềm (E4-HL v2), chủ dự án duyệt lần cuối; theo dõi bằng sổ PX-L.
- Không đạt → không có cổng; công bố đầy đủ.

## 8. Điều KHÔNG được làm

- Không đổi ngưỡng k, vũ trụ, điểm vào, cửa sổ, tiêu chí sau khi đăng ký; không chạy lại.
- Sửa lỗi dữ liệu / mã phải ghi vào mục 9 TRƯỚC khi chạy lại, kèm lý do.

## 9. Sửa đổi

(chưa có)
