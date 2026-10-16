# Kiểm định đặt trước: Risk-On Index có dự báo được VN-Index không?

Đăng ký ngày 2026-10-16, trước khi tính bất kỳ lợi suất nào. Không sửa bản này sau khi chạy.

## Đối tượng
Risk-On Index của Project A (`lib/scoring/weighted-macro-score.ts`):
- Công thức: `0,4·DXY + 0,3·VIX + 0,3·US10Y`.
- Ngưỡng cố định: DXY 102/105, VIX 15/25, US10Y 4,0%/4,8%.
- Nhãn: ≥ 65 là RISK_ON, ≤ 35 là RISK_OFF.

Chỉ số đang là đầu vào của **chế độ thị trường trong quyết định Lọc ngành** và của **trọng số động Confluence Score**.

Các ngưỡng được đặt **từ trước**, không ước lượng từ dữ liệu. Vì vậy toàn bộ giai đoạn kiểm định là ngoài mẫu đối với tham số của chỉ số.

## Dữ liệu
- **DXY:** Yahoo `DX-Y.NYB`, đóng cửa ngày.
- **VIX:** Yahoo `^VIX`, đóng cửa ngày.
- **US10Y:** Yahoo `^TNX`, đơn vị %.
- **VN-Index:** Gateway, lịch sử 10 năm.
- **Tín hiệu tại phiên VN ngày t:** dùng giá đóng cửa Mỹ của ngày **trước** t (đã biết trước khi VN mở cửa).

## Kết quả đo
- **Biến kết quả:** log lợi suất VN-Index từ đóng cửa phiên t tới phiên t+20.
- **Lấy mẫu:** **không chồng lấn**, mỗi 20 phiên một mẫu, bắt đầu từ phiên đầu tiên có đủ dữ liệu.
- **Giai đoạn:** từ phiên đầu tiên có đủ 3 chuỗi tới phiên cuối có đủ 20 phiên sau.

## Giả thuyết
- **H1 (chính):** hệ số tương quan hạng Spearman giữa điểm và lợi suất 20 phiên tới > 0.
  - KTC95 bằng bootstrap khối (khối 3 mẫu, 10.000 lần, seed 20261016).
  - **ĐẠT** khi cận dưới KTC95 > 0 **và** n ≥ 60.
- **H2 (phụ, chỉ mô tả):** chênh lệch trung bình lợi suất giữa RISK_ON và RISK_OFF > 0, cùng bootstrap. Chỉ báo cáo khi mỗi nhóm có ít nhất 10 mẫu.
- **H3 (phụ, chỉ mô tả):** IC trên hai nửa giai đoạn, để kiểm tra độ ổn định.

## Hệ quả
- **ĐẠT:** giữ Risk-On trong quyết định Lọc ngành; nhãn đổi từ "HARD_DATA" sang "ĐÃ KIỂM ĐỊNH (IC …)".
- **KHÔNG ĐẠT hoặc thiếu mẫu:**
  - nhãn hiển thị là **"Heuristic — chưa kiểm định / không đạt kiểm định"**;
  - **gỡ Risk-On khỏi chế độ thị trường của quyết định Lọc ngành**: chế độ chỉ còn dựa trên xu hướng/biến động của chính VN-Index (MA200);
  - trọng số động của Confluence ghi rõ là heuristic.
- Không chỉnh ngưỡng hay trọng số của chỉ số để "đạt".

## Tái lập
`node backend/scripts/riskon-validate.mjs --out backend/src/market/riskOnValidation/RON-result.json`
