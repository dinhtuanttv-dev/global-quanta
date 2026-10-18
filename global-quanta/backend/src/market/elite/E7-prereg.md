# E7 — Kiểm định hồi cứu walk-forward Điểm Elite: đăng ký trước

Ghi ngày 2026-10-17, **trước khi** viết mã và trước khi chạy trên dữ liệu thật. Không sửa sau khi chạy. Kết quả, đạt hay không, được
công khai ở `/api/elite/retro` và tab Bằng chứng.

## Câu hỏi

Nếu quy trình E2 → E3 (bậc bằng chứng → trọng số theo IC hậu nghiệm → danh mục Elite 10) được chạy mỗi phiên trong quá khứ, **chỉ
với dữ liệu có tại thời điểm đó**, thì Điểm Elite và danh mục có tạo lợi thế ngoài mẫu hay không?

## Phạm vi tín hiệu

Chỉ 5 tín hiệu có lịch sử point-in-time trong `market_flow_daily.features`: `stealth5`, `stealth20`, `net_intent`, `mom5_atr`,
`log_rvol`. Các tín hiệu khác trong sổ E1 không có giá trị lịch sử nên **không** tham gia (đây là giới hạn chính: kiểm định một
phiên bản thu gọn của Điểm Elite).

## Quy trình walk-forward (mỗi phiên D)

1. **IC đã chín**: IC(d, h) theo định nghĩa E2 chỉ được dùng khi phiên ra d+1+h ≤ D.
2. **Bậc**: trạng thái bậc mang từ phiên trước sang; mỗi phiên áp đúng luật E2 (`decideTier`: giáng trước, một bậc mỗi lần) với
   tóm tắt IC đã chín và q Benjamini–Hochberg tính lại trên 5 tín hiệu × 4 kỳ hạn có ≥ 40 ngày. Bậc khởi điểm theo sổ E1:
   `stealth5`, `stealth20` = A; ba tín hiệu còn lại = C.
3. **Điểm Elite và danh mục**: gọi **đúng hàm `buildDecision` của E3-v2** (trọng số IC hậu nghiệm n₀ = 60, tiên nghiệm 0,02/0,01,
   chuẩn hoá theo hạng, đủ điều kiện gồm GTGD TB20 ≥ 10 tỷ, giá ≥ 5.000đ, σ20 ≥ 0,5%, ≥ 60 phiên giá; tối đa 3 mã/ngành ICB cấp 2;
   tỷ trọng ∝ 1/max(σ20, 1%) trần 20%).
4. **Chấm**: đúng hàm `evaluateEntry` của E3 — vào đóng cửa D+1, ra đóng cửa D+1+h (h = 5, 10), chi phí 0,40%/vòng, so với rổ đều
   vũ trụ đủ điều kiện và VN-Index; IC hạng của Z.

Phiên đầu tiên được chạy là phiên đầu có đặc trưng dòng tiền và ≥ 60 phiên giá trước đó.

## Tiêu chí (giống E3-prereg)

1. IC hạng trung bình của Z ở h = 5 > 0, t Newey–West (độ trễ 5) ≥ 2.
2. Lợi suất vượt rổ đều sau chi phí ở h = 10: trung bình > 0 và cận dưới KTC 95% bootstrap khối (khối 10 phiên) > 0.

Báo cáo thêm (mô tả, không là tiêu chí): mẫu không chồng lấn (mỗi 10 phiên một lần), tỷ lệ thắng, lợi suất vượt quy năm, vòng quay
danh mục, số phiên mỗi tín hiệu ở từng bậc.

## Diễn giải đã cam kết trước

- Đạt cả hai tiêu chí: phiên bản thu gọn có bằng chứng hồi cứu; Điểm Elite đầy đủ vẫn giữ nhãn THĂM DÒ cho tới khi sổ tiến E3 đạt.
- Không đạt: công khai, Điểm Elite giữ nhãn THĂM DÒ; không điều chỉnh tham số để "cứu" kết quả (mọi thay đổi = phiên bản mới, kiểm
  định trên dữ liệu sau ngày chạy).

## Giới hạn đã biết

- Vũ trụ là danh sách mã hiện có dữ liệu dòng tiền (thiên lệch sống sót nhẹ); phân ngành ICB dùng bảng hiện tại.
- Khoảng một năm dữ liệu, ít chế độ thị trường; các tín hiệu dòng tiền tương quan với nhau.
- Bậc khởi điểm A của Stealth 5/20 đến từ sổ cái nghiên cứu có trùng một phần thời gian với cửa sổ này (không hoàn toàn ngoài mẫu
  về mặt lựa chọn tín hiệu).

## Sửa đổi E7-v2 (2026-10-18, trước khi chạy lần nào trên dữ liệu thật)

E3 được nâng lên E3-v3 (xem E3-prereg.md). Kiểm định hồi cứu gọi **đúng hàm `buildDecision` hiện hành (E3-v3)**, truyền danh mục
của phiên walk-forward liền trước làm vùng đệm giữ mã. Mọi điều khác của E7 giữ nguyên.
