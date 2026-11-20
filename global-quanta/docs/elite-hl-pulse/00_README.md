# Nhịp quyết định hôm nay — rà soát và đặc tả hợp nhất "Hôm nay" + "Thay đổi hôm nay"

**Ngày:** 20/11/2026
**Mã nguồn đối chiếu:** `origin/main` **fe188078**. Nhánh đang mở trong worktree `gq-mtf3` (5fbfe5d7) có cây mã trùng khớp với commit này; `git diff --stat 5fbfe5d7 origin/main` rỗng.
**Dữ liệu sống:** Gateway `/api/elite/decision` (phiên 20/11, dựng lúc 08:54:39Z) và `/api/elite/hl-history?days=3`, chụp chiều 20/11.
**Tài liệu đầu vào (không sửa):**
- `docs/ELITE_HL_DECISION_PULSE_SPEC.md`, gọi tắt là **SPEC**;
- `docs/ELITE_HL_DECISION_PULSE_UPGRADE_SPEC.md`, gọi tắt là **UPGRADE**.

## Danh mục tệp

| Tệp | Nội dung |
|---|---|
| [01_DOI_CHIEU.md](01_DOI_CHIEU.md) | Đối chiếu từng nhận định của SPEC và UPGRADE với mã nguồn và dữ liệu sống. Gồm điểm khớp, mâu thuẫn, trùng lặp và dữ liệu chưa xác minh |
| [02_DAC_TA_HOP_NHAT.md](02_DAC_TA_HOP_NHAT.md) | Đặc tả panel **NHỊP QUYẾT ĐỊNH HÔM NAY**: kiến trúc, view-model, ánh xạ trường, trạng thái, UX |
| [03_KIEM_DINH_NGHIEM_THU.md](03_KIEM_DINH_NGHIEM_THU.md) | Kiểm định, tiêu chí nghiệm thu, quy trình bảo toàn mã nguồn (allowlist, review diff, đối chiếu đầu ra trước/sau) và các quyết định cần chốt |

## Phạm vi của lượt này

Lượt này chỉ đọc mã và viết tài liệu. Không sửa mã nguồn, API, cấu hình, test hay dữ liệu.

Allowlist của lượt này chỉ gồm `global-quanta/docs/elite-hl-pulse/**`. Bằng chứng nằm ở cuối tệp 03, mục 6. Bằng chứng được lập bằng cách chụp trạng thái Git trước và sau ở cả hai cây (`global-quanta-react_1` và `gq-mtf3`). Mỗi lần chụp ghi bốn thứ: trạng thái tệp, HEAD, mã băm sha1 của mọi tệp không phải tài liệu đang sửa dở hoặc chưa theo dõi, và mã băm của `git diff`.

## Tóm tắt kết luận

1. Phần lớn nhận định của SPEC và UPGRADE **khớp** với mã nguồn. Sáu điểm "chưa xác minh" thì đã kiểm được bốn bằng dữ liệu sống:
   - **37 so với 28 vị trí giá:** 9 mã còn lại gồm 8 mã NO_SETUP và 1 mã FAILED. Tổng 37 đúng bằng `coverage.tracked`.
   - **Phí ước tính (`costEst`)** tính theo tỷ lệ trên toàn danh mục (NAV), không phải trên phần vốn xoay vòng.
   - **Phạm vi pha loãng** là toàn vũ trụ và gồm cả các đợt đã giao dịch.
   - **Lịch xét** là phiên đầu tiên của tuần ISO chưa bị chốt dữ liệu.
2. Hai bản đặc tả **bỏ sót** ba điểm:
   - Thanh **`CockpitStatusBar`** (buồng lái C1) lặp phiên, giờ khoá, lịch xét, trạng thái chốt dữ liệu, và có cả dòng "Chuyển trạng thái phiên này". Như vậy hiện có **bốn** nơi đọc "hôm nay", không phải hai.
   - **Hai mốc đối chiếu khác nhau:** thay đổi danh mục so với `hl.prevDate`, còn thay đổi vị trí giá so với ảnh chụp PZ trước. Ngày của ảnh chụp PZ trước **không được gửi kèm** (`pz` không có `prevDate`).
   - **Xung đột với cơ chế bảo vệ hiện có:** test vân tay toàn bảng chỉ cho phép *thêm* phần tử. Gỡ `TodayRibbon` và `hl-changes` sẽ làm test vân tay đỏ, nên cần anh duyệt riêng (tệp 03, quyết định P1).
3. Đặc tả hợp nhất (tệp 02) giữ toàn bộ số đang hiển thị và thêm ba thứ còn thiếu, đều lấy từ dữ liệu đã tải nên không gọi API mới:
   - đủ 8 trạng thái vị trí giá cộng độ bao phủ;
   - thay đổi hàng chờ, số tiền mặt và vị trí giá của mã đang giữ so với phiên trước, lấy từ `hl-history`;
   - tách pha loãng "chưa giao dịch" với "đã giao dịch".
