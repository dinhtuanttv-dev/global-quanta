# Siêu Quét v2: kiểm định đặt trước (SQ-v2-r1)

**Ngày đăng ký:** 22/10/2026.

**Phạm vi:** bảng Siêu Quét AI chạy engine `SQ-v2`. Đây là các sửa lỗi Q2, Q3 và Q5 trong đợt rà soát tab Siêu Quét, đã được anh duyệt ngày 22/10/2026.

**Quy tắc:** tài liệu này và code (`scanEngine.js`, `faMetrics.js`, `formulasV2.js`, `scannerValidate.js`) được commit **trước** khi chạy. Chỉ chạy một lần và ghi kết quả vào mục "Kết quả" bên dưới. Không chỉnh ngưỡng hay trọng số sau khi đã xem kết quả.

## 1. Câu hỏi

Smart Score v2 và từng thành phần có xếp hạng được lợi suất tương lai của cổ phiếu không, và kết quả có giữ được ở giai đoạn ngoài mẫu không? Các thành phần được kiểm định gồm FA, TA, RS, hệ số đồng thuận và động lượng điều chỉnh rủi ro.

## 2. Dữ liệu

- **Giá:** nến ngày VN100, đã điều chỉnh cộng dồn theo sự kiện quyền (`scripts/structure-fetch.mjs`, cùng cách tính của `/ta-series`). Giai đoạn 01/10/2021 → 21/10/2026, kèm VN-Index.
- **BCTC:** VCI theo quý, tải bằng chính các hàm production (`scripts/scanner-fa-fetch.mjs`).
  - Dữ liệu đúng thời điểm: một quý chỉ được dùng từ ngày kết thúc quý **+ 45 ngày**, tức hạn nộp BCTC hợp nhất.
- **Phân ngành:** TradingView + `classify`, cùng nguồn với production. Đây là ảnh chụp hiện tại, không phải dữ liệu đúng thời điểm, nhưng ngành của một mã hầu như không đổi.
- **Không dùng sự kiện:** Project A không có lịch sử sự kiện, nên điểm sự kiện để trống (`eventsAvailable=false`). Cách xử lý này giống production khi không có nguồn sự kiện.
- **Thiên lệch sống sót:** danh sách là thành phần VN100 **hiện tại**, không gồm các mã đã bị loại hoặc huỷ niêm yết. Kết quả vì thế có thể lạc quan hơn thực tế.

## 3. Thiết kế

- **Ngày tái cân bằng:** cứ mỗi 5 phiên, bắt đầu từ phiên thứ 200.
- **Tại mỗi ngày t:** gọi `runScan`, chính là engine production. Đầu vào gồm 260 phiên tính đến t, BCTC đúng thời điểm, và 250 phiên VN-Index tính đến t.
- **Lợi suất tương lai:** close(t+h) / close(t) − 1, trên giá điều chỉnh, với h ∈ {5, 10, 20} phiên.
- **IC theo ngày:** tương quan hạng Spearman giữa điểm và lợi suất tương lai. Chỉ tính khi có ít nhất 30 mã có điểm. Mã thiếu điểm (FA = null) bị loại khỏi ngày đó.
- **Chia mẫu:**
  - Trong mẫu (IS): từ đầu → 31/12/2024.
  - Ngoài mẫu (OOS): 01/01/2025 → cuối.
- **Khoảng tin cậy:** CI 95% của IC trung bình, tính bằng bootstrap khối theo ngày. Mỗi khối dài ⌈h/5⌉ ngày để xử lý việc lợi suất chồng lấn. Chạy 2000 lần, seed 11.
- **Thông tin phụ, không dùng để kết luận:** chênh lệch lợi suất giữa ngũ phân vị trên và dưới theo Smart Score; kết quả ở các kỳ hạn 5 và 10 phiên.

## 4. Quy tắc kết luận

Mỗi điểm được kết luận ở kỳ hạn chính h = 20 phiên:

- **ĐẠT:** IC trung bình OOS > 0 **và** cận dưới CI 95% OOS > 0 **và** IC trung bình IS > 0.
- **THIẾU MẪU:** OOS có ít hơn 10 ngày.
- **KHÔNG ĐẠT:** mọi trường hợp còn lại.

Cách thể hiện trên giao diện:

- **Smart Score ĐẠT:** nhãn "Đã kiểm định", kèm IC ngoài mẫu.
- **Smart Score không đạt:** nhãn "Chưa đạt kiểm định — chỉ là xếp hạng mô tả", kèm IC.

Bảng vẫn hiện trong cả hai trường hợp, vì người dùng yêu cầu không ẩn. Trường hợp không đạt **không** được diễn giải là có lợi thế dự báo.

## 5. Những gì đã đổi so với bản Project A (không kiểm định lại bản cũ)

| Mục | Bản cũ | v2 |
|---|---|---|
| Tăng trưởng doanh thu | Quý mới nhất so với quarters[3], tức cách 3 quý | 4 quý gần nhất (TTM) so với TTM cùng kỳ năm trước; thiếu dữ liệu thì so quý gần nhất với cùng quý năm trước; khớp quý theo (năm, quý) |
| ROE, biên lợi nhuận | Tính trên 1 quý | TTM; ROE chia cho VCSH bình quân |
| Dữ liệu thiếu | Gán 0, rồi vẫn xếp hạng | null; bỏ thành phần đó và chia lại trọng số |
| Ngân hàng | Doanh thu và lợi nhuận gộp = 0; F-Score 2/6 nên bị xếp "loại" | Doanh thu = Tổng thu nhập hoạt động (isb38). Bảo hiểm dùng isi64. F-Score "không áp dụng" cho ngân hàng, chứng khoán, bảo hiểm |
| F-Score | Thiếu dữ liệu tính là 0 điểm | Đánh giá được dưới 4/6 tiêu chí thì để null |
| Điểm FA | Xếp phân vị chung toàn universe | Xếp phân vị trong cùng nhóm ngành (cần ít nhất 8 mã có số liệu, nếu không thì dùng toàn universe) |
| Thanh khoản | Khối lượng | Giá trị khớp bình quân 20 phiên |
| Giá | SSI ClosePriceAdjusted, chỉ điều chỉnh theo đợt quyền gần nhất | Điều chỉnh cộng dồn theo sự kiện quyền (Project A, dự phòng VNDirect) |
| Điểm sự kiện | 50 cho mọi mã khi không có nguồn | null, bỏ khỏi Smart Score |
| R/R | Giá so với MA50 ± 3%, nên luôn ≈ 1 | Lấy hỗ trợ và kháng cự gần nhất của engine cấu trúc (khung ngày); thiếu thì để trống |

## Kết quả

_(chưa chạy)_
