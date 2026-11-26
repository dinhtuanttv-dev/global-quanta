# PA-SMC-r1 — CHoCH / BOS × Price Action × Khối lượng: **KHÔNG ĐẠT**

Chạy 26/11/2026, đúng một lần, theo `PA-SMC-r1-PREREG.md` (9b49149e). Cấu trúc = mtf3 3.0.0-s6 (bản chạy trên biểu đồ),
Price Action = pa-book-2.0.0. Cùng dữ liệu, vũ trụ, phí, rổ so sánh với PA-VOL-r1. Số liệu: `PA-SMC-r1-report.json`; kịch bản `scripts/run-smc.mjs`.

## Chỉ tiêu chính — K2 "siêu chỉ báo" (CHoCH↑/BOS↑ trong 20 phiên + Dow ngày tăng + PA kích hoạt + khối lượng xác nhận)

| Vượt trội 10 phiên sau phí | Trong mẫu 2014–2020 | Ngoài mẫu 2021–10/2026 | Nửa đầu | Nửa sau |
|---|---|---|---|---|
| **K2** (n ngoài mẫu 1.549) | −0,12% (t −0,4) | **−0,82% (t −3,1)** | −0,76% | −0,89% |
| K1 cấu trúc + PA, chưa cần khối lượng (5.344) | −0,15% | −0,79% (t −4,8) | | |
| K3 = K2 + Dow tuần tăng (828) | −0,34% | −0,77% (t −2,2) | | |
| PA + khối lượng KHÔNG có cấu trúc (3.924) | −1,00% | −1,16% (t −7,1) | | |
| Mua ngay sau BOS↑ (3.178) | −0,25% | −0,85% (t −4,0) | | |
| Mua ngay sau CHoCH↑ (397) | −0,79% | −0,14% (t −0,3) | | |

- **H2**: KHÔNG ĐẠT (âm, có ý nghĩa ngoài mẫu).
- **H3 giả dược** (cùng mã, ngày ngẫu nhiên cùng quý): trung bình +0,79%, phân vị 95 +1,09% → K2 thấp hơn hẳn: KHÔNG ĐẠT.
- **H1 cấu trúc cộng thêm giá trị**: K2 tốt hơn phần PA + khối lượng không có cấu trúc **+0,34 điểm %**, nhưng p = 0,13 → chưa đủ bằng chứng.
- Giao dịch theo sách (cắt lỗ dưới mẫu hình, chốt tại kháng cự, ≤ 20 phiên): K2 −0,055R/lệnh, thắng 46,6%; lọc lời : lỗ ≥ 1,5 còn kém hơn.
- Theo mẫu hình trong K2: chỉ đảo chiều 2 thanh dương (+0,16%, n 45, t 0,15 — không có ý nghĩa).

## Đọc kết quả

1. Thêm CHoCH/BOS làm kết quả **bớt tệ** (−1,16% → −0,82%), nhưng vẫn kém cả rổ lẫn giả dược. Không có tổ hợp nào cho lợi thế.
2. Giả dược dương (+0,79%): cổ phiếu đủ thanh khoản vào ngày ngẫu nhiên đã hơn rổ (rổ gồm nhiều mã nhỏ). Mọi biến thể "mua sau phá vỡ"
   (PA kích hoạt, BOS↑, khối lượng tăng vọt) đều thua chính các mã đó vào ngày ngẫu nhiên → trên cổ phiếu VN khung ngày, **mua sau tín hiệu
   phá vỡ là mua đắt**; đảo ngược ngắn hạn chi phối.
3. CHoCH↑ đơn lẻ gần bằng 0 ngoài mẫu — không lợi thế, nhưng cũng không hại như BOS↑.

## Phát hiện về engine Cấu trúc MTF (không đổi kết quả chiều mua)

- **Bất đối xứng CHoCH**: nhánh giảm phát CHoCH↑ khi vượt đỉnh hồi mà đã có đáy cao hơn; nhánh tăng khi thủng đáy bảo vệ mà đã có đỉnh thấp hơn
  lại ghi "gãy" (mô hình 3 tiêu chí), rồi chuyển "giảm" ở tiêu chí ③ mà không phát sự kiện → CHoCH↓ gần như không bao giờ xuất hiện
  (HPG, MSH, NAF: 0 lần trong 7–13 năm). Test `structure.test.ts` ghi chủ đích mô hình 3 tiêu chí cho nhánh tăng → cần chủ dự án chọn
  một trong hai mô hình cho CẢ hai chiều; đổi sẽ làm đổi vân tay biểu đồ (SC0) và bản đóng gói Gateway.
