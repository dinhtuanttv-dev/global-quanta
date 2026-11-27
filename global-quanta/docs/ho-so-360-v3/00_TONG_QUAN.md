# Hồ sơ 360° v3 — Bộ đặc tả nâng cấp (tab QUYẾT ĐỊNH › 2)

> **Mã tài liệu:** `GQ-SPEC-HS360-V3` · **Ngày:** 27/11/2026 · **Trạng thái:** đề xuất, chờ chủ dự án duyệt
> **Nền mã:** `main` 254a0662 (sau #405 EV-4 và #406 sửa đổi E2-v1)
> **Nối tiếp:** `C:\Users\HP\Ho-so-360-v2` (tài liệu 01–25) và `docs/HO_SO_360_MASTER_PLAN.md` (v1.1). Bộ này **không thay** các quyết định cũ đã triển khai; chỉ đặc tả bước kế tiếp dựa trên hiện trạng đo được.

## Bộ tài liệu

| Tệp | Nội dung |
|---|---|
| `00_TONG_QUAN.md` | Mục tiêu, kết luận rà soát, quyết định cần duyệt (tệp này) |
| `01_RA_SOAT_HIEN_TRANG.md` | Rà soát tab QUYẾT ĐỊNH và rà soát chuyên sâu Hồ sơ 360°, số đo trên trang thật |
| `02_KIEN_TRUC_MUC_TIEU.md` | Kiến trúc thông tin mới: 4 góc nhìn, bản đồ gộp tính năng thừa |
| `03_TIN_HIEU_E2_TRONG_HO_SO.md` | Đưa 25 tín hiệu E2 (gồm CAN SLIM, KQKD mới) + SQS / xu hướng / IC theo chế độ vào hồ sơ |
| `04_HOP_DONG_DU_LIEU.md` | Ảnh chụp hồ sơ một lần gọi `GET /api/elite/profile/:ticker`, nguồn gốc, độ tươi |
| `05_GIAO_DIEN.md` | Bố cục từng góc nhìn, khung dây, chuẩn QUANTA UI, di động, truy cập |
| `06_LO_TRINH_NGHIEM_THU.md` | Lộ trình P0 → H5, kiểm thử, tiêu chí nghiệm thu, cách lùi |

## Mục tiêu

Biến Hồ sơ 360° từ một **trang dài xếp chồng 9 khối** (2.509 px góc Tổng hợp, 2.116 px góc Doanh nghiệp) thành **bàn phân tích một mã** có thứ tự đọc rõ ràng:

1. **Kết luận trước:** mã đang ở đâu so với Elite HL, vì sao, rủi ro gì, sự kiện kế tiếp — trong một màn hình.
2. **Bằng chứng sau:** mỗi lớp phân tích một dòng, có dấu bằng chứng (ĐẠT / MỘT PHẦN / THĂM DÒ / KHÔNG ĐẠT); bấm để mở chi tiết.
3. **Tín hiệu đầy đủ:** 25 tín hiệu E2 với bậc, SQS, xu hướng và IC theo chế độ thị trường hiện tại.
4. **Không lặp:** mỗi số chỉ xuất hiện ở một nơi chính.

Nguyên tắc bất biến (giữ từ v1/v2):
- Chỉ hiển thị: **không đổi quy tắc Elite HL, bậc E2, trọng số E3**, ngưỡng, sổ theo dõi.
- Không điền số giả; thiếu nguồn ghi rõ.
- Mọi nhãn bằng chứng lấy từ Gateway (E2, ER-v1, IMPACT_EVIDENCE, EV-4), giao diện không tự suy ra.
- Giữ mọi `data-testid` đang có, hoặc liệt kê rõ testid được thay (như đã làm ở #363 và #404).

## Kết luận rà soát (tóm tắt)

| # | Phát hiện | Mức | Xử lý |
|---|---|---|---|
| F1 | **Bảng tín hiệu E1 thiếu toàn bộ nhóm dòng tiền ở 9/10 phiên gần nhất (13/11 → 27/11)**. Bảng dựng 15:47, trước job dòng tiền 16:00. Stealth 20/5, IFE, động lượng, RVOL trống → Điểm Elite mất 2 tín hiệu bậc A, **tầng 3 của Elite HL mất 3 phiếu**, Hồ sơ hiện ô trống. | **P0** | Sửa riêng trước (P0 trong `06`) |
| F2 | Mở tab 2 lần đầu mặc định **VNINDEX** → hiện "không nằm trong vũ trụ" | Cao | Mặc định mã đang chọn, nếu không có thì mã hạng 1 Elite HL |
| F3 | Vị thế Elite HL lặp **4 lần** trên một trang (thanh đầu, dải điểm, khối "Vị trí", khối Hợp lưu) | Cao | Một nguồn duy nhất ở thanh đầu |
| F4 | LS-v1 lặp **3 lần** (Hợp lưu tầng 1, khối Sức mạnh dẫn dắt, dòng tín hiệu) | Vừa | Gộp vào lớp "Dẫn dắt" |
| F5 | Điểm Elite Z (danh mục dòng tiền — **đối chứng**) đứng ngang hàng thông tin chính thức: "Hạng 31/269" cạnh "hạng hợp lưu 1" | Cao | Chuyển xuống góc Tín hiệu, gắn nhãn đối chứng |
| F6 | "Price Action × Khối lượng" (kỹ thuật) nằm **trong khối Thanh khoản của góc Doanh nghiệp** | Vừa | Chuyển sang lớp Kỹ thuật |
| F7 | Nhãn sai: "Dự báo LNST **quý tới** (nowcast)" — số thực tế là **cả năm** (ước tính 644 tỷ vs luỹ kế 503 tỷ, 78% năm) | Vừa | Sửa nhãn; dùng chung với tín hiệu E2 `kq_nowcast` |
| F8 | Bảng tín hiệu chưa có SQS / xu hướng / IC theo chế độ (EV-4); tín hiệu mới `camslim_cup`, `kq_nowcast` chưa có định dạng riêng (sẽ hiện "0,73" thay vì "+72,8%") | Cao | `03` |
| F9 | `structure_stage`, `log_rvol` rời bảng E2 (#406) nhưng vẫn là dữ liệu thật (mô hình TA của Elite HL; đảo chiều ngắn hạn) → hồ sơ cần hiện đúng chỗ | Vừa | `03` §4 |
| F10 | Góc Tổng hợp gọi ≥ 8 API rời; góc Doanh nghiệp tải lại `/api/market/universe` + `/securities` chỉ để biết sàn | Vừa | Ảnh chụp `/api/elite/profile/:ticker` (`04`) |

## Quyết định cần chủ dự án duyệt

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Sửa F1 (bảng E1 thiếu dòng tiền) ngay, tách khỏi Hồ sơ? | **Có — PR riêng, ưu tiên trước mọi việc giao diện** |
| Q2 | Bốn góc nhìn: **Tổng quan · Tín hiệu · Doanh nghiệp · Sự kiện & thời điểm** (thêm "Tín hiệu", đổi "Tổng hợp" → "Tổng quan")? | Có |
| Q3 | Điểm Elite Z và thác đóng góp chuyển xuống góc Tín hiệu, nhãn "Điểm Elite — danh mục dòng tiền (đối chứng)"? | Có |
| Q4 | Thẻ **Luận điểm** đầu trang do code dựng theo luật cố định (không dùng AI, không có từ "mua/bán")? | Có |
| Q5 | Thêm endpoint ảnh chụp `GET /api/elite/profile/:ticker` (một lần gọi, khoá theo phiên), giữ nguyên các endpoint cũ? | Có |
| Q6 | Mặc định mã khi mở tab 2: mã đang chọn toàn cục → nếu không có / không thuộc vũ trụ thì mã hạng 1 Elite HL? | Có |
| Q7 | Biểu đồ giá nhỏ (90 phiên, giá điều chỉnh, vùng PZ) trong thẻ Luận điểm? Đã từng hoãn ("sparkline cần duyệt riêng") | Có, chỉ đọc |
