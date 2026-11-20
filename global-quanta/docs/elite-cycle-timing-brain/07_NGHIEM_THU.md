# 07 — Tiêu chí nghiệm thu

Mọi tiêu chí đo được, chạy trên dinhtuan-ck. Test và build phải xanh trước khi commit.

## Chung (mọi giai đoạn)

| Mã | Tiêu chí |
|---|---|
| NT-0a | `git diff` không đụng: `BuyTimelineTab`, `lib/cotuc/buy-timeline.ts`, mọi `backend/src/**` engine, mọi route, `vercel.json`, `railway.*`, tệp cấu hình |
| NT-0b | `scripts/guard/additive-diff.mjs` xanh: chỉ thêm, không xoá dòng ở tệp được bảo vệ |
| NT-0c | Hai test vân tay `EliteHlBoard.*fingerprint*` xanh khi tắt lớp mới |
| NT-0d | Không phát sinh tab con. Số mục trong `cotucNav.ts` và số tab QUYẾT ĐỊNH giữ nguyên |
| NT-0e | Không thêm request mạng: đếm request lúc mở tab QUYẾT ĐỊNH trước và sau phải bằng nhau (± 0) |
| NT-0f | Nhãn: quét DOM không có "mua ngay", "chắc thắng", "tối ưu" |

## Theo giai đoạn

| Giai đoạn | Mã | Tiêu chí đạt |
|---|---|---|
| CT0 | NT-C0 | Có báo cáo đối chiếu (script đọc, không ghi) cho ra đúng các số ở 03 mục 2. Chạy lại lần hai, các số khớp hoặc khác có giải thích |
| CT1 | NT-C1a | `buildTimingBrain` qua KT1–KT5 trên fixture thật 20/11 |
| CT1 | NT-C1b | Thời gian dựng VM dưới 5 ms cho 500 dòng (vitest, đo trung vị 20 lần) |
| CT2 | NT-C2a | Không còn số âm phiên nào trên màn hình. VGR hiện "đã mở 28 phiên" (theo PA 20/11) |
| CT2 | NT-C2b | Chip ⚠ hiện ở MSH Q4/2026 trên LC, Hồ sơ 360° và khung "Mã đang chọn". Ở mã có ba nguồn trùng ngày thì không hiện |
| CT3 | NT-C3a | `HlBuyCalendar` hiện đủ 26 dòng DIV_W (ngày 20/11) và 2 dòng DIV_TO, có nhãn riêng |
| CT3 | NT-C3b | Radar: với mọi mã, tiêu chí 6 qua thì vòng có vùng (KT6, E2E trên toàn danh sách) |
| CT3 | NT-C3c | Khung "Mã đang chọn": ba khối cùng `key` và cùng ngày (KT6) |
| CT4 | NT-C4 | Nhãn `DecisionBar` và tiêu đề `SeasonalityView` đúng như văn bản đã duyệt. Số không đổi (so ảnh chụp số trước và sau) |
| CT5 | NT-C5 | Nếu chạy CT-r1/CT-r2: có tệp prereg commit **trước** lần chạy. Có kết quả công bố, kể cả khi KHÔNG ĐẠT |

## Bằng chứng nộp kèm mỗi PR

1. Đầu ra test.
2. Ảnh chụp dinhtuan-ck có và không có lớp.
3. Bảng đếm request.
4. `git diff --stat` chứng minh chỉ thêm tệp mới và các điểm gắn lớp.
