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

Chạy một lần ngày 22/10/2026, sau commit đóng băng c3d3f22. Lệnh: `node scripts/scanner-validate.mjs <mtf-data> out.json --write-constant`. Hằng số kết quả nằm ở `scannerValidation.js`.

**Mẫu:**
- 208 ngày tái cân bằng, từ 21/07/2022 đến 17/09/2026: 123 ngày trong mẫu (IS), 85 ngày ngoài mẫu (OOS).
- 100 mã; bình quân 96 mã có điểm mỗi ngày, cũng 96 mã có điểm FA.
- BCTC VCI tải được đủ 100/100 mã.

**IC xếp hạng ở kỳ hạn chính 20 phiên** (trung bình, kèm CI 95% bootstrap khối):

| Điểm | IS | OOS | Kết luận |
|---|---|---|---|
| **Smart Score** | +0,004 [−0,034; +0,037] | **−0,016 [−0,081; +0,046]** | **KHÔNG ĐẠT** |
| FA | +0,008 [−0,027; +0,040] | +0,001 [−0,037; +0,037] | KHÔNG ĐẠT |
| TA | −0,013 [−0,060; +0,032] | −0,026 [−0,101; +0,043] | KHÔNG ĐẠT |
| RS | +0,006 [−0,046; +0,055] | −0,042 [−0,122; +0,031] | KHÔNG ĐẠT |
| Hệ số đồng thuận | +0,009 [−0,033; +0,053] | +0,000 [−0,061; +0,053] | KHÔNG ĐẠT |
| Động lượng điều chỉnh rủi ro | +0,005 [−0,047; +0,056] | −0,039 [−0,113; +0,029] | KHÔNG ĐẠT |

**Thông tin phụ:**
- Ở kỳ hạn 5 và 10 phiên, mọi khoảng tin cậy đều chứa 0.
- Chênh lệch lợi suất 20 phiên giữa ngũ phân vị trên và dưới theo Smart Score: IS −0,9%, OOS +0,2%.

**Diễn giải:**
- Không điểm nào xếp hạng được lợi suất tương lai trong VN100 ở bất kỳ kỳ hạn nào.
- Các sửa lỗi Q2, Q3 và Q5 làm **số liệu đúng hơn** (BCTC, giá điều chỉnh, ngân hàng, R/R), nhưng **không** tạo ra lợi thế dự báo.
- Trên giao diện, Smart Score mang nhãn "CHƯA ĐẠT KIỂM ĐỊNH — chỉ là xếp hạng mô tả, không phải tín hiệu dự báo", kèm IC ngoài mẫu. Bảng vẫn hiện công khai.
- Không chỉnh trọng số hay ngưỡng sau khi xem kết quả. Muốn thử lại phải viết prereg mới (r2).
