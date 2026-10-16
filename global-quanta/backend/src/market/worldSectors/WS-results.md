# WS — Kết quả kiểm định đặt trước (theo WS-prereg.md, commit a8c6666)

Chạy 2026-10-17: `node backend/scripts/ws-validate.mjs --out backend/src/market/worldSectors/WS-result.json`.

- Mẫu: 942 phiên VN, 2023-01-03 → 2026-10-16.
- Nguồn: 74 mã Yahoo, 22 chỉ số ngành ICB Gateway, VN-Index, hàng hoá dẫn dắt.

## H2 — từng ngành, tương đối (BY trên 22 ngành)

| Kết quả | Ngành |
|---|---|
| **ĐẠT** | **0500 Dầu khí**: IC +0,182, p 0,0002, q 0,016, hai nửa +0,153 / +0,211 |
| Không đạt | 21 ngành còn lại. IC từ −0,057 đến +0,063; q đều ≥ 0,885 |

Gần ngưỡng nhưng không đạt:
- Thực phẩm & đồ uống: IC +0,063, p 0,039, q 1,00;
- Y tế: IC +0,062, p 0,022, q 0,885; nửa đầu âm.

## H3 — xếp hạng ngắn hạn toàn danh sách (IC cắt ngang theo ngày)

**ĐẠT:**
- TB IC +0,0203, t Newey–West 2,53, p một phía 0,0057;
- hai nửa +0,0146 / +0,0260;
- 942 ngày.

Lợi thế xếp hạng là **có thật nhưng nhỏ**: IC 0,02 nghĩa là thứ tự thuận/ngược gió chỉ đúng hơn ngẫu nhiên một chút, tính trung bình trên nhiều ngày.

## H4 — xếp hạng trung hạn (IC cắt ngang theo tháng)

**KHÔNG ĐẠT:**
- TB IC −0,0070, t −0,21, p 0,58;
- hai nửa +0,0245 / −0,0372;
- 45 tháng.

## H1 — tuyệt đối (chỉ báo cáo)

- IC từ 0,00 (Điện lực) đến 0,19 (Dầu khí); đa số 0,07–0,12.
- Phần lớn là **hiệu ứng toàn thị trường**: thị trường VN đi theo thế giới qua đêm. Không riêng ngành nào.

## Hệ quả (áp dụng đúng như đăng ký)

- Dầu khí: nhãn "BẰNG CHỨNG (ngắn hạn, tương đối)".
- Danh sách thuận/ngược gió **ngắn hạn**: "BẰNG CHỨNG (xếp hạng, IC nhỏ ≈ 0,02)".
- Danh sách **trung hạn**: giữ "THĂM DÒ".
- Các ngành khác: điểm ngắn hạn từng ngành vẫn là "THĂM DÒ". Xếp hạng tương đối đạt ở cấp danh sách, không ở cấp từng ngành.
