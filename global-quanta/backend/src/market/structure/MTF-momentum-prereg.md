# MTF — "Đà tăng tiếp diễn" (cờ Quá đà) — TIÊU CHÍ ĐẶT TRƯỚC, CHẤM TRÊN SỔ THỜI GIAN THỰC (anh duyệt 2026-10-24)
Soạn 2026-10-24, TRƯỚC khi sổ ghi phiên đầu tiên. Sau khi commit, tiêu chí không được sửa; mọi sửa đổi ghi ở mục cuối kèm lý do và ngày.

## Vì sao phải chấm trên sổ thời gian thực
Hiệu ứng được THẤY (không đặt trước) ở hai lần chạy lịch sử: v1 "B quá mua" tốt nhất (OOS +0,81%/20 phiên); v2 cờ Quá đà trong
giai đoạn UP / B: bật +0,79% vs. tắt −0,82% (OOS 2025–2026), IS +0,72% vs. −0,68%. Kiểm định lại trên chính dữ liệu đó là
dữ liệu đã xem -> chỉ dữ liệu SAU ngày triển khai mới là bằng chứng xác nhận.

## Định nghĩa (engine MTF v2.0.0, khung ngày, đúng như phần mô tả đã thấy)
- Tập so sánh của phiên d: mã trong universe của job quét (scanner:universe), đủ điều kiện tại d (giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ,
  ≥ 260 nến ngày), giai đoạn khung ngày tại d ∈ {UP, B}.
- Nhóm BẬT: cờ Quá đà khung ngày = +1 tại d (giá ≥ 3 ATR trên MA100 phiên đang dốc lên). Nhóm TẮT: còn lại của tập so sánh.
- Ghi sổ lúc job 15:47 của phiên d (nến d đã đóng), KHÔNG sửa về sau. Lợi suất: mở cửa d+1 → đóng cửa d+20 (giá điều chỉnh hiện hành,
  hai đầu cùng hệ số), trừ TB cùng công thức của mọi mã đủ điều kiện trong universe tại d (lợi suất vượt trội).
- Quan sát của phiên d (chấm khi có nến d+20): chênh lệch S_d = TB vượt trội nhóm BẬT − TB vượt trội nhóm TẮT. Phiên chỉ được tính
  khi mỗi nhóm có ≥ 3 mã. Kèm L_d = TB vượt trội nhóm BẬT − 0,6% phí (chân mua thực tế).

## Giả thuyết M1 (một giả thuyết, không có họ bội)
M1 — Đà tăng tiếp diễn: E[S_d] > 0.
ĐẠT khi đủ ≥ 120 phiên đã chấm, đồng thời: (a) TB S_d > 0; (b) cận dưới KTC 95% của TB S_d > 0 theo bootstrap khối dịch chuyển
(khối 20 phiên — các kỳ hạn chồng nhau, 2000 lần, seed 7); (c) TB L_d > 0 (sau phí vẫn hơn thị trường).
KHÔNG ĐẠT nếu tại 120 phiên điều kiện trên không thỏa. Không dừng sớm: trước 120 phiên chỉ hiển thị "đang tích lũy mẫu" + số liệu mô tả.
Đọc lại một lần ở 240 phiên (ghi cả hai mốc; quyết định dùng mốc 120, mốc 240 chỉ để xác nhận độ bền).

## Quyết định
- Trước khi ĐẠT: cờ Quá đà giữ là MÔ TẢ (lời tài liệu "không mua đuổi" vẫn hiển thị, kèm ghi chú dữ liệu); không đưa vào kết luận / xếp hạng.
- Nếu ĐẠT: đề xuất với anh (cần duyệt riêng) thay quy tắc R3 "quá đà -> chờ mua" bằng "quá đà trong xu hướng tăng = đà tiếp diễn",
  nhãn "ĐÃ KIỂM ĐỊNH (sổ thực)". Nếu KHÔNG ĐẠT: ghi kết quả, giữ nguyên R3 theo tài liệu.
- Sổ lưu trên Railway Volume (tệp JSON nén), không dùng Supabase / Neon.

## Mốc thời gian dự kiến
Phiên ghi đầu tiên = phiên đầu sau triển khai; phiên chấm đầu tiên sau 20 phiên; đủ 120 phiên chấm ≈ 140 phiên giao dịch (~7 tháng).

## Sửa đổi
1. 2026-10-24 (trước khi sổ ghi bất kỳ phiên nào — làm rõ, không đổi tiêu chí): "phiên đầu sau triển khai" = 2026-10-26
   (triển khai thứ Bảy 24/10); mã chặn mọi phiên trước 26/10 khỏi sổ, kể cả khi job được chạy tay.
