# P3 — Kiểm định mô hình giá Pring trên dữ liệu VN — TIÊU CHÍ ĐẶT TRƯỚC (ĐÃ DUYỆT 2026-10-10)
Soạn 2026-10-10, TRƯỚC khi chạy. Chưa xem lợi suất hay số sự kiện. Sau khi duyệt không sửa; nếu phải sửa, báo cáo ghi rõ.

Engine: backend/src/market/strategies/pring (pring/P2, main 0bba438), tham số PRING mặc định, scanPatterns(S, t) point-in-time.
Dữ liệu: scratchpad/s1/series2.json (SSI, điều chỉnh cộng dồn), 10/2023–10/2026, khung D (khung W chỉ mô tả).
Tập mã tại ngày d: có nến ngày d, ≥ 260 nến tới d, GTGD TB20 ≥ 5 tỷ và giá ≥ 5.000đ TẠI d.
Ngày đánh giá: mọi phiên đủ điều kiện tới phiên cuối − 21. Trong mẫu (IS) tới 2026-03-06; ngoài mẫu (OOS) từ 2026-03-07 (cùng mốc SEPA SP3).
Sự kiện: phiên mô hình chuyển sang CONFIRMED (phá vỡ dứt khoát, giữ ≥ 2 thanh), lần đầu cho mỗi mô hình. Tối đa 1 sự kiện / mã / hướng / 20 phiên.
Lợi suất vượt trội: mở cửa T+1 → đóng cửa T+20, trừ trung bình cùng ngày của tập mã (cùng công thức); mô hình tăng trừ thêm phí 0,6%.
KTC 95%: bootstrapCi của Gateway (bootstrap theo cụm ngày). Không gọi SSI, không ghi DB.

Nhóm (gộp họ để đủ mẫu):
- G1 Đảo chiều cổ điển: đỉnh/đáy đôi–ba, vai-đầu-vai (kể cả tiếp diễn), đảo
- G2 Tam giác + hình chữ nhật
- G3 Nêm + mô hình mở rộng
- G4 Cờ / cờ đuôi nheo + đáy/đỉnh tròn + cốc tay cầm

## H1 (chính) — tín hiệu MUA: mô hình TĂNG được xác nhận, theo nhóm G1–G4
ĐẠT khi cả ba điều kiện cùng đúng: OOS n ≥ 30, TB > 0 và cận dưới KTC > 0; ngoài ra TB IS cũng > 0 (cùng dấu, chống trúng ngẫu nhiên khi thử 4 nhóm).
## H2 (chính) — tín hiệu CẢNH BÁO: mô hình GIẢM được xác nhận, gộp mọi nhóm (và từng nhóm, mô tả)
ĐẠT khi cả ba điều kiện cùng đúng: OOS n ≥ 30, TB < 0 và cận trên KTC < 0; ngoài ra TB IS cũng < 0. VN không bán khống, nên tín hiệu này chỉ dùng để tránh hoặc giảm vị thế.
## H3 — điểm số có xếp hạng được không
Chia sự kiện mua thành 3 nhóm theo điểm. ĐẠT khi TB(nhóm điểm cao) > TB(nhóm điểm thấp) ở cả IS lẫn OOS, và cận dưới KTC của nhóm cao > 0 ở OOS.
Nếu không ĐẠT, danh sách P4 chỉ xếp theo trạng thái, điểm chỉ để hiển thị.

## Kiểm chứng khẳng định của Pring (mô tả, IS + OOS, có KTC — không đổi nhãn)
- C1: KL phá vỡ ≥ 1,5× TB25 so với thấp hơn (ch6, ch9)
- C2: thuận xu hướng chính (MA200) so với ngược xu hướng (ch3, ch17)
- C3: tam giác phá vỡ ở ½–⅔ đường tới đỉnh so với ngoài khoảng đó (ch9)
- C4: giữ 2 thanh: so với vào ngay thanh phá vỡ — tỷ lệ phá vỡ giả + lợi suất (ch17)
- C5: chờ pullback rồi vào so với vào khi xác nhận (ch6)
- C6: có cảnh báo mô hình nến ngược hướng tại phá vỡ so với không có (ch13–17)
- C7: tỷ lệ đạt mục tiêu 1×/2×/3× trong 60 phiên, tỷ lệ FAILED theo nhóm
- C8: mô phỏng lệnh mua (simulateVnTrade: vào mở cửa T+1, bỏ phiên khóa trần, T+2,5, phí + thuế), dừng lỗ = mức thất bại 50%,
  mục tiêu 1×, tối đa 60 phiên: PF / tỷ lệ thắng / kỳ vọng R, IS và OOS
- C9: khung tuần (sự kiện CONFIRMED trên nến tuần, lợi suất T+4 tuần) — mô tả

Quyết định:
- Nhóm ĐẠT H1 → nhãn VALIDATED cho tín hiệu mua của nhóm đó; nhóm khác giữ EXPERIMENTAL (chỉ hiển thị).
- H2 ĐẠT → cảnh báo giảm được ghi là đã kiểm định.
- Kết quả lưu thành hằng số pring/validation.js và hiển thị trong thẻ bằng chứng của P4.

## Bổ sung sau khi duyệt (chỉ mô tả, không đổi quyết định)
- R1 placebo: cùng mã, ngày ngẫu nhiên trong cùng tháng, 200 lần → p thực nghiệm
- R2 kỳ hạn T+5 / T+10 / T+40
- R3 Benjamini–Hochberg q cho 4 nhóm H1
- R4 theo nửa năm
- H3 ghi INSUFFICIENT khi nhóm điểm cao có < 10 sự kiện OOS (không xảy ra)
