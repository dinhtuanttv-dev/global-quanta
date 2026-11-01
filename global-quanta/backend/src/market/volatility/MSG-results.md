# MSG-r1 — Kết quả (01/11/2026)
Theo `MSG-prereg.md`. Tái lập: `node scripts/msgarch-validate.mjs <dataDir> <out.json>`.

Dữ liệu: 95 mã VN100 và VN-Index, 3.535 dự báo 20 phiên, 262 ngày dự báo, 2023-10-03 → 2026-10-02.

| Giả thuyết | Kết quả | Đạt |
|---|---|---|
| H1 Độ phủ P10–P90 trong [75%, 85%] | 81,7% (dưới dải 7,9%, trên dải 10,4%) | Có |
| H2 Pinball thấp hơn mô hình so sánh, KTC nằm dưới 0 | 7,265 so với 7,256; hiệu số +0,009, KTC 95% −0,045 → +0,074 | **Không** |
| H3 Khi căng thẳng, độ phủ gần 80% hơn | 80,3% so với 83,0% (707 dự báo) | Có |

Mô hình so sánh: phủ 82,0%, rộng 24,2%. MS-GARCH rộng 23,6%. Hội tụ thật 83,1%; 73,1% lần chạy có ít nhất một cảnh báo tham số.

**Quyết định: không đạt cả 3 cổng, giữ cấp C.** MS-GARCH mô tả trạng thái và độ rộng rủi ro, không hơn mô hình đơn giản về sai số dải. Điểm hơn duy nhất đo được là độ phủ sát đích hơn khi biến động cao.

**Hạn chế:** thiên lệch sống sót do dùng danh mục hiện tại; các mã tương quan nên số dự báo độc lập thấp hơn 3.535; không có chi phí vì không phải tín hiệu giao dịch.
