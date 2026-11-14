# Kết quả HL-r2 và PZ-r1 — 14/11/2026

Hai thí nghiệm đăng ký trước, chạy trên bảng tín hiệu dựng lại (2.300 phiên, 03/03/2014 → 18/05/2023), giá VNDirect điều chỉnh đầy đủ, vũ trụ 300 mã GTGD cao nhất từng phiên, phí mua 0,20% / bán 0,25%, khớp ở đóng cửa phiên kế tiếp. Số liệu đầy đủ: `HL-r2-results.json`, `PZ-r1-results.json`.

**Kết luận:** G2r giữ nguyên (HL-r2). Cổng chặn mua mã tăng nóng giữ TẮT (PZ-r1 không qua lớp 1). Lớp Vị trí giá tiếp tục ở chế độ chỉ hiển thị; sổ theo dõi tiến HL-L1 đo tiếp ngoài mẫu.

## Sự cố dữ liệu và chạy lại

Tệp VN-Index của bộ dữ liệu có 126 phiên (16/07/2019 → 09/01/2020) bị nhân 100 lần. Lần chạy PZ-r1 đầu lộ ra lỗi (VN-Index 140,8%/năm); lần chạy HL-r2 đầu được dừng trước khi đọc kết quả. Dữ liệu được sửa theo VNDirect, bảng 16/07/2019 → 29/01/2021 được dựng lại, sửa đổi ghi vào `HL-r2-prereg.md` (S2) và `PZ-r1-prereg.md` (S1) trước khi chạy lại. Lần chạy lỗi của PZ-r1 giữ ở `PZ-r1-results.run1-index-bug.json`; kết luận hai lần chạy giống nhau.

## HL-r2 — giai đoạn quyết định 03/03/2014 → 31/12/2019 (1.459 phiên)

| Phương án | Lợi suất/năm | Sharpe | Sụt giảm lớn nhất | Vượt bình quân đều / 20 phiên (t) | So với G2r (t, p) |
|---|---|---|---|---|---|
| B · G2r | 16,1% | 1,01 | −30,3% | +1,13% (2,13) | — |
| C2 · chỉ ngành Dẫn dắt | 7,0% | 0,55 | −28,5% | +0,40% (0,78) | −0,72% (−2,11; 0,035) |
| C6 · không vào khi thị trường yếu | 13,3% | 0,89 | −31,1% | +0,91% (1,70) | −0,22% (−1,03; 0,303) |
| C7 · RRG tuần đã đóng | 13,3% | 0,85 | −33,4% | +0,94% (1,69) | −0,19% (−0,75; 0,456) |

Mốc: VN-Index (giá) 9,4%/năm, sụt giảm −27,1%; bình quân đều vũ trụ 2,5%/năm, sụt giảm −34,5%.

- **Câu 1 — G2r có lợi thế không:** vượt bình quân đều sau phí +1,13% mỗi 20 phiên, t trung vị 2,13 ≥ 2 → **CÓ LỢI THẾ** theo tiêu chí đăng ký.
- **Câu 2 — có phương án thay G2r không:** không. C2 kém có ý nghĩa; C6, C7 kém nhẹ → **G2r giữ nguyên**.
- **Cảnh báo:** giai đoạn báo cáo 02/01/2020 → 18/05/2023 (841 phiên, không dùng để quyết định) cho kết quả ngược lại: G2r 0,8%/năm, sụt giảm −52,7%, kém bình quân đều (−1,07%/20 phiên, t −1,13). Lợi thế của giai đoạn quyết định không lặp lại ngoài mẫu trong đoạn này; C6 lại tốt nhất (15,0%/năm, so G2r t 2,07). Đây là quan sát, không phải căn cứ đổi quy tắc (bản đăng ký cấm dùng giai đoạn báo cáo để quyết định).

## PZ-r1 — cổng vị trí giá

### Lớp 1 · chẩn đoán lệnh mua của G2r (giai đoạn quyết định)

| Nhóm tại phiên tín hiệu | Số lệnh | Lợi suất vượt 20 phiên | Lỗ sâu nhất TB trong 20 phiên | Bị bán trước 20 phiên |
|---|---|---|---|---|
| Tăng nóng (≥ 2/3 của X2–X4) | 81 | −1,34% | −10,7% | 44% |
| Còn lại | 330 | +1,38% | −5,7% | 52% |

t Welch −1,54 > −2 → **KHÔNG ĐẠT** điều kiện đi tiếp. Theo bản đăng ký: **cổng giữ tắt**. Chiều kết quả ủng hộ giả thuyết (mua lúc nóng kém hơn 2,7 điểm, lỗ sâu gần gấp đôi) nhưng chưa đủ chắc. Ở giai đoạn báo cáo chiều này đảo ngược (nóng +0,36%, thường −0,73%).

### Lớp 2 · mô phỏng (chỉ để tham khảo vì lớp 1 không đạt)

| Phương án | Lợi suất/năm | Sharpe | Sụt giảm lớn nhất | Tiền mặt TB | So P0 / 20 phiên (t) | Tiêu chí |
|---|---|---|---|---|---|---|
| P0 · G2r | 16,1% | 1,01 | −30,3% | 23% | — | — |
| P1 · không mua mã nóng (X2–X4) | 16,9% | 1,10 | −24,5% | 25% | +0,04% (0,18) | Đạt cả 4 (nhờ nhánh sụt giảm) |
| P2 · chỉ mua ở Vùng mua (nền = hộp giá) | 15,1% | 1,44 | −20,9% | 52% | −0,14% (−0,34) | Không đạt (lợi suất thấp hơn P0 hơn 1 điểm, tiền mặt > 50%, 3/6 năm) |

Giai đoạn báo cáo: P0 0,8%/năm (−52,7%), P1 2,5%/năm (−51,5%), P2 7,2%/năm (−26,9%).

- P1 bớt 5,8 điểm sụt giảm mà không mất lợi suất, nhưng chênh lệch theo năm dao động mạnh (+11, +13, −11, −14, +4, +1 điểm) nên kết quả mỏng manh.
- P2 giảm sụt giảm rõ nhất ở cả hai giai đoạn (−20,9% và −26,9%) nhưng giữ ~50% tiền mặt và đánh đổi lợi suất ở giai đoạn quyết định.

## Việc tiếp theo

1. Lớp 3 — sổ theo dõi tiến HL-L1 ghi thêm hai nhóm "Hợp lưu trong vùng mua" và "Hợp lưu tăng nóng" (PR #325). Đọc kết luận khi đủ 120 phiên đã chấm (khoảng giữa 2027).
2. Nếu chủ dự án muốn xét lại cổng (ví dụ P1, hoặc P2 cho mục tiêu giảm sụt giảm), cần một bản đăng ký mới (PZ-r2) với tiêu chí phù hợp mục tiêu đó, chạy trên dữ liệu chưa dùng (bảng dựng lại sau 05/2023 hoặc sổ tiến).
3. Bảng dựng lại mới tới 18/05/2023; giai đoạn báo cáo của cả hai thí nghiệm vì vậy dừng ở đó.

## Giới hạn

- Không có lịch sử SEPA / Base Breakout theo phiên: nền trong P2 lấy từ hộp giá HG-v1, khác cấu hình production (ưu tiên SEPA).
- Biên độ sàn cho X4 dùng HOSE (7%) cho mọi mã trong mô phỏng.
- Vài điểm giá lỗi lẻ ở mã rất nhỏ (MEF, TH1, WTC) giữ nguyên.
- Tầng 3 của HL không có lịch sử (= 0), như HL-r2-prereg mục 2.
