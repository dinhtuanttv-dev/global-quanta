# PZ-r2 — Kết quả: "chỉ mua ở Vùng mua" (P2) so với G2r (P0) — **KHÔNG ĐẠT**

**Đăng ký trước:** `backend/src/market/elite/PZ-r2-prereg.md` (commit 607010f, 14/11/2026) · **Harness:** `backend/scripts/pz-r2-backtest.mjs` (6888a42) · **Chạy:** 18/11/2026, một lần duy nhất.
**Giai đoạn kiểm định:** 19/05/2023 → 12/11/2026, 870 phiên lợi suất. Bảng tín hiệu dựng lại bằng `hl-panel-replay.mjs` (engine trùng commit 3b73223 — chỉ khác tài liệu đăng ký), 871/871 phiên có bảng, không tệp hỏng, 272–300 mã mỗi phiên. Giá VNDirect tải 12/11/2026, VN-Index đã sửa (HL-r2 S2). Kết quả thô: `PZ-r2-run.txt`, `PZ-r2-results.json`.

## Kết quả

| | Lợi suất/năm | Sharpe | Sụt giảm lớn nhất | Số mã TB | Tiền mặt TB | Xoay vòng/năm |
|---|---|---|---|---|---|---|
| VN-Index | 15,0% | 0,86 | −18,1% | | | |
| Bình quân đều vũ trụ | 3,5% | 0,28 | −25,1% | | | |
| **P0 (G2r hiện hành)** | **5,1%** | **0,36** | **−25,3%** | 9,2 | 15% | 7,1 |
| **P2 (chỉ mua ở Vùng mua)** | **1,1%** | **0,15** | **−24,8%** | 6,9 | 24% | 6,9 |

## Tiêu chí (mục 5 của bản đăng ký — phải đạt cả năm)

| # | Tiêu chí | Kết quả | |
|---|---|---|---|
| 1 | Sụt giảm của P2 nhỏ hơn P0 ≥ 5 điểm % | cải thiện 0,6 điểm % | ✗ |
| 2 | Lợi suất P2 không thấp hơn P0 quá 3 điểm % | thấp hơn 4,0 điểm % | ✗ |
| 3 | Sharpe P2 ≥ Sharpe P0 | 0,15 < 0,36 | ✗ |
| 4 | t trung vị của chênh lệch 20 phiên > −2 | t = −0,64 (−0,40%/20 phiên) | ✓ |
| 5 | Mỗi nửa giai đoạn: sụt giảm P2 không sâu hơn P0 | −13,6% vs −18,2% · −20,0% vs −25,3% | ✓ |
| — | Ràng buộc tiền mặt bình quân P2 ≤ 60% | 24% | ✓ |

**Kết luận: KHÔNG ĐẠT** (trượt tiêu chí 1, 2, 3). Theo mục 6: cổng `PZ_GATE` **giữ tắt**; Vùng mua PZ-v2 tiếp tục là lớp **chỉ hiển thị**.

## Theo năm

| Năm | P0 | P2 | P2 − P0 | Bình quân đều |
|---|---|---|---|---|
| 2023 (từ 19/05) | −6,3% | +10,0% | +16,3 | +11,3% |
| 2024 | +8,2% | +7,5% | −0,7 | +7,3% |
| 2025 | +25,8% | −7,0% | **−32,8** | +9,5% |
| 2026 (tới 12/11) | −6,7% | −5,5% | +1,2 | −13,7% |

Cổng P2 có giúp ở hai nửa giai đoạn (sụt giảm nông hơn 4–5 điểm %), nhưng mức giảm sụt giảm trên toàn giai đoạn quá nhỏ (0,6 điểm %). Cái giá thì lớn: năm 2025, khi thị trường tăng mạnh, cổng chặn mua các mã đang chạy và mất 32,8 điểm %. Đây là đúng kiểu rủi ro mà PZ-r1 đã gợi ý ("đứng ngoài khi xu hướng mạnh"): trên 2014–2023 cổng trông tốt, trên dữ liệu mới thì không.

## Phát hiện phụ — quan trọng cho danh mục chính thức

Trên đoạn này, **chính G2r (P0) lợi suất 5,1%/năm so với VN-Index 15,0%/năm, Sharpe 0,36 so với 0,86, sụt giảm sâu hơn (−25,3% so với −18,1%)**. Lưu ý: tham số G2r được chọn ở K0 trên 2020–2026, nên đây **không** phải kiểm định ngoài mẫu của G2r và không thay đổi kết luận nào đã đăng ký; nhưng nó nhất quán với HL-r2 (ngoài mẫu 2020–05/2023 −1,07%/20 phiên so với bình quân đều) và K0 ("ngang thị trường"). Phần lớn khoảng cách với VN-Index đến từ vũ trụ: bình quân đều 300 mã chỉ được 3,5%/năm trong khi VN-Index được kéo bởi vài mã vốn hoá rất lớn. Sổ theo dõi tiến của Elite HL vẫn là thước đo quyết định.

## Khác biệt giữa mô phỏng và production (theo mục 6)

Production dựng nền theo SEPA trước, hộp giá HG-v1 sau; mô phỏng chỉ dùng hộp giá (không có lịch sử SEPA theo phiên). Mô phỏng khớp ở đóng cửa D+1, phí 0,20% / 0,25%, chưa tính chi phí tác động (xem tệp 14 thẩm định thanh khoản).

## Không làm

Không đổi `PZ_RULES`, phương án, giai đoạn, tiêu chí; không chạy lại. Không có sửa đổi nào ở mục 8 của bản đăng ký.
