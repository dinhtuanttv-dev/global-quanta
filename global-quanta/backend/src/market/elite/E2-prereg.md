# E2 — Engine bằng chứng Elite 10: đăng ký trước

Ghi ngày 2026-10-17, **trước khi** viết mã đo và trước khi xem bất kỳ kết quả IC nào. Không sửa sau khi chạy. Đổi luật = đăng ký
phiên bản mới (E2-v2) kèm lý do, và chạy lại trên toàn bộ dữ liệu.

## Mục tiêu

Đo lại bằng dữ liệu thật mức dự báo của từng tín hiệu trong sổ đăng ký (E1) đối với lợi suất **tương đối** giữa các mã, và quyết
định tín hiệu nào được góp trọng số vào Điểm Elite (E3). Mọi kết quả, kể cả xấu, được công khai ở `/api/elite/evidence`.

## Định nghĩa

- **Phiên**: ngày có `close_adj` của VNINDEX trong `market_daily`.
- **Vũ trụ ngày d**: các mã có giá trị tín hiệu (khác null) tại d và có `close_adj` tại d+1 và d+1+h.
- **Lợi suất tương lai** `r(d,h) = close_adj(d+1+h) / close_adj(d+1) − 1`. Bỏ phiên d+1 vì bảng tín hiệu dựng sau 17:00 phiên d,
  lệnh sớm nhất là phiên d+1; lấy giá đóng cửa d+1 làm giá vào để không phụ thuộc giá mở cửa chưa điều chỉnh. Kỳ hạn
  h ∈ {1, 5, 10, 20} phiên.
- **IC ngày** `IC(d,h)`: tương quan hạng Spearman giữa giá trị tín hiệu và r(d,h), hạng trung bình cho giá trị trùng. Bắt buộc
  n ≥ 30 mã và tín hiệu có ≥ 2 giá trị khác nhau trong ngày; không đạt thì bỏ ngày đó.
- **Tổng hợp** trên chuỗi IC(d,h): trung bình; sai số chuẩn Newey–West với độ trễ h (chuỗi lợi suất chồng lấn); t = TB / SE;
  p một phía cho giả thuyết IC > 0 theo phân phối chuẩn; số ngày n.
- **Ổn định**: chia chuỗi ngày theo thời gian thành hai nửa bằng nhau; ổn định khi IC trung bình của **cả hai** nửa > 0.
- **Đa kiểm định**: Benjamini–Hochberg trên tất cả cặp (tín hiệu × kỳ hạn) có n ≥ 40 ngày, dùng p một phía (IC > 0) -> q.

## Nguồn dữ liệu

1. **Hồi cứu (point-in-time)**: đặc trưng dòng tiền trong `market_flow_daily.features` — `stealth5`, `stealth20`, `net_intent`
   (= netIntent), `mom5_atr`, `log_rvol` — được tính tại cuối phiên d chỉ từ dữ liệu ≤ d. Dùng toàn bộ lịch sử bảng này (~250 phiên).
2. **Tiến**: mọi tín hiệu khác chỉ được đo từ các bảng tín hiệu đã lưu (`elite:panel:<date>`, bắt đầu 2026-10-16). Không dựng lại
   giá trị lịch sử cho chúng.

## Luật bậc bằng chứng

- **Bậc khởi điểm** = bậc trong sổ E1 (A: WS-v1, Stealth 5/20; B: Top 20 M1, SEPA S2; C: còn lại), lấy từ các kiểm định đặt trước
  đã có trong dự án.
- **Kỳ hạn chính**: h = 1 cho `ws_sector_alpha` (tín hiệu cho phiên kế tiếp); h = 5 cho mọi tín hiệu theo mã.
- **Thăng lên B**: có ít nhất một kỳ hạn với n ≥ 60, IC TB > 0, q ≤ 0,10 và ổn định hai nửa.
- **Thăng lên A**: có ít nhất một kỳ hạn với n ≥ 120, IC TB ≥ 0,02, q ≤ 0,05 và ổn định hai nửa.
- **Giáng một bậc** (A → B, B → C): ở kỳ hạn chính có n ≥ 60 và IC TB < 0 với p một phía (IC < 0) ≤ 0,10.
- Thăng và giáng chỉ đi một bậc mỗi lần đánh giá, và giáng được xét trước thăng.
- Tín hiệu bậc C **không có trọng số** trong Điểm Elite (E3); chỉ hiển thị làm bối cảnh.
- Không có ngoại lệ thủ công.

## Giới hạn đã biết

- Vũ trụ hồi cứu là danh sách mã đang có dữ liệu dòng tiền (thiên lệch sống sót nhẹ).
- ~250 phiên chỉ khoảng một năm và một vài chế độ thị trường.
- Các đặc trưng dòng tiền tương quan với nhau; BH kiểm soát tỷ lệ phát hiện sai nhưng không loại bỏ trùng lặp thông tin
  (E3 xử lý bằng co rút trọng số).
- Không trừ phí giao dịch: IC đo khả năng xếp hạng, không đo lợi nhuận danh mục (E3/E7 đo danh mục sau phí).
