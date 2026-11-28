# 02 — Lộ trình nâng cấp T0–T7 và điều kiện nghiệm thu

*Mỗi bước là một PR riêng, chỉ merge khi chủ dự án ghi "merge #N". Thứ tự: sửa cái **sai** trước (A, B), rồi thêm cái **thiếu** (C), cuối cùng là khung giao diện (D).*

## Nguyên tắc kỹ thuật chung

- **Không đổi phép tính.** Mọi thay đổi nằm ở tầng vẽ (`TVChartManager`, `buildScene`, tuỳ chọn series), không chạm `detectors/*`, `quant-core/*`, `AnalysisController`. Chỉ báo mới (T4) là tệp mới, không sửa tệp cũ.
- **Bộ so khớp giá trị (oracle):** ghi giá trị mọi chỉ báo hiện có trên 3 mã (VNINDEX, FPT, HPG) × khung D / W trước T1. Sau mỗi bước phải khớp từng số.
- **Hợp đồng E2E:** `parityManifest.ts` (47 tính năng) + `ta-parity.ts` xanh toàn bộ ở mỗi bước. Tính năng nào được dời chỗ thì cập nhật "đường mở" (REVEAL) trong bản kê, không xoá dòng.
- **Bố cục đã lưu theo tài khoản** (lớp, tham số, hình vẽ) phải mở được sau nâng cấp. Trường mới có giá trị mặc định; không đổi tên trường cũ.
- **7 bộ lọc:** không sửa tệp `PatternScannerPanel`, `ConvergencePanelV2`, `GoldenSepaPanel`, `TechnicalFilterPanel`, `SepaPanel`, `AIChartVision/*` ngoài phạm vi bước T7 (chỉ đổi thanh chọn). Kiểm bằng vân tay `data-testid` + chữ của từng bộ lọc trước / sau (công cụ `ui-audit --click`).

## Các bước

| Bước | Nội dung | Sửa lỗi | Nghiệm thu |
|---|---|---|---|
| **T0** | Mốc gốc: oracle giá trị chỉ báo; ảnh chụp chart theo từng lớp; vân tay 7 bộ lọc; chạy E2E parity | — | Có tệp mốc trong `docs/ta-tradingview/audit/` |
| **T1** | **Hiển thị đúng:** `localization` tiếng Việt (ngày, tháng, số theo kiểu Việt, một kiểu cho trục / chú giải / nhãn giá); chữ trục 11–12px; crosshair xám nét đứt; ghi công TradingView chuyển xuống chân chart (tắt logo đè dữ liệu, vẫn đúng giấy phép); trục KL `tỷ / tr`; chú giải mỗi chỉ báo một dòng có nút ẩn / cài đặt / xoá | A1–A8 | Ảnh chụp: không còn chữ tiếng Anh trên trục; oracle khớp 100%; parity xanh |
| **T2** | **Chỉ báo vẽ đúng chuẩn:** Ichimoku: khi bật lớp tự nới khoảng trống phải ≥ 26 nến để thấy đủ mây tương lai (không thêm dữ liệu giả); SuperTrend thêm tuỳ chọn tô nền; RSI dải 30–70 + vạch 50 + trục 70/50/30; MACD histogram 4 màu; ADX ba màu + ngưỡng; Bollinger tô 5%; một bộ màu tăng / giảm cho nến, KL, histogram, SuperTrend (theo Q1); màu đường theo Q2 | B1–B5, B7–B9 | Ichimoku: khi bật lớp, mép phải khung nhìn ≥ nến cuối + 26 (kiểm tự động); oracle khớp |
| **T3** | **Thang giá + kiểu chart + khoảng nhìn:** Tự động / Log / % / Chỉ số 100 / Đảo; kiểu Nến · Nến rỗng · Heikin Ashi · Thanh · Đường · Vùng · Baseline (Heikin Ashi chỉ đổi cách vẽ, chỉ báo vẫn tính trên giá thật); khoảng nhìn dưới trục thời gian + "Đi tới ngày"; tên khung theo Q4 | C1, C2, C8 | Đổi thang / kiểu không đổi số chỉ báo; lưu theo tài khoản |
| **T4** | **Chỉ báo mới** (tệp mới, có kiểm thử giá trị với số tham chiếu công bố): đợt 1 theo Q6: Stochastic, Stoch RSI, ATR, OBV, MFI, Parabolic SAR; đợt 2: CCI, Williams %R, Donchian, Keltner, Pivot Points, VWAP phiên, MA của KL | C6 | Mỗi chỉ báo: kiểm thử ≥ 3 mốc giá trị; mặc định TẮT |
| **T5** | **Hộp chỉ báo + cài đặt đầy đủ:** hộp "Chỉ báo" có ô tìm, nhóm, yêu thích; thêm nhiều bản của một chỉ báo (EMA tuỳ chu kỳ — bộ EMA 21/50/100 · MA 200 cũ giữ nguyên làm preset); thẻ Thông số / Kiểu / Hiển thị; bấm đúp vào đường để mở | B6, C4, C5 | Lớp `maSet` cũ vẫn bật / tắt như trước (hợp đồng `data-layer`) |
| **T6** | **Công cụ vẽ chuẩn:** thanh dọc bên trái; thêm đường ngang, tia ngang, tia, kênh song song, đo giá / thời gian, chữ / ghi chú, mũi tên, vị thế Mua / Bán; khoá / ẩn tất cả; menu chuột phải; phân cách phiên (khung trong ngày); so sánh mã; gom cảnh báo về một nơi | C3, C7, C9–C11 | Hình vẽ cũ (5 loại) mở được nguyên vẹn; E2E vẽ / kéo / xoá xanh |
| **T7** | **Khung theo chuẩn dự án:** thanh 7 bộ lọc → `.q-subtabs`; băng gợi ý trung tính; gộp 3 hàng điều khiển thành 1 thanh trên + thanh vẽ trái; bảng chi tiết thu gọn theo Q5; điện thoại tối đa 2 pane phụ; chữ ≥ 11px, bỏ xanh lơ / in hoa (gộp bước U7 của QUANTA UI v2) | D1–D6 | Vân tay 7 bộ lọc giống 100%; menu chính giống từng điểm ảnh; parity xanh |

## Ước lượng và rủi ro

| Bước | Khối lượng | Rủi ro chính | Cách chặn |
|---|---|---|---|
| T1 | nhỏ | Định dạng số sai ở mã có giá nhỏ (cổ phiếu nghìn đồng) | Kiểm trên VNINDEX, FPT, mã giá < 10 |
| T2 | vừa | Nến trống tương lai làm lệch `rangeBars` / phím Home End | Kiểm thử "ghim vào nến" sẵn có + thêm ca tương lai |
| T3 | vừa | Heikin Ashi bị hiểu là giá thật | Chú giải ghi rõ "Heikin Ashi — chỉ báo tính trên giá thật" |
| T4 | lớn | Sai công thức | Kiểm thử giá trị so với số tham chiếu công bố cho từng chỉ báo |
| T5 | lớn | Vỡ bố cục đã lưu | Chuyển đổi bố cục có kiểm thử; giữ trường cũ |
| T6 | lớn | Thao tác vẽ xung đột kéo / zoom | Dùng lại cơ chế khoá kéo khi vẽ đang có |
| T7 | vừa | Đụng bộ lọc | Chỉ đổi `SubTabNavigation.tsx`; vân tay `ui-audit --click` từng bộ lọc |

Bước đề xuất làm đầu tiên sau khi chủ dự án chốt Q1–Q6: **T0 + T1** (một PR, chỉ đổi cách hiển thị, rủi ro thấp, sửa ngay lỗi thấy rõ nhất).
