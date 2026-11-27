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

## Sửa đổi E2-v1 — 27/11/2026 (quyết định của chủ dự án)

Ghi trước khi dựng lại bảng. **Không đổi luật thăng/giáng, ngưỡng, kỳ hạn hay cách đo IC.** Chỉ đổi danh sách tín hiệu trong bảng bằng chứng
và bậc khởi điểm của các tín hiệu dưới đây. Chuỗi `E2_VERSION` giữ nguyên để không xoá chuỗi IC đã đo (đổi phiên bản = engine dựng lại từ đầu).

| Thay đổi | Lý do | Bằng chứng tại thời điểm quyết định |
|---|---|---|
| `top20_alpha` bậc khởi điểm B → **C** | T3 FAIL tổng thể; giảm phơi nhiễm, không phải chọn theo kết quả tốt | E2: IC 5 phiên −0,014 (19 ngày) |
| `structure_stage` rời bảng E2, thay bằng **`camslim_cup`** bậc khởi điểm **B** | Chủ dự án chọn CAN SLIM Cốc tay cầm, dạng cờ mẫu hình (2 = phá vỡ, 1 = sẵn sàng, 0 = không) | Kiểm định bộ lọc CAN SLIM v2: EXPERIMENTAL, ngoài mẫu từ 25/04/2026 10 lệnh, KTC lợi suất −7,6% … −1,5% — **không ủng hộ bậc B**; ghi rõ để đối chiếu về sau |
| `log_rvol` rời bảng E2, thay bằng **`kq_nowcast`** bậc khởi điểm **B** | Chủ dự án chọn KQKD (tăng trưởng LNST cả năm ước tính) | KQ-r1: IC ngoài mẫu 0,047, p 0,0005, 19 lứa — ĐẠT nhưng thiên lệch sống sót (mẫu theo mã hiện tại) |
| `rrg_quadrant` **giữ C** | Chủ dự án chọn để luật E2 tự xét thăng (n ≥ 60, q ≤ 0,10, ổn định hai nửa) | 19 ngày đo, IC bị cụm theo ngành |

Giữ nguyên để không phá phần khác:
- `structure_stage` vẫn có giá trị trong bảng E1 vì là 1 trong 7 mô hình TA của quy tắc Elite HL (`confluence.js`). Elite HL không đổi.
- `log_rvol` vẫn có giá trị trong bảng E1 và chuỗi IC hồi cứu vẫn được đo, lưu trong `elite:ic` (E7 vẫn dùng 5 tín hiệu dòng tiền).

Hệ quả đã biết (công bố trước):
- Bậc B có trọng số trong Điểm Elite (E3) với IC tiên nghiệm 0,01, co rút về IC đo được theo N0 = 60. Hai tín hiệu mới chỉ đo TIẾN từ phiên
  bảng E1 đầu tiên có chúng, nên trong khoảng 60 phiên đầu trọng số gần như hoàn toàn là tiên nghiệm. Điểm Elite và danh mục Elite dòng tiền
  (đối chứng) thay đổi từ phiên dựng kế tiếp; **danh mục chính thức Elite HL không dùng các trọng số này**.
- `camslim_cup` thường chỉ khác 0 ở 0–5 mã/ngày nên nhiều ngày IC không xác định (tín hiệu hằng) — giống `sepa_s2`. Tab 4 sẽ báo "Thiếu dữ liệu".
- `kq_nowcast` đổi theo quý nên IC ngày tương quan cao giữa các ngày; t Newey–West độ trễ h có thể vẫn phóng đại.
- Ngày quá khứ chưa có cột của tín hiệu mới được ghi "không đo được" một lần (không đọc lại mỗi đêm); độ phủ ở tab 4 tính từ ngày đầu có dữ liệu.
- Giáng bậc vẫn theo luật cũ: ở kỳ hạn chính n ≥ 60, IC TB < 0, p ≤ 0,10.
