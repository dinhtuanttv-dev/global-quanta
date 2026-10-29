# SEAS-prereg-v1 — Kiểm định đăng ký trước: mùa vụ tháng "5 năm gần nhất" (ĐÃ DUYỆT 29/10/2026)

**Chốt TRƯỚC khi chạy số.** Cấu hình + SHA-256 (cả cấu hình lẫn tệp dữ liệu) nằm trong `seas-prereg-config.json` và được commit trước
khi chạy `scripts/seasonality-validate.mjs run`. Kiểm định chạy **một lần**; script từ chối chạy lại hoặc chốt lại khi đã có báo cáo.

## Vì sao không phải walk-forward 2019–2025 như phương án ban đầu
Lịch sử giá SSI (kho Gateway) chỉ bắt đầu **26/02/2020** — không có đủ 5 năm trước 2024. Anh duyệt 29/10/2026 khung thay thế dưới đây.

## Dữ liệu
- Universe scanner Gateway (286 mã) tại thời điểm tải; ngành ICB cấp 2 hiện hành. **Giới hạn ghi rõ:** danh sách mã và ngành là
  HIỆN TẠI (thiên lệch sống sót — mã đã huỷ niêm yết không có mặt); kết luận có thể lạc quan hơn thực tế.
- Giá: danh nghĩa SSI → điều chỉnh cộng dồn theo sự kiện quyền (cổ tức tiền + cổ phiếu) = `ADJUSTED_CUMULATIVE` của Gateway
  (xấp xỉ tổng lợi suất trước thuế). Benchmark: VN-Index (điểm).
- Engine: `SEAS-v1` (`config.js`) — không đổi trong kiểm định.

## Thiết kế
- **Dự báo** cho mã i, tháng m, năm kiểm tra Y = excess **đã co** (ngành × tháng, bỏ chính mã) của SEAS-v1, học trên các năm dương lịch
  `[max(2021, Y−5), Y−1]` (cửa sổ mở rộng, tối thiểu 3 năm); dữ liệu cắt tại 31/12 năm Y−1 (point-in-time).
- **Thực tế** = lợi suất tháng (Y, m) của mã − VN-Index.
- **Năm kiểm tra:** 2024 (học 2021–2023), 2025 (2021–2024), 2026 tới hết **09/2026** (2021–2025) → tối đa **33 tháng**.
  Mỗi tháng là một cụm; cần ≥ 30 mã có cả dự báo và thực tế.

## Tiêu chí ĐẠT (phải đủ cả bốn) — H1: MÃ
| ID | Tiêu chí |
|---|---|
| C1 | IC Spearman trung bình theo tháng > 0 **và** t ≥ 2 (t = TB / (độ lệch chuẩn / √số tháng)) |
| C2 | ≥ 2/3 năm kiểm tra có IC trung bình > 0 |
| C3 | Long–short (ngũ phân vị dự báo cao nhất − thấp nhất) sau phí 2 × 0,40% > 0 **và** cận dưới KTC 90% (bootstrap 10.000 lần theo tháng, seed 20261029) > 0 |
| C4 | Placebo: dịch nhãn tháng của dự báo k = 1…11 tháng — IC thật phải **đứng thứ nhất** trong 12 phương án |

## H2: NGÀNH ICB cấp 2 (cùng tiêu chí)
Chỉ số ngành = `buildSectorIndex` (GTGD 60 phiên, trần 25%, tái cân bằng đầu tháng — cùng định nghĩa RRG/L2), excess so VN-Index, prior
toàn bộ ngành; mặt cắt ngang tối thiểu 15 ngành. Mặt cắt nhỏ (~30 ngành) nên công suất thấp — kết quả công bố như nhau.

## Mô tả thêm (không đổi kết luận)
Long-only ngũ phân vị cao nhất sau phí 0,40% so VN-Index (TB + KTC 90%); IC từng tháng; số mã trung bình mỗi tháng.

## Hệ quả
- ĐẠT → mùa vụ (mã/ngành tương ứng) được bậc **ĐẠT KIỂM ĐỊNH / GẦN ĐẠT** trong "⏱ Lịch thời điểm" theo bảng §2.5 phương án v2.
- KHÔNG ĐẠT → nhãn **THĂM DÒ**, mọi dòng mùa vụ chỉ ở bậc **BỐI CẢNH** (ẩn mặc định). Kết quả công bố nguyên trạng dù đạt hay không.
- Sổ theo dõi tiến (MV3) vẫn ghi dự báo mỗi đầu tháng để đánh giá hiệu chuẩn độc lập với kiểm định lịch sử này.

## KẾT QUẢ (chạy một lần 29/10/2026 — `seas-prereg-report.json`)
| | C1 IC (t) | C2 năm IC > 0 | C3 long–short sau phí [KTC 90%] | C4 placebo | Kết luận |
|---|---|---|---|---|---|
| **H1 Mã** (33 tháng, ~270 mã/tháng) | +0,009 (t 0,45) ✖ | 2/3 (2024 −0,012 · 2025 +0,019 · 2026 +0,025) ✔ | −0,13% [−1,17; +0,92] ✖ | hạng 4/12 ✖ | **KHÔNG ĐẠT → THĂM DÒ** |
| **H2 Ngành** (33 tháng, 18 ngành) | −0,115 (t −2,13) ✖ | 0/3 ✖ | −4,07% [−6,06; −2,15] ✖ | hạng 12/12 ✖ | **KHÔNG ĐẠT → THĂM DÒ** |

Mô tả thêm: long-only ngũ phân vị cao nhất sau phí — mã −0,34%/tháng [−1,56; +0,90], ngành −2,22% [−3,49; −0,97].
Ngành cho IC **âm có ý nghĩa** (tháng mạnh lịch sử của ngành kém năm sau). Đây là quan sát SAU kiểm định — không đảo dấu để dùng
làm tín hiệu; nếu muốn dùng phải đăng ký trước một giả thuyết đảo chiều riêng và kiểm định trên dữ liệu mới.
Chỉ 18/34 ngành ICB cấp 2 có rổ đủ điều kiện chỉ số (GTGD ≥ 300 triệu, ≥ 2 mã) trong universe 286 mã.
**Hệ quả:** mùa vụ tháng (mã và ngành) hiển thị như **bối cảnh lịch sử**, nhãn THĂM DÒ; không có bậc ĐẠT/GẦN ĐẠT trong Lịch thời điểm.

## ⚠ THU HỒI KẾT QUẢ (29/10/2026) — kiểm định KHÔNG HỢP LỆ do lỗi engine
Khi thử bộ kiểm định SEAS-REV trên dữ liệu giả lập, phát hiện engine **SEAS-v1** co excess về **TB các mã KHÁC** (bỏ chính mã). Với n 3–5
năm, mức co gần toàn phần nên dự báo ≈ (tổng − x_i)/(n − 1), tức **ngược hạng với chính lịch sử của mã**. Dự báo đưa vào kiểm định vì vậy
không đo "mùa vụ có lặp lại không" mà đo một đại lượng đảo dấu. Oracle Python không bắt được vì cài lại cùng đặc tả sai.
- Bảng KẾT QUẢ ở trên (và `seas-prereg-report.json`) **giữ nguyên để minh bạch** nhưng **không có giá trị kết luận** — cả "KHÔNG ĐẠT"
  của mã lẫn IC ngành −0,115 (nhiều khả năng là ảo giác của lỗi; có thể thực chất là mùa vụ LẶP LẠI). Không kiểm lại trên dữ liệu
  2024–2026 để "xác nhận" — dữ liệu đó đã bị nhìn.
- Sửa: **SEAS-v1.1** — đích co = TB cả nhóm GỒM chính mã (James–Stein chuẩn); thêm test hồi quy (co toàn phần -> dự báo phẳng; tín hiệu
  rõ -> giữ hạng thô) — test này FAIL trên v1.
- Giả thuyết "đảo chiều mùa vụ ngành" (SEAS-REV) **bị huỷ** vì tiền đề là ảo giác.
- Kiểm định lại MỘT lần trên dữ liệu **chưa từng nhìn** (VNDirect 2013–2019): `SEAS-prereg-v2.md`.
