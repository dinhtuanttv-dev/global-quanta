# Rà soát: Thanh khoản & năng lực giao dịch + Price Action (Hồ sơ 360° · Doanh nghiệp)

26/11/2026 · nguồn đối chiếu: sách "Price Action – Hành động giá chuyên sâu" Tập 1–3 (`C:\Users\HP\PRICE ACTION`),
`docs/PRICE_ACTION_CODE_SPEC.md`, mã `src/lib/price-action` (pa-standalone-1.0.0), Gateway LQ-v1.

## A. Lỗi dữ liệu (ảnh hưởng toàn hệ thống)

| # | Lỗi | Bằng chứng | Hậu quả | Vá |
|---|---|---|---|---|
| A1 | **Nến ma ngày nghỉ 24/11/2026**: lịch quan sát của Gateway ghi 24/11 "không có phiên", nhưng kho ngày có dòng 24/11 cho HPG, FPT, VCB, VIC, SSI, MWG, DCM, VPI… với OHLC = giá tham chiếu, khối lượng 0, giá trị 0/rỗng. VN-Index và ACB không có dòng này. | `/api/elite/liquidity/VPI`: `2026-11-24 v=0 r=0`; `/api/market/ta-series?ticker=HPG`: nến 24/11 phẳng, volume 0; `/api/market/trading-calendar`: 24/11 OBSERVED. | Bảng thanh khoản: "Thấp nhất 20 phiên 0 tr", mật độ 19/20, trung bình kéo thấp; σ20, lợi suất, RVOL (trung bình 20 phiên có một số 0), ATR, NR7 (nến biên độ 0) trên mọi tab dùng kho ngày. | `calendar.isPhantomSessionRow` + lọc tại kho ưu tiên cục bộ (`getMarketDailyDates/ByDate/Range`, `getBars`) — một điểm chặn cho hơn 20 nơi đọc; thêm ở `dailyBars` (nhánh lấy mới) và `loadPrices` Elite. Dòng có khớp lệnh luôn được giữ (dữ liệu thật thắng lịch); mã ngừng giao dịch trong ngày CÓ phiên vẫn giữ. |
| A2 | **Sàn / bước giá chỉ tra trong 100 mã**: `/api/market/universe` = thành phần chỉ số (~100 mã). | NAF (đang trong danh mục Elite HL) không có → "Chưa xác định sàn và bước giá" ở Phòng họp AI. | Price Action không bao giờ "xác nhận" cho mọi mã ngoài 100 mã; mã bị coi là chưa xác thực. | Bổ sung `/api/market/securities` (1.968 mã, có sàn) khi mã không thuộc universe. |

## B. Engine Price Action — sai so với sách / đặc tả

| # | Hạng mục | pa-v1 | Sách | pa-book-2 |
|---|---|---|---|---|
| B1 | **Nhìn trước ở vùng hỗ trợ/kháng cự** | Setup và mục tiêu đọc `zone.low/high/mid/kind` CUỐI CÙNG (sau khi chạy hết lịch sử) | — (đặc tả §9.1 cấm) | Biên / vai trò / trạng thái theo phiên (`zoneBoundsAt`, `liveZonesAt`); vùng về sau đổi vai không còn bị loại khỏi setup cũ (trước đây là chọn lọc theo kết quả, làm đẹp backtest). Test phát lại theo tiền tố. |
| B2 | Nến đảo chiều | = pin bar | Đáy thấp hơn nến trước, đóng cửa tăng | Theo sách |
| B3 | Đảo chiều chủ chốt, đuối sức, 3 thanh, 3 nến hồi | Tắt | Có định nghĩa rõ | Bật theo sách (chủ chốt = nhận chìm thân nến trước) |
| B4 | Inside / outside bar | Cho phép cạnh bằng | "Nằm toàn bộ" / "bao toàn bộ" | Nghiêm |
| B5 | Pin bar | Loại thân = 0 (búa doji rất phổ biến với bước giá VN) | Đuôi chiếm phần lớn nến, đuôi kia gần thân | Đuôi ≥ 60% biên độ, đuôi kia ≤ 15%, thân 0 được |
| B6 | Phá cấu trúc | Xu hướng chỉ đổi khi có pivot mới (trễ ≥ 5 phiên) | "Xu hướng tăng bị phá khi giá phá xuống swing low cấu trúc gần nhất" | Đóng cửa phá swing gần nhất → hỗn hợp (`broken`) |
| B7 | Mục tiêu, lời : lỗ | Chỉ mục tiêu, không có cổng | "Không đạt 2:1 hoặc 1.5:1 thì bỏ qua" | `rewardRisk`, cổng ≥ 1,5 |
| B8 | **Khối lượng** | Không dùng | "Volume phải đồng thuận xu hướng"; "breakout thật kèm volume tăng vọt"; nến đuối sức kèm volume | RVOL (nền 20 phiên trước, không gồm phiên đó), tỷ lệ KL phiên tăng/giảm 20 phiên, xác nhận ở phiên kích hoạt |
| B9 | Chỉ một setup (pin tại vùng) | — | Mọi mẫu hình đảo chiều tại vùng + mẫu hình tiếp diễn theo xu hướng | 3 loại setup, mỗi (hướng, nhóm, phiên) một setup |
| B10 | Vòng đời | Setup hết hạn rồi vẫn có thể bị ghi đè "invalidated" | Không lùi trạng thái | Sửa |
| B11 | Vùng hết hạn | Tính từ ngày sinh | — (đặc tả: "không có test") | Từ lần chạm gần nhất; pivot nằm trong lần chạm đã đếm không đếm lại |
| B12 | Xác nhận chỉ khi kích hoạt đúng hôm nay | Setup kích hoạt hôm qua biến mất khỏi giao diện | — | Hiện "vừa kích hoạt n phiên trước" (5 phiên) |
| B13 | Kiểm định sự kiện | Không loại phiên vào mở cửa giá trần | — | Loại (không mua được) |
| B14 | Không có test đơn vị nào cho engine | — | Đặc tả §16 có 18 mục nghiệm thu | 8 test (định nghĩa, khối lượng, phát lại tiền tố, phá cấu trúc, trần) |

## C. Kiểm định lợi thế

Đăng ký trước: `PA-VOL-r1-PREREG.md` (commit 808ef714, phụ lục 1e5297da), engine 086106d4. Kết quả: `02_RESULT.md`.
