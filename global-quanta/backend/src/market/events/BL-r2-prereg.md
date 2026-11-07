# BL-r2 — Đăng ký trước: FM-v1 có báo trước việc cắt cổ tức tiền / cổ phiếu không? (kiểm lại H3 của BL-r1)

Ngày đăng ký: 07/11/2026. Viết **trước** khi tải dữ liệu và chạy. Không sửa tiêu chí sau khi xem kết quả.

## Vì sao có vòng này
BL-r1 trượt H3 (AUC 0,485), nhưng biến mục tiêu đo sai:
- dùng tổng tiền cổ tức đã trả theo **năm dương lịch** (BCTC mã 33600), lệch với năm tài chính;
- năm trả bằng cổ phiếu bị tính là cắt;
- tỷ lệ "cắt" lên 44%.

BL-r2 đo lại bằng **cổ tức tiền / cổ phiếu theo năm tài chính**, có điều chỉnh pha loãng.

**Mô hình không đổi:** vẫn FM-v1 nguyên bản, cùng mã nguồn `factorModel.js` của commit BL3. Không chỉnh biến, không chỉnh trọng số.

## Dữ liệu
- **Sự kiện cổ tức:** VNDirect qua Gateway, `/api/corp-events/ticker/:t`. Lịch sử có từ 2022.
  - Cổ tức tiền: `cat = CASH`, lấy `cash` (đ/cp).
  - Năm tài chính: trường `year`. Thiếu `year` thì dùng năm của ngày GDKHQ.
  - Cổ tức cổ phiếu / thưởng: `cat ∈ {STOCK, BONUS}`, lấy `ratio` (%).
- **Điểm FM-v1** tính point-in-time như BL-r1, cùng dữ liệu BCTC + giá của BL-r1.

## Biến mục tiêu
- **DPS(X)** = tổng `cash` của các đợt có năm tài chính X.
- **Hệ số pha loãng F(X→X+1)** = Π(1 + ratio/100) của các đợt cổ phiếu / thưởng có ngày GDKHQ nằm sau đợt tiền cuối của năm X và không muộn hơn đợt tiền cuối của năm X+1. Năm X+1 không có đợt tiền thì giới hạn trên là ngày chốt dữ liệu.
- **DPS điều chỉnh(X+1)** = DPS(X+1) × F (tiền / một cổ phiếu cũ).
- **Cắt** = DPS điều chỉnh(X+1) < 0,9 × DPS(X). Mẫu chỉ gồm mã có DPS(X) > 0. Năm X+1 không trả tiền tính là cắt.
- **Cặp năm:** X ∈ {2022, 2023, 2024}.
  - Năm X+1 được coi là đã đủ dữ liệu nếu ngày chốt (07/11/2026) ≥ 01/10 năm X+2.
  - Cả 3 cặp đều thoả.
  - Năm X = 2021 bị bỏ vì lịch sử sự kiện bắt đầu từ 2022, năm 2021 thiếu đợt đầu.

## Thời điểm chấm điểm
- Điểm FM-v1 lấy tại **ngày giao dịch đầu tiên của tháng 4 năm X+1**, khi BCTC năm X vừa dùng được.
- Nhãn "cắt" của năm X+1 chỉ biết sau đó.
- Chỉ tính mã có ≥ 4/6 nhóm có dữ liệu.

## Tiêu chí (phải đạt cả ba)
- **H3a:** AUC của (−điểm) dự đoán "cắt" ≥ **0,60**.
- **H3b:** ≥ **100** ca cắt.
- **H3c:** cận dưới khoảng tin cậy 95% của AUC > **0,50**.
  - Bootstrap 2000 lần, lấy mẫu lại theo **mã** để tính cả 3 năm của một mã cùng lúc.
  - Seed 20261107.
  - Tiêu chí này được thêm vì đây là lần thử thứ hai trên cùng câu hỏi; ngưỡng chặt hơn để bù cho việc thử nhiều lần.

**Báo cáo thêm (không làm cổng):**
- AUC riêng từng cặp năm.
- AUC khi loại các mã có trả cổ phiếu / thưởng trong năm X+1.
- AUC của riêng nhóm D (độ bền).
- Tỷ lệ cắt.

## Hệ quả
- **Đạt cả ba:** H3 của BL-r1 coi là đạt theo định nghĩa mới. Điểm FM-v1 được nâng nhãn từ MÔ TẢ lên **THĂM DÒ**, vì H1 và H2 đã đạt ở BL-r1.
- **Không đạt:** giữ nhãn **MÔ TẢ**. Không chạy lại với định nghĩa khác.
- **Giới hạn ghi nhận trước:**
  - thiên lệch sống sót (danh mục 284 mã hiện tại);
  - chỉ có 3 cặp năm;
  - các đợt cổ tức công bố muộn của năm 2025 có thể chưa có, khiến số ca cắt năm 2025 bị đếm thừa.

## Kết quả BL-r2 (chạy 07/11/2026 sau đăng ký — commit 6db4ebe): **KHÔNG ĐẠT** (H3a trượt) → FM-v1 giữ nhãn **MÔ TẢ**
Báo cáo: `bl-r2-report.json`. Mẫu: 145 mã có trả tiền ở năm X, 341 quan sát.

| Tiêu chí | Kết quả | Ngưỡng | |
|---|---|---|---|
| H3a – AUC dự đoán cắt | 0,580 | ≥ 0,60 | KHÔNG ĐẠT |
| H3b – số ca cắt | 125 (216 không cắt) | ≥ 100 | ĐẠT |
| H3c – CI 95% AUC (bootstrap theo mã) | [0,515; 0,646] | cận dưới > 0,50 | ĐẠT |

**Báo cáo thêm:**
- AUC theo cặp năm: 2022→2023: 0,580 (45/109) · 2023→2024: 0,543 (33/109) · 2024→2025: 0,580 (47/123).
- Loại các năm có trả cổ phiếu / thưởng: AUC 0,593 (77/236).
- Riêng nhóm D: AUC 0,520.
- Tỷ lệ cắt: 36,7%, giảm từ 44% của BL-r1.

**Diễn giải:**
- Với biến mục tiêu đo đúng, FM-v1 có phân biệt được việc cắt cổ tức, vì khoảng tin cậy nằm trên 0,5, nhưng yếu (AUC 0,58) và chưa qua ngưỡng đặt trước 0,60.
- Theo đăng ký: không chạy lại, nhãn giữ MÔ TẢ.
- Sổ theo dõi tiến BL-L1 vẫn ghi để kiểm ngoài mẫu.
