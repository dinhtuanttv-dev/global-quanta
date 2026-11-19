# CT-r2 — Bông → dệt may (đăng ký trước 19/11/2026, CHƯA CHẠY)

Thuộc họ `IMPACT-FAMILY.md`. Cơ sở khám phá trong mẫu 2013–2019 (tệp 10):
- CR20 −0,28;
- dự báo 20 phiên t −1,77 (p placebo 0,10);
- bông tháng (World Bank): cùng tháng t −2,03, tháng sau t −1,90.

Bằng chứng yếu hơn thép.

## Giả thuyết
H1: Lợi suất 20 phiên của giá bông dự báo **âm** lợi suất vượt 20 phiên sau của rổ dệt may. Bông là chi phí đầu vào.

## Dữ liệu
- **Biến dẫn dắt:** lợi suất log 20 phiên của bông CT=F, chuẩn hoá z theo 250 phiên trước. Giá Mỹ ngày D gán cho phiên VN kế tiếp.
- **Rổ:** TCM, TNG, GIL (bình quân đều, theo `universeAt`). Cần ≥ 2 mã. **Không gồm STK** (sợi polyester, đầu vào gốc dầu).
- **Mẫu ngoài:** 2020-01-01 → nay, mỗi 20 phiên một cửa sổ, như CT-r1.

## Nhãn
Lợi suất vượt phiên 2..21, so với VN-Index đã khử beta.

## Thống kê chính
OLS theo z. p chính = p một phía của hệ số **âm**.

## Placebo
600 lần. Giữ z, thay rổ bằng 3 mã ngẫu nhiên thuộc **hàng tiêu dùng / xuất khẩu khác**: thuỷ sản, gỗ, nhựa, thực phẩm, lấy từ `universeAt`.

## ĐẠT (cả bốn)
1. Hệ số < 0 và t ≤ −2.
2. p placebo ≤ 0,05.
3. Hai nửa cùng dấu âm.
4. Lợi suất vượt trung bình ở các cửa sổ z ≥ 1 thấp hơn −0,45%.

## Thiếu mẫu
Dưới 40 cửa sổ: CHƯA ĐỦ MẪU. Rổ chỉ 3 mã, kết quả phải ghi rõ giới hạn này.
