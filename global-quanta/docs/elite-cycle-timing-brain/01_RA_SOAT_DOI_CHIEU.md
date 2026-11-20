# 01 — Rà soát và đối chiếu (aa346295, dữ liệu sống 20/11/2026)

Quy ước mức tin cậy:
- **[ĐO]**: đo trực tiếp trên dữ liệu sống.
- **[MÃ]**: đọc trong mã nguồn aa346295.
- **[TL]**: chỉ dựa trên tài liệu.
- **[CHƯA]**: chưa xác minh.

## 1. Kiểm kê tính năng đang sống

### 1.1 Tab Cổ tức (`src/components/MainTabs/CoTuc/cotucNav.ts`) [MÃ]

| Nhóm | Mục | Thành phần | Nguồn dữ liệu |
|---|---|---|---|
| KQKD | Chất lượng | `EarningsQualityPanel` | Gateway `/api/fundamentals/earnings-quality` |
| KQKD | Kết quả kinh doanh | `kqkd/KqkdCenter` | Gateway `/api/fundamentals/kqkd/summary`, `ticker/:t`, `ledger` |
| KQKD | Mùa vụ | `seasonality/SeasonalityView` bọc `EarningsSeasonalityTab` | Project A `/api/cotuc/earnings-cycle-*`, `/annual-earnings-calendar`; Gateway `seasonality/:t` (S7, gói 9 API Project A), `seasonality-x/:t` (S8 THĂM DÒ) |
| KQKD | Lịch công bố | `kqkd/EarningsCalendar` | Gateway `/api/fundamentals/kqkd/calendar` (LC-v1) |
| Cổ tức | Bộ lọc | screener | Gateway corp-events |
| Cổ tức | Lịch sự kiện | `events/EventsCalendar` | Gateway corp-events |
| Cổ tức | Thời điểm | `to/TimingCenter` (TO-v1 Săn cổ tức, thay engine W1–W5) | Gateway `/api/corp-events/to`, `to/sim` |
| Cổ tức | Xếp hạng | `ranking/DecisionRanking` | Project A `/api/cotuc/decision-states` |
| Timeline | (mặc định) | `timeline/TimelineModes`: chế độ cũ `BuyTimelineTab` (**KHOÁ**) và chế độ "announce" `AnnouncementTimeline` | Project A `/api/cotuc/buy-timeline`; Gateway `/api/corp-events/to` |

Hộp chi tiết mã (StockModal) có các thẻ tổng quan / cờ / sự kiện / mùa vụ.

### 1.2 Tab QUYẾT ĐỊNH (Elite HL) [MÃ]

| Thành phần | Hook | Dòng thời điểm |
|---|---|---|
| `TimingSimPanel` (khung "Mã đang chọn") | `useGatewayBuyTimeline` + `useEventStudy` | **Timeline thô** (W1–W5) |
| `HlBuyCalendar` (MP-a), `HlCalendarStrip` | `useEliteTiming` | **Timeline + TO** (`withToRows`) |
| `EliteScreener`, `EvidenceRestored` (BuyTimingNote) | `useEliteTiming` | Timeline + TO |
| `profile/TimelineZonesBlock` (Hồ sơ 360°) | `useEliteTiming` | Timeline + TO |
| Vòng thời điểm của `EliteCommandRadar` | `useEliteTiming` | Timeline + TO |
| Tiêu chí 6 của Radar (`useRadarModel`) | `useGatewayBuyTimeline` | **Timeline thô** |
| `ToTickerCard` | `useToOverview` | TO |
| `DecisionBar` | `useDecisionState` | Project A decision-states |

## 2. Đối chiếu với `ELITE_CYCLE_TIMING_CONSOLIDATION_SPEC.md`

### 2.1 Tệp spec nhắc nhưng đã bị xoá khỏi main [MÃ]

| Tệp spec nhắc | Commit xoá |
|---|---|
| `elite10/ta-vn-index/CycleEnginePanel.tsx`, `useCycleDetail.ts` | 1d710a58 |
| `CycleTimingPanel.tsx`, `DividendTimelinePanel.tsx` | e5e28d8c (BL4–BL6) |
| `CycleRankingPanel.tsx` | 03d2a9be |
| `OptimalTimingTab.tsx`, `useCycleStats.ts`, `useCycleStatsV3.ts` | 376fbf54 (#352, tệp chết) |
| `CalendarTabV3.tsx` | 7aae3a04 |
| `EarningsQuarterPanel.tsx` | a74f962c (K0) |

Spec còn ghi "không tìm thấy `HlWatchPanel` / `QueueDeck`". Trên aa346295, `QueueDeck` **có tồn tại** trong `EliteHlBoard`. Nhận định "không tìm thấy" đến từ cây cũ.

### 2.2 Bảng khẳng định

| # | Khẳng định của spec | Kết luận | Bằng chứng |
|---|---|---|---|
| K1 | Có nhiều nguồn thời điểm song song cho cùng một mã | **KHỚP**, nhưng nguồn khác với spec mô tả | Hai đường Timeline (Project A và Gateway) cộng đường TO, xem mục 3 |
| K2 | Hai đường Timeline cho số khác nhau | **KHỚP MỘT PHẦN** | [ĐO] Cùng 165 dòng, cùng `asOf`, cùng đếm. Chỉ 10 trường khác, đều là `sessionsToEntry` |
| K3 | Lịch Cổ tức và Elite hiển thị cùng một bộ vùng mua | **MÂU THUẪN** | [ĐO] Timeline thô có 26 dòng DIVIDEND, Elite (TO) gần như 0 dòng, xem M1 |
| K4 | Ngày công bố KQKD thống nhất | **MÂU THUẪN** | [ĐO] MSH Q4/2026 lệch 2 ngày, xem M3 |
| K5 | `DecisionBar` hiển thị "xác suất" chưa hiệu chuẩn | **KHỚP** | [MÃ] Nhãn "xác suất tổng hợp", ngưỡng 50%/60%, không có mã hiệu chuẩn nào. [ĐO] 188 trạng thái: AVOID 186, WATCH 2, FAVORABLE 0 |
| K6 | Mùa vụ tháng là tín hiệu | **ĐÃ LỖI THỜI** | prereg-v2 KHÔNG ĐẠT, nên chỉ còn BỐI CẢNH. Thành phần chính đã gỡ |
| K7 | Engine thời điểm cổ tức W1–W5 là nguồn chính cho Cổ tức | **ĐÃ LỖI THỜI** | `TimingCenter` dùng TO-v1. W1–W5 chỉ còn trong Timeline (khoá) |
| K8 | Lộ trình 0–4 của spec | **CẦN SOẠN LẠI** | Nhiều bước nhắm vào tệp đã xoá. Thay bằng lộ trình CT0–CT5 (tệp 08) |

## 3. Trùng lặp

| Mã | Trùng lặp | Ghi chú |
|---|---|---|
| T1 | Timeline vùng mua có **hai đường tính**: Project A `/api/cotuc/buy-timeline` và Gateway `/api/elite/buy-timing` (GATEWAY_STORE, last-good, tính lại phiên theo hôm nay) | [ĐO] Đếm giống hệt. Gateway nhanh hơn: 0,6 s so với 3,1 s |
| T2 | Trong Gateway có **hai chỗ tính `sessionsToEntry`**: `market/cotuc/buyTimelineCore.js:90` (không kẹp) và `market/elite/buyTiming.js:53` (kẹp 0 khi không phải UPCOMING) | [MÃ] Cùng tên trường, khác ngữ nghĩa |
| T3 | Ngày công bố KQKD có **ba nguồn**: Timeline (HISTORICAL_LAG), lịch LC-v1 (Gateway, dải và hạn luật), event-study (Project A, VNDIRECT_BCTC) | Xem M3 |
| T4 | Mùa vụ KQKD có **hai lớp**: S7 (gói 9 API Project A) và S8 (ngày công bố thật, THĂM DÒ) | Khác ngày neo, xem K-B |
| T5 | "Thời điểm cổ tức" có **ba khái niệm**: W1–W5 (Timeline DIVIDEND), TO-v1 (Săn cổ tức), ex-study (EX-r1) | Ý nghĩa khác nhau, xem K-A |

## 4. Khác biệt về dữ liệu và ý nghĩa

- **K-A. "Vùng mua cổ tức"**:
  - W1–W5 là cửa sổ trước GDKHQ từ mùa vụ lịch sử (tier VALIDATED / NEAR).
  - TO-v1 là làn săn cổ tức có quy tắc riêng, tier EXPLORATORY, đang ghi sổ TO-L1 từ 09/11.
  - EX-r1 là kiểm định giá quanh GDKHQ (KHÔNG ĐẠT, giữ ATC).
  - Ba khái niệm này **không thay thế nhau về ý nghĩa**, dù `withToRows` thay W1–W5 bằng TO trên mọi bảng Elite.
- **K-B. "KQKD"** mang ba nghĩa:
  - (1) **cơ bản**: doanh thu, lợi nhuận từ `/api/fundamentals/kqkd`;
  - (2) **ngày công bố**: lịch LC-v1;
  - (3) **phản ứng giá quanh công bố**: earnings-cycle của Project A và S8.
  - Giao diện hiện dùng chung chữ "KQKD" cho cả ba.
- **K-C. `sessionsToEntry`**:
  - Project A: số âm nghĩa là số phiên **đã trôi qua** kể từ khi mở cửa sổ (ví dụ CAT −14, VGR −28, FPT −25).
  - Gateway elite: kẹp về 0.
  - Cùng tên trường, hai nghĩa.
- **K-D. "Xác suất"** của `DecisionBar` / `DecisionRanking` là điểm tổng hợp có ngưỡng, **không phải xác suất đã hiệu chuẩn** (K5). Mặc định trung tính là 0,5 (ví dụ AAA).
- **K-E. Độ tươi**:
  - Project A decision-states làm mới mỗi 60 s, buy-timeline mỗi 10 phút.
  - Gateway buy-timing dùng last-good và tính lại theo phiên hôm nay.
  - Hai khung cạnh nhau có thể mang hai mốc thời gian khác nhau mà không ghi rõ.

## 5. Mâu thuẫn (đã đo)

| Mã | Mâu thuẫn | Bằng chứng [ĐO] 20/11 | Tác động |
|---|---|---|---|
| M1 | Elite thay W1–W5 bằng TO, nhưng TO gần như rỗng | Timeline thô: 26 DIVIDEND (VALIDATED: BMP UPCOMING, VGR PASSED) và 139 EARNINGS (0 VALIDATED). TO-v1: 2 dòng radar, 1 đủ điều kiện, **0 mã trùng** W1–W5 | Lịch vùng mua trên Elite gần như không có cổ tức, trong khi Timeline Cổ tức có 26 dòng |
| M2 | Trong cùng khung "Mã đang chọn": `TimingSimPanel` dùng Timeline thô, `HlBuyCalendar` dùng Timeline + TO | [MÃ] Hai hook khác nhau | Một mã có thể hiện vùng cổ tức ở khối này nhưng không hiện ở khối bên cạnh |
| M3 | Tiêu chí 6 của Radar dùng Timeline thô, vòng Radar dùng TO | [MÃ] `useRadarModel` gọi `useGatewayBuyTimeline`, vòng gọi `useEliteTiming` | BMP có thể qua tiêu chí 6 mà vòng không hiện gì |
| M4 | Ngày KQKD Q4/2026 của MSH | Timeline: 2027-02-01. LC: dự kiến 2027-02-01, dải 01–11/02, hạn riêng lẻ 20/01, hạn hợp nhất 14/02. Event-study: **2027-01-30** | Lệch 2 ngày ngay trong một khung |
| M5 | `sessionsToEntry` | 10/165 dòng khác dấu giữa hai đường | Nhãn "còn N phiên" hoặc "đã qua N phiên" có thể sai |

Ghi nhận thêm về danh mục đang nắm (20/11): không có dòng W1–W5 hay TO nào. Chỉ có dòng EARNINGS NEAR cho MSH (e2), VCP (e1) và HSG (e2).

## 6. Điểm chưa xác minh [CHƯA]

1. ~~Lý do thiết kế khi `withToRows` bỏ hẳn DIVIDEND W1–W5.~~ **Đã xác minh 20/11:** việc bỏ là cố ý. Lý do ghi trong `lib/elite10/toTiming.ts`: làn này neo GDKHQ ước tính và không có lợi thế ngoài mẫu.
2. Ngày "dự kiến" của LC-v1 và ngày event-study có dùng cùng quy tắc lùi ngày nghỉ không? Chưa đọc hết mã Project A.
3. Event-study MSH ra 30/01 (thứ Bảy): đó là ngày lịch hay ngày giao dịch đã lùi?
4. Độ phủ S8 trên toàn vũ trụ. Cổng CafeF đạt 98,0% theo bộ nhớ dự án, chưa đo lại hôm nay.
5. Có màn hình nào khác còn đọc `sessionsToEntry` âm của Project A không? Mới kiểm `BuyTimelineTab`.
6. Hai ngưỡng 50%/60% của DecisionBar có từng được kiểm định không? Không thấy prereg nào.
7. Sổ TO-L1 và sổ bóng ELITE-TO chưa tới mốc chấm (dự kiến 02–03/2027).
