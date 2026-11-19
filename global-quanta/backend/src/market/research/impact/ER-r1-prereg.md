# ER-r1 — Loại sự kiện Event Radar (kiểm định tiến, đăng ký trước 19/11/2026)

Thuộc họ `IMPACT-FAMILY.md`, chiếm **một suất** trong Holm của họ. Bên trong dùng Holm lồng cho các loại sự kiện.

## Dữ liệu
- Bản sửa **đầu tiên** của mỗi sự kiện (gần thời điểm xuất hiện nhất), từ sổ Event Radar và kho lưu trữ nén theo tháng (I0-G2).
- Chỉ lấy sự kiện:
  - gắn mã, `entityConfidence` cao;
  - `sourceAuthority` là công bố chính thức hoặc có `corroborationCount` ≥ 2;
  - mã thuộc `universeAt(ngày)`.
- Gộp cụm `clusterId`: một cụm chỉ tính một lần, lấy thời điểm sớm nhất.
- **Mẫu:** sự kiện có `firstSeenAt` từ 2026-11-20 (ngày sau khi đăng ký) tới mốc chấm.

## Nhãn
- Phiên 0 = phiên đầu tiên có ngày ≥ ngày giờ VN của `firstSeenAt`. Nếu `firstSeenAt` sau 14:45, phiên 0 là phiên kế tiếp.
- Lợi suất vượt so với ngành ICB cấp 2 ở các khoảng: **phiên 1** và **phiên 2..20**.
- Dấu theo `sentiment` của bộ phân loại tại thời điểm đó (dương +1, âm −1; trung lập bị bỏ).

## Thống kê
- Với mỗi `eventType` có **≥ 100 cụm đủ 20 phiên** tại mốc chấm: SAR(2..20) có dấu, trung bình, KTC bootstrap theo cụm ngày (10.000 lần).
- Holm lồng trên các loại đủ mẫu.
- p chính của ER-r1 cho Holm họ = p nhỏ nhất sau Holm lồng.

## Mốc chấm
- Sớm nhất **2027-05-20** (khoảng 6 tháng).
- Nếu không loại nào đủ 100 cụm: CHƯA ĐỦ MẪU, hoãn tới khi có, tối đa 2027-11-20.

## ĐẠT (cho một loại sự kiện)
1. Trung bình SAR(2..20) có dấu > 0,45%.
2. Cận dưới KTC95 > 0.
3. Qua Holm lồng.
4. Phiên 1 riêng lẻ **không** được dùng làm căn cứ ĐẠT, vì phản ứng nhanh không khai thác được ở giá đóng cửa.

## Phân tích phụ (không quyết định)
Tốc độ hấp thụ theo loại sự kiện (P4): tỷ lệ phản ứng nằm ở phiên 0–1 so với 2..20.
