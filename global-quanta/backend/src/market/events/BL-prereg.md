# BL-r1 — Đăng ký trước: mô hình nhân tố xếp hạng cổ phiếu cổ tức (Bộ lọc cổ phiếu, BL3)

Ngày đăng ký: 07/11/2026. Viết **trước** khi chạy kiểm định. Không sửa tiêu chí sau khi xem kết quả; muốn đổi mô hình thì đăng ký lại thành BL-r2.

## Mục đích
Thay "Dividend Quality Score" (Project A) bằng một xếp hạng minh bạch, có kiểm định. Câu hỏi: điểm tổng hợp có phân biệt được (a) lợi nhuận tổng 12 tháng sau và (b) khả năng cắt cổ tức năm sau hay không.

## Mô hình FM-v1 (cố định trước kiểm định)
6 nhóm nhân tố. Mỗi biến được chuẩn hoá z theo **nhóm ngành** (`sectorGroup`): cắt đuôi ở ±3, trung vị điền cho biến thiếu khi nhóm còn ≥ 1 biến có dữ liệu.

| Nhóm | Biến (chiều) |
|---|---|
| Y – Lợi suất | Tổng cổ tức đã trả năm tài chính gần nhất (BCTC năm, mã 33600) / vốn hoá (+) |
| D – Độ bền | Chi trả 5 năm (−, chỉ khi 0 < chi trả ≤ 1,5); dòng tiền tự do 5 năm / cổ tức (+); số năm chi liên tục, trần 10 (+); số lần cắt > 10% trong 10 năm (−) |
| G – Tăng trưởng | Tăng trưởng cổ tức đã trả 3 năm, CAGR (+); tăng trưởng LNST 12 tháng (+) |
| Q – Chất lượng | ROE 12 tháng (+); dòng tiền HĐKD / LNST 12 tháng (+); accrual (−) |
| V – Định giá | LNST 12 tháng / vốn hoá (+); vốn chủ sở hữu / vốn hoá (+) |
| R – Rủi ro thấp | Biến động 1 năm (−); sụt giảm lớn nhất 1 năm (+, tức sụt ít hơn là tốt) |

- Điểm nhóm = trung bình các biến của nhóm. **Điểm tổng hợp = trung bình đều 6 nhóm.** Trọng số giao diện cho người dùng chỉnh không thuộc phạm vi kiểm định.
- Vốn hoá tại t = giá tại t × số cổ phiếu, với số cổ phiếu = LNST 12 tháng / EPS 12 tháng (BCTC quý).
- Ngân hàng / chứng khoán / bảo hiểm không có dòng tiền tự do và accrual có nghĩa, nên các biến đó để trống.

## Point-in-time
- **BCTC quý:** dùng được từ ngày công bố (`createdDate` nếu trễ 0–120 ngày sau cuối quý, ngược lại cuối quý + 45 ngày).
- **BCTC năm:** dùng được từ 01/04 năm sau.
- **Giá:** giá điều chỉnh VNDirect (đã gồm cổ tức), dùng tới ngày t.
- **Ngành:** `sectorGroup` hiện tại. Danh mục là 284 mã hiện tại, nên có **thiên lệch sống sót**; bias này được ghi nhận, không sửa.

## Thiết kế kiểm định
- **Mặt cắt:** ngày làm việc đầu mỗi tháng, từ 06/2021 tới 10/2025 (cần 1 năm giá cho R và 12 tháng tương lai). Chỉ tính mã có ≥ 4/6 nhóm có dữ liệu.
- **Mục tiêu A:** lợi nhuận tổng 12 tháng sau, theo giá điều chỉnh.
- **Mục tiêu B:** có cắt cổ tức năm tài chính kế tiếp (cổ tức đã trả năm sau < 0,9 × năm gần nhất), chỉ xét mã đang trả > 0.

## Tiêu chí (phải đạt cả H1, H2, H3 mới gắn nhãn THĂM DÒ; không đạt → điểm chỉ dùng để **sắp xếp mô tả**, nhãn MÔ TẢ)
- **H1 – IC lợi nhuận:**
  - IC Spearman trung bình tháng giữa điểm tổng hợp và lợi nhuận 12 tháng phải ≥ 0,03.
  - Thống kê t Newey–West (độ trễ 12) phải ≥ 2.
- **H2 – Chênh nhóm:**
  - Lợi nhuận trung bình nhóm ngũ phân vị cao nhất trừ thấp nhất phải > 0.
  - Khoảng tin cậy 95% bootstrap theo khối 12 tháng không chứa 0.
- **H3 – Cắt cổ tức:**
  - AUC của (−điểm) dự đoán cắt cổ tức năm sau ≥ 0,60.
  - Tối thiểu 100 trường hợp cắt.
- **H4 (báo cáo, không làm cổng):**
  - IC riêng từng nhóm Y, D, G, Q, V, R.
  - IC hai nửa thời gian.

## Sổ theo dõi tiến (BL-L1)
Từ khi triển khai, mỗi tháng ghi một lần điểm tổng hợp và ngũ phân vị của mọi mã. Chấm sau 12 tháng; không sửa bản ghi cũ.

## Kết quả BL-r1 (chạy 07/11/2026 sau khi đăng ký — commit 51d481d): **KHÔNG ĐẠT** (H3 trượt) → điểm FM-v1 gắn nhãn **MÔ TẢ**
Báo cáo: `bl-r1-report.json`. 284 mã, 53 mặt cắt tháng (06/2021–10/2025), trung bình 255 mã mỗi mặt cắt.

| Tiêu chí | Kết quả | Ngưỡng | |
|---|---|---|---|
| H1 – IC Spearman 12 tháng | 0,142; t Newey–West 4,79 | ≥ 0,03 và t ≥ 2 | ĐẠT |
| H2 – Ngũ phân vị cao − thấp | +11,95%/năm, CI 95% [6,59%; 20,57%] | > 0, CI không chứa 0 | ĐẠT |
| H3 – AUC dự đoán cắt cổ tức | 0,485 (386 ca cắt / 482 không cắt) | ≥ 0,60 và ≥ 100 ca | KHÔNG ĐẠT |

H4 (chỉ báo cáo):
- IC theo nhóm: Y 0,104 · D 0,010 · G −0,001 · Q 0,096 · V 0,087 · R 0,110.
- IC theo nửa thời gian: 0,095 / 0,188.

**Diễn giải và giới hạn (ghi nhận, không sửa mô hình):**
1. **Thiên lệch sống sót:** danh mục là 284 mã hiện tại, nên IC và chênh lệch có thể bị thổi phồng. Mã bị huỷ niêm yết / rời danh mục không có trong mẫu.
2. **"Cắt cổ tức" cấp công ty bị nhiễu:**
   - cổ tức đã trả theo năm dương lịch lệch năm tài chính;
   - năm trả bằng cổ phiếu bị tính là cắt.
   - Tỷ lệ "cắt" 44% cho thấy biến mục tiêu B chưa đo đúng. Muốn kiểm lại cần biến mục tiêu theo cổ tức / cp từng năm tài chính (sự kiện VNDirect chỉ có từ 2022), tức là đăng ký mới BL-r2.
3. Nhóm D (độ bền) và G (tăng trưởng) gần như không liên quan tới lợi nhuận 12 tháng. Phần lớn sức mạnh đến từ Y, R, Q, V.

**Hệ quả theo đăng ký:** FM-v1 chỉ dùng để sắp xếp **MÔ TẢ**, không gắn nhãn THĂM DÒ. Sổ theo dõi tiến BL-L1 vẫn ghi để kiểm chứng ngoài mẫu.
