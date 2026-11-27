# 03 — Tín hiệu E2 trong Hồ sơ 360° (góc "Tín hiệu")

## 1. Danh sách 25 tín hiệu sau #406 (số đo EV-4 ngày 27/11/2026)

| Tab nguồn | Tín hiệu | Bậc | Đơn vị | SQS | Xu hướng (EV-4) | Đã đo / kỳ vọng |
|---|---|---|---|---|---|---|
| Kết nối thế giới | `ws_sector_alpha` α ngắn hạn ngành (WS-v1) | A | đcb/phiên | 44 | Trung tính | 23/23 |
| Siêu quét AI | `stealth20` Stealth 20 | A | z | 96 | **Đã chứng minh** | 229/248 |
| Siêu quét AI | `stealth5` Stealth 5 | A | z | 76 | **Suy giảm** | 244/248 |
| Siêu quét AI | `net_intent` Ý đồ IFE | C | xác suất | 42 | **Ngược chiều** (1 phiên) | 248/248 |
| Siêu quét AI | `ls_v1` Dẫn dắt LS-v1 | C | z | 58 | Trung tính | 1.366/1.366 |
| Siêu quét AI | `smart_score`, `rs_rating`, `fa_score`, `risk_adj_mom` | C | 0–100 / tỷ lệ | 35–58 | Trung tính | 19/19 |
| Siêu quét AI | `ta_score` Điểm kỹ thuật | C | 0–100 | 75 | Ứng viên mới nổi | 19/19 |
| Siêu quét AI | `foreign_net_buy` Khối ngoại mua ròng | C | cờ | 42 | **Thiếu dữ liệu** | 6/19 |
| Siêu quét AI | `mom5_atr` Động lượng 5 phiên / ATR | C | z | 36 | Trung tính | 248/248 |
| **Cơ bản** | **`kq_nowcast` KQKD — tăng trưởng LNST cả năm ước tính** | **B** | tỷ lệ | mới | — (đo từ 30/11) | — |
| Lọc ngành | `top20_alpha` Alpha M1 (Top 20) | **C** (hạ từ B) | điểm | 27 | Trung tính | 19/19 |
| Lọc ngành | `rrg_quadrant` Góc phần tư RRG | C | bậc | 79 | Trung tính (cấp ngành — không gắn mới nổi) | 19/19 |
| TA VN-Index | `sepa_s2` SEPA phá vỡ đạt chuẩn | B | cờ | 14 | **Thiếu dữ liệu** | 2/19 |
| TA VN-Index | `sepa_state` Trạng thái SEPA | C | bậc | 71 | Ứng viên mới nổi | 19/19 |
| TA VN-Index | `pattern_state`, `convergence`, `base_breakout` | C | bậc | 37–64 | Trung tính | 19/19 |
| TA VN-Index | **`camslim_cup` CAN SLIM Cốc tay cầm** | **B** | bậc (2/1/0) | mới | — (đo từ 30/11) | — |
| TA VN-Index | `structure_score`, `structure_verdict` | C | 0–7 / bậc | 30–62 | Trung tính | 18/18 |
| Chất xúc tác | `catalyst_impact` | C | điểm | 56 | Trung tính | 19/19 |
| Cổ tức | `cotuc_decision` | C | bậc | 69 | Ứng viên mới nổi | 10/18 |

## 2. Một dòng tín hiệu — đặc tả

| Cột | Nội dung | Ghi chú |
|---|---|---|
| Tín hiệu | Tên + đơn vị; dòng phụ: nguồn (hồi cứu / tiến từ bảng E1) | Như hiện tại |
| Giá trị hôm nay | Định dạng theo §3; bậc / cờ hiện nhãn | **Ô trống có lý do**: "nguồn thiếu phiên này" hoặc "mã ngoài danh sách quét" |
| Phân vị | Thanh 0–100 theo chiều tốt (giữ `percentile` + `signalSemantics`) | Thêm phân vị **trong ngành ICB cấp 2** (mới) |
| Bậc | Chip A / B / C (E2), mũi tên nếu đã thăng / giáng | Như hiện tại |
| SQS · xu hướng | Số 0–100 + chip xu hướng EV-4 | Mới (`evidence-evolution`) |
| IC chế độ hiện tại | IC TB ở kỳ hạn chính **trong chế độ thị trường hôm nay** (VD "Xu hướng giảm: +0,018, 62 ngày") | Mới; < 10 ngày → "chưa đủ" |
| Đóng góp Z | Chỉ bậc A / B (E3) | Như hiện tại, nhãn "đối chứng" |

Sắp xếp mặc định: bậc (A → C) → SQS giảm dần. Bộ lọc: theo tab nguồn (như tab 4), "chỉ tín hiệu bất lợi cho mã", "chỉ bậc A/B".

## 3. Định dạng giá trị

| Đơn vị | Hiển thị | Ví dụ |
|---|---|---|
| tỷ lệ (`kq_nowcast`, `risk_adj_mom`) | phần trăm có dấu, 1 chữ số | 0,728 → **+72,8%** |
| z | 2 chữ số | +2,03 |
| xác suất | phần trăm | 0,62 → 62% |
| 0–100 | số nguyên | 87 |
| đcb/phiên | 2 chữ số + "đcb" | +3,47 đcb |
| bậc / cờ | nhãn trong `signalSemantics` | `camslim_cup` 2 → "Phá vỡ pivot", 1 → "Sẵn sàng (tay cầm)", 0 → "—" |

`signalSemantics.ts` đã có `camslim_cup`, `kq_nowcast` (#406). Cần thêm trường `unitFormat` để bảng định dạng đúng.

## 4. Tín hiệu rời bảng E2 nhưng vẫn là dữ liệu thật

| Tín hiệu | Vì sao vẫn hiện | Ở đâu trong hồ sơ |
|---|---|---|
| `structure_stage` Giai đoạn Minervini | Là 1 trong 7 mô hình TA của quy tắc Elite HL | Dòng **Kỹ thuật** của ma trận lớp (chi tiết Hợp lưu tầng 1), nhãn "mô hình của Elite HL — không còn trong bảng E2 từ 27/11" |
| `log_rvol` RVOL (log) | Tín hiệu đảo chiều ngắn hạn mạnh nhất đo được (t −4,75 ở 1 phiên) | Mục "Bối cảnh ngoài E2" cuối góc Tín hiệu, thu gọn |

## 5. Khối "Điểm Elite — danh mục dòng tiền (đối chứng)"

Chuyển từ đầu Tổng hợp xuống cuối góc Tín hiệu, thu gọn mặc định:
- Hạng Z / Z / α 5 phiên / P vượt + thác đóng góp (giữ testid).
- Câu đầu khối: "Elite HL (chính thức) chọn mã theo quy tắc Hợp lưu, không theo Z. Z dùng cho danh mục đối chứng và nghiên cứu."
- Khi phiên thiếu nguồn dòng tiền (F1): dải đỏ "Z phiên này thiếu Stealth 20/5 — không so sánh được với phiên đủ dữ liệu".

## 6. Kiểm thử bắt buộc

- 25 dòng `elite-sig-*` đúng danh sách `SIGNAL_SPECS`; `structure_stage` / `log_rvol` không có dòng `elite-sig-*` nhưng có trong khối tương ứng ở §4.
- `kq_nowcast` 0,728 hiện "+72,8%"; `camslim_cup` 2 hiện "Phá vỡ pivot".
- Thiếu `evidence-evolution` → cột SQS hiện "—", các cột khác đủ.
- Phiên thiếu `researchFeatures` → dải cảnh báo hiện ở khối Z và ở dòng Dòng tiền của ma trận.
