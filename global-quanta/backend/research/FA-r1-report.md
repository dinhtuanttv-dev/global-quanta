# Kết quả FA-r1 — 17/11/2026

Thí nghiệm đăng ký trước (`FA-r1-prereg.md`, commit e07293e) chạy **một lần** trên bảng tín hiệu dựng lại 03/03/2014 → 25/07/2025, giá VNDirect điều chỉnh đầy đủ, vũ trụ 300 mã GTGD cao nhất từng phiên. Chỉ số BCTC tính bằng `buildSummaryRow` của production trên các quý đã công bố tại phiên tín hiệu. Cổng chỉ chặn **mua mới**.

**Kết luận: không phương án nào đạt. G2r giữ nguyên; cảnh báo ở Hồ sơ 360° tiếp tục ở dạng mô tả, không thành cổng loại.**

## Giai đoạn quyết định 03/03/2014 → 31/12/2019 (1.459 phiên)

Mốc: VN-Index (giá) 9,4%/năm, sụt giảm −27,1%; bình quân đều vũ trụ 2,5%/năm, sụt giảm −34,5%.

| Phương án | Lợi suất/năm | Sharpe | Sụt giảm | So với B / 20 phiên (t; p) | DSR | Tiêu chí 1–5 |
|---|---|---|---|---|---|---|
| B · G2r | 16,1% | 1,01 | −30,3% | — | 0,95 | — |
| V1 · lỗ 4 quý | 16,0% | 1,01 | −29,4% | −0,01% (−0,19; 0,85) | 0,94 | ✗ ✗ ✗ ✓ ✗ |
| V2 · Piotroski ≤ 3/9 | 20,4% | 1,25 | −29,3% | +0,30% (1,56; 0,12) | 0,98 | ✗ ✗ ✓ ✓ ✗ |
| V3 · Beneish | 8,6% | 0,59 | −30,1% | −0,52% (−2,32; 0,02) | 0,73 | ✗ ✗ ✗ ✓ ✗ |
| V4 · dồn tích > 10% | 10,1% | 0,68 | −33,4% | −0,43% (−1,73; 0,08) | 0,80 | ✗ ✗ ✗ ✓ ✗ |
| V5 · nowcast âm | 12,6% | 0,83 | −29,5% | −0,24% (−1,31; 0,19) | 0,88 | ✗ ✗ ✗ ✓ ✗ |
| V6 · bất kỳ V1–V4 | 9,6% | 0,65 | −32,8% | −0,49% (−1,85; 0,06) | 0,78 | ✗ ✗ ✗ ✓ ✗ |

Holm cho 6 phép thử: không phương án nào bác được giả thuyết không.

**Chẩn đoán lệnh mua của B** (vượt bình quân đều 20 phiên từ phiên khớp):

| Cổng | Lệnh bị chặn | Vượt TB | Lệnh không chặn | Vượt TB | t Welch |
|---|---|---|---|---|---|
| V1 | 7 | −3,81% | 376 | +0,99% | −1,31 |
| V2 | 47 | −0,81% | 336 | +1,14% | −0,93 |
| V3 | 81 | +2,36% | 302 | +0,51% | +1,24 |
| V4 | 72 | +1,17% | 311 | +0,83% | +0,21 |
| V5 | 51 | +0,25% | 332 | +1,00% | −0,55 |

32/415 lệnh mua không có BCTC trong kho và không bị xét.

## Giai đoạn báo cáo 02/01/2020 → 25/07/2025 (1.388 phiên, không dùng để quyết định)

Mốc: VN-Index 9,0%/năm (−40,3%); bình quân đều 13,3%/năm (−64,8%). B: 5,7%/năm, sụt giảm −54,9%, kém bình quân đều −0,72%/20 phiên (t −1,14).

| Phương án | Lợi suất/năm | Sụt giảm | So với B / 20 phiên (t) |
|---|---|---|---|
| V1 | 5,9% | −58,1% | +0,03% (0,13) |
| V2 | 6,5% | −55,3% | +0,09% (0,44) |
| V3 | 1,8% | −54,2% | −0,26% (−0,75) |
| V4 | 4,4% | −57,8% | −0,08% (−0,27) |
| V5 | 6,1% | −52,3% | +0,05% (0,22) |
| V6 | 0,8% | −62,5% | −0,32% (−0,74) |

## Đọc kết quả

- **Piotroski thấp (V2)** là cổng duy nhất đi đúng chiều ở cả hai giai đoạn (+0,30% và +0,09% mỗi 20 phiên) nhưng không đủ chắc: t 1,56, và chênh lệch theo năm dao động mạnh (−1, +11, +4, −2, +14, 0 điểm). Cần thêm dữ liệu mới, không bật cổng.
- **Beneish (V3) và dồn tích cao (V4) đi ngược giả thuyết:** các lệnh mua dính cờ này lại vượt trội hơn lệnh không dính, và chặn chúng làm danh mục kém đi (V3 −0,52%/20 phiên, t −2,32, p 0,02 — không qua Holm). Cách đọc hợp lý: ở các mã đang có động lượng giá mạnh (tầng 1 của HL), cờ kế toán này hay đi cùng doanh nghiệp tăng trưởng nhanh (phải thu, tồn kho tăng), không phải gian lận.
- **Lỗ 4 quý (V1)** gần như không bao giờ xảy ra ở mã đạt tầng 1 (7/383 lệnh), nên cổng không có tác dụng.
- **Hệ quả cho Hồ sơ 360°:** các cảnh báo vẫn có giá trị để người dùng biết rủi ro kế toán, nhưng phải ghi rõ là **không dự báo được lợi suất** trong danh mục này; riêng Beneish và dồn tích cao không được dùng làm lý do bán hay tránh mua.

## Giới hạn

- Giá trị BCTC là bản mới nhất của VNDirect, không phải bản công bố lần đầu.
- Trước 12/2019 dùng ngày công bố ước tính (+45 / +90 ngày).
- Tầng 3 của HL không có lịch sử.
- Bảng dựng lại dừng ở 25/07/2025.
