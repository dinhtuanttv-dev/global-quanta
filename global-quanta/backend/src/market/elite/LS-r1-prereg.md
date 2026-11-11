# LS-r1 — Điểm dẫn dắt LS-v1 và Điểm Elite E3-v5: đăng ký trước

Ghi ngày 2026-11-11, **trước khi** viết mã LS-v1 và trước khi xem bất kỳ IC, điểm hay kết quả walk-forward nào của LS-v1.
Không sửa sau khi chạy. Đổi công thức, tham số hay tiêu chí = phiên bản mới (LS-r2) kèm lý do; kết quả của r1 giữ nguyên, công khai.

Quyết định của người dùng (11/11/2026): làm cả H0–H4; tích hợp thẳng vào Hồ sơ 360° và Điểm Elite (không bảng thứ hai, không sổ ảo);
**nếu cổng H4 ĐẠT, E3-v5 thay danh mục Elite 10 chính thức trước mốc đánh giá 02–03/2027** (ngoại lệ của quyết định đóng băng R5,
chỉ cho trường hợp này).

## Công khai phần đã xem trước khi đăng ký (khám phá, KHÔNG phải kiểm định)

Ngày 11/11/2026 đã dựng lại nhãn Đồng thuận của Siêu quét (formulas.js) point-in-time trên 284 mã 2019-06 → 2026-11 (mẫu 5 phiên một
lần, thanh khoản ≥ 1 tỷ, vào lệnh đóng cửa phiên sau). Chênh lệch lợi suất vượt VN-Index 10 phiên so với trung bình cùng ngày:
"Leader" −0,19pp (≤ 2023) / +1,43pp (2024+, t 1,5); "Up-Trend + RS ≥ 90 mọi trạng thái" +0,27pp / +1,08pp (t 2,4); RS ≥ 90
+0,25pp / +0,67pp (t 2,0); năm 2022 âm. Đã thử khoảng 8 biến thể nhãn — số này dùng làm N phép thử trong DSR ở H4.
**LS-v1 dưới đây là tổ hợp MỚI, chưa từng được tính hay xem kết quả.**

## Dữ liệu

- Lịch sử (bằng chứng E2, walk-forward H4): kho giá VNDirect trên ổ Railway (`px/<mã>.json.gz`, cột giá điều chỉnh `adClose`, giá trị
  khớp lệnh), từ 2020-06-01, vũ trụ = danh mục Siêu quét hiện hành (~280 mã) + VN-Index. **Hạn chế đã biết**: vũ trụ là các mã còn
  niêm yết hôm nay (thiên lệch sống sót); LS-v1 xếp hạng chéo nên ít bị ảnh hưởng hơn lợi suất tuyệt đối, vẫn ghi rõ trong kết quả.
- Phiên hiện hành (bảng E1 dựng từ 17:00): giá đóng cửa điều chỉnh `close_adj` + giá trị giao dịch của kho giá ngày Gateway (cùng
  nguồn với E3), 420 ngày gần nhất.
- Lịch phiên = các ngày có VN-Index. Lợi suất ngày r = P[d] / P[d−1] − 1 trên giá điều chỉnh.

## LS-v1 (mỗi phiên d, mỗi mã có giá phiên d)

Năm thành phần (thiếu dữ liệu -> null cho thành phần đó):

1. **RS64** = P[d] / P[d−64] − 1 (cần giá cả hai phiên).
2. **Động lượng riêng (residual momentum)**: hồi quy OLS r_mã = a + b·r_VNI trên 120 phiên gần nhất (d−119…d, cần ≥ 100 cặp);
   e_k = r_mã,k − a − b·r_VNI,k; RESMOM = Σ_{k=d−63..d} e_k / (sd(e trên 120 phiên) · √64).
3. **Gần đỉnh 52 tuần**: HI52 = P[d] / max(P[d−249…d]) (cần ≥ 200 phiên có giá trong cửa sổ).
4. **Chống chịu ngày giảm**: trong 60 phiên gần nhất, các phiên r_VNI < 0 (cần ≥ 10): RESIL = trung bình (r_mã − r_VNI).
5. **Giai đoạn xu hướng**: STAGE = số điều kiện đúng trong {P > MA20, MA20 > MA50, MA50 > MA200} (0–3; cần đủ 200 phiên).

Chuẩn hoá: mỗi thành phần đổi sang điểm chuẩn theo hạng `z = Φ⁻¹((hạng − 0,5)/n)` trên các mã có giá trị phiên d (hạng trung bình
cho trùng). `LS_raw` = trung bình các z có mặt, cần ≥ 4/5 thành phần; **LS-v1** = điểm chuẩn theo hạng của LS_raw (cùng công thức).
Trọng số đều — không ước lượng, không tinh chỉnh.

## Trạng thái thị trường và chốt chặn

- Trạng thái (đúng `computeTrendBias` của Siêu quét): độ rộng = % mã có P > MA20; TĂNG = uptrend; TÍCH LUỸ = accumulation;
  YẾU = defensive, distribution hoặc downtrend.
- **Chốt chặn sụp động lượng** (Daniel–Moskowitz 2016): VN-Index đóng cửa dưới MA200 **và** VN-Index tăng ≥ 5% trong 20 phiên ->
  trọng số LS-v1 trong Điểm Elite = 0 ở phiên đó (LS-v1 vẫn hiển thị trong Hồ sơ).

## E1 / E2 — sổ tín hiệu và bằng chứng

- Tín hiệu mới `ls_v1` (tab Siêu quét AI, mức mã, đơn vị z), **bậc tiên nghiệm C**. Năm thành phần chỉ hiển thị, không là tín hiệu riêng.
- Chuỗi IC: IC hạng Spearman ngày giữa LS-v1 phiên d và lợi suất giá điều chỉnh d+1 → d+1+h, h ∈ {1, 5, 10, 20}, ≥ 30 mã — đúng
  `dailyIc` của E2. Nguồn: hồi cứu point-in-time từ giá (như tín hiệu dòng tiền). Kỳ hạn chính h = 5.
- Bậc: **đúng luật E2** (`decideTier`, q Benjamini–Hochberg chung với mọi phép thử của E2), trên chuỗi IC đầy đủ không trọng số.

## E3-v5 — trọng số của LS-v1 trong Điểm Elite

Chỉ khi `ls_v1` đạt bậc A/B (như mọi tín hiệu; bậc C -> trọng số 0). Với chuỗi IC h = 5 đã chín tại phiên d:

- Trọng số thời gian w_k = 0,5^(tuổi_k / 250) (tuổi tính bằng phiên). `IC_dec` = Σw·IC / Σw; số ngày hiệu dụng
  `n_eff` = (Σw)² / Σw².
- Theo trạng thái: `IC_r` và `n_eff,r` tính như trên chỉ trên các ngày cùng trạng thái với phiên d;
  `IC_trạngthái` = (n_eff,r · IC_r + 120 · IC_dec) / (n_eff,r + 120).
- IC hậu nghiệm dùng trong E3: `IC_post` = (n_eff · IC_trạngthái + 60 · IC_tiênnghiệm) / (n_eff + 60), IC_tiênnghiệm = 0,01 (B) / 0,02 (A).
- Chốt chặn bật -> trọng số 0. Sau đó như E3-v4: w ∝ max(0, IC_post), điều chỉnh tương quan (E3-v3), Z, α, P vượt, danh mục.
- Tín hiệu khác: không đổi.

## H4 — cổng kiểm định walk-forward (thay sổ ảo)

Chạy **một lần** khi mã đã đóng băng (commit ghi trong kết quả). Bộ máy E7-v2 (5 tín hiệu dòng tiền, cùng `buildDecision`,
`evaluateEntry`, chi phí 0,40%/vòng, lịch, giá) trên toàn kỳ có đặc trưng dòng tiền:

- **v4** = E7-v2 nguyên bản. **v5** = v4 + `ls_v1` theo đúng quy tắc E3-v5 ở trên (bậc và IC chỉ dùng IC đã chín trước phiên D).
- Biến thể tính DSR (cùng bộ máy, chỉ thay tín hiệu dẫn dắt): 5 thành phần đơn lẻ, LS-v1 không chốt chặn, LS-v1 không theo trạng
  thái -> 7 biến thể + v5 = 8 cấu hình.
- Δ_D = lợi suất vượt sau phí 10 phiên của v5 − của v4 tại phiên walk-forward D.

**ĐẠT khi đồng thời:**

1. IC trung bình ngày của Z (5 phiên) của v5 > của v4.
2. Trung bình Δ > 0 và cận dưới khoảng tin cậy bootstrap khối (khối 10, 2.000 lần) **một phía 90%** của trung bình Δ > 0.
3. Trung bình Δ > 0 ở cả hai nửa thời gian.
4. Deflated Sharpe của chuỗi Δ (N = 8 + 8 biến thể khám phá = 16 phép thử; phương sai Sharpe ước từ 8 cấu hình) ≥ 0,80.
5. Sụt giảm lớn nhất của đường lợi suất vượt tích luỹ (các phiên cách 10) của v5 không xấu hơn v4 quá max(20% tương đối, 2 điểm %).

ĐẠT -> E3-v5 thành điểm chính thức (sổ E3 đổi phiên bản, sổ v4 lưu trữ nguyên vẹn), danh mục Elite 10 đổi ở lần dựng kế tiếp.
KHÔNG ĐẠT -> LS-v1 vẫn hiển thị trong Hồ sơ 360° (nhãn "chưa đạt cổng H4"), trọng số trong Điểm Elite = 0; muốn thử lại cần LS-r2
trên dữ liệu mới.

## Hiển thị (không ảnh hưởng điểm)

- Siêu quét: nhãn "Nghịch xu hướng" của mã đang Up-Trend (RS < 90, thị trường yếu) đổi thành "Đang tăng, chưa dẫn dắt"; mã còn lại
  giữ "Nghịch xu hướng". Công thức `formulas.js` (đối chiếu bản gốc) và Smart Score không đổi.
- Hồ sơ 360°: khối "Sức mạnh dẫn dắt" — LS-v1, 5 thành phần (phân vị), nhãn Leader / Up-Trend / Breakout, trạng thái thị trường,
  chốt chặn, bậc + IC + trọng số hiện hành, trạng thái cổng H4; dòng "Dẫn dắt (LS-v1)" trong thác đóng góp khi có trọng số.
