# Bộ não Chu kỳ và Thời điểm Tài chính Định lượng — bộ đặc tả nâng cấp

**Ngày rà soát:** 20/11/2026
**Mã nguồn đối chiếu:** `origin/main` tại **aa346295**, đọc qua worktree `gq-mtf3`. Cây chính `global-quanta-react_1` đang dừng ở dd93fb32 nên không dùng làm mốc.
**Dữ liệu sống đối chiếu:** Project A (`tuan-quant-scanner-psi.vercel.app`) và Gateway (`gateway-production-1da0.up.railway.app`), cùng chụp chiều 20/11/2026.
**Phạm vi:** mọi tính năng Chu kỳ và Thời điểm phục vụ tab QUYẾT ĐỊNH (Elite 10 / Elite HL), Cổ tức và KQKD.
**Loại tài liệu:** chỉ là đặc tả. Bộ này không đổi một dòng mã nguồn, API, cấu hình hay test nào.

## Cam kết bảo toàn

1. Mọi công thức toán học, mô hình phân tích, API và mã nguồn hiện có được giữ nguyên **100%**. Các đề xuất ở đây chỉ **thêm** một lớp chuyển đổi chỉ đọc (adapter thuần) giữa dữ liệu đã có và giao diện. Lớp này không tính lại số nào.
2. **Timeline điểm mua vẫn KHOÁ tuyệt đối.** Ở đây gồm `BuyTimelineTab`, `lib/cotuc/buy-timeline.ts`, Project A `/api/cotuc/buy-timeline` và Gateway `/api/elite/buy-timing`. Mọi đề xuất chỉ đọc đầu ra của các phần này.
3. Không phát sinh tab con mới. Phần hiển thị mới, nếu có, đi dưới dạng lớp bật/tắt trong khung đã có.
4. Nhãn phải trung thực: THĂM DÒ, MÔ TẢ, BỐI CẢNH. Không bao giờ dùng "Mua ngay". Không bịa số, không dùng dữ liệu giả.
5. Mọi giả thuyết mới phải đăng ký trước khi chạy, chỉ chạy một lần và công bố cả khi thất bại.

## Danh mục tệp

| Tệp | Nội dung |
|---|---|
| [01_RA_SOAT_DOI_CHIEU.md](01_RA_SOAT_DOI_CHIEU.md) | Kiểm kê tính năng thật trên aa346295. Đối chiếu từng khẳng định của `ELITE_CYCLE_TIMING_CONSOLIDATION_SPEC.md`. Phần trùng lặp, khác biệt dữ liệu/ý nghĩa, mâu thuẫn, điểm chưa xác minh |
| [02_KIEN_TRUC.md](02_KIEN_TRUC.md) | Kiến trúc đích theo ba tầng: nguồn, bộ chuyển chỉ đọc, hiển thị. Hợp đồng view-model |
| [03_LUONG_DU_LIEU.md](03_LUONG_DU_LIEU.md) | Bản đồ hook → endpoint → nơi dùng. Kết quả đo song song Project A và Gateway |
| [04_TRANG_THAI.md](04_TRANG_THAI.md) | Danh tính sự kiện, các miền trạng thái, bảng quy đổi, quy tắc đối soát ngày |
| [05_UX.md](05_UX.md) | Cách hiển thị trong khung đã có, không thêm tab con |
| [06_KIEM_DINH.md](06_KIEM_DINH.md) | Trạng thái bằng chứng hiện hành và các kiểm định đề xuất (đăng ký trước) |
| [07_NGHIEM_THU.md](07_NGHIEM_THU.md) | Tiêu chí nghiệm thu đo được cho từng giai đoạn |
| [08_LO_TRINH_QUYET_DINH.md](08_LO_TRINH_QUYET_DINH.md) | Lộ trình CT0–CT5 và các quyết định cần anh chốt |

## Quan hệ với tài liệu hiện có

- **`docs/ELITE_CYCLE_TIMING_CONSOLIDATION_SPEC.md`**: tài liệu gốc của đợt này. Bộ này **không sửa** tệp đó. Tệp đó được viết trên cây cũ: 10/25 tệp nó nhắc đã bị xoá khỏi main (chi tiết ở 01 mục 2). Phần định hướng của nó vẫn đúng và được kế thừa: hợp nhất, một sự thật cho mỗi sự kiện, nhãn bằng chứng. Phần kiểm kê thì được thay bằng 01.
- **`docs/elite10-seasonal-timing/`** (25/10): kế hoạch MV0–MV3 cho mùa vụ tháng. Kết quả hiện hành là prereg-v2 KHÔNG ĐẠT, nên mùa vụ tháng chỉ còn là BỐI CẢNH. `CycleEnginePanel`, đối tượng chính của bộ đó, đã bị gỡ (1d710a58).
- **`docs/elite10-timing-chart/TIMING_SIM_CHART_PLAN.md`** (29/10): kế hoạch `TimingSimPanel`. Tính năng này vẫn sống, xem 03.
- **`docs/COTUC_EARNINGS_SEASONALITY.md`**: mô tả Timing Engine v3 trên Project A. Phần lớn còn đúng với `EarningsSeasonalityTab` hiện nay.
- **`docs/elite-hl-cockpit/`** (20/11): buồng lái tab QUYẾT ĐỊNH. Bộ này dùng lại quy ước của buồng lái: lớp `cockpit`, trạng thái chính D1, nhãn chỉ hiển thị.
