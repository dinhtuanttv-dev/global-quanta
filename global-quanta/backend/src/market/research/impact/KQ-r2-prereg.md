# KQ-r2 — Nowcast LNST cả năm và SUE, vũ trụ đúng thời điểm (đăng ký trước 19/11/2026, CHƯA CHẠY)

Thuộc họ `IMPACT-FAMILY.md`. Đây là xác nhận lại KQ-r1 (`fundamentals/KQ-prereg.md`, chạy 06/11/2026).
- KQ-r1 H3 (nowcast) ĐẠT: IC ngoài mẫu 0,047, p 0,0005.
- KQ-r1 H1 (SUE) p 0,075.
- Nhưng KQ-r1 dùng 284 mã **hiện tại**, nên có thiên lệch sống sót.

## Giả thuyết
- **H1 (chính):** nowcast tăng trưởng LNST cả năm (`kqkdEngine.js`, đúng hàm đang hiển thị) dự báo **dương** lợi suất vượt 60 phiên.
- **H2 (phụ, không vào Holm):** SUE LN cốt lõi, cùng thiết kế.

## Dữ liệu
- BCTC quý VNDirect (kho K0).
- Vũ trụ = `universeAt(ngày vào)` từ danh sách VNDirect **kể cả mã đã huỷ niêm yết**. BCTC của mã đã huỷ lấy từ cùng nguồn; thiếu thì bỏ và đếm.
- **Ngày vào:** max(kết thúc quý + 45 ngày, ngày công bố thật S8 nếu có, `createdDate` hợp lệ trễ 0–120 ngày). Giá vào = đóng cửa phiên đầu tiên **sau** ngày vào.
- Lứa = quý tài chính. Cần ≥ 30 mã.

## Mẫu
- Trong mẫu: lứa đến 2019Q4. Chỉ dùng để mô tả, không quyết định.
- Ngoài mẫu: 2020Q1 → quý gần nhất có đủ 60 phiên sau ngày vào.

## Nhãn
Lợi suất vượt 60 phiên so với bình quân đều ngành ICB cấp 2 của các mã cùng vũ trụ.

## Thống kê chính
IC Spearman theo lứa. p chính = p một phía của trung bình IC ngoài mẫu (t Newey–West, độ trễ 1).

## Placebo
600 lần xáo đặc trưng giữa các mã **trong cùng lứa và cùng ngành ICB cấp 1**.

## ĐẠT (cả bốn)
1. Trung bình IC ngoài mẫu ≥ 0,03, p ≤ 0,05.
2. p placebo ≤ 0,05.
3. Hai nửa ngoài mẫu cùng dấu dương.
4. Chênh Q5−Q1 sau phí (0,45%) > 0.

## So sánh bắt buộc
Báo cáo song song IC của KQ-r1 (vũ trụ hiện tại) và KQ-r2 (vũ trụ đúng thời điểm) trên **cùng các lứa**, để đo mức thiên lệch sống sót.
