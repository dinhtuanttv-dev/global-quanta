# SEAS-prereg-v2 — Kiểm định đăng ký trước: mùa vụ tháng trên dữ liệu CHƯA TỪNG NHÌN (ĐÃ DUYỆT 29/10/2026)

Thay SEAS-prereg-v1 (đã thu hồi: lỗi engine v1 làm dự báo ngược hạng — xem `SEAS-prereg.md`). Cấu hình + SHA-256 (cấu hình và tệp dữ
liệu) nằm trong `seas-prereg-v2-config.json`, **commit trước khi chạy**. Chạy **một lần**; script từ chối chạy lại / chốt lại.

## Dữ liệu (độc lập với mọi lần nhìn trước)
- **VNDirect** `/v4/stock_prices` — giá điều chỉnh `adClose`, GTGD `nmValue`, từ 02/01/2013. Script chạy **cắt dữ liệu tại 31/12/2019**:
  giai đoạn 2020–2026 (đã nhìn ở v1) không được đưa vào phép tính.
- Danh sách: mọi mã có ngành ICB cấp 2 (phân ngành VNDirect hiện hành) + mã **đã huỷ niêm yết** có ngành. Lọc cố định: mã từng đủ GTGD TB 60
  phiên ≥ 300 triệu (điều kiện vào chỉ số ngành). Tải 29/10/2026: 1.188 mã (135 mã đã huỷ niêm yết), 758 mã chưa từng đủ điều kiện bị loại.
- **Đối soát nguồn (R0, 29/10):** lợi suất tháng VNDirect so với ADJUSTED_CUMULATIVE của Gateway trên 03/2020–09/2026 (281 mã, 20.622 cặp):
  tương quan 0,991, sai lệch tuyệt đối trung vị 0,001%, 3,3% cặp lệch > 1% (tập trung vài mã HNX/UPCoM — cách điều chỉnh sự kiện quyền khác
  nhau). Đạt ngưỡng (≥ 0,99) nhưng **sát ngưỡng** — ghi nhận là giới hạn.
- **Giới hạn khác:** mã huỷ niêm yết không có trong phân ngành hiện hành bị thiếu (thiên lệch sống sót còn một phần); ngành là phân ngành
  HIỆN TẠI áp ngược về quá khứ.
- Benchmark: **bình quân đều** các chuỗi trong phép thử (VN-Index cùng nguồn không có trước 08/2017). IC hạng và long–short không phụ thuộc
  benchmark; C5 long-only so với bình quân đều.

## Thiết kế
- Engine **SEAS-v1.1** (không đổi tham số). Dự báo cho chuỗi i, tháng m, năm Y = excess **đã co** học trên `[max(2013, Y−5), Y−1]`
  (mở rộng, ≥ 3 năm), dữ liệu cắt 31/12 năm Y−1. **Dấu chốt trước: +1** (mùa vụ LẶP LẠI — giả thuyết ban đầu).
- Năm kiểm tra **2016, 2017, 2018, 2019** → tối đa **48 tháng**, mỗi tháng một cụm.
- **H1 — MÃ:** co về ngành ICB cấp 2; cần ≥ 30 mã/tháng.
- **H2 — NGÀNH:** chỉ số ngành = `buildSectorIndex` (GTGD 60 phiên, trần 25%, tái cân bằng đầu tháng); cần ≥ 12 ngành/tháng.

## Tiêu chí ĐẠT (phải đủ cả năm, cho từng giả thuyết)
| ID | Tiêu chí |
|---|---|
| C1 | IC Spearman TB theo tháng > 0 **và** t ≥ 2 |
| C2 | ≥ 3/4 năm kiểm tra có IC TB > 0 |
| C3 | Long–short ngũ phân vị sau phí 2 × 0,40% > 0 **và** cận dưới KTC 90% (bootstrap 10.000 lần theo tháng) > 0 |
| C4 | Placebo dịch nhãn tháng k = 1…11 — IC thật **đứng thứ nhất** trong 12 |
| C5 | Long-only ngũ phân vị dự báo cao nhất vượt bình quân đều sau phí 0,40% > 0 **và** cận dưới KTC 90% > 0 |

## Mô tả thêm (không đổi kết luận)
- **Cơ chế:** IC riêng phần sau khi kiểm soát excess 12 tháng gần nhất và excess tháng trước (hạng, hồi quy OLS). Nếu hiệu ứng biến mất sau
  kiểm soát → đó là đà / đảo chiều chung, không phải "mùa vụ".
- IC từng tháng, số chuỗi trung bình mỗi tháng.
- Công suất ước tính ~60% (48 tháng): KHÔNG ĐẠT không chứng minh "không có mùa vụ", chỉ là "chưa chứng minh được".

## Hệ quả
- ĐẠT (mã và/hoặc ngành) → bậc **GẦN ĐẠT** trong "⏱ Lịch thời điểm" cho phần tương ứng; lên **ĐẠT KIỂM ĐỊNH** chỉ khi sổ theo dõi tiến (R3,
  từ 11/2026) đạt ở mốc 12/24/36 tháng.
- KHÔNG ĐẠT → giữ **THĂM DÒ**, mùa vụ chỉ là **BỐI CẢNH**; không có lần chạy lại trên dữ liệu này.

## KẾT QUẢ (chạy một lần 29/10/2026 — `seas-prereg-v2-report.json`)
| | C1 IC (t) | C2 năm IC > 0 | C3 long–short sau phí [KTC 90%] | C4 placebo | C5 long-only sau phí [KTC 90%] | Kết luận |
|---|---|---|---|---|---|---|
| **H1 Mã** (48 tháng, ~806 mã/tháng, 1.069 chuỗi) | +0,013 (1,56) ✖ | 3/4 ✔ | −0,13% [−0,58; +0,33] ✖ | 2/12 ✖ | −0,41% [−0,73; −0,10] ✖ | **KHÔNG ĐẠT** |
| **H2 Ngành** (45 tháng, ~18 ngành) | +0,040 (1,08) ✖ | 2/4 ✖ | −0,81% [−1,94; +0,31] ✖ | 1/12 ✔ | −0,47% [−1,33; +0,42] ✖ | **KHÔNG ĐẠT** |

- Cơ chế: IC riêng phần sau kiểm soát đà 12 tháng + tháng trước — mã +0,010 (t 1,24), ngành +0,024 (t 0,68).
- Đọc kết quả: có **dấu hiệu lặp lại yếu, cùng chiều** (IC dương ở cả mã và ngành) — khác hẳn "đảo chiều" của v1 lỗi — nhưng **quá nhỏ để
  dùng sau chi phí**: nhóm mã mùa vụ tốt nhất còn thua bình quân đều sau phí 0,40% (C5 âm có ý nghĩa).
- **Hệ quả:** mùa vụ tháng (mã và ngành) giữ **THĂM DÒ**, chỉ là **BỐI CẢNH** trong Lịch thời điểm. Không chạy lại trên dữ liệu này. Sổ theo dõi
  tiến (R3, từ 11/2026) vẫn ghi để đánh giá độc lập.
