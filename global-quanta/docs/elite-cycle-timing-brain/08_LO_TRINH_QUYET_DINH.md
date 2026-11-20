# 08 — Lộ trình và quyết định

## 1. Lộ trình (thay lộ trình 0–4 của spec gốc)

| Giai đoạn | Nội dung | Đụng gì | Rủi ro |
|---|---|---|---|
| **CT0** | Script đối chiếu chỉ đọc `scripts/parity/timing-brain.mjs`: hai đường Timeline, làn W và TO, ba nguồn ngày KQKD. In ra báo cáo, không ghi dữ liệu | 1 tệp script mới | Không |
| **CT1** | `lib/timing-brain/*` (02 mục 2) + test với fixture thật 20/11 | Chỉ tệp mới | Không. Chưa có giao diện nào dùng |
| **CT2** | Nhãn phiên (04 mục 3) và chip lệch ngày (04 mục 4) trong khối đã có, sau lớp "Thời điểm hợp nhất" | Thêm điểm gắn lớp | Thấp |
| **CT3** | Tách làn DIV_W / DIV_TO trên `HlBuyCalendar`, `HlCalendarStrip`, `TimelineZonesBlock`. Radar tiêu chí 6 và vòng đọc cùng làn | Điểm gắn lớp. **Không** đổi `useEliteTiming` / `withToRows` | Trung bình: thay đổi thứ người dùng nhìn thấy |
| **CT4** | Đổi chữ: `DecisionBar` "điểm tổng hợp (chưa hiệu chuẩn)", tiêu đề nghĩa ở `SeasonalityView`, chú thích ở `TimelineModes` | Chỉ chuỗi chữ | Thấp |
| **CT5** | (Tuỳ chọn) prereg CT-r1. CT-r2 chờ mốc 02–03/2027 | Tài liệu prereg + script nghiên cứu | Không đổi sản phẩm |

Mỗi giai đoạn đi một PR riêng. Merge cần câu "cho phép merge #N". CT0–CT4 **không đụng backend**, nên không cần `railway up`.

## 2. Quyết định cần anh chốt

| Mã | Câu hỏi | Đề xuất của em |
|---|---|---|
| **Q1** | Trên Elite, cổ tức hiện **cả** W1–W5 và TO (tách làn), hay **chỉ** TO như hiện nay? | Hiện cả hai, tách làn có nhãn. Hôm nay TO gần như rỗng (1 dòng đủ điều kiện), nên chỉ TO thì lịch cổ tức Elite trống |
| **Q2** | Tiêu chí 6 của Radar theo làn nào? | Giữ nguyên điểm như hiện nay (Timeline thô). Chỉ cho vòng **hiện thêm** làn DIV_W để khớp. Đổi điểm thì cần prereg |
| **Q3** | Thứ tự ưu tiên ngày công bố KQKD (04 mục 4) | S8 thật > LC dự kiến > Timeline > event-study |
| **Q4** | Đổi nhãn "xác suất tổng hợp" ở `DecisionBar` / `DecisionRanking`? | Đổi, chỉ chữ. Số giữ nguyên |
| **Q5** | Thêm chú thích ở `TimelineModes`, bên ngoài phần KHOÁ? | Có, một dòng |
| **Q6** | Làm CT5 (CT-r1) không? | Để sau CT3. Không cần cho sản phẩm |

## 2b. Quyết định đã chốt (20/11/2026)

Anh duyệt cả 6 đề xuất. Q1: phía Elite hiện **cả hai** làn cổ tức, tách làn có nhãn. Q6: CT5 để sau CT3.

| Mã | Đã chốt |
|---|---|
| Q1 | Hai làn: W1–W5 (**MÔ TẢ**) và TO-v1 (THĂM DÒ) |
| Q2 | Điểm tiêu chí 6 giữ nguyên. Radar thêm vòng phụ đứt nét cho làn W |
| Q3 | Thứ tự ngày: đã công bố > LC-v1 > Timeline > nghiên cứu sự kiện |
| Q4 | "xác suất tổng hợp" đổi thành "điểm tổng hợp (chưa hiệu chuẩn)". Số giữ nguyên |
| Q5 | Thêm một dòng chú thích ở `TimelineModes`, bên ngoài phần khoá |
| Q6 | CT5 hoãn |

## 2c. Trạng thái triển khai (20/11/2026, nhánh `feat/timing-brain-ct0-ct1`)

| Giai đoạn | Đã làm | Kiểm |
|---|---|---|
| CT0 | `scripts/parity/timing-brain.mjs` (chỉ đọc) | Chạy sống 20/11: 165/165 dòng, 0 trường lệch, 10 lệch `sessionsToEntry` |
| CT1 | `src/lib/timing-brain/` gồm lanes, sessions, dates, model. Fixture thật `timing-2026-11-20.json` | 8 test KT1–KT5 |
| CT2 | Nhãn phiên bổ sung (`sessionExtra`). Cảnh báo lệch ngày ở `TimingSimPanel` và `HlCalendarStrip` | E2E: MSH "lệch 2 ngày" hiện ở 1440 và 390 |
| CT3 | Hook `useTimingBrain` cùng cache với `useEliteTiming` (trường mới `rawRows`, chỉ thêm). Hai làn trên `HlBuyCalendar`, `HlCalendarStrip`, `TimelineZonesBlock`. Vòng phụ W trên Radar. Lớp `timing` "Thời điểm hợp nhất", mặc định bật | Test `TimingBrainLayers`. Vân tay bảng giữ nguyên. E2E: bật và tắt lớp đều 43 request Gateway, 2 request Project A |
| CT4 | Nhãn `DecisionBar` / `DecisionRanking`. Dòng nghĩa ở `SeasonalityView`. Chú thích ở `TimelineModes` | — |

Nguyên tắc khi triển khai:
- Mọi phần mới mang `data-hl-layer="timing"` và chỉ hiện khi lớp bật **và** đã có dòng gốc. Thiếu dữ liệu thì giao diện giữ nguyên như cũ.
- Không đổi: chọn mã, `withToRows`, bộ lọc Elite (`buyZone`), tiêu chí 6, thông báo Radar, `BuyTimelineTab`, `lib/cotuc/buy-timeline.ts`, mọi backend và API.

**Phát hiện thêm khi triển khai:**
- Việc bỏ làn W1–W5 ngày 07/11 là **cố ý**. `lib/elite10/toTiming.ts` ghi lý do: làn này neo GDKHQ ước tính và không có lợi thế ngoài mẫu. Điều này trả lời điểm chưa xác minh số 1 ở tệp 01. Vì vậy làn W chỉ được hiện với nhãn MÔ TẢ.
- HSG KQKD Q4/2026 cũng lệch 2 ngày: Timeline ghi 01/02/2027, nghiên cứu sự kiện ghi 30/01/2027. Ngày **30/01/2027 là thứ Bảy**, nghĩa là nghiên cứu sự kiện đưa ra ngày không giao dịch. Điểm chưa xác minh số 3 vì thế nghiêng về giả thuyết "ngày lịch chưa lùi về phiên". Mô phỏng vẫn giữ số gốc.
- Phía Elite chỉ có Gateway, mà Gateway kẹp số phiên về 0, nên không có "số phiên đã trôi qua". Giao diện hiện "đang mở từ dd/mm" và "đã qua · thoát dd/mm" thay cho số phiên. NT-C2a vì vậy được điều chỉnh: thay "VGR đã mở 28 phiên" bằng "không còn số phiên âm; ngày mở và ngày thoát hiện rõ".

## 3. Việc không làm

- Không gộp, xoá hay sửa engine nào. Không đổi API. Không đổi `BuyTimelineTab`.
- Không đưa tầng 2 vào điểm Elite.
- Không khôi phục các tệp đã xoá (01 mục 2.1). Chức năng của chúng đã có chỗ khác hoặc đã KHÔNG ĐẠT.
