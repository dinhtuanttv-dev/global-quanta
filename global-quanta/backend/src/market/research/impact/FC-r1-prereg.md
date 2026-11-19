# FC-r1 — Chuỗi biên lợi nhuận: giá đầu vào → SUE quý (đăng ký trước 19/11/2026, CHƯA CHẠY)

Thuộc họ `IMPACT-FAMILY.md`. Mục đích: kiểm **nguyên lý** đứng sau phần trôi chậm của CT-r1 và CT-r2. Nếu giá đầu vào trong quý dự báo được bất ngờ lợi nhuận quý đó, thì phần trôi chậm của giá cổ phiếu có nguồn gốc cơ bản, không chỉ là tương quan.

## Giả thuyết
- **H1 (chính, một p):** thay đổi chi phí đầu vào trong quý dự báo **cùng chiều** với SUE LN cốt lõi của quý đó. Gộp hai nhóm bằng cách đổi dấu theo kỳ vọng, rồi kiểm một hệ số chung:
  - **thép:** z quặng sắt + Baosteel (như CT-r1) **tăng → SUE dương** (giá thép bán ra đi theo, tồn kho được định giá lại);
  - **dệt may:** bông **tăng → SUE âm**.
- **H2 (phụ, không vào Holm):** khi H1 đúng, lợi suất vượt từ cuối quý tới ngày công bố KQKD thật (S8) có cùng dấu với SUE dự báo.

## Dữ liệu
- **Thép:** HPG, HSG, NKG, POM, SMC, TLH. **Dệt may:** TCM, TNG, GIL. Chỉ mã thuộc `universeAt(kết thúc quý)`.
- z quý = trung bình z ngày của biến dẫn dắt trong quý (căn thời gian như CT-r1 và CT-r2).
- SUE theo `kqkdEngine.js`, ngày có sẵn theo quy tắc của KQ-r2.

## Mẫu
Ngoài mẫu: các quý 2020Q1 → quý gần nhất có SUE. Một quan sát = (mã, quý). Suy luận theo cụm quý: bootstrap theo quý, 10.000 lần.

## Thống kê chính
Tương quan hạng Spearman giữa (dấu kỳ vọng × z quý) và SUE. p chính = p một phía theo bootstrap cụm.

## Placebo
600 lần. Xáo z giữa các quý (giữ SUE), để kiểm khả năng mọi quý tăng giá đều trùng SUE dương.

## ĐẠT (cả ba)
1. Spearman ≥ 0,25, p ≤ 0,05.
2. p placebo ≤ 0,05.
3. Cùng dấu ở cả hai nhóm (thép, dệt may) khi tách riêng. Không cần từng nhóm có ý nghĩa thống kê.

## Giá trị kể cả khi chỉ đạt H1
Có thể thêm biến đầu vào vào nowcast KQKD cho hai ngành này, tức cải thiện lớp hiện có, không cần lớp mới. Việc thêm phải qua đăng ký riêng.
