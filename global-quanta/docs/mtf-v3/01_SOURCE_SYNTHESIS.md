# MTF v3 — Tổng hợp tri thức từ bộ tài liệu (S0, 30/10/2026)

Nguồn: `C:\Users\HP\cấu trúc thị trương` — 932 ảnh (lọc trùng bằng dHash ≤ 12 bit còn **341 ảnh khác nhau**, đã xem hết),
sách *Giao dịch như một phù thủy chứng khoán* (Minervini, bản scan 382 trang — đã đọc chương 3, 5, 10), tài liệu
*Lý thuyết sóng Elliott* (43 trang, có chữ), bản Python `mtf_market_structure.py` (nền của v2).

**Phạm vi do anh chốt:** ảnh chỉ dùng để hiểu ngữ cảnh / khái niệm; **bỏ toàn bộ tính toán khung 1 giờ**; mọi thứ tính và kiểm
định trên khung **Ngày (D) · Tuần (W) · Tháng (M)**. Bộ MA: **EMA21 · EMA50 · EMA100 · MA200** (SMA) cho MTF, biểu đồ và bộ lọc
VN-Index; SEPA giữ MA50/150/200 (định nghĩa gốc Minervini, đã kiểm định). MA200 tuần để trống khi chưa đủ 200 tuần.

## 1. Ánh xạ khung thời gian
Bộ ảnh (いろは / khoá học "chân trên – chân dưới") dạy trên ngoại hối 24 giờ: **chân trên = 4 giờ, chân dưới = 1 giờ, bối cảnh =
ngày / tuần**. Cổ phiếu VN ≈ 5 nến 1 giờ / phiên nên tỷ lệ thời gian khác hẳn; v3 giữ **ý tưởng lồng khung**, đổi bậc:

| Vai trò trong tài liệu | v3 (cổ phiếu VN) |
|---|---|
| "Thanh trên cùng" / bối cảnh dài hạn (ngày, tuần) | **Tháng (M)** — chỉ bối cảnh, không vào lệnh |
| "Chân trên" (4 giờ, MA80 = 20MA 4H) | **Tuần (W)** — xu hướng chủ đạo, vùng cản lớn |
| "Chân dưới" (1 giờ, MA20) | **Ngày (D)** — khung vào lệnh, cấu trúc Dow vào/ra |

## 2. Khái niệm → tính năng (tất cả point-in-time, chỉ dùng nến đã đóng)
| # | Khái niệm (ảnh / sách) | Hiện thực v3 |
|---|---|---|
| K1 | Dow: đỉnh/đáy cao dần = tăng; **押し安値** (đáy được bảo vệ) / **戻り高値** (đỉnh hồi) | Máy trạng thái Dow trên sóng đã xác nhận, lưu "đáy bảo vệ" (đáy đã tạo ra đỉnh cao mới) và "đỉnh hồi" |
| K2 | **3 tiêu chí gãy / đảo xu hướng** (ảnh 324, 325, 338): ① đỉnh thấp hơn = suy yếu; ② thủng đáy bảo vệ = xu hướng tăng gãy; ③ cả hai = đảo chiều xác nhận | `trendState ∈ {UP, UP_WEAK, BROKEN, DOWN, …}` + sự kiện CHoCH (đổi tính chất) / BOS (phá cấu trúc thuận chiều) |
| K3 | "Điểm mà xu hướng **chân dưới** đổi theo hướng **chân trên**" = điểm vào duy nhất của tác giả (ảnh 176, 212, 235, 237) | Kích hoạt **L/S**: W thuận chiều + D vừa đổi cấu trúc cùng chiều (đáy cao hơn + đóng cửa vượt đỉnh hồi D) |
| K4 | Vùng **"喧嘩中" — giữa hai MA** của chân trên: giá trong dải MA = hai phe giằng co (ảnh 195, 231, 316) | "Vùng giằng co" = giá trong dải EMA21–EMA50 (D) / EMA21w–EMA50w (W); vào lệnh khi giá **bật ra khỏi dải** theo hướng W |
| K5 | **収束 → 拡散** (hội tụ rồi mở rộng) lồng nhau tuần → ngày → … = "điểm sắt" ưu thế cao nhất (ảnh 288, 307, 319) | Độ rộng dải MA chuẩn hoá ATR + phân vị 120 nến; sự kiện "nén → mở rộng" theo hướng xếp lớp; cộng điểm khi W cũng mở rộng cùng chiều |
| K6 | **乖離** (giá / MA chân dưới lệch xa MA chân trên) → giá có xu hướng **lấp khoảng lệch**; không vào lệnh tại điểm phân kỳ (ảnh 182, 183, 271, 279, 314) | `dev = (close − EMA50)/ATR`, `gapFast = (EMA21 − EMA100)/ATR`; cờ **Quá đà** = cấm vào mới; mục tiêu "lấp khoảng lệch" về EMA của khung trên |
| K7 | **Chuyển đổi hỗ trợ ↔ kháng cự** (レジサポ転換, ảnh 266, 336); đường "ai cũng thấy" (ảnh 207, 318) mạnh nhất ở **khung lớn** | Mức giá ngang = cụm đỉnh/đáy sóng (KDE theo ATR) + số lần chạm + vai trò đã đổi; trọng số M > W > D |
| K8 | **Không vào lệnh ngay dưới kháng cự khung lớn**, không khi MA đã mở rộng hết, không theo hướng làm khoảng lệch lớn thêm (ảnh 313, 314, 321, 339) | Bộ **cổng cấm vào**: cản W/M trong 1 ATR (D) phía trên; Quá đà; dải MA ở phân vị ≥ 90 (đã "tiêu hết") ; ngược W |
| K9 | **Tập trung lệnh**: chốt lời, cắt lỗ dồn quanh mức rõ ràng → giá phản ứng (ảnh 205, 223, 278, 280) | Mức giá rõ = mức có ≥ 2 lần chạm; vùng "săn dừng lỗ" ngay dưới đáy rõ ràng (Minervini: *rũ bỏ / undercut*) |
| K10 | **R:R ≥ 2**, cắt lỗ theo mức kỹ thuật (không cố định điểm), mục tiêu ở kênh / mức khung lớn, chốt từng phần, **nâng dừng lỗ theo đáy Dow** (ảnh 286, 303, 315, 332) | Cắt lỗ = dưới đáy bảo vệ D − 0,25 ATR; mục tiêu 1 = mức cản W gần nhất, mục tiêu 2 = kênh / 2R; cổng R:R ≥ 2; dừng lỗ kéo theo đáy Dow mới |
| K11 | Vào muộn = thua (ảnh 200, 210, 229): người giỏi vào **lúc chân dưới vừa đổi hướng**, người kém vào khi giá đã chạy | Tuổi tín hiệu (số nến từ CHoCH D); "Quá muộn" khi > 1,5 ATR từ điểm kích hoạt |
| K12 | Mẫu W / M / vai-đầu-vai (Sanzon) / tam giác **không đủ** nếu ngược khung lớn (ảnh 167, 340) | Mẫu hình chỉ là thành phần, luôn đi kèm bối cảnh W/M; không có tín hiệu "phá cổ" đơn lẻ |
| K13 | Elliott lồng khung: **bắt sóng 3 của chân trên bằng sóng 3 của chân dưới** (ảnh 291, 298, 309, 311) | Engine Elliott Pro v3 sẵn có trên W và D; quan hệ lồng sóng; vùng hợp lưu sóng 2/4 (Fib 0,382–0,618) ∩ dải EMA50–EMA100 |
| K14 | Minervini **4 giai đoạn** (Weinstein): 1 nền đi ngang quanh MA200 phẳng; 2 tăng (MA200 dốc lên, xếp lớp, KL tăng phiên tăng); 3 phân phối (biến động lớn, phiên giảm KL lớn, MA200 phẳng); 4 giảm | Máy giai đoạn S1–S4 trên D (MA200/EMA100) có xác nhận ở W (MA40w tương đương ≈ EMA50w/MA200 D), dùng khối lượng tăng/giảm |
| K15 | **Trend Template** (8 tiêu chí; v3 thay MA150 bằng EMA100, giữ MA200, 52 tuần +30% / −25%) | Điểm Trend Template 0–8 (RS = sức mạnh giá 6–12 tháng so với vũ trụ) |
| K16 | **Đếm nền** trong giai đoạn 2: nền 1–2 tốt nhất, nền 3 được, nền 4–5 dễ thất bại | `baseCount` từ đầu giai đoạn 2 |
| K17 | **VCP**: 2–6 lần thu hẹp, mỗi lần ≈ ½ lần trước; khối lượng cạn bên phải; pivot = cản yếu nhất; phá pivot với KL lớn; nền 3–65 tuần, sâu 10–35% (> 60% = hỏng); dấu chân "40W 31/3 4T" | Bộ phát hiện VCP: các nhịp co T1>T2>T3…, độ sâu %, độ rộng tuần, KL cạn (KL 10 phiên cuối / TB50), pivot, phá vỡ KL ≥ 1,4× TB50 |
| K18 | **Nén thời gian / chữ V** — nền quá ngắn, không cân xứng → tránh | Loại nền < 3 tuần hoặc phần phải hồi > 80% trong < ¼ thời gian nền |
| K19 | **Rũ bỏ (shakeout / undercut)** trong nền + **cú bật giá KL lớn / khoảng trống** = dấu hiệu tổ chức gom | Đếm undercut (thủng đáy trước rồi đóng cửa lại trên trong ≤ 3 phiên); ngày tăng KL ≥ 2× TB50 trong nền |
| K20 | Phiên/tuần **giảm mạnh nhất KL lớn nhất** kể từ đầu giai đoạn 2 = cảnh báo giai đoạn 3/4 | Cờ "phân phối": nến giảm lớn nhất + KL lớn nhất 52 tuần |
| K21 | Elliott (tài liệu VN): 4 quy tắc (sóng 2 < 100% sóng 1; sóng 4 không vượt gốc sóng 3; sóng 4 không chồng sóng 1 — trừ tam giác chéo; sóng 3 **không ngắn nhất** — tài liệu ghi "luôn dài nhất" là chưa chuẩn); Fib 0,382–0,618 cho sóng 2/4, sóng 3 ≈ 1,618, C ≈ A hoặc 1,618A; kênh giá | Dùng engine Elliott Pro v3 (đã có quy tắc đúng, tam giác chéo, nhiều cách đếm, walk-forward PASS nhỏ); v3 chỉ ghép, không viết lại |

## 3. Những gì KHÔNG đưa vào (có lý do)
- Mọi điểm vào khung 1 giờ / 15 phút, quản lý vốn ngoại hối (lot, pip) — ngoài phạm vi D/W/M.
- "Mua khi về MA" như một tín hiệu độc lập: kiểm định v2 cho thấy giai đoạn B (về MA chậm) **âm** ngoài mẫu (−0,96%/20 phiên)
  và cờ Quá đà **dương** (+0,79%) → ở cổ phiếu VN đà tăng tiếp diễn mạnh hơn. v3 chỉ dùng "về dải MA" khi đi kèm **đổi cấu trúc
  Dow D cùng chiều W** (K3), và kiểm định lại riêng (H2).
- Câu "sóng 3 luôn dài nhất" (tài liệu Elliott VN) — dùng quy tắc chuẩn "không ngắn nhất".

## 4. Giữ lại từ MTF v2 (hữu ích)
Dải thời gian giai đoạn, bảng kiểm, R:R tại giá hiện tại, kịch bản tăng/giảm, chú thích tiếng Việt ghim vào nến, vùng hỗ trợ/kháng
cự KDE, xác suất chuyển giai đoạn HMM (thành phần duy nhất PASS), các cột ở bảng bộ lọc, tín hiệu bậc C cho Elite 10,
sổ theo dõi đà tăng M1 (đang chạy tới ~05/2027), chế độ phát lại, lớp biểu đồ mặc định TẮT và ghim theo nến.
