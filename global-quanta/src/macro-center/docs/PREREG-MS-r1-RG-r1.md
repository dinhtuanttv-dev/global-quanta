# Đăng ký trước MS-r1 và RG-r1 (19/11/2026)

> Trạng thái: **ĐÃ ĐĂNG KÝ, CHƯA CHẠY.** Tệp này được commit **trước** khi chạy, và commit đó là mốc thời gian của bản đăng ký.
> Mỗi kiểm định chạy **đúng một lần**, sau khi người dùng cho phép. Kết quả được công bố kể cả khi KHÔNG ĐẠT.
> Không sửa tiêu chí sau khi đã thấy dữ liệu đầu ra.

## Dữ liệu chung

- **Nguồn.** Kho vĩ mô của Gateway sau V0–V1 (19/11/2026):
  - VN-Index tháng đã sửa lỗi ×100 năm 2019;
  - tỷ giá đọc theo múi giờ của sàn;
  - không còn điểm nào bị cách ly.
- **Mục tiêu.** Lợi suất log tháng **kế tiếp** của VN-Index, tính từ giá đóng cửa phiên cuối tháng.
- **Biến.** Chỉ dùng các biến có số liệu thật và còn cập nhật tại thời điểm chạy: CPI, EX, DXY, FED, OIL. Không thêm hay bớt biến sau khi xem kết quả.
- **Thời điểm biết số liệu.** Mỗi quan sát chỉ được dùng từ ngày `asOf` của nó (CPI từ ngày 6 tháng sau; số tháng của các nguồn khác từ ngày 1 tháng sau). Không nội suy.
- **Ngoài mẫu.** Huấn luyện theo cửa sổ mở rộng, tối thiểu 60 tháng. Giai đoạn đánh giá là mọi tháng từ 2021-11 trở đi mà có đủ dữ liệu, dự kiến khoảng 59 tháng tới 2026-09.
- **Giới hạn đã biết, ghi trước.**
  - Mẫu ngắn (khoảng 59 tháng), nên độ nhạy thấp.
  - Số liệu dùng là bản công bố **mới nhất**, không phải bản tại thời điểm quá khứ: kho vintage chỉ bắt đầu từ 19/11/2026. Với CPI và lãi suất Fed, mức sửa thường nhỏ, nhưng đây vẫn là một nguồn nhìn trước nhẹ.

## MS-r1 — MacroScore có dự báo được lợi suất VN-Index tháng tới?

**Giả thuyết H1.** Điểm MacroScore ngoài mẫu tại cuối tháng t (độ trễ 1) tương quan **dương** với lợi suất log VN-Index tháng t+1.

**Tiêu chí ĐẠT.** Phải thoả **tất cả**:

1. IC Spearman ngoài mẫu ≥ 0,10.
2. p một phía ≤ 0,05, theo hồi quy lợi suất trên điểm với sai số chuẩn Newey–West (độ trễ 3).
3. Tỷ lệ đúng hướng ≥ 55%.
4. IC dương ở **cả hai nửa** của giai đoạn đánh giá (chia đôi theo số tháng).
5. Kiểm định giả (placebo): xáo trộn thứ tự thời gian của các biến 1.000 lần. IC thật phải lớn hơn phân vị 95% của IC giả.

**Hệ quả.**
- ĐẠT: MacroScore được gắn nhãn **THĂM DÒ, có bằng chứng ngoài mẫu**. Nó vẫn **không** vào bộ máy quyết định Elite; muốn đưa vào cần một kiểm định đăng ký riêng.
- KHÔNG ĐẠT: giữ nguyên nhãn **CHỈ ĐỂ THAM KHẢO**. Tham chiếu hiện tại (trước kiểm định chính thức, không dùng để đánh giá): IC −0,15, p 0,96.

## RG-r1 — "Chế độ lạm phát cao" có đi kèm lợi suất VN-Index thấp hơn?

**Giả thuyết H1.** Ở các tháng có xác suất lọc của trạng thái "cao" ≥ 0,5, lợi suất log VN-Index **3 tháng tới** thấp hơn so với các tháng còn lại.

**Mô hình.**
- HMM Gauss trên CPI, K = 3, giữ nguyên như engine hiện tại.
- **Tham số ước lượng lại mỗi tháng chỉ với dữ liệu tới tháng đó** (cửa sổ mở rộng, tối thiểu 60 tháng). Đây là điểm khác bản hiển thị, vốn ước lượng trên toàn mẫu.
- Xác suất lọc tiến (forward), không làm mượt (smoothing).

**Tiêu chí ĐẠT.** Phải thoả **tất cả**:

1. Có ít nhất 15 tháng ở trạng thái "cao" trong giai đoạn đánh giá.
2. Chênh lệch trung bình (cao − còn lại) ≤ −2 điểm % mỗi quý.
3. p một phía ≤ 0,05, theo bootstrap khối (khối 3 tháng, 5.000 lần) để tính đến các cửa sổ 3 tháng chồng lấp nhau.
4. Chênh lệch âm ở **cả hai nửa** giai đoạn.

**Hệ quả.**
- ĐẠT: khối "Chế độ" ghi **"bối cảnh có bằng chứng ngoài mẫu"**, kèm mức chênh lệch đo được. Khối này vẫn không tạo lệnh mua bán.
- KHÔNG ĐẠT: giữ nhãn **MÔ TẢ**.
- Thiếu mẫu (điều kiện 1 không đạt): ghi **CHƯA ĐỦ MẪU**, không kết luận.

## Thực thi

- Script nằm ở `backend/research/macro-r1/`, viết **sau** khi người dùng cho phép chạy, đúng theo tệp này.
- Hạt giống ngẫu nhiên cố định là 20261119.
- Kết quả ghi vào sổ bằng chứng: thêm mục MS-r1 và RG-r1 vào `/api/elite/evidence-registry`.
