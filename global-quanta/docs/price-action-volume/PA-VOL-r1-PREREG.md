# PA-VOL-r1 — Đăng ký trước: Price Action kết hợp Khối lượng (cổ phiếu VN, khung ngày)

> Đăng ký: 26/11/2026, **trước khi** tải xong hay đọc bất kỳ kết quả nào. Mọi tham số dưới đây cố định; không chỉnh sau khi xem kết quả.
> Engine: `src/lib/price-action` bản `pa-book-2.0.0` (định nghĩa mẫu hình theo sách "Price Action – Hành động giá chuyên sâu", Tập 2–3).
> Dữ liệu: VNDirect finfo `stock_prices` — OHLC danh nghĩa, giá tham chiếu, trần/sàn, khối lượng và giá trị khớp lệnh của MỌI mã
> trong danh sách 1.974 mã (kể cả đã huỷ niêm yết) từ 01/01/2013. Giá điều chỉnh tự dựng: hệ số ngày t = giá tham chiếu(t) / giá đóng(t−1),
> điều chỉnh lùi cộng dồn.

## 1. Câu hỏi

Mẫu hình Price Action **tại vùng hỗ trợ, có bối cảnh xu hướng**, khi được **khối lượng xác nhận** có tạo lợi thế sau chi phí trên cổ phiếu
Việt Nam không, và khối lượng có cộng thêm giá trị so với Price Action thuần không.

## 2. Vũ trụ đúng thời điểm

Tại phiên t, một mã đủ điều kiện nếu: (a) có ≥ 250 phiên giao dịch trước t; (b) trung vị giá trị khớp 20 phiên t−20…t−1 ≥ 5 tỷ đồng
(sàn tuyệt đối LQ-v1); (c) không phải chỉ số / chứng chỉ quỹ / chứng quyền (mã 3 ký tự). Không dùng thông tin sau t.

## 3. Tín hiệu (chỉ mua — thị trường cơ sở VN không bán khống)

Tham số mặc định của engine `pa-book-2.0.0`; không tối ưu.

- **Mẫu hình đảo chiều tăng** (theo sách): pin bar, nến đảo chiều, nến đảo chiều chủ chốt, nến đuối sức, đảo chiều 2 thanh, đảo chiều 3 thanh —
  phải chạm vùng hỗ trợ PA đang hiệu lực (vùng dựng online từ swing đã xác nhận, không nhìn trước).
- **Mẫu hình tiếp diễn**: inside bar, NR7, 3 nến hồi — chỉ khi cấu trúc đang tăng (HH + HL, chưa bị phá đáy cấu trúc).
- **Kích hoạt** (sách: "buy khi đỉnh … bị phá vỡ"): một phiên trong 5 phiên sau mẫu hình **đóng cửa** trên mức kích hoạt của mẫu hình + 1 bước giá.
- **Vô hiệu**: đóng cửa dưới đáy mẫu hình − đệm (max(2 bước giá, 0,1 ATR)) trước khi kích hoạt; với mẫu hình đảo chiều, cả khi vùng hỗ trợ bị phá.

Ba biến thể (lồng nhau):

| Mã | Định nghĩa |
|---|---|
| **S1 — PA thuần** | Setup đã kích hoạt; cấu trúc ngày KHÔNG giảm (không phải LH + LL). |
| **S2 — PA + Khối lượng** | S1 **và** phiên kích hoạt có RVOL20 ≥ 1,5 (khối lượng / trung bình 20 phiên trước) **và** tỷ lệ khối lượng phiên tăng / phiên giảm 20 phiên ≥ 1,0 ("khối lượng đồng thuận xu hướng"). |
| **S1¬V** | S1 nhưng không đạt điều kiện khối lượng của S2 (phần bù, để đo riêng đóng góp của khối lượng). |

## 4. Đo lường

- Vào lệnh: giá **mở cửa** phiên kế tiếp phiên kích hoạt. Bỏ (censor) nếu giá mở cửa đó ≥ giá trần − 1 bước giá (không mua được), hoặc thiếu dữ liệu.
- Chi phí: 0,20% mua + 0,25% bán (phí sổ Elite HL) — cộng thêm tác động thanh khoản không mô hình hoá.
- **Chỉ tiêu chính**: lợi suất ròng 10 phiên (mở cửa t+1 → đóng cửa t+10) **trừ lợi suất cùng cửa sổ của rổ đều-trọng-số mọi mã đủ điều kiện** (vượt trội).
- Phụ: 5 và 20 phiên; giao dịch theo sách (cắt lỗ đóng cửa dưới mức vô hiệu, chốt lời tại vùng kháng cự / swing gần nhất, giữ tối đa 20 phiên) — đo theo R và %.
- Sai số chuẩn: gộp cụm theo tuần kích hoạt (các tín hiệu cùng tuần không độc lập). Bootstrap khối theo tháng cho chênh lệch S2 − S1¬V.

## 5. Mẫu

- **Trong mẫu (phát triển / kiểm tra cài đặt)**: 01/01/2014 – 31/12/2020.
- **Ngoài mẫu (quyết định)**: 01/01/2021 – 31/10/2026 (dừng trước 20 phiên cuối để đủ cửa sổ 20 phiên). Chạy đúng một lần.

## 6. Giả thuyết và cổng ĐẠT

- **H1 (khối lượng cộng thêm giá trị)**: vượt trội 10 phiên của S2 − S1¬V > 0, bootstrap khối theo tháng một phía p < 0,05, ngoài mẫu.
- **H2 (lợi thế tuyệt đối)**: vượt trội 10 phiên trung bình của S2 > 0 với t (cụm tuần) ≥ 2,0 ngoài mẫu, **và** dương ở cả hai nửa ngoài mẫu
  (2021–2023, 2024–10/2026), **và** cùng dấu trong mẫu.
- **H3 (không phải may rủi)**: S2 vượt **giả dược** — cùng mã, cùng số tín hiệu, ngày vào ngẫu nhiên trong cùng quý mà mã đủ điều kiện
  (1.000 lần rút) — vượt trội trung bình của S2 nằm trên phân vị 95 của phân phối giả dược, ngoài mẫu.
- **Tối thiểu mẫu**: ≥ 200 tín hiệu S2 ngoài mẫu; thiếu → "THIẾU MẪU".

**Kết luận**:
- H2 + H3 đạt → **ĐẠT** (S2 được nêu là "có lợi thế đã kiểm định" trong giao diện, vẫn không cộng Điểm Elite nếu chưa có quyết định riêng).
- H2 hoặc H3 không đạt → **KHÔNG ĐẠT**; Price Action + khối lượng chỉ hiển thị dạng MÔ TẢ.
- H1 báo riêng: khối lượng có / không cộng thêm giá trị.

Đa kiểm định: 3 biến thể × 3 kỳ hạn chỉ là mô tả, có điều chỉnh Benjamini–Hochberg; chỉ tiêu chính duy nhất là H2 ở 10 phiên.

## 7. Những gì không làm

- Không đổi tham số mẫu hình / ngưỡng khối lượng sau khi xem kết quả. Nếu muốn thử ngưỡng khác → đăng ký r2 mới.
- Không tính phần tín hiệu ở 20 phiên cuối của dữ liệu (cửa sổ chưa đủ).
- Không dùng VNDirect `adClose` (làm tròn 3 chữ số nghìn đồng); hình dạng nến tính trên giá điều chỉnh tự dựng.

## Phụ lục A — làm rõ trước khi chạy (26/11/2026, chưa xem bất kỳ lợi suất nào)

1. **Nến đảo chiều chủ chốt**: theo câu chữ "mở < mở trước, đóng > đóng trước" thì 37% phiên của HPG 2013–2026 đạt (chỉ đếm tần suất,
   không xem lợi suất). Sách tự giải thích "nến sau nhận chìm cây nến trước" → định nghĩa thêm: thân nến nhận chìm thân nến trước. Tần suất còn ~13%.
2. **Khối lượng thiếu** (RVOL hoặc tỷ lệ tăng/giảm không tính được) được coi là **không đạt** điều kiện khối lượng (thuộc S1¬V, không thuộc S2).
3. **Một sự kiện cho mỗi (mã, phiên kích hoạt)** trong mỗi biến thể — nhiều setup kích hoạt cùng phiên không đếm lặp.
4. Rổ so sánh cần ≥ 20 mã đủ điều kiện trong cùng cửa sổ; thiếu → sự kiện bị loại (censored).
5. Kịch bản chạy: `gq-research/pa-ohlcv/scripts/run.mjs` (bản ghi trong báo cáo kết quả).
