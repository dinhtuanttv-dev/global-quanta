# Họ kiểm định "Tác động lên cổ phiếu" (đăng ký trước 19/11/2026)

> **ĐÃ ĐĂNG KÝ, CHƯA CHẠY.** Commit chứa tệp này là mốc thời gian của bản đăng ký. Mỗi kiểm định chạy **đúng một lần** sau khi người dùng cho phép **từng kiểm định**. Kết quả được công bố vào sổ bằng chứng kể cả khi KHÔNG ĐẠT. Không sửa tiêu chí sau khi đã thấy đầu ra.
> Cơ sở: bộ tài liệu `Ho-so-360-v2/Tac-dong-co-phieu/` 00–10, gồm khám phá trong mẫu 2013–2019 ở tệp 07 và 10. Mẫu ngoài **2020-01 → nay** chưa được nhìn.

## Thành viên (8) và hiệu chỉnh kiểm định bội

| Mã | Giả thuyết | Luồng | Tệp |
|---|---|---|---|
| KQ-r2 | Nowcast LNST cả năm / SUE dự báo lợi suất vượt 60 phiên (vũ trụ đúng thời điểm) | A | KQ-r2-prereg.md |
| EA-r1 | Trôi sau ngày công bố KQKD thật theo SUE | A | EA-r1-prereg.md |
| CT-r1 | Quặng sắt + giá thép châu Á → nhóm thép (phản ánh chậm) | A | CT-r1-prereg.md |
| CT-r2 | Bông → dệt may (chi phí đầu vào, phản ánh chậm) | A | CT-r2-prereg.md |
| FC-r1 | Chuỗi biên: giá đầu vào → SUE quý của thép / dệt may | A | FC-r1-prereg.md |
| X6-F | Chiều tác động engine Chất xúc tác (kiểm định tiến) | B | X6-F-prereg.md |
| ER-r1 | Loại sự kiện Event Radar (kiểm định tiến; một suất, Holm lồng bên trong) | B | ER-r1-prereg.md |
| TO-r1 | Săn cổ tức (đã đăng ký 07/11/2026; giữ nguyên tiêu chí riêng) | B | `events/TO-prereg.md` |

- **Holm–Bonferroni**, α = 0,05 một phía, trên p chính của 8 thành viên.
- Một thành viên chỉ được gọi là **ĐẠT trong chương trình** khi:
  1. đạt tiêu chí riêng của nó;
  2. p chính ≤ ngưỡng Holm tại thứ hạng của nó. Thành viên nào chưa chạy thì được tính với p = 1 cho tới khi có kết quả.
- Thành viên đạt tiêu chí riêng nhưng trượt Holm được ghi **THĂM DÒ**.

## Quy tắc chung (áp cho mọi thành viên)

1. **Vũ trụ:** `research/universeAt.js`. GTGD trung vị 20 phiên ≥ 1 tỷ đồng, ≥ 120 phiên có giá, gồm mã đã huỷ niêm yết **trước** ngày huỷ. Không dùng danh sách hiện tại.
2. **Giá:** điều chỉnh theo sự kiện quyền (VNDirect `adClose`). Chỉ số: VN-Index; trước 08/2017 dùng giá đóng cửa SSI qua Gateway (khớp chỗ nối 24/08/2017).
3. **Thời điểm biết:** đặc trưng chỉ dùng thông tin có trước đóng cửa ngày quyết định. Giá nước ngoài ngày D (Mỹ, châu Âu) gán cho phiên VN kế tiếp. Thượng Hải / Bangkok / Sydney ngày D gán cho phiên VN cùng ngày. Số liệu tháng dùng từ ngày công bố.
4. **Nhãn:** lợi suất log vượt trội từ đóng cửa phiên **sau** ngày tín hiệu (bỏ phiên tín hiệu), so với VN-Index đã khử beta (beta ước lượng trên 250 phiên trước, không nhìn trước).
5. **Suy luận:**
   - t theo **một quan sát mỗi cửa sổ thời gian** (không gộp nhiều mã cùng cửa sổ thành nhiều quan sát), sai số Newey–West nếu cửa sổ chồng lấp;
   - **p placebo** từ ≥ 500 lần chạy với biến dẫn dắt hoặc rổ thay thế **cùng loại**, như mô tả trong từng tệp.
   - ĐẠT cần cả hai.
6. **Chi phí:** mua 0,20%, bán 0,25%. Hiệu ứng trung bình phải lớn hơn 0,45% ở kỳ hạn nắm giữ đã định thì mới gọi là dùng được.
7. **Chạy một lần:** script ghi báo cáo vào `research/impact/<mã>-report.json` và từ chối chạy lại nếu tệp báo cáo đã tồn tại. Nếu dữ liệu lỗi phải chạy lại, xoá báo cáo kèm ghi chú lý do trong commit, và phải công bố cả hai lần chạy.
8. **Cổng thứ hai INC-r1** (không thuộc họ): thành viên nào ĐẠT phải qua INC-r1 trước khi được đề xuất đưa vào quyết định Elite (xem INC-r1-prereg.md).
