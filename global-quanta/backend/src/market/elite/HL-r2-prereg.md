# HL-r2 — đăng ký trước: kiểm định ngoài mẫu quy tắc Elite HL và ba phương án thách đấu

**Ngày đăng ký:** 13/11/2026 · **Trạng thái:** viết và commit TRƯỚC khi chạy bất kỳ mô phỏng nào trên dữ liệu 2014–2019.
**Người quyết định:** chủ dự án (đã duyệt lộ trình N0–N6 ngày 12/11/2026).

## 1. Câu hỏi

1. Quy tắc chính thức **E4-HL v1 (G2r)** có lợi thế so với thị trường trên giai đoạn nó chưa từng được xem không?
2. Có phương án thách đấu nào tốt hơn G2r một cách đáng tin không?

## 2. Dữ liệu

- **Bảng tín hiệu:** dựng lại bằng `backend/scripts/hl-panel-replay.mjs` — chạy đúng engine Gateway (SEPA, Base Breakout, Hợp lưu v2, Pring, cấu trúc xu hướng MTF v3, LS-v1, RRG ngành qua `buildSectorRotation`) trên thanh giá cắt tại từng phiên.
- **Giá:** VNDirect, điều chỉnh đầy đủ theo sự kiện quyền, gồm mã đã huỷ niêm yết (1.974 mã, từ 2013).
- **Vũ trụ:** 300 mã có GTGD bình quân 20 phiên cao nhất tại từng phiên.
- **Giai đoạn QUYẾT ĐỊNH:** 03/03/2014 → 31/12/2019. Chưa từng dùng cho HL (K0 chỉ chạy 2020–2026).
- **Giai đoạn BÁO CÁO:** 02/01/2020 → 12/11/2026. Đã bị xem ở K0 khi chọn tham số G2r — chỉ báo cáo, không dùng để quyết định.

**Giới hạn đã biết, không sửa được trong đợt này:**

- Tầng 3 không có lịch sử (Stealth 20/5, ý đồ dòng tiền, khối ngoại, điểm cơ bản, α ngành thế giới, Alpha M1, chất xúc tác, cổ tức) → tầng 3 = 0 cho mọi mã. Hệ quả: không có lớp "Hợp lưu mạnh"; thứ tự chỉ còn tầng 1 → tầng 2 → phân vị LS-v1.
- SEPA chạy không có báo cáo tài chính (phần kỹ thuật của trạng thái SEPA không đổi; danh sách phụ thuộc BCTC không dùng trong HL).
- So khớp với bảng production phiên 11/11/2026: 93,7% ô (TA 87–99%, RRG 91%, tương quan hạng LS-v1 0,974) — đo trước khi production sửa nguồn giá.
- VN-Index là chỉ số giá, không gồm cổ tức; giá cổ phiếu đã điều chỉnh cổ tức tiền mặt. So với VN-Index vì vậy lệch có lợi cho danh mục khoảng 1,5–2 điểm %/năm. **Mốc so sánh quyết định là bình quân đều của vũ trụ** (cùng cơ sở giá).

## 3. Mô phỏng

- Engine: gọi thẳng `buildHlPortfolio` của production (kể cả chốt dữ liệu), tham số `HL_PF` mặc định.
- Tín hiệu ở đóng cửa phiên D, khớp ở đóng cửa phiên D+1.
- Phí: mua 0,20%, bán 0,25% giá trị giao dịch.
- Mã tăng sát trần ở phiên khớp: không mua được, ô đó giữ tiền mặt tới phiên cân bằng kế tiếp.
- Mã giảm sát sàn ở phiên khớp: không bán được, giữ tới phiên kế tiếp và thử lại.
- Phiên cân bằng: phiên đầu tiên của mỗi tuần ISO không bị chốt dữ liệu.
- Giá trị danh mục tính theo vị thế thật (có trôi tỷ trọng); engine vẫn thấy tỷ trọng lúc vào như production.

## 4. Phương án

| Mã | Phương án | Chạy được? |
|---|---|---|
| B | G2r hiện hành (đối chứng) | Có |
| C2 | Chỉ nhận mã mới khi ngành ở góc Dẫn dắt (không nhận góc Cải thiện) | Có |
| C6 | Không nhận mã mới khi thị trường ở trạng thái yếu (`regimeAt` của LS-v1 = WEAK) | Có |
| C7 | Dùng góc RRG của tuần đã đóng thay cho tuần đang chạy | Có (thêm ngày 13/11 sau khi thấy ngành ngân hàng lật góc trong tuần; ghi rõ là bổ sung) |
| C1 | Cửa loại F-Score trước tầng 1 | Không — chưa có F-Score đúng thời điểm |
| C3 | Tầng 3 theo trọng số bằng chứng | Không — tầng 3 không có lịch sử |
| C4 | Stealth chọn thời điểm vào | Không — Stealth không có lịch sử |
| C5 | ERC lúc vào | Hoãn — cần hiệp phương sai đúng thời điểm; chưa cài |

Không thêm phương án nào khác sau khi thấy kết quả.

## 5. Chỉ số và tiêu chí

Chuỗi đo: lợi suất 20 phiên không chồng lấn của danh mục trừ mốc so sánh, lặp cho 20 pha lấy mẫu; báo cáo trung vị của trung bình và của thống kê t.

**Câu hỏi 1 — G2r có lợi thế không (giai đoạn quyết định):**

- **CÓ LỢI THẾ** khi vượt bình quân đều vũ trụ sau phí > 0 với t trung vị ≥ 2.
- **KÉM THỊ TRƯỜNG** khi vượt < 0 với t trung vị ≤ −2.
- Còn lại: **KHÔNG CÓ LỢI THẾ ĐƯỢC CHỨNG MINH**.

**Câu hỏi 2 — một phương án thách đấu thay G2r khi đạt cả năm điều kiện trên giai đoạn quyết định:**

1. Vượt G2r sau phí > 0, t trung vị ≥ 2 (chuỗi chênh lệch 20 phiên giữa hai danh mục).
2. Giá trị p của điều kiện 1 qua hiệu chỉnh Holm cho ba phương án chạy được vẫn < 0,05.
3. Deflated Sharpe ≥ 0,95 với số phép thử = 4 (B, C2, C6, C7).
4. Sụt giảm lớn nhất không sâu hơn G2r quá 5 điểm %.
5. Chênh lệch theo năm cùng dấu dương ở ít nhất 5 trên 6 năm (2014–2019).

Không phương án nào đạt → G2r giữ nguyên. Kết quả công bố đầy đủ kể cả khi mọi thứ đều không đạt.

## 6. Điều KHÔNG được làm

- Không đổi tham số `HL_PF`, không đổi quy tắc chọn, không thêm phương án sau khi chạy.
- Không dùng giai đoạn báo cáo để quyết định.
- Không chạy lại với lý do "sửa lỗi" mà không ghi lỗi đó vào mục sửa đổi của tệp này trước khi chạy lại.

## 7. Sửa đổi

Mỗi sửa đổi ghi: ngày, nội dung, lý do, đã thấy kết quả HL-r2 hay chưa. Ghi TRƯỚC khi chạy (hoặc chạy lại).

### S1 — 14/11/2026 · mã thiếu điểm LS-v1 của riêng nó không còn bị bán ngay (N0b)

- **Trạng thái:** ĐỀ XUẤT, chờ chủ dự án duyệt (PR #318, commit `bd978b0`). Chỉ có hiệu lực với HL-r2 nếu PR được gộp vào nhánh chạy mô phỏng **trước** khi chạy; nếu không gộp, mục này ghi "không áp dụng".
- **Nội dung:** trong `exitReason`, vị thế có trong bảng và có giá nhưng `lsPct == null` trước đây rơi vào nhánh bán "ls" (bán ngay, lý do ghi "xuống phân vị —"). Nay được coi là mất dữ liệu: đi qua bộ đếm `missSessions` (giữ 1 phiên, thiếu 2 phiên liên tiếp mới ra). Mã có LS-v1 dưới ngưỡng vẫn bán ngay. Mã thiếu LS-v1 vẫn không được mua.
- **Không đổi:** `HL_PF` (kể cả `exitLsPct = 60`, `missSessions = 2`), quy tắc chọn tầng 1 / tầng 2 / tầng 3, phí, danh sách phương án, chỉ số và tiêu chí ở mục 5.
- **Lý do:** lỗi phân loại tìm thấy khi rà soát mã nguồn tab Quyết định (14/11/2026) — "không có số" bị xử lý như "số thấp". Không xuất phát từ kết quả mô phỏng.
- **Đã thấy kết quả HL-r2 chưa:** người đề xuất chưa thấy kết quả nào của HL-r2 trên giai đoạn quyết định. *(Chủ dự án xác nhận dòng này khi duyệt.)*
- **Ảnh hưởng tới mô phỏng:** harness gọi thẳng `buildHlPortfolio` nên B, C2, C6, C7 cùng đổi theo. Trong bảng dựng lại, LS-v1 cần ≥ 4/5 thành phần nên mã thiếu lịch sử giá có thể rơi vào trường hợp này; số lần xảy ra chưa đếm — nên báo cáo số lần khi chạy.
- **Nếu HL-r2 đã chạy trước khi S1 được gộp:** giữ kết quả đã chạy làm kết quả chính; chạy lại với S1 chỉ được báo cáo như phân tích độ nhạy, không dùng để quyết định.
