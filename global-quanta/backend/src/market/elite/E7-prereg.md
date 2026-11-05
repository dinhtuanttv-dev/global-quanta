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

## Sửa đổi E7-v3 (2026-11-06) — hiệu chỉnh quá khớp: Deflated Sharpe, PBO, khoảng đệm thời gian

Ghi **trước khi** chạy E7-v3. Lần chạy E7-v2 thật đầu tiên (05/11/2026, 210 phiên 30/12/2025–05/11/2026) đã công khai: IC h5 đạt,
lợi suất vượt h10 KHÔNG ĐẠT. E7-v3 bổ sung câu hỏi: kết quả có sống sót sau hiệu chỉnh cho số cấu hình đã thử (quá khớp) không.

**Giữ nguyên**: 5 tín hiệu dòng tiền, quy trình walk-forward, bậc theo luật E2, hàm `buildDecision`, tiêu chí 1–2 của E7.

**Thêm**:

1. **Khoảng đệm (embargo) 5 phiên**: IC(d, h) chỉ được dùng ở phiên D khi d + 1 + h + 5 ≤ D (thay cho d + 1 + h ≤ D), để kết quả đo
   gần nhất không chồng lên kỳ nắm giữ mới (López de Prado 2018, §7.4).
2. **Lợi nhuận theo ngày**: danh mục dựng tại D được giữ từ đóng cửa D+1 tới đóng cửa D+2, tái cân bằng mỗi ngày theo danh mục mới.
   Phí theo vòng quay: mua 0,15%, bán 0,15% + thuế 0,1%. Mốc: rổ đều tỷ trọng vũ trụ đủ điều kiện, không phí. Chuỗi lợi suất vượt ngày
   = danh mục − mốc.
3. **Lưới 12 cấu hình cố định** (cùng tín hiệu, cùng walk-forward): số mã {5, 10, 20} × vùng đệm {không, gấp đôi số mã} × tỷ trọng
   {ERC Ledoit–Wolf, nghịch biến động}. **Cấu hình chính** = 10 mã, vùng đệm 20, ERC (đúng lõi E3-v3).
4. **Deflated Sharpe Ratio** (Bailey & López de Prado 2014) cho cấu hình chính trên chuỗi lợi suất vượt ngày:
   `DSR = Φ((SR̂ − SR₀)·√(T−1) / √(1 − γ₃·SR̂ + (γ₄ − 1)/4·SR̂²))`, SR̂ theo ngày (không quy năm), γ₃ độ lệch, γ₄ độ nhọn (không trừ 3);
   `SR₀ = √V·[(1 − γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e))]`, γ = 0,5772 (hằng Euler–Mascheroni), N = 12 cấu hình, V = phương sai SR̂ của
   12 cấu hình. Báo cáo thêm độ nhạy N = 24 (tính cả các phiên bản E3 và bộ lọc đã thử).
5. **Xác suất quá khớp PBO** bằng CSCV (Bailey, Borwein, López de Prado & Zhu 2017): chia chuỗi ngày thành S = 10 khối liên tiếp bằng
   nhau, xét mọi C(10, 5) = 252 cách chọn 5 khối làm trong mẫu; chọn cấu hình có SR trong mẫu cao nhất, tính hạng tương đối ω của nó
   ngoài mẫu, logit λ = ln(ω / (1 − ω)); PBO = tỷ lệ λ ≤ 0.

**Tiêu chí E7-v3** (đạt khi đủ cả bốn):

1. IC hạng của Z ở h = 5 > 0, t Newey–West ≥ 2 (như E7).
2. Lợi suất vượt rổ đều sau phí ở h = 10: trung bình > 0, cận dưới KTC 95% bootstrap khối > 0 (như E7).
3. **DSR ≥ 0,95** cho cấu hình chính (N = 12).
4. **PBO < 0,5**.

**Diễn giải đã cam kết trước**: không đạt thì Elite 10 giữ nhãn THĂM DÒ, không chỉnh lưới hay tham số để "cứu" kết quả. Đạt thì đó là
bằng chứng hồi cứu cho phần mô hình (5 tín hiệu dòng tiền), **không** thay cho sổ tiến E3; phiên hồi cứu không bao giờ cộng vào sổ tiến.

**Giới hạn**: chỉ khoảng 200 phiên (lịch sử dòng tiền từ 19/11/2025); một chế độ thị trường chủ đạo; 12 cấu hình tương quan cao với
nhau nên PBO có thể thấp giả tạo. Quy tắc RRG của E3-v4 không có lịch sử nên không có trong E7.
