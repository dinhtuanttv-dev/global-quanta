# TO-r1 — Đăng ký trước: "Săn cổ tức trước GDKHQ" (kiểm định tiến)

**Ngày đăng ký:** 07/11/2026, viết trước khi sổ theo dõi ghi lệnh đầu tiên.

**Nguyên tắc:**
- Quy tắc, tiêu chí và số tham chiếu dưới đây cố định.
- Muốn đổi bất kỳ điều gì thì đăng ký lại thành TO-r2. Sổ cũ giữ nguyên.

**Nhãn hiển thị:**
- Trước khi đạt: **THĂM DÒ**. Giao diện không dùng chữ "mua"; đây không phải khuyến nghị đầu tư.
- Sau khi đạt ở lần xem nào: **ĐẠT TO-r1**.

## Quy tắc giao dịch TO-r1 (mã nguồn: `divRunup.js`, `TO_RULE`)
**Sự kiện**
- Mỗi đợt cổ tức tiền mặt VNDirect (gộp các đợt cùng GDKHQ, lấy ngày công bố sớm nhất).
- Bỏ đợt có cổ tức cổ phiếu / thưởng trùng GDKHQ ±1 ngày.

**Đủ điều kiện (chỉ dùng thông tin có tới lúc vào lệnh)**
1. Lợi suất = cổ tức (đ/cp) / giá đóng cửa chưa điều chỉnh của phiên cuối ≤ ngày công bố, phải **≥ 5%**.
2. GTGD bình quân 20 phiên tính tới phiên đó **≥ 1 tỷ đồng**.
3. Phiên vào lệnh không tăng trần. Trần tính bằng thay đổi giá chưa điều chỉnh ≥ biên độ − 0,5 điểm %; biên độ HOSE 7%, HNX 10%, UPCOM 15%.

**Vào lệnh:** giá đóng cửa của phiên giao dịch đầu tiên **sau** ngày công bố.

**Thoát lệnh:** giá đóng cửa phiên cuối còn quyền (phiên liền trước GDKHQ). Phải nắm ≥ 2 phiên (T+2).

**Kết quả của mỗi lệnh**
- Lợi nhuận vượt VN-Index = exp(ln giá ra/giá vào − ln VN-Index ra/vào) − 1 − 0,45%.
- 0,45% = phí mua 0,2% + phí bán và thuế 0,25%.
- Giá dùng là giá điều chỉnh VNDirect lưu ở kho Gateway.

## Số tham chiếu cố định (backtest 03/2022 – 11/2026, 119 lệnh, kiểm tra chéo bằng chính `divRunup.js`)
- **μ0 = +1,76%/lệnh, σ0 = 5,73%.** Khoảng tin cậy 95% bootstrap theo tháng: [0,81%; 2,80%]. Tỷ lệ thắng 64,7%.
- **Theo năm:**

| 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| +5,28% | +1,90% | +2,21% | **+0,59%** | **−0,02%** |

  Lợi thế đang suy giảm. Ghi nhận trước để không ai bất ngờ nếu TO-r1 không đạt.
- **Danh mục mô phỏng** (tối đa 5 vị thế × 20%): +88% so với VN-Index +15%, sụt giảm lớn nhất −8,8% (VN-Index −40,2%), Sharpe 1,67, vốn trên thị trường 24% thời gian.
- **Ngành yếu (cảnh báo, không loại):** Tiêu dùng −2,18% (17 lệnh).

## Sổ theo dõi tiến TO-L1
**Ghi lệnh**
- Ghi mọi đợt đủ điều kiện có **ngày vào ≥ 09/11/2026**, mỗi đợt một lần, không sửa.
- Chấm sau phiên cuối còn quyền. Nếu GDKHQ dời, dùng GDKHQ thật mới nhất.
- Đợt bị huỷ (không còn trong kho sự kiện 30 ngày sau ngày thoát dự kiến) ghi là HUỶ và không tính.

**Kiểm định: hai lần xem cố định**
- Lần xem thứ nhất tại **30** lệnh đã có kết quả; lần thứ hai tại **60** lệnh.
- Mỗi lần đạt khi cận dưới khoảng tin cậy **97,5%** (bootstrap theo tháng GDKHQ, 2000 lần, seed 20261107) của lợi nhuận vượt VN-Index trung bình **> 0**.
- Dùng 97,5% thay cho 95% vì có hai lần xem.
- Kết quả mỗi lần xem được ghi vĩnh viễn.
- Đạt ở lần nào thì nhãn đổi thành **ĐẠT TO-r1**. Không đạt cả hai thì giữ **THĂM DÒ** và đánh giá lại (TO-r2 nếu đổi quy tắc).

**Giám sát suy giảm: CUSUM một phía**
- Công thức: z = (x − μ0)/σ0; S = min(0, S + z + 0,5); báo động khi S < −4.
- Cập nhật theo từng lệnh có kết quả, báo cáo theo quý.
- Báo động chỉ hiện cảnh báo "lợi thế có thể đang suy giảm", không đổi kiểm định.

**Mô phỏng danh mục trên giao diện** (cùng quy tắc vốn như backtest)
- "Lịch sử": mọi lệnh đủ điều kiện từ 03/2022.
- "Sổ tiến": chỉ các lệnh của TO-L1.

## Giới hạn ghi nhận trước
- **Thiên lệch sống sót:** danh mục là các mã hiện tại.
- **Lịch sử sự kiện VNDirect chỉ từ 2022.**
- **Giá đóng cửa không đảm bảo khớp được toàn bộ khối lượng;** chưa tính trượt giá ngoài phí.
- **Ngày công bố theo VNDirect:** tin ra sau giờ giao dịch thì vẫn vào ở phiên kế tiếp, nên có lợi cho tính thận trọng.
- **Nhịp khoảng 25–35 lệnh/năm:** lần xem thứ nhất dự kiến cuối 2027.
