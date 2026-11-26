# PA-SMC-r1 — Đăng ký trước: CHoCH / BOS (Cấu trúc MTF v3) × Price Action × Khối lượng

> Đăng ký 26/11/2026, **trước khi** chạy bất kỳ lợi suất nào của các tổ hợp dưới đây. Chỉ đã xem: số lượng sự kiện CHoCH/BOS của 3 mã
> (HPG, MSH, NAF) để đo tốc độ — không xem lợi suất. PA-VOL-r1 (KHÔNG ĐẠT) đã biết trước; đây là câu hỏi khác: **cấu trúc CHoCH/BOS có
> cứu được Price Action × Khối lượng không**.
>
> Engine: cấu trúc = `src/lib/quant-core/mtf3` **3.0.0-s6** (đúng bản chạy trên biểu đồ, đóng gói nguyên vẹn bằng esbuild);
> Price Action = `src/lib/price-action` **pa-book-2.0.0**. Dữ liệu, vũ trụ, phí, rổ so sánh, mẫu, cụm sai số: **y hệt PA-VOL-r1**
> (1.974 mã VNDirect, trung vị GTGD 20 phiên ≥ 5 tỷ, ≥ 250 phiên lịch sử, phí 0,20% + 0,25%, vào giá mở phiên sau, loại mở cửa giá trần,
> vượt trội so với rổ đều trọng số, trong mẫu 2014–2020, ngoài mẫu 2021–10/2026, t gộp cụm theo tuần).

## Logic "siêu chỉ báo" cần kiểm (theo SMC + sách Price Action)

Cấu trúc đổi chiều / tiếp diễn (CHoCH↑ / BOS↑) → chờ giá **hồi** về → Price Action xác nhận tại vùng hỗ trợ (hoặc mẫu hình tiếp diễn) →
khối lượng xác nhận ở phiên kích hoạt. Tức là **không** mua ngay phiên phá cấu trúc mà mua nhịp hồi sau đó.

## Sự kiện (chỉ mua)

Tại phiên kích hoạt t của một setup PA mua (`REVERSAL_AT_SUPPORT` hoặc `CONTINUATION_IN_TREND`, đã kích hoạt, cấu trúc PA không giảm = S1 của PA-VOL-r1):

| Mã | Định nghĩa |
|---|---|
| **K1 — Cấu trúc + PA** | Trong 20 phiên t−20 … t−1 có sự kiện ngày **CHOCH_UP hoặc BOS_UP** (mtf3), **và** tại t trạng thái Dow ngày là UP hoặc UP_WEAK (chưa gãy đáy bảo vệ). |
| **K2 — Siêu chỉ báo (chính)** | K1 **và** điều kiện khối lượng của S2 PA-VOL-r1 (RVOL20 phiên kích hoạt ≥ 1,5 và tỷ lệ KL phiên tăng/giảm 20 phiên ≥ 1,0). |
| K3 — K2 + chân trên | K2 **và** Dow tuần (kỳ tuần ĐÃ ĐÓNG gần nhất) là UP hoặc UP_WEAK. |
| E-BOS, E-CHOCH | Mô tả: mua ở giá mở sau chính phiên BOS_UP / CHOCH_UP (không cần PA). |

## Giả thuyết (chỉ tiêu chính: vượt trội 10 phiên, ngoài mẫu)

- **H2 (lợi thế tuyệt đối của K2)**: trung bình > 0, t ≥ 2,0, dương ở cả hai nửa ngoài mẫu (2021–2023 / 2024–10/2026) và cùng dấu trong mẫu.
- **H3 (giả dược)**: trung bình K2 > phân vị 95 của 1.000 lần rút ngày ngẫu nhiên cùng mã, cùng quý.
- **H1 (cấu trúc cộng thêm giá trị)**: K2 − S2 của PA-VOL-r1 phần KHÔNG thuộc K2 > 0, bootstrap khối theo tháng một phía p < 0,05.
- Tối thiểu **150** sự kiện K2 ngoài mẫu (K2 hiếm hơn S2); thiếu → THIẾU MẪU.

**ĐẠT** = H2 + H3. Còn lại KHÔNG ĐẠT. K3, E-BOS, E-CHOCH, kỳ hạn 5/20 phiên chỉ mô tả (BH-FDR).

## Không làm
- Không đổi ngưỡng (20 phiên cửa sổ, RVOL 1,5, tỷ lệ 1,0) sau khi xem kết quả; muốn đổi → r2.
- Lỗi CHoCH↓ không bao giờ phát (phát hiện khi đếm sự kiện) không ảnh hưởng kiểm định chiều mua; sửa riêng, không chạy lại r1.
