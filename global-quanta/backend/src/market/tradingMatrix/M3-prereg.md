# M3 — Engine kịch bản Trading Matrix — TIÊU CHÍ ĐẶT TRƯỚC (ĐÃ DUYỆT 2026-10-22)
Soạn 2026-10-22, TRƯỚC khi viết code đo và trước khi xem bất kỳ kết quả nào. Sau commit không sửa; sửa thì ghi ở mục "Sửa đổi".
Căn cứ: `docs/TRADING_MATRIX_INTEGRATION_SPEC.md` §6.5, §6.6, §9, §11 Phase 3; rule registry v0 trong `docs/TRADING_MATRIX_DATA_CATALOG.md`.

## 1. Vector trạng thái theo NGÀY (chỉ dùng dữ liệu ≤ t)
- `regime_t`: quy tắc công khai `research/regime.js` trên VN-Index (giá vs MA20/MA50, MA50 dốc 10 phiên).
- `b_t`: % mã của phạm vi có đóng cửa > MA20 (mẫu số = mã có ≥ 20 phiên tới t và có giao dịch tại t).
- `Δb5_t = b_t − b_{t−5}`; `ddb_t = b_t − max(b_{t−5..t})` (độ rộng rơi so đỉnh 5 phiên).
- `med5_t`: trung vị lợi suất 5 phiên của các mã trong phạm vi (%). `idx5_t`, `idx1_t`: lợi suất VN-Index 5 / 1 phiên (%).
- `rv_t`: độ lệch chuẩn lợi suất ngày VN-Index 20 phiên (đóng cửa → đóng cửa, vì nến chỉ số SSI chỉ có giá đóng cửa);
  `rvPct_t`: phân vị của `rv_t` trong 250 phiên trước (gồm t).

## 2. Quy tắc (RULE_VERSION `M3-r1`) — nhóm bằng chứng ĐỘC LẬP (giá chỉ số / độ rộng / biến động)
| Kịch bản | Nhóm A | Nhóm B | Lọc (không tính là bằng chứng) | WATCH | CONFIRMED (quy tắc) | INVALIDATED |
|---|---|---|---|---|---|---|
| SC1 Xu hướng có độ rộng hỗ trợ | giá: `regime = UPTREND` | độ rộng: `b ≥ 50 ∧ Δb5 ≥ 0` | `rvPct < 80` | A ∧ (b ≥ 50 ∨ Δb5 ≥ 0) | A ∧ B ∧ lọc | `regime ≠ UPTREND ∨ b < 40` |
| SC2 Chỉ số dẫn dắt, thị trường phân hoá | giá: `idx5 > 0,5` | độ rộng: `med5 ≤ 0 ∧ Δb5 < 0` | — | A ∧ (med5 ≤ 0 ∨ Δb5 < 0) | A ∧ B | `idx5 ≤ 0 ∨ (med5 > 0 ∧ Δb5 ≥ 0)` |
| SC3 Cú sốc biến động | biến động: `rvPct ≥ 90 ∨ |idx1| ≥ 2,5·rv` | độ rộng: `ddb ≤ −15` | — | A ∨ B | A ∧ B | `rvPct < 70 ∧ ddb > −5` |
| SC0 Chuyển pha / chưa xác định | — | — | — | hiện khi không kịch bản nào WATCH/CONFIRMED, hoặc độ phủ < 80 %, hoặc regime TRANSITION | — | — |

Vòng đời: `INACTIVE → WATCH → CONFIRMED`; CONFIRMED giữ tới khi điều kiện vô hiệu → `INVALIDATED` (1 phiên) → `COOLDOWN` 5 phiên
(không vào lại) → `INACTIVE`. WATCH mà điều kiện WATCH mất -> INACTIVE. **Đợt (episode) = phiên chuyển sang CONFIRMED.**

## 3. Cờ rủi ro (chỉ là "cần xem xét", không phải lệnh)
- RF3 chỉ số vs độ rộng phân kỳ = SC2 CONFIRMED (severity CAUTION).
- RF4 dòng tiền phân kỳ: khối ngoại ròng 3 phiên và dấu chân lệnh z5 ngược dấu, cả hai |giá trị| vượt ngưỡng (1 tỷ; 0,5) — chỉ chạy thật (không có lịch sử khối ngoại theo mã cho kiểm định) -> THỰC NGHIỆM.
- RF2 bất thường ATO/ATC: cần KL theo pha phiên của toàn thị trường — chưa có nguồn -> UNAVAILABLE.
- RF1 tin + giá giãn: cần sự kiện đã xác nhận (Project A đang lỗi) -> UNAVAILABLE.
- RF5 kế hoạch thiếu mức vô hiệu / rủi ro tối đa: kiểm tra quy trình, không cần kiểm định.

## 4. Dữ liệu kiểm định
VN-Index (SSI DailyIndex, đóng cửa) + phạm vi VN100 hiện tại (97 mã đủ ≥ 300 phiên) từ `scripts/structure-fetch.mjs` (điều chỉnh cộng dồn).
Thiên lệch sống sót (danh mục hiện tại) được ghi rõ. Trong mẫu (IS) ≤ 2024-12-31; ngoài mẫu (OOS) 2025-01-02 → phiên cuối − 10.

## 5. Giả thuyết chính (BH-FDR q = 0,10 trên 3 p-value OOS)
Outcome: lợi suất VN-Index 10 phiên kể từ đóng cửa phiên bắt đầu đợt, TRỪ trung bình lợi suất 10 phiên vô điều kiện của cùng giai đoạn.
KTC 95 % bootstrap theo đợt (1000 lần, seed 7). p một phía (P1, P2) / hai phía (P3).
- P1 (SC1): ĐẠT khi OOS ≥ 12 đợt, TB > 0, cận dưới KTC > 0, TB IS > 0.
- P2 (SC2): ĐẠT khi OOS ≥ 12 đợt, TB < 0, cận trên KTC < 0, TB IS < 0.
- P3 (SC3): ĐẠT khi OOS ≥ 12 đợt, KTC không chứa 0 và cùng dấu với TB IS.

## 6. Mô tả (không đổi nhãn)
Kỳ hạn T+1/3/5; thống kê theo NGÀY ở trạng thái (block bootstrap 10 phiên); tỷ lệ báo động giả (đợt có lợi suất 10 phiên ngược kỳ vọng);
độ nhạy: mỗi ngưỡng ±20 % (chỉ báo cáo, KHÔNG chọn lại ngưỡng); so baseline breadth-only (b ≥ 50).

## 7. Quyết định hiển thị
- Kịch bản luôn hiện công khai với nhãn THỰC NGHIỆM; trạng thái CONFIRMED hiển thị là "Đủ điều kiện quy tắc (chưa kiểm định)".
- Chỉ kịch bản ĐẠT mới được hiện "Xác nhận" (M4). Không đạt / thiếu mẫu: giữ THỰC NGHIỆM, sổ tín hiệu vẫn ghi để đánh giá thực tế.
- Sổ tín hiệu (bảng cục bộ `market_matrix_signal`, `market_matrix_outcome`) ghi đúng thời điểm, chấm T+1/3/5/10 trên VN-Index.

## Sửa đổi
(chưa có)

## Kết quả (2026-10-22, chạy một lần với code đã cố định ở ba55f7a; xem matrixValidation.js)
Dữ liệu: 97 mã VN100 + VN-Index, 2021-10-01 → 2026-10-21 (1.260 phiên). Nền 10 phiên: IS −0,05 %, OOS +0,60 %.
- SC1: THIẾU MẪU — OOS 9 đợt (< 12), TB −0,71 % (KTC −4,26; 2,25); IS 11 đợt −0,42 %.
- SC2: KHÔNG ĐẠT — OOS 13 đợt TB **+1,42 %** (KTC −0,94; 3,93), IS +1,32 %: sau "chỉ số dẫn dắt, phân hoá" VN-Index KHÔNG giảm
  (ngược kỳ vọng cảnh báo) -> RF3 chỉ là mô tả, không được trình bày như cảnh báo giảm.
- SC3: THIẾU MẪU — OOS 6 đợt, TB +1,76 % (KTC chứa 0).
Mô tả (không đổi nhãn): SC1 T+1 / T+5 OOS có KTC > 0 nhưng chỉ 9 đợt và là kỳ hạn phụ; độ nhạy ±20 % không đổi kết luận.
Kết luận: cả ba giữ THỰC NGHIỆM; sổ tín hiệu thực tế ghi từ phiên đầu tiên sau triển khai.
