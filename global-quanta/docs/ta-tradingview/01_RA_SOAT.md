# 01 — Rà soát chi tiết (bằng chứng)

*Mỗi dòng: điều đang có (đọc mã + ảnh chụp trang thật 27/11/2026), chuẩn TradingView, mức độ. Mã lỗi dùng lại ở [02_LO_TRINH.md](02_LO_TRINH.md).*

Mức độ: **A** = sai / gây hiểu nhầm số liệu · **B** = thiếu chuyên nghiệp, thấy ngay · **C** = thiếu tính năng chuẩn.

## A. Trục, số, ngày, chú giải

| Mã | Đang có | Chuẩn TradingView | Mức |
|---|---|---|---|
| A1 | Trục thời gian theo mặc định thư viện (tiếng Anh): `2026 · Mar · May · Jul · Aug · Oct · 3`; nhãn crosshair `24 Jul '26`. `TVChartManager` không cấu hình `localization` | Tháng theo ngôn ngữ người dùng (`Th3`, `24 Th7 '26`); mốc năm đậm | A |
| A2 | Trục giá `1653.90` (dấu chấm thập phân) trong khi thanh đầu chart ghi `1.654` / `1.653,9` và cả dự án dùng kiểu Việt | Một kiểu số duy nhất cho trục, chú giải, nhãn giá cuối | A |
| A3 | Chữ trục `fontSize: 10`, IBM Plex Mono | Chữ trục ~12px; chuẩn dự án tối thiểu 11px | B |
| A4 | Logo TradingView (thuộc tính `attributionLogo` của thư viện) đè lên pane chỉ báo dưới cùng; trên điện thoại che đường ADX | Ghi công TradingView vẫn bắt buộc theo giấy phép, nhưng đặt ở chỗ không che dữ liệu | B |
| A5 | Trục KL ghi `1B · 500M` (tiếng Anh) | `1 tỷ · 500 tr` cho đồng bộ với "KL 460,96 tr" ở chú giải | B |
| A6 | Chú giải pane gộp nhiều thứ trên một dòng: `RSI 14 · 70 / 30 28,9 · 750 nến · điểm chỉ số ×`; dòng EMA và Bollinger chung một hàng | Mỗi chỉ báo một dòng: tên, tham số, giá trị (đúng màu đường); rê chuột hiện nút ẩn / cài đặt / xoá; ghi chú dữ liệu không nằm trong chú giải | B |
| A7 | Chú giải OHLC có ngày (`2026-07-24`) và mã khung `D` ở dạng chữ trơn | Mã · khung · sàn; O H L C màu theo nến tăng / giảm; ngày chỉ nằm trên nhãn trục thời gian | B |
| A8 | Crosshair màu xanh lơ `#22D3EE` 40% | Nét đứt xám trung tính; nhãn trục nền tối. Chuẩn dự án cấm xanh lơ trang trí | B |

## B. Chỉ báo vẽ chưa đúng chuẩn

| Mã | Chỉ báo | Đang có | Chuẩn TradingView | Mức |
|---|---|---|---|---|
| B1 | **Ichimoku** | **ĐÍNH CHÍNH 28/11 (T2):** đã đạt chuẩn — mã tự nới khoảng trống bên phải theo mây (`futureK` + 4 nến, TVChartPanel), mây vươn đủ 26 phiên tương lai. Đánh giá ban đầu ("chỉ thấy 6/26") là sai do đọc nhầm `rightOffset` mặc định | Mây vươn đủ 26 phiên vào tương lai | — |
| B2 | **SuperTrend** | Đã đúng: hai đoạn tăng / giảm tách riêng, ngắt tại điểm đổi chiều. Chỉ thiếu tô nền giữa giá và đường | Có tuỳ chọn tô nền nhạt giữa giá và đường SuperTrend | C |
| B3 | **RSI** | Vạch 70 đỏ / 30 xanh đứt; không có vạch 50; không tô dải; trục hiện 75 / 50 / 25 | Vạch 70 / 30 xám đứt + 50 chấm; tô dải 30–70 nhạt; trục hiện 70 / 50 / 30 | B — **T2 đã sửa:** dải 30–70, vạch 50, màu TradingView. Nhãn trục do thư viện tự chia (không ép 70/50/30) |
| B4 | **MACD** | MACD xanh lơ, Signal hổ phách; histogram neon 2 sắc độ | MACD xanh dương, Signal cam; histogram 4 màu (tăng mạnh / tăng yếu / giảm yếu / giảm mạnh) | B |
| B5 | **Khối lượng** | Chỉ có pane riêng; cột neon 45%; không có đường trung bình KL | Chuẩn: KL vẽ chồng ở đáy pane giá (khoảng 20% chiều cao), cột theo màu nến; có tuỳ chọn MA 20 của KL | B |
| B6 | **EMA 21/50/100 · MA 200** | Bộ chu kỳ cố định, màu cố định (xanh dương, vàng, tím, đỏ nhạt), không chỉnh được chu kỳ, kiểu, màu | Mỗi đường là một chỉ báo: chu kỳ, nguồn (close / hl2…), kiểu (SMA / EMA / WMA), màu, độ dày đều chỉnh được | C |
| B7 | **Bollinger** | Dải trên / dưới màu xanh trời `#38bdf8`, nền tô xanh lơ 5%, đường giữa xám — lẫn với EMA và mây khi bật cùng lúc | Đường giữa và hai dải có màu riêng dễ phân biệt; nền tô rất nhạt | B |
| B8 | **ADX · DI±** | ADX trắng dày, +DI / −DI dùng màu nến neon | Ba đường màu riêng (+DI, −DI, ADX); vạch ngưỡng 25 | B |
| B9 | **Màu nến và SuperTrend lệch nhau** | Nến `#00F5A0 / #FF0055` (neon) nhưng SuperTrend `#34d399 / #fb7185` (màu dự án): cùng chart có hai màu tăng / giảm khác nhau | Một bộ màu tăng / giảm duy nhất cho nến, KL, histogram, SuperTrend (xem Q1) | B |

## C. Thiếu tính năng chuẩn TradingView

| Mã | Tính năng | Đang có | Chuẩn TradingView | Mức |
|---|---|---|---|---|
| C1 | **Thang giá** | Chỉ thang thường (không có `PriceScaleMode` trong mã) | Tự động · Log · % · Chỉ số hoá về 100 · Đảo ngược; nút nhanh ở góc dưới phải. Thang log là bắt buộc khi xem nhiều năm | C (quan trọng) |
| C2 | **Kiểu biểu đồ** | Chỉ nến | Nến · Nến rỗng · Heikin Ashi · Thanh OHLC · Đường · Vùng · Đường nền (baseline) | C |
| C3 | **Công cụ vẽ** | 5: Trend, Zone (hình chữ nhật), Fibonacci, Đếm sóng, Fib Time Zone; nằm trên thanh ngang | Thanh dọc bên trái. Tối thiểu: đường ngang, tia ngang, tia, kênh song song, đo khoảng giá / thời gian, chữ / ghi chú, mũi tên, vị thế Mua / Bán (R:R); khoá / ẩn toàn bộ hình vẽ | C |
| C4 | **Chọn chỉ báo** | Menu "Lớp & pane": lưới 30 công tắc chia 4 nhóm | Hộp "Chỉ báo" có ô tìm, nhóm, yêu thích; thêm nhiều bản của cùng chỉ báo (VD 2 đường EMA khác chu kỳ) | C |
| C5 | **Cài đặt chỉ báo** | Chỉ RSI, MACD, ADX, Volume Profile, Bollinger, SuperTrend, AVWAP có tham số; không chỉnh màu / độ dày | Mỗi chỉ báo có 3 thẻ: Thông số · Kiểu (màu, độ dày, ẩn từng đường) · Hiển thị theo khung; bấm đúp vào đường để mở | C |
| C6 | **Chỉ báo phổ biến còn thiếu** | — | Stochastic, Stoch RSI, ATR, OBV, MFI, CCI, Williams %R, Parabolic SAR, Donchian, Keltner, Pivot Points, VWAP theo phiên (khung trong ngày), MA của KL | C |
| C7 | **So sánh mã** | Chỉ dùng VN-Index nội bộ cho Wyckoff | Chồng thêm mã khác theo % (VD HPG so với VN-Index) | C |
| C8 | **Khoảng nhìn nhanh** | `1T 3T 6T 1N 3N Tất cả` đặt ở thanh trên cạnh khung | Đặt dưới trục thời gian: 5N · 1T · 3T · 6T · Đầu năm · 1Năm · 5Năm · Tất cả; thêm "Đi tới ngày" | C |
| C9 | **Menu chuột phải** | Không có | Đặt lại chart · cài đặt · thêm cảnh báo tại giá · khoá đường · ẩn hình vẽ | C |
| C10 | **Phân cách phiên** (khung trong ngày) | Không có | Vạch dọc mờ giữa các phiên | C |
| C11 | **Cảnh báo** | Có cảnh báo giá (DW10) và cảnh báo Elliott, tách rời | Một nơi quản lý cảnh báo: giá chạm, cắt đường chỉ báo, cắt hình vẽ | C |

## D. Khung giao diện so với chuẩn dự án (QUANTA UI v2)

| Mã | Đang có | Chuẩn dự án / TradingView | Mức |
|---|---|---|---|
| D1 | Thanh chọn 7 bộ lọc (`SubTabNavigation.tsx`): viên thuốc nền vàng gradient, chữ vàng `#fbbf24`, cỡ 10px | Thanh tab con chuẩn `.q-subtabs / .q-subtab` (như Tổng quan, Ngành, Vĩ mô, Cơ bản). **Chỉ đổi kiểu, 7 bộ lọc giữ nguyên** | B |
| D2 | Băng gợi ý "Vừa chọn … — xem AI Chart Vision?" nền hổ phách (vàng chỉ dành cho cảnh báo) | Băng thông tin trung tính, nút chính theo chuẩn | B |
| D3 | 3 hàng điều khiển trên chart: (1) mã + nhóm chỉ số + giá + khung + khoảng nhìn + nhãn dữ liệu; (2) preset + biểu tượng; (3) thanh công cụ vẽ + lớp + Confluence + chụp | TradingView: **1 thanh trên** (mã, khung, kiểu chart, chỉ báo, bố cục, chụp, toàn màn hình) + **thanh vẽ dọc bên trái** + khoảng nhìn dưới trục thời gian | B |
| D4 | Bảng chi tiết bên phải luôn mở (~290px), chart còn 858px trên màn 1600px | Thu gọn được, mặc định gọn trên màn vừa (Q5) | B |
| D5 | Điện thoại 390px: 4 pane xếp chồng còn ~60px mỗi pane; logo che ADX; trục thời gian chỉ còn 2 nhãn | Tối đa 2 pane phụ trên điện thoại (pane khác gập lại, chạm để mở); logo không che dữ liệu | B |
| D6 | Nhiều chữ 10px và chữ in hoa ở menu lớp, chú giải, nhãn dữ liệu; trạng thái lưu đám mây màu xanh lơ | Chữ ≥ 11px, không in hoa giãn chữ, không xanh lơ (bước U7 của QUANTA UI v2) | B |
