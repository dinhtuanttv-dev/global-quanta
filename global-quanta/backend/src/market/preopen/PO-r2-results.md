# PO-r2 — Kết quả (01/11/2026)
Theo `PO-r2-prereg.md`. Tái lập: `node scripts/preopen-validate-r2.mjs <out.json> <dataDir>`. Walk-forward 376 phiên, 2025-04-29 → 2026-10-30. KTC 99%.

| Cổng | Kết quả | Đạt |
|---|---|---|
| G1 vùng mở cửa | Phủ 85,1% (trần 85%); pinball 0,331 so với 0,344; hiệu số −0,013, KTC −0,061 → +0,032 | Không |
| G2a dải cả phiên MS-GARCH | Phủ 80,1%; pinball 0,873 so với 0,888 của dải không điều kiện | **Có** |
| G2b EWMA (không cần xét) | Phủ 81,4%; pinball 0,881 | — |
| G3 xác suất | Brier skill −0,014, KTC −0,034 → +0,010 | Không |
| G4 không bán đuổi | n 27 (dưới 30): mở → đóng −0,19%, KTC −1,08 → +0,75 | Không |
| G5 không mua đuổi | n 30: mở → đóng −0,30%, KTC −1,26 → +0,46 | Không |
| G6 nhóm phòng thủ | n 27 (dưới 30): vượt VN-Index +0,05%, KTC −0,33 → +0,56 | Không |

Kịch bản dẫn đầu trúng 39,6% so với 37,2% khi luôn đoán đi ngang.

**Quyết định:** dải cả phiên dùng MS-GARCH và được ghi đã đạt kiểm định. Vùng mở cửa, xác suất, câu hành động, nhóm phòng thủ vẫn không hiện; số bị ẩn ghi vào sổ tiến.

**Lưu ý:** đây là lần nhìn lại trên cùng dữ liệu sau khi đã biết r1 và kết quả rà soát, nên kết quả đạt của dải cần sổ tiến xác nhận. Thử nghiệm không so hiệu số dải MS-GARCH với KTC. Bản vận hành căn mốc ước lượng lại theo phiên gần nhất nên lệch nhẹ so với bản kiểm định. Mẫu thuộc giai đoạn thị trường tăng.
