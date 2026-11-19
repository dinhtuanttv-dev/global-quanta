# X6-F — Kiểm định tiến chiều tác động engine Chất xúc tác (đăng ký trước 19/11/2026)

Thuộc họ `IMPACT-FAMILY.md`. Đây là phần tiếp theo đã hứa trong `catalystValidation/X6-results.md`. **Giao thức X6 giữ nguyên văn**: `catalystValidation/eventStudy.js`, `PREREG`, `runEventStudy`. Tệp này chỉ cố định dữ liệu, mốc chấm và phần bổ sung.

## Dữ liệu
- Sổ tín hiệu Gateway `catkv/ledger`, các bản ghi có `scannedAt` ≥ 2026-10-17. Thực tế sổ Gateway bắt đầu từ 2026-10-30.
- Kết quả chấm `catkv/ledger-eval` do tác vụ I0-G1 tính theo đúng `abnormalReturns` của X6.
- Ngữ cảnh `catkv/ledger-context` (loại sự kiện, mức độ, số nguồn): chỉ dùng cho phân tích phụ.
- **Sổ bịt mắt:** trước lần chấm, chỉ được xem số đếm tiến độ (`GET /api/catalysts/ledger/progress`), không xem lợi suất.

## Mốc chấm
- **Lần chấm sơ bộ:** khi `matured20 ≥ 30` (ước tính khoảng 01–05/12/2026, theo `estimatedReadyOn`). Phán quyết theo X6: `runEventStudy` → PASS / FAIL / INSUFFICIENT_SAMPLE.
- **Lần chấm vững:** khi số cụm `sourceId` có SAR(20) ≥ 150.
- Hai lần chấm là **hai lần công bố khác nhau**. Lần sơ bộ không làm thay đổi tiêu chí của lần vững.

## ĐẠT
- **Sơ bộ:** đúng X6, tức n ≥ 30 tín hiệu đủ 20 phiên **và** cận dưới KTC95 bootstrap theo cụm của trung bình SAR(20) > 0.
- **Vững (bổ sung, cố định từ hôm nay):** n cụm ≥ 150 **và** cận dưới KTC95 > 0 **và** trung bình SAR(20) > 0,45%.
- p chính cho Holm = p bootstrap một phía của trung bình SAR(20) tại lần chấm vững. Trước lần chấm vững, X6-F được tính p = 1 trong Holm.

## Phân tích phụ (đã đăng ký, không quyết định)
- Theo `category` (earnings, insider, contract, regulatory…), theo chiều (benefit / harm), theo `corroborationCount` ≥ 2.
- **Phân rã thời điểm (P4):** với tín hiệu có `firstSeenAt` trong phiên, tách lợi suất phiên 0 thành trước và sau `scannedAt`, bằng giá phút nếu Gateway còn giữ.

## Nhãn hiển thị
- Trước lần chấm: "ĐANG TÍCH LUỸ n/30".
- Sau lần chấm sơ bộ: PASS → "THĂM DÒ (đạt sơ bộ)"; FAIL → "KHÔNG ĐẠT".
- Chỉ lần chấm vững + Holm mới cho nhãn "ĐẠT".
