# FA-r1 — đăng ký trước: cổng loại theo chất lượng doanh nghiệp cho Elite HL

**Ngày đăng ký:** 17/11/2026 · **Trạng thái:** viết và commit TRƯỚC khi chạy bất kỳ mô phỏng nào có cổng loại cơ bản.
**Căn cứ:** pha C của bản thẩm định `Ho-so-360-v2/12_THAM_DINH_MASTER_SPEC_360_FA.md`, chủ dự án duyệt ngày 17/11/2026.

## 1. Câu hỏi

Chặn **mua mới** các mã có tín hiệu xấu về chất lượng doanh nghiệp có làm danh mục Elite HL (G2r) tốt hơn một cách đáng tin không?

Thông tin dùng là các chỉ số đang hiển thị ở Hồ sơ 360° (PFA-v1) và cảnh báo pha B. Thí nghiệm này quyết định có được biến cảnh báo thành cổng loại hay không.

## 2. Dữ liệu

- **Bảng tín hiệu và giá:** như HL-r2 (bảng dựng lại bằng `hl-panel-replay.mjs`, giá VNDirect điều chỉnh đầy đủ, vũ trụ 300 mã GTGD cao nhất từng phiên, gồm mã đã huỷ niêm yết; VN-Index đã sửa lỗi nhân 100 theo sửa đổi S2 của HL-r2).
- **BCTC quý:** kho VNDirect đã tải ngày 12/11/2026 (`gq-research/pit-2026-11-12/statements`, 712 mã), cùng định dạng kho KQKD của Gateway.
- **Chỉ số:** tính bằng đúng hàm production `buildSummaryRow` (`fundamentals/kqkdEngine.js`) trên các quý **đã công bố tại phiên tín hiệu**.

**Ngày công bố dùng cho từng quý (cố định trước khi chạy):**

- Nếu `created` của VNDirect nằm trong (cuối quý, cuối quý + 120 ngày] **và** từ 01/12/2019 trở đi: ngày sau `created`.
- Ngược lại (trước 12/2019 `created` là ngày nhập liệu hàng loạt, không phải ngày công bố): cuối quý + 45 ngày cho quý 1–3, cuối quý + 90 ngày cho quý 4.
- BCTC năm (dùng cho cờ lệch kiểm toán): cuối năm + 90 ngày.

**Giới hạn đã biết:**

- Giá trị BCTC là bản mới nhất của VNDirect, không phải bản công bố lần đầu — số đã sửa đổi (đặc biệt quý 4 sau kiểm toán) có thể rò thông tin nhẹ. Không khắc phục được trong đợt này.
- Mã không có BCTC trong kho hoặc chưa đủ quý để tính chỉ số: **không bị chặn** (coi như không có cảnh báo). Tỷ lệ lệnh mua được đánh giá sẽ được báo cáo.
- Tầng 3 của HL không có lịch sử (= 0), như HL-r2.

**Giai đoạn:**

- QUYẾT ĐỊNH: 03/03/2014 → 31/12/2019. Chưa từng dùng để thử bất kỳ cổng cơ bản nào cho HL.
- BÁO CÁO: 02/01/2020 → 25/07/2025 (hết bảng dựng lại). Chỉ báo cáo, không dùng để quyết định.

## 3. Mô phỏng

Giống hệt HL-r2: gọi `buildHlPortfolio` của production với `HL_PF` mặc định; tín hiệu ở đóng cửa D, khớp đóng cửa D+1; phí mua 0,20% / bán 0,25%; mã tăng sát trần không mua được; mã giảm sát sàn không bán được.

**Cổng loại chỉ chặn MUA MỚI.** Mã đang giữ tiếp tục theo quy tắc ra G2r, không bị bán vì cổng. Mã bị chặn được đánh dấu không giao dịch được ở phiên đó, nên ô trống chuyển cho mã hợp lưu kế tiếp hoặc giữ tiền mặt.

## 4. Phương án (cố định, 6 phép thử)

Ngưỡng trùng với cảnh báo pha B đang hiển thị ở Hồ sơ 360°. Tổ chức tài chính (mẫu bank / sec / ins) không bị V2–V4 chặn.

| Mã | Chặn mua mới khi |
|---|---|
| B | (không chặn — G2r, đối chứng) |
| V1 | LNST công ty mẹ 4 quý gần nhất < 0 |
| V2 | Piotroski ≤ 3 trên 9 (cần ≥ 7 phép thử có dữ liệu) |
| V3 | Beneish M > −1,78 |
| V4 | Dồn tích (LNST − CFO) / tài sản > 10% |
| V5 | Nowcast LNST quý tới thấp hơn cùng kỳ (tăng trưởng < 0) |
| V6 | Bất kỳ điều kiện nào của V1–V4 |

Không thêm, không bớt, không đổi ngưỡng sau khi thấy kết quả.

## 5. Tiêu chí

Một phương án thay G2r khi đạt **cả năm** điều kiện trên giai đoạn quyết định:

1. Vượt B sau phí > 0 trên chuỗi chênh lệch 20 phiên không chồng lấn, t trung vị qua 20 pha ≥ 2.
2. Giá trị p của điều kiện 1 vẫn < 0,05 sau hiệu chỉnh Holm cho 6 phép thử.
3. Deflated Sharpe ≥ 0,95 với số phép thử = 7 (B và V1–V6).
4. Sụt giảm lớn nhất không sâu hơn B quá 5 điểm %.
5. Chênh lệch theo năm dương ở ít nhất 5 trên 6 năm (2014–2019).

**Chẩn đoán (mô tả, không quyết định):** với mỗi cổng, lợi suất vượt bình quân đều 20 phiên của các lệnh mua bị chặn so với các lệnh không bị chặn (trên danh sách lệnh của B), kèm t Welch.

Không phương án nào đạt → giữ G2r, cảnh báo tiếp tục ở dạng mô tả. Công bố đầy đủ kể cả khi không đạt.

## 6. Điều không được làm

- Không chạy trước khi tệp này được commit và đẩy lên.
- Không đổi phương án, ngưỡng, quy tắc ngày công bố hay giai đoạn sau khi chạy.
- Chạy lại chỉ khi phát hiện lỗi dữ liệu / mã, và phải ghi mục sửa đổi vào tệp này trước khi chạy lại.
