# MTF v2 — Cấu trúc thị trường bám đúng tài liệu gốc — TIÊU CHÍ ĐẶT TRƯỚC (anh duyệt P0–P2 ngày 2026-10-24)
Soạn 2026-10-24, TRƯỚC khi chạy engine v2 trên dữ liệu kiểm định. Sau khi commit, tiêu chí không được sửa; mọi sửa đổi ghi ở mục cuối
kèm lý do, ngày và kết quả trước/sau.

**Công khai thiên lệch:** đã biết kết quả v1 (2026-10-21: H1–H5 đều KHÔNG ĐẠT; lợi suất theo giai đoạn v1: "B quá mua" tốt nhất,
"UP" kém nhất). Để không "chỉnh theo kết quả", v2 lấy NGUYÊN tham số và quy tắc của tài liệu gốc
`C:\Users\HP\cấu trúc thị trương\mtf_market_structure.py` (Config + detect_market_structure) và bộ ảnh — không dò tham số.

## Engine v2 (src/lib/quant-core/mtf, MTF_STRUCTURE_VERSION 2.0.0)
Mọi giá trị tại nến t chỉ dùng bars[0..t] (bất biến không nhìn trước, có test). Khác biệt có chủ đích so với bản Python:
(a) [đã bỏ — xem Sửa đổi 1] ~~sóng xác nhận bằng giá đóng cửa~~ → dùng đúng ZigZag high/low của bản gốc; riêng đáy đầu tiên ghi
xác nhận tại nến phát hiện (bản gốc ghi sớm hơn — nhìn trước vài nến ở đúng một điểm);
(b) bỏ phần gắn nhãn VÙNG mẫu hình hồi tố và gộp đoạn ngắn hồi tố khỏi chuỗi giai đoạn dùng để kiểm định (bản Python ghi rõ
"chỉ để trực quan"); giao diện được gộp đoạn ngắn ĐÃ KẾT THÚC để dễ đọc, giai đoạn hiện tại luôn là trạng thái thô;
(c) thêm B′ (đối xứng của B trong xu hướng giảm) và G3 (mua 3 bước, từ bộ ảnh) — mở rộng, không thay quy tắc gốc.

Tham số (bội số ATR 14):
| Khung | MA nhanh | MA chậm | slopeLen | sóng nhỏ / trung / lớn | chạm | quá đà | hội tụ |
| H1 | 20 tiết (MA 1 giờ) | 80 tiết (= MA20 khung 4 giờ) | 5 | 1,5 / 2,5 / 4,0 | 0,6 | 3,0 | 0,35 |
| D | 20 phiên | 100 phiên (= MA20 tuần) | 5 | 1,5 / 2,5 / 4,0 | 0,6 | 3,0 | 0,35 |
| W | 10 tuần | 40 tuần | 3 | 1,5 / 2,5 / 4,0 | 0,6 | 3,0 | 0,35 |
Mẫu hình: sai số đáy/đỉnh 0,8 ATR (hai đáy lệch ≤ 2,4 ATR, đáy 2 không thấp hơn đáy 1 quá 0,8 ATR), viền cổ ≥ 1,5 ATR, viền cổ
vai–đầu–vai lệch > 1,5 ATR thì dùng viền cổ ngang tại cổ gần nhất, phải phá cổ trong 60 nến, mẫu đáy phải bắt đầu DƯỚI MA chậm
(mẫu đỉnh: TRÊN). Tín hiệu cùng mã cách nhau ≥ 12 nến. "Sóng mức 4 giờ" = sóng lớn (4 ATR) — khung 4 giờ được mô phỏng trên biểu đồ
1 giờ đúng như tài liệu (MA80 + sóng lớn), không gộp nến 4 giờ riêng.

Giai đoạn (ưu tiên từ trên xuống, prev = giai đoạn nến trước):
1. D nếu: (mẫu đỉnh phá cổ ≤ 3·MA nhanh nến trước và giá < MA chậm) hoặc (prev = C và giá < MA chậm) hoặc (prev = D, giá < MA chậm, chưa "giảm chuẩn").
2. C nếu MA chậm dốc lên, giá > MA chậm và [cao trào = lệch > 1,5 ATR (½ ngưỡng quá đà), MA nhanh quay xuống, ĐỈNH MỨC 4 GIỜ THẤP HƠN đỉnh trước
   (sau một đỉnh cao hơn)] hoặc mẫu đỉnh đang hình thành; hoặc prev = C và giá > MA chậm + 0,6 ATR.
3. A (MỘT) nếu mẫu đáy phá cổ ≤ 3·MA nhanh nến trước, giá > MA chậm, prev ∈ {—, A, DOWN, RANGE, D}; hoặc prev = A, giá > MA chậm, chưa "tăng chuẩn".
4. B (TÁI TÍCH LŨY) nếu MA chậm dốc lên, giá điều chỉnh về MA chậm (low ≤ MA + 0,6 ATR và close ≥ MA − 0,6 ATR), prev ∈ {A, UP, B, RANGE, C}.
5. B′ nếu MA chậm dốc xuống, giá hồi lên MA chậm (high ≥ MA − 0,6 ATR và close ≤ MA + 0,6 ATR), prev ∈ {D, DOWN, B′, RANGE}.
6. UP nếu "tăng chuẩn": giá > MA chậm, MA nhanh > MA chậm, MA chậm dốc lên. 7. DOWN nếu "giảm chuẩn" (đối xứng).
8. Còn lại: RANGE nếu hai MA hội tụ (|chênh| < 0,35 ATR) hoặc prev ∈ {RANGE, —}; ngược lại giữ prev.
Cờ "Quá đà" (không phải giai đoạn): lệch khỏi MA chậm ≥ 3 ATR theo chiều MA (chỉ mô tả "không mua đuổi").

Tín hiệu: Granville 1–4 mua/bán quanh MA chậm đúng điều kiện bản Python (nến thân tăng đóng cửa trên đỉnh nến trước / ngược lại);
L = MA chậm dốc lên, giá > MA chậm, đáy sóng nhỏ mới cao hơn đáy trước, đỉnh sóng nhỏ gần nhất có trước đáy đó, và giá ĐÓNG CỬA
vượt đỉnh sóng nhỏ gần nhất ("khung 1 giờ quay lại tăng cùng chiều khung 4 giờ"); S đối xứng.
R:R tại giá hiện tại (như bản Python): cắt lỗ = đáy sóng nhỏ gần nhất − 0,2 ATR; mục tiêu = đỉnh sóng lớn đã xác nhận gần nhất
phía trên, nếu không có = 3R. Chỉ tính khi giá > MA chậm. "Giao dịch ổn" khi R:R ≥ 1, "giao dịch NG" khi < 1.

## Dữ liệu
Bộ dữ liệu của lần kiểm định v1 (tải 2026-10-21, không tải lại): VN100 khung D 2021-10-01 → 2026-10-21 (giá điều chỉnh cộng dồn),
VN30 khung 1 giờ 2023-01-03 → 2026-10-21 (26 mã có đủ nến phút). Tập mã đủ điều kiện, IS ≤ 2024-12-31, OOS ≥ 2025-01-02,
lợi suất vượt trội, phí 0,6% cho tín hiệu mua, KTC bootstrap cụm ngày (1000 lần, seed 7): GIỐNG HỆT MTF-prereg.md v1.
Khung 1 giờ: IS 2023-03-01 → 2024-12-31. Chống lặp: 1 sự kiện / mã / loại / 20 phiên (khung 1 giờ: / 5 phiên).

## Giả thuyết chính (5) — BH-FDR q = 0,10 trên 5 p-value OOS
V1 — Điểm vào cốt lõi L khung 1 giờ (VN30): vào giá mở cửa nến 1 giờ kế tiếp, ra đóng cửa ngày thứ 10 sau phiên tín hiệu,
  chuẩn = TB tập VN30 đủ điều kiện cùng kỳ, trừ phí 0,6%. ĐẠT: OOS n ≥ 30, TB > 0, cận dưới KTC > 0, TB IS > 0, qua BH-FDR.
V2 — L khung 1 giờ có cổng R:R ≥ 1 ("giao dịch ổn"): như V1, chỉ tín hiệu L có R:R ≥ 1 tại nến tín hiệu. Tiêu chí như V1.
V3 — L khung ngày (VN100, tương tự phân hình): h = 20 phiên, trừ phí. Tiêu chí như V1.
V4 — Vào giai đoạn B "tái tích lũy" khung ngày (giai đoạn chuyển sang B): h = 20, trừ phí. Tiêu chí như V1.
V5 — S khung ngày (cảnh báo giảm): h = 20, không trừ phí. ĐẠT: OOS n ≥ 30, TB < 0, cận trên KTC < 0, TB IS < 0, qua BH-FDR.

## Mô tả (không đổi nhãn)
- Placebo cùng mã, ngày ngẫu nhiên trong cùng tháng (200 lần) cho V1–V5.
- Bảng lợi suất vượt trội 20 phiên theo giai đoạn khung ngày v2, IS / OOS, KTC bootstrap cụm ngày.
- Cờ "Quá đà": lợi suất 20 phiên khi bật vs. tắt (trong xu hướng tăng).
- Mẫu đáy phá cổ theo bối cảnh vị trí (P2): thuận xu hướng (MA chậm dốc lên — nền tái tích lũy) vs. đảo chiều sau giảm (MA dốc xuống).
- L khung 1 giờ tách theo giai đoạn khung ngày đã đóng (UP/B/A vs. còn lại).
- Các giả thuyết H1–H5 của v1 chạy lại trên engine v2 (chỉ mô tả, không vào họ BH-FDR).
- Meta-labeling (M), nón CQR (Q), xác suất giai đoạn HMM (T3): chạy lại NGUYÊN quy trình và tiêu chí v1 trên đặc trưng v2.

## Quyết định
- V_k ĐẠT → thành phần tương ứng gắn "ĐÃ KIỂM ĐỊNH" kèm số liệu OOS. Không ĐẠT → giữ "THỰC NGHIỆM — chỉ mô tả".
- Kết luận đa khung chỉ dùng chữ MUA / BÁN khi có ít nhất một trong V1–V3 ĐẠT; ngược lại hiển thị lời mô tả cấu trúc
  ("Cấu trúc thuận tăng", "Chờ tín hiệu tăng", "Trung tính", "Cấu trúc suy yếu", "Cấu trúc giảm").
- Kết quả lưu vào backend/src/market/structure/validation.js (sinh tự động, không sửa tay số liệu).

## Sửa đổi
1. 2026-10-24, TRƯỚC khi chạy trên dữ liệu kiểm định (chưa xem bất kỳ lợi suất nào của v2): đối chiếu engine v2 với chính bản Python
   gốc trên dữ liệu mẫu du_lieu_mau_1h.csv (750 nến) — giai đoạn thô trùng 98,8%, mọi tín hiệu Granville trùng, nhưng xác nhận sóng
   bằng giá đóng cửa làm số sóng trung giảm 26 → 18 và tín hiệu L / S lệch (là điểm vào cốt lõi của V1–V3). Vì mục tiêu của v2 là
   bám đúng tài liệu, bỏ khác biệt (a): dùng ZigZag high/low của bản gốc cho cả ba bậc sóng. Sau sửa: giai đoạn thô trùng 671/671 nến,
   tín hiệu 22/22, mẫu hình 7/7, R:R tại giá hiện tại trùng hộp tóm tắt của ảnh DEMO (cắt lỗ 91,61 · mục tiêu 98,48). Đối chiếu này
   thành test cố định src/lib/quant-core/mtf/mtfV2.test.ts (oracle: backend/scripts/structure-oracle.py).
