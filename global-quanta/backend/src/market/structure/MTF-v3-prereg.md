# MTF v3 — Cấu trúc thị trường Ngày · Tuần · Tháng — TIÊU CHÍ ĐẶT TRƯỚC (anh duyệt S0–S7 ngày 2026-10-30)
Soạn 2026-10-30, TRƯỚC khi viết engine v3 và TRƯỚC khi tải dữ liệu kiểm định. Sau khi commit, tiêu chí không được sửa; mọi sửa
đổi ghi ở mục "Sửa đổi" kèm lý do, ngày, kết quả trước/sau. Tổng hợp tri thức nguồn: `docs/mtf-v3/01_SOURCE_SYNTHESIS.md`.

**Công khai thiên lệch:** đã biết kết quả v1/v2 (V1–V5 FAIL; giai đoạn B về MA chậm âm OOS −0,96%/20p; cờ Quá đà dương +0,79%;
HMM PASS nhỏ) và Elliott Pro EP5 walk-forward PASS nhỏ trước phí. Tham số dưới đây CỐ ĐỊNH theo tài liệu (Minervini / bộ ảnh) và
giá trị tròn, không dò tham số trên dữ liệu kiểm định.

## Engine v3 (src/lib/quant-core/mtf3, MTF3_VERSION 3.0.0)
- Khung: **D** (vào lệnh), **W** (chân trên — gộp từ nến D, tuần chỉ dùng khi ĐÃ đóng), **M** (bối cảnh — tháng đã đóng). KHÔNG khung 1 giờ.
- MA mỗi khung: EMA21, EMA50, EMA100 (EMA chuẩn, hạt giống = SMA của `period` nến đầu, NaN trước đó), MA200 = SMA200. Thiếu nến → NaN
  (MA200 tuần cần 200 tuần; tháng: chỉ EMA21/50 có ý nghĩa, còn lại để trống nếu thiếu). ATR 14 (Wilder).
- Sóng: ZigZag theo ATR, đỉnh/đáy **xác nhận khi giá đóng cửa** đảo chiều ≥ k·ATR từ cực trị (cực trị đo bằng high/low), bậc nhỏ
  k = 2,0, bậc lớn k = 3,5; cố định sau xác nhận (không vẽ lại).
- Dow: đáy bảo vệ (押し安値) = đáy sóng nhỏ đã tạo ra đỉnh cao hơn đỉnh trước; đỉnh hồi (戻り高値) đối xứng. Trạng thái:
  UP (HH+HL), UP_WEAK (có đỉnh thấp hơn nhưng chưa thủng đáy bảo vệ), BROKEN_UP (đóng cửa thủng đáy bảo vệ), DOWN / DOWN_WEAK /
  BROKEN_DOWN đối xứng, RANGE. CHoCH↑ = từ DOWN/BROKEN_UP… chuyển sang có đáy cao hơn VÀ đóng cửa vượt đỉnh hồi gần nhất.
- Giai đoạn Minervini S1–S4 (khung D, xác nhận W):
  S2 khi Trend Template đủ 7 điều kiện giá: (1) close > EMA100 và > MA200; (2) EMA100 > MA200; (3) MA200 hôm nay > MA200 20 phiên
  trước; (4) EMA50 > EMA100 > MA200 và EMA21 > EMA50; (5) close > EMA50; (6) close ≥ 1,30 × đáy 52 tuần (252 phiên, low);
  (7) close ≥ 0,75 × đỉnh 52 tuần (high). Điều kiện 8 (RS ≥ 70) chỉ mô tả, không bắt buộc.
  S4 khi close < MA200 VÀ MA200 dốc xuống (20 phiên) VÀ EMA50 < MA200. S3 khi đang/từng S2 trong 60 phiên VÀ (MA200 phẳng
  |dốc 20p| < 0,5% hoặc close < EMA100) VÀ chưa S4. Còn lại S1. Trễ chống nhiễu: đổi giai đoạn khi điều kiện mới giữ ≥ 3 phiên
  (S2 → S3 / S4 không trễ khi close < MA200).
- Dải MA: `width = (max − min của EMA21/50/100)/ATR`, `pctW` = phân vị của width trong 120 nến trước (không gồm nến hiện tại).
  Xếp lớp tăng = EMA21 > EMA50 > EMA100 (> MA200 nếu có).
- Cổng CẤM VÀO (K8): (a) Quá đà: (close − EMA50)/ATR ≥ 3; (b) cản lớn: có mức kháng cự W hoặc M (cụm đỉnh sóng, ≥ 2 lần chạm) trong
  khoảng (close, close + 1 ATR_D]; (c) dải đã mở hết: pctW ≥ 90 VÀ xếp lớp đã ≥ 40 phiên; (d) ngược W: W ở DOWN/BROKEN_UP.
- Nền giá (K16–K19): đoạn ≥ 15 phiên, ≤ 325 phiên, độ sâu (đỉnh trái → đáy thấp nhất) 8%–35% (≤ 50% cho nền đầu sau S1),
  nhịp co = cặp đỉnh→đáy sóng nhỏ liên tiếp trong nền, VCP khi ≥ 2 nhịp co mỗi nhịp ≤ 0,75 × nhịp trước; pivot = đỉnh nhịp co cuối;
  KL cạn = TB KL 10 phiên cuối / TB KL 50 ≤ 0,75; phá vỡ = close > pivot với KL ≥ 1,4 × TB KL 50.

## Dữ liệu (tải SAU khi commit tệp này)
VNDirect `/v4/stock_prices` (adOpen/adHigh/adLow/adClose — giá điều chỉnh của VNDirect, `nmVolume`) 2013-01-01 → 2026-10-29, mọi mã
HOSE/HNX kể cả ĐÃ HUỶ NIÊM YẾT (không thiên lệch sống sót). Tập đủ điều kiện tại ngày sự kiện (point-in-time): GTGD TB 20 phiên ≥ 10 tỷ,
giá ≥ 5.000, ≥ 260 phiên lịch sử. **IS: 2013-01-01 → 2020-12-31; OOS: 2021-01-01 → 2026-10-29.**
Vào lệnh giá mở cửa phiên t+1 sau tín hiệu ở đóng cửa t; ra đóng cửa phiên t+h. Lợi suất vượt trội = lợi suất mã − TB cùng kỳ của
tập đủ điều kiện (cùng ngày vào/ra), trừ phí 0,6% cho giả thuyết mua. Chống lặp: 1 sự kiện / mã / giả thuyết / 20 phiên.
KTC 95%: bootstrap cụm theo tuần sự kiện, 2000 lần, seed 7; p một phía.

## Giả thuyết chính (6) — BH-FDR q = 0,10 trên 6 p-value OOS
H1 — **Vào giai đoạn 2** (D chuyển sang S2 từ S1/S3/S4) khi W close > EMA21w: h = 40.
H2 — **Chân dưới đổi theo chân trên** (K3): W ở UP (Dow W UP, close_w > EMA50w, EMA21w > EMA50w) VÀ D có CHoCH↑ tại t VÀ trong 10
  phiên trước có low chạm dải EMA21–EMA50 của D (low ≤ max(EMA21, EMA50) + 0,25 ATR) VÀ không bị cổng cấm vào: h = 20.
H3 — **Phá vỡ nền trong giai đoạn 2** (K17): D ở S2, nền hợp lệ (VCP hoặc nền phẳng sâu ≤ 15%), số nền từ đầu S2 ≤ 3, phá vỡ tại t,
  không bị cổng (a)(b): h = 20.
H4 — **Nén → mở rộng** (K5): trong 10 phiên trước pctW ≤ 20; tại t width tăng 3 phiên liên tiếp, xếp lớp tăng, close > EMA21,
  W không ở DOWN/BROKEN_UP: h = 20.
H5 — **Cổng cấm vào có giá trị** (K8): trên tập ứng viên thô của H2 ∪ H3 ∪ H4 (trước cổng), TB lợi suất vượt trội nhóm BỊ CẤM − nhóm
  được phép < 0 (h = 20). KTC: bootstrap cụm tuần của hiệu.
H6 — **Hợp lưu Elliott × EMA** (K13): engine Elliott Pro v3 trên D (bản đếm chính) xác nhận kết thúc sóng 2 tại t, sóng 2 hồi
  0,382–0,786 sóng 1, đáy sóng 2 nằm trong [EMA100 − 0,5 ATR, EMA50 + 0,5 ATR], W không ở DOWN/BROKEN_UP: h = 20.

**ĐẠT** (mỗi giả thuyết mua): OOS n ≥ 60, TB > 0, cận dưới KTC > 0, TB IS > 0, qua BH-FDR. H5: hiệu OOS < 0, cận trên KTC < 0, hiệu IS < 0,
qua BH-FDR, mỗi nhóm OOS n ≥ 60.

## Mô tả (không đổi nhãn)
Placebo cùng mã ngày ngẫu nhiên cùng tháng (200 lần) cho H1–H4, H6; bảng lợi suất vượt trội 20 phiên theo giai đoạn S1–S4, theo trạng
thái Dow W, theo bối cảnh M; ổn định hai nửa OOS (2021–2023 / 2024–2026); HMM chuyển giai đoạn chạy lại trên chuỗi S1–S4 (mô tả).

## Quyết định
Thành phần ĐẠT → nhãn "ĐÃ KIỂM ĐỊNH" + được dùng xếp hạng. KHÔNG ĐẠT → chỉ MÔ TẢ (giao diện ghi rõ), không gọi MUA/BÁN.
Không chạy lại với tham số khác; nếu sửa engine sau khi chạy, phải ghi "Sửa đổi" và chạy lại toàn bộ một lần, báo cả hai kết quả.

## Sửa đổi
1. (2026-10-30, khi viết S1 — TRƯỚC khi tải dữ liệu kiểm định, chưa có kết quả nào) Sự kiện "nén → mở rộng" (H4 / K5): chỉ tính ở
   nến ĐẦU TIÊN đủ điều kiện (không lặp trong 10 nến) và cần độ rộng dải ≥ 0,5 ATR tại nến đó. Lý do: test tổng hợp cho thấy định nghĩa
   gốc phát 3 nến liền nhau và bắt cả nhiễu khi ba EMA gần trùng (rộng 0,08 ATR). "Xếp lớp tăng" cho sự kiện = τ thứ tự = +1 trên các
   đường đã có giá trị (21/50/100, cộng MA200 nếu đủ 200 nến).
2. (2026-10-30, khi viết S2 — TRƯỚC khi tải dữ liệu, chưa có kết quả nào) Giai đoạn S2: đã ở S2 thì GIỮ S2 khi close > MA200, MA200 dốc
   lên (20 phiên) và EMA50 > MA200 dù tạm mất điều kiện (4)/(5)/(7) — vào S2 lần đầu vẫn cần đủ 7 điều kiện. Lý do: test tổng hợp cho thấy
   định nghĩa gốc gắn nhịp điều chỉnh bình thường trong xu hướng tăng (giá dưới EMA50, trên MA200 đang lên) là "S1 tích lũy" — sai với
   Minervini (nền giá hình thành ngay trong giai đoạn 2). H1 (vào giai đoạn 2) không đổi vì chỉ tính lần CHUYỂN sang S2.
