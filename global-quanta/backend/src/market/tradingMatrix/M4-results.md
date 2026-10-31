# M4-r1 — Kết quả bằng chứng phụ (31/10/2026)
Theo `M4-prereg.md`. Tái lập: `node scripts/matrix-m4-validate.mjs <dataDir> <out.json>`.

Dữ liệu: VN-Index và 95 mã VN100 có từ 300 phiên trở lên, 2021-10-01 → 2026-10-30, 1.267 phiên. Trong mẫu đến 2024-12-31. Nền 10 phiên: trong mẫu −0,05%, ngoài mẫu +0,85%.

| Kịch bản | Trong mẫu: đợt, TB | Ngoài mẫu: đợt, TB | KTC 95% | q | Kết luận |
|---|---|---|---|---|---|
| SC1 Xu hướng có độ rộng hỗ trợ | 8, +0,46 | 7, −2,63 | −6,33 → +0,85 | 0,576 | Chưa đủ mẫu |
| SC2 Chỉ số dẫn dắt, số đông yếu | 23, −0,60 | 12, +0,77 | −1,29 → +2,93 | 0,819 | Không đạt |
| SC3 Cú sốc biến động | 4, −1,39 | 3, +0,38 | −4,55 → +6,83 | 0,819 | Chưa đủ mẫu |
| SC4 Độ rộng rơi nhanh | 33, −0,94 | 23, +0,28 | −1,76 → +2,21 | 0,819 | Không đạt |

**Quyết định:** không kịch bản nào đạt cổng. M4-r1 giữ cấp C, chỉ mô tả; M3-r1 và nhãn hiện tại không đổi. Sổ tiến `market_matrix_signal_m4` là bằng chứng chính.

**Hạn chế:** thiên lệch sống sót do dùng danh mục hiện tại; giai đoạn 2025–2026 đã dùng cho M3 và M5. Có một lần chạy thử trên 87 mã khi dữ liệu chưa tải xong; quy tắc và cổng không đổi sau lần đó.
