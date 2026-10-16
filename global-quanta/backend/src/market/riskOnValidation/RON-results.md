# Kết quả kiểm định Risk-On Index (theo RON-prereg.md, commit 4320189)

Chạy 2026-10-16 bằng `node backend/scripts/riskon-validate.mjs --out backend/src/market/riskOnValidation/RON-result.json`.

| Mục | Kết quả |
|---|---|
| Mẫu | 124 mẫu không chồng lấn (mỗi 20 phiên), 2016-10-17 → 2026-08-25 |
| H1 — Spearman IC (điểm Risk-On → VN-Index t→t+20) | **+0,049**, KTC95 bootstrap khối [−0,103; +0,217] |
| Quy tắc ĐẠT | cận dưới KTC95 > 0 và n ≥ 60 → **KHÔNG ĐẠT** |
| H2 — RISK_ON − RISK_OFF | không đủ điều kiện: RISK_OFF chỉ 8 mẫu (< 10). Mô tả: RISK_ON n=99, TB +1,07%; TRUNG LẬP n=17, −0,04%; RISK_OFF n=8, −1,08% |
| H3 — hai nửa | 2016-10→2021-09: IC −0,076 · 2021-10→2026-08: IC +0,119 → đổi dấu, không ổn định |

## Kết luận (áp dụng đúng hệ quả đã đăng ký trước)

**FAIL.** Risk-On Index là **"Heuristic — không đạt kiểm định"**:
- nhãn trên tab Kết nối thế giới đổi từ "dữ liệu cứng" sang heuristic;
- loại Risk-On khỏi chế độ thị trường trong quyết định Lọc ngành (chỉ còn xu hướng MA200 của VN-Index);
- trọng số động Confluence theo Risk-On được ghi chú là heuristic.

Ghi chú trung thực: chênh lệch mô tả RISK_ON/RISK_OFF đúng chiều nhưng RISK_OFF quá hiếm (8/124) để kết luận;
điểm Risk-On nằm ≥ 65 trong 80% thời gian nên gần như không phân biệt được các giai đoạn.
