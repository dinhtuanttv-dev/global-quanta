# PZ-r1 — đăng ký trước: có nên chặn mua mã đã tăng nóng trong danh mục Elite HL không

**Ngày đăng ký:** 14/11/2026 · **Trạng thái:** viết và commit TRƯỚC khi chạy bất kỳ chẩn đoán hay mô phỏng nào của PZ, và TRƯỚC khi đọc kết quả HL-r2.
**Đặc tả gốc:** "Vòng đời vị trí giá và bảng Theo dõi chờ nền — Elite HL" (14/11/2026), mục "Kiểm định trước khi bật cổng".
**Mã đang chạy trên production:** lớp Vị trí giá PZ-v2 ở chế độ CHỈ HIỂN THỊ (`PZ_GATE = false`, PR #321–#323).

## 1. Câu hỏi

1. **Chẩn đoán (lớp 1):** lệnh mua của quy tắc G2r đặt lúc mã đang tăng nóng có kết quả kém hơn các lệnh mua còn lại không?
2. **Mô phỏng (lớp 2):** chặn mua mã ngoài vùng mua có làm danh mục Elite HL tốt hơn G2r một cách đáng tin không?

## 2. Dữ liệu và khung

- Cùng khung HL-r2 (`HL-r2-prereg.md` mục 2–3): bảng tín hiệu dựng lại bằng `hl-panel-replay.mjs`, giá VNDirect điều chỉnh đầy đủ, vũ trụ 300 mã GTGD cao nhất từng phiên, tín hiệu ở đóng cửa D, khớp ở đóng cửa D+1, phí mua 0,20% / bán 0,25%, mã sát trần không mua được, sát sàn không bán được.
- Engine: `buildHlPortfolio` của production (kể cả sửa đổi S1) với tham số `zoneBy` và `gate = true`; vị trí giá tính bằng `pzStep` của production (`pricePosition.js`, PZ_RULES như đang chạy).
- **Giai đoạn QUYẾT ĐỊNH:** 03/03/2014 → 31/12/2019. **Giai đoạn BÁO CÁO:** 02/01/2020 → phiên cuối có bảng dựng lại (hiện 18/05/2023); chỉ báo cáo, không dùng để quyết định.

**Giới hạn đã biết:**

- Lịch sử SEPA / Base Breakout theo từng phiên không có. Nền giá trong mô phỏng chỉ lấy từ hộp giá HG-v1 (`detectBox`), trong khi production ưu tiên SEPA. Biến thể P2 vì vậy đo "vùng mua theo hộp giá", không đo đúng cấu hình production.
- Không có độ đo X1 / rủi ro tới đáy nền cho mã không có hộp giá; với các mã đó chỉ X2–X4 được xét (đúng như production).
- Trạng thái "đang giữ" trong máy trạng thái lấy từ danh mục mô phỏng của chính biến thể.

## 3. Lớp 1 — chẩn đoán

- Mẫu: mọi lệnh mua MỚI của P0 (G2r) trong giai đoạn quyết định.
- Nhóm NÓNG: tại phiên tín hiệu D, đạt ≥ 2 trong 3 độ đo chỉ dùng giá: X2 = (C − EMA21)/ATR14 ≥ 3,0; X3 = C/SMA50 − 1 ≥ 15% và ≥ phân vị 90 của chính mã trong 250 phiên; X4 = tăng ≥ 15% trong 5 phiên hoặc ≥ 2 phiên sát trần trong 5 phiên. Nhóm THƯỜNG: còn lại.
- Chỉ số cho mỗi lệnh: lợi suất vượt 20 phiên từ giá khớp (đóng cửa D+1) so với bình quân đều vũ trụ cùng kỳ; mức lỗ sâu nhất trong 20 phiên đầu; tỷ lệ lệnh bị bán trước 20 phiên.
- **Điều kiện đi tiếp sang lớp 2:** trung bình lợi suất vượt 20 phiên của nhóm NÓNG thấp hơn nhóm THƯỜNG với thống kê t Welch ≤ −2 (một phía). Không đạt -> **dừng, cổng giữ tắt**, PZ tiếp tục chỉ hiển thị. Kết quả lớp 2 vẫn được chạy và công bố để tham khảo, nhưng không dùng để bật cổng.

## 4. Lớp 2 — mô phỏng

| Mã | Phương án | Chạy được? |
|---|---|---|
| P0 | G2r hiện hành (đối chứng) | Có |
| P1 | Không mua mới mã đạt ≥ 2/3 độ đo X2–X4 (chỉ dùng giá, không cần nền) | Có |
| P2 | Chỉ mua mới mã ở trạng thái Vùng mua của máy trạng thái PZ-v2 (nền = hộp giá) | Có (giới hạn ở mục 2) |
| P3 | P2 + được mua giữa tuần khi mã về Vùng mua (tối đa 2 lệnh/tuần) | Không — harness chỉ mua ở phiên cân bằng; hoãn |

Không thêm phương án, không đổi ngưỡng sau khi thấy kết quả. Một bộ ngưỡng duy nhất: `PZ_RULES` tại commit đăng ký này.

## 5. Tiêu chí bật cổng (giai đoạn quyết định) — phương án phải đạt CẢ BỐN

1. Hoặc (a) vượt P0 sau phí > 0 với t trung vị ≥ 2 trên chuỗi chênh lệch 20 phiên không chồng lấn (20 pha), hoặc (b) sụt giảm lớn nhất cải thiện ≥ 5 điểm % trong khi lợi suất năm không thấp hơn P0 quá 1 điểm %.
2. Nếu đạt nhờ (a): giá trị p sau hiệu chỉnh Holm cho 2 phương án chạy được < 0,05.
3. Chênh lệch so với P0 cùng dấu tốt ở ít nhất 4 trên 6 năm (2014–2019).
4. Tỷ lệ tiền mặt bình quân ≤ 50%.

Kèm báo cáo: xoay vòng, số lệnh mua bị chặn, số tuần không có mã nào trong vùng mua.

## 6. Quyết định

- Lớp 1 không đạt, hoặc không phương án nào đạt lớp 2 -> `PZ_GATE` giữ `false`. Kết quả công bố đầy đủ.
- Có phương án đạt -> báo cáo cho chủ dự án; **chủ dự án quyết định** bật cổng (đổi phiên bản E4-HL v2, lưu trữ sổ cũ).

## 7. Điều KHÔNG được làm

- Không đổi `PZ_RULES`, không thêm phương án, không chọn lại giai đoạn sau khi chạy.
- Không dùng giai đoạn báo cáo để quyết định.
- Không chạy lại với lý do "sửa lỗi" mà không ghi lỗi đó vào mục sửa đổi dưới đây trước khi chạy lại.

## 8. Sửa đổi

### S1 — 14/11/2026 · sửa lỗi dữ liệu VN-Index và chạy lại (không đổi quy tắc)

- Lần chạy đầu (cùng ngày) dùng tệp VN-Index có 126 phiên 16/07/2019 → 09/01/2020 bị nhân 100 lần (xem HL-r2-prereg.md, S2). Lỗi lộ ra ở chính kết quả (mốc VN-Index 140,8%/năm), tức là kết quả lần chạy đầu ĐÃ được xem.
- Sửa dữ liệu và dựng lại bảng 16/07/2019 → 29/01/2021, rồi chạy lại. Không đổi PZ_RULES, phương án, tiêu chí hay giai đoạn.
- Cả hai lần chạy được công bố (`PZ-r1-results.run1-index-bug.json` và `PZ-r1-results.json`); quyết định theo lần chạy trên dữ liệu đã sửa.
