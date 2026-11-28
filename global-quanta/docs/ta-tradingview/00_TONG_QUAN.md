# Tab Kỹ thuật — rà soát chart theo chuẩn TradingView và đề xuất nâng cấp

*28/11/2026 · Người viết: giám đốc dự án kiêm lập trình viên cao cấp · Chỉ tài liệu: không đổi một dòng mã nào.*

## 1. Phạm vi và cách làm

- **Đối tượng:** toàn bộ tab Kỹ thuật (`src/components/MainTabs/TaVnIndex`, 64 tệp giao diện, khoảng 10.100 dòng), lõi chart `src/lib/ta-command-center` (TVChartManager, LayerManager, cảnh vẽ, công cụ vẽ), và 7 bộ lọc ở cuối tab.
- **Cách kiểm:**
  1. Đọc mã từng thành phần.
  2. Chụp chart thật trên dinhtuan-ck.vercel.app (phiên 27/11/2026, VNINDEX khung ngày) ở 4 trạng thái: giá sạch; KL + RSI + MACD + EMA + Bollinger; Ichimoku + SuperTrend + ADX; màn hình điện thoại 390px.
  3. Đối chiếu với bản chuẩn TradingView (bản web đầy đủ) về chỉ báo, bố cục, trục, chú giải, công cụ vẽ và thao tác.
- **Mốc so sánh:** TradingView là chuẩn **hành vi và bố cục** (chỉ báo vẽ đúng định nghĩa, trục, chú giải, công cụ). **Màu và chữ của khung giao diện** theo chuẩn dự án QUANTA UI v2, lấy tab Tổng quan làm chuẩn: xanh là vạch, mã cổ phiếu trắng, chữ tối thiểu 11px, không xanh lơ / tím trang trí.

## 2. Kết luận ngắn

Tab Kỹ thuật **đã có nền móng tốt**, nhiều phần ngang TradingView:
- Lightweight Charts v5 (thư viện của chính TradingView), có nhiều pane kéo đổi chiều cao.
- Crosshair hút nến, phím tắt, bảng lệnh (⌘K), hoàn tác / làm lại, chụp ảnh, toàn màn hình.
- Lưu bố cục và hình vẽ theo tài khoản.
- Mọi lớp phủ ghim vào nến.
- 30 lớp chỉ báo / phương pháp.
- Bản kê bảo toàn tính năng (`parityManifest.ts`, 47 tính năng) và kiểm thử tự động E2E (`backend/e2e/ta-parity.ts`).

**Chưa đạt chuẩn TradingView ở 4 mảng:**

| Mảng | Mức | Ví dụ điển hình |
|---|---|---|
| A. Hiển thị trục, số, ngày, chú giải | **Nặng** | Trục ngày tiếng Anh ("Mar", "24 Jul '26"); trục giá `1653.90` trong khi thanh đầu ghi `1.653,9`; chữ trục 10px; logo TradingView đè lên pane chỉ báo |
| B. Chỉ báo vẽ chưa đúng chuẩn | **Vừa** | Mây Ichimoku tương lai chỉ thấy 6/26 phiên khi mở; RSI thiếu dải 30–70 và vạch 50, trục ghi 75/50/25; KL ghi "1B / 500M" |
| C. Thiếu tính năng chuẩn | **Vừa** | Không có thang log / %; chỉ có kiểu nến; 5 công cụ vẽ (TradingView có hàng chục); không có hộp chọn chỉ báo có ô tìm; MA không chỉnh được chu kỳ / màu; thiếu Stochastic, ATR, OBV, MFI, Parabolic SAR, Pivot… |
| D. Khung giao diện chưa theo chuẩn dự án | **Vừa** | Thanh bộ lọc là viên thuốc vàng gradient chữ 10px; 3 hàng điều khiển trên chart; crosshair và màu nến neon lệch chuẩn dự án; điện thoại xếp 4 pane chật |

Chi tiết từng lỗi kèm bằng chứng: [01_RA_SOAT.md](01_RA_SOAT.md). Lộ trình nâng cấp và điều kiện bảo toàn: [02_LO_TRINH.md](02_LO_TRINH.md).

## 3. Cam kết bảo toàn (áp cho mọi bước)

1. **7 bộ lọc giữ nguyên 100%:** Pattern Scanner, Bộ lọc Hợp lưu Nâng Cao, Golden SEPA, CAMSLIM Cup & Handle, Base Breakout, SEPA Minervini, AI Chart Vision.
   - Không đổi engine, tham số, API, kết quả, `data-testid`, hay đường "chọn mã → khoanh vùng trên chart".
   - Chỉ được đổi kiểu thanh chọn bộ lọc.
2. **Số của chỉ báo không đổi:** RSI, MACD, ADX, EMA/MA, Ichimoku, Bollinger, SuperTrend, MS-GARCH, Volume Profile, AVWAP, SMC, VSA, Wyckoff, Elliott, Pring và Cấu trúc MTF phải ra đúng từng giá trị như trước. Kiểm bằng bộ so khớp giá trị (oracle) trên dữ liệu ghi sẵn. Chỉ cách **vẽ** được đổi.
3. **Hợp đồng E2E:** `parityManifest.ts` + `ta-parity.ts` phải xanh toàn bộ ở mọi bước. `data-layer`, `data-tf`, `data-tool` và `data-testid` giữ nguyên.
4. **Quyết định cũ của chủ dự án giữ nguyên:** mọi lớp **TẮT mặc định** (chỉ có nến); lớp phủ luôn ghim vào nến; bố cục và hình vẽ lưu theo tài khoản (bản đã lưu vẫn mở được sau nâng cấp).
5. **Menu chính không đổi** (chuẩn QUANTA UI v2).

## 4. Quyết định của chủ dự án (28/11/2026) — ĐÃ CHỐT

| # | Quyết định |
|---|---|
| Q1 | Màu nến = màu tăng / giảm của dự án (`--q-up` / `--q-down`), thay màu neon; đồng bộ bảng giá. Áp chung cho nến, KL, histogram, SuperTrend |
| Q2 | Màu đường chỉ báo = màu mặc định TradingView |
| Q3 | Thêm lựa chọn vẽ KL chồng ở đáy khung giá; mặc định vẫn TẮT |
| Q4 | Tên khung `1p 5p 15p 1g · Ngày Tuần Tháng`, **gộp thành MỘT nút xổ xuống** (như nút "4h" của TradingView: bấm mở danh sách khung để chọn). Khoảng nhìn đặt dưới trục thời gian như TradingView (`1N 5N 1T 3T 6T Đầu năm 1Năm 5Năm Tất cả`) |
| Q5 | Bảng chi tiết bên phải tự thu gọn khi màn hình hẹp hơn 1700px |
| Q6 | Chỉ báo mới: Stochastic, Stoch RSI, ATR, OBV, MFI, Parabolic SAR. **Công cụ vẽ mở rộng theo TradingView** (ảnh chủ dự án gửi 28/11): thanh dọc bên trái chia nhóm — **Mẫu hình giá** (XABCD, Cypher, Vai-đầu-vai, ABCD, Tam giác, Three drives) · **Sóng Elliott** (đẩy 1-2-3-4-5, điều chỉnh A-B-C, tam giác A-B-C-D-E, kết hợp đôi W-X-Y, kết hợp ba W-X-Y-X-Z) · **Chu kỳ** (đường chu kỳ, chu kỳ thời gian, đường sin) · **Cọ vẽ** (cọ, bút dạ quang) · **Mũi tên** (đánh dấu mũi tên, mũi tên, mũi tên lên / xuống) · **Hình học** (chữ nhật, chữ nhật xoay, đường dẫn, tròn, elip, đa giác, tam giác, cung, đường cong, đường cong kép). Mục tiêu: chart hoạt động chuyên nghiệp như TradingView |

Phần dưới là bảng câu hỏi gốc (giữ để đối chiếu).

## 4b. Câu hỏi gốc

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | **Màu nến:** neon `#00F5A0 / #FF0055` (duyệt 03/10/2026), màu TradingView `#089981 / #F23645`, hay màu tăng / giảm của dự án `--q-up #34d399 / --q-down #fb7185` (Tổng quan)? | **Màu dự án**: cùng màu với bảng giá, SuperTrend và các tab khác (hiện trên cùng một chart có hai màu xanh lá khác nhau) |
| Q2 | **Màu đường chỉ báo:** màu mặc định TradingView (MACD xanh dương / cam, RSI tím…) hay bảng màu dự án? | **Màu mặc định TradingView** cho đường chỉ báo, để nhà đầu tư quen tay nhận ra ngay. Khung, chữ, crosshair theo dự án |
| Q3 | **Khối lượng:** giữ pane riêng hay cho phép vẽ **chồng ở đáy pane giá** như TradingView? | Thêm lựa chọn "chồng lên giá", mặc định vẫn **tắt** như quyết định cũ |
| Q4 | **Tên khung và khoảng nhìn:** đang lẫn `D / W / M`, `1H`, `1T / 3T / 1N`. | Khung: `1p 5p 15p 1g · Ngày Tuần Tháng`; khoảng nhìn đặt **dưới trục thời gian** như TradingView: `5N 1T 3T 6T Đầu năm 1Năm 5Năm Tất cả` |
| Q5 | **Bảng chi tiết bên phải** (rộng ~290px, làm chart còn 858px trên màn 1600px). | Mặc định **thu gọn** khi màn < 1700px; nhớ theo tài khoản |
| Q6 | **Chỉ báo mới** (bước T4): làm cả lô 13 chỉ báo hay chọn trước? | Làm 6 chỉ báo dùng nhiều nhất trước: Stochastic, Stoch RSI, ATR, OBV, MFI, Parabolic SAR |
