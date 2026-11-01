# PO-r1 — Kết quả (01/11/2026)
Theo `PO-prereg.md`. Tái lập: `node scripts/preopen-validate.mjs <out.json>`. Walk-forward 376 phiên, 2025-04-29 → 2026-10-30.

| Cổng | Kết quả | Đạt |
|---|---|---|
| G1 vùng mở cửa | Phủ 82,2%; pinball 0,315 so với 0,344; hiệu số −0,028, KTC 95% −0,062 → +0,004 | Không (KTC chạm 0) |
| G2 dải cả phiên | Phủ 66,8%; pinball 0,910 so với 0,888 | Không |
| G3 xác suất | Brier skill 0,000, KTC −0,020 → +0,022 | Không |
| G4 không bán đuổi | Nhóm Tiêu cực n 36: mở → đóng −0,15%, KTC −0,76 → +0,43 | Không |
| G5 không mua đuổi | Nhóm Tích cực n 52: mở → đóng −0,20%, KTC −0,69 → +0,21 | Không |

Theo nhóm ES: Tiêu cực n 36, mở −0,27%, cả phiên −0,42%. Trung tính n 288, mở +0,17%, cả phiên +0,13%. Tích cực n 52, mở +0,53%, cả phiên +0,32%.

**Quyết định:** không hiện vùng mở cửa, xác suất, câu hành động. Dải cả phiên hiện kèm cảnh báo độ phủ thực tế. Tín hiệu mở cửa có triển vọng nên các số bị ẩn vẫn được ghi vào sổ tiến để đánh giá lại; không nới cổng.

**Lưu ý:** bảng khảo sát trước đó trông tốt hơn vì đo ES 24 giờ và không qua walk-forward. Phân kỳ này thị trường tăng mạnh, nên nền mở cửa dương; nhóm Tiêu cực chỉ có 36 phiên.
