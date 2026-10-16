# W3 — Kết quả cổng xác nhận (theo WORLD-W3-prereg.md, commit 491dec4)

Chạy 2026-10-16 trên Gateway (`GET /api/world/confirmatory`, commit 8ef23ee). Dữ liệu tháng thật 2020-10 → 2026-08.
Số liệu đầy đủ ở `WORLD-W3-result.json`.

**Kết quả: 0/12 cặp đạt bậc xác nhận A** → không ngành nào nhận trọng số trong Lọc ngành.

| # | Cặp | Chiều kỳ vọng | β (t HAC) | p một phía | q (BY/12) | Ổn định | Ngoài mẫu |
|---|---|---|---|---|---|---|---|
| P1 | OIL → Dầu khí | + | −0,255 (−3,09) | 0,998 | 1,00 | có | không đủ điểm |
| P2 | STEEL → Thép | + | −0,342 (−0,93) | 0,821 | 1,00 | không | không đủ điểm |
| P3 | FED → BĐS | − | −11,3 (−0,74) | 0,230 | 1,00 | không | không đủ điểm |
| P4 | FED → Ngân hàng | − | −2,17 (−0,29) | 0,387 | 1,00 | không | không đủ điểm |
| P5 | DXY → Chứng khoán | − | −1,19 (−1,89) | 0,032 | 0,594 | không | không đủ điểm |
| P6 | VIX → Chứng khoán | − | −0,049 (−0,78) | 0,219 | 1,00 | không | không đủ điểm |
| P7 | SEMI → Công nghệ | + | −0,059 (−0,54) | 0,706 | 1,00 | không | không đủ điểm |
| P8 | CNY → Thép | − | −5,22 (−2,54) | 0,007 | 0,261 | có | không đủ điểm |
| P9 | TARIFF → Dệt may | − | +0,002 (0,08) | 0,532 | 1,00 | không | không đủ điểm |
| P10 | TARIFF → Thuỷ sản | − | +0,004 (0,17) | 0,566 | 1,00 | không | không đủ điểm |
| P11 | PMI_US → Dệt may | + | −0,067 (−0,36) | 0,639 | 1,00 | không | không đủ điểm |
| P12 | PMI_US → Cảng | + | −0,130 (−1,34) | 0,907 | 1,00 | có | không đủ điểm |

## Đọc kết quả (trung thực)

- Ràng buộc chính là **độ dài mẫu**. Lịch sử giá danh nghĩa SSI chỉ có từ 2020, nên ma trận chỉ có ~68 tháng. Phép thử ngoài mẫu
  (MacroScore, huấn luyện tối thiểu 60 tháng, bước 3) vì vậy không có đủ 30 điểm, và **không cặp nào có thể đạt ngoài mẫu**. Điều này
  đúng với mọi cặp, kể cả cặp có q thấp.
- Hai cặp gần nhất là CNY → Thép (p 0,007, ổn định, đúng chiều) và DXY → Chứng khoán (p 0,03). Cả hai không vượt BY trên 12 cặp.
- OIL → Dầu khí có ý nghĩa nhưng **ngược chiều kỳ vọng** với trễ 1 tháng. Đây có thể là phản ứng đã diễn ra trong cùng tháng rồi đảo
  chiều. Giả thuyết này không được kiểm định ở đây, và không được dùng để sửa tập cặp.
- Theo dõi tiến: mỗi tháng đóng mới tăng mẫu thêm một tháng. Cổng ngoài mẫu sớm nhất có thể đủ điểm khi chuỗi ngành dài hơn
  (cần thêm nguồn lịch sử ngành trước 2020, hoặc chờ thêm thời gian).
