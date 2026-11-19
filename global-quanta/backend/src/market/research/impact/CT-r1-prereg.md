# CT-r1 — Chi phí đầu vào khu vực → nhóm thép (đăng ký trước 19/11/2026, CHƯA CHẠY)

Thuộc họ `IMPACT-FAMILY.md`. Cơ sở khám phá (chỉ trong mẫu 2013–2019): tệp 07 và 10.
- Phiên 0 ≈ 0.
- Trôi phiên 2–20 là 0,35%/1σ (p placebo < 0,01).
- Dự báo 20 phiên p 0,017.
- Quặng sắt tháng: tháng sau t 2,06.
- Baosteel: trôi 0,18 (p 0,017).

## Giả thuyết
H1: Lợi suất 20 phiên của **chi phí đầu vào khu vực** dự báo **dương** lợi suất vượt 20 phiên sau của rổ thép.

## Dữ liệu
- **Biến dẫn dắt (xác định trước, không đổi):**
  - z = trung bình đều của hai z-score: lợi suất log 20 phiên của quặng sắt TIO=F và của Baosteel 600019.SS;
  - mỗi z chuẩn hoá theo độ lệch chuẩn 250 phiên trước, không nhìn trước;
  - Baosteel căn cùng phiên VN (Thượng Hải đóng trước VN).
- **Rổ:** HPG, HSG, NKG, POM, SMC, TLH, bình quân đều, chỉ gồm mã thuộc `universeAt(ngày)`. Rổ cần ≥ 3 mã, nếu không thì bỏ cửa sổ.
- **Mẫu ngoài:** 2020-01-01 → phiên gần nhất có đủ 21 phiên sau. Cửa sổ không chồng lấp: mỗi 20 phiên một quan sát, cửa sổ đầu tiên bắt đầu ở phiên giao dịch đầu tiên của 2020.

## Nhãn
Lợi suất vượt cộng dồn phiên 2..21 sau ngày cuối cửa sổ (bỏ phiên 1), so với VN-Index đã khử beta.

## Thống kê chính
Hồi quy nhãn theo z (OLS, một quan sát mỗi cửa sổ). p chính = p một phía của hệ số dương.

## Placebo
600 lần. Giữ nguyên chuỗi z, thay rổ thép bằng rổ 6 mã ngẫu nhiên **trong các ngành chu kỳ khác**: hoá chất ICB 1300, vật liệu xây dựng 2300, công nghiệp 2700, BĐS khu công nghiệp. Mã lấy từ `universeAt` tại đầu mẫu ngoài. p placebo = tỷ lệ placebo có t ≥ t thật.

## ĐẠT (cả bốn)
1. Hệ số > 0 và t ≥ 2.
2. p placebo ≤ 0,05.
3. Hai nửa mẫu ngoài (chia theo số cửa sổ) cùng dấu dương.
4. Lợi suất vượt trung bình ở các cửa sổ z ≥ 1 lớn hơn 0,45%.

Đạt tiêu chí riêng thì xét thêm ngưỡng Holm của họ.

## Thiếu mẫu và giới hạn
- Dưới 40 cửa sổ: CHƯA ĐỦ MẪU.
- Công suất trung bình–thấp: trong mẫu t chỉ 1,41 với 86 cửa sổ. "Không đạt" có thể do thiếu mẫu, và phải ghi rõ như vậy.
- Baosteel là **cổ phiếu đại diện**, không phải giá thép.
