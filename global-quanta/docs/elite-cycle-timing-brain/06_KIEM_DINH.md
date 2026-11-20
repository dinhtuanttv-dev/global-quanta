# 06 — Kiểm định

## 1. Sổ đăng ký bằng chứng hiện hành (nguồn của `Tier`)

| Thành phần | Kết quả | Bậc hiển thị |
|---|---|---|
| Timeline W1–W5 "đạt" | Rà soát 07/11 (Hồ sơ 360 v2, tài liệu 13): "đạt" xấp xỉ ngẫu nhiên | VALIDATED/NEAR giữ nguyên văn, kèm chú thích "xem rà soát 07/11" |
| TO-v1 Săn cổ tức | TO-r1 đăng ký trước (84b7092). Sổ TO-L1 ghi từ 09/11 | EXPLORATORY (THĂM DÒ) |
| Elite × TO | Sổ bóng ELITE-TO, đánh giá khoảng 02–03/2027 | THĂM DÒ |
| EX-r1 (giá quanh GDKHQ) | KHÔNG ĐẠT. Giữ ATC | FAILED (chỉ mô tả) |
| Mùa vụ tháng (MV prereg-v2) | KHÔNG ĐẠT cả hai | CONTEXT |
| S8 ngày công bố thật | THĂM DÒ. Cổng CafeF 98,0% | EXPLORATORY |
| `DecisionBar` ngưỡng 50/60 | Không thấy prereg | CHƯA HIỆU CHUẨN |
| MP-b/MP-c (mô phỏng vào ngay và chờ) | Có, phí engine 0,45% | MÔ TẢ |

## 2. Kiểm định kỹ thuật (bắt buộc, không phải giả thuyết thị trường)

| Mã | Kiểm định | Cách làm |
|---|---|---|
| KT1 | Tầng 2 thuần và tất định | Cùng đầu vào cho cùng đầu ra. Không có `Date.now()` bên trong. Ngày "hôm nay" truyền vào như tham số |
| KT2 | Bảo toàn nguồn | Với fixture thật 20/11: mọi trường số của nguồn xuất hiện **nguyên văn** trong VM. So từng trường, sai lệch phải bằng 0 |
| KT3 | Song song Timeline | Dòng PA và dòng GW cùng khoá phải trùng mọi trường, trừ `sessionsToEntry` (ngoại lệ đã biết). Có ngoại lệ mới thì test đỏ |
| KT4 | Đối soát ngày | MSH Q4/2026 phải cho `spreadDays = 2`, `primary = 2027-02-01`, và có cảnh báo |
| KT5 | Làn | Mỗi dòng DIVIDEND thô thành đúng một `DIV_W`. Mỗi dòng TO thành đúng một `DIV_TO`. Không mất và không nhân đôi dòng |
| KT6 | Nhất quán khung | Trong khung "Mã đang chọn", mọi khối hiện cùng `key` và cùng ngày `primary` (E2E) |
| KT7 | Vân tay | Tắt lớp "Thời điểm hợp nhất" thì DOM trùng vân tay hiện tại |

## 3. Giả thuyết thị trường (chỉ khi anh muốn; đăng ký trước, chạy một lần)

Các giả thuyết này **không bắt buộc** để làm CT1–CT4. Ghi ra để không ai lén biến tầng 2 thành tín hiệu.

| Mã | Giả thuyết | Mẫu | Ngưỡng đạt (đề xuất) |
|---|---|---|---|
| CT-r1 | Dòng có `agree = false` (các nguồn lệch ngày) có phản ứng giá quanh công bố khác dòng `agree = true` | VNDirect 2013–2019, vũ trụ đúng thời điểm | Hiệu \|Δ\| ≥ 0,5 điểm %, t ≥ 2, placebo dịch ngày ±10 phiên mất hiệu ứng |
| CT-r2 | Khi DIV_W và DIV_TO cùng một GDKHQ, lợi nhuận tốt hơn khi chỉ có một làn | Sổ TO-L1 + ELITE-TO | Chỉ chấm sau mốc 02–03/2027, n ≥ 30 |

Quy tắc chung: dùng vũ trụ đúng thời điểm (bài học 12/11). Tính cả chi phí. Công bố cả khi KHÔNG ĐẠT. Kết quả KHÔNG ĐẠT thì **không** đưa vào điểm Elite.
